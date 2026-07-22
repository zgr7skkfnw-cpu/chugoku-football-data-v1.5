const FAVORITE_TEAM_KEY = "chugoku-football.favorite-team";
const FAVORITE_TEAMS_KEY = "chugoku-football.favorite-teams";

export function loadFavoriteTeamIds() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(FAVORITE_TEAMS_KEY) ?? "null");
    if (Array.isArray(stored?.teamIds)) {
      const normalized = uniqueIds(stored.teamIds);
      if (normalized.length !== stored.teamIds.length) saveFavoriteTeamIds(normalized);
      return normalized;
    }

    const legacyTeamId = window.localStorage.getItem(FAVORITE_TEAM_KEY);
    const migrated = legacyTeamId ? [legacyTeamId] : [];
    if (legacyTeamId) saveFavoriteTeamIds(migrated);
    return migrated;
  } catch {
    return [];
  }
}

export function saveFavoriteTeamIds(teamIds) {
  try {
    const uniqueTeamIds = uniqueIds(teamIds);
    window.localStorage.setItem(FAVORITE_TEAMS_KEY, JSON.stringify({ teamIds: uniqueTeamIds }));
    window.localStorage.removeItem(FAVORITE_TEAM_KEY);
  } catch {
    // The app remains usable when storage is unavailable.
  }
}

export function toggleFavoriteTeam(teamIds, teamId) {
  const current = uniqueIds(teamIds);
  const next = current.includes(teamId)
    ? current.filter((id) => id !== teamId)
    : [...current, teamId];
  saveFavoriteTeamIds(next);
  return next;
}

function uniqueIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === "string" && id))];
}
