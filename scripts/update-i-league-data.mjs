import { spawnSync } from "node:child_process";

const status = run("git", ["status", "--short"], true);
console.log("Iリーグ完全更新 開始時のgit status --short:");
console.log(status.stdout || "（変更なし）");
if (status.stdout.trim()) {
  console.error("未コミット変更があるためIリーグ完全更新を停止します。");
  process.exit(1);
}

const steps = [
  ["Iリーグ1部試合同期", "sync:ileague:div1"],
  ["Iリーグ2部試合同期", "sync:ileague:div2"],
  ["Iリーグ選手名簿同期", "sync:players:ileague"],
  ["Iリーグ1部team-stats", "build:stats:ileague:div1"],
  ["Iリーグ2部team-stats", "build:stats:ileague:div2"],
  ["season index", "build:seasons"],
  ["head-to-head", "build:h2h"],
  ["データ検証", "validate:data"],
  ["E2Eテスト", "test:e2e"],
];

const completed = [];
for (const [label, script] of steps) {
  console.log(`\n[開始] ${label}`);
  run("npm", ["run", script]);
  completed.push(label);
  console.log(`[成功] ${label}`);
}

const finalStatus = run("git", ["status", "--short"], true);
console.log("\nIリーグ完全更新 完了:");
for (const label of completed) console.log(`- 成功: ${label}`);
console.log("変更ファイル一覧:");
console.log(finalStatus.stdout || "（変更なし）");
console.log("自動コミット・自動pushは行っていません。");

function run(command, args, capture = false) {
  const result = spawnSync(command, args, { cwd: process.cwd(), encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    process.exit(result.status ?? 1);
  }
  return result;
}
