import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

const ROOT = resolve(import.meta.dirname, "..");
const STATE_PATH = resolve(ROOT, "data/sync-state.json");
const trigger = process.env.GITHUB_EVENT_NAME || "local";
const forceChampionship = process.env.AUTO_SYNC_INCLUDE_CHAMPIONSHIP === "1";
const now = new Date();
const isWeeklyChampionshipRun = now.getUTCDay() === 0 && now.getUTCHours() === 3;

const competitions = [
  spec("jufa-chugoku-2026-division-1", "2026年中国大学リーグ1部", "2026-1", "site/data/seasons/2026/matches.json"),
  spec("jufa-chugoku-2026-division-2", "2026年中国大学リーグ2部", "2026-2", "site/data/seasons/2026/div2/matches.json"),
  spec("jufa-chugoku-2026-rookie-tournament", "2026年中国大学サッカー新人戦", "2026-rookie", "site/data/seasons/2026/rookie/matches.json"),
  spec("jufa-chugoku-2026-i-league-division-1", "2026年Iリーグ1部", "2026-i-league-1", "site/data/seasons/2026/i-league/div1/matches.json"),
  spec("jufa-chugoku-2026-i-league-division-2", "2026年Iリーグ2部", "2026-i-league-2", "site/data/seasons/2026/i-league/div2/matches.json"),
  {
    ...spec("jufa-chugoku-2026-championship", "2026年中国大学サッカー選手権", "2026-championship", "site/data/seasons/2026/championship/matches.json"),
    shouldRun: trigger === "workflow_dispatch" || forceChampionship || isWeeklyChampionshipRun,
    skipReason: "終了済み大会のため、定期実行は週1回（日曜）です",
  },
];

const pendingCompetitions = [
  { competitionId: "jufa-chugoku-2026-division-1-promotion-playoff", name: "2026年1部昇格プレーオフ", reason: "公式ID未設定・日程未公開" },
  { competitionId: "jufa-chugoku-2026-i-league-playoff", name: "2026年Iリーグ順位決定プレーオフ", reason: "公式ID未設定・日程未公開" },
  { competitionId: "jufa-chugoku-2026-promotion-relegation", name: "2026年1部・2部入替戦", reason: "大会非開催" },
];

function spec(competitionId, name, target, path) {
  return { competitionId, name, target, path, shouldRun: true, skipReason: null };
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} が終了コード${result.status}で失敗しました`);
}

async function readMatches(relativePath) {
  const data = JSON.parse(await readFile(resolve(ROOT, relativePath), "utf8"));
  return data.items ?? [];
}

function countChangedMatches(before, after) {
  const previous = new Map(before.map((match) => [match.id, match]));
  const current = new Map(after.map((match) => [match.id, match]));
  const ids = new Set([...previous.keys(), ...current.keys()]);
  return [...ids].filter((id) => !isDeepStrictEqual(previous.get(id), current.get(id))).length;
}

function summarize(specification, items, changedMatches, durationMs) {
  return {
    competitionId: specification.competitionId,
    name: specification.name,
    status: "success",
    detectedMatches: items.length,
    finishedMatches: items.filter((match) => match.status === "finished").length,
    scheduledMatches: items.filter((match) => match.status === "scheduled").length,
    changedMatches,
    failedGameIds: [],
    durationMs,
  };
}

async function main() {
  const results = [];

  for (const competition of competitions) {
    if (!competition.shouldRun) {
      console.log(`[auto-sync] スキップ: ${competition.name}（${competition.skipReason}）`);
      results.push({ competitionId: competition.competitionId, name: competition.name, status: "skipped", reason: competition.skipReason, detectedMatches: 0, finishedMatches: 0, scheduledMatches: 0, changedMatches: 0, failedGameIds: [], durationMs: 0 });
      continue;
    }

    const before = await readMatches(competition.path);
    const startedAt = Date.now();
    console.log(`\n[auto-sync] 開始: ${competition.name}`);
    run(process.execPath, ["scripts/sync/sync-results.mjs", `--target=${competition.target}`]);
    const after = await readMatches(competition.path);
    results.push(summarize(competition, after, countChangedMatches(before, after), Date.now() - startedAt));
  }

  for (const competition of pendingCompetitions) {
    console.log(`[auto-sync] スキップ: ${competition.name}（${competition.reason}）`);
    results.push({ competitionId: competition.competitionId, name: competition.name, status: "skipped", reason: competition.reason, detectedMatches: 0, finishedMatches: 0, scheduledMatches: 0, changedMatches: 0, failedGameIds: [], durationMs: 0 });
  }

  // Iリーグは同期本体でteam-statsを生成しないため、全大会成功後に集計を確定する。
  run(process.execPath, ["scripts/build/build-team-stats.mjs", "--competition=jufa-chugoku-2026-i-league-division-1"]);
  run(process.execPath, ["scripts/build/build-team-stats.mjs", "--competition=jufa-chugoku-2026-i-league-division-2"]);
  run(process.execPath, ["scripts/build/build-head-to-head.mjs"]);
  run(process.execPath, ["scripts/build/build-season-index.mjs"]);

  await mkdir(dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify({
    schemaVersion: 1,
    lastRunAt: new Date().toISOString(),
    status: "success",
    trigger,
    competitions: results,
  }, null, 2)}\n`, "utf8");
  console.log(`\n[auto-sync] 全対象の同期に成功しました: ${STATE_PATH}`);
}

await main().catch((error) => {
  console.error(`[auto-sync] 失敗: ${error.message}`);
  console.error("sync-stateは更新しません。GitHub Actionsではデータをコミットしません。");
  process.exitCode = 1;
});
