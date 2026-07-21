import { createNotice, createPageHeader, createPanel, createTeamEmblem, element } from "../ui/elements.js";
import { createSeasonPeriodTabs } from "../ui/season-period.js";
import { getMetric, selectPlayerStatisticsPeriod, sortPlayerStatistics } from "../utils/players.js";
import { createPlayerLinkRow } from "./shared.js";
import { filterMatchesByPeriod } from "../utils/football.js";
import { routeHref } from "../router.js";
import { setState } from "../state.js";

const RANKINGS = [
  ["goals", "得点", "ゴール"],
  ["assists", "アシスト", "アシスト"],
  ["goalContributions", "G+A", "G+A"],
  ["minutes", "出場時間", "分"],
  ["appearances", "出場試合", "試合"],
  ["starts", "先発", "試合"],
  ["benchSelections", "ベンチ入り", "試合"],
  ["fullAppearances", "フル出場", "試合"],
  ["substitutionsOn", "途中出場", "試合"],
  ["substitutionsOff", "途中交代", "試合"],
  ["cleanSheets", "クリーンシート", "試合"],
  ["yellowCards", "イエロー", "枚"],
  ["redCards", "レッド", "枚"],
];

const TEAM_RANKINGS = [
  ["averageGoals", "平均得点", "点"],
  ["averageConceded", "平均失点", "点"],
  ["cleanSheets", "クリーンシート", "試合"],
  ["scorelessMatches", "無得点試合", "試合"],
  ["yellowCards", "イエロー", "枚"],
  ["redCards", "レッド", "枚"],
  ["benchSelections", "ベンチ入り累計", "人"],
  ["averageBench", "平均ベンチ人数", "人"],
  ["averageStartingAge", "平均先発年齢", "歳"],
];

export function renderRankingsPage({ matches, playerStatistics, teamStats, leagueStats, teamDirectory, seasonPeriod, teams, leagueTeams = teams, leagueDivision = 1, selectedSeason = 2026, selectedCompetitionId = null, competitionDefinitions = [] }) {
  let activeMetric = "goals";
  let teamFilter = "";
  let gradeFilter = "";
  const periodStatistics = selectPlayerStatisticsPeriod(playerStatistics, seasonPeriod);
  const availableCompetitions = competitionDefinitions.filter((competition) => competition.season === selectedSeason && competition.matches && ["league", "i-league"].includes(competition.competitionType));
  const activeCompetition = availableCompetitions.find((competition) => competition.id === selectedCompetitionId)
    ?? availableCompetitions.find((competition) => competition.competitionType === "league" && competition.division === leagueDivision)
    ?? availableCompetitions[0];
  const divisionMatches = matches.filter((match) => match.season === selectedSeason && match.competitionId === activeCompetition?.id);
  const divisionTeamIds = new Set(divisionMatches.flatMap((match) => [match.homeTeam.teamId, match.awayTeam.teamId]).filter(Boolean));
  const reflectedMatches = filterMatchesByPeriod(divisionMatches, seasonPeriod);
  const activeTeamStats = leagueStats?.[selectedSeason]?.byCompetition?.[activeCompetition?.id]
    ?? leagueStats?.[selectedSeason]?.[leagueDivision] ?? teamStats;
  const chips = element("div", { className: "chip-row ranking-tabs", attributes: { role: "tablist" } });
  const content = element("div");

  function renderRanking() {
    const [, label, unit] = RANKINGS.find(([metric]) => metric === activeMetric);
    const rows = sortPlayerStatistics(periodStatistics, activeMetric).filter((stats) =>
      getMetric(stats, activeMetric) > 0 &&
      divisionTeamIds.has(stats.player.teamId) &&
      (!teamFilter || stats.player.teamId === teamFilter) &&
      (!gradeFilter || String(stats.player.grade) === gradeFilter),
    );
    for (const chip of chips.children) {
      const selected = chip.dataset.metric === activeMetric;
      chip.classList.toggle("is-active", selected);
      chip.setAttribute("aria-selected", String(selected));
    }
    content.replaceChildren(
      createPanel(
        `${label}ランキング`,
        rows.length
          ? element(
              "div",
              { className: "ranking-list", attributes: { "data-ranking-count": rows.length } },
              rows.map((stats, index) =>
                element("div", { className: "ranking-entry" }, [
                  element("span", { className: "ranking-entry__place", text: String(index + 1) }),
                  createPlayerLinkRow({
                    player: stats.player,
                    team: stats.team,
                    metric: getMetric(stats, activeMetric),
                    metricLabel: unit,
                  }),
                ]),
              ),
            )
          : createNotice(`${label}の記録はありません。`),
        `${rows.length}選手`,
      ),
    );
  }

  chips.append(
    ...RANKINGS.map(([metric, label]) => {
      const chip = element("button", {
        className: "filter-chip",
        text: label,
        attributes: { type: "button", role: "tab", "data-metric": metric },
      });
      chip.addEventListener("click", () => {
        activeMetric = metric;
        renderRanking();
      });
      return chip;
    }),
  );
  renderRanking();

  const teamSelect = element("select", { className: "filter-select", attributes: { "aria-label": "ランキングのチーム" } }, [
    element("option", { text: "全チーム", attributes: { value: "" } }),
    ...leagueTeams.filter((team) => divisionTeamIds.has(team.id)).map((team) => element("option", { text: team.name, attributes: { value: team.id } })),
  ]);
  const gradeSelect = element("select", { className: "filter-select", attributes: { "aria-label": "ランキングの推定学年" } }, [
    element("option", { text: "全学年", attributes: { value: "" } }),
    ...[1, 2, 3, 4].map((grade) => element("option", { text: `${grade}年（推定）`, attributes: { value: String(grade) } })),
  ]);
  teamSelect.addEventListener("change", () => { teamFilter = teamSelect.value; renderRanking(); });
  gradeSelect.addEventListener("change", () => { gradeFilter = gradeSelect.value; renderRanking(); });

  return element("article", { className: "page", attributes: { "data-page": "rankings" } }, [
    createPageHeader({
      eyebrow: "Top Performers",
      title: "ランキング",
      description: "試合の出場・得点・アシスト・警告退場記録を自動集計しています。",
    }),
    element("div", { className: "league-division-tabs", attributes: { role: "tablist", "aria-label": "ランキングの大会" } }, availableCompetitions.map((competition) => {
      const selected = competition.id === activeCompetition?.id;
      const label = competition.competitionType === "i-league" ? `Iリーグ${competition.division === 1 ? "一部" : "二部"}` : `${competition.division}部`;
      const button = element("button", { className: `league-division-tab${selected ? " is-active" : ""}`, text: label, attributes: { type: "button", role: "tab", "aria-selected": String(selected), "aria-label": label, title: competition.leagueName ?? competition.name, "data-competition-id": competition.id } });
      button.addEventListener("click", () => setState({ selectedCompetitionId: competition.id, leagueDivision: competition.division ?? leagueDivision }));
      return button;
    })),
    createSeasonPeriodTabs(seasonPeriod),
    element("div", { className: "filter-grid ranking-filter-grid" }, [teamSelect, gradeSelect]),
    chips,
    element("div", { className: "section-stack" }, [
      content,
      createTeamRankings(activeTeamStats?.periods?.[seasonPeriod]?.rankings, teamDirectory),
      createNotice(`${reflectedMatches.length}試合の記録から集計しています。`),
    ]),
  ]);
}

function createTeamRankings(rankings, teamDirectory) {
  let activeMetric = "averageGoals";
  const tabs = element("div", { className: "chip-row team-ranking-tabs", attributes: { role: "tablist", "aria-label": "チームランキング項目" } });
  const content = element("div");
  const render = () => {
    const [, label, unit] = TEAM_RANKINGS.find(([key]) => key === activeMetric);
    const rows = rankings?.[activeMetric] ?? [];
    for (const tab of tabs.children) {
      const selected = tab.dataset.teamMetric === activeMetric;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
    }
    content.replaceChildren(
      rows.length
        ? element("div", { className: "team-ranking-list", attributes: { "data-team-ranking": activeMetric } }, rows.map((row) => {
            const team = teamDirectory?.byId.get(row.teamId);
            return element("a", { className: "team-ranking-row", attributes: { href: routeHref("team", { teamId: row.teamId }), "data-route": "team", "data-team-id": row.teamId } }, [
              element("span", { className: "ranking-entry__place", text: String(row.rank) }),
              createTeamEmblem(team, "team-emblem team-emblem--standing"),
              element("strong", { text: team?.name ?? row.teamId }),
              element("span", { className: "team-ranking-row__value", text: `${row.value}${unit}` }),
            ]);
          }))
        : createNotice(`${label}の対象データはありません。`),
    );
  };
  tabs.append(...TEAM_RANKINGS.map(([metric, label]) => {
    const button = element("button", { className: "filter-chip", text: label, attributes: { type: "button", role: "tab", "data-team-metric": metric } });
    button.addEventListener("click", () => { activeMetric = metric; render(); });
    return button;
  }));
  render();
  return createPanel("チームランキング", element("div", {}, [tabs, content]), `${TEAM_RANKINGS.length}項目`);
}
