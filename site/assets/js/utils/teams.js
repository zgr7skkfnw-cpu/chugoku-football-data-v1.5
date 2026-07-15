export function createTeamDirectory(teams) {
  const byName = new Map();
  for (const team of teams) {
    byName.set(team.name, team);
    for (const alias of team.aliases ?? []) byName.set(alias, team);
  }
  return {
    byId: new Map(teams.map((team) => [team.id, team])),
    byName,
  };
}

export function getTeam(teamDirectory, reference) {
  if (!reference) return null;
  if (typeof reference === "string") {
    return teamDirectory?.byId.get(reference) ?? teamDirectory?.byName.get(reference) ?? null;
  }
  return (
    teamDirectory?.byId.get(reference.teamId) ??
    teamDirectory?.byName.get(reference.name) ??
    null
  );
}

export function linkMatchesToTeams(matches, teamDirectory) {
  return matches.map((match) => {
    const home = getTeam(teamDirectory, match.homeTeam);
    const away = getTeam(teamDirectory, match.awayTeam);
    return {
      ...match,
      homeTeam: { ...match.homeTeam, teamId: home?.id ?? null },
      awayTeam: { ...match.awayTeam, teamId: away?.id ?? null },
      lineups: match.lineups
        ? {
            home: match.lineups.home
              ? { ...match.lineups.home, teamId: home?.id ?? null }
              : null,
            away: match.lineups.away
              ? { ...match.lineups.away, teamId: away?.id ?? null }
              : null,
          }
        : null,
    };
  });
}
