import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:4173/";
const TEAM = "ipu";
const PLAYER = "hiroshima-shudo-2a9e8cf5cf9d";

test("チーム詳細は6タブをURLと履歴へ保持する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=team&id=${TEAM}`);
  await expect(page.locator(".team-profile .profile-tab")).toHaveCount(6);
  await expect(page.getByRole("heading", { name: "次の試合" })).toBeVisible();
  await page.getByRole("tab", { name: "スタッツ" }).click();
  await expect(page).toHaveURL(/tab=stats/);
  await expect(page.getByRole("heading", { name: "ホーム／アウェー別成績" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("tab", { name: "スタッツ" })).toHaveAttribute("aria-selected", "true");
  await page.goBack();
  await expect(page.getByRole("tab", { name: "概要" })).toHaveAttribute("aria-selected", "true");
});

test("チーム概要はフォーム5件・ミニ順位3チーム・保存済み情報だけを表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=team&id=${TEAM}`);
  await expect(page.locator(".team-form-tile")).toHaveCount(5);
  await expect(page.locator(".team-mini-standing tbody tr")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "リーグ表での順位履歴" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "トロフィー" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "競技場情報" })).toBeVisible();
});

test("チーム順位表・スカッドは選択チームだけを強調し既存登録を維持する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=team&id=${TEAM}&tab=standings`);
  await expect(page.locator(".team-profile-standing tbody tr.is-highlighted")).toHaveCount(1);
  await expect(page.locator(".team-profile-standing thead th")).toHaveCount(10);
  await page.getByRole("tab", { name: "スカッド" }).click();
  await expect(page.locator("[data-roster-count]")).toBeVisible();
});

test("選手詳細は3タブと基本6項目・今期4項目を表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=player&id=${PLAYER}`);
  await expect(page.locator(".player-profile .profile-tab")).toHaveCount(3);
  await expect(page.locator(".player-basic-item")).toHaveCount(6);
  await expect(page.locator(".player-current-strip > div")).toHaveCount(4);
  await page.getByRole("tab", { name: "試合", exact: true }).click();
  await expect(page).toHaveURL(/tab=matches/);
  expect(await page.locator(".player-match-row").count()).toBeGreaterThan(0);
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
