import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:4173/";
const SCHEDULED = "football-system-schedule-24e8d7424d7d";
const FINISHED = "football-system-15-558-25623";

for (const width of [320, 375, 390, 430, 768, 1440]) {
  test(`${width}pxで主要画面が横にはみ出さず固定ナビ用余白を保つ`, async ({ page }) => {
    await page.setViewportSize({ width, height: 860 });
    for (const url of [
      `${BASE_URL}?view=home`,
      `${BASE_URL}?view=standings`,
      `${BASE_URL}?view=following`,
      `${BASE_URL}?view=search`,
      `${BASE_URL}?view=match&id=${SCHEDULED}`,
      `${BASE_URL}?view=match&id=${FINISHED}`,
      `${BASE_URL}?view=admin`,
    ]) {
      await page.goto(url);
      await expect(page.locator("#main-content")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await page.evaluate(() => {
        const main = document.querySelector("#main-content");
        const nav = document.querySelector("#bottom-navigation");
        return Number.parseFloat(getComputedStyle(main).paddingBottom) >= nav.getBoundingClientRect().height;
      })).toBe(true);
    }
  });
}

test("画面端スワイプと縦操作を無視し中央の横スワイプだけでタブを切り替える", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}?view=match&id=${SCHEDULED}&tab=preview`);
  const content = page.locator(".prematch-tab-content");
  const dispatch = async (startX, startY, endX, endY) => content.evaluate((node, points) => {
    node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 7, pointerType: "touch", clientX: points[0], clientY: points[1] }));
    node.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 7, pointerType: "touch", clientX: points[2], clientY: points[3] }));
    node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7, pointerType: "touch", clientX: points[2], clientY: points[3] }));
  }, [startX, startY, endX, endY]);
  await dispatch(8, 300, 100, 300);
  await expect(page).toHaveURL(/tab=preview|id=.*$/);
  await dispatch(180, 250, 190, 340);
  await expect(page).toHaveURL(/tab=preview|id=.*$/);
  await dispatch(250, 300, 150, 302);
  await expect(page).toHaveURL(/tab=suspensions/);
});

test("URL状態・戻る操作・不正な試合IDを安全に処理する", async ({ page }) => {
  await page.goto(`${BASE_URL}?date=2026-09-05`);
  await expect(page).toHaveURL(/date=2026-09-05/);
  await page.goto(`${BASE_URL}?view=match&id=${SCHEDULED}&tab=invalid`);
  await expect(page.locator('[role="tab"][aria-selected="true"]')).toContainText("プレビュー");
  await page.goto(`${BASE_URL}?view=match&id=missing-match`);
  await expect(page.getByRole("heading", { name: "試合が見つかりません" })).toBeVisible();
  await expect(page.getByText("試合一覧へ戻り")).toBeVisible();
});

test("同一セッションで年度一覧JSONを重複取得せずアセット版を公開HTMLに持つ", async ({ page }) => {
  let indexRequests = 0;
  page.on("request", (request) => { if (request.url().endsWith("/data/seasons/index.json")) indexRequests += 1; });
  await page.goto(BASE_URL);
  await page.getByRole("link", { name: "リーグ" }).click();
  await page.getByRole("link", { name: "試合" }).click();
  expect(indexRequests).toBe(1);
  const html = await page.request.get(BASE_URL).then((response) => response.text());
  expect(html).toContain("style.css?v=20260722-phase6");
  expect(html).toContain("app.js?v=20260722-phase6");
  expect(await page.evaluate(() => "serviceWorker" in navigator ? navigator.serviceWorker.getRegistrations().then((items) => items.length) : 0)).toBe(0);
});

test("読み込み失敗をデータなしと混同せず再試行ボタンを表示する", async ({ page }) => {
  await page.route("**/data/seasons/index.json", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await page.goto(BASE_URL);
  await expect(page.getByRole("heading", { name: "データを読み込めませんでした。" })).toBeVisible();
  await expect(page.getByRole("button", { name: "再試行" })).toBeVisible();
  await expect(page.locator('[role="alert"]')).toContainText("時間をおいて再度お試しください。");
});

test("検索は入力を正規化し結果種別と画像代替テキストを保つ", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=search`);
  const input = page.getByRole("searchbox", { name: "全体検索" });
  await input.fill("　広島　大学　");
  await expect(page.getByRole("heading", { name: "チーム" })).toBeVisible();
  await expect(page.locator(".search-team-row").first()).toBeVisible();
  const images = page.locator("img");
  for (let index = 0; index < await images.count(); index += 1) expect(await images.nth(index).getAttribute("alt")).not.toBeNull();
});
