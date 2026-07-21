import {
  createNotice,
  createPageHeader,
  createPanel,
  createTeamEmblem,
  element,
} from "../ui/elements.js";
import { createSeasonPeriodTabs } from "../ui/season-period.js";
import { createSeasonSelect } from "../ui/season-select.js";
import { setState } from "../state.js";
import {
  filterMatchesByPeriod,
  formatUpdatedAt,
  groupMatchesByRound,
  positionMatchTimeline,
  sortMatchesChronologically,
} from "../utils/football.js";
import { getTeam } from "../utils/teams.js";
import {
  createMatchRoundGroup,
  createTeamNameLink,
} from "./shared.js";

const MODES = [
  ["overall", "通算順位", "standings"],
  ["home", "ホーム順位", "homeStandings"],
  ["away", "アウェイ順位", "awayStandings"],
];

const LEAGUE_TABS = [
  ["standings", "順位表"],
  ["matches", "試合"],
  ["seasons", "シーズン"],
];

export function renderStandingsPage({
  matches,
  competitionMetadata,
  teamDirectory,
  leagueStats,
  leagueDivision,
  seasonPeriod,
  selectedSeason,
  availableSeasons,
  competitionDefinitions = [],
  selectedCompetitionId = null,
}) {
  const seasonCompetitions = competitionDefinitions.filter((entry) =>
    entry.season === selectedSeason && entry.teamStats,
  );
  const activeCompetition = seasonCompetitions.find((entry) => entry.id === selectedCompetitionId)
    ?? seasonCompetitions.find((entry) => entry.stage === "regular" && entry.division === leagueDivision)
    ?? seasonCompetitions[0];
  const competitionId = activeCompetition?.id;
  const activeStats = leagueStats?.[selectedSeason]?.byCompetition?.[competitionId]
    ?? leagueStats?.[selectedSeason]?.[leagueDivision];
  const metadata = competitionMetadata?.[selectedSeason]?.[leagueDivision];
  const periodData = activeStats?.periods?.[seasonPeriod];
  const periodRules = activeStats?.periodRules?.[seasonPeriod];

  const reflectedMatches = matches.filter((match) =>
    match.season === selectedSeason
    && match.competitionId === competitionId
    && match.status === "finished"
    && (
      seasonPeriod === "all"
      || (
        Number(match.round) >= periodRules.fromRound
        && Number(match.round) <= periodRules.toRound
      )
    )
  );

  let activeMode = "overall";
  let activeLeagueTab = "standings";

  const modeTabs = element("div", {
    className: "chip-row standing-mode-tabs",
    attributes: {
      role: "tablist",
      "aria-label": "順位表区分",
    },
  });

  const standingsContent = element("div");

  const renderTable = () => {
    const [, label, key] = MODES.find(([mode]) => mode === activeMode);
    const standings = periodData?.[key] ?? [];

    for (const tab of modeTabs.children) {
      const selected = tab.dataset.standingMode === activeMode;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
    }

    standingsContent.replaceChildren(
      createPanel(
        `${activeCompetition?.name ?? metadata?.competitionName ?? `中国大学サッカーリーグ${leagueDivision}部`} ${label}`,
        element(
          "div",
          { className: "table-scroll" },
          createStandingTable(standings, teamDirectory, activeMode),
        ),
        `${reflectedMatches.length}試合反映`,
      ),
    );
  };

  modeTabs.append(
    ...MODES.map(([mode, label]) => {
      const button = element("button", {
        className: "filter-chip",
        text: label,
        attributes: {
          type: "button",
          role: "tab",
          "data-standing-mode": mode,
        },
      });

      button.addEventListener("click", () => {
        activeMode = mode;
        renderTable();
      });

      return button;
    }),
  );

  renderTable();

  const standingsSection = element("div", { className: "league-detail-section" }, [
    createSeasonSelect(selectedSeason, availableSeasons),
    createSeasonPeriodTabs(seasonPeriod),
    modeTabs,
    element("div", { className: "section-stack" }, [
      standingsContent,
      createPanel(
        "参加チーム",
        element("div", { className: "detail-list" }, (activeCompetition?.teamIds ?? []).map((teamId) => {
          const team = getTeam(teamDirectory, teamId);
          return element("div", { className: "detail-row" }, [
            createTeamNameLink(team, team?.name ?? teamId),
          ]);
        })),
        `${activeCompetition?.teamIds?.length ?? 0}チーム`,
      ),
      createNotice(
        `順位決定順: 勝点、得失点差、総得点。変動は直近2節の順位比較です。${formatUpdatedAt(metadata?.updatedAt)}`,
      ),
    ]),
  ]);

  const leagueMatches = matches.filter((match) =>
    match.season === selectedSeason
    && match.competitionId === competitionId
  );

  const matchStatuses = new Set(["finished", "scheduled"]);
  const matchList = element("div", {
    className: "match-list match-list--timeline",
  });
  const matchCount = element("span", { text: "0試合" });
  let displayedLeagueMatches = [];

  const renderMatchList = () => {
    const filteredMatches = sortMatchesChronologically(
      filterMatchesByPeriod(leagueMatches, seasonPeriod)
        .filter((match) => {
          const statusKey = match.status === "finished"
            ? "finished"
            : "scheduled";

          return matchStatuses.has(statusKey);
        }),
    );

    displayedLeagueMatches = filteredMatches;

    const roundGroups = groupMatchesByRound(filteredMatches);

    matchList.replaceChildren(
      ...(roundGroups.length
        ? roundGroups.map((group) =>
            createMatchRoundGroup(group.matches, teamDirectory))
        : [createNotice("条件に一致する試合はありません。")]),
    );

    matchList.dataset.matchCount = String(filteredMatches.length);
    matchCount.textContent = `${filteredMatches.length}試合`;

    if (matchList.isConnected) {
      positionMatchTimeline(
        matchList,
        displayedLeagueMatches,
      );
    }
  };

  const finishedButton = createLeagueMatchToggle({
    label: "終了",
    key: "finished",
    values: matchStatuses,
    onChange: renderMatchList,
  });

  const scheduledButton = createLeagueMatchToggle({
    label: "未開催",
    key: "scheduled",
    values: matchStatuses,
    onChange: renderMatchList,
  });

  renderMatchList();

  const matchesSection = element("div", {
    className: "league-detail-section",
  }, [
    createSeasonSelect(selectedSeason, availableSeasons),
    createSeasonPeriodTabs(seasonPeriod),
    element("div", {
      className: "chip-row",
      attributes: { "aria-label": "試合の開催状況" },
    }, [
      finishedButton,
      scheduledButton,
    ]),
    element("div", { className: "section-stack" }, [
      createPanel(
        activeCompetition?.name ?? `${selectedSeason}年度 中国大学サッカーリーグ${leagueDivision}部`,
        matchList,
        matchCount,
      ),
      createNotice("終了した試合と未開催の試合を切り替えられます。"),
    ]),
  ]);

  const seasonsSection = element("div", {
    className: "league-detail-section",
  }, [
    createNotice("過去シーズンの優勝・準優勝は次の作業で追加します。"),
  ]);

  const leagueContent = element("div");
  const leagueTabs = element("div", {
    className: "league-detail-tabs",
    attributes: {
      role: "tablist",
      "aria-label": "リーグ詳細",
    },
  });

  const renderLeagueTab = () => {
    for (const tab of leagueTabs.children) {
      const selected = tab.dataset.leagueTab === activeLeagueTab;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
    }

    if (activeLeagueTab === "matches") {
      leagueContent.replaceChildren(matchesSection);

      return;
    }

    if (activeLeagueTab === "seasons") {
      leagueContent.replaceChildren(seasonsSection);
      return;
    }

    leagueContent.replaceChildren(standingsSection);
  };

  leagueTabs.append(
    ...LEAGUE_TABS.map(([tabId, label]) => {
      const button = element("button", {
        className: "league-detail-tab",
        text: label,
        attributes: {
          type: "button",
          role: "tab",
          "data-league-tab": tabId,
        },
      });

      button.addEventListener("click", () => {
        activeLeagueTab = tabId;
        renderLeagueTab();
      });

      return button;
    }),
  );

  renderLeagueTab();

  const leagueName =
    activeCompetition?.name
    ?? metadata?.competitionName
    ?? `中国大学サッカーリーグ${leagueDivision}部`;

  const divisionTabs = element("div", {
    className: "league-division-tabs",
    attributes: { role: "tablist", "aria-label": "リーグ区分" },
  }, seasonCompetitions.map((competition) => {
    const selected = competition.id === competitionId;
    const button = element("button", {
      className: `league-division-tab${selected ? " is-active" : ""}`,
      text: competition.competitionType === "i-league" ? `I ${competition.division}部` : `${competition.division}部`,
      attributes: {
        type: "button",
        role: "tab",
        "aria-selected": String(selected),
      },
    });
    button.addEventListener("click", () => setState({
      leagueDivision: competition.division,
      selectedCompetitionId: competition.id,
    }));
    return button;
  }));

  return element(
    "article",
    {
      className: "page",
      attributes: {
        "data-page": "league",
        "data-league-division": String(leagueDivision),
      },
    },
    [
      createPageHeader({
        eyebrow: "League",
        title: leagueName,
        description: "順位表、試合、過去シーズンの情報を確認できます。",
        badge: String(selectedSeason),
      }),
      divisionTabs,
      leagueTabs,
      leagueContent,
    ],
  );
}


function createLeagueMatchToggle({
  label,
  key,
  values,
  onChange,
}) {
  const button = element("button", {
    className: "filter-chip is-active",
    text: label,
    attributes: {
      type: "button",
      "aria-pressed": "true",
      "data-filter-value": key,
    },
  });

  button.addEventListener("click", () => {
    if (values.has(key)) {
      values.delete(key);
    } else {
      values.add(key);
    }

    const active = values.has(key);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    onChange();
  });

  return button;
}

function createStandingTable(standings, teamDirectory, mode) {
  const table = element("table", {
    className: "standing-table",
    attributes: {
      "data-standing-count": String(standings.length),
      "data-standing-mode": mode,
    },
  });

  table.append(
    element("thead", {}, [
      element(
        "tr",
        {},
        ["#", "変動", "チーム", "試", "勝", "分", "負", "+/-", "差", "勝率", "点"]
          .map((label) => element("th", { text: label })),
      ),
    ]),
    element(
      "tbody",
      {},
      standings.map((row) => {
        const team = getTeam(teamDirectory, row.teamId);

        return element("tr", {
          attributes: {
            "data-standing-team": team?.name ?? row.teamId,
          },
        }, [
          element("td", {
            className: "rank-number",
            text: row.rank ? String(row.rank) : "–",
          }),
          element("td", {
            className: `rank-change rank-change--${movementKey(row.rankChange)}`,
            text: mode === "overall" ? movementLabel(row.rankChange) : "–",
          }),
          element("td", {}, [
            element("div", { className: "standing-team" }, [
              createTeamEmblem(team, "team-emblem team-emblem--standing"),
              createTeamNameLink(team, row.teamId),
            ]),
          ]),
          element("td", { text: String(row.played) }),
          element("td", { text: String(row.won) }),
          element("td", { text: String(row.drawn) }),
          element("td", { text: String(row.lost) }),
          element("td", {
            className: "goals-for-against",
            text: `${row.goalsFor ?? 0}-${row.goalsAgainst ?? 0}`,
          }),
          element("td", {
            className: "goal-difference",
            text: signed(row.goalDifference),
          }),
          element("td", {
            className: "win-rate",
            text: row.played ? `${Math.round((row.won / row.played) * 100)}%` : "–",
          }),
          element("td", {
            className: "points",
            text: String(row.points),
          }),
        ]);
      }),
    ),
  );

  return table;
}

function movementLabel(value) {
  if (value > 0) return `↑${value}`;
  if (value < 0) return `↓${Math.abs(value)}`;
  if (value === 0) return "→";
  return "–";
}

function movementKey(value) {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "same";
}

function signed(value) {
  return `${value > 0 ? "+" : ""}${value}`;
}
