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
    teamId: view === "team" ? url.searchParams.get("id") : null,
    playerId: view === "player" ? url.searchParams.get("id") : null,
  };
}

export function routeHref(view, { matchId = null, teamId = null, playerId = null } = {}) {
  const url = new URL(window.location.href);
  url.search = "";

  if (view !== "home") {
    url.searchParams.set("view", view);
  }

  if (view === "match" && matchId) {
    url.searchParams.set("id", matchId);
  }

  if (view === "team" && teamId) {
    url.searchParams.set("id", teamId);
  }

  if (view === "player" && playerId) {
    url.searchParams.set("id", playerId);
  }

  return `${url.pathname}${url.search}`;
}

export function navigate(view, { replace = false, matchId = null, teamId = null, playerId = null } = {}) {
  const nextView = Object.hasOwn(routes, view) ? view : "home";
  const method = replace ? "replaceState" : "pushState";
  window.history[method](
    { view: nextView, matchId, teamId, playerId },
    "",
    routeHref(nextView, { matchId, teamId, playerId }),
  );
  setState({
    currentView: nextView,
    currentMatchId: nextView === "match" ? matchId : null,
    currentTeamId: nextView === "team" ? teamId : null,
    currentPlayerId: nextView === "player" ? playerId : null,
  });
}

export function initializeRouter() {
  const initialRoute = readRouteFromUrl();
  navigate(initialRoute.view, {
    replace: true,
    matchId: initialRoute.matchId,
    teamId: initialRoute.teamId,
    playerId: initialRoute.playerId,
  });

  window.addEventListener("popstate", () => {
    const route = readRouteFromUrl();
    setState({
      currentView: route.view,
      currentMatchId: route.matchId,
      currentTeamId: route.teamId,
      currentPlayerId: route.playerId,
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
      teamId: routeLink.dataset.teamId ?? null,
      playerId: routeLink.dataset.playerId ?? null,
    });
  });
}
