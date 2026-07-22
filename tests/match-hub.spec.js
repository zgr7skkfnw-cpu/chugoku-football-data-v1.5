import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:4173/";
const SCHEDULED_MATCH_ID = "football-system-schedule-24e8d7424d7d";

function collectErrors(page) {
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("試合ハブの日付切替・4タブ・チームリンクが動作する", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(BASE_URL);
  await expect(page.locator("#bottom-navigation .nav-item")).toHaveCount(4);
  await expect(page.locator("#bottom-navigation")).toContainText("試合");
  await expect(page.locator("#bottom-navigation")).toContainText("リーグ");
  await expect(page.locator("#bottom-navigation")).toContainText("フォロー中");
  await expect(page.locator("#bottom-navigation")).toContainText("検索");
  await expect(page.getByText("今日の試合はありません")).toBeVisible();

  await page.goto(`${BASE_URL}?date=2026-08-30`);
  await expect(page.locator('[data-date-matches="10"]')).toBeVisible();
  await expect(page.locator(".collapsible-competition__name").nth(0)).toHaveText("中国大学サッカーリーグ 1部");
  await expect(page.locator(".collapsible-competition__name").nth(1)).toHaveText("中国大学サッカーリーグ 2部");
  const card = page.locator(`[data-match-card="${SCHEDULED_MATCH_ID}"]`);
  await expect(card).toContainText("山口大学");
  await card.locator('.team-name-link').first().click();
  await expect(page.locator('[data-page="team"][data-team-id="yamaguchi"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test("試合前のプレビュー・順位表を公開データで表示する", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${BASE_URL}?view=match&id=${SCHEDULED_MATCH_ID}`);
  await expect(page.getByRole("heading", { name: "試合予定" })).toBeVisible();
  await expect(page.locator(".prematch-tabs .prematch-tab")).toHaveCount(4);
  await expect(page.locator(".prematch-form-team")).toHaveCount(2);
  await expect(page.locator(".season-comparison__team")).toHaveCount(2);

  await page.getByRole("tab", { name: "順位表", exact: true }).click();
  await expect(page.locator(".prematch-standing-table tbody tr")).toHaveCount(10);
  await expect(page.locator(".prematch-standing-table tr.is-highlighted")).toHaveCount(2);

  await page.getByRole("tab", { name: "対戦", exact: true }).click();
  await expect(page.getByRole("heading", { name: "対戦成績" })).toBeVisible();
  await expect(page.locator(".h2h-summary .h2h-team")).toHaveCount(2);
  const currentSeasonH2h = page.locator(".h2h-history-row").filter({ hasText: "2026年" }).filter({ hasText: "中国大学サッカーリーグ 1部" });
  await expect(currentSeasonH2h).toHaveCount(1);
  await expect(currentSeasonH2h).toContainText("2026年");
  await expect(currentSeasonH2h).not.toContainText("前期");
  await expect(currentSeasonH2h).not.toContainText("後期");

  expect(errors).toEqual([]);
});

test("2部の試合詳細から2部順位表を表示する", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${BASE_URL}?view=match&id=football-system-schedule-c07493e87099`);
  await expect(page.getByRole("heading", { name: "試合予定" })).toBeVisible();
  await expect(page.locator('[data-page="match"]')).toContainText("中国大学サッカーリーグ 2部");
  await page.getByRole("tab", { name: "順位表", exact: true }).click();
  await expect(page.locator(".prematch-standing-table tbody tr")).toHaveCount(11);
  await expect(page.locator(".prematch-standing-table")).toContainText("下関市立大学");
  expect(errors).toEqual([]);
});

test("フォロー中と全体検索から詳細へ移動できる", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.setItem("chugoku-football.favorite-team", "ipu"));
  await page.goto(`${BASE_URL}?view=following`);
  await expect(page.locator('[data-page="following"]')).toContainText("IPU・環太平洋大学");

  await page.goto(`${BASE_URL}?view=search`);
  await page.getByLabel("全体検索").fill("小宮 一馬");
  await expect(page.locator(".player-list .player-row--link")).toHaveCount(1);
  await page.locator(".player-list .player-row--link").click();
  await expect(page.locator('[data-page="player"]')).toBeVisible();
  expect(errors).toEqual([]);
});
