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

  await page.goto(`${BASE_URL}?view=standings`);
  await page.getByRole("link", { name: /中国大学サッカーリーグ2部の詳細/ }).click();
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
  expect(download.suggestedFilename()).toBe("2026-division-1-manual-match-overrides.json");

  const downloaded = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(downloaded.schemaVersion).toBe(1);
  expect(downloaded.items).toHaveLength(2);
  expect(downloaded.items.map((item) => item.matchId).sort()).toEqual([
    "football-system-15-558-25650",
    "football-system-schedule-8e61b1e5d3d5",
  ]);
  await download.delete();
});

test("管理画面で年度・大会を分離しデータ未設定大会を安全に表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=admin`);
  const season = page.getByLabel("補正する年度");
  const competition = page.getByLabel("補正する大会");
  const matches = page.getByLabel("補正する試合");

  await expect(season).toHaveValue("2026");
  await expect(competition).toHaveValue("jufa-chugoku-2026-division-1");
  await expect(matches.locator('option[value="football-system-schedule-8e61b1e5d3d5"]')).toHaveCount(1);
  await expect(matches.locator('option[value="football-system-15-559-25734"]')).toHaveCount(0);

  await competition.selectOption("jufa-chugoku-2026-division-2");
  await expect(matches.locator('option[value="football-system-15-559-25734"]')).toHaveCount(1);
  await expect(matches.locator('option[value="football-system-schedule-8e61b1e5d3d5"]')).toHaveCount(0);

  await competition.selectOption("jufa-chugoku-2026-division-1-promotion-playoff");
  await expect(page.getByText("この大会の公式試合データはまだ公開されていません。")).toBeVisible();
  await expect(matches).toBeDisabled();

  await competition.selectOption("jufa-chugoku-2026-promotion-relegation");
  await expect(page.getByText("2026年度は大会要項上、1部・2部入替戦を実施しません。")).toBeVisible();

  await season.selectOption("2025");
  await competition.selectOption("jufa-chugoku-2025-promotion-relegation");
  await expect(matches).toBeEnabled();
  await expect(matches.locator("option")).toHaveCount(3);
});

test("管理画面で未保存変更の大会切替を警告し2部用ファイル名で出力する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=admin`);
  const competition = page.getByLabel("補正する大会");
  await competition.selectOption("jufa-chugoku-2026-division-2");
  await page.getByLabel("補正する試合").selectOption("football-system-15-559-25734");
  await page.getByLabel("補正理由").fill("大会分離テスト");

  let warning = "";
  page.once("dialog", async (dialog) => {
    warning = dialog.message();
    await dialog.dismiss();
  });
  await competition.selectOption("jufa-chugoku-2026-division-1");
  expect(warning).toContain("未保存の変更があります");
  await expect(competition).toHaveValue("jufa-chugoku-2026-division-2");

  page.on("dialog", (dialog) => dialog.accept());
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "統合済み補正JSONをダウンロード" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("2026-division-2-manual-match-overrides.json");
  const output = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(output.items).toHaveLength(1);
  expect(output.items[0].matchId).toBe("football-system-15-559-25734");
  await download.delete();
});

test("管理画面の手動補正では先発11人検証を維持する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=admin`);
  const matchSelect = page.getByLabel("補正する試合");
  const finishedMatchId = "football-system-15-558-25650";
  await matchSelect.selectOption(finishedMatchId);

  await page.getByText("監督・選手", { exact: true }).click();
  const starters = page.getByLabel("ホーム先発");
  const lines = (await starters.inputValue()).split("\n").filter(Boolean);
  expect(lines).toHaveLength(11);
  await starters.fill(lines.slice(0, 10).join("\n"));
  await page.getByRole("button", { name: "統合済み補正JSONをダウンロード" }).click();
  await expect(page.locator(".admin-validation-status")).toContainText("ホームの先発は11人必要です");
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
  await page.getByRole("tab", { name: "ラインナップ" }).click();
  await expect(page.getByText("控え選手は公式記録未掲載です。")).toBeVisible();
});
