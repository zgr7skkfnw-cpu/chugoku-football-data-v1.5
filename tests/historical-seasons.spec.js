import { expect, test } from "@playwright/test";
import season2024 from "../site/data/seasons/2024/season.json" with { type: "json" };
import season2025 from "../site/data/seasons/2025/season.json" with { type: "json" };
import matches2024Div2 from "../site/data/seasons/2024/div2/matches.json" with { type: "json" };

const BASE_URL = "http://localhost:4173/";

function collectErrors(page) {
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("2025年度の日程・1部・2部・入替戦を切り替えて表示する", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(BASE_URL);
  await page.getByLabel("年度を選択").selectOption("2025");
  await expect(page.locator(".home-match-day")).toContainText("11月16日");
  await expect(page.locator('[data-date-matches="2"]')).toBeVisible();
  await expect(page.locator(".league-schedule-groups .panel__title")).toHaveText(["中国大学サッカーリーグ / 入替戦"]);
  await expect(page.locator(".match-row")).toHaveCount(2);

  await page.goto(`${BASE_URL}?view=standings`);
  await page.getByRole("link", { name: /中国大学サッカーリーグ1部の詳細/ }).click();
  await page.getByLabel("年度を選択").selectOption("2025");
  await expect(page.locator(".standing-table tbody tr")).toHaveCount(10);
  await expect(page.locator(".standing-table")).toContainText("岡山理科大学");
  await page.getByRole("tab", { name: "2部", exact: true }).click();
  await expect(page.locator(".standing-table tbody tr")).toHaveCount(10);
  await expect(page.locator(".standing-table")).toContainText("岡山大学");
  expect(errors).toEqual([]);
});

test("2025年度の試合詳細に大会区分と日付を表示する", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${BASE_URL}?view=match&id=football-system-15-547-23950`);
  await expect(page.locator('[data-page="match"]')).toContainText("2025年度 中国大学サッカーリーグ 入替戦");
  await expect(page.locator('[data-page="match"]')).toContainText("2025/11/16 14:00");
  await expect(page.locator(".match-scoreboard")).toContainText("4 - 3");
  expect(errors).toEqual([]);
});

test("2024・2025年度の全大会を分離して試合一覧へ表示する", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${BASE_URL}?view=matches`);
  const season = page.getByLabel("年度を選択");
  const competition = page.getByLabel("大会を選択");

  await season.selectOption("2025");
  for (const [competitionId, count] of [
    ["jufa-chugoku-2025-division-1", 90], ["jufa-chugoku-2025-division-2", 90],
    ["jufa-chugoku-2025-division-2-playoff", 3], ["jufa-chugoku-2025-promotion-relegation", 2],
  ]) {
    await competition.selectOption(competitionId);
    await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", String(count));
  }

  await season.selectOption("2024");
  for (const [competitionId, count] of [
    ["jufa-chugoku-2024-division-1", 90], ["jufa-chugoku-2024-division-2", 90],
    ["jufa-chugoku-2024-division-2-playoff", 3],
  ]) {
    await competition.selectOption(competitionId);
    await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", String(count));
  }
  expect(errors).toEqual([]);
});

test("2024年度順位・詳細未公開試合・過年度チームページを安全に表示する", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${BASE_URL}?view=standings`);
  await page.getByRole("link", { name: /中国大学サッカーリーグ1部の詳細/ }).click();
  await page.getByLabel("年度を選択").selectOption("2024");
  await expect(page.locator(".standing-table tbody tr")).toHaveCount(10);
  await expect(page.locator(".standing-table")).toContainText("広島大学");
  await page.getByRole("link", { name: "広島大学" }).first().click();
  await expect(page.locator('[data-page="team"]')).toContainText("2024");
  await expect(page.locator('[data-page="team"]')).toContainText("大会別選手名簿は未整備");
  await expect(page.locator('[data-roster-count]')).toHaveCount(0);

  const unpublished = matches2024Div2.items.find((match) => match.status !== "finished");
  await page.goto(`${BASE_URL}?view=match&id=${unpublished.id}`);
  await expect(page.locator('[data-page="match"]')).toContainText("鳥取大学");
  await expect(page.locator('[data-page="match"]')).toContainText("就実大学");
  await expect(page.locator('[data-page="match"]')).not.toContainText("undefined");
  expect(errors).toEqual([]);
});

test("管理画面で2024・2025大会と大会別補正先を分離する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=admin`);
  const season = page.getByLabel("補正する年度");
  const competition = page.getByLabel("補正する大会");
  await season.selectOption("2025");
  expect(await competition.locator("option").count()).toBe(season2025.competitions.length);
  await competition.selectOption("jufa-chugoku-2025-division-2-playoff");
  await expect(page.locator(".admin-save-target")).toContainText("2025年 2部プレーオフ");
  await season.selectOption("2024");
  expect(await competition.locator("option").count()).toBe(season2024.competitions.length);
  await competition.selectOption("jufa-chugoku-2024-division-2");
  await expect(page.locator(".admin-save-target")).toContainText("2024年 2部");
});

test("過年度補正ファイルは年度・大会ごとに一意な保存先を持つ", () => {
  const paths = [[2024, season2024], [2025, season2025]].flatMap(([season, data]) =>
    data.competitions.map((competition) => `${competition.id}:${season}/${competition.manualOverrides}`));
  expect(paths).toHaveLength(9);
  expect(new Set(paths.map((entry) => entry.split(":")[1])).size).toBe(9);
  expect(paths.every((entry) => entry.endsWith("manual-match-overrides.json"))).toBeTruthy();
});
