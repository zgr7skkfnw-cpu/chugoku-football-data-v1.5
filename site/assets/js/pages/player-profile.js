import { routeHref } from "../router.js";
import {
  createKitImage,
  createNotice,
  createPanel,
  createTeamEmblem,
  element,
} from "../ui/elements.js";
import { formatKickoff } from "../utils/football.js";
import { formatGrade, getPlayer } from "../utils/players.js";
import { createTeamNameLink } from "./shared.js";

export function renderPlayerProfilePage({
  currentPlayerId,
  playerDirectory,
  playerStatistics,
  teamDirectory,
}) {
  const player = getPlayer(playerDirectory, currentPlayerId);
  const stats = player ? playerStatistics?.get(player.id) : null;

  if (!player || !stats) {
    return element("article", { className: "page", attributes: { "data-page": "player" } }, [
      createNotice("指定された選手は登録データに見つかりません。"),
    ]);
  }

  const team = stats.team;
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
        createPanel("基本情報", createBasicInformation(player, team), "選手登録"),
        createSeasonStatistics(stats),
        createPanel(
          "試合別成績",
          createMatchHistory(stats, teamDirectory),
          `${stats.appearances}試合出場 / ${stats.benchSelections}試合ベンチ入り`,
        ),
        createNotice("学年のみ生年月日から標準進学時の学年を推定。ベンチ入りはメンバー表の控え登録、出場時間は先発・交代・退場時刻から算出しています。前期は第1〜9節、後期は第10〜18節です。"),
      ]),
    ],
  );
}

function createBasicInformation(player, team) {
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

function createSeasonStats(stats) {
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
  ];
  return element(
    "div",
    { className: "player-stat-grid" },
    values.map(([label, value]) =>
      element("div", { className: "player-stat" }, [
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
    stats.matches.map((record) => {
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
          element("span", { text: details.join(" / ") }),
        ]),
      ]);
      row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); row.click(); } });
      return row;
    }),
  );
}
