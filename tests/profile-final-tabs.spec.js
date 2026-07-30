import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:4173/";
const TEAM = "ipu";
const PLAYER = "hiroshima-shudo-2a9e8cf5cf9d";

test("チーム詳細は6タブをURLと履歴へ保持する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=team&id=${TEAM}`);
  await expect(page.locator(".team-profile .profile-tab")).toHaveCount(6);
  await expect(page.getByRole("heading", { name: "次の試合" })).toBeVisible();
  await expect(page.locator(".profile-registration-switch")).toHaveCount(0);
  await page.getByRole("tab", { name: "スタッツ" }).click();
  await expect(page).toHaveURL(/tab=stats/);
  await expect(page.getByRole("heading", { name: "総合・ホーム・アウェー成績" })).toBeVisible();
  await expect(page.locator(".profile-registration-switch")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("tab", { name: "スタッツ" })).toHaveAttribute("aria-selected", "true");
  await page.goBack();
  await expect(page.getByRole("tab", { name: "概要" })).toHaveAttribute("aria-selected", "true");
});

test("チーム概要はフォーム5件・10列順位3チーム・終了試合ごとの順位履歴を表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=team&id=${TEAM}`);
  await expect(page.locator(".team-form-tile")).toHaveCount(5);
  await expect(page.locator(".team-form-tile").getByText(/^[勝分敗]$/)).toHaveCount(0);
  await expect(page.locator(".team-mini-standing tbody tr")).toHaveCount(3);
  await expect(page.locator(".team-mini-standing thead th")).toHaveText(["順", "チーム", "試", "勝", "分", "敗", "得", "失", "差", "点"]);
  await expect(page.getByRole("heading", { name: "ミニ順位表" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "リーグ表での順位履歴" })).toBeVisible();
  expect(await page.locator(".rank-chart__point").count()).toBeGreaterThan(1);
  await expect(page.getByRole("heading", { name: "トロフィー" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "競技場情報" })).toBeVisible();
});

test("チーム順位表・スカッドは選択チームだけを強調し既存登録を維持する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=team&id=${TEAM}&tab=standings`);
  await expect(page.locator(".team-profile-standing tbody tr.is-highlighted")).toHaveCount(1);
  await expect(page.locator(".team-profile-standing thead th")).toHaveCount(10);
  await page.getByRole("tab", { name: "スカッド" }).click();
  await expect(page.locator("[data-roster-count]")).toBeVisible();
  await expect(page.locator(".roster-list")).toHaveCSS("grid-template-columns", /.+/);
  expect(await page.locator(".roster-list").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length)).toBe(1);
});

test("チームスタッツは縦並び・日本語大学名・平均被得点を使用する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=team&id=${TEAM}&tab=stats`);
  await expect(page.getByRole("heading", { name: "トッププレイヤー" })).toBeVisible();
  expect(await page.locator(".internal-ranking-grid").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length)).toBe(1);
  expect(await page.getByRole("heading", { name: "平均被得点", exact: true }).count()).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole("heading", { name: "攻撃" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "守備" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "反則" })).toBeVisible();
  await expect(page.locator(".important-stat-list")).not.toContainText(/^ipu$/);
});

test("保存済み2024・2025・2026シーズンで終了試合ごとの順位履歴を再構成する", async ({ page }) => {
  for (const season of [2024, 2025, 2026]) {
    await page.goto(`${BASE_URL}?view=team&id=${TEAM}&season=${season}&competition=jufa-chugoku-${season}-division-1`);
    await expect(page.getByRole("heading", { name: "リーグ表での順位履歴" })).toBeVisible();
    expect(await page.locator(".rank-chart__point").count()).toBeGreaterThan(1);
  }
});

test("年度違いの同一大会トロフィーを大会系列ごとに統合する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=team&id=${TEAM}&tab=trophies`);
  await expect(page.getByRole("tab", { name: "トロフィー" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".trophy-card").first()).toBeVisible();
  const names = await page.locator(".trophy-card > strong").allTextContents();
  expect(names.length).toBeGreaterThan(0);
  expect(new Set(names).size).toBe(names.length);
  await expect(page.locator(".trophy-list")).toContainText("保存済みデータのみ");
});

test("選手詳細は3タブと基本6項目・今期4項目を表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=player&id=${PLAYER}`);
  await expect(page.locator(".player-profile .profile-tab")).toHaveCount(3);
  await expect(page.locator(".player-basic-item")).toHaveCount(6);
  await expect(page.locator(".player-current-strip > div")).toHaveCount(4);
  await page.getByRole("tab", { name: "試合", exact: true }).click();
  await expect(page).toHaveURL(/tab=matches/);
  expect(await page.locator(".player-match-row").count()).toBeGreaterThan(0);
  await expect(page.locator(".player-match-row__left").first()).toBeVisible();
  await expect(page.locator(".player-match-row__center").first()).toBeVisible();
  await expect(page.locator(".player-match-row__right").first()).toBeVisible();
  await expect(page.locator(".player-match-row__emblem").first()).toBeVisible();
});

test("選手スタッツは合計・90分と基本6項目を安全に切り替える", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=player&id=${PLAYER}&tab=stats`);
  await expect(page.getByRole("tab", { name: "合計" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "90分あたり" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "基本スタッツ" }).locator("xpath=../..").locator(".player-stat")).toHaveCount(6);
  await page.getByRole("tab", { name: "90分あたり" }).click();
  await expect(page.getByRole("heading", { name: "アシスト" }).locator("xpath=../..")).toContainText("90分あたり");
});

for (const width of [320, 375, 390, 430, 768, 1440]) {
  test(`${width}pxでプロフィール本文は横にはみ出さずタブ内だけスクロールできる`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [`?view=team&id=${TEAM}`, `?view=player&id=${PLAYER}`]) {
      await page.goto(`${BASE_URL}${path}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await expect(page.locator(".profile-tabs")).toHaveCSS("overflow-x", "auto");
    }
  });
}
