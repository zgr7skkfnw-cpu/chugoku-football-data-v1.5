import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { request } from "@playwright/test";

import { fetchTextWithRetry } from "./http-retry.mjs";
import { extractResultIframeUrl, parseResultListHtml } from "./result-list.mjs";
import {
  canonicalSnapshotFromMatches,
  canonicalSnapshotFromParsedList,
  compareCanonicalSnapshots,
  validateCanonicalSnapshot,
} from "./result-list-poll.mjs";
import { POLL_TARGET_KEYS, RESULT_TARGETS } from "./result-targets.mjs";

const REQUEST_TIMEOUT_MS = 45_000;
const USER_AGENT = "ChugokuFootballData/1.0 (+results-list-poll)";

export async function pollCompetition({ targetKey, context, log = console.log }) {
  const target = RESULT_TARGETS[targetKey];
  if (!target || !POLL_TARGET_KEYS.includes(targetKey)) {
    throw new Error(`poll対象外または未対応の大会です: ${targetKey}`);
  }

  const fetched = await fetchCompetitionList({ targetKey, context, log });
  const { parsedList, currentSnapshot, httpRequests } = fetched;
  const outputPath = resolve(import.meta.dirname, target.outputPath);
  const savedData = JSON.parse(await readFile(outputPath, "utf8"));
  const previousSnapshot = canonicalSnapshotFromMatches(savedData.items ?? []);
  validateCanonicalSnapshot(previousSnapshot, { label: `${targetKey} 保存済み一覧` });
  const comparison = compareCanonicalSnapshots(previousSnapshot, currentSnapshot, { competitionId: targetKey });

  for (const change of comparison.changes) {
    log(`[POLL DIFF]
competition=${targetKey}
gameId=${change.gameId ?? change.matchId ?? "unknown"}
fields=${change.changedFields.join(",")}`);
  }
  log(`[POLL SUMMARY]
competition=${targetKey}
games=${currentSnapshot.length}
changedGames=${comparison.changes.length}
httpRequests=${httpRequests}
detailPosts=0`);

  return {
    ...comparison,
    officialCompetitionId: target.competitionId,
    games: currentSnapshot.length,
    savedGames: previousSnapshot.length,
    httpRequests,
    detailPosts: 0,
    parsedList,
    iframeUrl: fetched.iframeUrl,
    currentSnapshot,
    previousSnapshot,
  };
}

export async function fetchCompetitionList({ targetKey, context, log = console.log }) {
  const target = RESULT_TARGETS[targetKey];
  if (!target || !POLL_TARGET_KEYS.includes(targetKey)) {
    throw new Error(`poll対象外または未対応の大会です: ${targetKey}`);
  }
  let httpRequests = 0;
  const countedContext = {
    fetch: (...args) => {
      httpRequests += 1;
      return context.fetch(...args);
    },
  };
  const fetchText = (url, options = {}) => fetchTextWithRetry(countedContext, url, options, {
    attempts: 4,
    timeoutMs: REQUEST_TIMEOUT_MS,
    onRetry: ({ nextAttempt, delayMs, error }) => log(
      `[POLL RETRY] competition=${targetKey} attempt=${nextAttempt}/4 delayMs=${delayMs} error=${error.message}`,
    ),
  });

  const outerHtml = await fetchText(target.sourcePageUrl);
  const iframeUrl = extractResultIframeUrl(outerHtml, target.sourcePageUrl);
  const listHtml = await fetchText(iframeUrl.href, { headers: { Referer: target.sourcePageUrl } });
  const parsedList = parseResultListHtml(listHtml, { minimumScheduleCount: target.minimumScheduleCount });
  const currentSnapshot = canonicalSnapshotFromParsedList(parsedList);
  return {
    parsedList,
    currentSnapshot,
    iframeUrl,
    httpRequests,
  };
}

export async function pollTargets({ targetKeys = POLL_TARGET_KEYS, context, log = console.log } = {}) {
  const ownsContext = !context;
  const api = context ?? await request.newContext({
    timeout: REQUEST_TIMEOUT_MS,
    extraHTTPHeaders: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ja,en;q=0.8",
      "User-Agent": USER_AGENT,
    },
  });
  try {
    const results = [];
    for (const targetKey of targetKeys) results.push(await pollCompetition({ targetKey, context: api, log }));
    const publicResults = results.map(({ parsedList, iframeUrl, currentSnapshot, previousSnapshot, ...result }) => result);
    return {
      changed: publicResults.some((result) => result.changed),
      changedGameIds: [...new Set(publicResults.flatMap((result) => result.changedGameIds))].sort((a, b) => a - b),
      httpRequests: publicResults.reduce((sum, result) => sum + result.httpRequests, 0),
      detailPosts: 0,
      results: publicResults,
    };
  } finally {
    if (ownsContext) await api.dispose();
  }
}

async function main() {
  const targetArgument = process.argv.find((argument) => argument.startsWith("--target="));
  const jsonOnly = process.argv.includes("--json");
  const targetKeys = targetArgument ? [targetArgument.split("=")[1]] : POLL_TARGET_KEYS;
  const result = await pollTargets({ targetKeys, log: jsonOnly ? () => {} : console.log });
  if (jsonOnly) console.log(JSON.stringify(result, null, 2));
  else console.log(`[POLL TOTAL] competitions=${result.results.length} httpRequests=${result.httpRequests} detailPosts=0 changed=${result.changed}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch((error) => {
    console.error(`[POLL ERROR] ${error.message}`);
    process.exitCode = 1;
  });
}
