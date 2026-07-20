import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const BASE_URL = "http://127.0.0.1:4173/";

test("試合一覧で大会・年度・節を安全に切り替えられる", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=matches`);

  await expect(page.getByLabel("大会を選択")).toHaveValue("jufa-chugoku-2026-division-1");
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", "90");
  await expect(page.locator(".match-round-group")).toHaveCount(18);
  await expect(page.getByRole("navigation", { name: "節の移動" })).toBeVisible();

  await page.getByLabel("大会を選択").selectOption("jufa-chugoku-2026-division-2");
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", "110");
  await expect(page.locator(".match-round-group")).toHaveCount(22);

  const missingRequests = [];
  page.on("response", (response) => {
    if (response.status() === 404) missingRequests.push(response.url());
  });
  await page.getByLabel("大会を選択").selectOption("jufa-chugoku-2026-division-1-promotion-playoff");
  await expect(page.getByText("試合データはまだありません。")).toBeVisible();
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", "0");
  expect(missingRequests).toEqual([]);

  await page.getByLabel("年度を選択").selectOption("2025");
  await expect(page.getByLabel("大会を選択")).toHaveValue("jufa-chugoku-2025-division-1");
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", "90");
});

test("リーグ選択から1部・2部と年度を移動できる", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=standings`);
  await page.getByRole("link", { name: /中国大学サッカーリーグ1部の詳細/ }).click();
  await expect(page.locator('[data-page="league"][data-league-division="1"]')).toBeVisible();
  await expect(page.locator(".standing-table tbody tr")).toHaveCount(10);

  await page.getByRole("tab", { name: "2部", exact: true }).click();
  await expect(page.locator('[data-page="league"][data-league-division="2"]')).toBeVisible();
  await expect(page.locator(".standing-table tbody tr")).toHaveCount(11);

  await page.getByLabel("年度を選択").selectOption("2025");
  await expect(page.locator('[data-page="league"][data-league-division="2"]')).toBeVisible();
  await expect(page.locator(".standing-table tbody tr")).toHaveCount(10);
});

test("主要画面がスマホ幅に収まり管理画面も開ける", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["?view=matches", "?view=standings", "?view=admin"]) {
    await page.goto(`${BASE_URL}${path}`);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await expect(page.locator('[data-page="admin"]')).toBeVisible();
});

test("管理画面の下書きを保存・復元・削除できる", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=admin`);
  const matchSelect = page.getByLabel("補正する試合");
  const matchId = await matchSelect.locator("option").nth(1).getAttribute("value");
  await matchSelect.selectOption(matchId);
  await page.getByLabel("試合会場").fill("下書き動作確認");
  await expect(page.locator(".admin-draft-status")).toContainText("自動保存しました");

  await page.reload();
  await page.getByLabel("補正する試合").selectOption(matchId);
  await expect(page.getByLabel("試合会場")).toHaveValue("下書き動作確認");
  await expect(page.locator(".admin-draft-status")).toContainText("復元しました");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "この試合の下書きを削除" }).click();
  await expect(page.locator(".admin-draft-status")).toContainText("削除しました");
});

test("管理画面から既存補正を保持したJSONをダウンロードできる", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=admin`);
  await page.getByLabel("補正する試合").selectOption("football-system-schedule-8e61b1e5d3d5");
  await expect(page.getByText(/既存の補正は2試合分あります/)).toBeVisible();

  page.on("dialog", (dialog) => dialog.accept());
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "統合済み補正JSONをダウンロード" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("manual-match-overrides.json");

  const downloaded = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(downloaded.schemaVersion).toBe(1);
  expect(downloaded.items).toHaveLength(2);
  expect(downloaded.items.map((item) => item.matchId).sort()).toEqual([
    "football-system-15-558-25650",
    "football-system-schedule-8e61b1e5d3d5",
  ]);
  await download.delete();
});

test("手動補正済みの再開試合と詳細を表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=match&id=football-system-schedule-8e61b1e5d3d5`);
  await expect(page.locator('[data-page="match"]')).toBeVisible();
  await expect(page.locator(".match-scoreboard")).toContainText("2 - 1");
  await expect(page.locator('[data-page="match"]')).toContainText(/中断|再開/);
});

test("欠損した試合記録を不自然な値なしで表示する", async ({ page }) => {
  for (const matchId of [
    "football-system-15-559-25714",
    "football-system-15-559-25740",
    "football-system-15-559-25717",
  ]) {
    await page.goto(`${BASE_URL}?view=match&id=${matchId}`);
    const detail = page.locator('[data-page="match"]');
    await expect(detail).toBeVisible();
    await expect(detail).not.toContainText(/undefined|null/);
  }

  await page.goto(`${BASE_URL}?view=match&id=football-system-15-559-25740`);
  await expect(page.locator(".detail-row").filter({ hasText: "天候" })).toContainText("未掲載");
  await expect(page.getByRole("heading", { name: "チームスタッツ" })).toHaveCount(0);

  await page.goto(`${BASE_URL}?view=match&id=football-system-15-559-25717`);
  await expect(page.getByText("控え選手は掲載されていません。")).toBeVisible();
});
