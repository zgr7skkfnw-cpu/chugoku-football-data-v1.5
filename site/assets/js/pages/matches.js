import { createNotice, createPageHeader, createPanel, element } from "../ui/elements.js";
import { createSeasonPeriodTabs } from "../ui/season-period.js";
import {
  filterMatchesByPeriod,
  groupMatchesByRound,
  positionMatchTimeline,
  sortMatchesChronologically,
} from "../utils/football.js";
import { createMatchRoundGroup } from "./shared.js";
import { createSeasonSelect } from "../ui/season-select.js";

export function renderMatchesPage({ matches, teamDirectory, leagueTeams, seasonPeriod, selectedSeason, availableSeasons, leagueDivision, competitionDefinitions }) {
  const seasonMatches = matches.filter((match) => match.season === selectedSeason);
  const competitionOptions = createCompetitionOptions(
    seasonMatches,
    competitionDefinitions.filter((competition) => competition.season === selectedSeason),
  );
  let competitionId = competitionOptions.find((option) => option.division === leagueDivision && option.stageId === "regular")?.id
    ?? competitionOptions[0]?.id
    ?? "";
  const statuses = new Set(["finished", "scheduled"]);
  const sides = new Set(["home", "away"]);
  let teamId = "";
  let query = "";
  const list = element("div", {
    className: "match-list match-list--timeline",
  });
  const count = element("span", { text: "0試合" });
  const previousRoundButton = element("button", {
    className: "match-round-nav__button",
    text: "‹ 前の節",
    attributes: { type: "button" },
  });
  const nextRoundButton = element("button", {
    className: "match-round-nav__button",
    text: "次の節 ›",
    attributes: { type: "button" },
  });
  const currentRoundLabel = element("strong", {
    className: "match-round-nav__current",
    text: "節を選択",
    attributes: { "aria-live": "polite" },
  });
  const roundNavigation = element("nav", {
    className: "match-round-nav",
    attributes: { "aria-label": "節の移動" },
  }, [previousRoundButton, currentRoundLabel, nextRoundButton]);
  let visibleRoundIndex = 0;
  let visibleRoundGroups = [];

  function moveToRound(index) {
    if (!visibleRoundGroups.length) return;
    visibleRoundIndex = Math.max(0, Math.min(index, visibleRoundGroups.length - 1));
    const group = visibleRoundGroups[visibleRoundIndex];
    const target = list.querySelector(`[data-match-round="${group.roundKey}"]`);
    if (target) list.scrollTo({ top: target.offsetTop, behavior: "smooth" });
    currentRoundLabel.textContent = group.matches[0]?.roundLabel ?? `第${group.roundKey}節`;
    previousRoundButton.disabled = visibleRoundIndex === 0;
    nextRoundButton.disabled = visibleRoundIndex === visibleRoundGroups.length - 1;
  }

  previousRoundButton.addEventListener("click", () => moveToRound(visibleRoundIndex - 1));
  nextRoundButton.addEventListener("click", () => moveToRound(visibleRoundIndex + 1));

  const competitionSelect = element("select", {
    className: "filter-select match-filter__competition",
    attributes: { "aria-label": "大会を選択" },
  }, competitionOptions.map((option) => element("option", {
    text: option.label,
    attributes: { value: option.id, ...(option.id === competitionId ? { selected: "selected" } : {}) },
  })));

  const teamSelect = element("select", {
    className: "filter-select match-filter__team",
    attributes: { "aria-label": "チーム別フィルター" },
  });

  function updateTeamOptions() {
    const competitionMatches = seasonMatches.filter((match) => match.competitionId === competitionId);
    const participantIds = new Set(competitionMatches.flatMap((match) => [match.homeTeam.teamId, match.awayTeam.teamId]));
    const seasonTeams = leagueTeams.filter((team) => participantIds.has(team.id));
    teamSelect.replaceChildren(
      element("option", { text: "全チーム", attributes: { value: "" } }),
      ...seasonTeams.map((team) => element("option", { text: team.name, attributes: { value: team.id } })),
    );
    teamId = "";
  }

  updateTeamOptions();
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
  competitionSelect.addEventListener("change", () => {
    competitionId = competitionSelect.value;
    updateTeamOptions();
    renderList();
  });
  searchInput.addEventListener("input", () => {
    query = normalizeSearch(searchInput.value);
    renderList();
  });

  function renderList() {
    const filtered = sortMatchesChronologically(
      filterMatchesByPeriod(seasonMatches, seasonPeriod)
        .filter((match) => match.competitionId === competitionId)
        .filter((match) => {
          const statusKey = match.status === "finished"
            ? "finished"
            : "scheduled";

          if (!statuses.has(statusKey)) {
            return false;
          }

          const searchable = normalizeSearch([
            match.homeTeam.name,
            match.awayTeam.name,
            match.venue,
            match.kickoffAt,
            `第${match.round}節`,
          ].filter(Boolean).join(" "));

          if (query && !searchable.includes(query)) {
            return false;
          }

          if (!teamId) {
            return true;
          }

          if (match.homeTeam.teamId === teamId) {
            return sides.has("home");
          }

          if (match.awayTeam.teamId === teamId) {
            return sides.has("away");
          }

          return false;
        }),
    );

    const roundGroups = groupMatchesByRound(filtered);
    visibleRoundGroups = roundGroups;

    const selectedCompetition = competitionOptions.find((option) => option.id === competitionId);
    const emptyMessage = selectedCompetition?.hasData
      ? "条件に一致する試合はありません。"
      : "試合データはまだありません。";
    list.replaceChildren(...(roundGroups.length
      ? roundGroups.map((group) => createMatchRoundGroup(group.matches, teamDirectory))
      : [createNotice(emptyMessage)]));

    list.dataset.matchCount = String(filtered.length);
    count.textContent = `${filtered.length}試合`;

    positionMatchTimeline(list, filtered);
    visibleRoundIndex = findInitialRoundIndex(roundGroups);
    if (roundGroups.length) {
      const activeGroup = roundGroups[visibleRoundIndex];
      currentRoundLabel.textContent = activeGroup.matches[0]?.roundLabel ?? `第${activeGroup.roundKey}節`;
    } else {
      currentRoundLabel.textContent = "該当なし";
    }
    previousRoundButton.disabled = visibleRoundIndex <= 0;
    nextRoundButton.disabled = !roundGroups.length || visibleRoundIndex >= roundGroups.length - 1;
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
      competitionSelect,
      searchInput,
      element("div", { className: "chip-row", attributes: { "aria-label": "開催状況" } }, statusButtons),
      teamSelect,
      element("div", { className: "chip-row", attributes: { "aria-label": "ホーム・アウェイ" } }, sideButtons),
    ]),
    element("div", { className: "section-stack" }, [
      createPanel(`${selectedSeason}年度 中国大学サッカーリーグ`, element("div", {}, [roundNavigation, list]), count),
      createNotice("複数の条件を同時に選択できます。"),
    ]),
  ]);
}

function createCompetitionOptions(matches, definitions) {
  const options = new Map();
  for (const competition of definitions) {
    options.set(competition.id, {
      id: competition.id,
      division: competition.division,
      stageId: competition.stage,
      label: competition.stage === "regular"
        ? `${competition.division}部`
        : competition.stageName ?? competition.name,
      hasData: Boolean(competition.matches) && !["not-published", "not-held"].includes(competition.dataStatus),
    });
  }
  for (const match of matches) {
    if (options.has(match.competitionId)) {
      options.get(match.competitionId).hasData = true;
      continue;
    }
    const label = match.stageId === "regular"
      ? `${match.division}部`
      : match.stageName ?? match.leagueName ?? "その他大会";
    options.set(match.competitionId, {
      id: match.competitionId,
      division: match.division,
      stageId: match.stageId,
      label,
      hasData: true,
    });
  }
  return [...options.values()];
}

function findInitialRoundIndex(roundGroups) {
  const nowTime = Date.now();
  const upcomingIndex = roundGroups.findIndex((group) => group.matches.some((match) => {
    const kickoffTime = new Date(match.kickoffAt).getTime();
    return match.status !== "finished" && Number.isFinite(kickoffTime) && kickoffTime >= nowTime;
  }));
  if (upcomingIndex >= 0) return upcomingIndex;

  const unfinishedIndex = roundGroups.findIndex((group) =>
    group.matches.some((match) => match.status !== "finished"));
  return unfinishedIndex >= 0 ? unfinishedIndex : Math.max(0, roundGroups.length - 1);
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
