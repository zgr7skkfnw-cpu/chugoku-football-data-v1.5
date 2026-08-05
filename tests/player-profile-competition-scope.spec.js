import { expect, test } from "@playwright/test";
import {
  playerStatisticsScopeKey,
  selectPlayerStatisticsCompetition,
} from "../site/assets/js/utils/players.js";

const BASE_URL = "http://localhost:4173/";
const REGULAR_PLAYER = "hiroshima-shudo-2a9e8cf5cf9d";
const DIV2_PLAYER = "hiroshima-international-b6a697865fdc";
const I_DIV1_PLAYER = "i-league-2026-shudo-9058a8eb1ee0";
const I_DIV2_PLAYER = "i-league-2026-ipu-b-01f4b82fea5e";

const SCOPES = [
  [2026, "jufa-chugoku-2026-division-1", REGULAR_PLAYER],
  [2026, "jufa-chugoku-2026-division-2", DIV2_PLAYER],
  [2026, "jufa-chugoku-2026-i-league-division-1", I_DIV1_PLAYER],
  [2026, "jufa-chugoku-2026-i-league-division-2", I_DIV2_PLAYER],
  [2025, "jufa-chugoku-2025-i-league-upper-playoff", I_DIV1_PLAYER],
  [2025, "jufa-chugoku-2025-i-league-lower-playoff", I_DIV2_PLAYER],
  [2026, "jufa-chugoku-2026-championship", REGULAR_PLAYER],
  [2026, "jufa-chugoku-2026-rookie-tournament", REGULAR_PLAYER],
  [2025, "jufa-chugoku-2025-division-2-playoff", DIV2_PLAYER],
  [2025, "jufa-chugoku-2025-promotion-relegation", DIV2_PLAYER],
];

test("選手詳細キャッシュキーは大会登録と期間まで分離する", () => {
  const first = playerStatisticsScopeKey({
    season: 2026,
    competitionId: "competition-a",
    teamId: "team-a",
    playerRegistrationId: "registration-a",
    period: "all",
  });
  expect(first).toBe("2026::competition-a::team-a::registration-a::all");
  const variants = [
    { competitionId: "competition-b" },
    { teamId: "team-b" },
    { playerRegistrationId: "registration-b" },
    { period: "first" },
  ].map((change) => playerStatisticsScopeKey({
    season: 2026,
    competitionId: "competition-a",
    teamId: "team-a",
    playerRegistrationId: "registration-a",
    period: "all",
    ...change,
  }));
  expect(new Set([first, ...variants]).size).toBe(5);
});

test("選手合計と前後期を選択大会の試合だけから再集計する", () => {
  const player = { id: "registration-a", teamId: "team-a", position: "MF" };
  const base = new Map([[player.id, {
    player,
    periods: {},
    matches: [
      matchEntry("regular-first", "regular", "first", 90, 1),
      matchEntry("regular-second", "regular", "second", 45, 2),
      matchEntry("rookie", "rookie", "first", 80, 4),
    ],
    competitionIds: new Set(["regular", "rookie"]),
  }]]);
  const stats = selectPlayerStatisticsCompetition(base, {
    season: 2026,
    competitionId: "regular",
    teamId: "team-a",
    playerRegistrationId: player.id,
    period: "all",
  }).get(player.id);
  expect(stats.matches.map((entry) => entry.matchId)).toEqual(["regular-first", "regular-second"]);
  expect(stats.appearances).toBe(2);
  expect(stats.minutes).toBe(135);
  expect(stats.goals).toBe(3);
  expect(stats.periods.first.goals).toBe(1);
  expect(stats.periods.second.goals).toBe(2);
});

for (const [season, competitionId, playerId] of SCOPES) {
  test(`${competitionId} の選手詳細へ他大会の履歴・比較値を混在させない`, async ({ page }) => {
    await page.goto(playerUrl(playerId, competitionId, season, "matches"));
    const root = page.locator('[data-page="player"]');
    await expect(root).toHaveAttribute("data-competition-id", competitionId);
    await expect(root).toHaveAttribute("data-stats-scope", new RegExp(`^${season}::${escapeRegExp(competitionId)}::.+::${escapeRegExp(playerId)}::all$`));
    const history = page.locator(".player-match-list");
    if (await history.count()) {
      const sources = (await history.getAttribute("data-source-competitions"))?.split(",").filter(Boolean) ?? [];
      expect(sources.every((source) => source === competitionId)).toBeTruthy();
      for (const value of await history.locator(".player-match-row").evaluateAll((rows) => rows.map((row) => row.dataset.competitionId))) {
        expect(value).toBe(competitionId);
      }
    }

    await page.goto(playerUrl(playerId, competitionId, season, "stats"));
    await expect(page.locator(".player-stats-tab")).toHaveAttribute("data-competition-id", competitionId);
    await expect(page.locator(".player-stats-tab")).toHaveAttribute("data-player-registration-id", playerId);
    const percentile = page.locator(".percentile-list");
    if (await percentile.count()) {
      await expect(percentile).toHaveAttribute("data-competition-id", competitionId);
      const sources = (await percentile.getAttribute("data-source-competitions"))?.split(",").filter(Boolean) ?? [];
      expect(sources.every((source) => source === competitionId)).toBeTruthy();
    }
  });
}

test("通常リーグ・新人戦・Iリーグを切り替えると登録別成績を履歴と再読み込みへ維持する", async ({ page }) => {
  const regular = "jufa-chugoku-2026-division-1";
  const rookie = "jufa-chugoku-2026-rookie-tournament";
  await page.goto(playerUrl(REGULAR_PLAYER, regular, 2026, "profile"));
  const regularStats = await page.locator(".player-current-strip").innerText();
  await page.locator(".profile-season-picker").click();
  await page.locator(`.profile-season-option[data-player-id="${REGULAR_PLAYER}"][data-competition-id="${rookie}"]`).click();
  await expect(page.locator('[data-page="player"]')).toHaveAttribute("data-competition-id", rookie);
  const rookieStats = await page.locator(".player-current-strip").innerText();
  expect(rookieStats).not.toBe(regularStats);
  await page.reload();
  await expect(page.locator('[data-page="player"]')).toHaveAttribute("data-competition-id", rookie);
  await page.goBack();
  await expect(page.locator('[data-page="player"]')).toHaveAttribute("data-competition-id", regular);
  await page.goForward();
  await expect(page.locator('[data-page="player"]')).toHaveAttribute("data-competition-id", rookie);

  await page.goto(playerUrl(I_DIV1_PLAYER, "jufa-chugoku-2026-i-league-division-1", 2026, "profile"));
  await expect(page.locator('[data-page="player"]')).toHaveAttribute("data-player-id", I_DIV1_PLAYER);
  await expect(page.locator('[data-page="player"]')).toHaveAttribute("data-competition-id", "jufa-chugoku-2026-i-league-division-1");
});

test("選手別記録がない大会は通常リーグの数値へフォールバックしない", async ({ page }) => {
  const competitionId = "jufa-chugoku-2026-promotion-relegation";
  await page.goto(playerUrl(REGULAR_PLAYER, competitionId, 2026, "profile"));
  await expect(page.locator('[data-page="player"]')).toHaveAttribute("data-competition-id", competitionId);
  const values = await page.locator(".player-current-strip strong").allTextContents();
  expect(values).toEqual(["0", "0", "0", "0分"]);
  await page.goto(playerUrl(REGULAR_PLAYER, competitionId, 2026, "matches"));
  await expect(page.getByText("出場・ベンチ登録記録はありません。")).toBeVisible();
});

function matchEntry(matchId, competitionId, period, minutes, goals) {
  return {
    matchId,
    season: 2026,
    competitionId,
    teamId: "team-a",
    period,
    started: true,
    substitutionOn: false,
    substitutionOff: false,
    benchSelected: false,
    fullAppearance: minutes === 90,
    minutes,
    goals,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
  };
}

function playerUrl(playerId, competitionId, season, tab) {
  return `${BASE_URL}?view=player&id=${playerId}&competition=${competitionId}&season=${season}${tab === "profile" ? "" : `&tab=${tab}`}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
