import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const read = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("自動同期workflowは安全な定期実行と手動実行を定義する", async () => {
  const workflow = await read(".github/workflows/sync-results.yml");
  expect(workflow).toContain("workflow_dispatch:");
  expect(workflow).toContain('cron: "0 3,9,13 * * *"');
  expect(workflow).toContain("contents: write");
  expect(workflow).toContain("concurrency:");
  expect(workflow).not.toContain("continue-on-error");
  expect(workflow.indexOf("npm run update:data:auto")).toBeLessThan(workflow.indexOf("npm run validate:data"));
  expect(workflow.indexOf("npm run validate:data")).toBeLessThan(workflow.indexOf("git commit"));
  expect(workflow.indexOf("git diff --check")).toBeLessThan(workflow.indexOf("git commit"));
  expect(workflow).toContain("git diff --cached --quiet");
  expect(workflow).toContain("Discard state-only update");
  expect(workflow).toContain("git restore -- data/sync-state.json");
  expect(workflow).toContain("github-actions[bot]");
  expect(workflow).not.toContain("site/data/players.json");
  expect(workflow).not.toContain("package-lock.json");
});

test("統合コマンドは開催中大会を重複なく同期し未公開大会をスキップする", async () => {
  const script = await read("scripts/update-data-auto.mjs");
  for (const target of ["2026-1", "2026-2", "2026-rookie", "2026-i-league-1", "2026-i-league-2", "2026-championship"]) {
    expect(script.match(new RegExp(`\\"${target}\\"`, "g"))?.length).toBe(1);
  }
  expect(script).toContain("公式ID未設定・日程未公開");
  expect(script).toContain("大会非開催");
  expect(script).toContain('trigger === "workflow_dispatch"');
  expect(script).toContain("isWeeklyChampionshipRun");
  expect(script).toContain("now.getUTCHours() === 3");
});

test("sync-stateは公開データと分離し大会別結果を保持する", async () => {
  const state = JSON.parse(await read("data/sync-state.json"));
  const script = await read("scripts/update-data-auto.mjs");
  expect(state).toEqual({ schemaVersion: 1, lastRunAt: null, status: "never-run", trigger: null, competitions: [] });
  for (const field of ["detectedMatches", "finishedMatches", "scheduledMatches", "changedMatches", "failedGameIds", "durationMs"]) {
    expect(script).toContain(field);
  }
  expect(script).toContain('status: "success"');
  expect(script.indexOf("for (const competition of competitions)")).toBeLessThan(script.indexOf("writeFile(STATE_PATH"));
});

test("大会ごとの保存先は分離されている", async () => {
  const script = await read("scripts/update-data-auto.mjs");
  const paths = [
    "site/data/seasons/2026/matches.json",
    "site/data/seasons/2026/div2/matches.json",
    "site/data/seasons/2026/rookie/matches.json",
    "site/data/seasons/2026/i-league/div1/matches.json",
    "site/data/seasons/2026/i-league/div2/matches.json",
    "site/data/seasons/2026/championship/matches.json",
  ];
  expect(new Set(paths).size).toBe(paths.length);
  for (const path of paths) expect(script).toContain(path);
});
