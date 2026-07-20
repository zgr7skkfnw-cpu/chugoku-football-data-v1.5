import {
  createKitImage,
  createNotice,
  createPageHeader,
  createPanel,
  createTeamEmblem,
  element,
} from "../ui/elements.js";
import { formatKickoff } from "../utils/football.js";
import { getTeam } from "../utils/teams.js";
import { getPlayer } from "../utils/players.js";
import { routeHref } from "../router.js";
import { loadVenueWeather, weatherLabel } from "../api/weather.js";
import { createTeamNameLink } from "./shared.js";

export function renderMatchDetailPage({ matches, currentMatchId, teamDirectory, playerDirectory, teamStats, leagueStats, headToHead }) {
  const match = matches.find((candidate) => candidate.id === currentMatchId);

  if (!match) {
    return element("article", { className: "page", attributes: { "data-page": "match" } }, [
      createPageHeader({
        eyebrow: "Match Detail",
        title: "試合が見つかりません",
        description: "指定された試合IDは登録されていません。",
        badge: "確認エラー",
      }),
      createNotice("試合一覧へ戻り、もう一度試合を選択してください。"),
    ]);
  }

  const home = getTeam(teamDirectory, match.homeTeam);
  const away = getTeam(teamDirectory, match.awayTeam);
  const matchPlayerDirectory = match.season === 2026 ? playerDirectory : null;
  if (match.status !== "finished") {
    const competitionStats = leagueStats?.[match.season]?.[match.division] ?? teamStats;
    return createScheduledMatchPage(match, home, away, teamDirectory, competitionStats, headToHead);
  }
  const score = element("section", { className: "match-scoreboard" }, [
    createScoreTeam(home, match.homeTeam.name, "ホーム", "home"),
    element("div", { className: "match-scoreboard__score" }, [
      element("strong", { text: `${match.homeTeam.score} - ${match.awayTeam.score}` }),
      element("span", { text: "試合終了" }),
    ]),
    createScoreTeam(away, match.awayTeam.name, "アウェイ", "away"),
  ]);

  const informationRows = [
    createDetailRow("日時", formatKickoff(match, { includeYear: true, includeTime: true })),
    createDetailRow("節", match.roundLabel ?? `第${match.round}節`),
    createDetailRow("会場", match.venue ?? "未掲載"),
    createDetailRow(
      "観客数",
      match.attendance == null ? "未掲載" : `${match.attendance}人`,
    ),
    createDetailRow("試合形式", match.matchFormat ?? "未掲載"),
    createDetailRow("天候", formatConditions(match.conditions)),
  ];

  if (match.wasResumed) {
    informationRows.push(
      createDetailRow(
        "再開日",
        match.resumedDate
          ? match.resumedDate.replaceAll("-", "/")
          : "日付未掲載",
      ),
    );

    informationRows.push(
      createDetailRow(
        "備考",
        match.statusNote ?? "中断後に再開された試合",
      ),
    );
  }

  const information = element(
    "div",
    { className: "detail-list" },
    informationRows,
  );
  const periods = element(
    "div",
    { className: "period-score-list" },
    match.scoreByPeriod?.length
      ? match.scoreByPeriod.map((period) =>
          element("div", { className: "period-score-row" }, [
            element("strong", { text: String(period.home) }),
            element("span", { text: period.label }),
            element("strong", { text: String(period.away) }),
          ]),
        )
      : [createNotice("前後半スコアは掲載されていません。")],
  );
  const goals = createEventList(
    match.goals ?? [],
    (goal) => `${goal.minuteLabel ?? goal.minute ?? "時刻未掲載"}分`,
    (goal) => {
      const teamId = goal.teamName === match.homeTeam.name ? home?.id : away?.id;
      return createPlayerInlineLink(goal.scorerName, teamId, matchPlayerDirectory);
    },
    (goal) => {
      const team = goal.teamName === match.homeTeam.name ? home : away;
      return element("span", { className: "goal-meta" }, [
        createTeamNameLink(team, goal.teamName),
        goal.assistNames.length ? element("span", { text: " / アシスト: " }) : null,
        ...goal.assistNames.flatMap((name, index) => [index ? element("span", { text: "、" }) : null, createPlayerInlineLink(name, team?.id, matchPlayerDirectory, "player-assist-link")]),
      ]);
    },
  );
  const disciplinary = [
    ...(match.disciplinary?.home ?? []).map((text) => ({ side: match.homeTeam.name, text })),
    ...(match.disciplinary?.away ?? []).map((text) => ({ side: match.awayTeam.name, text })),
  ];
  const substitutions = [
    ...(match.substitutions?.home ?? []).map((text) => ({ side: match.homeTeam.name, text })),
    ...(match.substitutions?.away ?? []).map((text) => ({ side: match.awayTeam.name, text })),
  ];
  const officials = (match.officials ?? []).map((official) => ({
    side: official.role,
    text: official.name,
  }));

  const statistics = createMatchStatistics(
    match.manualStatistics,
    match.homeTeam.name,
    match.awayTeam.name,
  );

  const lineups = createLineups(
    match.lineups,
    teamDirectory,
    matchPlayerDirectory,
  );
  const homeStarterCount = match.lineups?.home?.starters?.length ?? 0;
  const awayStarterCount = match.lineups?.away?.starters?.length ?? 0;
  const officialLineupNotice = match.status === "finished"
    && match.source?.provider === "football-system.jp"
    && (homeStarterCount > 0 || awayStarterCount > 0)
    && (homeStarterCount !== 11 || awayStarterCount !== 11)
    ? createNotice([
        homeStarterCount !== 11 ? `${match.homeTeam.name} ${homeStarterCount}名` : null,
        awayStarterCount !== 11 ? `${match.awayTeam.name} ${awayStarterCount}名` : null,
      ].filter(Boolean).join("、") + "が公式記録の先発欄に掲載されています。掲載内容をそのまま表示しています。")
    : null;

  return element("article", { className: "page", attributes: { "data-page": "match", "data-match-id": match.id } }, [
    createPageHeader({
      eyebrow: "Match Detail",
      title: "試合詳細",
      description: `${match.competitionName ?? match.leagueName ?? "大会名未掲載"} / ${match.roundLabel ?? `第${match.round}節`}`,
    }),
    element("div", { className: "section-stack" }, [
      score,
      createPanel("前後半スコア", periods, match.matchNumber == null ? "Match No. 未掲載" : `Match No. ${match.matchNumber}`),
      createPanel("試合情報", information, "試合記録"),
      createPanel("得点経過", goals, `${match.goals?.length ?? 0}得点`),
      createPanel("スタメン", lineups, `先発 ${homeStarterCount}人 / ${awayStarterCount}人`),
      officialLineupNotice,
      createPanel("警告・退場", createTextEventList(disciplinary), `${disciplinary.length}件`),
      createPanel(
        "交代",
        createTextEventList(substitutions),
        `${substitutions.length}件`,
      ),
      statistics
        ? createPanel(
            "チームスタッツ",
            statistics,
            "試合合計",
          )
        : null,
      createPanel(
        "審判・運営",
        createTextEventList(officials),
        `${officials.length}名`,
      ),
      createMatchSourceNotice(match),
    ]),
  ]);
}

function createMatchStatistics(
  statistics,
  homeTeamName,
  awayTeamName,
) {
  if (!statistics?.home || !statistics?.away) {
    return null;
  }

  const rows = [
    ["シュート", "shots"],
    ["ゴールキック", "goalKicks"],
    ["コーナーキック", "cornerKicks"],
    ["直接フリーキック", "directFreeKicks"],
    ["間接フリーキック", "indirectFreeKicks"],
    ["オフサイド", "offsides"],
    ["PK", "penalties"],
  ];

  const hasAnyValue = rows.some(([, key]) =>
    statistics.home[key] != null
    || statistics.away[key] != null
  );

  if (!hasAnyValue) {
    return null;
  }

  const table = element("table", {
    className: "match-statistics-table",
  });

  table.append(
    element("thead", {}, [
      element("tr", {}, [
        element("th", {
          text: homeTeamName,
        }),
        element("th", {
          text: "項目",
        }),
        element("th", {
          text: awayTeamName,
        }),
      ]),
    ]),
    element(
      "tbody",
      {},
      rows.map(([label, key]) =>
        element("tr", {}, [
          element("td", {
            text: formatStatisticValue(
              statistics.home[key],
            ),
          }),
          element("th", {
            text: label,
          }),
          element("td", {
            text: formatStatisticValue(
              statistics.away[key],
            ),
          }),
        ]),
      ),
    ),
  );

  return element("div", {
    className: "table-scroll",
  }, [table]);
}

function formatStatisticValue(value) {
  return value == null
    ? "–"
    : String(value);
}

function formatConditions(conditions) {
  const values = [conditions?.weather, conditions?.wind, conditions?.pitch]
    .filter((value) => value != null && String(value).trim());
  return values.length ? values.join(" / ") : "未掲載";
}

function createMatchSourceNotice(match) {
  if (match.manualOverride) {
    return createNotice(
      "football-systemの公式試合記録を基に手動補完したデータです。",
    );
  }

  if (match.gameId != null) {
    return createNotice(
      `football-system / game_id=${match.gameId}`,
    );
  }

  return createNotice("試合記録の取得元情報は未掲載です。");
}

function createScheduledMatchPage(match, home, away, teamDirectory, teamStats, headToHead) {
  const statusLabel = { scheduled: "開催予定", postponed: "延期", cancelled: "中止", suspended: "中断" }[match.status] ?? "未開催";
  const page = element("article", { className: "page prematch-page", attributes: { "data-page": "match", "data-match-id": match.id } });
  const scoreboard = element("section", { className: "match-scoreboard prematch-scoreboard" }, [
    createScoreTeam(home, match.homeTeam.name, "ホーム", "home"),
    element("div", { className: "match-scoreboard__score" }, [
      element("strong", { text: kickoffTime(match.kickoffAt) }),
      element("span", { text: kickoffDate(match.kickoffAt) }),
    ]),
    createScoreTeam(away, match.awayTeam.name, "アウェイ", "away"),
  ]);
  const tabs = element("div", { className: "prematch-tabs", attributes: { role: "tablist", "aria-label": "試合前情報" } });
  const content = element("div", { className: "prematch-tab-content" });
  const definitions = [
    ["preview", "プレビュー"],
    ["standings", "順位表"],
    ["h2h", "対戦"],
  ];
  let active = "preview";
  const renderTab = () => {
    for (const tab of tabs.children) {
      const selected = tab.dataset.prematchTab === active;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
    }
    content.replaceChildren(active === "preview"
      ? createPreviewTab(match, home, away, teamDirectory, teamStats)
      : active === "standings"
        ? createPrematchStandings(teamStats?.periods?.all?.standings ?? [], teamDirectory, [home?.id, away?.id])
        : createHeadToHeadTab(match, home, away, teamDirectory, headToHead));
  };
  tabs.append(...definitions.map(([key, label]) => {
    const button = element("button", { className: "prematch-tab", text: label, attributes: { type: "button", role: "tab", "data-prematch-tab": key } });
    button.addEventListener("click", () => { active = key; renderTab(); });
    return button;
  }));
  renderTab();
  page.append(
    createPageHeader({ eyebrow: "Match Preview", title: match.status === "scheduled" ? "試合予定" : statusLabel, description: `${match.competitionName} / 第${match.round}節`, badge: statusLabel }),
    scoreboard,
    tabs,
    content,
  );
  return page;
}

function createPreviewTab(match, home, away, teamDirectory, teamStats) {
  const weatherValue = element("strong", { text: match.venue ? "天気予報を確認中…" : "会場未掲載" });
  const weatherMeta = element("span", { className: "weather-source" });
  const weatherPanel = createPanel("会場・天気", element("div", { className: "prematch-info-card" }, [
    createDetailRow("会場", match.venue ?? "未掲載"),
    element("div", { className: "detail-row" }, [element("span", { text: "天気予報" }), element("div", { className: "weather-value" }, [weatherValue, weatherMeta])]),
  ]), "試合前情報");
  loadVenueWeather(match.venue, match.kickoffAt).then((weather) => {
    if (!weatherValue.isConnected) return;
    if (weather.status === "ready") {
      weatherValue.textContent = `${weatherLabel(weather.weatherCode)} / ${Math.round(weather.temperature)}℃ / 降水 ${weather.precipitationProbability ?? "–"}%`;
      weatherMeta.replaceChildren(element("a", { text: "Open-Meteo", attributes: { href: "https://open-meteo.com/", target: "_blank", rel: "noreferrer" } }));
    } else {
      weatherValue.textContent = weather.status === "outside-range" ? "予報期間外" : "予報データ未掲載";
      weatherMeta.textContent = weather.status === "outside-range" ? "試合14日前から表示" : "";
    }
  });
  const standings = teamStats?.periods?.all?.standings ?? [];
  return element("div", { className: "section-stack prematch-preview" }, [
    createPanel("試合情報", element("div", { className: "detail-list" }, [
      createDetailRow("日付", kickoffDateLong(match.kickoffAt)),
      createDetailRow("キックオフ", kickoffTime(match.kickoffAt)),
      createDetailRow("節", match.roundLabel ?? `第${match.round}節`),
    ]), "日程"),
    weatherPanel,
    createPanel("当該チーム順位", createCompactStandingTable(standings, teamDirectory, [home?.id, away?.id]), "現在順位"),
    createTeamForm(match, home, away, teamDirectory, teamStats),
    createNotice("試合終了後、football-systemで詳細が公開されると試合記録へ切り替わります。"),
  ]);
}

function createPrematchStandings(standings, teamDirectory, highlightedTeamIds) {
  return element("div", { className: "section-stack" }, [
    createPanel("順位表", createCompactStandingTable(standings, teamDirectory, highlightedTeamIds, true), "通算"),
    createNotice("対戦する2チームを強調表示しています。"),
  ]);
}

function createCompactStandingTable(standings, teamDirectory, highlightedTeamIds, includeAll = false) {
  const ids = new Set(highlightedTeamIds.filter(Boolean));
  const rows = includeAll ? standings : standings.filter((row) => ids.has(row.teamId));
  const table = element("table", { className: "prematch-standing-table" });
  table.append(
    element("thead", {}, [
      element(
        "tr",
        {},
        ["#", "チーム", "試", "勝", "分", "負", "+/-", "差", "点"]
          .map((label) => element("th", { text: label })),
      ),
    ]),
    element("tbody", {}, rows.map((row) => {
      const team = getTeam(teamDirectory, row.teamId);
      return element("tr", { className: ids.has(row.teamId) ? "is-highlighted" : "", attributes: { "data-prematch-standing-team": row.teamId } }, [
        element("td", { text: String(row.rank ?? "–") }),
        element("td", {}, [element("div", { className: "standing-team" }, [createTeamEmblem(team, "team-emblem team-emblem--standing"), createTeamNameLink(team, row.teamId)])]),
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
          className: "points",
          text: String(row.points),
        }),
      ]);
    })),
  );
  return element("div", { className: "table-scroll" }, [table]);
}

function createHeadToHeadTab(match, home, away, teamDirectory, headToHead) {
  const record = headToHead?.items?.find((entry) => entry.teamId === home?.id)?.opponents?.find((entry) => entry.opponentTeamId === away?.id);
  const history = record?.matches ?? [];
  return element("div", { className: "section-stack prematch-h2h" }, [
    createPanel("対戦成績", element("div", { className: "h2h-summary" }, [
      createH2hTeam(home, record?.won ?? 0, "勝利"),
      element("div", { className: "h2h-draws" }, [element("strong", { text: String(record?.drawn ?? 0) }), element("span", { text: "引分" })]),
      createH2hTeam(away, record?.lost ?? 0, "勝利"),
    ]), `${headToHead?.sourceSeasons?.length ?? 0}年度分・全リーグ／全ステージ`),
    createPanel("過去の対戦", history.length ? element("div", { className: "h2h-history" }, history.map((entry) => {
      const original = entry.matchId === match.id ? match : null;
      return element("a", { className: "h2h-history-row", attributes: { href: routeHref("match", { matchId: entry.matchId }), "data-route": "match", "data-match-id": entry.matchId } }, [
        element("span", { className: "h2h-match-context", text: `${entry.season}年度 / ${entry.leagueName} / ${entry.stageName}` }),
        element("span", { text: `${kickoffDateLong(entry.kickoffAt)} / 第${entry.round}節` }),
        element("strong", { text: `${home?.shortName ?? home?.name} ${entry.goalsFor} - ${entry.goalsAgainst} ${away?.shortName ?? away?.name}` }),
        original ? element("small", { text: "この試合" }) : null,
      ]);
    })) : createNotice("今季の対戦記録はありません。"), `${history.length}試合`),
  ]);
}

function createH2hTeam(team, wins, label) {
  return element("a", { className: "h2h-team", attributes: { href: routeHref("team", { teamId: team?.id }), "data-route": "team", "data-team-id": team?.id } }, [
    createTeamEmblem(team, "team-emblem team-emblem--h2h"), element("strong", { text: String(wins) }), element("span", { text: label }),
  ]);
}

function createTeamForm(match, home, away, teamDirectory, teamStats) {
  const allMatches = [home, away].map((team) => ({ team, data: teamStats?.periods?.all?.teams?.find((entry) => entry.teamId === team?.id) }));
  return createPanel("直近5試合", element("div", { className: "prematch-form-grid" }, allMatches.map(({ team, data }) => element("section", { className: "prematch-form-team" }, [
    element("header", {}, [createTeamEmblem(team, "team-emblem team-emblem--standing"), createTeamNameLink(team, team?.name)]),
    element("div", { className: "prematch-form-results" }, (data?.form ?? []).slice(-5).map((item) => element("span", { className: `form-badge form-badge--${String(item.result).toLowerCase()}`, text: item.result === "W" ? "○" : item.result === "D" ? "△" : "●" }))),
  ]))), "試合結果");
}

function kickoffTime(value) { return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function kickoffDate(value) { return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short" }).format(new Date(value)); }
function kickoffDateLong(value) { return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(value)); }
function signed(value) { return `${value > 0 ? "+" : ""}${value ?? 0}`; }

function createLineups(lineups, teamDirectory, playerDirectory) {
  if (!lineups?.home?.starters?.length || !lineups?.away?.starters?.length) {
    return createNotice("スタメンは掲載されていません。");
  }

  return element("div", { className: "lineup-grid", attributes: { "data-lineups": "official" } }, [
    createLineupTeam(lineups.home, teamDirectory, playerDirectory),
    createLineupTeam(lineups.away, teamDirectory, playerDirectory),
  ]);
}

function createLineupTeam(lineup, teamDirectory, playerDirectory) {
  const team = getTeam(teamDirectory, lineup.teamId ?? lineup.teamName);
  return element("section", { className: "lineup-team" }, [
    element("header", { className: "lineup-team__header" }, [
      element("div", { className: "lineup-team__identity" }, [
        createTeamEmblem(team, "team-emblem team-emblem--lineup"),
        createTeamNameLink(team, lineup.teamName, "lineup-team__name"),
      ]),
      element("span", { text: lineup.manager ? `監督 ${lineup.manager}` : "" }),
    ]),
    element(
      "ol",
      { className: "lineup-list" },
      lineup.starters.map((player) => createLineupPlayer(player, team?.id, playerDirectory)),
    ),
    element("div", { className: "lineup-section-label", text: "ベンチ" }),
    lineup.substitutes?.length
      ? element(
          "ol",
          { className: "lineup-list lineup-list--bench" },
          lineup.substitutes.map((player) =>
            createLineupPlayer(player, team?.id, playerDirectory),
          ),
        )
      : createNotice("控え選手は掲載されていません。"),
  ]);
}

function createLineupPlayer(entry, teamId, playerDirectory) {
  const player = getPlayer(playerDirectory, entry.name, teamId);
  const content = [
    element("span", {
      className: "lineup-player__number",
      text: entry.number === null ? "–" : String(entry.number),
    }),
    element("strong", { text: entry.name }),
    element("span", { className: "lineup-player__position", text: entry.position ?? "" }),
  ];
  return element("li", { className: "lineup-player" }, [
    player
      ? element("a", {
          className: "lineup-player__link",
          attributes: {
            href: routeHref("player", { playerId: player.id }),
            "data-route": "player",
            "data-player-id": player.id,
          },
        }, content)
      : element("span", { className: "lineup-player__link" }, content),
  ]);
}

function createPlayerInlineLink(name, teamId, playerDirectory, className = "player-inline-link") {
  if (!name) return "得点者未掲載";
  const player = getPlayer(playerDirectory, name, teamId);
  if (!player) return name;
  return element("a", {
    className,
    text: name,
    attributes: {
      href: routeHref("player", { playerId: player.id }),
      "data-route": "player",
      "data-player-id": player.id,
    },
  });
}

function createScoreTeam(team, fallbackName, side, kitType) {
  return element("div", { className: "match-scoreboard__team" }, [
    element("div", { className: "match-scoreboard__visuals" }, [
      createKitImage(team, kitType, "kit-icon kit-icon--scoreboard"),
      createTeamEmblem(team, "team-emblem team-emblem--scoreboard"),
    ]),
    createTeamNameLink(team, fallbackName, "match-scoreboard__team-link"),
    element("span", { text: side }),
  ]);
}

function createDetailRow(label, value) {
  return element("div", { className: "detail-row" }, [
    element("span", { text: label }),
    element("strong", { text: value }),
  ]);
}

function createEventList(items, getTime, getTitle, getMeta) {
  if (!items.length) {
    return createNotice("記録はありません。");
  }

  return element(
    "div",
    { className: "timeline-list" },
    items.map((item) => {
      const title = getTitle(item);
      const meta = getMeta(item);
      return element("div", { className: "timeline-row" }, [
        element("span", { className: "timeline-time", text: getTime(item) }),
        element("div", { className: "row-copy" }, [
          title?.nodeType ? title : element("strong", { text: title }),
          meta?.nodeType ? meta : element("span", { text: meta }),
        ]),
      ]);
    }),
  );
}

function createTextEventList(items) {
  if (!items.length) {
    return createNotice("記録はありません。");
  }

  return element(
    "div",
    { className: "timeline-list" },
    items.map((item) =>
      element("div", { className: "timeline-row" }, [
        element("span", { className: "timeline-marker", text: "•" }),
        element("div", { className: "row-copy" }, [
          element("strong", { text: item.text }),
          element("span", { text: item.side }),
        ]),
      ]),
    ),
  );
}
