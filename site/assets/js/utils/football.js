const teamColors = [
  "#2476d3",
  "#d34b55",
  "#9a6bd6",
  "#d58a2f",
  "#188e79",
  "#5f72c9",
  "#bf5a98",
  "#418b45",
  "#b96734",
  "#536779",
];

export function getTeamVisual(name) {
  let hash = 0;

  for (const character of name) {
    hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  }

  const label = name.startsWith("IPU") ? "IPU" : name.replace("大学", "").slice(0, 1);
  return { id: label, name, color: teamColors[hash % teamColors.length] };
}

export function getLatestMatches(matches, limit = 3) {
  return [...matches]
    .filter((match) => match.status === "finished")
    .sort((left, right) => new Date(right.kickoffAt) - new Date(left.kickoffAt))
    .slice(0, limit);
}

export function sortMatchesNewestFirst(matches) {
  return [...matches].sort(
    (left, right) =>
      new Date(right.kickoffAt) - new Date(left.kickoffAt) || right.gameId - left.gameId,
  );
}

export function filterMatchesByPeriod(matches, period = "all") {
  if (period === "all") return matches;
  return matches.filter((match) => {
    const round = Number(match.round);
    const firstToRound = match.division === 2 ? 11 : 9;
    const finalRound = match.division === 2 ? 22 : 18;
    return period === "first"
      ? round >= 1 && round <= firstToRound
      : round > firstToRound && round <= finalRound;
  });
}

export function calculateStandings(matches) {
  const table = new Map();

  function getRow(teamName) {
    if (!table.has(teamName)) {
      table.set(teamName, {
        teamName,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      });
    }

    return table.get(teamName);
  }

  for (const match of matches) {
    const homeScore = match.homeTeam?.score;
    const awayScore = match.awayTeam?.score;

    if (
      match.status !== "finished" ||
      !Number.isInteger(homeScore) ||
      !Number.isInteger(awayScore)
    ) {
      continue;
    }

    const home = getRow(match.homeTeam.name);
    const away = getRow(match.awayTeam.name);
    home.played += 1;
    away.played += 1;
    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;
    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (homeScore < awayScore) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  return [...table.values()]
    .map((row) => ({
      ...row,
      goalDifference: row.goalsFor - row.goalsAgainst,
    }))
    .sort(
      (left, right) =>
        right.points - left.points ||
        right.goalDifference - left.goalDifference ||
        right.goalsFor - left.goalsFor ||
        left.teamName.localeCompare(right.teamName, "ja"),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function calculatePlayerRankings(matches) {
  const rankings = new Map();

  for (const match of matches) {
    for (const goal of match.goals ?? []) {
      if (!goal.scorerName) {
        continue;
      }

      const key = `${goal.teamName}\u0000${goal.scorerName}`;
      const current = rankings.get(key) ?? {
        name: goal.scorerName,
        teamName: goal.teamName,
        goals: 0,
        matches: new Set(),
      };
      current.goals += 1;
      current.matches.add(match.id);
      rankings.set(key, current);
    }
  }

  return [...rankings.values()]
    .map(({ matches: matchIds, ...entry }) => ({ ...entry, appearances: matchIds.size }))
    .sort(
      (left, right) =>
        right.goals - left.goals || left.name.localeCompare(right.name, "ja"),
    );
}

export function formatKickoff(match, options = {}) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    ...(options.includeYear ? { year: "numeric" } : {}),
    ...(options.includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(match.kickoffAt));
}

export function formatUpdatedAt(value) {
  if (!value) {
    return "更新時刻不明";
  }

  return `${new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))} 更新`;
}
