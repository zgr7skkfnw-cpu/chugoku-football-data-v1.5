import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:4173/";
const REGULAR = "hiroshima-shudo-2a9e8cf5cf9d";
const I_LEAGUE = "i-league-2026-shudo-9058a8eb1ee0";

test("同一人物の通常リーグとIリーグ登録をURL・再読み込み・履歴で切り替える", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=player&id=${REGULAR}`);
  await expect(page.locator('[data-page="player"]')).toHaveAttribute("data-player-id", REGULAR);
  await page.locator(".profile-season-picker").click();
  await expect(page.locator(".profile-season-option")).toHaveCount(2);
  await expect(page.locator('.profile-season-option[aria-checked="true"]')).toContainText("中国大学サッカーリーグ");
  const regularStats = await page.locator(".player-stat-grid").first().innerText();

  await page.locator(`.profile-season-option[data-player-id="${I_LEAGUE}"]`).click();
  await expect(page).toHaveURL(new RegExp(`id=${I_LEAGUE}`));
  await expect(page.locator('[data-page="player"]')).toHaveAttribute("data-player-id", I_LEAGUE);
  await expect(page.locator(".profile-season-picker")).toContainText("Iリーグ");
  await expect(page.locator('[data-page="player"]')).toHaveAttribute("data-competition-id", "jufa-chugoku-2026-i-league-division-1");
  const iLeagueStats = await page.locator(".player-stat-grid").first().innerText();
  expect(iLeagueStats).not.toBe(regularStats);

  await page.reload();
  await expect(page.locator('[data-page="player"]')).toHaveAttribute("data-player-id", I_LEAGUE);
  await page.goBack();
  await expect(page.locator('[data-page="player"]')).toHaveAttribute("data-player-id", REGULAR);
  await page.goForward();
  await expect(page.locator('[data-page="player"]')).toHaveAttribute("data-player-id", I_LEAGUE);

  await page.locator(".profile-season-picker").click();
  await page.locator(`.profile-season-option[data-player-id="${REGULAR}"]`).click();
  await expect(page.locator('[data-page="player"]')).toHaveAttribute("data-player-id", REGULAR);
});

test("対応登録がない選手には登録切り替えを表示しない", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=players`);
  const first = page.locator('[data-route="player"]').first();
  const id = await first.getAttribute("data-player-id");
  test.skip([REGULAR, I_LEAGUE].includes(id), "先頭選手が切り替え対象だったため別レコードが必要");
  await first.click();
  await expect(page.locator(".profile-season-picker")).toHaveCount(0);
});
