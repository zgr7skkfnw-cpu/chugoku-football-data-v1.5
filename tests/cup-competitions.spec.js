import { test, expect } from "@playwright/test";
import championship from "../site/data/seasons/2026/championship/matches.json" with { type: "json" };
import rookie from "../site/data/seasons/2026/rookie/matches.json" with { type: "json" };

const BASE_URL = "http://127.0.0.1:4173/";
const CHAMPIONSHIP = "jufa-chugoku-2026-championship";
const ROOKIE = "jufa-chugoku-2026-rookie-tournament";

test("選手権22試合をラウンド別に表示し公式上位結果とランキングを示す", async ({ page }) => {
  expect(championship.items).toHaveLength(22);
  expect(new Set(championship.items.map((match) => match.fedId))).toEqual(new Set([22]));
  expect(new Set(championship.items.map((match) => match.taikaiHoldId))).toEqual(new Set([563]));
  await page.goto(`${BASE_URL}?view=standings`);
  await page.getByRole("link", { name: "中国大学サッカー選手権の詳細を表示" }).click();
  await expect(page).toHaveURL(new RegExp(`competition=${CHAMPIONSHIP}`));
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", "22");
  for (const round of ["第1回戦", "第2回戦", "第3回戦", "準決勝戦", "３位決定戦", "決勝戦"]) {
    await expect(page.locator(".match-round-group__header strong", { hasText: round }).filter({ hasText: new RegExp(`^${round}$`) })).toBeVisible();
  }
  await expect(page.getByText("優勝", { exact: true }).locator("..")).toContainText("IPU・環太平洋大学");
  await expect(page.getByText("準優勝", { exact: true }).locator("..")).toContainText("広島経済大学");
  await expect(page.getByText("3位", { exact: true }).locator("..")).toContainText("福山大学");
  await expect(page.getByText("得点ランキング", { exact: true })).toBeVisible();
  await expect(page.getByText("アシストランキング", { exact: true })).toBeVisible();
});

test("選手権のPK戦と決勝詳細を公式記録どおり表示する", async ({ page }) => {
  const penaltyMatch = championship.items.find((match) => match.penaltyShootout);
  expect(penaltyMatch.penaltyShootout).toEqual({ home: 4, away: 5 });
  await page.goto(`${BASE_URL}?view=match&id=${penaltyMatch.id}`);
  await expect(page.locator(".period-score-list")).toContainText("PK");
  await expect(page.locator(".period-score-list")).toContainText("4");
  await expect(page.locator(".period-score-list")).toContainText("5");
  const final = championship.items.find((match) => match.roundLabel === "決勝戦");
  await page.goto(`${BASE_URL}?view=match&id=${final.id}`);
  await expect(page.locator('[data-page="match"]')).toContainText("決勝戦");
  await expect(page.locator(".match-scoreboard")).toContainText("IPU・環太平洋大学");
  await expect(page.locator(".match-scoreboard")).toContainText("広島経済大学");
});

test("新人戦21試合をA～Dグループ別に表示し7月26日の公式結果を維持する", async ({ page }) => {
  expect(rookie.items.length).toBeGreaterThanOrEqual(21);
  const july26 = rookie.items.filter((match) => match.kickoffAt.startsWith("2026-07-26"));
  expect(july26).toHaveLength(7);
  expect(july26.every((match) => match.status === "finished" && Number.isInteger(match.gameId))).toBeTruthy();
  expect(new Set(july26.map((match) => match.id)).size).toBe(7);
  expect(july26.map((match) => `${match.homeTeam.name} ${match.homeTeam.score}-${match.awayTeam.score} ${match.awayTeam.name}`)).toEqual([
    "岡山大学 1-1 広島文化学園大学",
    "就実大学 0-8 IPU・環太平洋大学",
    "福山平成大学 0-4 岡山理科大学",
    "島根大学 3-9 広島修道大学",
    "周南公立大学 2-0 川崎医療福祉大学",
    "山口大学 0-1 広島大学",
    "広島経済大学 8-0 広島国際大学",
  ]);
  expect(new Set(rookie.items.map((match) => match.groupName))).toEqual(new Set(["Aグループ", "Bグループ", "Cグループ", "Dグループ"]));
  await page.goto(`${BASE_URL}?view=league&competition=${ROOKIE}&season=2026`);
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", String(rookie.items.length));
  for (const group of ["Aグループ", "Bグループ", "Cグループ", "Dグループ"]) {
    await expect(page.getByText(`${group} 順位表`, { exact: true })).toBeVisible();
    await expect(page.locator(".match-round-group__header", { hasText: group }).first()).toBeVisible();
  }
  const match = rookie.items.find((item) => item.status === "scheduled") ?? rookie.items[0];
  await page.goto(`${BASE_URL}?view=match&id=${match.id}`);
  await expect(page.locator('[data-page="match"]')).toContainText(match.homeTeam.name);
  await expect(page.locator('[data-page="match"]')).toContainText(match.awayTeam.name);
  await expect(page.locator('[data-page="match"]')).toContainText(match.venue);
});

test("管理画面で選手権と新人戦の補正先を大会別に分離する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=admin`);
  const competition = page.getByLabel("補正する大会");
  page.on("dialog", (dialog) => dialog.accept());
  for (const [competitionId, data, label, filename] of [
    [CHAMPIONSHIP, championship, "中国大学サッカー選手権", "2026-championship-manual-match-overrides.json"],
    [ROOKIE, rookie, "中国大学サッカー新人戦", "2026-rookie-tournament-manual-match-overrides.json"],
  ]) {
    await competition.selectOption(competitionId);
    await expect(page.locator(".admin-save-target")).toContainText(label);
    await expect(page.getByLabel("補正する試合").locator("option")).toHaveCount(data.items.length + 1);
    const editableMatch = data.items.find((match) => match.status === "scheduled") ?? data.items[0];
    await page.getByLabel("補正する試合").selectOption(editableMatch.id);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "統合済み補正JSONをダウンロード" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(filename);
    await download.delete();
  }
});
