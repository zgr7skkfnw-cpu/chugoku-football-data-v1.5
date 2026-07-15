import { createNotice, createPageHeader, createPanel, createTeamEmblem, element } from "../ui/elements.js";
import { createSeasonPeriodTabs } from "../ui/season-period.js";
import { formatUpdatedAt } from "../utils/football.js";
import { getTeam } from "../utils/teams.js";
import { createTeamNameLink } from "./shared.js";
import { setState } from "../state.js";
import { createSeasonSelect } from "../ui/season-select.js";

const MODES = [
  ["overall", "通算順位", "standings"],
  ["home", "ホーム順位", "homeStandings"],
  ["away", "アウェイ順位", "awayStandings"],
];

export function renderStandingsPage({ matches, competitionMetadata, teamDirectory, leagueStats, leagueDivision, seasonPeriod, selectedSeason, availableSeasons }) {
  const activeStats = leagueStats?.[selectedSeason]?.[leagueDivision];
  const metadata = competitionMetadata?.[selectedSeason]?.[leagueDivision];
  const periodData = activeStats?.periods?.[seasonPeriod];
  const periodRules = activeStats?.periodRules?.[seasonPeriod];
  const reflectedMatches = matches.filter((match) => match.season === selectedSeason
    && match.division === leagueDivision
    && match.stageId === "regular"
    && match.status === "finished"
    && (seasonPeriod === "all" || (Number(match.round) >= periodRules.fromRound && Number(match.round) <= periodRules.toRound)));
  let activeMode = "overall";
  const divisionTabs = element("div", { className: "league-division-tabs", attributes: { role: "tablist", "aria-label": "リーグ区分" } }, [1, 2].map((division) => {
    const selected = leagueDivision === division;
    const button = element("button", {
      className: `league-division-tab${selected ? " is-active" : ""}`,
      text: `${division}部`,
      attributes: { type: "button", role: "tab", "aria-selected": String(selected), "data-league-division": String(division) },
    });
    button.addEventListener("click", () => setState({ leagueDivision: division }));
    return button;
  }));
  const tabs = element("div", { className: "chip-row standing-mode-tabs", attributes: { role: "tablist", "aria-label": "順位表区分" } });
  const content = element("div");

  const renderTable = () => {
    const [, label, key] = MODES.find(([mode]) => mode === activeMode);
    const standings = periodData?.[key] ?? [];
    for (const tab of tabs.children) {
      const selected = tab.dataset.standingMode === activeMode;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
    }
    content.replaceChildren(createPanel(
      `${metadata?.competitionName ?? `${leagueDivision}部`} ${label}`,
      element("div", { className: "table-scroll" }, createStandingTable(standings, teamDirectory, activeMode)),
      `${reflectedMatches.length}試合反映`,
    ));
  };

  tabs.append(...MODES.map(([mode, label]) => {
    const button = element("button", { className: "filter-chip", text: label, attributes: { type: "button", role: "tab", "data-standing-mode": mode } });
    button.addEventListener("click", () => { activeMode = mode; renderTable(); });
    return button;
  }));
  renderTable();

  return element("article", { className: "page", attributes: { "data-page": "standings" } }, [
    createPageHeader({ eyebrow: "League Table", title: "順位表", description: "通算・ホーム・アウェイの順位、勝率、前節からの順位変動を表示します。" }),
    createSeasonSelect(selectedSeason, availableSeasons),
    divisionTabs,
    createSeasonPeriodTabs(seasonPeriod),
    tabs,
    element("div", { className: "section-stack" }, [
      content,
      createNotice(`順位決定順: 勝点、得失点差、総得点。変動は直近2節の順位比較です。${formatUpdatedAt(metadata?.updatedAt)}`),
    ]),
  ]);
}

function createStandingTable(standings, teamDirectory, mode) {
  const table = element("table", { className: "standing-table", attributes: { "data-standing-count": String(standings.length), "data-standing-mode": mode } });
  table.append(
    element("thead", {}, [element("tr", {}, ["#", "変動", "チーム", "試", "勝", "分", "敗", "勝率", "+/-", "勝点"].map((label) => element("th", { text: label })))]),
    element("tbody", {}, standings.map((row) => {
      const team = getTeam(teamDirectory, row.teamId);
      return element("tr", { attributes: { "data-standing-team": team?.name ?? row.teamId } }, [
        element("td", { className: "rank-number", text: row.rank ? String(row.rank) : "–" }),
        element("td", { className: `rank-change rank-change--${movementKey(row.rankChange)}`, text: mode === "overall" ? movementLabel(row.rankChange) : "–" }),
        element("td", {}, [element("div", { className: "standing-team" }, [createTeamEmblem(team, "team-emblem team-emblem--standing"), createTeamNameLink(team, row.teamId)])]),
        element("td", { text: String(row.played) }), element("td", { text: String(row.won) }),
        element("td", { text: String(row.drawn) }), element("td", { text: String(row.lost) }),
        element("td", { text: row.played ? `${((row.won / row.played) * 100).toFixed(1)}%` : "–" }),
        element("td", { text: signed(row.goalDifference) }),
        element("td", { className: "points", text: String(row.points) }),
      ]);
    })),
  );
  return table;
}

function movementLabel(value) { return value > 0 ? `↑${value}` : value < 0 ? `↓${Math.abs(value)}` : value === 0 ? "→" : "–"; }
function movementKey(value) { return value > 0 ? "up" : value < 0 ? "down" : "same"; }
function signed(value) { return `${value > 0 ? "+" : ""}${value}`; }
