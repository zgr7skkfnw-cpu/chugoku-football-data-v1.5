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
  let editing = false;
  let orderBeforeEdit = [...order];
  const list = element("div", { className: "league-card-list", attributes: { "data-swipe-exclude": "true" } });
  const status = element("span", { text: "大会を選択", attributes: { "aria-live": "polite" } });
  const edit = element("button", { className: "secondary-button league-order-edit", text: "編集", attributes: { type: "button", "aria-pressed": "false" } });
  const reset = element("button", { className: "secondary-button league-order-reset", text: "初期順序へ戻す", attributes: { type: "button", hidden: "" } });
  const cancel = element("button", { className: "secondary-button league-order-cancel", text: "キャンセル", attributes: { type: "button", hidden: "" } });
  const renderCards = () => {
    const ordered = order.map((id) => LEAGUES.find((league) => league.competitionId === id)).filter(Boolean);
    list.replaceChildren(...ordered.map((league, index) => createLeagueCard(league, {
      editing,
      up: () => move(index, -1),
      down: () => move(index, 1),
      drop: (draggedId) => moveTo(draggedId, index),
      first: index === 0,
      last: index === ordered.length - 1,
    })));
  };
  const move = (index, amount) => {
    if (!editing) return;
    const next = index + amount;
    if (next < 0 || next >= order.length) return;
    [order[index], order[next]] = [order[next], order[index]];
    renderCards();
  };
  const moveTo = (draggedId, targetIndex) => {
    if (!editing) return;
    const from = order.indexOf(draggedId);
    if (from < 0 || from === targetIndex) return;
    order.splice(targetIndex, 0, order.splice(from, 1)[0]);
    renderCards();
  };
  const setEditing = (value, { restore = false } = {}) => {
    if (restore) order = [...orderBeforeEdit];
    if (!value && !restore) saveOrder(order);
    if (value) orderBeforeEdit = [...order];
    editing = value;
    edit.textContent = editing ? "完了" : "編集";
    edit.setAttribute("aria-pressed", String(editing));
    reset.hidden = !editing;
    cancel.hidden = !editing;
    status.textContent = editing ? "並び替え編集中" : "大会を選択";
    list.classList.toggle("is-editing", editing);
    renderCards();
  };
  edit.addEventListener("click", () => setEditing(!editing));
  cancel.addEventListener("click", () => setEditing(false, { restore: true }));
  reset.addEventListener("click", () => {
    if (!editing) return;
    order = LEAGUES.map((league) => league.competitionId);
    renderCards();
  });
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
        element("div", { className: "league-order-toolbar" }, [
          status,
          element("div", { className: "league-order-actions" }, [cancel, reset, edit]),
        ]),
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
  link.addEventListener("click", (event) => {
    if (!controls.editing) return;
    event.preventDefault();
  });

  const up = element("button", { className: "league-order-button", text: "↑", attributes: { type: "button", "aria-label": `${league.name}を上へ`, disabled: controls.first ? "" : null } });
  const down = element("button", { className: "league-order-button", text: "↓", attributes: { type: "button", "aria-label": `${league.name}を下へ`, disabled: controls.last ? "" : null } });
  up.disabled = controls.first; down.disabled = controls.last; up.addEventListener("click", controls.up); down.addEventListener("click", controls.down);
  const row = element("div", {
    className: `league-card-row${controls.editing ? " is-editing" : ""}`,
    attributes: {
      "data-competition-id": league.competitionId,
      draggable: controls.editing ? "true" : "false",
      "aria-label": controls.editing ? `${league.name}を並び替え` : null,
    },
  }, [link, element("div", { className: "league-order-controls" }, [
    element("span", { className: "league-drag-handle", text: "⋮⋮", attributes: { "aria-hidden": "true" } }),
    up,
    down,
  ])]);
  row.addEventListener("dragstart", (event) => {
    if (!controls.editing) {
      event.preventDefault();
      return;
    }
    event.dataTransfer?.setData("text/plain", league.competitionId);
    row.classList.add("is-dragging");
  });
  row.addEventListener("dragend", () => row.classList.remove("is-dragging"));
  row.addEventListener("dragover", (event) => {
    if (controls.editing) event.preventDefault();
  });
  row.addEventListener("drop", (event) => {
    if (!controls.editing) return;
    event.preventDefault();
    controls.drop(event.dataTransfer?.getData("text/plain"));
  });
  return row;
}

function loadOrder() { try { const stored = JSON.parse(localStorage.getItem(ORDER_KEY) ?? "[]"); if (!Array.isArray(stored)) return LEAGUES.map((league) => league.competitionId); const valid = [...new Set(stored)].filter((id) => LEAGUES.some((league) => league.competitionId === id)); return [...valid, ...LEAGUES.map((league) => league.competitionId).filter((id) => !valid.includes(id))]; } catch { return LEAGUES.map((league) => league.competitionId); } }
function saveOrder(order) { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); }
