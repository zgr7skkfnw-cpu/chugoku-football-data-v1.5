import { routeHref } from "../router.js";
import {
  createKitImage,
  createNotice,
  createPanel,
  createTeamEmblem,
  element,
} from "../ui/elements.js";
import { formatKickoff } from "../utils/football.js";
import { formatGrade, getPlayer, normalizePlayerName } from "../utils/players.js";
import { createTeamNameLink } from "./shared.js";
import { setState } from "../state.js";
import { toggleFavoritePlayer } from "../utils/player-favorites.js";
import { createMatchEventIcon } from "../ui/match-event-icon.js";

export function renderPlayerProfilePage({
  currentPlayerId,
  playerDirectory,
  playerStatistics,
  teamDirectory,
  favoritePlayerIds = [],
  players = [],
  matches = [],
  selectedPlayerTab = "profile",
}) {
  const player = getPlayer(playerDirectory, currentPlayerId);
  const stats = player ? playerStatistics?.get(player.id) : null;

  if (!player || !stats) {
    return element("article", { className: "page", attributes: { "data-page": "player" } }, [
      createNotice("指定された選手は登録データに見つかりません。"),
    ]);
  }

  const team = stats.team;
  const registrations = getSafeRegistrations(player, players);
  const registrationIds = registrations.map((entry) => entry.id);
  const canonicalFollowId = registrations.find((entry) => !entry.competitionId)?.id ?? registrations[0]?.id ?? player.id;
  const isFollowed = favoritePlayerIds.some((id) => registrationIds.includes(id));
  const followButton = element("button", {
    className: `favorite-button player-follow-button${isFollowed ? " is-active" : ""}`,
    text: isFollowed ? "★ フォロー中" : "☆ 選手をフォロー",
    attributes: { type: "button", "aria-pressed": String(isFollowed) },
  });
  followButton.addEventListener("click", () => {
    const withoutPerson = favoritePlayerIds.filter((id) => !registrationIds.includes(id));
    setState({ favoritePlayerIds: isFollowed ? withoutPerson : toggleFavoritePlayer(canonicalFollowId, withoutPerson) });
  });
  const tabContent = {
    profile: element("div", { className: "section-stack" }, [
      createPanel("基本情報", createProfileBasics(player), "公式登録情報"),
      createPanel("今期スタッツ", createCurrentStats(stats), registrationLabel(player, teamDirectory)),
      createPanel("トロフィー", createPlayerTrophies(player), "保存済みデータのみ"),
    ]),
    matches: createPanel("試合", createMatchHistory(stats, teamDirectory, false), `${stats.matches.length}試合`),
    stats: createPlayerStatsTab(player, stats, players, playerStatistics, matches, teamDirectory),
  }[selectedPlayerTab] ?? null;
  return element(
    "article",
    {
      className: "page player-profile",
      attributes: { "data-page": "player", "data-player-id": player.id, "data-competition-id": player.competitionId ?? "" },
    },
    [
      element("a", {
        className: "team-profile__back",
        text: "← 選手一覧",
        attributes: { href: routeHref("players"), "data-route": "players" },
      }),
      element("header", {
        className: "player-profile__hero",
        attributes: { style: `--player-color:${team?.colors?.primary ?? "#344352"}` },
      }, [
        element("span", {
          className: "player-profile__initial",
          text: player.name.replace(/[\s　]+/g, "").slice(0, 1),
          attributes: { "aria-label": `${player.name} イニシャル` },
      }),
      followButton,
        element("div", { className: "player-profile__copy" }, [
          element("p", { className: "page-eyebrow", text: "Player Profile" }),
          element("h1", { text: player.name }),
          player.englishName
            ? element("span", { className: "player-profile__reading", text: player.englishName })
            : null,
          element("span", {
            text: `#${player.number ?? "–"} / ${player.position ?? "未掲載"} / ${formatGrade(player.grade)}`,
          }),
          element("a", {
            className: "player-profile__team-link",
            attributes: {
              href: routeHref("team", { teamId: player.teamId }),
              "data-route": "team",
              "data-team-id": player.teamId,
            },
          }, [
            createTeamEmblem(team, "team-emblem team-emblem--player-profile"),
            createKitImage(team, "home", "kit-icon kit-icon--player-profile"),
            element("strong", { text: team?.name ?? "所属大学未掲載" }),
          ]),
        ]),
      ]),
      element("div", { className: "section-stack" }, [
        createRegistrationSwitch(player, registrations, teamDirectory),
        createPlayerTabs(player, selectedPlayerTab),
        element("section", { className: "profile-tab-panel", attributes: { role: "tabpanel", tabindex: "0" } }, [tabContent]),
      ]),
    ],
  );
}

function createRegistrationSwitch(player, registrations, teamDirectory) {
  if (registrations.length < 2) return null;
  return createPanel("登録区分", element("div", { className: "chip-row player-registration-switch" }, registrations.map((candidate) => element("a", {
    className: `filter-chip${candidate.id === player.id ? " is-active" : ""}`,
    text: registrationLabel(candidate, teamDirectory),
    attributes: {
      href: routeHref("player", { playerId: candidate.id, competitionId: candidate.competitionId }),
      "data-route": "player",
      "data-player-id": candidate.id,
      "data-competition-id": candidate.competitionId ?? "",
      "aria-current": candidate.id === player.id ? "page" : "false",
    },
  }))), "登録別の成績を表示");
}

function getSafeRegistrations(player, players) {
  const clubId = player.parentClubId ?? (player.competitionId ? null : player.teamId);
  if (!player.birth || !clubId) return [player];
  return players
    .filter((candidate) =>
      (candidate.parentClubId ?? (candidate.competitionId ? null : candidate.teamId)) === clubId
      && candidate.birth === player.birth
      && normalizePlayerName(candidate.name) === normalizePlayerName(player.name))
    .sort((left, right) => Number(Boolean(left.competitionId)) - Number(Boolean(right.competitionId)) || left.id.localeCompare(right.id));
}

function registrationLabel(player, teamDirectory) {
  const team = teamDirectory?.byId.get(player.teamId);
  const competition = player.competitionId?.includes("i-league") ? "Iリーグ" : "中国大学リーグ";
  return `${competition}｜${team?.name ?? player.teamId}`;
}

function createBasicInformation(player, team, teamDirectory) {
  const rows = [
    ["氏名", player.name],
    ["読み方", player.englishName || "未掲載"],
    ["背番号", player.number ?? "未掲載"],
    ["ポジション", player.position ?? "未掲載"],
    ["推定学年", formatGrade(player.grade)],
    ["生年月日", player.birth ?? "未掲載"],
    ["身長", player.height === null ? "未掲載" : `${player.height}cm`],
    ["体重", player.weight === null ? "未掲載" : `${player.weight}kg`],
    ["出身地", player.hometown || "未掲載"],
    ["出身高校・前所属", player.previousTeam || "未掲載"],
    ["所属大学", team?.name ?? "未掲載"],
    ...(player.competitionId ? [["大会登録", player.competitionId], ["親クラブ", teamDirectory?.byId.get(player.parentClubId)?.name ?? player.parentClubId ?? "未掲載"]] : []),
  ];
  return element(
    "div",
    { className: "detail-list" },
    rows.map(([label, value]) =>
      element("div", { className: "detail-row" }, [
        element("span", { text: label }),
        element("strong", { text: String(value) }),
      ]),
    ),
  );
}

function createSeasonStatistics(stats) {
  const periods = [
    ["all", "通算", stats],
    ["first", "前期", stats.periods.first],
    ["second", "後期", stats.periods.second],
  ];
  let activePeriod = "all";
  const tabs = element("div", {
    className: "chip-row player-period-tabs",
    attributes: { role: "tablist", "aria-label": "シーズン成績の期間" },
  });
  const content = element("div", { className: "player-period-content" });

  function renderPeriod() {
    const [, label, totals] = periods.find(([key]) => key === activePeriod);
    for (const tab of tabs.children) {
      const selected = tab.dataset.period === activePeriod;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
    }
    content.replaceChildren(
      element("p", { className: "player-period-label", text: `${label}成績` }),
      createSeasonStats(totals),
    );
  }

  tabs.append(
    ...periods.map(([key, label]) => {
      const tab = element("button", {
        className: "filter-chip",
        text: label,
        attributes: { type: "button", role: "tab", "data-period": key },
      });
      tab.addEventListener("click", () => {
        activePeriod = key;
        renderPeriod();
      });
      return tab;
    }),
  );
  renderPeriod();

  return createPanel(
    "2026シーズン成績",
    element("div", {}, [tabs, content]),
    "前期・後期切替",
  );
}

function createSeasonStats(stats, className = "player-stat-grid") {
  const per90 = (value) => stats.minutes > 0 ? (value * 90 / stats.minutes).toFixed(2) : "－";
  const startRate = stats.appearances > 0 ? `${Math.round(stats.starts / stats.appearances * 100)}%` : "－";
  const values = [
    ["出場試合", stats.appearances],
    ["先発試合", stats.starts],
    ["ベンチ入り", stats.benchSelections],
    ["出場時間", `${stats.minutes}分`],
    ["得点", stats.goals],
    ["アシスト", stats.assists],
    ["G+A", stats.goals + stats.assists],
    ["イエロー", stats.yellowCards],
    ["レッド", stats.redCards],
    ["交代出場数", stats.substitutionsOn + stats.substitutionsOff],
    ["途中交代数", stats.substitutionsOff],
    ["クリーンシート", stats.cleanSheets],
    ["途中出場数", stats.substitutionsOn],
    ["フル出場", stats.fullAppearances],
    ["90分当たり得点", per90(stats.goals)],
    ["90分当たりアシスト", per90(stats.assists)],
    ["90分当たりG+A", per90(stats.goals + stats.assists)],
    ["先発率", startRate],
  ];
  return element(
    "div",
    { className },
    values.map(([label, value]) =>
      element("div", { className: className === "player-stat-grid" ? "player-stat" : "player-summary-stat" }, [
        element("strong", { text: String(value) }),
        element("span", { text: label }),
      ]),
    ),
  );
}

function createMatchHistory(stats, teamDirectory, limited = true) {
  if (!stats.matches.length) return createNotice("出場・ベンチ登録記録はありません。");
  return element(
    "div",
    { className: "player-match-list" },
    (limited ? stats.matches.slice(0, 5) : stats.matches).map((record) => {
      const appeared = record.started || record.substitutionOn;
      const appearance = record.started
        ? "先発"
        : record.substitutionOn
          ? "途中出場"
          : record.benchSelected
            ? "ベンチ"
            : "出場なし";
      const hasScore = Number.isFinite(record.teamScore) && Number.isFinite(record.opponentScore);
      const opponent = teamDirectory?.byId.get(record.opponentTeamId);
      return element("a", {
        className: "player-match-row",
        attributes: {
          href: routeHref("match", { matchId: record.matchId }),
          "data-route": "match",
          "data-match-id": record.matchId,
          "aria-label": `${formatKickoff(record)} ${record.opponentName}戦 ${appearance}`,
        },
      }, [
        element("div", { className: "player-match-row__left" }, [
          element("span", { className: "player-match-row__date", text: formatKickoff(record) }),
          element("small", { text: record.competitionName ?? "選択中の大会" }),
        ]),
        element("div", { className: "player-match-row__center" }, [
          createTeamEmblem(opponent, "team-emblem player-match-row__emblem"),
          element("span", { className: "player-match-row__opponent", text: record.opponentName }),
          hasScore ? element("strong", { className: "player-match-row__score", text: `${record.teamScore}-${record.opponentScore}` }) : null,
        ]),
        element("div", { className: "player-match-row__right" }, [
          element("span", { className: "player-match-row__appearance", text: appearance }),
          appeared && Number.isFinite(record.minutes) ? element("span", { text: `${record.minutes}分` }) : null,
          element("span", { className: "player-match-events" }, [
            createMatchEventIcon(record.started ? "starter" : "bench"),
            record.goals ? createMatchEventIcon("goal", record.goals) : null,
            record.assists ? createMatchEventIcon("assist", record.assists) : null,
            record.yellowCards ? createMatchEventIcon("yellow", record.yellowCards) : null,
            record.redCards ? createMatchEventIcon("red", record.redCards) : null,
          ]),
        ]),
      ]);
    }),
  );
}

function createRegistrationSummary(registrations, statistics, teamDirectory, activeId) {
  return element("div", { className: "player-registration-summary" }, registrations.map((registration) => {
    const stats = statistics.get(registration.id);
    return element("a", {
      className: `player-registration-card${registration.id === activeId ? " is-active" : ""}`,
      attributes: {
        href: routeHref("player", { playerId: registration.id, competitionId: registration.competitionId }),
        "data-route": "player",
        "data-player-id": registration.id,
        "data-competition-id": registration.competitionId ?? "",
      },
    }, [
      element("strong", { text: registrationLabel(registration, teamDirectory) }),
      element("span", { text: `#${registration.number ?? "－"} / ${registration.position ?? "－"}` }),
      element("span", { text: `${stats?.appearances ?? 0}試合・${stats?.minutes ?? 0}分・${stats?.goals ?? 0}得点・${stats?.assists ?? 0}A` }),
    ]);
  }));
}

function createPlayerTabs(player, active) {
  const tabs = [["profile", "プロフィール"], ["matches", "試合"], ["stats", "スタッツ"]];
  const list = element("nav", { className: "profile-tabs player-detail-tabs", attributes: { role: "tablist", "aria-label": "選手詳細" } },
    tabs.map(([key, label]) => element("a", {
      className: `profile-tab${active === key ? " is-active" : ""}`,
      text: label,
      attributes: {
        href: routeHref("player", { playerId: player.id, playerTab: key, competitionId: player.competitionId }),
        "data-route": "player", "data-player-id": player.id, "data-player-tab": key,
        "data-competition-id": player.competitionId ?? "", role: "tab",
        "aria-selected": String(active === key), tabindex: active === key ? "0" : "-1",
      },
    })));
  list.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(document.activeElement);
    const next = tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    event.preventDefault(); next.focus(); next.click();
  });
  return list;
}

function createProfileBasics(player) {
  const values = [
    ["身長", player.height == null ? "－" : `${player.height}cm`],
    ["体重", player.weight == null ? "－" : `${player.weight}kg`],
    ["生年月日・年齢", player.birth ? `${player.birth}（${calculateAge(player.birth)}歳）` : "－"],
    ["前所属チーム", player.previousTeam || "－"],
    ["背番号", player.number ?? "－"],
    ["ポジション", player.position || "－"],
  ];
  return element("div", { className: "player-basic-grid" }, values.map(([label, value]) =>
    element("div", { className: "player-basic-item" }, [element("span", { text: label }), element("strong", { text: String(value) })])));
}

function calculateAge(birth) {
  const date = new Date(`${birth}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return "－";
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const beforeBirthday = today.getMonth() < date.getMonth() || (today.getMonth() === date.getMonth() && today.getDate() < date.getDate());
  return age - Number(beforeBirthday);
}

function createCurrentStats(stats) {
  return element("div", { className: "player-current-strip player-stat-grid player-summary-grid" }, [
    ["試合", stats.appearances], ["ゴール", stats.goals], ["アシスト", stats.assists], ["出場時間", `${stats.minutes}分`],
  ].map(([label, value]) => element("div", {}, [element("strong", { text: String(value) }), element("span", { text: label })])));
}

function createPlayerTrophies() {
  return createNotice("保存済みデータには、この登録へ安全に紐付けられる個人タイトル情報がありません。チームタイトルはチーム詳細で確認できます。");
}

function createPlayerStatsTab(player, stats, players, allStatistics, matches) {
  const wrap = element("div", { className: "section-stack player-stats-tab" });
  let per90 = false;
  const toggle = element("div", { className: "segmented-control", attributes: { role: "tablist", "aria-label": "集計単位" } });
  const body = element("div", { className: "section-stack" });
  const render = () => {
    for (const button of toggle.children) {
      const selected = (button.dataset.mode === "per90") === per90;
      button.classList.toggle("is-active", selected); button.setAttribute("aria-selected", String(selected));
    }
    body.replaceChildren(
      createPanel("基本スタッツ", createBasicSix(stats, per90), per90 ? "90分あたり" : "合計"),
      createPanel("ポジション内パーセンタイル", createPercentiles(player, stats, players, allStatistics), "同大会・同ポジション比較 / 90分以上"),
      createPanel("シーズンパフォーマンス", createSeasonPerformance(stats), "選択中の登録"),
      createPanel("シュート", createShootingStats(player, stats, matches, per90), "公式掲載試合のみ"),
      createPanel("アシスト", metricCards([["アシスト", formatMetric(stats.assists, stats.minutes, per90)]]), per90 ? "90分あたり" : "合計"),
      createPanel("反則", metricCards([["イエロー", formatMetric(stats.yellowCards, stats.minutes, per90)], ["レッド", formatMetric(stats.redCards, stats.minutes, per90)]]), per90 ? "90分あたり（少ないほど良い）" : "合計"),
    );
  };
  for (const [mode, label] of [["total", "合計"], ["per90", "90分あたり"]]) {
    const button = element("button", { className: "filter-chip", text: label, attributes: { type: "button", role: "tab", "data-mode": mode } });
    button.addEventListener("click", () => { per90 = mode === "per90"; render(); });
    toggle.append(button);
  }
  render(); wrap.append(toggle, body); return wrap;
}

function createBasicSix(stats, per90) {
  return metricCards([
    ["ゴール", formatMetric(stats.goals, stats.minutes, per90)],
    ["アシスト", formatMetric(stats.assists, stats.minutes, per90)],
    ["試合", stats.appearances],
    ["先発", stats.starts],
    ["ベンチ入り", stats.benchSelections],
    ["出場時間（分）", stats.minutes],
  ]);
}
function createSeasonPerformance(stats) { return metricCards([["出場", stats.appearances], ["先発", stats.starts], ["ベンチ入り", stats.benchSelections], ["出場時間", `${stats.minutes}分`], ["ゴール", stats.goals], ["アシスト", stats.assists], ["G＋A", stats.goals + stats.assists], ["警告", stats.yellowCards], ["退場", stats.redCards]]); }
function metricCards(values) { return element("div", { className: "player-stat-six-grid" }, values.map(([label, value]) => element("div", { className: "player-stat" }, [element("strong", { text: String(value) }), element("span", { text: label })]))); }
function formatMetric(value, minutes, per90) { return per90 ? (minutes > 0 ? (value * 90 / minutes).toFixed(2) : "－") : value; }

function createPercentiles(player, stats, players, allStatistics) {
  const MIN_MINUTES = 90;
  const MIN_PLAYERS = 5;
  const position = String(player.position ?? "").match(/GK|DF|MF|FW/)?.[0];
  const competitionKey = player.competitionId ?? [...(stats.competitionIds ?? [])][0] ?? null;
  const candidates = players.map((candidate) => allStatistics.get(candidate.id)).filter((candidate) =>
    candidate && (candidate.player.competitionId ?? [...(candidate.competitionIds ?? [])][0] ?? null) === competitionKey
    && String(candidate.player.position ?? "").includes(position)
    && candidate.minutes >= MIN_MINUTES);
  if (!position || candidates.length < MIN_PLAYERS) return createNotice(`比較対象が${MIN_PLAYERS}人未満のため表示しません。`);
  const metrics = [["ゴール", "goals", false], ["アシスト", "assists", false], ["G＋A", "ga", false], ["出場時間", "minutes", false], ["先発", "starts", false], ["イエロー", "yellowCards", true], ["レッド", "redCards", true]];
  return element("div", { className: "percentile-list", attributes: { "data-comparison-count": String(candidates.length) } }, metrics.map(([label, key, inverse]) => {
    const value = key === "ga" ? stats.goals + stats.assists : stats[key];
    const values = candidates.map((entry) => key === "ga" ? entry.goals + entry.assists : entry[key]);
    const lower = values.filter((entry) => entry < value).length;
    const equal = values.filter((entry) => entry === value).length;
    let percentile = Math.round((lower + Math.max(0, equal - 1) / 2) / Math.max(1, values.length - 1) * 100);
    if (inverse) percentile = 100 - percentile;
    const level = percentile >= 75 ? "high" : percentile >= 40 ? "middle" : "low";
    return element("div", { className: `percentile-row is-${level}` }, [
      element("span", { text: label }), element("strong", { text: String(value) }),
      element("span", { className: "percentile-bar", attributes: { style: `--percentile:${percentile}%`, "aria-label": `${percentile}パーセンタイル` } }),
      element("b", { text: String(percentile) }), inverse ? element("small", { text: "少ないほど上位" }) : null,
    ]);
  }));
}

function createShootingStats(player, stats, matches, per90) {
  let shots = 0; let shotMatches = 0; let headingGoals = 0;
  for (const match of matches ?? []) {
    const side = match.homeTeam?.teamId === player.teamId ? "home" : match.awayTeam?.teamId === player.teamId ? "away" : null;
    if (!side) continue;
    const row = (match.playerShots ?? []).find((entry) => entry.side === side && normalizePlayerName(entry.name) === normalizePlayerName(player.name));
    if (row) { shots += Number(row.shots) || 0; shotMatches += 1; }
    headingGoals += (match.goals ?? []).filter((goal) => goal.finish === "HS" && normalizePlayerName(goal.scorerName) === normalizePlayerName(player.name) && goal.teamName === match[`${side}Team`]?.name).length;
  }
  return element("div", {}, [
    metricCards([["ゴール数", formatMetric(stats.goals, stats.minutes, per90)], ["PK得点数", "－"], ["シュート数", shotMatches ? formatMetric(shots, stats.minutes, per90) : "－"], ["ヘディング得点数", headingGoals]]),
    element("p", { className: "data-note", text: shotMatches ? `シュート数は公式掲載${shotMatches}試合のみ。` : "選手別シュート数は公式記録未掲載です。" }),
  ]);
}
