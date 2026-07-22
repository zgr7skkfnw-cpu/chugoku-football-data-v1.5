import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:4173/";
const SCHEDULED = "football-system-schedule-24e8d7424d7d";
const FINISHED = "football-system-15-558-25665";

test("試合本文スワイプとカレンダーで日付を変更し操作要素では誤作動しない", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}?date=2026-09-05`);
  await expect(page.locator('.home-date-picker')).toHaveValue("2026-09-05");
  await page.locator('.home-date-picker').fill("2026-09-12");
  await expect(page).toHaveURL(/date=2026-09-12/);
  const feed = page.locator('[data-page="home"]');
  await feed.dispatchEvent("pointerdown", { pointerId: 9, pointerType: "touch", clientX: 310, clientY: 600 });
  await feed.dispatchEvent("pointerup", { pointerId: 9, pointerType: "touch", clientX: 100, clientY: 602 });
  await expect(page).toHaveURL(/date=2026-09-13/);
  await page.locator('.collapsible-competition__toggle').first().click();
  await expect(page).toHaveURL(/date=2026-09-13/);
});

test("リーグ試合絞り込みは期間とチームだけを表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=league&competition=jufa-chugoku-2026-division-1&season=2026&tab=matches`);
  await page.getByRole("tab", { name: "試合", exact: true }).click();
  await expect(page.getByLabel("日付で絞り込み")).toHaveCount(0);
  await expect(page.getByLabel(/節で絞り込み|ラウンドで絞り込み/)).toHaveCount(0);
  await expect(page.getByLabel("チームで絞り込み")).toBeVisible();
  await expect(page.getByRole("tab", { name: "通算" })).toBeVisible();
});

test("未開催プレビューは2チームを並列表示しチーム別得点者を示す", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}?view=match&id=${SCHEDULED}`);
  await expect(page.locator('.prematch-form-team')).toHaveCount(2);
  const columns = await page.locator('.prematch-form-grid').evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(2);
  await expect(page.getByRole("heading", { name: "両チームの今大会最多得点者" })).toBeVisible();
  await expect(page.locator('.prematch-scorer')).toHaveCount(2);
});

test("公式スタッツを同期し0と未掲載を区別する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=match&id=${FINISHED}&tab=stats`);
  const stats = page.locator('.finished-stat-comparison').first();
  await expect(stats).toContainText("総シュート数");
  await expect(stats).toContainText("7");
  await expect(stats).toContainText("12");
  await expect(stats).toContainText("0");
});

test("ラインナップは390pxでもホームとアウェーを2列比較する", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}?view=match&id=${FINISHED}&tab=lineup`);
  const columns = await page.locator('.finished-lineup-grid').evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(2);
});

test("検索は公式登録情報が一致する選手を1人に集約し詳細で登録を切り替える", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=search`);
  await page.getByRole("searchbox").fill("伊津 遥人");
  await expect(page.locator('.player-list .player-list__row, .player-list [data-route="player"]')).toHaveCount(1);
  await page.locator('.player-list [data-route="player"]').first().click();
  await expect(page.getByRole("heading", { name: "登録区分" })).toBeVisible();
  await expect(page.locator('.player-registration-switch a')).toHaveCount(2);
});
