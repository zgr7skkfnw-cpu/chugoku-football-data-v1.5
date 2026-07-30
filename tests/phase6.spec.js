import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:4173/";

function collectErrors(page) {
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("試合検索と複合フィルターを併用できる", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${BASE_URL}?view=matches`);
  await page.getByLabel("試合検索").fill("IPU");
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", "18");
  await page.getByRole("button", { name: "未開催" }).click();
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", "9");
  await page.getByLabel("試合検索").fill("存在しない試合");
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", "0");
  expect(errors).toEqual([]);
});

test("リーグ順位表は共通10列でホーム・アウェイ順位も切り替えられる", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${BASE_URL}?view=standings`);
  await page.getByRole("link", { name: /中国大学サッカーリーグ1部の詳細/ }).click();
  await expect(page.locator(".standing-mode-tabs button")).toHaveCount(3);
  await expect(page.locator('table[data-standing-mode="overall"]')).toBeVisible();
  await expect(page.locator(".standing-table thead th")).toHaveText(["順", "チーム", "試", "勝", "分", "敗", "得", "失", "差", "点"]);
  await expect(page.locator(".rank-change")).toHaveCount(0);
  await expect(page.locator(".standing-table")).not.toContainText("勝率");
  await expect(page.locator(".standing-table .team-emblem")).toHaveCount(0);
  await page.goto(`${BASE_URL}?view=league&competition=jufa-chugoku-2026-division-2&season=2026`);
  await expect(page.locator(".standing-table tbody tr")).toHaveCount(11);
  await expect(page.locator(".standing-table")).toContainText("下関市立大学");
  await page.goto(`${BASE_URL}?view=league&competition=jufa-chugoku-2026-division-1&season=2026`);
  await page.getByRole("tab", { name: "ホーム順位", exact: true }).click();
  await expect(page.locator('table[data-standing-mode="home"]')).toBeVisible();
  await page.getByRole("tab", { name: "アウェイ順位", exact: true }).click();
  await expect(page.locator('table[data-standing-mode="away"]')).toBeVisible();
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.locator(".unified-standing-table").evaluate((table) => table.scrollWidth <= table.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("先発・ベンチ・フル出場・途中出場ランキングと推定学年フィルターが動く", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${BASE_URL}?view=rankings`);
  await expect(page.locator(".ranking-tabs button")).toHaveCount(13);
  await page.getByRole("tab", { name: "フル出場", exact: true }).click();
  await expect(page.getByRole("heading", { name: "フル出場ランキング" })).toBeVisible();
  await expect(page.locator(".ranking-entry").first()).toBeVisible();
  await page.getByLabel("ランキングの推定学年").selectOption("1");
  await expect(page.locator(".ranking-entry").first()).toContainText("1年（推定）");
  await page.getByRole("tab", { name: "ベンチ入り", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ベンチ入りランキング" })).toBeVisible();
  expect(errors).toEqual([]);
});
