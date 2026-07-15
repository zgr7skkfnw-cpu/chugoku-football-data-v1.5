import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:4173/";

function collectErrors(page) {
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("2025年度の日程・1部・2部・入替戦を切り替えて表示する", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(BASE_URL);
  await page.getByLabel("年度を選択").selectOption("2025");
  await expect(page.locator(".home-match-day")).toContainText("11月16日");
  await expect(page.locator('[data-date-matches="2"]')).toBeVisible();
  await expect(page.locator(".league-schedule-groups .panel__title")).toHaveText(["中国大学サッカーリーグ / 入替戦"]);
  await expect(page.locator(".match-row")).toHaveCount(2);

  await page.goto(`${BASE_URL}?view=standings`);
  await page.getByLabel("年度を選択").selectOption("2025");
  await expect(page.locator(".standing-table tbody tr")).toHaveCount(10);
  await expect(page.locator(".standing-table")).toContainText("岡山理科大学");
  await page.getByRole("tab", { name: "2部", exact: true }).click();
  await expect(page.locator(".standing-table tbody tr")).toHaveCount(10);
  await expect(page.locator(".standing-table")).toContainText("岡山大学");
  expect(errors).toEqual([]);
});

test("2025年度の試合詳細に大会区分と日付を表示する", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${BASE_URL}?view=match&id=football-system-15-547-23950`);
  await expect(page.locator('[data-page="match"]')).toContainText("2025年度 中国大学サッカーリーグ 入替戦");
  await expect(page.locator('[data-page="match"]')).toContainText("2025/11/16 14:00");
  await expect(page.locator(".match-scoreboard")).toContainText("4 - 3");
  expect(errors).toEqual([]);
});
