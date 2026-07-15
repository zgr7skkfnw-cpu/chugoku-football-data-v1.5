const FAVORITE_TEAM_KEY = "chugoku-football.favorite-team";

export function loadFavoriteTeamId() {
  try {
    return window.localStorage.getItem(FAVORITE_TEAM_KEY);
  } catch {
    return null;
  }
}

export function saveFavoriteTeamId(teamId) {
  try {
    if (teamId) window.localStorage.setItem(FAVORITE_TEAM_KEY, teamId);
    else window.localStorage.removeItem(FAVORITE_TEAM_KEY);
  } catch {
    // The app remains usable when storage is unavailable.
  }
}
