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

export function renderLeaguesPage() {
  const cards = LEAGUES.map(createLeagueCard);

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
        element("div", { className: "league-card-list" }, cards),
        createNotice("リーグ戦、Iリーグ、カップ戦、入替戦を大会別に掲載しています。"),
      ]),
    ],
  );
}

function createLeagueCard(league) {
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

  return link;
}
