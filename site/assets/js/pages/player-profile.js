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

export function renderPlayerProfilePage({
  currentPlayerId,
  playerDirectory,
  playerStatistics,
  teamDirectory,
  favoritePlayerIds = [],
  players = [],
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
  return element(
    "article",
    {
      className: "page player-profile",
      attributes: { "data-page": "player", "data-player-id": player.id },
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
        createPanel("人物情報", createBasicInformation(player, team, teamDirectory), "共通情報と選択中の公式登録"),
        createPanel("成績概要", createSeasonStats(stats, "player-summary-grid"), registrationLabel(player, teamDirectory)),
        createSeasonStatistics(stats),
        createPanel(
          "直近の出場試合",
          createMatchHistory(stats, teamDirectory),
          `直近${Math.min(stats.matches.length, 5)}試合`,
        ),
        registrations.length > 1
          ? createPanel("シーズン・大会別成績", createRegistrationSummary(registrations, playerStatistics, teamDirectory, player.id), `${registrations.length}登録`)
          : null,
        createNotice("学年のみ生年月日から標準進学時の学年を推定。ベンチ入りはメンバー表の控え登録、出場時間は先発・交代・退場時刻から算出しています。前期は第1〜9節、後期は第10〜18節です。"),
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

function createMatchHistory(stats, teamDirectory) {
  if (!stats.matches.length) return createNotice("出場・ベンチ登録記録はありません。");
  return element(
    "div",
    { className: "player-match-list" },
    stats.matches.slice(0, 5).map((record) => {
      const appeared = record.started || record.substitutionOn;
      const details = [
        appeared ? `${record.minutes}分` : null,
        record.started
          ? "先発"
          : record.substitutionOn
            ? "途中出場"
            : record.benchSelected
              ? "ベンチ入り（出場なし）"
              : "出場なし",
        record.fullAppearance ? "フル出場" : null,
        record.goals ? `${record.goals}得点` : null,
        record.assists ? `${record.assists}アシスト` : null,
        record.yellowCards ? `警告${record.yellowCards}` : null,
        record.redCards ? `退場${record.redCards}` : null,
      ].filter(Boolean);
      const hasScore = Number.isFinite(record.teamScore) && Number.isFinite(record.opponentScore);
      const row = element("div", {
        className: "player-match-row",
        attributes: {
          "data-route": "match",
          "data-match-id": record.matchId,
          role: "link",
          tabindex: "0",
        },
      }, [
        element("span", { className: "player-match-row__date", text: formatKickoff(record) }),
        element("div", { className: "row-copy" }, [
          element("span", {}, [element("span", { text: "vs " }), createTeamNameLink(teamDirectory?.byId.get(record.opponentTeamId), record.opponentName)]),
          element("span", { text: [record.competitionName ?? "選択中の大会", hasScore ? `${record.teamScore}-${record.opponentScore}` : null].filter(Boolean).join(" / ") }),
          element("span", { text: details.join(" / ") }),
        ]),
      ]);
      row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); row.click(); } });
      return row;
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
