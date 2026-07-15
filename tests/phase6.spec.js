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
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", "21");
  await page.getByRole("button", { name: "未開催" }).click();
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", "10");
  await page.getByLabel("試合検索").fill("存在しない試合");
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", "0");
  expect(errors).toEqual([]);
});

test("ホーム・アウェイ順位と勝率・順位変動を表示する", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${BASE_URL}?view=standings`);
  await expect(page.locator(".standing-mode-tabs button")).toHaveCount(3);
  await expect(page.locator('table[data-standing-mode="overall"]')).toBeVisible();
  await expect(page.locator(".rank-change")).toHaveCount(10);
  await expect(page.locator(".standing-table tbody tr").first()).toContainText("%");
  await page.getByRole("tab", { name: "2部", exact: true }).click();
  await expect(page.locator(".standing-table tbody tr")).toHaveCount(11);
  await expect(page.locator(".standing-table")).toContainText("下関市立大学");
  await page.getByRole("tab", { name: "1部", exact: true }).click();
  await page.getByRole("tab", { name: "ホーム順位", exact: true }).click();
  await expect(page.locator('table[data-standing-mode="home"]')).toBeVisible();
  await page.getByRole("tab", { name: "アウェイ順位", exact: true }).click();
  await expect(page.locator('table[data-standing-mode="away"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test("先発・ベンチ・フル出場・途中出場ランキングと推定学年フィルターが動く", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${BASE_URL}?view=rankings`);
  await expect(page.locator(".ranking-tabs button")).toHaveCount(11);
  await page.getByRole("tab", { name: "フル出場", exact: true }).click();
  await expect(page.getByRole("heading", { name: "フル出場ランキング" })).toBeVisible();
  await expect(page.locator(".ranking-entry").first()).toBeVisible();
  await page.getByLabel("ランキングの推定学年").selectOption("1");
  await expect(page.locator(".ranking-entry").first()).toContainText("1年（推定）");
  await page.getByRole("tab", { name: "ベンチ入り", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ベンチ入りランキング" })).toBeVisible();
  expect(errors).toEqual([]);
});
