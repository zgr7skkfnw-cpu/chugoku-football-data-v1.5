import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:4173/";
const SCHEDULED = "football-system-schedule-24e8d7424d7d";
const FINISHED = "football-system-15-558-25623";

test("320pxで未開催4タブを一列表示し順位表の重複比較を出さない", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto(`${BASE_URL}?view=match&id=${SCHEDULED}&tab=standings`);
  const tabs = page.locator(".prematch-tabs");
  await expect(tabs.getByRole("tab")).toHaveCount(4);
  expect(await tabs.getByRole("tab").allTextContents()).toEqual(["プレビュー", "出場停止", "順位表", "対戦"]);
  const geometry = await tabs.evaluate((node) => ({
    width: node.getBoundingClientRect().width,
    rows: new Set([...node.children].map((child) => Math.round(child.getBoundingClientRect().top))).size,
    bodyOverflow: document.body.scrollWidth > window.innerWidth,
  }));
  expect(geometry.rows).toBe(1);
  expect(geometry.width).toBeLessThanOrEqual(320);
  expect(geometry.bodyOverflow).toBe(false);
  await expect(page.getByRole("heading", { name: "今期これまでのデータ" })).toHaveCount(0);
});

test("終了済み試合情報はタイムラインを先頭にしインサイトを表示しない", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=match&id=${FINISHED}&tab=info`);
  await expect(page.locator(".finished-info > .panel").first().getByRole("heading")).toHaveText("タイムライン");
  await expect(page.getByRole("heading", { name: "インサイト" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "会場・天候" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "審判・運営" })).toBeVisible();
  await page.goto(`${BASE_URL}?view=match&id=${FINISHED}&tab=standings`);
  await expect(page.getByRole("heading", { name: "今期これまでのデータ" })).toHaveCount(0);
  await expect(page.locator(".prematch-standing-table thead th")).toHaveCount(10);
});

test("公式選手別シュートを上位3人から全選手へ展開し折りたためる", async ({ page }) => {
  await page.route("**/data/seasons/2026/matches.json*", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    const match = payload.items.find((item) => item.id === FINISHED);
    match.playerShots = [
      { side: "home", name: "ホーム選手A", number: 10, shots: 5 },
      { side: "away", name: "アウェー選手A", number: 9, shots: 4 },
      { side: "home", name: "ホーム選手B", number: 7, shots: 3 },
      { side: "away", name: "アウェー選手B", number: 11, shots: 2 },
    ];
    await route.fulfill({ response, json: payload });
  });
  await page.goto(`${BASE_URL}?view=match&id=${FINISHED}&tab=stats`);
  await expect(page.locator(".player-shot-row")).toHaveCount(3);
  await expect(page.locator(".player-shot-ranking")).toContainText("HOME");
  await expect(page.locator(".player-shot-ranking")).toContainText("AWAY");
  const toggle = page.getByRole("button", { name: "全選手を見る" });
  await toggle.click();
  await expect(page.locator(".player-shot-row")).toHaveCount(4);
  await page.getByRole("button", { name: "上位3人に戻す" }).click();
  await expect(page.locator(".player-shot-row")).toHaveCount(3);
});

test("リーグ一覧は通常時にドラッグ不可で編集時だけ操作と保存が有効", async ({ page }) => {
  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.removeItem("chugoku-football.league-order"));
  await page.goto(`${BASE_URL}?view=standings`);
  const first = page.locator(".league-card-row").first();
  await expect(first).toHaveAttribute("draggable", "false");
  await expect(first.locator(".league-order-controls")).toBeHidden();
  expect((await first.locator(".league-card").boundingBox()).height).toBeLessThanOrEqual(72);
  await page.getByRole("button", { name: "編集" }).click();
  await expect(first).toHaveAttribute("draggable", "true");
  await expect(first.locator(".league-order-controls")).toBeVisible();
  await page.locator(".league-card-row").nth(1).getByRole("button", { name: /上へ/ }).click();
  await page.getByRole("button", { name: "完了" }).click();
  await page.reload();
  await expect(page.locator(".league-card-row").first()).toHaveAttribute("data-competition-id", "jufa-chugoku-2026-division-2");
});
