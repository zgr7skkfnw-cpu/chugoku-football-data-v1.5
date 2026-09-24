import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { request } from "@playwright/test";

import { buildHeadToHead } from "../build/build-head-to-head.mjs";
import { buildSeasonIndex } from "../build/build-season-index.mjs";
import { buildTeamStats } from "../build/build-team-stats.mjs";
import { createPlayerDirectory, getPlayer } from "../../site/assets/js/utils/players.js";
import { createTeamDirectory, getTeam } from "../../site/assets/js/utils/teams.js";
import { fetchTextWithRetry } from "./http-retry.mjs";
import { fetchCompetitionList, pollCompetition } from "./poll-results.mjs";
import { executeSelectedDetailSync, selectedGameIdsFromPoll } from "./selected-detail-sync.mjs";
import { POLL_TARGET_KEYS, RESULT_TARGETS } from "./result-targets.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const REQUEST_TIMEOUT_MS = 45_000;

async function main() {
  const targetKey = argumentValue("--target");
  if (!targetKey || !POLL_TARGET_KEYS.includes(targetKey)) {
    throw new Error(`--targetにはpoll対象大会を指定してください: ${targetKey ?? "未指定"}`);
  }
  const target = RESULT_TARGETS[targetKey];
  const dryRun = process.argv.includes("--dry-run");
  const fromPoll = process.argv.includes("--from-poll");
  const directGameIds = gameIdArguments();
  if (!fromPoll && directGameIds.length === 0) {
    throw new Error("--game-idまたは--from-pollを指定してください");
  }

  const context = await request.newContext({
    timeout: REQUEST_TIMEOUT_MS,
    extraHTTPHeaders: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ja,en;q=0.8",
      "User-Agent": "ChugokuFootballData/1.0 (+selected-results-sync)",
    },
  });
  let listResult;
  let changeHints = [];
  let requiresFullSync = [];
  try {
    if (fromPoll) {
      const pollResult = await pollCompetition({ targetKey, context });
      const selection = selectedGameIdsFromPoll(pollResult);
      directGameIds.push(...selection.gameIds);
      requiresFullSync = selection.requiresFullSync;
      changeHints = pollResult.changes;
      listResult = pollResult;
    } else {
      listResult = await fetchCompetitionList({ targetKey, context });
    }

    const outputPath = resolve(import.meta.dirname, target.outputPath);
    const existingData = JSON.parse(await readFile(outputPath, "utf8"));
    const detailUrl = new URL("./pubGameResultConf.php", listResult.iframeUrl);
    if (detailUrl.protocol !== "https:" || detailUrl.hostname !== "football-system.jp") {
      throw new Error(`詳細POST URLが許可されていません: ${detailUrl.href}`);
    }
    let detailPosts = 0;
    const fetchDetailHtml = async (match) => {
      detailPosts += 1;
      return fetchTextWithRetry(context, detailUrl.href, {
        method: "POST",
        form: {
          game_id: String(match.gameId),
          fed_id: String(match.fedId),
          taikai_hold_id: String(match.taikaiHoldId),
        },
        headers: { Referer: listResult.iframeUrl.href },
      }, { attempts: 3, timeoutMs: REQUEST_TIMEOUT_MS });
    };

    const plan = await executeSelectedDetailSync({
      planOptions: {
        targetKey,
        existingData,
        parsedList: listResult.parsedList,
        selectedGameIds: [...new Set(directGameIds)],
        changeHints,
        fetchDetailHtml,
      },
      validate: validateSelectedPlayers,
      dryRun,
      write: async ({ nextData }) => writeMatches(outputPath, nextData, target, listResult, detailUrl),
      buildDerived: async () => buildDerivedData(target),
    });

    for (const change of requiresFullSync) {
      console.log(`[SELECTED SKIP] competition=${targetKey} matchId=${change.matchId ?? "unknown"} reason=detail-unavailable-or-removed`);
    }
    for (const change of plan.changedGames) {
      console.log(`[SELECTED GAME DIFF]\ngameId=${change.gameId}\nfields=${change.changedFields.join(",")}`);
    }
    console.log(`[SELECTED SYNC]
competition=${targetKey}
selectedGames=${plan.selectedGameIds.length}
detailPosts=${detailPosts}
changedGames=${plan.changedGames.length}
dryRun=${dryRun}`);
    if (plan.unavailableGameIds.length) {
      console.log(`[SELECTED SKIP] competition=${targetKey} gameIds=${plan.unavailableGameIds.join(",")} reason=detailAvailable-false`);
    }
  } finally {
    await context.dispose();
  }
}

async function validateSelectedPlayers(plan) {
  const target = RESULT_TARGETS[plan.targetKey];
  const [teamCatalog, playerData] = await Promise.all([
    readJson(resolve(ROOT, "site/data/team-catalog.json")),
    readJson(resolve(ROOT, target.stage === "i-league-regular"
      ? "site/data/seasons/2026/i-league/players.json"
      : "site/data/players.json")),
  ]);
  const teamDirectory = createTeamDirectory(teamCatalog.items ?? []);
  const playerDirectory = createPlayerDirectory(playerData.items ?? []);
  for (const replacement of plan.replacements) {
    const match = replacement.nextMatch;
    for (const side of ["home", "away"]) {
      const lineup = match.lineups?.[side];
      if (!lineup) continue;
      const team = getTeam(teamDirectory, match[`${side}Team`], target.competitionId);
      if (!team) throw new Error(`game_id=${match.gameId} ${side} teamIdを解決できません`);
      for (const entry of [...(lineup.starters ?? []), ...(lineup.substitutes ?? [])]) {
        if (!getPlayer(playerDirectory, entry.name, team.id)) {
          throw new Error(`game_id=${match.gameId} ${team.name} の未登録選手です: ${entry.name}`);
        }
      }
    }
  }
}

async function writeMatches(outputPath, data, target, listResult, detailUrl) {
  const updatedAt = new Date().toISOString();
  const output = {
    ...data,
    updatedAt,
    source: {
      pageUrl: target.sourcePageUrl,
      iframeUrl: listResult.iframeUrl.href,
      detailPostUrl: detailUrl.href,
      retrievedAt: updatedAt,
    },
  };
  const temporaryPath = `${outputPath}.tmp`;
  await mkdir(dirname(outputPath), { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    JSON.parse(await readFile(temporaryPath, "utf8"));
    await rename(temporaryPath, outputPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function buildDerivedData(target) {
  if (target.buildStats) await buildTeamStats({ season: target.season, division: target.division });
  if (target.stage === "i-league-regular") {
    await buildTeamStats({ competitionId: target.competitionId });
  }
  await buildHeadToHead();
  await buildSeasonIndex();
}

function argumentValue(name) {
  return process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

function gameIdArguments() {
  return process.argv
    .filter((argument) => argument.startsWith("--game-id="))
    .flatMap((argument) => argument.slice("--game-id=".length).split(","))
    .filter(Boolean)
    .map((value) => Number.parseInt(value, 10));
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

await main().catch((error) => {
  console.error(`[SELECTED SYNC ERROR] ${error.message}`);
  process.exitCode = 1;
});
