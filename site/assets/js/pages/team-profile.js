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

  return element(
    "article",
    {
      className: "page team-profile",
      attributes: { "data-page": "team", "data-team-id": team.id },
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
        createTeamRegistrationSwitch(team, teamDirectory, matches, selectedSeason, selectedCompetitionId, competitionDefinitions),
        createSeasonPeriodTabs(seasonPeriod),
        createPanel("次の試合", createNextMatch(upcomingMatches, team, teamDirectory), upcomingMatches.length ? "直近の公式日程" : "未定"),
        createPanel("直近5試合", createRecentMatches(finishedMatches.slice(0, 5), team, teamDirectory), `${Math.min(finishedMatches.length, 5)}試合`),
        createPanel("今季戦績", createRecordSummary(analytics?.overall, analytics?.stats), analytics?.rank ? `${analytics.rank}位` : "–"),
        hasSeasonRoster
          ? createPanel("チーム内選手ランキング", createInternalRankings(periodPlayerStats, team), "TOP 5")
          : null,
        hasSeasonRoster
          ? createPanel("スカッド", createRoster(roster, team, periodPlayerStats, favoritePlayerIds, players), `${roster.length}選手`)
          : createNotice(`${selectedSeason}年度の大会別選手名簿は未整備です。`),
        createPanel("ホーム・アウェイ成績", createHomeAwayRecords(analytics), "試合結果"),
        createPanel("終了試合", createTeamMatchList(finishedMatches, teamDirectory), `${finishedMatches.length}試合`),
        upcomingMatches.length > 1
          ? createPanel("今後の日程", createTeamMatchList(upcomingMatches.slice(1), teamDirectory), `${upcomingMatches.length - 1}試合 / すべて見る`)
          : null,
        createPanel("チームスタッツ", createTeamStatGrid(analytics?.stats), "シーズン分析"),
        createPanel("順位推移", createRankChart(analytics?.rankProgression, seasonPeriod), "各節終了時"),
        createPanel("Head to Head", createHeadToHead(opponents, teamDirectory, seasonPeriod), "対戦成績"),
        createPanel(
          "ユニフォーム",
          element("div", { className: "team-kits" }, [
            createKitCard(team, "home", "ホーム"),
            createKitCard(team, "away", "アウェイ"),
          ]),
          "2026 FP",
        ),
        createPanel(
          "基本情報",
          element("div", { className: "detail-list" }, [
            createProfileRow("監督", team.coach || "未掲載"),
            createProfileRow("創部", team.founded || "未掲載"),
            createProfileRow("ホームグラウンド", team.homeGround || "未掲載"),
            createProfileRow("ホームタウン", team.hometown || "未掲載"),
          ]),
          "チーム登録",
        ),
        createPanel("スタッフ", createStaffList(staff), `${staff.length}名`),
        createPanel("SNS・Webサイト", createSocialLinks(team), "外部リンク"),
        hasSeasonRoster ? createNotice(team.competitionId
          ? "Iリーグの大会別公式登録を表示しています。トップチームや別チームの登録とは統合していません。"
          : "スタッフ・登録選手は2026年度のチーム登録を表示しています。") : null,
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
