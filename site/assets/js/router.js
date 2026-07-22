import { setState } from "./state.js";

export const routes = Object.freeze({
  home: { label: "試合", title: "試合" },
  following: { label: "フォロー中", title: "フォロー中" },
  search: { label: "検索", title: "検索" },
  matches: { label: "試合", title: "試合" },
  standings: { label: "リーグ", title: "リーグ" },
  league: { title: "中国大学サッカーリーグ" },
  teams: { label: "チーム", title: "チーム" },
  players: { label: "選手", title: "選手" },
  rankings: { label: "ランク", title: "ランキング" },
  match: { title: "試合詳細" },
  team: { title: "チーム詳細" },
  player: { title: "選手詳細" },
  admin: { title: "試合データ補正" },
});

function readRouteFromUrl() {
  const url = new URL(window.location.href);
  const requestedView = url.searchParams.get("view") ?? "home";
  const view = Object.hasOwn(routes, requestedView) ? requestedView : "home";
  return {
    view,
    matchId: view === "match" ? url.searchParams.get("id") : null,
    matchTab: view === "match" ? normalizeMatchTab(url.searchParams.get("tab")) : "preview",
    teamId: view === "team" ? url.searchParams.get("id") : null,
    playerId: view === "player" ? url.searchParams.get("id") : null,
    competitionId: url.searchParams.get("competition") || null,
    season: Number.parseInt(url.searchParams.get("season"), 10) || null,
    date: /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("date") ?? "") ? url.searchParams.get("date") : null,
  };
}

export function routeHref(view, { matchId = null, matchTab = null, teamId = null, playerId = null, competitionId = null, season = null, date = null } = {}) {
  const url = new URL(window.location.href);
  url.search = "";

  if (view !== "home") {
    url.searchParams.set("view", view);
  }

  if (view === "match" && matchId) {
    url.searchParams.set("id", matchId);
    if (matchTab && matchTab !== "preview") url.searchParams.set("tab", normalizeMatchTab(matchTab));
  }

  if (view === "team" && teamId) {
    url.searchParams.set("id", teamId);
  }

  if (view === "player" && playerId) {
    url.searchParams.set("id", playerId);
  }
  if (competitionId) url.searchParams.set("competition", competitionId);
  if (season) url.searchParams.set("season", String(season));
  if (view === "home" && date) url.searchParams.set("date", date);

  return `${url.pathname}${url.search}`;
}

export function navigate(view, { replace = false, matchId = null, matchTab = null, teamId = null, playerId = null, competitionId = null, season = null, date = null } = {}) {
  const nextView = Object.hasOwn(routes, view) ? view : "home";
  const method = replace ? "replaceState" : "pushState";
  window.history[method](
    { view: nextView, matchId, matchTab, teamId, playerId, competitionId, season },
    "",
    routeHref(nextView, { matchId, matchTab, teamId, playerId, competitionId, season, date }),
  );
  setState({
    currentView: nextView,
    currentMatchId: nextView === "match" ? matchId : null,
    selectedMatchTab: nextView === "match" ? normalizeMatchTab(matchTab) : "preview",
    currentTeamId: nextView === "team" ? teamId : null,
    currentPlayerId: nextView === "player" ? playerId : null,
    ...(competitionId ? { selectedCompetitionId: competitionId } : {}),
    ...(season ? { selectedSeason: season } : {}),
    ...(nextView === "home" ? { selectedDate: date } : {}),
  });
}

export function initializeRouter() {
  const initialRoute = readRouteFromUrl();
  navigate(initialRoute.view, {
    replace: true,
    matchId: initialRoute.matchId,
    matchTab: initialRoute.matchTab,
    teamId: initialRoute.teamId,
    playerId: initialRoute.playerId,
    competitionId: initialRoute.competitionId,
    season: initialRoute.season,
    date: initialRoute.date,
  });

  window.addEventListener("popstate", () => {
    const route = readRouteFromUrl();
    setState({
      currentView: route.view,
      currentMatchId: route.matchId,
      selectedMatchTab: route.matchTab,
      currentTeamId: route.teamId,
      currentPlayerId: route.playerId,
      ...(route.competitionId ? { selectedCompetitionId: route.competitionId } : {}),
      ...(route.season ? { selectedSeason: route.season } : {}),
      ...(route.view === "home" ? { selectedDate: route.date } : {}),
    });
  });

  document.addEventListener("click", (event) => {
    const routeLink = event.target.closest("[data-route]");

    if (!routeLink || event.defaultPrevented || event.button !== 0) {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();
    navigate(routeLink.dataset.route, {
      matchId: routeLink.dataset.matchId ?? null,
      matchTab: routeLink.dataset.matchTab ?? null,
      teamId: routeLink.dataset.teamId ?? null,
      playerId: routeLink.dataset.playerId ?? null,
      competitionId: routeLink.dataset.competitionId ?? null,
      season: Number.parseInt(routeLink.dataset.season, 10) || null,
    });
  });
}

function normalizeMatchTab(value) {
  return ["preview", "suspensions", "standings", "head-to-head"].includes(value) ? value : "preview";
}
