import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { request } from "@playwright/test";

import { createSelectedRosterPlan, PLAYERS_PATH } from "./selected-roster-sync.mjs";
import { REGULAR_ROSTER_SPECIFICATIONS } from "./sync-regular-player-additions.mjs";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const all = process.argv.includes("--all");
  const teamIds = all
    ? REGULAR_ROSTER_SPECIFICATIONS.map((specification) => specification.teamId)
    : teamArguments();
  if (!teamIds.length) throw new Error("--teamまたは--allを指定してください");
  const context = await request.newContext({ timeout: 45_000 });
  try {
    const plan = await createSelectedRosterPlan({ teamIds, context, log: console.warn });
    for (const player of plan.additions) {
      console.log(`[ROSTER PLAYER] team=${player.teamId} name=${player.name} action=add`);
    }
    console.log(`[ROSTER SUMMARY] teamsChecked=${plan.teamsChecked} requests=${plan.requests} newPlayers=${plan.additions.length} dryRun=${dryRun}`);
    if (plan.changed && !dryRun) await writePlayers(plan.nextPlayersData);
  } finally {
    await context.dispose();
  }
}

function teamArguments() {
  return process.argv
    .filter((argument) => argument.startsWith("--team="))
    .flatMap((argument) => argument.slice("--team=".length).split(","))
    .filter(Boolean);
}

async function writePlayers(data) {
  const temporaryPath = `${PLAYERS_PATH}.tmp`;
  await mkdir(dirname(PLAYERS_PATH), { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    JSON.parse(await readFile(temporaryPath, "utf8"));
    await rename(temporaryPath, PLAYERS_PATH);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

await main().catch((error) => {
  console.error(`[ROSTER SELECTED ERROR] ${error.message}`);
  process.exitCode = 1;
});
