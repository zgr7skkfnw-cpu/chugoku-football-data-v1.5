import { expect, test } from "@playwright/test";
import division1 from "../site/data/seasons/2026/matches.json" with { type: "json" };
import division2 from "../site/data/seasons/2026/div2/matches.json" with { type: "json" };

const BASE_URL = "http://localhost:4173/";
const SCHEDULED_MATCH = division1.items.find((match) => match.status === "scheduled");
const SCHEDULED_MATCH_ID = SCHEDULED_MATCH.id;
const DIV2_SCHEDULED = division2.items.find((match) => match.status === "scheduled");
const sharedDate = division1.items.map((match) => match.kickoffAt.slice(0, 10)).find((date) => (
  division2.items.some((match) => match.kickoffAt.startsWith(date))
));
const sharedDateMatches = [...division1.items, ...division2.items].filter((match) => match.kickoffAt.startsWith(sharedDate));
const HUB_MATCH = sharedDateMatches[0];

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

  await page.goto(`${BASE_URL}?date=${sharedDate}`);
  await expect(page.locator(`[data-date-matches="${sharedDateMatches.length}"]`)).toBeVisible();
  await expect(page.locator(".collapsible-competition__name").nth(0)).toHaveText("中国大学サッカーリーグ 1部");
  await expect(page.locator(".collapsible-competition__name").nth(1)).toHaveText("中国大学サッカーリーグ 2部");
  const card = page.locator(`[data-match-card="${HUB_MATCH.id}"]`);
  await expect(card).toContainText(HUB_MATCH.homeTeam.name);
  await card.locator('.team-name-link').first().click();
  await expect(page.locator('[data-page="team"]')).toBeVisible();
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
  await page.goto(`${BASE_URL}?view=match&id=${DIV2_SCHEDULED.id}`);
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
