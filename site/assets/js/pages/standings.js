import {
  createNotice,
  createPageHeader,
  createPanel,
  createTeamEmblem,
  element,
} from "../ui/elements.js";
import { createSeasonPeriodTabs } from "../ui/season-period.js";
import { createSeasonSelect } from "../ui/season-select.js";
import { navigate } from "../router.js";
import { enableHorizontalSwipe } from "../ui/swipe.js";
import { createUnifiedStandingTable } from "../ui/standing-table.js";
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
  const eligibleCompetitions = competitionDefinitions.filter((entry) =>
    entry.season === selectedSeason
    && entry.matches
    && (entry.teamStats || ["not-published", "not-held"].includes(entry.dataStatus) || ["tournament", "rookie-tournament", "playoff", "promotion-relegation", "i-league-playoff"].includes(entry.competitionType)),
  );
  const requestedGroup = competitionGroupFromId(selectedCompetitionId);
  const requestedDivision = selectedCompetitionId?.includes("division-2") ? 2
    : selectedCompetitionId?.includes("division-1") ? 1
      : null;
  const activeCompetition = eligibleCompetitions.find((entry) => entry.id === selectedCompetitionId)
    ?? eligibleCompetitions.find((entry) => competitionGroup(entry) === requestedGroup && (requestedDivision == null || entry.division === requestedDivision))
    ?? eligibleCompetitions.find((entry) => entry.stage === "regular" && entry.division === leagueDivision)
    ?? eligibleCompetitions[0];
  const activeGroup = competitionGroup(activeCompetition);
  const seasonCompetitions = eligibleCompetitions.filter((entry) => competitionGroup(entry) === activeGroup);
  const competitionId = activeCompetition?.id;
  const isTournament = ["tournament", "rookie-tournament", "playoff", "promotion-relegation", "i-league-playoff"].includes(activeCompetition?.competitionType);
  const isNotPublished = ["not-published", "not-held"].includes(activeCompetition?.dataStatus);
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
  let activeLeagueTab = isTournament ? "matches" : "standings";

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
          { className: "table-scroll unified-standing-scroll" },
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
  let teamFilter = "";
  let timelinePositioned = false;

  const renderMatchList = () => {
    const filteredMatches = sortMatchesChronologically(
      filterMatchesByPeriod(leagueMatches, seasonPeriod)
        .filter((match) => {
          const statusKey = match.status === "finished"
            ? "finished"
            : "scheduled";

          return matchStatuses.has(statusKey)
            && (!teamFilter || match.homeTeam.teamId === teamFilter || match.awayTeam.teamId === teamFilter);
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

    if (matchList.isConnected && !timelinePositioned) {
      timelinePositioned = true;
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

  const teamSelect = element("select", { className: "filter-select", attributes: { "aria-label": "チームで絞り込み" } }, [
    element("option", { text: "全チーム", attributes: { value: "" } }),
    ...(activeCompetition?.teamIds ?? []).map((id) => { const team = getTeam(teamDirectory, id); return element("option", { text: team?.name ?? id, attributes: { value: id } }); }),
  ]);
  teamSelect.addEventListener("change", () => { teamFilter = teamSelect.value; renderMatchList(); });

  const matchesSection = element("div", {
    className: "league-detail-section",
  }, [
    createSeasonSelect(selectedSeason, availableSeasons),
    isTournament ? null : createSeasonPeriodTabs(seasonPeriod),
    element("div", { className: "league-match-filters league-match-filters--simple" }, [teamSelect]),
    element("div", {
      className: "chip-row",
      attributes: { "aria-label": "試合の開催状況" },
    }, [
      finishedButton,
      scheduledButton,
    ]),
    element("div", { className: "section-stack" }, [
      activeCompetition?.results ? createPanel("大会結果", element("div", { className: "detail-list" }, [
        element("div", { className: "detail-row" }, [element("span", { text: "優勝" }), element("strong", { text: activeCompetition.results.winner })]),
        element("div", { className: "detail-row" }, [element("span", { text: "準優勝" }), element("strong", { text: activeCompetition.results.runnerUp })]),
        element("div", { className: "detail-row" }, [element("span", { text: "3位" }), element("strong", { text: activeCompetition.results.third })]),
      ]), `${activeCompetition.dateFrom?.replaceAll("-", "/")}〜${activeCompetition.dateTo?.replaceAll("-", "/")}`) : null,
      activeCompetition?.competitionType === "rookie-tournament"
        ? createRookieGroupStandings(leagueMatches)
        : null,
      isNotPublished ? createNotice(unpublishedMessage(activeCompetition, selectedSeason)) : createPanel(
        activeCompetition?.name ?? `${selectedSeason}年度 中国大学サッカーリーグ${leagueDivision}部`,
        matchList,
        matchCount,
      ),
      isTournament && leagueMatches.some((match) => match.goals?.length)
        ? createTournamentRankings(leagueMatches)
        : null,
      isNotPublished ? null : createNotice("終了した試合と未開催の試合を切り替えられます。"),
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
      if (!timelinePositioned) {
        timelinePositioned = true;
        positionMatchTimeline(matchList, displayedLeagueMatches);
      }

      return;
    }

    if (activeLeagueTab === "seasons") {
      leagueContent.replaceChildren(seasonsSection);
      return;
    }

    leagueContent.replaceChildren(standingsSection);
  };

  leagueTabs.append(
    ...LEAGUE_TABS.filter(([tabId]) => !isTournament || tabId !== "standings").map(([tabId, label]) => {
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

  const availableLeagueTabs = [...leagueTabs.children].map((tab) => tab.dataset.leagueTab);
  const moveLeagueTab = (amount) => {
    const index = availableLeagueTabs.indexOf(activeLeagueTab);
    const next = availableLeagueTabs[index + amount];
    if (next) { activeLeagueTab = next; renderLeagueTab(); }
  };
  enableHorizontalSwipe(leagueContent, { onLeft: () => moveLeagueTab(1), onRight: () => moveLeagueTab(-1) });

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
      text: competition.competitionType === "i-league"
        ? `I ${competition.division}部`
        : competition.competitionType === "i-league-playoff"
          ? competition.stageName
          : competition.competitionType === "playoff"
            ? "昇格プレーオフ"
            : competition.competitionType === "promotion-relegation"
              ? "入替戦"
        : competition.competitionType === "tournament"
          ? "選手権"
          : competition.competitionType === "rookie-tournament"
            ? "新人戦"
            : `${competition.division}部`,
      attributes: {
        type: "button",
        role: "tab",
        "aria-selected": String(selected),
      },
    });
    button.addEventListener("click", () => navigate("league", {
      competitionId: competition.id,
      season: selectedSeason,
    }));
    return button;
  }));
  const moveCompetition = (amount) => {
    const index = seasonCompetitions.findIndex((competition) => competition.id === competitionId);
    const next = seasonCompetitions[index + amount];
    if (next) navigate("league", { competitionId: next.id, season: selectedSeason });
  };
  enableHorizontalSwipe(divisionTabs, { onLeft: () => moveCompetition(1), onRight: () => moveCompetition(-1) });

  return element(
    "article",
    {
      className: "page",
      attributes: {
        "data-page": "league",
        "data-league-division": String(activeCompetition?.division ?? leagueDivision),
      },
    },
    [
      createPageHeader({
        eyebrow: isTournament ? "Cup Competition" : "League",
        title: leagueName,
        description: isTournament ? "ラウンド別の日程・結果を確認できます。" : "順位表、試合、過去シーズンの情報を確認できます。",
        badge: String(selectedSeason),
      }),
      divisionTabs,
      leagueTabs,
      leagueContent,
    ],
  );
}

function competitionGroup(competition) {
  if (!competition) return "unknown";
  if (competition.competitionGroup === "division-2") return "division-2";
  if (competition.competitionGroup) return competition.competitionGroup;
  if (competition.competitionType === "i-league") return "i-league";
  if (competition.stage === "division-2-playoff" || competition.stage === "promotion-playoff") return "division-2";
  if (competition.stage === "regular") return `division-${competition.division}`;
  return competition.id;
}

function competitionGroupFromId(competitionId) {
  if (!competitionId) return null;
  if (competitionId.includes("i-league")) return "i-league";
  if (competitionId.includes("promotion-relegation")) return "promotion-relegation";
  if (competitionId.includes("promotion-playoff") || competitionId.includes("division-2")) return "division-2";
  if (competitionId.includes("division-1")) return "division-1";
  return competitionId;
}

function unpublishedMessage(competition, season) {
  if (competition.dataStatus === "not-held") {
    return `${season}年度は大会要項上、1部・2部入替戦を実施しません。`;
  }
  if (competition.competitionType === "i-league-playoff") {
    return `${season}年のIリーグ順位決定プレーオフ情報はまだ公式発表されていません。\n公式日程が公開され次第、試合情報を追加します。`;
  }
  if (competition.competitionType === "playoff") {
    return `${season}年の昇格プレーオフ情報はまだ公式発表されていません。\n公式日程が公開され次第、試合情報を追加します。`;
  }
  return "大会情報はまだ公式発表されていません。\n公式日程が公開され次第、試合情報を追加します。";
}

function createTournamentRankings(matches) {
  const goals = new Map();
  const assists = new Map();
  for (const match of matches) {
    for (const goal of match.goals ?? []) {
      const scorerKey = `${goal.teamName}\0${goal.scorerName}`;
      goals.set(scorerKey, { name: goal.scorerName, team: goal.teamName, count: (goals.get(scorerKey)?.count ?? 0) + 1 });
      for (const name of goal.assistNames ?? []) {
        const assistKey = `${goal.teamName}\0${name}`;
        assists.set(assistKey, { name, team: goal.teamName, count: (assists.get(assistKey)?.count ?? 0) + 1 });
      }
    }
  }
  const ranking = (entries) => element("div", { className: "detail-list" }, [...entries.values()]
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "ja"))
    .slice(0, 10)
    .map((entry) => element("div", { className: "detail-row" }, [
      element("span", { text: `${entry.name}（${entry.team}）` }),
      element("strong", { text: String(entry.count) }),
    ])));
  return element("div", { className: "section-stack tournament-rankings" }, [
    createPanel("得点ランキング", ranking(goals), "試合記録集計"),
    createPanel("アシストランキング", ranking(assists), "試合記録集計"),
  ]);
}

function createRookieGroupStandings(matches) {
  const groups = new Map();
  for (const match of matches) {
    if (!match.groupName) continue;
    if (!groups.has(match.groupName)) groups.set(match.groupName, []);
    groups.get(match.groupName).push(match);
  }
  return element("div", { className: "section-stack rookie-group-standings" }, [...groups.entries()].map(([groupName, groupMatches]) => {
    const teamNames = [...new Set(groupMatches.flatMap((match) => [match.homeTeam.name, match.awayTeam.name]))];
    const rows = teamNames.map((name) => {
      const record = { name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
      for (const match of groupMatches.filter((entry) => entry.status === "finished" && (entry.homeTeam.name === name || entry.awayTeam.name === name))) {
        const home = match.homeTeam.name === name;
        const own = home ? match.homeTeam.score : match.awayTeam.score;
        const against = home ? match.awayTeam.score : match.homeTeam.score;
        record.played += 1; record.goalsFor += own; record.goalsAgainst += against;
        if (own > against) { record.won += 1; record.points += 3; }
        else if (own < against) record.lost += 1;
        else { record.drawn += 1; record.points += 1; }
      }
      return record;
    }).sort((left, right) => right.points - left.points || (right.goalsFor - right.goalsAgainst) - (left.goalsFor - left.goalsAgainst) || right.goalsFor - left.goalsFor);
    const table = element("table", { className: "standing-table rookie-standing-table" });
    table.append(
      element("thead", {}, [element("tr", {}, ["順位", "チーム", "試合", "勝点"].map((label) => element("th", { text: label })))]),
      element("tbody", {}, rows.map((row, index) => element("tr", {}, [
        element("td", { text: row.played ? String(index + 1) : "–" }), element("td", { text: row.name }),
        element("td", { text: String(row.played) }), element("td", { text: String(row.points) }),
      ]))),
    );
    return createPanel(`${groupName} 順位表`, element("div", { className: "table-scroll" }, [table]), `${teamNames.length}チーム`);
  }));
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
  return createUnifiedStandingTable(standings, teamDirectory, { mode });
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
