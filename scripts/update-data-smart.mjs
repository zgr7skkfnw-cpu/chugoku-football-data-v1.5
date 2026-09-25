import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

import { smartModePlan } from "./sync/smart-sync-mode.mjs";

const ROOT = resolve(import.meta.dirname, "..");

function main() {
  const mode = argumentValue("--mode");
  const dryRun = process.argv.includes("--dry-run");
  const planOnly = process.argv.includes("--plan-only");
  const plan = smartModePlan(mode);
  console.log(`[SMART SYNC] mode=${mode} dryRun=${dryRun} planOnly=${planOnly}`);

  if (plan.fullSync) {
    if (dryRun || planOnly) throw new Error("manual-fullはdry-run/plan-onlyに対応していません");
    run("npm", ["run", "update:data:auto"]);
    writeSummary({ mode, competitions: 6, listRequests: null, selectedGames: null, detailPosts: null, rosterRequests: 21, changedGames: null });
    return;
  }

  let rosterRequests = 0;
  if (plan.rosterAudit) {
    const roster = run("npm", ["run", "audit:roster", "--", ...(dryRun || planOnly ? ["--dry-run"] : [])]);
    rosterRequests = numberFrom(roster, /requests=(\d+)/);
  }
  const auditArgs = ["run", "audit:results", "--", `--mode=${plan.auditMode}`];
  if (planOnly) auditArgs.push("--plan-only");
  else if (dryRun) auditArgs.push("--dry-run");
  const audit = run("npm", auditArgs);
  const total = audit.match(/\[AUDIT TOTAL\][^\n]*/)?.[0] ?? "";
  rosterRequests += numberFrom(total, /rosterRequests=(\d+)/);
  const summary = {
    mode,
    competitions: numberFrom(total, /competitions=(\d+)/),
    listRequests: numberFrom(total, /listGets=(\d+)/),
    selectedGames: numberFrom(total, /selectedGames=(\d+)/),
    detailPosts: numberFrom(total, /detailPosts=(\d+)/),
    rosterRequests,
    changedGames: [...audit.matchAll(/\[AUDIT RESULT\][^\n]*changedGames=(\d+)/g)]
      .reduce((sum, match) => sum + Number(match[1]), 0),
  };
  writeSummary(summary);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} が終了コード${result.status}で失敗しました`);
  return result.stdout ?? "";
}

function writeSummary(summary) {
  const totalHttp = summary.listRequests == null || summary.detailPosts == null
    ? null
    : summary.listRequests + summary.detailPosts + summary.rosterRequests;
  const lines = [
    "## Smart sync summary",
    ...Object.entries({ ...summary, totalHttp }).map(([key, value]) => `- ${key}: ${value ?? "n/a"}`),
  ];
  console.log(`[SMART SUMMARY] ${Object.entries({ ...summary, totalHttp }).map(([key, value]) => `${key}=${value ?? "n/a"}`).join(" ")}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  }
}

function argumentValue(name) {
  return process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

function numberFrom(value, pattern) {
  const parsed = Number(value.match(pattern)?.[1] ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

try {
  main();
} catch (error) {
  console.error(`[SMART SYNC ERROR] ${error.message}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Smart sync failed\n- error: ${error.message}\n`,
    );
  }
  process.exitCode = 1;
}
