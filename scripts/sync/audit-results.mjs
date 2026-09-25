import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { request } from "@playwright/test";

import { createAuditPlan, executeAuditPlan, AUDIT_MODES } from "./audit-plan.mjs";
import { pollCompetition } from "./poll-results.mjs";
import { POLL_TARGET_KEYS, RESULT_TARGETS } from "./result-targets.mjs";
import { buildGlobalDerivedData, runSelectedCompetition } from "./sync-selected-results.mjs";

const REQUEST_TIMEOUT_MS = 45_000;

async function main() {
  const mode = argumentValue("--mode");
  if (!AUDIT_MODES[mode]) throw new Error(`--modeにはrecent、daily、fullのいずれかを指定してください: ${mode ?? "未指定"}`);
  const targetArgument = argumentValue("--target");
  const targetKeys = targetArgument ? [targetArgument] : POLL_TARGET_KEYS;
  if (targetKeys.some((key) => !POLL_TARGET_KEYS.includes(key))) {
    throw new Error(`監査対象外または未対応の大会です: ${targetArgument}`);
  }
  const planOnly = process.argv.includes("--plan-only");
  const dryRun = planOnly || process.argv.includes("--dry-run");
  const now = argumentValue("--now") ?? new Date();
  const context = await request.newContext({
    timeout: REQUEST_TIMEOUT_MS,
    extraHTTPHeaders: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ja,en;q=0.8",
      "User-Agent": "ChugokuFootballData/1.0 (+results-audit)",
    },
  });

  const results = [];
  try {
    for (const targetKey of targetKeys) {
      const target = RESULT_TARGETS[targetKey];
      const pollResult = await pollCompetition({ targetKey, context, log: () => {} });
      const savedData = JSON.parse(await readFile(resolve(import.meta.dirname, target.outputPath), "utf8"));
      const plan = createAuditPlan({
        mode,
        now,
        savedMatches: savedData.items ?? [],
        parsedList: pollResult.parsedList,
        pollResult,
      });
      logAuditPlan(targetKey, plan, pollResult.httpRequests, planOnly);
      const result = await executeAuditPlan({
        plan,
        planOnly,
        dryRun,
        runSelected: ({ selectedGameIds }) => runSelectedCompetition({
          targetKey,
          context,
          listResult: pollResult,
          selectedGameIds,
          changeHints: pollResult.changes,
          dryRun,
          includeGlobalDerived: false,
        }),
      });
      console.log(`[AUDIT RESULT] competition=${targetKey} detailPosts=${result.detailPosts} rosterRequests=${result.selectedResult?.rosterRequests ?? 0} changedGames=${result.changedGames} dryRun=${dryRun}`);
      results.push({ targetKey, httpRequests: pollResult.httpRequests, ...result });
    }
    if (!dryRun && results.some((result) => result.changedGames > 0)) await buildGlobalDerivedData();
  } finally {
    await context.dispose();
  }

  console.log(`[AUDIT TOTAL] mode=${mode} competitions=${results.length} listGets=${results.reduce((sum, result) => sum + result.httpRequests, 0)} selectedGames=${results.reduce((sum, result) => sum + result.plan.selectedGames, 0)} detailPosts=${results.reduce((sum, result) => sum + result.detailPosts, 0)} rosterRequests=${results.reduce((sum, result) => sum + (result.selectedResult?.rosterRequests ?? 0), 0)} planOnly=${planOnly} dryRun=${dryRun}`);
}

function logAuditPlan(targetKey, plan, httpRequests, planOnly) {
  console.log(`[AUDIT PLAN]
mode=${plan.mode}
competition=${targetKey}
pollChanged=${plan.pollChanged}
windowSelected=${plan.windowSelected}
selectedGames=${plan.selectedGames}
listGets=${httpRequests}
plannedDetailPosts=${plan.plannedDetailPosts}
detailPosts=${planOnly ? 0 : plan.plannedDetailPosts}`);
  for (const selection of plan.selections) {
    console.log(`[AUDIT GAME] competition=${targetKey} gameId=${selection.gameId} reasons=${JSON.stringify(selection.reasons)}`);
  }
}

function argumentValue(name) {
  return process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

await main().catch((error) => {
  console.error(`[AUDIT ERROR] ${error.message}`);
  process.exitCode = 1;
});
