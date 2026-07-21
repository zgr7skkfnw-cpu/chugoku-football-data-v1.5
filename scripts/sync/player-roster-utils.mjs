import { createHash } from "node:crypto";

export function normalizePlayerName(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s*\[Cap\]\s*$/i, "").replace(/[\s　]+/g, "");
}

export function createPlayerId(teamId, name) {
  const digest = createHash("sha1").update(`${teamId}\0${normalizePlayerName(name)}`).digest("hex").slice(0, 12);
  return `${teamId}-${digest}`;
}

export function findRosterDuplicates(players) {
  const groups = new Map();
  for (const player of players) {
    const key = `${player.teamId}\0${normalizePlayerName(player.name)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(player);
  }
  return [...groups.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([key, entries]) => ({ key, entries: entries.map(({ name, englishName, birth, number, position }) => ({ name, englishName, birth, number, position })) }));
}

export function mergeDivisionPlayers(existingPlayers, fetchedByTeam, targetTeamIds, preservePlayerIds = new Set()) {
  const retained = existingPlayers.filter((player) => !targetTeamIds.has(player.teamId));
  const previousTargets = existingPlayers.filter((player) => targetTeamIds.has(player.teamId));
  const fetched = [...fetchedByTeam.values()].flat();
  const duplicates = findRosterDuplicates(fetched);
  if (duplicates.length) throw new Error(`同一チーム内の同姓同名候補が${duplicates.length}件あります`);
  for (const teamId of targetTeamIds) {
    const roster = fetchedByTeam.get(teamId) ?? [];
    if (!roster.length) throw new Error(`${teamId}の公式登録が0人のため更新を停止します`);
    const previousCount = previousTargets.filter((player) => player.teamId === teamId).length;
    if (previousCount && roster.length < Math.floor(previousCount * 0.6)) {
      throw new Error(`${teamId}の登録人数が${previousCount}人から${roster.length}人へ急減したため更新を停止します`);
    }
  }
  const before = new Map(previousTargets.map((player) => [player.id, JSON.stringify(player)]));
  const after = new Map(fetched.map((player) => [player.id, JSON.stringify(player)]));
  const preserved = previousTargets.filter((player) => !after.has(player.id) && preservePlayerIds.has(player.id));
  return {
    players: [...retained, ...fetched, ...preserved],
    added: [...after.keys()].filter((id) => !before.has(id)).length,
    updated: [...after].filter(([id, value]) => before.has(id) && before.get(id) !== value).length,
    deleted: [...before.keys()].filter((id) => !after.has(id) && !preservePlayerIds.has(id)).length,
    preserved: preserved.length,
  };
}

export function createRosterSnapshot({ syncedAt, sources, players, previous = null }) {
  const rosterPlayers = players.map((player) => ({
    id: player.id, teamId: player.teamId, name: player.name,
    normalizedName: normalizePlayerName(player.name), englishName: player.englishName,
    number: player.number, position: player.position, birth: player.birth,
    height: player.height, weight: player.weight, previousTeam: player.previousTeam,
  }));
  const currentById = new Map(rosterPlayers.map((player) => [player.id, player]));
  const previousById = new Map((previous?.players ?? []).map((player) => [player.id, player]));
  const fields = ["name", "normalizedName", "englishName", "number", "position", "birth", "height", "weight", "previousTeam"];
  const changed = [];
  for (const [id, player] of currentById) {
    const before = previousById.get(id);
    if (!before) continue;
    const changes = Object.fromEntries(fields.filter((field) => JSON.stringify(before[field]) !== JSON.stringify(player[field])).map((field) => [field, { before: before[field] ?? null, after: player[field] ?? null }]));
    if (Object.keys(changes).length) changed.push({ id, teamId: player.teamId, changes });
  }
  const previousCounts = new Map((previous?.teams ?? []).map((team) => [team.teamId, team.count]));
  const teams = sources.map(({ teamId, teamName, pageId, registrationUrl, count }) => ({ teamId, teamName, pageId, registrationUrl, count }));
  return {
    schemaVersion: 1, syncedAt, season: 2026, competitionId: "jufa-chugoku-2026-division-2",
    sources: teams.map(({ teamId, pageId, registrationUrl }) => ({ teamId, pageId, registrationUrl })),
    teams, totalCount: rosterPlayers.length, players: rosterPlayers,
    changes: {
      added: [...currentById.values()].filter((player) => !previousById.has(player.id)).map(({ id, teamId, name }) => ({ id, teamId, name })),
      removed: [...previousById.values()].filter((player) => !currentById.has(player.id)).map(({ id, teamId, name }) => ({ id, teamId, name })),
      changed,
      teamCounts: teams.filter((team) => previousCounts.has(team.teamId) && previousCounts.get(team.teamId) !== team.count).map((team) => ({ teamId: team.teamId, before: previousCounts.get(team.teamId), after: team.count })),
    },
  };
}

export function rosterSnapshotChanged(snapshot) {
  return snapshot.changes.added.length > 0 || snapshot.changes.removed.length > 0 || snapshot.changes.changed.length > 0 || snapshot.changes.teamCounts.length > 0;
}

export function auditRoster(matches, players, targetTeamIds, teamIdByName = new Map()) {
  const roster = new Map(players.filter((player) => targetTeamIds.has(player.teamId)).map((player) => [`${player.teamId}\0${normalizePlayerName(player.name)}`, player]));
  const appeared = new Set();
  const missingOccurrences = [];
  const numberMismatches = [];
  const positionMismatches = [];
  const normalizedNameMatches = [];
  const seen = new Set();
  for (const match of matches.filter((entry) => entry.status === "finished")) {
    for (const side of ["home", "away"]) {
      const teamId = match[`${side}Team`]?.teamId ?? teamIdByName.get(match[`${side}Team`]?.name) ?? teamIdByName.get(match.lineups?.[side]?.teamName);
      if (!targetTeamIds.has(teamId)) continue;
      const entries = [...(match.lineups?.[side]?.starters ?? []), ...(match.lineups?.[side]?.substitutes ?? [])];
      for (const entry of entries) {
        const normalizedName = normalizePlayerName(entry.name);
        const occurrence = `${match.id}\0${teamId}\0${normalizedName}\0${entry.number}\0${entry.position}`;
        if (seen.has(occurrence)) continue;
        seen.add(occurrence);
        const player = roster.get(`${teamId}\0${normalizedName}`);
        if (!player) {
          missingOccurrences.push({ matchId: match.id, teamId, name: entry.name, number: entry.number, position: entry.position });
          continue;
        }
        appeared.add(player.id);
        if (entry.name !== player.name && normalizePlayerName(entry.name) === normalizePlayerName(player.name)) normalizedNameMatches.push({ matchId: match.id, teamId, matchName: entry.name, rosterName: player.name });
        if (entry.number != null && player.number != null && entry.number !== player.number) numberMismatches.push({ matchId: match.id, teamId, name: player.name, matchNumber: entry.number, rosterNumber: player.number });
        if (entry.position && player.position && entry.position !== player.position) positionMismatches.push({ matchId: match.id, teamId, name: player.name, matchPosition: entry.position, rosterPosition: player.position });
      }
    }
  }
  return {
    checkedAt: new Date().toISOString(),
    source: "JUFA中国 2026年度2部チーム登録",
    checkedLineupEntries: seen.size,
    missing: [...new Map(missingOccurrences.map((entry) => [`${entry.teamId}\0${normalizePlayerName(entry.name)}`, { teamId: entry.teamId, name: entry.name, number: entry.number, position: entry.position, matchIds: [] }])).values()].map((entry) => ({ ...entry, matchIds: missingOccurrences.filter((occurrence) => occurrence.teamId === entry.teamId && normalizePlayerName(occurrence.name) === normalizePlayerName(entry.name)).map((occurrence) => occurrence.matchId) })),
    missingOccurrences,
    numberMismatches,
    positionMismatches,
    normalizedNameMatches,
    rosterNeverAppeared: players.filter((player) => targetTeamIds.has(player.teamId) && !appeared.has(player.id)).map((player) => ({ id: player.id, teamId: player.teamId, name: player.name })),
    duplicateCandidates: findRosterDuplicates(players.filter((player) => targetTeamIds.has(player.teamId))),
  };
}
