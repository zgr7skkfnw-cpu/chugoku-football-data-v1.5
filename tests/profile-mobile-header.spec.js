import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:4173/";
const TEAM_URL = `${BASE_URL}?view=team&id=ipu`;
const PLAYER_URL = `${BASE_URL}?view=player&id=hiroshima-shudo-2a9e8cf5cf9d`;
const MOBILE_WIDTHS = [320, 375, 390, 430];

function intersects(first, second) {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

async function box(locator) {
  const result = await locator.boundingBox();
  expect(result).not.toBeNull();
  return result;
}

for (const width of MOBILE_WIDTHS) {
  test(`${width}pxでチーム詳細ヘッダーの操作・成績領域が重ならない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await page.goto(TEAM_URL);

    const back = await box(page.locator(".team-profile__back"));
    const card = await box(page.locator(".team-profile__identity"));
    const follow = await box(page.locator(".team-profile__identity > .favorite-button"));
    const name = await box(page.locator(".team-profile__name"));
    const records = await page.locator(".team-profile__header-record > div").evaluateAll((nodes) =>
      nodes.map((node) => {
        const { x, y, width: boxWidth, height } = node.getBoundingClientRect();
        return { x, y, width: boxWidth, height };
      }));

    expect(intersects(back, card)).toBe(false);
    expect(back.x).toBeGreaterThanOrEqual(24);
    // WebKit may expose a 44 CSS-pixel box as 43.99999 device-adjusted pixels.
    expect(back.height).toBeGreaterThanOrEqual(43.9);
    expect(intersects(follow, name)).toBe(false);
    for (const record of records) expect(intersects(follow, record)).toBe(false);
    for (let index = 0; index < records.length; index += 1) {
      for (let other = index + 1; other < records.length; other += 1) {
        expect(intersects(records[index], records[other])).toBe(false);
      }
    }
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(width);
    expect(name.x + name.width).toBeLessThanOrEqual(card.x + card.width);
    expect(card.height).toBeGreaterThan(follow.height + records[0].height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test(`${width}pxで選手詳細ヘッダーの名前・所属・フォローが画面内に収まる`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await page.goto(PLAYER_URL);

    const hero = await box(page.locator(".player-profile__hero"));
    const avatar = await box(page.locator(".player-profile__initial"));
    const name = await box(page.locator(".player-profile__copy h1"));
    const team = await box(page.locator(".player-profile__team-link"));
    const emblem = await box(page.locator(".team-emblem--player-profile"));
    const follow = await box(page.locator(".player-profile__hero > .player-follow-button"));

    for (const current of [hero, avatar, name, team, emblem, follow]) {
      expect(current.x).toBeGreaterThanOrEqual(0);
      expect(current.x + current.width).toBeLessThanOrEqual(width);
    }
    expect(intersects(follow, name)).toBe(false);
    expect(intersects(follow, team)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test("390pxの動的viewport変化でもプロフィールと下部ナビが横にはみ出さない", async ({ page }) => {
  for (const height of [844, 664]) {
    await page.setViewportSize({ width: 390, height });
    for (const url of [TEAM_URL, PLAYER_URL]) {
      await page.goto(url);
      const nav = await box(page.locator(".bottom-nav"));
      expect(nav.x).toBeGreaterThanOrEqual(0);
      expect(nav.x + nav.width).toBeLessThanOrEqual(390);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      expect(await page.locator(".main-content").evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).paddingBottom))).toBeGreaterThan(nav.height);
    }
  }
});
