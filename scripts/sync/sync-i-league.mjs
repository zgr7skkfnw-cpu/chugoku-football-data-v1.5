import { copyFile, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const division = Number(process.argv.find((value) => value.startsWith("--division="))?.split("=")[1]);
if (![1, 2].includes(division)) throw new Error("--division=1 または --division=2 を指定してください");

const relativeOutput = `site/data/seasons/2026/i-league/div${division}/matches.json`;
const output = resolve(ROOT, relativeOutput);
const backupDirectory = await mkdtemp(join(tmpdir(), `chugoku-i-league-div${division}-`));
const backup = join(backupDirectory, "matches.json");
let hadPrevious = false;

try {
  try {
    await stat(output);
    await copyFile(output, backup);
    hadPrevious = true;
    console.log(`同期前バックアップ: ${backupDirectory}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    console.log("初回同期のため既存データはありません。");
  }

  const exitCode = await run(process.execPath, [
    "scripts/sync/sync-results.mjs",
    `--target=2026-i-league-${division}`,
  ]);
  if (exitCode !== 0) {
    if (hadPrevious) await copyFile(backup, output);
    throw new Error(`Iリーグ${division}部同期に失敗しました。既存データを維持しました。`);
  }
} finally {
  await rm(backupDirectory, { recursive: true, force: true });
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: "inherit" });
    child.once("error", rejectRun);
    child.once("exit", (code) => resolveRun(code ?? 1));
  });
}
