const listeners = new Set();

const state = {
  currentView: "home",
  currentMatchId: null,
  currentTeamId: null,
  currentPlayerId: null,
  theme: "dark",
  dataStatus: "loading",
  dataError: null,
  matches: [],
  metadata: null,
  competitionMetadata: null,
  competitionDefinitions: [],
  availableSeasons: [],
  selectedSeason: 2026,
  teams: [],
  leagueTeams: [],
  players: [],
  teamDirectory: null,
  playerDirectory: null,
  playerStatistics: null,
  favoriteTeamId: null,
  seasonPeriod: "all",
  teamStats: null,
  leagueStats: null,
  leagueDivision: 1,
  selectedCompetitionId: null,
  headToHead: null,
};

export function getState() {
  return Object.freeze({ ...state });
}

export function setState(patch) {
  const previous = { ...state };
  Object.assign(state, patch);

  for (const listener of listeners) {
    listener(getState(), Object.freeze(previous));
  }
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
