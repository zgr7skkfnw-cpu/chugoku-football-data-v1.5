import { routeHref } from "../router.js";
import { createNotice, createPageHeader, element } from "../ui/elements.js";

const LEAGUES = [
  {
    division: 1,
    competitionId: "jufa-chugoku-2026-division-1",
    name: "中国大学サッカーリーグ1部",
    shortName: "1部",
    description: "中国地区の大学サッカー最上位リーグ",
  },
  {
    division: 2,
    competitionId: "jufa-chugoku-2026-division-2",
    name: "中国大学サッカーリーグ2部",
    shortName: "2部",
    description: "中国地区の大学サッカー2部リーグ",
  },
  {
    division: 1,
    competitionId: "jufa-chugoku-2026-i-league-division-1",
    name: "Iリーグ中国",
    shortName: "Iリーグ",
    description: "1部・2部・順位決定プレーオフ",
  },
  {
    division: 0,
    competitionId: "jufa-chugoku-2026-championship",
    name: "中国大学サッカー選手権",
    shortName: "選手権",
    description: "2026年度 第50回中国大学サッカー選手権",
  },
  {
    division: 0,
    competitionId: "jufa-chugoku-2026-rookie-tournament",
    name: "中国大学サッカー新人戦",
    shortName: "新人戦",
    description: "2026年度 第10回中国大学サッカー新人戦",
  },
  {
    division: 0,
    competitionId: "jufa-chugoku-2026-promotion-relegation",
    name: "1部・2部入替戦",
    shortName: "入替戦",
    description: "中国大学サッカーリーグの昇降格決定戦",
  },
];
const ORDER_KEY = "chugoku-football.league-order";

export function renderLeaguesPage() {
  let order = loadOrder();
  const list = element("div", { className: "league-card-list", attributes: { "data-swipe-exclude": "true" } });
  const renderCards = () => {
    const ordered = order.map((id) => LEAGUES.find((league) => league.competitionId === id)).filter(Boolean);
    list.replaceChildren(...ordered.map((league, index) => createLeagueCard(league, {
      up: () => move(index, -1), down: () => move(index, 1), first: index === 0, last: index === ordered.length - 1,
    })));
  };
  const move = (index, amount) => { const next = index + amount; if (next < 0 || next >= order.length) return; [order[index], order[next]] = [order[next], order[index]]; saveOrder(order); renderCards(); };
  const reset = element("button", { className: "secondary-button league-order-reset", text: "初期順序へ戻す", attributes: { type: "button" } });
  reset.addEventListener("click", () => { order = LEAGUES.map((league) => league.competitionId); saveOrder(order); renderCards(); });
  renderCards();

  return element(
    "article",
    {
      className: "page",
      attributes: { "data-page": "leagues" },
    },
    [
      createPageHeader({
        eyebrow: "Competitions",
        title: "リーグ",
        description: "大会を選択して、順位表や試合、過去シーズンを確認できます。",
        badge: "一覧",
      }),
      element("div", { className: "section-stack" }, [
        element("div", { className: "league-order-toolbar" }, [element("span", { text: "大会の表示順" }), reset]),
        list,
        createNotice("リーグ戦、Iリーグ、カップ戦、入替戦を大会別に掲載しています。"),
      ]),
    ],
  );
}

function createLeagueCard(league, controls) {
  const link = element(
    "a",
    {
      className: "league-card",
      attributes: {
        href: routeHref("league", { competitionId: league.competitionId, season: 2026 }),
        "data-route": "league",
        "data-competition-id": league.competitionId,
        "data-season": "2026",
        "aria-label": `${league.name}の詳細を表示`,
      },
    },
    [
      element("div", {
        className: `league-card__badge league-card__badge--division-${league.division}`,
        text: league.shortName,
      }),
      element("div", { className: "league-card__copy" }, [
        element("strong", { text: league.name }),
        element("span", { text: league.description }),
      ]),
      element("span", {
        className: "league-card__arrow",
        text: "›",
        attributes: { "aria-hidden": "true" },
      }),
    ],
  );

  const up = element("button", { className: "league-order-button", text: "↑", attributes: { type: "button", "aria-label": `${league.name}を上へ`, disabled: controls.first ? "" : null } });
  const down = element("button", { className: "league-order-button", text: "↓", attributes: { type: "button", "aria-label": `${league.name}を下へ`, disabled: controls.last ? "" : null } });
  up.disabled = controls.first; down.disabled = controls.last; up.addEventListener("click", controls.up); down.addEventListener("click", controls.down);
  return element("div", { className: "league-card-row", attributes: { "data-competition-id": league.competitionId } }, [link, element("div", { className: "league-order-controls" }, [up, down])]);
}

function loadOrder() { try { const stored = JSON.parse(localStorage.getItem(ORDER_KEY) ?? "[]"); const valid = stored.filter((id) => LEAGUES.some((league) => league.competitionId === id)); return [...valid, ...LEAGUES.map((league) => league.competitionId).filter((id) => !valid.includes(id))]; } catch { return LEAGUES.map((league) => league.competitionId); } }
function saveOrder(order) { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); }
