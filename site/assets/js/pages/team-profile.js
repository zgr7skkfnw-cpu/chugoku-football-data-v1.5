import { routeHref } from "../router.js";
import {
  createKitImage,
  createNotice,
  createPanel,
  createTeamEmblem,
  createTeamPhoto,
  element,
} from "../ui/elements.js";
import { getTeam } from "../utils/teams.js";
import { toggleFavoriteTeam } from "../utils/favorites.js";
import { setState } from "../state.js";
import { createMatchRow, createPlayerLinkRow, createTeamNameLink } from "./shared.js";
import { createSeasonPeriodTabs } from "../ui/season-period.js";
import { selectPlayerStatisticsCompetition } from "../utils/players.js";
import { createUnifiedStandingTable } from "../ui/standing-table.js";
import { createProfileRegistrationPicker } from "../ui/profile-registration-picker.js";

export function renderTeamProfilePage({
  currentTeamId,
  teamDirectory,
  players,
  favoriteTeamIds = [],
  teamStats,
  leagueStats,
  headToHead,
  playerStatistics,
  seasonPeriod,
  selectedSeason,
  matches,
  competitionDefinitions = [],
  favoritePlayerIds = [],
  selectedCompetitionId: routedCompetitionId = null,
  selectedTeamTab = "overview",
}) {
  const team = getTeam(teamDirectory, currentTeamId);

  if (!team) {
    return element("article", { className: "page", attributes: { "data-page": "team" } }, [
      createNotice("指定されたチームは見つかりません。チーム一覧から選択してください。"),
    ]);
  }

  const hasSeasonRoster = selectedSeason === 2026;
  const staff = team.staff ?? [];
  const isFavorite = favoriteTeamIds.includes(team.id);
  const competitionStatsById = leagueStats?.[selectedSeason]?.byCompetition ?? {};
  const opponents = headToHead?.items?.find((entry) => entry.teamId === team.id)?.opponents ?? [];
  const selectedCompetitionId = routedCompetitionId ?? team.competitionId
    ?? matches.find((match) => match.season === selectedSeason && (match.homeTeam.teamId === team.id || match.awayTeam.teamId === team.id))?.competitionId;
  const competitionMatches = matches.filter((match) =>
    match.season === selectedSeason && match.competitionId === selectedCompetitionId && match.status === "finished");
  const activeTeamStats = competitionStatsById[selectedCompetitionId]
    ?? (!routedCompetitionId
      ? Object.values(competitionStatsById).find((stats) => stats?.periods?.all?.teams?.some((entry) => entry.teamId === team.id)) ?? teamStats
      : null)
    ?? createCompetitionTeamStats(competitionMatches);
  const analytics = activeTeamStats?.periods?.[seasonPeriod]?.teams?.find((entry) => entry.teamId === team.id);
  const seasonMatches = matches
    .filter((match) => match.season === selectedSeason)
    .filter((match) => match.homeTeam.teamId === team.id || match.awayTeam.teamId === team.id)
    .filter((match) => !selectedCompetitionId || match.competitionId === selectedCompetitionId);
  const finishedMatches = seasonMatches
    .filter((match) => match.status === "finished")
    .sort((left, right) => new Date(right.kickoffAt) - new Date(left.kickoffAt));
  const upcomingMatches = seasonMatches
    .filter((match) => match.status !== "finished")
    .sort((left, right) => new Date(left.kickoffAt) - new Date(right.kickoffAt));
  const periodPlayerStats = selectPlayerStatisticsCompetition(playerStatistics, {
    season: selectedSeason,
    competitionId: selectedCompetitionId,
    teamId: team.id,
    period: seasonPeriod,
  });
  const competitionDefinition = competitionDefinitions.find((entry) => entry.id === selectedCompetitionId);
  const usesDedicatedRoster = team.competitionId || ["regular", "i-league-regular"].includes(competitionDefinition?.stage);
  const roster = (hasSeasonRoster ? players : [])
    .filter((player) => player.teamId === team.id)
    .filter((player) => usesDedicatedRoster || periodPlayerStats.get(player.id)?.matches.length)
    .sort((left, right) => (left.number ?? 999) - (right.number ?? 999));
  const favoriteButton = element("button", {
    className: `favorite-button${isFavorite ? " is-active" : ""}`,
    text: isFavorite ? "♥ フォロー中" : "♡ フォローする",
    attributes: { type: "button", "aria-pressed": String(isFavorite) },
  });
  favoriteButton.addEventListener("click", () => {
    const nextTeamIds = toggleFavoriteTeam(favoriteTeamIds, team.id);
    setState({ favoriteTeamIds: nextTeamIds });
  });
  const standings = activeTeamStats?.periods?.all?.standings ?? [];
  const trophies = collectTeamTrophies(team, competitionDefinitions, leagueStats, matches);
  const registrationSwitch = () => createTeamRegistrationSwitch(
    team,
    teamDirectory,
    matches,
    selectedSeason,
    selectedCompetitionId,
    competitionDefinitions,
    selectedTeamTab,
  );
  const tabContent = {
    overview: element("div", { className: "section-stack" }, [
      registrationSwitch(),
      createPanel("次の試合", createNextMatch(upcomingMatches, team, teamDirectory), upcomingMatches.length ? "直近の公式日程" : "未定"),
      createPanel("チームフォーム", createCompactForm(finishedMatches.slice(0, 5), team, teamDirectory), `${Math.min(finishedMatches.length, 5)}試合`),
      createPanel("順位表", createMiniStanding(standings, team, teamDirectory), "現在順位 / 3チーム"),
      createPanel(
        "リーグ表での順位履歴",
        createRankChart(createFinalRankHistoryPoints(team, selectedCompetitionId, leagueStats, teamDirectory), standings.length, true),
        "終了済みシーズンの最終順位",
      ),
      createPanel("トロフィー", createTrophyList(trophies), "保存済みデータのみ"),
      createPanel("競技場情報", createVenueInformation(team), "公式・登録済み情報"),
    ]),
    matches: element("div", { className: "section-stack" }, [registrationSwitch(), createPanel("試合", createTimelineMatches(seasonMatches, team, teamDirectory), `${seasonMatches.length}試合`)]),
    standings: element("div", { className: "section-stack" }, [registrationSwitch(), createPanel("順位表", createProfileStanding(standings, team, teamDirectory), competitionLabel(selectedCompetitionId, competitionDefinitions))]),
    stats: element("div", { className: "section-stack", attributes: { "data-stats-scope": `${selectedSeason}:${selectedCompetitionId}:${team.id}` } }, [
      registrationSwitch(),
      createPanel("総合・ホーム・アウェー成績", createHomeAwayOverview(analytics, activeTeamStats, team), "選択大会"),
      createPanel("ゴール数", createGoalClassification(finishedMatches, team), "公式記録で判別できる範囲"),
      hasSeasonRoster ? createPanel("トッププレイヤー", createExpandableRankings(periodPlayerStats, team, selectedCompetitionId), "チーム内") : null,
      createPanel("重要スタッツ", createImportantStats(activeTeamStats, team, teamDirectory), "リーグ比較"),
      createPanel("攻撃", createCategoryLeagueStats("attack", activeTeamStats, competitionMatches, team, teamDirectory), "リーグ内比較"),
      createPanel("守備", createCategoryLeagueStats("defence", activeTeamStats, competitionMatches, team, teamDirectory), "リーグ内比較"),
      createPanel("反則", createCategoryLeagueStats("discipline", activeTeamStats, competitionMatches, team, teamDirectory), "リーグ内比較"),
    ]),
    squad: hasSeasonRoster
      ? element("div", { className: "section-stack" }, [registrationSwitch(), createPanel("スカッド", createRoster(roster, team, periodPlayerStats, favoritePlayerIds, players), `${roster.length}選手`)])
      : createNotice(`${selectedSeason}年度の大会別選手名簿は未整備です。`),
    trophies: element("div", { className: "section-stack" }, [
      registrationSwitch(),
      createPanel("トロフィー", createTrophyList(trophies, true), "保存済みデータの対象期間"),
    ]),
  }[selectedTeamTab] ?? null;

  return element(
    "article",
    {
      className: "page team-profile",
      attributes: { "data-page": "team", "data-team-id": team.id, "data-competition-id": selectedCompetitionId ?? "" },
    },
    [
      element("a", {
        className: "team-profile__back",
        text: "← チーム一覧",
        attributes: { href: routeHref("teams"), "data-route": "teams" },
      }),
      element("header", { className: "team-profile__identity" }, [
        createTeamEmblem(team, "team-emblem team-emblem--profile"),
        element("div", { className: "team-profile__identity-copy" }, [
          element("p", { className: "page-eyebrow", text: competitionLabel(selectedCompetitionId, competitionDefinitions) }),
          element("h1", { className: "team-profile__name", text: team.name }),
          element("span", { className: "team-profile__short-name", text: team.shortName }),
          team.parentClubId ? element("span", {
            className: "team-profile__short-name",
            text: `所属大学：${getTeam(teamDirectory, team.parentClubId)?.name ?? team.parentClubId}`,
          }) : null,
        ]),
        favoriteButton,
        createHeaderRecord(analytics),
      ]),
      element("div", { className: "team-profile__content section-stack" }, [
        team.competitionId ? createNotice("Iリーグの大会別公式登録です。トップチームや別チームの登録とは統合していません。") : null,
        createProfileTabs("team", selectedTeamTab, [
          ["overview", "概要"], ["matches", "試合"], ["standings", "順位表"],
          ["stats", "スタッツ"], ["squad", "スカッド"], ["trophies", "トロフィー"],
        ], { teamId: team.id, competitionId: selectedCompetitionId, season: selectedSeason }),
        element("section", { className: "profile-tab-panel", attributes: { role: "tabpanel", tabindex: "0" } }, [tabContent]),
      ]),
    ],
  );
}

function createTeamMatchList(matches, teamDirectory) {
  if (!matches.length) return createNotice("該当する試合はありません。");
  return element("div", { className: "match-list" }, matches.map((match) =>
    createMatchRow(match, teamDirectory)));
}

function createRecordSummary(record = {}, stats = {}) {
  const values = [
    ["試合", record.played ?? 0], ["勝", record.won ?? 0], ["分", record.drawn ?? 0],
    ["負", record.lost ?? 0], ["勝点", record.points ?? 0], ["得点", record.goalsFor ?? 0],
    ["失点", record.goalsAgainst ?? 0], ["得失点差", signed(record.goalDifference ?? 0)],
    ["無失点", stats.cleanSheets ?? "－"], ["平均得点", nullableDecimal(stats.averageGoals)],
    ["平均失点", nullableDecimal(stats.averageConceded)],
  ];
  return element("div", { className: "team-record-grid" }, values.map(([label, value]) =>
    element("div", { className: "team-record-stat" }, [element("strong", { text: String(value) }), element("span", { text: label })]),
  ));
}

function createHeaderRecord(analytics) {
  return element("div", { className: "team-profile__header-record" }, [
    ["順位", analytics?.rank ? `${analytics.rank}位` : "－"],
    ["試合", analytics?.overall?.played ?? "－"],
    ["勝点", analytics?.overall?.points ?? "－"],
    ["得失点差", analytics?.overall?.goalDifference === undefined ? "－" : signed(analytics.overall.goalDifference)],
  ].map(([label, value]) => element("div", {}, [
    element("strong", { text: String(value) }),
    element("span", { text: label }),
  ])));
}

function createNextMatch(matches, team, teamDirectory) {
  const match = matches[0];
  if (!match) return createNotice("今後の公式日程はまだありません。");
  const opponentId = match.homeTeam.teamId === team.id ? match.awayTeam.teamId : match.homeTeam.teamId;
  const opponent = teamDirectory?.byId.get(opponentId);
  return element("a", {
    className: "team-next-match match-row",
    attributes: { href: routeHref("match", { matchId: match.id }), "data-route": "match", "data-match-id": match.id },
  }, [
    createTeamEmblem(team, "team-emblem team-next-match__emblem"),
    element("div", { className: "team-next-match__copy" }, [
      element("span", { text: `${match.leagueName}${match.stageName ? ` / ${match.stageName}` : ""}` }),
      element("strong", { text: `${team.shortName ?? team.name} vs ${opponent?.shortName ?? opponent?.name ?? match.awayTeam.name}` }),
      element("time", { text: formatDateTime(match.kickoffAt) }),
      element("span", { text: [match.roundLabel ?? (match.round ? `第${match.round}節` : null), match.venue].filter(Boolean).join(" / ") || "会場未掲載" }),
    ]),
    createTeamEmblem(opponent, "team-emblem team-next-match__emblem"),
  ]);
}

function createRecentMatches(matches, team, teamDirectory) {
  if (!matches.length) return createNotice("終了済みの試合はありません。");
  return element("div", { className: "team-recent-list" }, matches.map((match) => {
    const isHome = match.homeTeam.teamId === team.id;
    const opponentRef = isHome ? match.awayTeam : match.homeTeam;
    const opponent = teamDirectory?.byId.get(opponentRef.teamId);
    const teamScore = Number(isHome ? match.homeTeam.score : match.awayTeam.score);
    const opponentScore = Number(isHome ? match.awayTeam.score : match.homeTeam.score);
    const result = teamScore > opponentScore ? ["勝", "win"] : teamScore < opponentScore ? ["敗", "loss"] : ["分", "draw"];
    return element("details", {
      className: `form-result team-recent-match is-${result[1]}`,
    }, [
      element("summary", {}, [
        element("span", { className: "team-recent-match__result", text: result[0] }),
        createTeamEmblem(opponent, "team-emblem team-emblem--standing"),
        element("div", {}, [
          element("strong", { text: opponent?.name ?? opponentRef.name }),
          element("span", { text: `${isHome ? "ホーム" : "アウェー"} / ${match.leagueName}` }),
        ]),
        element("strong", { text: `${teamScore} - ${opponentScore}` }),
        element("time", { text: formatShortDate(match.kickoffAt) }),
      ]),
      element("a", {
        className: "form-result__detail",
        attributes: { href: routeHref("match", { matchId: match.id }), "data-route": "match", "data-match-id": match.id },
      }, [
        element("span", { text: `${isHome ? "Home" : "Away"} / ${match.roundLabel ?? (match.round ? `第${match.round}節` : match.stageName ?? "")}` }),
        element("strong", { text: "試合詳細を見る" }),
      ]),
    ]);
  }));
}

function createHomeAwayRecords(analytics) {
  return element("div", { className: "home-away-grid" }, [
    createSplitRecord("ホーム", analytics?.home),
    createSplitRecord("アウェイ", analytics?.away),
  ]);
}

function createSplitRecord(label, record = {}) {
  const values = [
    ["試", record.played ?? "－"],
    ["勝", record.won ?? "－"],
    ["分", record.drawn ?? "－"],
    ["敗", record.lost ?? "－"],
    ["得", record.goalsFor ?? "－"],
    ["失", record.goalsAgainst ?? "－"],
    ["差", record.goalDifference === undefined ? "－" : signed(record.goalDifference)],
    ["点", record.points ?? "－"],
  ];
  return element("section", { className: "split-record" }, [
    element("h3", { text: label }),
    element("div", { className: "split-record__values" }, values.map(([name, value]) =>
      element("div", {}, [element("strong", { text: String(value) }), element("span", { text: name })]))),
  ]);
}

function createForm(form = [], teamDirectory) {
  if (!form.length) return createNotice("この期間の試合記録はありません。");
  return element("div", { className: "team-form-list" }, form.map((match) => {
    const symbols = { W: "○", D: "△", L: "●" };
    return element("details", { className: `form-result form-result--${match.result.toLowerCase()}` }, [
      element("summary", {}, [
        element("span", { className: "form-result__symbol", text: symbols[match.result] }),
        element("span", {}, [element("span", { text: "vs " }), createTeamNameLink(teamDirectory?.byId.get(match.opponentTeamId), match.opponentName)]),
      ]),
      element("a", {
        className: "form-result__detail",
        attributes: { href: routeHref("match", { matchId: match.matchId }), "data-route": "match", "data-match-id": match.matchId },
      }, [
        element("span", { text: `${match.side === "home" ? "Home" : "Away"} / 第${match.round}節` }),
        element("strong", { text: `${match.goalsFor} - ${match.goalsAgainst}` }),
      ]),
    ]);
  }));
}

function createTeamStatGrid(stats = {}) {
  const values = [
    ["平均得点", decimal(stats.averageGoals)], ["平均失点", decimal(stats.averageConceded)],
    ["クリーンシート", stats.cleanSheets ?? 0], ["無得点試合", stats.scorelessMatches ?? 0],
    ["イエロー", stats.yellowCards ?? 0], ["レッド", stats.redCards ?? 0],
    ["ベンチ入り累計", stats.benchSelections ?? 0], ["平均ベンチ人数", decimal(stats.averageBench)],
    ["平均先発年齢", stats.averageStartingAge === null || stats.averageStartingAge === undefined ? "算出不可" : `${decimal(stats.averageStartingAge)}歳`],
  ];
  return element("div", { className: "team-stat-grid" }, values.map(([label, value]) =>
    element("div", { className: "team-record-stat" }, [element("strong", { text: String(value) }), element("span", { text: label })]),
  ));
}

function createRankChart(points = [], teamCount = 10, yearly = false) {
  if (!points.length) return createNotice(yearly ? "保存済みの終了シーズンに最終順位がありません。" : "終了済み試合がないため、順位推移を表示できません。");
  const width = 640;
  const height = 260;
  const left = 42;
  const top = 24;
  const chartWidth = 570;
  const chartHeight = 190;
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": yearly ? "年度別の最終順位グラフ" : "節ごとの順位推移グラフ" });
  const maximumRank = Math.max(2, teamCount, ...points.map((point) => point.rank));
  for (let rank = 1; rank <= maximumRank; rank += 1) {
    const y = top + ((rank - 1) / Math.max(1, maximumRank - 1)) * chartHeight;
    svg.append(
      svgElement("line", { x1: left, x2: left + chartWidth, y1: y, y2: y, class: "rank-chart__grid" }),
      svgText(8, y + 4, `${rank}位`),
    );
  }
  const coordinates = points.map((point, index) => ({
    ...point,
    x: left + (index / Math.max(1, points.length - 1)) * chartWidth,
    y: top + ((point.rank - 1) / Math.max(1, maximumRank - 1)) * chartHeight,
  }));
  svg.append(svgElement("polyline", { points: coordinates.map((point) => `${point.x},${point.y}`).join(" "), class: "rank-chart__line" }));
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  for (const [index, point] of coordinates.entries()) {
    svg.append(svgElement("circle", { cx: point.x, cy: point.y, r: 5, class: "rank-chart__point" }));
    if (index % labelEvery === 0 || index === coordinates.length - 1) {
      svg.append(svgText(point.x - 8, height - 15, point.label, "rank-chart__round"));
    }
  }
  return element("div", { className: "rank-chart" }, [svg]);
}

function createFinalRankHistoryPoints(team, competitionId, leagueStats, teamDirectory) {
  const currentYear = new Date().getFullYear();
  const family = competitionFamily(competitionId);
  const clubId = team.parentClubId ?? team.id;
  const rows = [];
  for (const [season, seasonStats] of Object.entries(leagueStats ?? {})) {
    if (Number(season) >= currentYear) continue;
    for (const [id, stats] of Object.entries(seasonStats.byCompetition ?? {})) {
      if (competitionFamily(id) !== family) continue;
      const standing = stats?.periods?.all?.standings?.find((entry) => {
        const candidate = getTeam(teamDirectory, entry.teamId);
        return entry.teamId === team.id
          || ((candidate?.parentClubId ?? candidate?.id) === clubId
            && Boolean(candidate?.competitionId?.includes("i-league")) === Boolean(team.competitionId?.includes("i-league")));
      });
      if (standing?.rank) rows.push({ rank: standing.rank, label: String(season), season: Number(season) });
    }
  }
  return rows.sort((left, right) => left.season - right.season);
}

function competitionFamily(id = "") {
  return String(id).replace(/20\d{2}/g, "YEAR");
}

function calculateRankProgression(matches, targetTeamId) {
  const finished = [...matches]
    .filter((match) => match.status === "finished")
    .filter((match) => Number.isFinite(Number(match.homeTeam?.score)) && Number.isFinite(Number(match.awayTeam?.score)))
    .sort((left, right) =>
      new Date(left.kickoffAt) - new Date(right.kickoffAt)
      || Number(left.gameId ?? Number.MAX_SAFE_INTEGER) - Number(right.gameId ?? Number.MAX_SAFE_INTEGER)
      || String(left.id).localeCompare(String(right.id)));
  if (!finished.some((match) => match.homeTeam.teamId === targetTeamId || match.awayTeam.teamId === targetTeamId)) return [];
  const teamIds = [...new Set(finished.flatMap((match) => [match.homeTeam.teamId, match.awayTeam.teamId]))];
  const records = new Map(teamIds.map((teamId) => [teamId, {
    teamId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
  }]));
  const points = [];
  for (const match of finished) {
    const home = records.get(match.homeTeam.teamId);
    const away = records.get(match.awayTeam.teamId);
    const homeScore = Number(match.homeTeam.score);
    const awayScore = Number(match.awayTeam.score);
    updateStandingRecord(home, homeScore, awayScore);
    updateStandingRecord(away, awayScore, homeScore);
    const table = [...records.values()].sort(compareStandingRecords);
    const rank = table.findIndex((entry) => entry.teamId === targetTeamId) + 1;
    points.push({
      rank,
      label: match.roundLabel ?? (match.round ? `${match.round}節` : `${points.length + 1}`),
      matchId: match.id,
      kickoffAt: match.kickoffAt,
    });
  }
  return points;
}

function updateStandingRecord(record, goalsFor, goalsAgainst) {
  record.played += 1;
  record.goalsFor += goalsFor;
  record.goalsAgainst += goalsAgainst;
  record.goalDifference = record.goalsFor - record.goalsAgainst;
  if (goalsFor > goalsAgainst) {
    record.won += 1;
    record.points += 3;
  } else if (goalsFor === goalsAgainst) {
    record.drawn += 1;
    record.points += 1;
  } else {
    record.lost += 1;
  }
}

function compareStandingRecords(left, right) {
  return right.points - left.points
    || right.goalDifference - left.goalDifference
    || right.goalsFor - left.goalsFor
    || left.teamId.localeCompare(right.teamId);
}

function createHeadToHead(opponents, teamDirectory, period) {
  const entries = opponents.map((entry) => ({ ...entry, matches: entry.matches.filter((match) => period === "all" || match.period === period) })).filter((entry) => entry.matches.length);
  if (!entries.length) return createNotice("この期間の対戦記録はありません。");
  return element("div", { className: "h2h-list" }, entries.map((entry) => {
    const opponent = teamDirectory?.byId.get(entry.opponentTeamId);
    const summary = entry.matches.reduce((record, match) => {
      record[match.result] += 1; record.goalsFor += match.goalsFor; record.goalsAgainst += match.goalsAgainst; return record;
    }, { W: 0, D: 0, L: 0, goalsFor: 0, goalsAgainst: 0 });
    return element("details", { className: "h2h-card" }, [
      element("summary", {}, [
        createTeamEmblem(opponent, "team-emblem team-emblem--standing"),
        element("span", {}, [element("span", { text: "vs " }), createTeamNameLink(opponent, entry.opponentTeamId)]),
        element("span", { text: `${summary.W}勝 ${summary.D}分 ${summary.L}敗 / ${summary.goalsFor}-${summary.goalsAgainst}` }),
      ]),
      element("div", { className: "h2h-matches" }, entry.matches.map((match) => element("a", {
        attributes: { href: routeHref("match", { matchId: match.matchId }), "data-route": "match", "data-match-id": match.matchId },
      }, [
        element("span", { className: "h2h-match-date", text: formatH2hDate(match.kickoffAt) }),
        element("span", { className: "h2h-match-context", text: formatCompetitionContext(match) }),
        element("span", { text: match.side === "home" ? "Home" : "Away" }),
        element("strong", { text: `${{ W: "○", D: "△", L: "●" }[match.result]} ${match.goalsFor}-${match.goalsAgainst}` }),
      ]))),
    ]);
  }));
}

function formatCompetitionContext(match) {
  return `${match.season}年度 / ${match.leagueName} / ${match.stageName}`;
}

function formatH2hDate(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", month: "numeric", day: "numeric",
  }).format(new Date(value));
}

function competitionLabel(id, definitions = []) {
  return definitions.find((entry) => entry.id === id)?.name
    ?? (id?.includes("i-league") ? "Iリーグ" : id?.includes("division-2") ? "中国大学リーグ2部" : "中国大学リーグ");
}

function createTeamRegistrationSwitch(team, teamDirectory, matches, season, activeCompetitionId, definitions, activeTab) {
  const parentClubId = team.parentClubId ?? team.id;
  const relatedIds = new Set(
    [...teamDirectory.byId.values()]
      .filter((candidate) => (candidate.parentClubId ?? candidate.id) === parentClubId)
      .map((candidate) => candidate.id),
  );
  const options = new Map();
  for (const match of matches) {
    if (!relatedIds.has(match.homeTeam.teamId) && !relatedIds.has(match.awayTeam.teamId)) continue;
    const matchTeamId = relatedIds.has(match.homeTeam.teamId) ? match.homeTeam.teamId : match.awayTeam.teamId;
    const key = `${match.season}:${match.competitionId}:${matchTeamId}`;
    options.set(key, {
      season: match.season,
      competitionId: match.competitionId,
      teamId: matchTeamId,
      label: `${match.season} ${competitionLabel(match.competitionId, definitions)}｜${teamDirectory.byId.get(matchTeamId)?.shortName ?? matchTeamId}`,
    });
  }
  const sorted = [...options.values()].sort((a, b) => b.season - a.season || a.label.localeCompare(b.label, "ja"));
  if (sorted.length < 2) return null;
  const pickerOptions = sorted.map((option) => {
    const selected = option.season === season && option.competitionId === activeCompetitionId && option.teamId === team.id;
    return {
      ...option,
      selected,
      name: competitionLabel(option.competitionId, definitions),
      detail: teamDirectory.byId.get(option.teamId)?.shortName ?? option.teamId,
      icon: competitionIcon(option.competitionId),
      href: routeHref("team", {
          teamId: option.teamId,
          competitionId: option.competitionId,
          season: option.season,
          teamTab: activeTab,
        }),
      route: "team",
      data: {
        "data-route": "team",
        "data-team-id": option.teamId,
        "data-competition-id": option.competitionId,
        "data-season": option.season,
        "data-team-tab": activeTab,
      },
    };
  });
  const current = pickerOptions.find((option) => option.selected) ?? pickerOptions[0];
  return createProfileRegistrationPicker({ current, options: pickerOptions });
}

function competitionIcon(id = "") {
  if (id.includes("i-league")) return "Ⓘ";
  if (id.includes("rookie")) return "新";
  if (id.includes("championship")) return "杯";
  return "⚽";
}

function createInternalRankings(statistics, team) {
  const metrics = [["goals", "得点", "得点"], ["assists", "アシスト", "アシスト"], ["minutes", "出場時間", "分"]];
  return element("div", { className: "internal-ranking-grid" }, metrics.map(([metric, label, unit]) => {
    const value = (stats) => metric === "goalAssist" ? stats.goals + stats.assists : stats[metric];
    const rows = [...statistics.values()]
      .filter((stats) => stats.player.teamId === team.id && value(stats) > 0)
      .sort((a, b) => value(b) - value(a) || a.player.name.localeCompare(b.player.name, "ja"));
    return element("section", { className: metric === "goalAssist" ? "internal-ranking-panel" : "internal-ranking internal-ranking-panel" }, [
      element("h3", { text: label }),
      ...(rows.length ? rows.map((stats) => createPlayerLinkRow({ player: stats.player, team, metric: value(stats), metricLabel: unit })) : [createNotice("記録なし")]),
    ]);
  }));
}

function svgElement(name, attributes = {}) { const node = document.createElementNS("http://www.w3.org/2000/svg", name); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value)); return node; }
function svgText(x, y, text, className = "rank-chart__label") { const node = svgElement("text", { x, y, class: className }); node.textContent = text; return node; }
function signed(value) { return `${value > 0 ? "+" : ""}${value}`; }
function decimal(value) { return Number(value ?? 0).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1"); }
function nullableDecimal(value) { return value === null || value === undefined ? "－" : decimal(value); }

function createKitCard(team, type, label) {
  return element("div", { className: "team-kit-card" }, [
    createKitImage(team, type, "kit-icon kit-icon--profile"),
    element("strong", { text: label }),
  ]);
}

function createProfileRow(label, value) {
  return element("div", { className: "detail-row" }, [
    element("span", { text: label }),
    element("strong", { text: value }),
  ]);
}

function createStaffList(staff) {
  if (!staff.length) return createNotice("スタッフ情報は未掲載です。");
  return element(
    "div",
    { className: "staff-list" },
    staff.map((member) =>
      element("div", { className: "staff-row" }, [
        element("span", { text: member.role }),
        element("div", { className: "row-copy" }, [
          element("strong", { text: member.name }),
          element("span", {
            text: [member.englishName, member.license].filter(Boolean).join(" / "),
          }),
        ]),
      ]),
    ),
  );
}

function createSocialLinks(team) {
  const links = [
    ["Instagram", team.instagram],
    ["ホームページ", team.website],
  ];
  return element(
    "div",
    { className: "social-link-list" },
    links.map(([label, href]) =>
      href
        ? element("a", {
            className: "social-link",
            text: `${label} ↗`,
            attributes: { href, target: "_blank", rel: "noopener noreferrer" },
          })
        : element("span", { className: "social-link is-disabled", text: `${label} 未掲載` }),
    ),
  );
}

function createRoster(roster, team, statistics, favoritePlayerIds, allPlayers) {
  if (!roster.length) return createNotice("登録選手は未掲載です。");
  return element(
    "div",
    { className: "roster-list", attributes: { "data-roster-count": String(roster.length) } },
    [...roster].sort((left, right) =>
      positionOrder(left.position) - positionOrder(right.position)
      || (left.number ?? 999) - (right.number ?? 999)
      || left.name.localeCompare(right.name, "ja")).map((player) => {
      const stats = statistics.get(player.id);
      const followed = isSafelyFollowedPlayer(player, allPlayers, favoritePlayerIds);
      return element("a", {
        className: `squad-row player-row--link${followed ? " is-followed" : ""}`,
        attributes: {
          href: routeHref("player", { playerId: player.id }),
          "data-route": "player",
          "data-player-id": player.id,
          "data-source-competitions": [...new Set(stats?.matches?.map((match) => match.competitionId) ?? [])].join(","),
        },
      }, [
        element("strong", { className: "squad-row__number", text: String(player.number ?? "－") }),
        element("div", { className: "squad-row__name" }, [
          element("strong", { text: player.name }),
          element("span", { text: `${player.position ?? "－"}${followed ? " / ★ フォロー中" : ""}` }),
        ]),
        element("span", { text: `${stats?.appearances ?? 0}試合` }),
        element("span", { text: `${stats?.goals ?? 0}得点` }),
        element("span", { text: `${stats?.assists ?? 0}A` }),
      ]);
    }),
  );
}

function isSafelyFollowedPlayer(player, players, favoriteIds) {
  if (favoriteIds.includes(player.id)) return true;
  if (!player.birth) return false;
  const clubId = player.parentClubId ?? (player.competitionId ? null : player.teamId);
  if (!clubId) return false;
  return players.some((candidate) =>
    favoriteIds.includes(candidate.id)
    && candidate.birth === player.birth
    && normalizeRosterName(candidate.name) === normalizeRosterName(player.name)
    && (candidate.parentClubId ?? (candidate.competitionId ? null : candidate.teamId)) === clubId);
}

function normalizeRosterName(value) {
  return String(value ?? "").normalize("NFKC").replace(/[\s　]+/g, "").replaceAll("遙", "遥");
}

function positionOrder(position) {
  return ({ GK: 0, DF: 1, MF: 2, FW: 3 })[String(position ?? "").match(/GK|DF|MF|FW/)?.[0]] ?? 4;
}

function createProfileTabs(kind, active, tabs, context) {
  const list = element("nav", {
    className: `profile-tabs profile-tabs--${kind}`,
    attributes: { role: "tablist", "aria-label": `${kind === "team" ? "チーム" : "選手"}詳細` },
  }, tabs.map(([key, label]) => element("a", {
    className: `profile-tab${active === key ? " is-active" : ""}`,
    text: label,
    attributes: {
      href: routeHref(kind, { ...context, [`${kind}Tab`]: key }),
      "data-route": kind,
      [`data-${kind}-id`]: context[`${kind}Id`],
      [`data-${kind}-tab`]: key,
      "data-competition-id": context.competitionId ?? "",
      "data-season": context.season ?? "",
      role: "tab",
      "aria-selected": String(active === key),
      tabindex: active === key ? "0" : "-1",
    },
  })));
  list.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const links = [...list.querySelectorAll('[role="tab"]')];
    const index = links.indexOf(document.activeElement);
    const next = links[(index + (event.key === "ArrowRight" ? 1 : -1) + links.length) % links.length];
    event.preventDefault(); next.focus(); next.click();
  });
  return list;
}

function createCompactForm(matches, team, teamDirectory) {
  if (!matches.length) return createNotice("終了済みの試合はありません。");
  return element("div", { className: "team-form-strip" }, matches.map((match) => {
    const home = match.homeTeam.teamId === team.id;
    const opponent = getTeam(teamDirectory, (home ? match.awayTeam : match.homeTeam).teamId);
    const own = Number(home ? match.homeTeam.score : match.awayTeam.score);
    const other = Number(home ? match.awayTeam.score : match.homeTeam.score);
    const result = own > other ? ["win", "勝"] : own < other ? ["loss", "敗"] : ["draw", "分"];
    return element("a", {
      className: `team-form-tile team-recent-match is-${result[0]}`,
      attributes: {
        href: routeHref("match", { matchId: match.id }), "data-route": "match", "data-match-id": match.id,
        "aria-label": `${result[1]} ${own}対${other} ${opponent?.name ?? "対戦相手"}`,
      },
    }, [
      element("strong", { className: "team-form-tile__score", text: `${own}-${other}` }),
      createTeamEmblem(opponent, "team-emblem team-form-tile__emblem"),
    ]);
  }));
}

function createMiniStanding(standings, team, teamDirectory) {
  const index = standings.findIndex((row) => row.teamId === team.id);
  if (index < 0) return createNotice("この大会の順位表はありません。");
  const start = Math.max(0, Math.min(index - 1, standings.length - 3));
  return createUnifiedStandingTable(standings.slice(start, start + 3), teamDirectory, {
    highlightedTeamIds: [team.id],
    className: "team-mini-standing",
    showEmblems: true,
  });
}

function createProfileStanding(standings, team, teamDirectory) {
  if (!standings.length) return createNotice("この大会は通常リーグ形式の順位表を使用しません。");
  return element("div", { className: "team-profile-standing-wrap" }, [
    createUnifiedStandingTable(standings, teamDirectory, {
      highlightedTeamIds: [team.id],
      className: "team-profile-standing",
    }),
  ]);
}

function createFinalRankHistory(team, competitionId, leagueStats, teamDirectory) {
  const family = competitionId?.replace(/-20\\d\\d-/, "-YEAR-");
  const rows = [];
  for (const [season, seasonStats] of Object.entries(leagueStats ?? {})) {
    for (const [id, stats] of Object.entries(seasonStats.byCompetition ?? {})) {
      if (family && id.replace(/-20\\d\\d-/, "-YEAR-") !== family) continue;
      const row = stats?.periods?.all?.standings?.find((entry) => {
        const candidate = getTeam(teamDirectory, entry.teamId);
        return entry.teamId === team.id || (candidate?.parentClubId ?? candidate?.id) === (team.parentClubId ?? team.id);
      });
      if (row?.rank) rows.push([Number(season), row.rank]);
    }
  }
  rows.sort((a, b) => b[0] - a[0]);
  if (!rows.length) return createNotice("保存済みの最終順位はありません。");
  return element("ol", { className: "rank-history" }, rows.map(([season, rank]) =>
    element("li", {}, [element("strong", { text: String(season) }), element("span", { text: `${rank}位` })])));
}

function collectTeamTrophies(team, definitions, leagueStats, matches) {
  const names = new Set([team.name, team.shortName].filter(Boolean));
  const counts = new Map();
  const recorded = new Set();
  const add = (competition, type, season, sourceId = competition) => {
    const recordKey = `${season}:${sourceId}:${type}`;
    if (recorded.has(recordKey)) return;
    recorded.add(recordKey);
    const { key, label } = trophySeries(competition);
    const value = counts.get(key) ?? { name: label, winner: 0, runnerUp: 0, winnerSeasons: new Set(), runnerUpSeasons: new Set() };
    value[type] += 1;
    value[type === "winner" ? "winnerSeasons" : "runnerUpSeasons"].add(Number(season));
    counts.set(key, value);
  };
  for (const definition of definitions ?? []) {
    if (names.has(definition.results?.winner)) add(definition.name, "winner", definition.season, definition.id);
    if (names.has(definition.results?.runnerUp)) add(definition.name, "runnerUp", definition.season, definition.id);
  }
  for (const [season, data] of Object.entries(leagueStats ?? {})) {
    if (Number(season) >= 2026) continue;
    for (const [id, stats] of Object.entries(data.byCompetition ?? {})) {
      const table = stats?.periods?.all?.standings;
      if (!Array.isArray(table)) continue;
      const row = table.find((entry) => entry.teamId === team.id);
      if (row?.rank === 1) add(id, "winner", season, id);
      if (row?.rank === 2) add(id, "runnerUp", season, id);
    }
  }
  const leagueDefinitions = new Map((definitions ?? [])
    .filter((definition) => ["league", "i-league"].includes(definition.competitionType))
    .map((definition) => [definition.id, definition]));
  const grouped = new Map();
  for (const match of matches ?? []) {
    if (match.status !== "finished" || !leagueDefinitions.has(match.competitionId)) continue;
    const key = `${match.season}:${match.competitionId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), match]);
  }
  for (const group of grouped.values()) {
    const definition = leagueDefinitions.get(group[0].competitionId);
    const records = new Map([...new Set(group.flatMap((match) => [match.homeTeam.teamId, match.awayTeam.teamId]))]
      .map((teamId) => [teamId, {
        teamId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
      }]));
    for (const match of group) {
      if (!Number.isFinite(Number(match.homeTeam.score)) || !Number.isFinite(Number(match.awayTeam.score))) continue;
      updateStandingRecord(records.get(match.homeTeam.teamId), Number(match.homeTeam.score), Number(match.awayTeam.score));
      updateStandingRecord(records.get(match.awayTeam.teamId), Number(match.awayTeam.score), Number(match.homeTeam.score));
    }
    const row = [...records.values()].sort(compareStandingRecords).findIndex((entry) => entry.teamId === team.id) + 1;
    if (row === 1) add(definition.name, "winner", definition.season, definition.id);
    if (row === 2) add(definition.name, "runnerUp", definition.season, definition.id);
  }
  return [...counts.values()].map((value) => ({
    ...value,
    winnerSeasons: [...value.winnerSeasons].sort(),
    runnerUpSeasons: [...value.runnerUpSeasons].sort(),
  }));
}

function createTrophyList(trophies, detailed = false) {
  if (!trophies.length) return createNotice("保存済みデータで確認できるタイトルはありません。");
  return element("div", { className: "trophy-list" }, trophies.map((item) =>
    element("article", { className: "trophy-card" }, [
      element("strong", { text: item.name }),
      element("span", { text: `優勝 ${item.winner}回 / 準優勝 ${item.runnerUp}回` }),
      detailed ? element("small", {
        text: [
          item.winnerSeasons.length ? `優勝: ${item.winnerSeasons.join("・")}` : null,
          item.runnerUpSeasons.length ? `準優勝: ${item.runnerUpSeasons.join("・")}` : null,
          "保存済みデータのみ",
        ].filter(Boolean).join(" / "),
      }) : null,
    ])));
}

function trophySeries(value) {
  const text = String(value ?? "");
  if (/i-league/i.test(text)) return { key: "i-league", label: "Iリーグ" };
  if (/新人戦|rookie/i.test(text)) return { key: "rookie", label: "中国大学サッカー新人戦" };
  if (/選手権|championship/i.test(text)) return { key: "championship", label: "中国大学サッカー選手権" };
  if (/入替|promotion-relegation/i.test(text)) return { key: "promotion-relegation", label: "1部・2部入替戦" };
  if (/昇格|playoff/i.test(text)) return { key: "promotion-playoff", label: "昇格プレーオフ" };
  if (/division-2|2部/.test(text)) return { key: "league-division-2", label: "中国大学サッカーリーグ2部" };
  if (/division-1|1部|中国大学サッカーリーグ/.test(text)) return { key: "league-division-1", label: "中国大学サッカーリーグ1部" };
  return { key: text.replace(/20\d{2}/g, "YEAR"), label: text.replace(/20\d{2}年度?/g, "").trim() || "大会" };
}

function createVenueInformation(team) {
  const rows = [["ホームグラウンド", team.homeGround], ["ホームタウン", team.hometown], ["所在地", team.address], ["最寄り駅", team.nearestStation], ["車でのアクセス", team.carAccess]];
  return element("div", { className: "detail-list" }, rows.map(([label, value]) => createProfileRow(label, value || "－")));
}

function createTimelineMatches(matches, team, teamDirectory) {
  if (!matches.length) return createNotice("該当する試合はありません。");
  const sorted = [...matches].sort((a, b) => new Date(a.kickoffAt) - new Date(b.kickoffAt));
  const list = element("div", { className: "match-list team-match-timeline" }, sorted.map((match) => createMatchRow(match, teamDirectory)));
  const pivot = sorted.find((match) => match.status !== "finished");
  if (pivot) requestAnimationFrame(() => list.querySelector(`[data-match-id="${CSS.escape(pivot.id)}"]`)?.scrollIntoView({ block: "center" }));
  return list;
}

function createCompetitionTeamStats(matches) {
  const createPeriod = (periodMatches) => {
    const teamIds = [...new Set(periodMatches.flatMap((match) => [match.homeTeam.teamId, match.awayTeam.teamId]).filter(Boolean))];
    const records = new Map(teamIds.map((teamId) => [teamId, {
      teamId,
      overall: emptyRecord(),
      home: emptyRecord(),
      away: emptyRecord(),
      yellowCards: 0,
      redCards: 0,
      cleanSheets: 0,
    }]));
    for (const match of periodMatches) {
      const homeScore = Number(match.homeTeam.score);
      const awayScore = Number(match.awayTeam.score);
      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;
      const home = records.get(match.homeTeam.teamId);
      const away = records.get(match.awayTeam.teamId);
      updateRecord(home.overall, homeScore, awayScore);
      updateRecord(home.home, homeScore, awayScore);
      updateRecord(away.overall, awayScore, homeScore);
      updateRecord(away.away, awayScore, homeScore);
      if (awayScore === 0) home.cleanSheets += 1;
      if (homeScore === 0) away.cleanSheets += 1;
      home.yellowCards += countCards(match.disciplinary?.home, false);
      home.redCards += countCards(match.disciplinary?.home, true);
      away.yellowCards += countCards(match.disciplinary?.away, false);
      away.redCards += countCards(match.disciplinary?.away, true);
    }
    const rankRecords = (key) => [...records.values()]
      .map((entry) => ({ teamId: entry.teamId, ...entry[key] }))
      .sort(compareStandingRecords)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
    const standings = rankRecords("overall");
    const homeStandings = rankRecords("home");
    const awayStandings = rankRecords("away");
    const teams = standings.map((standing) => {
      const entry = records.get(standing.teamId);
      return {
        teamId: standing.teamId,
        rank: standing.rank,
        overall: entry.overall,
        home: entry.home,
        away: entry.away,
        stats: {
          averageGoals: entry.overall.played ? entry.overall.goalsFor / entry.overall.played : null,
          averageConceded: entry.overall.played ? entry.overall.goalsAgainst / entry.overall.played : null,
          cleanSheets: entry.cleanSheets,
          yellowCards: entry.yellowCards,
          redCards: entry.redCards,
        },
      };
    });
    return { standings, homeStandings, awayStandings, teams, rankings: {} };
  };
  return {
    periods: {
      all: createPeriod(matches),
      first: createPeriod(matches.filter((match) => Number(match.round) <= 9)),
      second: createPeriod(matches.filter((match) => Number(match.round) > 9)),
    },
  };
}

function emptyRecord() {
  return { played: 0, won: 0, drawn: 0, lost: 0, points: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 };
}

function updateRecord(record, goalsFor, goalsAgainst) {
  record.played += 1;
  record.goalsFor += goalsFor;
  record.goalsAgainst += goalsAgainst;
  record.goalDifference = record.goalsFor - record.goalsAgainst;
  if (goalsFor > goalsAgainst) { record.won += 1; record.points += 3; }
  else if (goalsFor === goalsAgainst) { record.drawn += 1; record.points += 1; }
  else record.lost += 1;
}

function countCards(entries = [], redOnly) {
  return entries.filter((entry) => redOnly
    ? /(?:^|\s)(?:CS|S[1-9])(?:\s|$)/.test(String(entry))
    : /(?:^|\s)C[1-9](?:\s|$)/.test(String(entry))).length;
}

function createHomeAwayOverview(analytics, activeStats, team) {
  const rankFor = (key) => activeStats?.periods?.all?.[key]?.find((entry) => entry.teamId === team.id)?.rank;
  const rows = [
    ["総合", analytics?.rank, analytics?.overall, "●"],
    ["ホーム", rankFor("homeStandings"), analytics?.home, "⌂"],
    ["アウェー", rankFor("awayStandings"), analytics?.away, "↗"],
  ];
  return element("div", { className: "home-away-card" }, [
    element("header", {}, [
      element("div", {}, [element("span", { text: "勝点" }), element("strong", { text: String(analytics?.overall?.points ?? "－") })]),
      element("span", { text: `総合順位 ${analytics?.rank ? `${analytics.rank}位` : "－"}` }),
    ]),
    element("div", { className: "home-away-table" }, [
      element("div", { className: "home-away-row home-away-row--header" },
        ["", "試", "勝", "分", "敗", "得-失", "差", "点"].map((label) => element("span", { text: label }))),
      ...rows.map(([label, rank, record = {}, icon]) => element("div", {
        className: "home-away-row",
        attributes: {
          "data-record-scope": label,
          "data-played": record?.played ?? "",
          "data-goals-for": record?.goalsFor ?? "",
          "data-goals-against": record?.goalsAgainst ?? "",
        },
      }, [
        element("strong", { text: `${icon} ${label}`, attributes: { "aria-label": `${label} ${rank ? `${rank}位` : "順位未掲載"}` } }),
        element("span", { text: String(record?.played ?? "－") }),
        element("span", { text: String(record?.won ?? "－") }),
        element("span", { text: String(record?.drawn ?? "－") }),
        element("span", { text: String(record?.lost ?? "－") }),
        element("span", { text: record?.goalsFor == null || record?.goalsAgainst == null ? "－" : `${record.goalsFor}-${record.goalsAgainst}` }),
        element("span", { text: record?.goalDifference == null ? "－" : signed(record.goalDifference) }),
        element("span", { text: String(record?.points ?? "－") }),
      ])),
    ]),
  ]);
}

function createGoalClassification(matches, team) {
  const values = {
    "オープンプレー": 0,
    "コーナーキック": 0,
    "フリーキック": 0,
    "PK": 0,
    "オウンゴール": 0,
    "その他セットプレー": 0,
    "分類不明": 0,
  };
  for (const match of matches) for (const goal of match.goals ?? []) {
    const sideTeam = goal.teamId ?? (goal.teamName === match.homeTeam.name ? match.homeTeam.teamId : goal.teamName === match.awayTeam.name ? match.awayTeam.teamId : null);
    if (sideTeam !== team.id) continue;
    const buildUpActions = (goal.buildUp ?? []).map((entry) => String(entry.action ?? "").toUpperCase());
    if (goal.finish === "O.G" || goal.scorerName === "オウンゴール") values["オウンゴール"] += 1;
    else if (String(goal.finish).toUpperCase() === "PK") values.PK += 1;
    else if (String(goal.finish).toUpperCase() === "FK" || buildUpActions.includes("FK")) values["フリーキック"] += 1;
    else if (String(goal.finish).toUpperCase() === "CK" || buildUpActions.includes("CK")) values["コーナーキック"] += 1;
    else values["分類不明"] += 1;
  }
  const max = Math.max(1, ...Object.values(values));
  return element("div", {
    className: "goal-classification",
    attributes: { "data-source-match-ids": matches.map((match) => match.id).join(",") },
  }, Object.entries(values).map(([label, value]) =>
    element("div", { className: "comparison-bar-row" }, [
      element("span", { text: label }), element("span", { className: "comparison-bar", attributes: { style: `--value:${value / max * 100}%` } }),
      element("strong", { text: String(value) }),
    ])));
}

function createExpandableRankings(statistics, team, competitionId) {
  const metrics = [["goals", "得点", "得点"], ["assists", "アシスト", "アシスト"], ["minutes", "出場時間", "分"]];
  return element("div", { className: "internal-ranking-grid" }, metrics.map(([metric, label, unit]) => {
    const rows = [...statistics.values()]
      .filter((stats) => stats.player.teamId === team.id && Number(stats[metric]) > 0)
      .sort((left, right) => right[metric] - left[metric] || left.player.name.localeCompare(right.player.name, "ja"));
    const list = element("div", { className: "internal-ranking-rows" });
    const render = (expanded = false) => list.replaceChildren(...(rows.length
      ? rows.slice(0, expanded ? rows.length : 3)
        .map((stats) => {
          const row = createPlayerLinkRow({ player: stats.player, team, metric: stats[metric], metricLabel: unit });
          row.dataset.sourceCompetitions = [...new Set(stats.matches.map((match) => match.competitionId))].join(",");
          row.dataset.competitionId = competitionId ?? "";
          return row;
        })
      : [createNotice("記録なし")]));
    const button = element("button", { className: "text-button", text: "すべて見る", attributes: { type: "button", "aria-expanded": "false" } });
    button.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(expanded));
      button.textContent = expanded ? "閉じる" : "すべて見る";
      render(expanded);
    });
    render();
    return element("section", { className: "internal-ranking-panel" }, [
      element("h3", { text: label }), list, rows.length > 3 ? button : null,
    ]);
  }));
}

function createImportantStats(activeStats, team, teamDirectory) {
  const teams = activeStats?.periods?.all?.teams ?? [];
  const metrics = [["平均得点", "averageGoals", true], ["平均被得点", "averageConceded", false], ["無失点数", "cleanSheets", true]];
  return element("div", { className: "important-stat-list" }, metrics.map(([label, key, descending]) => {
    const sorted = [...teams]
      .filter((entry) => Number.isFinite(entry.stats?.[key]))
      .sort((a, b) => (descending ? b.stats[key] - a.stats[key] : a.stats[key] - b.stats[key]) || a.teamId.localeCompare(b.teamId));
    const own = sorted.find((entry) => entry.teamId === team.id);
    const rows = sorted.slice(0, 3).some((entry) => entry.teamId === team.id) ? sorted.slice(0, 3) : [...sorted.slice(0, 2), own].filter(Boolean);
    return element("section", {}, [element("h3", { text: label }), ...rows.map((entry) => element("div", { className: entry.teamId === team.id ? "is-highlighted metric-row" : "metric-row" }, [
      createMetricTeam(sorted.indexOf(entry) + 1, entry.teamId, entry.teamName, teamDirectory),
      element("strong", { text: String(entry.stats?.[key] ?? "－") }),
    ]))]);
  }));
}

function createCategoryLeagueStats(category, activeStats, matches, team, teamDirectory) {
  const analytics = activeStats?.periods?.all?.teams ?? [];
  const standingIds = activeStats?.periods?.all?.standings?.map((entry) => entry.teamId) ?? analytics.map((entry) => entry.teamId);
  const matchMetrics = calculateOfficialMatchMetrics(matches, standingIds);
  const definitions = {
    attack: [
      ["平均得点", (entry) => entry.stats?.averageGoals, true],
      ["1試合平均シュート", (entry) => matchMetrics.get(entry.teamId)?.averageShots, true],
      ["PK獲得数", (entry) => matchMetrics.get(entry.teamId)?.penaltiesFor, true],
    ],
    defence: [
      ["平均被得点", (entry) => entry.stats?.averageConceded, false],
      ["無失点数", (entry) => entry.stats?.cleanSheets, true],
      ["PK献上数", (entry) => matchMetrics.get(entry.teamId)?.penaltiesAgainst, false],
    ],
    discipline: [
      ["1試合平均ファウル", (entry) => matchMetrics.get(entry.teamId)?.averageFouls, false],
      ["イエローカード数", (entry) => entry.stats?.yellowCards, false],
      ["レッドカード数", (entry) => entry.stats?.redCards, false],
    ],
  }[category];
  return element("div", { className: "league-category-stats" }, definitions.map(([label, getter, descending]) => {
    const values = analytics
      .map((entry) => ({ entry, value: getter(entry) }))
      .filter(({ value }) => Number.isFinite(value));
    if (!values.length) {
      return element("section", { className: "league-metric-ranking" }, [
        element("h3", { text: label }),
        createNotice("公式記録未掲載"),
      ]);
    }
    values.sort((left, right) => (descending ? right.value - left.value : left.value - right.value) || left.entry.teamId.localeCompare(right.entry.teamId));
    const own = values.find(({ entry }) => entry.teamId === team.id);
    const rows = values.slice(0, 3).some(({ entry }) => entry.teamId === team.id) ? values.slice(0, 3) : [...values.slice(0, 3), own].filter(Boolean);
    return element("section", { className: "league-metric-ranking" }, [
      element("h3", { text: label }),
      ...rows.map(({ entry, value }) => element("div", {
        className: `metric-row${entry.teamId === team.id ? " is-highlighted" : ""}`,
      }, [
        createMetricTeam(values.findIndex((item) => item.entry.teamId === entry.teamId) + 1, entry.teamId, entry.teamName, teamDirectory),
        element("strong", { text: formatMetricValue(value, label) }),
      ])),
    ]);
  }));
}

function createMetricTeam(rank, teamId, fallbackName, teamDirectory) {
  const metricTeam = getTeam(teamDirectory, teamId);
  return element("span", { className: "metric-team" }, [
    element("b", { text: `${rank}.` }),
    createTeamEmblem(metricTeam, "team-emblem metric-team__emblem"),
    element("span", { text: metricTeam?.name ?? fallbackName ?? teamId }),
  ]);
}

function calculateOfficialMatchMetrics(matches, teamIds) {
  const metrics = new Map(teamIds.map((teamId) => [teamId, {
    shotTotal: 0,
    shotMatches: 0,
    foulTotal: 0,
    foulMatches: 0,
    // 保存データは成功したPK得点しか網羅しないため、PK獲得・献上数へ流用しない。
    penaltiesFor: null,
    penaltiesAgainst: null,
  }]));
  for (const match of matches) {
    for (const side of ["home", "away"]) {
      const teamId = match[`${side}Team`]?.teamId;
      const entry = metrics.get(teamId);
      if (!entry) continue;
      const official = match.manualStatistics?.[side];
      if (Number.isFinite(official?.shots)) {
        entry.shotTotal += official.shots;
        entry.shotMatches += 1;
      }
      if (Number.isFinite(official?.fouls)) {
        entry.foulTotal += official.fouls;
        entry.foulMatches += 1;
      }
    }
  }
  for (const entry of metrics.values()) {
    entry.averageShots = entry.shotMatches ? entry.shotTotal / entry.shotMatches : null;
    entry.averageFouls = entry.foulMatches ? entry.foulTotal / entry.foulMatches : null;
  }
  return metrics;
}

function formatMetricValue(value, label) {
  if (!Number.isFinite(value)) return "－";
  return label.includes("平均") ? decimal(value) : String(value);
}
