import { access, cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const ROSTER_FILES = [
  "site/data/players.json",
  "site/data/seasons/2026/team-stats.json",
  "site/data/seasons/2026/div2/team-stats.json",
  "reports/player-audit-div2.json",
];
const SNAPSHOT_DIRECTORY = "reports/roster-snapshots/2026/div2";

function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture) process.stderr.write(result.stderr || result.stdout);
    throw new Error(`${command} ${args.join(" ")} が終了コード${result.status}で失敗しました`);
  }
  return capture ? result.stdout : "";
}

async function exists(path) { try { await access(path); return true; } catch { return false; } }

function assertCleanWorktree() {
  const status = run("git", ["status", "--short"], { capture: true });
  console.log("完全更新前のgit status:");
  console.log(status || "（変更なし）");
  if (status.trim()) {
    console.error("[update:data:full] 停止: 未コミット変更があります。コミットまたは退避してから再実行してください。");
    throw new Error("dirty worktree");
  }
}

async function backupRosterData(directory) {
  for (const relativePath of ROSTER_FILES) {
    const source = resolve(ROOT, relativePath);
    if (!(await exists(source))) continue;
    const destination = join(directory, relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination);
  }
  const snapshots = resolve(ROOT, SNAPSHOT_DIRECTORY);
  if (await exists(snapshots)) await cp(snapshots, join(directory, SNAPSHOT_DIRECTORY), { recursive: true });
}

async function restoreRosterData(directory) {
  for (const relativePath of ROSTER_FILES) {
    const backup = join(directory, relativePath);
    if (await exists(backup)) await cp(backup, resolve(ROOT, relativePath));
  }
  const snapshots = resolve(ROOT, SNAPSHOT_DIRECTORY);
  await rm(snapshots, { recursive: true, force: true });
  const snapshotBackup = join(directory, SNAPSHOT_DIRECTORY);
  if (await exists(snapshotBackup)) await cp(snapshotBackup, snapshots, { recursive: true });
}

async function main() {
  assertCleanWorktree();
  console.log("\n[update:data:full] 通常の試合・集計更新");
  run("npm", ["run", "update:data"]);

  const backupDirectory = await mkdtemp(join(tmpdir(), "chugoku-roster-update-"));
  await backupRosterData(backupDirectory);
  console.log(`名簿関連バックアップを一時領域へ作成しました: ${backupDirectory}`);
  try {
    const steps = [
      ["2026年2部公式選手名鑑同期", "npm", ["run", "sync:players:div2"]],
      ["1部team-stats再生成", "npm", ["run", "build:stats"]],
      ["2部team-stats再生成", "npm", ["run", "build:stats:div2"]],
      ["データ検証", "npm", ["run", "validate:data"]],
      ["E2Eテスト", "npm", ["run", "test:e2e"]],
    ];
    for (const [label, command, args] of steps) {
      console.log(`\n[update:data:full] ${label}`);
      run(command, args);
    }
    console.log("\n[update:data:full] 完了");
    console.log("変更されたファイル:");
    console.log(run("git", ["status", "--short"], { capture: true }) || "（変更なし）");
  } catch (error) {
    console.error(`\n[update:data:full] 名簿関連処理に失敗: ${error.message}`);
    console.error("players.json、team-stats、監査、名簿スナップショットだけを復元します。試合同期結果は維持します。");
    await restoreRosterData(backupDirectory);
    throw error;
  } finally {
    await rm(backupDirectory, { recursive: true, force: true });
  }
}

await main().catch(() => { process.exitCode = 1; });
