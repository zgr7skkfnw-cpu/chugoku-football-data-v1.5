import { routeHref, routes } from "../router.js";
import { createIcon } from "./icons.js";
import { element } from "./elements.js";

const icons = {
  home: "matches",
  standings: "standings",
  following: "following",
  search: "search",
};

const navigationViews = ["home", "standings", "following", "search"];

export function renderBottomNavigation(container, currentView) {
  const activeView = currentView === "match" || currentView === "matches"
    ? "home"
    : currentView === "team" || currentView === "player"
      ? "search"
      : currentView === "teams" || currentView === "players" || currentView === "rankings"
        ? "standings"
        : currentView;
  const items = navigationViews.map((view) => {
    const route = routes[view];
    const active = view === activeView;
    const link = element(
      "a",
      {
        className: `nav-item${active ? " is-active" : ""}`,
        attributes: {
          href: routeHref(view),
          "data-route": view,
          ...(active ? { "aria-current": "page" } : {}),
        },
      },
      [createIcon(icons[view]), element("span", { text: route.label })],
    );

    return link;
  });

  container.replaceChildren(...items);
}
