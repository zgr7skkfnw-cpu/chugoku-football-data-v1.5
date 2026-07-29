import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:4173/";
const DIV1_SCHEDULED = "football-system-schedule-24e8d7424d7d";
const DIV2_SCHEDULED = "football-system-schedule-c07493e87099";
const CHAMPIONSHIP_PK = "football-system-22-563-26179";
const FINISHED = "football-system-15-558-25623";

test("トーナメントを全体とラウンド別で切り替え現在試合とPKを強調する", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}?view=match&id=${CHAMPIONSHIP_PK}&tab=standings`);
  await expect(page.getByRole("tab", { name: "ラウンド別" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "全体", exact: true }).click();
  await expect(page.getByRole("tab", { name: "全体", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".tournament-bracket__round")).not.toHaveCount(0);
  await expect(page.locator(".tournament-bracket .tournament-match-card.is-highlighted")).toBeVisible();
  await expect(page.locator(".tournament-bracket")).toContainText("PK 4-5");
  await expect(page.locator(".tournament-overview")).toContainText("接続情報は掲載されていません");
  await expect(page.locator(".tournament-connector, .tournament-overview canvas")).toHaveCount(0);
  await expect(page.locator(".tournament-bracket")).toHaveAttribute("aria-label", /横方向にスクロール/);
});

test("ラウンド別はピル選択と前後移動を備え3位決定戦を独立表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=match&id=${CHAMPIONSHIP_PK}&tab=standings`);
  await expect(page.locator(".tournament-round-tab").filter({ hasText: /[3３]位決定戦/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "前のラウンド" })).toBeVisible();
  await expect(page.getByRole("button", { name: "次のラウンド" })).toBeVisible();
  await expect(page.locator(".tournament-team-row.is-winner")).not.toHaveCount(0);
});

test("対戦サマリーは比率・総得点・期間フィルターと現在試合を表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=match&id=${FINISHED}&tab=head-to-head`);
  await expect(page.locator(".h2h-ratio")).toBeVisible();
  await expect(page.locator(".h2h-extra-metrics")).toContainText("総対戦数");
  await expect(page.locator(".h2h-extra-metrics")).toContainText("総得点");
  await expect(page.getByLabel("期間")).toHaveValue("all");
  await page.getByLabel("期間").selectOption("5");
  expect(await page.locator(".h2h-history-row").count()).toBeLessThanOrEqual(5);
  await page.getByLabel("期間").selectOption("all");
  await expect(page.locator(".h2h-history-row.is-current")).toContainText("この試合");
});

test("今期比較は集計時点と優劣方向を明示しカップ戦には表示しない", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=match&id=${DIV2_SCHEDULED}&tab=preview`);
  await expect(page.getByRole("heading", { name: "今期これまでのデータ" })).toBeVisible();
  await expect(page.getByText("この試合の直前まで")).toBeVisible();
  await expect(page.locator('.season-comparison-row[data-metric="rank"] .is-better')).toHaveCount(1);
  await expect(page.locator('.season-comparison-row[data-metric="averageAgainst"] .is-better')).toHaveCount(1);
  await expect(page.locator(".season-comparison-table")).toContainText("最大の勝利");
  await page.goto(`${BASE_URL}?view=match&id=${CHAMPIONSHIP_PK}&tab=standings`);
  await expect(page.getByRole("heading", { name: "今期これまでのデータ" })).toHaveCount(0);
});

test("インサイトと得点王は根拠・上限・未掲載・選手IDを安全に表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=match&id=${DIV1_SCHEDULED}&tab=preview`);
  const insights = page.locator(".prematch-insights");
  const count = Number(await insights.getAttribute("data-insight-count"));
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(5);
  await expect(insights.locator("small").first()).toContainText(/直近|通算/);
  await expect(insights).not.toContainText(/優勝候補|有利|勝敗予想|勢いがある/);
  const scorers = page.locator(".prematch-scorer");
  expect(await scorers.count()).toBeLessThanOrEqual(3);
  await expect(scorers.first()).toContainText("90分当たり");
  await expect(scorers.first()).toContainText("シュート－");
  await expect(scorers.first()).toHaveAttribute("data-player-id", /.+/);
});

for (const width of [390, 1440]) test(`${width}pxで比較表示が画面外へはみ出さずエラーを出さない`, async ({ page }) => {
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${BASE_URL}?view=match&id=${DIV2_SCHEDULED}&tab=standings`);
  await expect(page.locator(".prematch-standing-table")).toBeVisible();
  await expect(page.locator(".season-comparison-table")).toHaveCount(0);
  expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto(`${BASE_URL}?view=match&id=${CHAMPIONSHIP_PK}&tab=standings`);
  await page.getByRole("tab", { name: "全体", exact: true }).click();
  expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
