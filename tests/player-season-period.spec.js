import { expect, test } from "@playwright/test";

import {
  calculatePlayerStatistics,
  getSeasonPeriod,
  selectPlayerStatisticsCompetition,
} from "../site/assets/js/utils/players.js";

const BASE_URL = "http://localhost:4173/";
const DIV1 = "jufa-chugoku-2026-division-1";
const DIV2 = "jufa-chugoku-2026-division-2";
const DIV1_PLAYER = "hiroshima-c02461cd3bac";
const DIV2_PLAYER = "hiroshima-international-d37bc6f62c7e";

test("前後期は日付ではなく大会別の公式節ルールで判定する", () => {
  const rules = { first: { fromRound: 1, toRound: 11 }, second: { fromRound: 12, toRound: 22 } };
  expect(getSeasonPeriod({ round: 11, kickoffAt: "2026-12-31T12:00:00+09:00", periodRules: rules })).toBe("first");
  expect(getSeasonPeriod({ round: 12, kickoffAt: "2026-01-01T12:00:00+09:00", periodRules: rules })).toBe("second");
  expect(getSeasonPeriod({ round: 1 })).toBeNull();
});

test("期間別の出場・得点・ベンチ記録の和は通年と一致する", () => {
  const player = { id: "player-a", teamId: "team-a", name: "期間 選手", position: "MF" };
  const rules = { first: { fromRound: 1, toRound: 9 }, second: { fromRound: 10, toRound: 18 } };
  const matches = [
    fixtureMatch({ id: "first-appearance", round: 1, rules, player, started: true, goals: 1 }),
    fixtureMatch({ id: "first-bench", round: 9, rules, player, benchOnly: true }),
    fixtureMatch({ id: "second-appearance", round: 10, rules, player, started: false, goals: 2 }),
  ];
  const allStatistics = calculatePlayerStatistics([player], matches, { byId: new Map() });
  const all = select(allStatistics, player, "all");
  const first = select(allStatistics, player, "first");
  const second = select(allStatistics, player, "second");
  for (const key of ["minutes", "appearances", "starts", "benchSelections", "substitutionsOn", "goals", "assists", "yellowCards"]) {
    expect(first[key] + second[key], key).toBe(all[key]);
  }
  expect(first.benchSelections).toBe(1);
  expect(first.appearances).toBe(1);
  expect(first.goals).toBe(1);
  expect(second.minutes).toBe(60);
  expect(second.goals).toBe(2);
});

test("1部選手は通年・前期・後期で全プロフィール集計と履歴が切り替わる", async ({ page }) => {
  await page.goto(playerUrl(DIV1_PLAYER, DIV1));
  await expect(page.getByRole("tab", { name: "通年" })).toHaveAttribute("aria-selected", "true");
  await expect(currentStats(page)).toContainText("1260分");

  await page.getByRole("tab", { name: "前期" }).click();
  await expect(page).toHaveURL(/period=first/);
  await expect(currentStats(page)).toContainText("810分");
  await page.getByRole("tab", { name: "試合", exact: true }).click();
  await expect(page.locator('[data-stats-scope$="::first"]')).toBeVisible();
  expect(await page.locator(".player-match-row").count()).toBeGreaterThan(0);

  await page.getByRole("tab", { name: "後期" }).click();
  await expect(page.locator('[data-page="player"][data-stats-scope$="::second"]')).toBeVisible();
  await page.getByRole("tab", { name: "プロフィール" }).click();
  await expect(currentStats(page)).toContainText("450分");
  await page.goBack();
  await expect(page.getByRole("tab", { name: "後期" })).toHaveAttribute("aria-selected", "true");
  await page.goBack();
  await expect(page.getByRole("tab", { name: "前期" })).toHaveAttribute("aria-selected", "true");
});

test("2部は11節までを前期として期間別集計する", async ({ page }) => {
  await page.goto(playerUrl(DIV2_PLAYER, DIV2));
  await expect(currentStats(page)).toContainText("1350分");
  await page.getByRole("tab", { name: "前期" }).click();
  await expect(currentStats(page)).toContainText("900分");
  await page.getByRole("tab", { name: "後期" }).click();
  await expect(currentStats(page)).toContainText("450分");
});

test("通常リーグのチーム詳細はスカッドとランキングを期間別に確認できる", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=team&id=hiroshima&competition=${DIV1}&season=2026&tab=squad`);
  await expect(page.locator(".season-period-tabs")).toBeVisible();
  const allMinutes = await page.locator(`[data-player-id="${DIV1_PLAYER}"]`).innerText();
  await page.getByRole("tab", { name: "前期" }).click();
  const firstMinutes = await page.locator(`[data-player-id="${DIV1_PLAYER}"]`).innerText();
  expect(firstMinutes).not.toBe(allMinutes);
  await page.getByRole("tab", { name: "スタッツ" }).click();
  await expect(page.locator(".season-period-tabs")).toBeVisible();
});

test("URL直接アクセスで期間を復元し、不正値は通年へ戻す", async ({ page }) => {
  await page.goto(`${playerUrl(DIV1_PLAYER, DIV1)}&period=second`);
  await expect(page.getByRole("tab", { name: "後期" })).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(page.getByRole("tab", { name: "後期" })).toHaveAttribute("aria-selected", "true");
  await page.goto(`${playerUrl(DIV1_PLAYER, DIV1)}&period=invalid`);
  await expect(page.getByRole("tab", { name: "通年" })).toHaveAttribute("aria-selected", "true");
  await expect(page).not.toHaveURL(/period=/);
});

for (const competition of [
  "jufa-chugoku-2026-i-league-division-1",
  "jufa-chugoku-2026-rookie-tournament",
  "jufa-chugoku-2026-championship",
]) {
  test(`${competition} では前後期切り替えを表示しない`, async ({ page }) => {
    const playerId = competition.includes("i-league") ? "i-league-2026-shudo-9058a8eb1ee0" : DIV1_PLAYER;
    await page.goto(playerUrl(playerId, competition));
    await expect(page.locator('.player-period-tabs[aria-label="選手成績の期間"]')).toHaveCount(0);
    await expect(page.locator('[data-page="player"][data-stats-scope$="::all"]')).toBeVisible();
  });
}

for (const width of [320, 375, 390, 430]) {
  test(`${width}pxで期間切り替えが画面外へはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(playerUrl(DIV1_PLAYER, DIV1));
    await expect(page.locator(".player-period-tabs")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

function select(statistics, player, period) {
  return selectPlayerStatisticsCompetition(statistics, {
    season: 2026,
    competitionId: DIV1,
    teamId: player.teamId,
    playerRegistrationId: player.id,
    period,
  }).get(player.id);
}

function fixtureMatch({ id, round, rules, player, started = false, benchOnly = false, goals = 0 }) {
  const substitute = !started && !benchOnly;
  return {
    id,
    season: 2026,
    competitionId: DIV1,
    leagueName: "中国大学サッカーリーグ 1部",
    status: "finished",
    round,
    periodRules: rules,
    kickoffAt: round < 10 ? "2026-12-31T12:00:00+09:00" : "2026-01-01T12:00:00+09:00",
    homeTeam: { teamId: "team-a", name: "チームA", score: goals },
    awayTeam: { teamId: "team-b", name: "チームB", score: 0 },
    lineups: {
      home: {
        teamId: "team-a",
        teamName: "チームA",
        starters: started ? [{ name: player.name }] : [],
        substitutes: started ? [] : [{ name: player.name }],
      },
      away: null,
    },
    substitutions: { home: substitute ? [`30分 [out]別 選手 [in]${player.name}`] : [], away: [] },
    disciplinary: { home: [], away: [] },
    goals: Array.from({ length: goals }, () => ({ teamName: "チームA", scorerName: player.name, assistNames: [] })),
  };
}

function currentStats(page) {
  return page.locator(".player-current-strip");
}

function playerUrl(playerId, competitionId) {
  return `${BASE_URL}?view=player&id=${playerId}&competition=${competitionId}&season=2026`;
}
