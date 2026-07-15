import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:4173/";

test("Phase 4 選手検索・詳細・ランキング・相互リンク", async ({ page }) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(`${BASE_URL}?view=players`);
  await expect(page.locator('[data-page="players"]')).toBeVisible();
  await expect(page.locator(".player-list")).toHaveAttribute("data-player-count", "507");
  await page.locator('.search-input').fill("小宮 一馬");
  await expect(page.locator(".player-list")).toHaveAttribute("data-player-count", "1");
  await page.locator(".player-list .player-row--link").click();

  await expect(page.locator('[data-page="player"]')).toBeVisible();
  await expect(page.locator(".player-profile__initial")).toBeVisible();
  await expect(page.locator(".player-profile__reading")).toHaveText("KOMIYA Kazuma");
  await expect(page.locator(".detail-row").filter({ hasText: "読み方" })).toContainText("KOMIYA Kazuma");
  await expect(page.locator(".player-stat-grid")).toContainText("出場時間");
  await expect(page.locator(".player-stat-grid")).toContainText("ベンチ入り");
  await expect(page.locator(".player-period-tabs button")).toHaveCount(3);
  await page.getByRole("tab", { name: "後期", exact: true }).click();
  await expect(page.locator(".player-period-label")).toHaveText("後期成績");
  await expect(page.locator(".player-stat").filter({ hasText: "出場時間" }).locator("strong"))
    .toHaveText("0分");
  await page.getByRole("tab", { name: "通算", exact: true }).click();
  await expect(page.locator(".player-match-row").first()).toBeVisible();
  await page.locator(".player-profile__team-link").click();
  await expect(page.locator('[data-page="team"]')).toBeVisible();
  await expect(page.locator(".roster-list .player-row--link").first()).toBeVisible();

  await page.goto(`${BASE_URL}?view=rankings`);
  await expect(page.locator(".ranking-tabs button")).toHaveCount(11);
  await expect(page.locator(".ranking-entry").first()).toBeVisible();
  await page.getByRole("tab", { name: "アシスト", exact: true }).click();
  await expect(page.getByRole("heading", { name: "アシストランキング" })).toBeVisible();
  await page.getByRole("tab", { name: "出場時間", exact: true }).click();
  await expect(page.locator(".ranking-entry").first()).toContainText("分");

  await page.goto(`${BASE_URL}?view=match&id=football-system-15-558-25623`);
  await expect(page.locator(".lineup-player__link[data-player-id]")).toHaveCount(40);
  await expect(page.locator(".player-inline-link")).toHaveCount(12);
  await page.locator(".player-inline-link").first().click();
  await expect(page.locator('[data-page="player"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test("マイチームが保存されホーム表示を優先する", async ({ page }) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(`${BASE_URL}?view=team&id=ipu`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator(".favorite-button").click();
  await expect(page.locator(".favorite-button")).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("chugoku-football.favorite-team"))).toBe("ipu");

  await page.goto(BASE_URL);
  await page.getByLabel("日付を指定").fill("2026-09-06");
  await expect(page.locator(".league-schedule-groups .panel__title").first()).toHaveText("フォロー中");
  await expect(page.locator(".league-schedule-groups .panel").first()).toContainText("IPU・環太平洋大学");
  await expect(page.getByText("最新結果")).toHaveCount(0);
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem("chugoku-football.favorite-team"))).toBe("ipu");
  expect(errors).toEqual([]);
});

test("主要画面がモバイル幅で収まりConsole Errorがない", async ({ page }) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });

  const routes = [
    "",
    "?view=matches",
    "?view=standings",
    "?view=teams",
    "?view=team&id=ipu",
    "?view=players",
    "?view=player&id=ipu-032c11837e6d",
    "?view=rankings",
    "?view=match&id=football-system-15-558-25623",
  ];

  for (const route of routes) {
    await page.goto(`${BASE_URL}${route}`);
    await expect(page.locator("main [data-page]")).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      body: document.body.scrollWidth,
    }));
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
  }

  expect(errors).toEqual([]);
});
