import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { fetchTextWithRetry } from "./http-retry.mjs";
import { parseOfficialRoster, planRegularRosterAdditions } from "./regular-roster-diff.mjs";
import {
  assertOfficialRosterUrl,
  REGULAR_ROSTER_SPECIFICATIONS,
} from "./sync-regular-player-additions.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
export const PLAYERS_PATH = resolve(ROOT, "site/data/players.json");
const TEAM_CATALOG_PATH = resolve(ROOT, "site/data/team-catalog.json");

export function selectRosterSpecifications(teamIds, specifications = REGULAR_ROSTER_SPECIFICATIONS) {
  const requested = [...new Set(teamIds ?? [])];
  if (!requested.length) return [];
  const byId = new Map();
  for (const specification of specifications) {
    if (byId.has(specification.teamId)) throw new Error(`${specification.teamId}: 名簿同期対象teamIdが重複しています`);
    byId.set(specification.teamId, specification);
  }
  return requested.map((teamId) => {
    const specification = byId.get(teamId);
    if (!specification) throw new Error(`${teamId}: 通常リーグ公式名簿の対象teamIdではありません`);
    return specification;
  });
}

export async function createSelectedRosterPlan({
  teamIds,
  context,
  playersData,
  teamCatalog,
  specifications = REGULAR_ROSTER_SPECIFICATIONS,
  fetchRosterHtml,
  log = () => {},
}) {
  const selectedSpecifications = selectRosterSpecifications(teamIds, specifications);
  const [currentPlayers, catalog] = await Promise.all([
    playersData ?? readJson(PLAYERS_PATH),
    teamCatalog ?? readJson(TEAM_CATALOG_PATH),
  ]);
  if (!selectedSpecifications.length) {
    return emptyPlan(currentPlayers);
  }
  const validTeamIds = new Set((catalog.items ?? []).filter((team) => !team.competitionId).map((team) => team.id));
  const officialRosters = new Map();
  let requests = 0;
  for (const specification of selectedSpecifications) {
    requests += 1;
    const html = fetchRosterHtml
      ? await fetchRosterHtml(specification)
      : await fetchTextWithRetry(context, assertOfficialRosterUrl(specification.registrationUrl), {}, {
        attempts: 4,
        timeoutMs: 45_000,
        onRetry: ({ nextAttempt, delayMs, error }) => log(
          `[ROSTER RETRY] team=${specification.teamId} attempt=${nextAttempt}/4 delayMs=${delayMs} error=${error.message}`,
        ),
      });
    officialRosters.set(specification.teamId, parseOfficialRoster(html, specification));
  }
  const additions = planRegularRosterAdditions({
    existingPlayers: currentPlayers.items ?? [],
    officialRosters,
    specifications: selectedSpecifications,
    validTeamIds,
  });
  const nextPlayersData = additions.length ? {
    ...currentPlayers,
    updatedAt: new Date().toISOString(),
    count: (currentPlayers.items ?? []).length + additions.length,
    items: [...(currentPlayers.items ?? []), ...additions],
  } : currentPlayers;
  return {
    teamIds: selectedSpecifications.map((specification) => specification.teamId),
    teamsChecked: selectedSpecifications.length,
    requests,
    additions,
    changed: additions.length > 0,
    playersData: currentPlayers,
    nextPlayersData,
  };
}

export function assertUnknownPlayersResolved(unknownPlayers, players) {
  const unresolved = [];
  for (const unknown of unknownPlayers) {
    const matches = players.filter((player) =>
      player.teamId === unknown.teamId
      && normalizeName(player.name) === normalizeName(unknown.name));
    if (matches.length !== 1) unresolved.push({ ...unknown, candidates: matches.length });
  }
  if (unresolved.length) {
    throw new Error(`公式名簿取得後も未解決の選手があります: ${unresolved.map((entry) => `${entry.teamId} ${entry.name}`).join(", ")}`);
  }
  return true;
}

export async function commitRosterAndMatch({ rosterChanged, writePlayers, writeMatch, rollback }) {
  try {
    if (rosterChanged) await writePlayers();
    await writeMatch();
  } catch (error) {
    if (rosterChanged) await rollback();
    throw error;
  }
}

function emptyPlan(playersData) {
  return { teamIds: [], teamsChecked: 0, requests: 0, additions: [], changed: false, playersData, nextPlayersData: playersData };
}

function normalizeName(value) {
  return String(value ?? "").normalize("NFKC").replace(/[\s　]+/g, "").replace(/\[Cap\]$/i, "");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
