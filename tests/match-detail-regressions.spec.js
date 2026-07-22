import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:4173/";
const ROOKIE = "football-system-schedule-25f7fddaf184";
const SCHEDULED = "football-system-schedule-24e8d7424d7d";
const FINISHED = "football-system-15-558-25665";
const I_LEAGUE = "football-system-schedule-28d14d57290a";
const CHAMPIONSHIP = "football-system-22-563-26179";

async function expectEmblemsInside(page, containerSelector) {
  const container = page.locator(containerSelector);
  const emblems = container.locator(":scope .team-emblem--scoreboard");
  await expect(emblems).toHaveCount(2);
  const containerBox = await container.boundingBox();
  expect(containerBox).not.toBeNull();
  for (const emblem of await emblems.all()) {
    const box = await emblem.boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(containerBox.x);
    expect(box.y).toBeGreaterThanOrEqual(containerBox.y);
    expect(box.x + box.width).toBeLessThanOrEqual(containerBox.x + containerBox.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(containerBox.y + containerBox.height + 1);
    await expect(emblem).not.toHaveCSS("position", "fixed");
    await expect(emblem).not.toHaveCSS("position", "absolute");
  }
  await expect(page.locator("body > .team-emblem--scoreboard")).toHaveCount(0);
}

test("新人戦の未開催ヘッダーは両エンブレムを枠内に表示する", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}?view=match&id=${ROOKIE}`);
  await expect(page.locator(".prematch-v2-scoreboard__team").first()).toContainText("岡山大学");
  await expect(page.locator(".prematch-v2-scoreboard__team").last()).toContainText("広島文化学園大学");
  await expectEmblemsInside(page, ".prematch-v2-scoreboard");
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await expect(page.locator(".bottom-nav .team-emblem--scoreboard")).toHaveCount(0);
});

test("終了済み試合ヘッダーも両エンブレムを枠内に表示する", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}?view=match&id=${FINISHED}`);
  await expectEmblemsInside(page, ".finished-scoreboard");
});

for (const [label, matchId, selector] of [["Iリーグ", I_LEAGUE, ".prematch-v2-scoreboard"], ["選手権", CHAMPIONSHIP, ".finished-scoreboard"]]) {
  test(`${label}でも大会別チームの両エンブレム枠を表示する`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}?view=match&id=${matchId}`);
    await expectEmblemsInside(page, selector);
  });
}

test("画像取得失敗時も元のチーム枠内で文字クレストへ置換する", async ({ page }) => {
  await page.route("**/assets/images/teams/**", (route) => route.abort());
  await page.goto(`${BASE_URL}?view=match&id=${ROOKIE}`);
  const teams = page.locator(".prematch-v2-scoreboard__team");
  await expect(teams.locator(".crest.team-emblem--scoreboard")).toHaveCount(2);
  await expect(page.locator("body > .crest.team-emblem--scoreboard")).toHaveCount(0);
});

test("未開催順位表は簡略列、終了後順位表は詳細列を表示する", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}?view=match&id=${SCHEDULED}&tab=standings`);
  await expect(page.locator(".prematch-standing-table.is-compact thead")).toContainText("試");
  await expect(page.locator(".prematch-standing-table.is-compact thead")).not.toContainText("勝");

  await page.goto(`${BASE_URL}?view=match&id=${FINISHED}&tab=standings`);
  const table = page.locator(".prematch-standing-table.is-full");
  await expect(table.locator("thead")).toContainText("勝");
  await expect(table.locator("thead")).toContainText("分");
  await expect(table.locator("thead")).toContainText("敗");
  await expect(table.locator("thead")).toContainText("得");
  await expect(table.locator("thead")).toContainText("失");
  await expect(table.locator("thead th")).toHaveCount(10);
  await expect(table.locator("tr.is-highlighted")).toHaveCount(2);
  const scroll = page.locator(".prematch-standing-scroll");
  expect(await scroll.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

for (const width of [320, 375, 390, 430, 768, 1440]) {
  test(`終了済み順位表10列を${width}px幅へ収める`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${BASE_URL}?view=match&id=${FINISHED}&tab=standings`);
    const table = page.locator(".prematch-standing-table.is-full");
    const scroll = page.locator(".prematch-standing-scroll");
    await expect(table.locator("thead th")).toHaveText(["順", "チーム", "試", "勝", "分", "敗", "得", "失", "差", "点"]);
    expect(await table.evaluate((node) => node.getBoundingClientRect().width)).toBeLessThanOrEqual(width);
    expect(await scroll.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(table.locator("tr.is-highlighted")).toHaveCount(2);
    const rows = await table.locator("tbody tr").evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
    expect(new Set(rows).size).toBe(1);
    if (width === 1440) expect(await table.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(12);
  });
}

for (const width of [320, 375, 390, 430, 768, 1440]) {
  test(`予定試合の簡略順位表5列を${width}px幅へ収める`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${BASE_URL}?view=match&id=${SCHEDULED}&tab=standings`);
    const table = page.locator(".prematch-standing-table.is-compact");
    const container = page.locator(".prematch-standing-scroll.is-compact");
    await expect(table.locator("thead th")).toHaveText(["順", "チーム", "試", "差", "点"]);
    expect(await table.evaluate((node) => node.getBoundingClientRect().width)).toBeLessThanOrEqual(width);
    expect(await container.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(table.locator("tr.is-highlighted")).toHaveCount(2);
    const rows = await table.locator("tbody tr").evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
    expect(new Set(rows).size).toBe(1);
    if (width === 1440) expect(await table.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(12);
  });
}
