import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ROOT = resolve(import.meta.dirname, "..");
const BACKUP_FILES = [
  "site/data/seasons/2026/matches.json",
  "site/data/seasons/2026/div2/matches.json",
  "site/data/seasons/2026/team-stats.json",
  "site/data/seasons/2026/div2/team-stats.json",
  "site/data/head-to-head.json",
  "site/data/seasons/index.json",
];

const MATCH_FILES = {
  division1: "site/data/seasons/2026/matches.json",
  division2: "site/data/seasons/2026/div2/matches.json",
};

const steps = [
  ["2026年1部の公式同期", process.execPath, ["scripts/sync/sync-results.mjs", "--target=2026-1"]],
  ["2026年2部の公式同期", process.execPath, ["scripts/sync/sync-results.mjs", "--target=2026-2"]],
  ["1部team-stats再生成", process.execPath, ["scripts/build/build-team-stats.mjs", "--season=2026", "--division=1"]],
  ["2部team-stats再生成", process.execPath, ["scripts/build/build-team-stats.mjs", "--season=2026", "--division=2"]],
  ["head-to-head再生成", process.execPath, ["scripts/build/build-head-to-head.mjs"]],
  ["season index再生成", process.execPath, ["scripts/build/build-season-index.mjs"]],
  ["データ検証", "npm", ["run", "validate:data"]],
  ["E2Eテスト", "npm", ["run", "test:e2e"]],
];

function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture) process.stderr.write(result.stderr || result.stdout);
    throw new Error(`${command} ${args.join(" ")} が終了コード${result.status}で失敗しました`);
  }
  return capture ? result.stdout : "";
}

function assertCleanWorktree() {
  const status = run("git", ["status", "--short"], { capture: true });
  console.log("更新前のgit status:");
  console.log(status || "（変更なし）");
  if (status.trim()) {
    const message = "未コミット変更があります。コミットまたは退避してから再実行してください。";
    console.error(`[update:data] 停止: ${message}`);
    throw new Error(message);
  }
}

async function readMatches(relativePath) {
  return JSON.parse(await readFile(resolve(ROOT, relativePath), "utf8")).items ?? [];
}

function matchKey(match) {
  return [
    match.round,
    match.kickoffAt,
    match.homeTeam?.name,
    match.awayTeam?.name,
  ].join("|");
}

function countChangedMatches(before, after) {
  const previous = new Map(before.map((match) => [matchKey(match), JSON.stringify(match)]));
  const current = new Map(after.map((match) => [matchKey(match), JSON.stringify(match)]));
  const keys = new Set([...previous.keys(), ...current.keys()]);
  return [...keys].filter((key) => previous.get(key) !== current.get(key)).length;
}

async function createBackup() {
  const directory = await mkdtemp(join(tmpdir(), "chugoku-football-update-"));
  for (const relativePath of BACKUP_FILES) {
    const backupPath = join(directory, relativePath);
    await mkdir(dirname(backupPath), { recursive: true });
    await copyFile(resolve(ROOT, relativePath), backupPath);
  }
  return directory;
}

async function restoreBackup(directory) {
  for (const relativePath of BACKUP_FILES) {
    await copyFile(join(directory, relativePath), resolve(ROOT, relativePath));
  }
}

async function main() {
  assertCleanWorktree();
  const before = {
    division1: await readMatches(MATCH_FILES.division1),
    division2: await readMatches(MATCH_FILES.division2),
  };
  const backupDirectory = await createBackup();
  console.log(`同期前バックアップを一時領域へ作成しました: ${backupDirectory}`);

  try {
    for (const [label, command, args] of steps) {
      console.log(`\n[update:data] ${label}`);
      run(command, args);
    }

    const after = {
      division1: await readMatches(MATCH_FILES.division1),
      division2: await readMatches(MATCH_FILES.division2),
    };
    const changedFiles = run("git", ["status", "--short"], { capture: true });
    console.log("\n[update:data] 完了");
    console.log(`更新された試合数: 1部 ${countChangedMatches(before.division1, after.division1)}件 / 2部 ${countChangedMatches(before.division2, after.division2)}件`);
    console.log("変更されたファイル:");
    console.log(changedFiles || "（変更なし）");
  } catch (error) {
    console.error(`\n[update:data] 失敗: ${error.message}`);
    console.error("同期前バックアップから対象データを復元します。");
    await restoreBackup(backupDirectory);
    throw error;
  } finally {
    await rm(backupDirectory, { recursive: true, force: true });
  }
}

await main().catch(() => {
  process.exitCode = 1;
});
