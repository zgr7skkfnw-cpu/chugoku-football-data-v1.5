import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:4173/";
const DIV1 = "football-system-schedule-24e8d7424d7d";
const DIV2 = "football-system-schedule-c07493e87099";
const I1 = "football-system-schedule-28d14d57290a";
const I2 = "football-system-schedule-6531ebfb4f0b";
const ROOKIE = "football-system-schedule-25f7fddaf184";

async function swipe(locator, fromX, toX, y = 500) {
  await locator.dispatchEvent("pointerdown", { pointerId: 7, pointerType: "touch", clientX: fromX, clientY: y });
  await locator.dispatchEvent("pointerup", { pointerId: 7, pointerType: "touch", clientX: toX, clientY: y + 3 });
}

test("未開催試合は4タブをURL・再読み込み・スワイプで維持する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=match&id=${DIV1}`);
  await expect(page.locator(".prematch-tab")).toHaveCount(4);
  await expect(page.locator(".prematch-v2-scoreboard__team").first()).toContainText("山口大学");
  await expect(page.locator(".prematch-v2-scoreboard__team").last()).toContainText("IPU・環太平洋大学");
  await page.getByRole("tab", { name: "出場停止" }).click();
  await expect(page).toHaveURL(/tab=suspensions/);
  await page.reload();
  await expect(page.getByRole("tab", { name: "出場停止" })).toHaveAttribute("aria-selected", "true");
  await swipe(page.locator(".prematch-tab-content"), 320, 60);
  await expect(page).toHaveURL(/tab=standings/);
  await swipe(page.locator(".prematch-tab-content"), 60, 320);
  await expect(page).toHaveURL(/tab=suspensions/);
});

test("終了済み試合には未開催4タブを表示しない", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=match&id=football-system-15-558-25650`);
  await expect(page.locator(".prematch-tabs")).toHaveCount(0);
  await expect(page.locator(".match-scoreboard__score")).toContainText("2 - 1");
});

test("プレビューは試合前の全大会フォームと得点王を表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=match&id=${DIV2}`);
  await expect(page.locator(".prematch-form-team")).toHaveCount(2);
  for (const team of await page.locator(".prematch-form-team").all()) await expect(team.locator(".prematch-form-result")).toHaveCount(5);
  await expect(page.locator(".prematch-form-result").filter({ hasText: "中国大学サッカー選手権" })).not.toHaveCount(0);
  await expect(page.locator(".prematch-scorer").first()).toContainText("シュート－");
  await expect(page.locator(".prematch-scorer").first()).toContainText("出場時間");
});

for (const [label, matchId, rowCount] of [["1部", DIV1, 10], ["2部", DIV2, 11], ["Iリーグ1部", I1, 8], ["Iリーグ2部", I2, 6]]) {
  test(`${label}未開催試合は該当大会だけの直前順位表を表示する`, async ({ page }) => {
    await page.goto(`${BASE_URL}?view=match&id=${matchId}&tab=standings`);
    await expect(page.locator(".prematch-standing-table tbody tr")).toHaveCount(rowCount);
    await expect(page.locator(".prematch-standing-table tr.is-highlighted")).toHaveCount(2);
  });
}

test("新人戦は該当グループだけの順位表を表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=match&id=${ROOKIE}&tab=standings`);
  await expect(page.getByRole("tab", { name: "順位表" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aグループ 順位表" })).toBeVisible();
  await expect(page.locator(".prematch-standing-table tbody tr")).toHaveCount(3);
  await expect(page.locator(".prematch-standing-table")).not.toContainText("Bグループ");
});

test("順位表横スクロールと縦操作ではタブスワイプしない", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=match&id=${DIV1}&tab=standings`);
  await swipe(page.locator(".table-scroll"), 320, 60);
  await expect(page).toHaveURL(/tab=standings/);
  const content = page.locator(".prematch-tab-content");
  await content.dispatchEvent("pointerdown", { pointerId: 8, pointerType: "touch", clientX: 200, clientY: 200 });
  await content.dispatchEvent("pointerup", { pointerId: 8, pointerType: "touch", clientX: 205, clientY: 380 });
  await expect(page).toHaveURL(/tab=standings/);
});

test("トーナメントをラウンド別表示して公式PKスコアを維持する", async ({ page }) => {
  await page.goto(BASE_URL);
  await page.evaluate(async () => {
    const { renderScheduledMatchPage } = await import("/assets/js/pages/scheduled-match.js");
    const teams = ["a", "b", "c", "d"].map((id) => ({ id, name: `Team ${id.toUpperCase()}`, shortName: id.toUpperCase() }));
    const teamDirectory = { byId: new Map(teams.map((team) => [team.id, team])), byAlias: new Map() };
    const base = { season: 2026, competitionId: "test-cup", competitionName: "公式テスト杯", status: "finished", roundLabel: "準決勝", kickoffAt: "2026-06-01T12:00:00+09:00", venue: "公式会場", gameId: 1 };
    const semifinal = { ...base, id: "semi", homeTeam: { teamId: "c", name: "Team C", score: 1 }, awayTeam: { teamId: "d", name: "Team D", score: 1 }, penaltyShootout: { home: 4, away: 3 } };
    const current = { ...base, id: "final", status: "scheduled", roundLabel: "決勝", kickoffAt: "2026-07-01T12:00:00+09:00", homeTeam: { teamId: "a", name: "Team A", score: null }, awayTeam: { teamId: "b", name: "Team B", score: null }, suspensions: { home: [{ playerName: "公式 選手", number: 8, reason: "累積警告", source: "公式大会記録" }], away: [] } };
    const context = { match: current, home: teams[0], away: teams[1], matches: [semifinal, current], teamDirectory, playerDirectory: null, playerStatistics: null, competition: { id: "test-cup", competitionType: "tournament" } };
    const host = document.createElement("div"); host.id = "component-fixture"; document.body.append(host);
    host.append(renderScheduledMatchPage({ ...context, selectedMatchTab: "standings" }));
  });
  await expect(page.locator("#component-fixture .tournament-round-tab")).toHaveCount(2);
  await expect(page.locator("#component-fixture .tournament-match-card.is-highlighted")).toHaveCount(2);
  await page.locator('#component-fixture .tournament-round-tab[data-round="準決勝"]').click();
  await expect(page.locator("#component-fixture .tournament-round-matches")).toContainText("PK 4-3");
});
