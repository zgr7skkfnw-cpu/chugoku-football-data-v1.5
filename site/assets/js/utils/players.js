export function normalizePlayerName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s*\[Cap\]\s*$/i, "")
    .replace(/[\s　]+/g, "")
    .replaceAll("遙", "遥");
}

export function createPlayerDirectory(players) {
  const byId = new Map(players.map((player) => [player.id, player]));
  const byTeamAndName = new Map(
    players.map((player) => [playerKey(player.teamId, player.name), player]),
  );
  return { byId, byTeamAndName };
}

export function getPlayer(playerDirectory, reference, teamId = null) {
  if (!reference) return null;
  if (typeof reference === "object" && reference.id) {
    return playerDirectory?.byId.get(reference.id) ?? null;
  }
  if (!teamId && typeof reference === "string") {
    return playerDirectory?.byId.get(reference) ?? null;
  }
  return playerDirectory?.byTeamAndName.get(playerKey(teamId, reference)) ?? null;
}

export function calculatePlayerStatistics(players, matches, teamDirectory) {
  const directory = createPlayerDirectory(players);
  const statistics = new Map(
    players.map((player) => [
      player.id,
      {
        player,
        team: teamDirectory?.byId.get(player.teamId) ?? null,
        ...createStatTotals(),
        periods: {
          first: createStatTotals(),
          second: createStatTotals(),
        },
        matches: [],
      },
    ]),
  );

  for (const match of matches.filter((candidate) => candidate.status === "finished")) {
    for (const side of ["home", "away"]) {
      aggregateMatchSide({ match, side, directory, statistics });
    }
  }

  for (const stats of statistics.values()) {
    stats.matches.sort((left, right) => new Date(right.kickoffAt) - new Date(left.kickoffAt));
  }

  return statistics;
}

function aggregateMatchSide({ match, side, directory, statistics }) {
  const lineup = match.lineups?.[side];
  const matchTeam = match[`${side}Team`];
  const otherTeam = match[side === "home" ? "awayTeam" : "homeTeam"];
  const teamId = lineup?.teamId ?? matchTeam?.teamId;
  if (!teamId || !lineup) return;

  const period = getSeasonPeriod(match);
  const duration = getMatchDuration(match);
  const substitutions = (match.substitutions?.[side] ?? [])
    .map(parseSubstitution)
    .filter(Boolean);
  const disciplinary = (match.disciplinary?.[side] ?? [])
    .map(parseDisciplinary)
    .filter(Boolean);
  const starters = new Set((lineup.starters ?? []).map((entry) => normalizePlayerName(entry.name)));
  const bench = new Set(
    (lineup.substitutes ?? []).map((entry) => normalizePlayerName(entry.name)),
  );
  const appearanceNames = new Set([
    ...starters,
    ...substitutions.map((event) => normalizePlayerName(event.playerIn)),
  ]);
  const matchEntries = new Map();

  const getStatsByName = (name) => {
    const player = getPlayer(directory, name, teamId);
    return player ? statistics.get(player.id) : null;
  };
  const getMatchEntry = (stats) => {
    if (!matchEntries.has(stats.player.id)) {
      matchEntries.set(stats.player.id, {
        matchId: match.id,
        kickoffAt: match.kickoffAt,
        opponentTeamId: otherTeam?.teamId ?? null,
        opponentName: otherTeam?.name ?? "",
        period,
        minutes: 0,
        started: false,
        benchSelected: false,
        substitutionOn: false,
        substitutionOff: false,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        fullAppearance: false,
      });
    }
    return matchEntries.get(stats.player.id);
  };

  for (const normalizedName of bench) {
    const stats = getStatsByName(normalizedName);
    if (!stats) continue;
    const entry = getMatchEntry(stats);
    entry.benchSelected = true;
    incrementStat(stats, period, "benchSelections");
  }

  for (const normalizedName of appearanceNames) {
    const stats = getStatsByName(normalizedName);
    if (!stats) continue;
    const started = starters.has(normalizedName);
    const onEvent = substitutions.find(
      (event) => normalizePlayerName(event.playerIn) === normalizedName,
    );
    const offEvent = substitutions.find(
      (event) => normalizePlayerName(event.playerOut) === normalizedName,
    );
    const redEvent = disciplinary.find(
      (event) => event.isRed && normalizePlayerName(event.name) === normalizedName,
    );
    const startMinute = started ? 0 : onEvent?.minute ?? duration;
    const endMinute = Math.min(
      duration,
      offEvent?.minute ?? duration,
      redEvent?.minute ?? duration,
    );
    const minutes = Math.max(0, endMinute - startMinute);
    const entry = getMatchEntry(stats);
    entry.minutes = minutes;
    entry.started = started;
    entry.substitutionOn = Boolean(onEvent);
    entry.substitutionOff = Boolean(offEvent);
    entry.fullAppearance = started && !offEvent && !redEvent && minutes >= duration;
    incrementStat(stats, period, "appearances");
    incrementStat(stats, period, "starts", started ? 1 : 0);
    incrementStat(stats, period, "minutes", minutes);
    incrementStat(stats, period, "substitutionsOn", onEvent ? 1 : 0);
    incrementStat(stats, period, "substitutionsOff", offEvent ? 1 : 0);
    incrementStat(stats, period, "fullAppearances", entry.fullAppearance ? 1 : 0);
    incrementStat(stats, period, "cleanSheets", stats.player.position === "GK" && Number(otherTeam?.score) === 0 ? 1 : 0);
  }

  for (const goal of (match.goals ?? []).filter((event) => event.teamName === lineup.teamName)) {
    const scorer = getStatsByName(goal.scorerName);
    if (scorer) {
      incrementStat(scorer, period, "goals");
      getMatchEntry(scorer).goals += 1;
    }
    for (const assistName of goal.assistNames ?? []) {
      const assister = getStatsByName(assistName);
      if (!assister) continue;
      incrementStat(assister, period, "assists");
      getMatchEntry(assister).assists += 1;
    }
  }

  for (const card of disciplinary) {
    const stats = getStatsByName(card.name);
    if (!stats) continue;
    const entry = getMatchEntry(stats);
    if (card.isYellow) {
      incrementStat(stats, period, "yellowCards");
      entry.yellowCards += 1;
    }
    if (card.isRed) {
      incrementStat(stats, period, "redCards");
      entry.redCards += 1;
    }
  }

  for (const [playerId, entry] of matchEntries) {
    statistics.get(playerId).matches.push(entry);
  }
}

function createStatTotals() {
  return {
    appearances: 0,
    starts: 0,
    minutes: 0,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    benchSelections: 0,
    fullAppearances: 0,
    substitutionsOn: 0,
    substitutionsOff: 0,
    cleanSheets: 0,
  };
}

function incrementStat(stats, period, key, amount = 1) {
  stats[key] += amount;
  if (period) stats.periods[period][key] += amount;
}

function getSeasonPeriod(match) {
  const round = Number(match.round);
  if (!Number.isInteger(round)) return null;
  return round <= 9 ? "first" : "second";
}

function playerKey(teamId, name) {
  return `${teamId ?? ""}\0${normalizePlayerName(name)}`;
}

function getMatchDuration(match) {
  const duration = Number.parseInt(match.matchFormat?.match(/試合時間[:：]\s*(\d+)分/)?.[1], 10);
  return Number.isInteger(duration) ? duration : 90;
}

export function parseMatchMinute(value) {
  const normalized = String(value).normalize("NFKC").replace(/\s+/g, "");
  if (normalized === "HT") return 45;
  const match = normalized.match(/^(\d+)(?:\+(\d+))?/);
  if (!match) return null;
  // 出場時間は所定の90分を基準にし、前後半の追加時間は加算しない。
  return Number(match[1]);
}

function parseSubstitution(text) {
  const match = String(text).match(/^(HT|\d+(?:\s*[+＋]\s*\d+)?)\s*(?:分)?\s+\[out\](.*?)\s+\[in\](.*)$/);
  if (!match) return null;
  return {
    minute: parseMatchMinute(match[1]),
    playerOut: match[2].trim(),
    playerIn: match[3].trim(),
  };
}

function parseDisciplinary(text) {
  const match = String(text).match(
    /^(HT|\d+(?:\s*[+＋]\s*\d+)?)\s*(?:分)?\s+(.+?)\s+(C[1-9]|CS|S[1-9])(?:\s|$)/,
  );
  if (!match) return null;
  const code = match[3];
  return {
    minute: parseMatchMinute(match[1]),
    name: match[2].trim(),
    code,
    isYellow: /^C[1-9]$/.test(code),
    isRed: code === "CS" || /^S[1-9]$/.test(code),
  };
}

export function sortPlayerStatistics(statistics, metric) {
  return [...statistics.values()].sort(
    (left, right) =>
      getMetric(right, metric) - getMetric(left, metric) ||
      right.goals - left.goals ||
      left.player.name.localeCompare(right.player.name, "ja"),
  );
}

export function selectPlayerStatisticsPeriod(statistics, period = "all") {
  if (period === "all") return statistics;
  return new Map(
    [...statistics].map(([playerId, stats]) => [
      playerId,
      { ...stats, ...stats.periods[period] },
    ]),
  );
}

export function getMetric(stats, metric) {
  if (metric === "goalContributions") return stats.goals + stats.assists;
  return stats[metric] ?? 0;
}

export function formatGrade(grade) {
  return Number.isInteger(grade) ? `${grade}年（推定）` : "未掲載";
}
