import { initializeRouter, routes } from "./router.js";
import { getState, setState, subscribe } from "./state.js";
import { loadMatches } from "./api/matches.js";
import { loadPlayers, loadTeamCatalog, loadTeams } from "./api/teams.js";
import { loadLeagueStats } from "./api/team-stats.js";
import { loadHeadToHead } from "./api/head-to-head.js";
import { createTeamDirectory, linkMatchesToTeams } from "./utils/teams.js";
import { calculatePlayerStatistics, createPlayerDirectory } from "./utils/players.js";
import { loadFavoriteTeamIds } from "./utils/favorites.js";
import { loadFavoritePlayerIds } from "./utils/player-favorites.js";
import { renderBottomNavigation } from "./ui/bottom-nav.js";
import { renderErrorState, renderLoadingState } from "./ui/data-status.js";
import { renderHomePage } from "./pages/home.js";
import { renderMatchesPage } from "./pages/matches.js";
import { renderPlayersPage } from "./pages/players.js";
import { renderRankingsPage } from "./pages/rankings.js";
import { renderStandingsPage } from "./pages/standings.js";
import { renderLeaguesPage } from "./pages/leagues.js";
import { renderTeamsPage } from "./pages/teams.js";
import { renderMatchDetailPage } from "./pages/match-detail.js";
import { renderTeamProfilePage } from "./pages/team-profile.js";
import { renderPlayerProfilePage } from "./pages/player-profile.js";
import { renderFollowingPage } from "./pages/following.js";
import { renderSearchPage } from "./pages/search.js";
import { renderAdminPage } from "./pages/admin.js";

const pageRenderers = {
  home: renderHomePage,
  following: renderFollowingPage,
  search: renderSearchPage,
  matches: renderMatchesPage,
  standings: renderLeaguesPage,
  league: renderStandingsPage,
  teams: renderTeamsPage,
  players: renderPlayersPage,
  rankings: renderRankingsPage,
  match: renderMatchDetailPage,
  team: renderTeamProfilePage,
  player: renderPlayerProfilePage,
  admin: renderAdminPage,
};

const main = document.querySelector("#main-content");
const navigation = document.querySelector("#bottom-navigation");
let hasRendered = false;
let playerDataPromise = null;
const PLAYER_DATA_VIEWS = new Set(["players", "rankings", "player", "match", "team", "search", "following"]);

function requiresPlayerData(state) {
  if (!PLAYER_DATA_VIEWS.has(state.currentView)) return false;
  if (state.currentView !== "match") return true;
  return state.matches.find((match) => match.id === state.currentMatchId)?.status === "finished";
}

function render(state, previousState = {}) {
  if (state.dataStatus === "loading") {
    main.replaceChildren(renderLoadingState());
  } else if (state.dataStatus === "error") {
    main.replaceChildren(renderErrorState(state.dataError));
  } else if (requiresPlayerData(state) && !state.playerStatistics) {
    main.replaceChildren(renderLoadingState());
  } else {
    const renderPage = pageRenderers[state.currentView] ?? pageRenderers.home;
    main.replaceChildren(renderPage(state));
  }
  renderBottomNavigation(navigation, state.currentView);
  document.title = `${routes[state.currentView]?.title ?? "ホーム"} | Chugoku Football Data`;

  if (hasRendered && previousState.currentView !== state.currentView) {
    window.scrollTo({ top: 0, behavior: "auto" });
    main.focus({ preventScroll: true });
  }

  hasRendered = true;
  if (state.dataStatus === "ready" && requiresPlayerData(state) && !state.playerStatistics) {
    ensurePlayerData();
  }
}

document.documentElement.dataset.theme = "dark";
subscribe(render);
initializeRouter();
setState({ favoriteTeamIds: loadFavoriteTeamIds(), favoritePlayerIds: loadFavoritePlayerIds() });

Promise.all([loadMatches(), loadTeams(), loadTeamCatalog(), loadLeagueStats(), loadHeadToHead()])
  .then(([{ matches, metadata, competitionMetadata, competitionDefinitions, availableSeasons, defaultSeason }, { teams }, teamCatalog, leagueStats, headToHead]) => {
    const routedState = getState();
    const profilesById = new Map(teams.map((team) => [team.id, team]));
    const leagueTeams = teamCatalog.map((team) => ({ ...team, ...(profilesById.get(team.id) ?? {}) }));
    const teamDirectory = createTeamDirectory(leagueTeams);
    const linkedMatches = linkMatchesToTeams(matches, teamDirectory);
    setState({
      dataStatus: "ready",
      dataError: null,
      matches: linkedMatches,
      metadata,
      competitionMetadata,
      competitionDefinitions,
      availableSeasons,
      selectedSeason: availableSeasons.includes(routedState.selectedSeason) ? routedState.selectedSeason : defaultSeason,
      teams,
      leagueTeams,
      teamDirectory,
      teamStats: leagueStats?.[defaultSeason]?.[1] ?? null,
      leagueStats,
      headToHead,
    });
  })
  .catch((error) => {
    setState({
      dataStatus: "error",
      dataError: error.message,
      matches: [],
      metadata: null,
      competitionMetadata: null,
      competitionDefinitions: [],
      availableSeasons: [],
      teams: [],
      leagueTeams: [],
      players: [],
      teamDirectory: null,
      playerDirectory: null,
      playerStatistics: null,
      teamStats: null,
      leagueStats: null,
      headToHead: null,
    });
  });

function ensurePlayerData() {
  playerDataPromise ??= loadPlayers()
    .then(({ players }) => {
      const state = getState();
      const playerDirectory = createPlayerDirectory(players);
      setState({
        players,
        playerDirectory,
        playerStatistics: calculatePlayerStatistics(
          players,
          state.matches.filter((match) => match.season === 2026),
          state.teamDirectory,
        ),
      });
    })
    .catch((error) => {
      setState({ dataStatus: "error", dataError: error.message });
    });
  return playerDataPromise;
}

if (!main.firstElementChild?.matches(".page")) {
  render(getState());
}
