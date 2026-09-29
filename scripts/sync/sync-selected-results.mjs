import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { request } from "@playwright/test";

import { buildHeadToHead } from "../build/build-head-to-head.mjs";
import { buildSeasonIndex } from "../build/build-season-index.mjs";
import { buildTeamStats } from "../build/build-team-stats.mjs";
import { createPlayerDirectory, getPlayer } from "../../site/assets/js/utils/players.js";
import { createTeamDirectory, getTeam } from "../../site/assets/js/utils/teams.js";
import { fetchTextWithRetry } from "./http-retry.mjs";
import { fetchCompetitionList, pollCompetition } from "./poll-results.mjs";
import { assertUnknownPlayersResolved, commitRosterAndMatch, createSelectedRosterPlan, PLAYERS_PATH } from "./selected-roster-sync.mjs";
import { executeSelectedDetailSync, selectedGameIdsFromPoll } from "./selected-detail-sync.mjs";
import { parseDetailHtml } from "./sync-results.mjs";
import { POLL_TARGET_KEYS, RESULT_TARGETS } from "./result-targets.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const REQUEST_TIMEOUT_MS = 45_000;

async function main() {
  const targetKey = argumentValue("--target");
  if (!targetKey || !POLL_TARGET_KEYS.includes(targetKey)) {
    throw new Error(`--targetにはpoll対象大会を指定してください: ${targetKey ?? "未指定"}`);
  }
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

    const plan = await runSelectedCompetition({
      targetKey,
      context,
      listResult,
      selectedGameIds: directGameIds,
      changeHints,
      dryRun,
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
detailPosts=${plan.detailPosts}
changedGames=${plan.changedGames.length}
dryRun=${dryRun}`);
    if (plan.unavailableGameIds.length) {
      console.log(`[SELECTED SKIP] competition=${targetKey} gameIds=${plan.unavailableGameIds.join(",")} reason=detailAvailable-false`);
    }
  } finally {
    await context.dispose();
  }
}

export async function runSelectedCompetition({
  targetKey,
  context,
  listResult,
  selectedGameIds,
  changeHints = [],
  dryRun = true,
  includeGlobalDerived = true,
}) {
  const target = RESULT_TARGETS[targetKey];
  if (!target) throw new Error(`未対応の同期対象です: ${targetKey}`);
  const fetchedList = listResult ?? await fetchCompetitionList({ targetKey, context });
  const outputPath = resolve(import.meta.dirname, target.outputPath);
  const existingData = JSON.parse(await readFile(outputPath, "utf8"));
  const selectedPlayersPath = target.stage === "i-league-regular"
    ? resolve(ROOT, "site/data/seasons/2026/i-league/players.json")
    : PLAYERS_PATH;
  const [playersData, teamCatalog] = await Promise.all([
    readJson(selectedPlayersPath),
    readJson(resolve(ROOT, "site/data/team-catalog.json")),
  ]);
  const detailUrl = new URL("./pubGameResultConf.php", fetchedList.iframeUrl);
  if (detailUrl.protocol !== "https:" || detailUrl.hostname !== "football-system.jp") {
    throw new Error(`詳細POST URLが許可されていません: ${detailUrl.href}`);
  }
  const fetchDetailHtml = (match) => fetchTextWithRetry(context, detailUrl.href, {
    method: "POST",
    form: {
      game_id: String(match.gameId),
      fed_id: String(match.fedId),
      taikai_hold_id: String(match.taikaiHoldId),
    },
    headers: { Referer: fetchedList.iframeUrl.href },
  }, { attempts: 3, timeoutMs: REQUEST_TIMEOUT_MS });

  let rosterPlan = null;
  return executeSelectedDetailSync({
    planOptions: {
      targetKey,
      existingData,
      parsedList: fetchedList.parsedList,
      selectedGameIds: [...new Set(selectedGameIds)],
      changeHints,
      fetchDetailHtml,
      parseDetail: parseDetailHtml,
    },
    validate: async (plan) => {
      const unknownPlayers = findUnknownSelectedPlayers(plan, { playersData, teamCatalog });
      if (!unknownPlayers.length) return;
      if (target.stage !== "regular" || target.season !== 2026) {
        throw new Error(`通常リーグ以外では対象rosterを自動取得しません: ${unknownPlayers.map((entry) => entry.name).join(", ")}`);
      }
      const teamIds = [...new Set(unknownPlayers.map((entry) => entry.teamId))];
      plan.rosterRequests = teamIds.length;
      rosterPlan = await createSelectedRosterPlan({ teamIds, context, playersData, teamCatalog });
      assertUnknownPlayersResolved(unknownPlayers, rosterPlan.nextPlayersData.items ?? []);
      const remaining = findUnknownSelectedPlayers(plan, { playersData: rosterPlan.nextPlayersData, teamCatalog });
      if (remaining.length) throw new Error(`名簿同期後も未解決選手があります: ${remaining.map((entry) => entry.name).join(", ")}`);
      if (rosterPlan.changed) {
        plan.changed = true;
        plan.rosterChanged = true;
      }
      console.log(`[ROSTER RESOLVE] teams=${teamIds.join(",")} unknownPlayers=${unknownPlayers.length} resolved=${unknownPlayers.length}`);
    },
    dryRun,
    write: async ({ nextData }) => writeSelectedDataAtomically({
      outputPath,
      nextData,
      target,
      fetchedList,
      detailUrl,
      rosterPlan,
    }),
    buildDerived: async () => {
      await buildCompetitionDerivedData(target);
      if (includeGlobalDerived) await buildGlobalDerivedData();
    },
  });
}

export async function validateSelectedPlayers(plan) {
  const target = RESULT_TARGETS[plan.targetKey];
  const [teamCatalog, playerData] = await Promise.all([
    readJson(resolve(ROOT, "site/data/team-catalog.json")),
    readJson(resolve(ROOT, target.stage === "i-league-regular"
      ? "site/data/seasons/2026/i-league/players.json"
      : "site/data/players.json")),
  ]);
  const unknown = findUnknownSelectedPlayers(plan, { playersData: playerData, teamCatalog });
  if (unknown.length) throw new Error(`未登録選手です: ${unknown.map((entry) => `${entry.teamName} ${entry.name}`).join(", ")}`);
}

export function findUnknownSelectedPlayers(plan, { playersData, teamCatalog }) {
  const target = RESULT_TARGETS[plan.targetKey];
  const teamDirectory = createTeamDirectory(teamCatalog.items ?? []);
  const playerDirectory = createPlayerDirectory(playersData.items ?? []);
  const unknown = [];
  for (const replacement of plan.replacements) {
    // 差分なしの既存試合は書き換えないため、今回新たに持ち込む未知選手だけを検証する。
    if (replacement.changed === false) continue;
    const match = replacement.nextMatch;
    for (const side of ["home", "away"]) {
      const lineup = match.lineups?.[side];
      if (!lineup) continue;
      const team = getTeam(teamDirectory, match[`${side}Team`], target.competitionId);
      if (!team) throw new Error(`game_id=${match.gameId} ${side} teamIdを解決できません`);
      for (const entry of [...(lineup.starters ?? []), ...(lineup.substitutes ?? [])]) {
        if (!getPlayer(playerDirectory, entry.name, team.id)) {
          unknown.push({ gameId: match.gameId, teamId: team.id, teamName: team.name, name: entry.name });
        }
      }
    }
  }
  return [...new Map(unknown.map((entry) => [`${entry.teamId}\0${entry.name}`, entry])).values()];
}

async function writeSelectedDataAtomically({ outputPath, nextData, target, fetchedList, detailUrl, rosterPlan }) {
  if (!rosterPlan?.changed) return writeMatches(outputPath, nextData, target, fetchedList, detailUrl);
  const [previousPlayers, previousMatches] = await Promise.all([
    readFile(PLAYERS_PATH, "utf8"),
    readFile(outputPath, "utf8"),
  ]);
  await commitRosterAndMatch({
    rosterChanged: true,
    writePlayers: () => writeJsonAtomic(PLAYERS_PATH, rosterPlan.nextPlayersData),
    writeMatch: () => writeMatches(outputPath, nextData, target, fetchedList, detailUrl),
    rollback: () => Promise.all([
      writeFile(PLAYERS_PATH, previousPlayers, "utf8"),
      writeFile(outputPath, previousMatches, "utf8"),
    ]),
  });
}

async function writeJsonAtomic(path, data) {
  const temporaryPath = `${path}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    JSON.parse(await readFile(temporaryPath, "utf8"));
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
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

export async function buildCompetitionDerivedData(target) {
  if (target.buildStats) await buildTeamStats({ season: target.season, division: target.division });
  if (target.stage === "i-league-regular") {
    await buildTeamStats({ competitionId: target.competitionId });
  }
}

export async function buildGlobalDerivedData() {
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch((error) => {
    console.error(`[SELECTED SYNC ERROR] ${error.message}`);
    process.exitCode = 1;
  });
}
