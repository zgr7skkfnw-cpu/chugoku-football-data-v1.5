import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:4173/";
const REGULAR_PLAYER = "hiroshima-shudo-2a9e8cf5cf9d";
const I_LEAGUE_PLAYER = "i-league-2026-shudo-9058a8eb1ee0";

test("チーム詳細は概要・次戦・直近試合・スカッドを上から確認できる", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=team&id=ipu`);

  await expect(page.locator(".team-profile__identity .team-emblem")).toBeVisible();
  await expect(page.locator(".team-profile__name")).toContainText("IPU");
  await expect(page.locator(".team-profile__header-record")).toContainText("順位");
  await expect(page.locator(".favorite-button")).toBeVisible();
  await expect(page.getByRole("heading", { name: "次の試合" })).toBeVisible();
  await expect(page.locator(".team-next-match")).toHaveCount(1);
  await expect(page.locator(".team-recent-match")).toHaveCount(5);
  await page.getByRole("tab", { name: "スカッド" }).click();
  await expect(page.locator(".squad-row").first()).toBeVisible();
});

test("チーム詳細の大会切り替えでURLと表示チームが変わり履歴復元する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=team&id=ipu`);
  await page.getByRole("tab", { name: "スカッド" }).click();
  await page.locator(".profile-season-picker").click();
  const switcher = page.getByRole("dialog", { name: "シーズンを選択" });
  await expect(switcher).toBeVisible();
  const iLeague = switcher.locator('[data-team-id="i-league-2026-ipu-a"]').first();
  await iLeague.click();
  await expect(page).toHaveURL(/id=i-league-2026-ipu-a/);
  await expect(page).toHaveURL(/competition=jufa-chugoku-2026-i-league-division-1/);
  await expect(page.locator(".team-profile__name")).toContainText("A");
  await page.reload();
  await expect(page.locator(".profile-season-picker")).toContainText("Iリーグ");
  await page.goBack();
  await expect(page.locator('[data-page="team"]')).toHaveAttribute("data-team-id", "ipu");
  await page.goForward();
  await expect(page.locator('[data-page="team"]')).toHaveAttribute("data-team-id", "i-league-2026-ipu-a");
});

test("フォロー中選手はスカッドで文字と装飾の両方により強調される", async ({ page }) => {
  await page.addInitScript((id) => localStorage.setItem("chugoku-football.favorite-players", JSON.stringify([id])), "ipu-032c11837e6d");
  await page.goto(`${BASE_URL}?view=team&id=ipu`);
  await page.getByRole("tab", { name: "スカッド" }).click();
  const followed = page.locator('.squad-row[data-player-id="ipu-032c11837e6d"]');
  await expect(followed).toHaveClass(/is-followed/);
  await expect(followed).toContainText("フォロー中");
});

test("選手詳細は登録別概要と直近5試合を表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=player&id=${REGULAR_PLAYER}`);
  await expect(page.locator(".player-profile__hero h1")).toBeVisible();
  await expect(page.locator(".player-profile__team-link")).toBeVisible();
  await expect(page.locator(".player-follow-button")).toBeVisible();
  await page.getByRole("tab", { name: "試合", exact: true }).click();
  expect(await page.locator(".player-match-row").count()).toBeGreaterThan(0);
  expect(await page.locator(".player-match-row").count()).toBeLessThanOrEqual(5);
  await page.getByRole("tab", { name: "プロフィール" }).click();
  await expect(page.locator(".player-current-strip")).toContainText("出場時間");
});

test("同一人物の登録切り替えで所属・背番号・成績・URLが変わる", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=player&id=${REGULAR_PLAYER}`);
  const before = await page.locator(".player-current-strip").innerText();
  await page.locator(".profile-season-picker").click();
  await page.locator(`.profile-season-option[data-player-id="${I_LEAGUE_PLAYER}"]`).click();
  await expect(page).toHaveURL(new RegExp(`id=${I_LEAGUE_PLAYER}`));
  await expect(page).toHaveURL(/competition=jufa-chugoku-2026-i-league-division-1/);
  await expect(page.locator(".player-profile__team-link")).toContainText("広島修道大学");
  expect(await page.locator(".player-current-strip").innerText()).not.toBe(before);
});

test("人物フォローは別登録へ切り替えても重複しない", async ({ page }) => {
  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE_URL}?view=player&id=${I_LEAGUE_PLAYER}`);
  await page.locator(".player-follow-button").click();
  const ids = await page.evaluate(() => JSON.parse(localStorage.getItem("chugoku-football.favorite-players")));
  expect(ids).toEqual([REGULAR_PLAYER]);
  await page.goto(`${BASE_URL}?view=player&id=${REGULAR_PLAYER}`);
  await expect(page.locator(".player-follow-button")).toHaveAttribute("aria-pressed", "true");
});

for (const width of [320, 375, 390, 430, 768, 1440]) {
  test(`${width}pxでチーム・選手詳細にbody横スクロールがない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const url of [`?view=team&id=ipu`, `?view=player&id=${REGULAR_PLAYER}`]) {
      await page.goto(`${BASE_URL}${url}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
  });
}
