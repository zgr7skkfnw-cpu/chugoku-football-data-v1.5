import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:4173/";

async function swipe(locator, { fromX = 320, toX = 90, y = 520 } = {}) {
  await locator.dispatchEvent("pointerdown", { pointerId: 31, pointerType: "touch", clientX: fromX, clientY: y });
  await locator.dispatchEvent("pointerup", { pointerId: 31, pointerType: "touch", clientX: toX, clientY: y + 5 });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}?date=2026-09-05`);
  await expect(page.locator('[data-date-matches="7"]')).toBeVisible();
});

test("上部とスクロール後の一覧余白から日付をスワイプできる", async ({ page }) => {
  await swipe(page.locator('[data-page="home"]'), { y: 340 });
  await expect(page).toHaveURL(/date=2026-09-06/);

  await page.goto(`${BASE_URL}?date=2026-09-05`);
  const lastSection = page.locator(".collapsible-competition").last();
  await lastSection.scrollIntoViewIfNeeded();
  await swipe(lastSection.locator(".collapsible-competition__body"), { y: 650 });
  await expect(page).toHaveURL(/date=2026-09-06/);
});

test("試合カード余白は有効だがリンク上では日付を変えない", async ({ page }) => {
  const row = page.locator(".match-row").last();
  await row.scrollIntoViewIfNeeded();
  await swipe(row, { y: 610 });
  await expect(page).toHaveURL(/date=2026-09-06/);

  await page.goto(`${BASE_URL}?date=2026-09-05`);
  const teamLink = page.locator(".match-row a").last();
  await teamLink.scrollIntoViewIfNeeded();
  await swipe(teamLink, { y: 610 });
  await expect(page).toHaveURL(/date=2026-09-05/);
});

test("横スクロール領域とSafari左端からは日付を変えない", async ({ page }) => {
  await page.evaluate(() => {
    const region = document.createElement("div");
    region.className = "horizontal-scroll";
    region.dataset.testid = "horizontal-region";
    region.textContent = "横スクロール領域";
    document.querySelector(".home-feed__content").append(region);
  });
  await swipe(page.locator('[data-testid="horizontal-region"]'));
  await expect(page).toHaveURL(/date=2026-09-05/);
  await swipe(page.locator('[data-page="home"]'), { fromX: 20, toX: 260 });
  await expect(page).toHaveURL(/date=2026-09-05/);
});
