import { test, expect } from "@playwright/test";
import div1 from "../site/data/seasons/2026/i-league/div1/matches.json" with { type: "json" };
import div2 from "../site/data/seasons/2026/i-league/div2/matches.json" with { type: "json" };
import stats1 from "../site/data/seasons/2026/i-league/div1/team-stats.json" with { type: "json" };
import stats2 from "../site/data/seasons/2026/i-league/div2/team-stats.json" with { type: "json" };
import catalog from "../site/data/team-catalog.json" with { type: "json" };

const BASE_URL = "http://127.0.0.1:4173/";
const I1 = "jufa-chugoku-2026-i-league-division-1";
const I2 = "jufa-chugoku-2026-i-league-division-2";

test("Iリーグ1部28試合・2部15試合と大会別順位を保持する", () => {
  expect(div1.items).toHaveLength(28);
  expect(div2.items).toHaveLength(15);
  expect(div1.items.filter((match) => match.status === "finished")).toHaveLength(16);
  expect(div2.items.filter((match) => match.status === "finished")).toHaveLength(9);
  expect(new Set(div1.items.map((match) => match.competitionId))).toEqual(new Set([I1]));
  expect(new Set(div2.items.map((match) => match.competitionId))).toEqual(new Set([I2]));
  expect(stats1.periods.all.standings).toHaveLength(8);
  expect(stats2.periods.all.standings).toHaveLength(6);
});

test("Iリーグ大会内チームIDとparentClubIdを分離する", () => {
  const teams = catalog.items.filter((team) => team.competitionId === I1 || team.competitionId === I2);
  expect(teams).toHaveLength(14);
  expect(new Set(teams.map((team) => team.id)).size).toBe(14);
  expect(teams.filter((team) => team.parentClubId === "ipu").map((team) => team.id).sort()).toEqual([
    "i-league-2026-ipu-a", "i-league-2026-ipu-b", "i-league-2026-ipu-c", "i-league-2026-ipu-d",
  ]);
  expect(teams.filter((team) => team.parentClubId === "hiroshima").map((team) => team.id).sort()).toEqual([
    "i-league-2026-hiroshima-a", "i-league-2026-hiroshima-b",
  ]);
});

test("試合一覧で通常リーグとIリーグ1部・2部を混在させない", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=matches`);
  const competition = page.getByLabel("大会を選択");
  await expect(competition.locator(`option[value="${I1}"]`)).toHaveCount(1);
  await expect(competition.locator(`option[value="${I2}"]`)).toHaveCount(1);

  await competition.selectOption(I1);
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", "28");
  await expect(page.locator(`[data-match-id="${div2.items[0].id}"]`)).toHaveCount(0);

  await competition.selectOption(I2);
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", "15");
  await expect(page.locator(`[data-match-id="${div1.items[0].id}"]`)).toHaveCount(0);
});

test("Iリーグ1部・2部の順位表と参加チームを表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=standings`);
  await page.getByRole("link", { name: "Iリーグ中国 1部の詳細を表示" }).click();
  await expect(page.locator(".standing-table")).toHaveAttribute("data-standing-count", "8");
  await expect(page.getByRole("link", { name: "IPU・環太平洋大学A" }).first()).toBeVisible();

  await page.getByRole("tab", { name: "I 2部" }).click();
  await expect(page.locator(".standing-table")).toHaveAttribute("data-standing-count", "6");
  await expect(page.getByRole("link", { name: "IPU・環太平洋大学B" }).first()).toBeVisible();
});

test("Iリーグ試合詳細・チームページ・管理画面を安全に表示する", async ({ page }) => {
  const match = div1.items.find((item) => item.status === "finished");
  await page.goto(`${BASE_URL}?view=match&id=${match.id}`);
  await expect(page.locator('[data-page="match"]')).toBeVisible();
  await expect(page.locator(".match-scoreboard")).toContainText(match.homeTeam.name);

  await page.goto(`${BASE_URL}?view=team&id=i-league-2026-ipu-a`);
  await expect(page.locator('[data-page="team"]')).toContainText("IPU・環太平洋大学A");
  await expect(page.locator('[data-page="team"]')).toContainText("選手名簿・選手ランキングはまだ登録されていません");

  await page.goto(`${BASE_URL}?view=admin`);
  const competition = page.getByLabel("補正する大会");
  await competition.selectOption(I1);
  await expect(page.getByLabel("補正する試合").locator("option")).toHaveCount(29);
  await expect(page.locator(".admin-save-target")).toContainText("Iリーグ1部");
  await competition.selectOption(I2);
  await expect(page.getByLabel("補正する試合").locator("option")).toHaveCount(16);
});
