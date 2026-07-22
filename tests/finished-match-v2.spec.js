import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:4173/";
const LEAGUE = "football-system-15-558-25623";
const DIV2 = "football-system-15-559-25715";
const TEN_STARTERS = "football-system-15-559-25734";
const PK_MATCH = "football-system-22-563-26179";

async function swipe(locator, fromX, toX, y = 500) {
  await locator.dispatchEvent("pointerdown", { pointerId: 9, pointerType: "touch", clientX: fromX, clientY: y });
  await locator.dispatchEvent("pointerup", { pointerId: 9, pointerType: "touch", clientX: toX, clientY: y + 2 });
}

test("終了済み試合は5タブをクリック・URL・再読み込み・スワイプで維持する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=match&id=${LEAGUE}`);
  await expect(page.locator(".finished-match-tab")).toHaveCount(5);
  await expect(page.locator(".finished-scoreboard .match-scoreboard__team").first()).toContainText("IPU・環太平洋大学");
  await expect(page.locator(".finished-scoreboard .match-scoreboard__team").last()).toContainText("山口大学");
  await page.getByRole("tab", { name: "ラインナップ" }).click();
  await expect(page).toHaveURL(/tab=lineup/);
  await page.reload();
  await expect(page.getByRole("tab", { name: "ラインナップ" })).toHaveAttribute("aria-selected", "true");
  await swipe(page.locator(".finished-match-content"), 320, 60);
  await expect(page).toHaveURL(/tab=stats/);
  await page.goto(`${BASE_URL}?view=match&id=football-system-schedule-24e8d7424d7d`);
  await expect(page.locator(".prematch-tab")).toHaveCount(4);
  await expect(page.locator(".finished-match-tab")).toHaveCount(0);
});

test("試合情報はスコア内訳・タイムライン・会場・直前フォームを表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=match&id=${LEAGUE}&tab=info`);
  await expect(page.locator(".finished-scoreboard__score")).toContainText("12 - 0");
  await expect(page.locator(".finished-period-scores")).toContainText("前半");
  await expect(page.locator(".finished-period-scores")).toContainText("後半");
  await expect(page.locator(".finished-timeline-row")).not.toHaveCount(0);
  await expect(page.locator('.finished-timeline-row[data-event-type="交代"]').first()).toContainText("IN");
  await expect(page.locator('.finished-timeline-row[data-event-type="交代"]').first()).toContainText("OUT");
  await expect(page.locator(".finished-timeline-row.is-home")).not.toHaveCount(0);
  await expect(page.getByRole("heading", { name: "会場情報" })).toBeVisible();
  await expect(page.locator(".prematch-form-team")).toHaveCount(2);
});

test("ラインナップは先発・控え・監督・交代と試合時点の得点アシストを表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=match&id=${DIV2}&tab=lineup`);
  await expect(page.locator(".finished-lineup-grid .panel")).toHaveCount(2);
  await expect(page.getByText("監督", { exact: true })).toHaveCount(2);
  await expect(page.locator(".finished-lineup-list--bench")).toHaveCount(2);
  await expect(page.locator(".finished-lineup-player").filter({ hasText: /IN|OUT|未出場/ })).not.toHaveCount(0);
  await page.getByRole("button", { name: "今期のスタッツを表示" }).click();
  await expect(page.locator(".lineup-season-stats")).not.toHaveCount(0);
  await expect(page.locator(".lineup-stats-caption")).toContainText("この試合終了時点");
});

test("公式先発10名を補完せずそのまま表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=match&id=${TEN_STARTERS}&tab=lineup`);
  await expect(page.locator(".finished-lineup-grid .panel").nth(1).locator(".finished-lineup-list:not(.finished-lineup-list--bench) li")).toHaveCount(10);
  await expect(page.getByText(/広島工業大学 10名.*11人目は補完していません/)).toBeVisible();
});

test("スタッツは合計と未掲載の前後半を分け0へ変換しない", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=match&id=${LEAGUE}&tab=stats`);
  await expect(page.locator(".finished-stats-period")).toHaveCount(3);
  await expect(page.locator(".finished-stat-values").filter({ hasText: "総シュート数" })).toBeVisible();
  await page.getByRole("button", { name: "前半", exact: true }).click();
  await expect(page.locator(".finished-stats")).toContainText("公式記録未掲載");
  await expect(page.locator(".finished-stats")).toContainText("按分していません");
  await page.getByRole("button", { name: "すべて", exact: true }).click();
  await expect(page.getByText("選手別シュート数は公式記録未掲載です。")).toBeVisible();
});

test("終了後順位と選手権トーナメントを大会別に表示しPKを維持する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=match&id=${DIV2}&tab=standings`);
  await expect(page.locator(".prematch-standing-table tbody tr")).toHaveCount(11);
  await expect(page.locator(".prematch-standing-table tr.is-highlighted")).toHaveCount(2);
  await page.goto(`${BASE_URL}?view=match&id=${PK_MATCH}&tab=standings`);
  await expect(page.getByRole("tab", { name: "トーナメント" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".tournament-match-card.is-highlighted")).not.toHaveCount(0);
  await expect(page.locator(".tournament-round-matches")).toContainText("PK 4-5");
});

test("終了試合を含む通算対戦を開催区分と大会で絞り込める", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=match&id=${LEAGUE}&tab=head-to-head`);
  await expect(page.locator(".prematch-h2h")).toContainText("この試合を含む通算対戦成績");
  const total = Number(await page.locator(".prematch-h2h").getAttribute("data-h2h-total"));
  expect(total).toBeGreaterThan(0);
  await page.getByLabel("開催区分").selectOption("home");
  expect(await page.locator(".h2h-history-row").count()).toBeLessThanOrEqual(total);
  await expect(page.getByLabel("大会").locator("option")).toContainText(["すべての大会", "中国大学サッカーリーグ"]);
  await page.locator(".h2h-history-row").first().click();
  await expect(page.locator('[data-page="match"]')).toBeVisible();
});
