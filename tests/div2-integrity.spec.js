import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const BASE_URL = "http://127.0.0.1:4173/";
const ROOT = new URL("../", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, ROOT), "utf8"));
}

test("2部の公式結果数・順位・追加時間表記を整合させる", async () => {
  const matches = (await readJson("site/data/seasons/2026/div2/matches.json")).items;
  const stats = await readJson("site/data/seasons/2026/div2/team-stats.json");
  const catalog = (await readJson("site/data/team-catalog.json")).items;
  const finished = matches.filter((match) => match.status === "finished");
  expect(finished).toHaveLength(55);

  const teamId = (name) => catalog.find((team) =>
    team.name === name || team.aliases?.includes(name))?.id;
  const calculated = new Map();
  const row = (id) => {
    if (!calculated.has(id)) calculated.set(id, {
      played: 0, won: 0, drawn: 0, lost: 0, points: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0,
    });
    return calculated.get(id);
  };

  for (const match of finished) {
    expect(match.goals ?? []).toHaveLength(match.homeTeam.score + match.awayTeam.score);
    for (const side of ["home", "away"]) {
      const own = match[`${side}Team`];
      const opponent = match[side === "home" ? "awayTeam" : "homeTeam"];
      const record = row(teamId(own.name));
      record.played += 1;
      record.goalsFor += own.score;
      record.goalsAgainst += opponent.score;
      if (own.score > opponent.score) { record.won += 1; record.points += 3; }
      else if (own.score === opponent.score) { record.drawn += 1; record.points += 1; }
      else record.lost += 1;
      record.goalDifference = record.goalsFor - record.goalsAgainst;
    }
  }

  for (const standing of stats.periods.all.standings) {
    expect(standing).toMatchObject(calculated.get(standing.teamId));
  }
});

test("先発10人の公式記録を注記付きでそのまま表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=match&id=football-system-15-559-25734`);
  await expect(page.locator('[data-page="match"]')).toContainText("先発 11人 / 10人");
  await expect(page.getByText(/広島工業大学 10名が公式記録の先発欄に掲載されています/)).toBeVisible();
  await expect(page.locator(".lineup-team").nth(1).locator(".lineup-list:not(.lineup-list--bench) li")).toHaveCount(10);
});

test("2部チームページと島根県立大学の文字クレストを表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=team&id=okayama`);
  await expect(page.locator('[data-page="team"][data-team-id="okayama"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "終了試合" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "今後の日程" })).toBeVisible();

  await page.goto(`${BASE_URL}?view=team&id=university-of-shimane`);
  await expect(page.locator(".team-profile__identity .crest")).toHaveText("島県大");
  await page.goto(`${BASE_URL}?view=match&id=football-system-15-559-25713`);
  await expect(page.locator(".match-scoreboard .crest")).toHaveText("島県大");
});

test("公式由来の先発10人は管理画面で補正JSONを生成できる", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=admin`);
  await page.getByLabel("補正する試合").selectOption("football-system-15-559-25734");
  page.on("dialog", (dialog) => dialog.accept());
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "統合済み補正JSONをダウンロード" }).click();
  const download = await downloadPromise;
  const output = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(output.items).toHaveLength(1);
  expect(output.items[0].override.lineups.away.starters).toHaveLength(10);
  await download.delete();
});
