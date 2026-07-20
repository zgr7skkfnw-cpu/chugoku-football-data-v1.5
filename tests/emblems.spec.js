import { expect, test } from "@playwright/test";

test("10校のエンブレムが一覧と詳細で読み込まれる", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("http://localhost:4173/?view=teams");
  await expect(page.locator(".team-card")).toHaveCount(10);
  await expect(page.locator(".team-card .team-emblem")).toHaveCount(10);
  await page.locator(".team-card").last().scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator(".team-card .team-emblem").evaluateAll((images) =>
    images.filter((image) => image.complete && image.naturalWidth === 512 && image.naturalHeight === 512).length,
  )).toBe(10);

  const listImages = await page.locator(".team-card .team-emblem").evaluateAll((images) =>
    images.map((image) => ({
      src: image.getAttribute("src"),
      loaded: image.complete && image.naturalWidth === 512 && image.naturalHeight === 512,
    })),
  );
  expect(listImages.every((image) => image.loaded)).toBe(true);
  expect(new Set(listImages.map((image) => image.src)).size).toBe(10);

  await page.locator('.team-card[data-team-id="ipu"]').click();
  await expect(page.locator('.team-profile[data-team-id="ipu"]')).toBeVisible();
  const profileImage = page.locator(".team-profile__identity .team-emblem");
  await expect(profileImage).toBeVisible();
  expect(await profileImage.evaluate((image) => image.complete && image.naturalWidth === 512)).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test("2部10校のエンブレムを表示しミニユニフォームを追加しない", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("http://localhost:4173/?view=standings");
  await page.getByRole("link", { name: /中国大学サッカーリーグ2部の詳細/ }).click();
  await expect(page.locator(".standing-table tbody tr")).toHaveCount(11);
  await expect(page.locator(".standing-table .team-emblem")).toHaveCount(11);
  await expect(page.locator(".standing-table img.team-emblem")).toHaveCount(10);
  await expect(page.locator('[data-standing-team="島根県立大学"] .crest')).toHaveText("島県大");
  await expect.poll(() => page.locator(".standing-table img.team-emblem").evaluateAll((images) =>
    images.filter((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0).length,
  )).toBe(10);
  await expect(page.locator(".standing-table")).toContainText("島根県立大学");
  await expect(page.locator(".standing-table .kit-icon")).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});
