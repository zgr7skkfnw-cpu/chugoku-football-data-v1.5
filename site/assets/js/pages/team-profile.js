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
import { selectPlayerStatisticsPeriod } from "../utils/players.js";

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
  const roster = (hasSeasonRoster ? players : [])
    .filter((player) => player.teamId === team.id)
    .sort((left, right) => (left.number ?? 999) - (right.number ?? 999));
  const staff = team.staff ?? [];
  const isFavorite = favoriteTeamIds.includes(team.id);
  const competitionStatsById = leagueStats?.[selectedSeason]?.byCompetition ?? {};
  const opponents = headToHead?.items?.find((entry) => entry.teamId === team.id)?.opponents ?? [];
  const periodPlayerStats = selectPlayerStatisticsPeriod(playerStatistics, seasonPeriod);
  const selectedCompetitionId = routedCompetitionId ?? team.competitionId
    ?? matches.find((match) => match.season === selectedSeason && (match.homeTeam.teamId === team.id || match.awayTeam.teamId === team.id))?.competitionId;
  const activeTeamStats = competitionStatsById[selectedCompetitionId]
    ?? (!routedCompetitionId
      ? Object.values(competitionStatsById).find((stats) => stats?.periods?.all?.teams?.some((entry) => entry.teamId === team.id)) ?? teamStats
      : null);
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
  const favoriteButton = element("button", {
    className: `favorite-button${isFavorite ? " is-active" : ""}`,
    text: isFavorite ? "♥ フォロー中" : "♡ フォローする",
    attributes: { type: "button", "aria-pressed": String(isFavorite) },
  });
  favoriteButton.addEventListener("click", () => {
    const nextTeamIds = toggleFavoriteTeam(favoriteTeamIds, team.id);
    setState({ favoriteTeamIds: nextTeamIds });
  });
  const registrationSwitch = createTeamRegistrationSwitch(team, teamDirectory, matches, selectedSeason, selectedCompetitionId, competitionDefinitions);
  const standings = activeTeamStats?.periods?.all?.standings ?? [];
  const trophies = collectTeamTrophies(team, competitionDefinitions, leagueStats);
  const tabContent = {
    overview: element("div", { className: "section-stack" }, [
      createPanel("次の試合", createNextMatch(upcomingMatches, team, teamDirectory), upcomingMatches.length ? "直近の公式日程" : "未定"),
      createPanel("チームフォーム", createCompactForm(finishedMatches.slice(0, 5), team, teamDirectory), `${Math.min(finishedMatches.length, 5)}試合`),
      createPanel("ミニ順位表", createMiniStanding(standings, team, teamDirectory), "現在順位"),
      createPanel("リーグ表での順位履歴", createFinalRankHistory(team, selectedCompetitionId, leagueStats, teamDirectory), "保存済みシーズン"),
      createPanel("トロフィー", createTrophyList(trophies), "保存済みデータのみ"),
      createPanel("競技場情報", createVenueInformation(team), "公式・登録済み情報"),
    ]),
    matches: createPanel("試合", createTimelineMatches(seasonMatches, team, teamDirectory), `${seasonMatches.length}試合`),
    standings: createPanel("順位表", createProfileStanding(standings, team, teamDirectory), competitionLabel(selectedCompetitionId, competitionDefinitions)),
    stats: element("div", { className: "section-stack" }, [
      createPanel("ホーム／アウェー別成績", createHomeAwayOverview(analytics, activeTeamStats, team), "選択大会"),
      createPanel("ゴール数", createGoalClassification(finishedMatches, team), "公式記録で判別できる範囲"),
      hasSeasonRoster ? createPanel("トッププレイヤー", createExpandableRankings(periodPlayerStats, team), "チーム内") : null,
      createPanel("重要スタッツ", createImportantStats(activeTeamStats, team), "リーグ比較"),
      createPanel("攻撃", createAttackStats(analytics, finishedMatches, team), "公式掲載値のみ"),
      createPanel("守備", createDefenceStats(analytics, finishedMatches, team), "公式掲載値のみ"),
      createPanel("反則", createDisciplineStats(analytics), "公式掲載値のみ"),
    ]),
    squad: hasSeasonRoster
      ? createPanel("スカッド", createRoster(roster, team, periodPlayerStats, favoritePlayerIds, players), `${roster.length}選手`)
      : createNotice(`${selectedSeason}年度の大会別選手名簿は未整備です。`),
    trophies: createPanel("トロフィー", createTrophyList(trophies, true), "保存済みデータの対象期間"),
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
        element("div", {}, [
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
        registrationSwitch,
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
  return element("section", { className: "split-record" }, [
    element("h3", { text: label }),
    createRecordSummary(record),
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

function createRankChart(points = [], period) {
  if (!points.length) return createNotice("この期間の順位推移はまだありません。");
  const width = 640;
  const height = 260;
  const left = 42;
  const top = 24;
  const chartWidth = 570;
  const chartHeight = 190;
  const range = period === "first" ? [1, 9] : period === "second" ? [10, 18] : [1, 18];
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "節ごとの順位推移グラフ" });
  for (let rank = 1; rank <= 10; rank += 1) {
    const y = top + ((rank - 1) / 9) * chartHeight;
    svg.append(
      svgElement("line", { x1: left, x2: left + chartWidth, y1: y, y2: y, class: "rank-chart__grid" }),
      svgText(8, y + 4, `${rank}位`),
    );
  }
  const coordinates = points.map((point) => ({
    ...point,
    x: left + ((point.round - range[0]) / Math.max(1, range[1] - range[0])) * chartWidth,
    y: top + ((point.rank - 1) / 9) * chartHeight,
  }));
  svg.append(svgElement("polyline", { points: coordinates.map((point) => `${point.x},${point.y}`).join(" "), class: "rank-chart__line" }));
  for (const point of coordinates) {
    svg.append(
      svgElement("circle", { cx: point.x, cy: point.y, r: 5, class: "rank-chart__point" }),
      svgText(point.x - 8, height - 15, `${point.round}節`, "rank-chart__round"),
    );
  }
  return element("div", { className: "rank-chart" }, [svg]);
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

function createTeamRegistrationSwitch(team, teamDirectory, matches, season, activeCompetitionId, definitions) {
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
  return element("nav", { className: "profile-registration-switch", attributes: { "aria-label": "大会・シーズン登録" } }, sorted.map((option) =>
    element("a", {
      className: `filter-chip${option.season === season && option.competitionId === activeCompetitionId && option.teamId === team.id ? " is-active" : ""}`,
      text: option.label,
      attributes: {
        href: routeHref("team", { teamId: option.teamId, competitionId: option.competitionId, season: option.season }),
        "data-route": "team",
        "data-team-id": option.teamId,
        "data-competition-id": option.competitionId,
        "data-season": option.season,
        "aria-current": option.season === season && option.competitionId === activeCompetitionId && option.teamId === team.id ? "page" : "false",
      },
    }),
  ));
}

function createInternalRankings(statistics, team) {
  const metrics = [["goals", "得点", "得点"], ["assists", "アシスト", "アシスト"], ["goalAssist", "G＋A", "G＋A"], ["minutes", "出場時間", "分"]];
  return element("div", { className: "internal-ranking-grid" }, metrics.map(([metric, label, unit]) => {
    const value = (stats) => metric === "goalAssist" ? stats.goals + stats.assists : stats[metric];
    const rows = [...statistics.values()].filter((stats) => stats.player.teamId === team.id && value(stats) > 0).sort((a, b) => value(b) - value(a) || a.player.name.localeCompare(b.player.name, "ja")).slice(0, 5);
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
    roster.map((player) => {
      const stats = statistics.get(player.id);
      const followed = isSafelyFollowedPlayer(player, allPlayers, favoritePlayerIds);
      return element("a", {
        className: `squad-row player-row--link${followed ? " is-followed" : ""}`,
        attributes: {
          href: routeHref("player", { playerId: player.id }),
          "data-route": "player",
          "data-player-id": player.id,
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
      element("span", { text: result[1] }),
    ]);
  }));
}

function createMiniStanding(standings, team, teamDirectory) {
  const index = standings.findIndex((row) => row.teamId === team.id);
  if (index < 0) return createNotice("この大会の順位表はありません。");
  const start = Math.max(0, Math.min(index - 1, standings.length - 3));
  return createStandingRows(standings.slice(start, start + 3), team, teamDirectory, true);
}

function createProfileStanding(standings, team, teamDirectory) {
  if (!standings.length) return createNotice("この大会は通常リーグ形式の順位表を使用しません。");
  const table = element("table", { className: "prematch-standing-table is-full team-profile-standing" });
  table.append(
    element("thead", {}, [element("tr", {}, ["順", "チーム", "試", "勝", "分", "敗", "得", "失", "差", "点"].map((label) => element("th", { text: label })))]),
    element("tbody", {}, standings.map((row) => standingRow(row, team, teamDirectory, false))),
  );
  return element("div", { className: "team-profile-standing-wrap" }, [table]);
}

function createStandingRows(rows, team, teamDirectory) {
  const table = element("table", { className: "prematch-standing-table is-compact team-mini-standing" });
  table.append(
    element("thead", {}, [element("tr", {}, ["順", "チーム", "試", "差", "点"].map((label) => element("th", { text: label })))]),
    element("tbody", {}, rows.map((row) => standingRow(row, team, teamDirectory, true))),
  );
  return table;
}

function standingRow(row, activeTeam, teamDirectory, compact) {
  const candidate = getTeam(teamDirectory, row.teamId);
  const cells = compact
    ? [row.rank, candidate?.shortName ?? candidate?.name ?? row.teamId, row.played, signed(row.goalDifference), row.points]
    : [row.rank, candidate?.shortName ?? candidate?.name ?? row.teamId, row.played, row.won, row.drawn, row.lost, row.goalsFor, row.goalsAgainst, signed(row.goalDifference), row.points];
  return element("tr", { className: row.teamId === activeTeam.id ? "is-highlighted" : "", attributes: { "data-team-id": row.teamId } },
    cells.map((value, index) => element("td", { text: String(value ?? "－"), className: index === 1 ? "team-cell" : "" })));
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

function collectTeamTrophies(team, definitions, leagueStats) {
  const names = new Set([team.name, team.shortName].filter(Boolean));
  const counts = new Map();
  const add = (competition, type, season) => {
    const key = competition || "大会";
    const value = counts.get(key) ?? { winner: 0, runnerUp: 0, seasons: new Set() };
    value[type] += 1; value.seasons.add(season); counts.set(key, value);
  };
  for (const definition of definitions ?? []) {
    if (names.has(definition.results?.winner)) add(definition.name, "winner", definition.season);
    if (names.has(definition.results?.runnerUp)) add(definition.name, "runnerUp", definition.season);
  }
  for (const [season, data] of Object.entries(leagueStats ?? {})) {
    if (Number(season) >= 2026) continue;
    for (const [id, stats] of Object.entries(data.byCompetition ?? {})) {
      const table = stats?.periods?.all?.standings;
      if (!Array.isArray(table)) continue;
      const row = table.find((entry) => entry.teamId === team.id);
      if (row?.rank === 1) add(id, "winner", season);
      if (row?.rank === 2) add(id, "runnerUp", season);
    }
  }
  return [...counts].map(([name, value]) => ({ name, ...value, seasons: [...value.seasons].sort() }));
}

function createTrophyList(trophies, detailed = false) {
  if (!trophies.length) return createNotice("保存済みデータで確認できるタイトルはありません。");
  return element("div", { className: "trophy-list" }, trophies.map((item) =>
    element("article", { className: "trophy-card" }, [
      element("strong", { text: item.name }),
      element("span", { text: `優勝 ${item.winner}回 / 準優勝 ${item.runnerUp}回` }),
      detailed ? element("small", { text: `確認対象: ${item.seasons.join("・")}` }) : null,
    ])));
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

function createHomeAwayOverview(analytics, activeStats, team) {
  const rankFor = (key) => activeStats?.periods?.all?.[key]?.find((entry) => entry.teamId === team.id)?.rank;
  return element("div", { className: "home-away-grid" }, [
    createSplitRecord(`ホーム ${rankFor("homeStandings") ? `${rankFor("homeStandings")}位` : "－"}`, analytics?.home),
    createSplitRecord(`アウェー ${rankFor("awayStandings") ? `${rankFor("awayStandings")}位` : "－"}`, analytics?.away),
  ]);
}

function createGoalClassification(matches, team) {
  const values = { "オープンプレー": 0, "セットプレー": 0, "フリーキック": 0, "PK": 0, "オウンゴール": 0, "分類不明": 0 };
  for (const match of matches) for (const goal of match.goals ?? []) {
    const sideTeam = goal.teamId ?? (goal.teamName === match.homeTeam.name ? match.homeTeam.teamId : goal.teamName === match.awayTeam.name ? match.awayTeam.teamId : null);
    if (sideTeam !== team.id) continue;
    if (goal.finish === "O.G" || goal.scorerName === "オウンゴール") values["オウンゴール"] += 1;
    else if (goal.finish === "PK") values.PK += 1;
    else if (String(goal.finish).toUpperCase() === "FK") values["フリーキック"] += 1;
    else if (goal.finish === "CK") values["セットプレー"] += 1;
    else values["分類不明"] += 1;
  }
  const max = Math.max(1, ...Object.values(values));
  return element("div", { className: "goal-classification" }, Object.entries(values).map(([label, value]) =>
    element("div", { className: "comparison-bar-row" }, [
      element("span", { text: label }), element("span", { className: "comparison-bar", attributes: { style: `--value:${value / max * 100}%` } }),
      element("strong", { text: String(value) }),
    ])));
}

function createExpandableRankings(statistics, team) {
  const container = createInternalRankings(statistics, team);
  container.classList.add("is-collapsed");
  const button = element("button", { className: "text-button", text: "すべて見る", attributes: { type: "button", "aria-expanded": "false" } });
  button.addEventListener("click", () => { const open = container.classList.toggle("is-expanded"); button.textContent = open ? "折りたたむ" : "すべて見る"; button.setAttribute("aria-expanded", String(open)); });
  return element("div", {}, [container, button]);
}

function createImportantStats(activeStats, team) {
  const teams = activeStats?.periods?.all?.teams ?? [];
  const metrics = [["平均得点", "averageGoals", true], ["平均被失点", "averageConceded", false], ["無失点", "cleanSheets", true]];
  return element("div", { className: "important-stat-list" }, metrics.map(([label, key, descending]) => {
    const sorted = [...teams].sort((a, b) => (descending ? b.stats?.[key] - a.stats?.[key] : a.stats?.[key] - b.stats?.[key]));
    const own = sorted.find((entry) => entry.teamId === team.id);
    const rows = sorted.slice(0, 3).some((entry) => entry.teamId === team.id) ? sorted.slice(0, 3) : [...sorted.slice(0, 2), own].filter(Boolean);
    return element("section", {}, [element("h3", { text: label }), ...rows.map((entry, index) => element("div", { className: entry.teamId === team.id ? "is-highlighted metric-row" : "metric-row" }, [element("span", { text: `${index + 1}. ${entry.teamName ?? entry.teamId}` }), element("strong", { text: String(entry.stats?.[key] ?? "－") })]))]);
  }));
}

function createAttackStats(analytics, matches, team) {
  const recorded = matches.filter((match) => match.manualStatistics && (match.homeTeam.teamId === team.id || match.awayTeam.teamId === team.id));
  const shots = recorded.map((match) => match.manualStatistics?.[match.homeTeam.teamId === team.id ? "home" : "away"]?.shots).filter(Number.isFinite);
  return metricGrid([["平均得点数", nullableDecimal(analytics?.stats?.averageGoals)], ["1試合当たりシュート数", shots.length ? decimal(shots.reduce((a, b) => a + b, 0) / shots.length) : "－"], ["PK獲得数", countPenaltyGoals(matches, team)]]);
}
function createDefenceStats(analytics, matches, team) { return metricGrid([["平均被失点数", nullableDecimal(analytics?.stats?.averageConceded)], ["無失点数", analytics?.stats?.cleanSheets ?? "－"], ["PK献上数", countPenaltyGoals(matches, team, true)]]); }
function createDisciplineStats(analytics) { return metricGrid([["1試合当たりファウル数", "－"], ["イエローカード数", analytics?.stats?.yellowCards ?? "－"], ["レッドカード数", analytics?.stats?.redCards ?? "－"]]); }
function metricGrid(values) { return element("div", { className: "team-record-grid" }, values.map(([label, value]) => element("div", { className: "team-record-stat" }, [element("strong", { text: String(value) }), element("span", { text: label })]))); }
function countPenaltyGoals(matches, team, conceded = false) { return matches.reduce((sum, match) => sum + (match.goals ?? []).filter((goal) => goal.finish === "PK" && (conceded ? goal.teamName !== (match.homeTeam.teamId === team.id ? match.homeTeam.name : match.awayTeam.name) : goal.teamName === (match.homeTeam.teamId === team.id ? match.homeTeam.name : match.awayTeam.name))).length, 0); }
