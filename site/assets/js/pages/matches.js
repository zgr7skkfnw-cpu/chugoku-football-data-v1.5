import { createNotice, createPageHeader, createPanel, element } from "../ui/elements.js";
import { createSeasonPeriodTabs } from "../ui/season-period.js";
import { filterMatchesByPeriod, sortMatchesNewestFirst } from "../utils/football.js";
import { createMatchRow } from "./shared.js";
import { createSeasonSelect } from "../ui/season-select.js";

export function renderMatchesPage({ matches, teamDirectory, leagueTeams, seasonPeriod, selectedSeason, availableSeasons }) {
  const seasonMatches = matches.filter((match) => match.season === selectedSeason);
  const participantIds = new Set(seasonMatches.flatMap((match) => [match.homeTeam.teamId, match.awayTeam.teamId]));
  const seasonTeams = leagueTeams.filter((team) => participantIds.has(team.id));
  const statuses = new Set(["finished", "scheduled"]);
  const sides = new Set(["home", "away"]);
  let teamId = "";
  let query = "";
  const list = element("div", { className: "match-list" });
  const count = element("span", { text: "0試合" });

  const teamSelect = element("select", {
    className: "filter-select match-filter__team",
    attributes: { "aria-label": "チーム別フィルター" },
  }, [
    element("option", { text: "全チーム", attributes: { value: "" } }),
    ...seasonTeams.map((team) => element("option", { text: team.name, attributes: { value: team.id } })),
  ]);
  const searchInput = element("input", {
    className: "search-input match-filter__search",
    attributes: { type: "search", placeholder: "チーム・会場・日付を検索", "aria-label": "試合検索" },
  });

  const statusButtons = [
    createToggle("終了", "finished", statuses, renderList),
    createToggle("未開催", "scheduled", statuses, renderList),
  ];
  const sideButtons = [
    createToggle("ホームゲーム", "home", sides, renderList),
    createToggle("アウェイゲーム", "away", sides, renderList),
  ];
  teamSelect.addEventListener("change", () => {
    teamId = teamSelect.value;
    renderList();
  });
  searchInput.addEventListener("input", () => {
    query = normalizeSearch(searchInput.value);
    renderList();
  });

  function renderList() {
    const filtered = sortMatchesNewestFirst(filterMatchesByPeriod(seasonMatches, seasonPeriod)).filter((match) => {
      const statusKey = match.status === "finished" ? "finished" : "scheduled";
      if (!statuses.has(statusKey)) return false;
      const searchable = normalizeSearch([
        match.homeTeam.name,
        match.awayTeam.name,
        match.venue,
        match.kickoffAt,
        `第${match.round}節`,
      ].filter(Boolean).join(" "));
      if (query && !searchable.includes(query)) return false;
      if (!teamId) return true;
      if (match.homeTeam.teamId === teamId) return sides.has("home");
      if (match.awayTeam.teamId === teamId) return sides.has("away");
      return false;
    });
    list.replaceChildren(
      ...(filtered.length
        ? filtered.map((match) => createMatchRow(match, teamDirectory))
        : [createNotice("条件に一致する試合はありません。")]),
    );
    list.dataset.matchCount = String(filtered.length);
    count.textContent = `${filtered.length}試合`;
  }

  renderList();

  return element("article", { className: "page", attributes: { "data-page": "matches" } }, [
    createPageHeader({
      eyebrow: "Fixtures & Results",
      title: "試合",
      description: "期間、開催状況、チーム、ホーム・アウェイを組み合わせて絞り込めます。",
    }),
    createSeasonSelect(selectedSeason, availableSeasons),
    createSeasonPeriodTabs(seasonPeriod),
    element("div", { className: "match-filter-panel" }, [
      searchInput,
      element("div", { className: "chip-row", attributes: { "aria-label": "開催状況" } }, statusButtons),
      teamSelect,
      element("div", { className: "chip-row", attributes: { "aria-label": "ホーム・アウェイ" } }, sideButtons),
    ]),
    element("div", { className: "section-stack" }, [
      createPanel(`${selectedSeason}年度 中国大学サッカーリーグ`, list, count),
      createNotice("複数の条件を同時に選択できます。"),
    ]),
  ]);
}

function normalizeSearch(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("ja").replace(/[\s　]+/g, "");
}

function createToggle(label, key, values, onChange) {
  const button = element("button", {
    className: "filter-chip is-active",
    text: label,
    attributes: { type: "button", "aria-pressed": "true", "data-filter-value": key },
  });
  button.addEventListener("click", () => {
    if (values.has(key)) values.delete(key);
    else values.add(key);
    const active = values.has(key);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    onChange();
  });
  return button;
}
