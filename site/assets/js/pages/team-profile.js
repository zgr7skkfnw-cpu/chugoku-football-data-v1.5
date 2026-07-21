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
import { saveFavoriteTeamId } from "../utils/favorites.js";
import { setState } from "../state.js";
import { createMatchRow, createPlayerLinkRow, createTeamNameLink } from "./shared.js";
import { createSeasonPeriodTabs } from "../ui/season-period.js";
import { selectPlayerStatisticsPeriod } from "../utils/players.js";

export function renderTeamProfilePage({
  currentTeamId,
  teamDirectory,
  players,
  favoriteTeamId,
  teamStats,
  leagueStats,
  headToHead,
  playerStatistics,
  seasonPeriod,
  selectedSeason,
  matches,
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
  const isFavorite = favoriteTeamId === team.id;
  const competitionStats = Object.values(leagueStats?.[selectedSeason]?.byCompetition ?? {});
  const activeTeamStats = competitionStats
    .find((stats) => stats?.periods?.all?.teams?.some((entry) => entry.teamId === team.id)) ?? teamStats;
  const analytics = activeTeamStats?.periods?.[seasonPeriod]?.teams?.find((entry) => entry.teamId === team.id);
  const opponents = headToHead?.items?.find((entry) => entry.teamId === team.id)?.opponents ?? [];
  const periodPlayerStats = selectPlayerStatisticsPeriod(playerStatistics, seasonPeriod);
  const seasonMatches = matches
    .filter((match) => match.season === selectedSeason)
    .filter((match) => match.homeTeam.teamId === team.id || match.awayTeam.teamId === team.id);
  const finishedMatches = seasonMatches
    .filter((match) => match.status === "finished")
    .sort((left, right) => new Date(right.kickoffAt) - new Date(left.kickoffAt));
  const upcomingMatches = seasonMatches
    .filter((match) => match.status !== "finished")
    .sort((left, right) => new Date(left.kickoffAt) - new Date(right.kickoffAt));
  const favoriteButton = element("button", {
    className: `favorite-button${isFavorite ? " is-active" : ""}`,
    text: isFavorite ? "♥ マイチーム登録済み" : "♡ マイチームに登録",
    attributes: { type: "button", "aria-pressed": String(isFavorite) },
  });
  favoriteButton.addEventListener("click", () => {
    const nextTeamId = isFavorite ? null : team.id;
    saveFavoriteTeamId(nextTeamId);
    setState({ favoriteTeamId: nextTeamId });
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
      element("section", { className: "team-profile__hero" }, [
        createTeamPhoto(team, "team-photo team-profile__photo"),
      ]),
      element("header", { className: "team-profile__identity" }, [
        createTeamEmblem(team, "team-emblem team-emblem--profile"),
        element("div", {}, [
          element("p", { className: "page-eyebrow", text: "Team Profile" }),
          element("h1", { className: "team-profile__name", text: team.name }),
          element("span", { className: "team-profile__short-name", text: team.shortName }),
          team.parentClubId ? element("span", {
            className: "team-profile__short-name",
            text: `所属大学：${getTeam(teamDirectory, team.parentClubId)?.name ?? team.parentClubId}`,
          }) : null,
        ]),
        favoriteButton,
      ]),
      element("div", { className: "team-profile__content section-stack" }, [
        createSeasonPeriodTabs(seasonPeriod),
        createPanel("今季戦績", createRecordSummary(analytics?.overall), analytics?.rank ? `${analytics.rank}位` : "–"),
        createPanel("ホーム・アウェイ成績", createHomeAwayRecords(analytics), "試合結果"),
        createPanel("直近5試合", createForm(analytics?.form, teamDirectory), `${analytics?.form?.length ?? 0}試合`),
        createPanel("終了試合", createTeamMatchList(finishedMatches, teamDirectory), `${finishedMatches.length}試合`),
        createPanel("今後の日程", createTeamMatchList(upcomingMatches, teamDirectory), `${upcomingMatches.length}試合`),
        createPanel("チームスタッツ", createTeamStatGrid(analytics?.stats), "シーズン分析"),
        createPanel("順位推移", createRankChart(analytics?.rankProgression, seasonPeriod), "各節終了時"),
        createPanel("Head to Head", createHeadToHead(opponents, teamDirectory, seasonPeriod), "対戦成績"),
        hasSeasonRoster
          ? createPanel("チーム内ランキング", createInternalRankings(periodPlayerStats, team), "TOP 5")
          : createNotice(`${selectedSeason}年度の大会別選手名簿は未整備のため、スカッドと選手ランキングは表示していません。`),
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
        hasSeasonRoster ? createPanel("登録選手", createRoster(roster, team), `${roster.length}選手`) : null,
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

function createRecordSummary(record = {}) {
  const values = [
    ["試合", record.played ?? 0], ["勝", record.won ?? 0], ["分", record.drawn ?? 0],
    ["負", record.lost ?? 0], ["勝点", record.points ?? 0], ["得点", record.goalsFor ?? 0],
    ["失点", record.goalsAgainst ?? 0], ["得失点差", signed(record.goalDifference ?? 0)],
  ];
  return element("div", { className: "team-record-grid" }, values.map(([label, value]) =>
    element("div", { className: "team-record-stat" }, [element("strong", { text: String(value) }), element("span", { text: label })]),
  ));
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

function createInternalRankings(statistics, team) {
  const metrics = [["goals", "得点", "得点"], ["assists", "アシスト", "アシスト"], ["minutes", "出場時間", "分"]];
  return element("div", { className: "internal-ranking-grid" }, metrics.map(([metric, label, unit]) => {
    const rows = [...statistics.values()].filter((stats) => stats.player.teamId === team.id && stats[metric] > 0).sort((a, b) => b[metric] - a[metric] || a.player.name.localeCompare(b.player.name, "ja")).slice(0, 5);
    return element("section", { className: "internal-ranking" }, [
      element("h3", { text: label }),
      ...(rows.length ? rows.map((stats) => createPlayerLinkRow({ player: stats.player, team, metric: stats[metric], metricLabel: unit })) : [createNotice("記録なし")]),
    ]);
  }));
}

function svgElement(name, attributes = {}) { const node = document.createElementNS("http://www.w3.org/2000/svg", name); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value)); return node; }
function svgText(x, y, text, className = "rank-chart__label") { const node = svgElement("text", { x, y, class: className }); node.textContent = text; return node; }
function signed(value) { return `${value > 0 ? "+" : ""}${value}`; }
function decimal(value) { return Number(value ?? 0).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1"); }

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

function createRoster(players, team) {
  if (!players.length) return createNotice("登録選手は未掲載です。");
  return element(
    "div",
    { className: "roster-list", attributes: { "data-roster-count": String(players.length) } },
    players.map((player) => createPlayerLinkRow({ player, team })),
  );
}
