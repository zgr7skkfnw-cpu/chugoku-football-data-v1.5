import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:4173/";

function collectErrors(page) {
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("チーム分析・フォーム・H2H・順位推移を表示する", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${BASE_URL}?view=team&id=ipu`);
  await expect(page.locator('[data-page="team"]')).toBeVisible();
  await expect(page.locator(".season-period-tabs button")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "今季戦績" })).toBeVisible();
  await expect(page.locator(".home-away-grid .split-record")).toHaveCount(2);
  await expect(page.locator(".form-result")).toHaveCount(5);
  await page.locator(".form-result").first().locator("summary").click();
  await expect(page.locator(".form-result__detail").first()).toContainText("Home");
  await expect(page.locator(".team-stat-grid")).toContainText("平均先発年齢");
  await expect(page.locator(".rank-chart svg")).toBeVisible();
  await expect(page.locator(".rank-chart__point")).toHaveCount(9);
  await expect(page.locator(".h2h-card").first()).toBeVisible();
  await page.locator(".h2h-card").first().locator("summary").click();
  await expect(page.locator(".h2h-match-date").first()).toContainText("2026/");
  await expect(page.locator(".h2h-match-context").first()).toContainText("中国大学サッカーリーグ 1部 / リーグ戦");
  await expect(page.locator(".h2h-matches").first()).not.toContainText("前期");
  await expect(page.locator(".h2h-matches").first()).not.toContainText("後期");
  await expect(page.locator(".internal-ranking")).toHaveCount(3);

  await page.getByRole("tab", { name: "後期", exact: true }).click();
  await expect(page.locator(".rank-chart")).toHaveCount(0);
  await expect(page.getByText("この期間の順位推移はまだありません。")).toBeVisible();
  expect(errors).toEqual([]);
});

test("順位・選手ランキング・チームランキングを期間切替する", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${BASE_URL}?view=standings`);
  await page.getByRole("link", { name: /中国大学サッカーリーグ1部の詳細/ }).click();
  await expect(page.locator(".standing-table tbody tr")).toHaveCount(10);
  await expect(page.locator('[data-standing-team="IPU・環太平洋大学"] .rank-number')).toHaveText("1");
  await page.getByRole("tab", { name: "後期", exact: true }).click();
  await expect(page.locator('[data-standing-team="IPU・環太平洋大学"] .rank-number')).toHaveText("–");

  await page.goto(`${BASE_URL}?view=rankings`);
  await expect(page.locator(".ranking-tabs button")).toHaveCount(13);
  await expect(page.locator(".team-ranking-tabs button")).toHaveCount(9);
  await expect(page.locator('[data-team-ranking="averageGoals"] .team-ranking-row').first()).toContainText("IPU・環太平洋大学");
  await page.getByRole("tab", { name: "アシスト", exact: true }).click();
  await expect(page.locator(".panel__title").filter({ hasText: "アシストランキング" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("試合複合フィルターとホームのお気に入り登録が動作する", async ({ page }) => {
  const errors = collectErrors(page);
  const playerRequests = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/data/players.json")) playerRequests.push(request.url());
  });
  await page.goto(`${BASE_URL}?view=matches`);
  await page.locator(".match-filter__team").selectOption("ipu");
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", "18");
  await page.getByRole("button", { name: "アウェイゲーム" }).click();
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", "9");
  await page.getByRole("button", { name: "終了" }).click();
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", "4");
  await expect(page.locator(".match-row--scheduled")).toHaveCount(4);
  expect(playerRequests).toHaveLength(0);
  await page.locator(".match-row--scheduled").first().click();
  await expect(page.getByRole("heading", { name: "試合予定" })).toBeVisible();

  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE_URL}?view=team&id=ipu`);
  await page.locator(".favorite-button").click();
  expect(await page.evaluate(() => localStorage.getItem("chugoku-football.favorite-team"))).toBe("ipu");
  await page.goto(`${BASE_URL}?view=following`);
  await expect(page.locator(".following-team-card")).toContainText("IPU・環太平洋大学");
  await expect(page.getByRole("heading", { name: "チーム順位" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
