import { test, expect } from "@playwright/test";
import div1 from "../site/data/seasons/2026/i-league/div1/matches.json" with { type: "json" };
import div2 from "../site/data/seasons/2026/i-league/div2/matches.json" with { type: "json" };
import stats1 from "../site/data/seasons/2026/i-league/div1/team-stats.json" with { type: "json" };
import stats2 from "../site/data/seasons/2026/i-league/div2/team-stats.json" with { type: "json" };
import catalog from "../site/data/team-catalog.json" with { type: "json" };
import regularPlayers from "../site/data/players.json" with { type: "json" };
import iLeaguePlayers from "../site/data/seasons/2026/i-league/players.json" with { type: "json" };
import audit from "../reports/player-audit-i-league.json" with { type: "json" };
import { createPlayerId, findRosterDuplicates, normalizePlayerName } from "../scripts/sync/player-roster-utils.mjs";
import { calculatePlayerStatistics } from "../site/assets/js/utils/players.js";
import { createTeamDirectory, linkMatchesToTeams } from "../site/assets/js/utils/teams.js";

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

test("Iリーグ486人を通常リーグ829人と分離して14チームへ登録する", () => {
  expect(regularPlayers.items).toHaveLength(829);
  expect(iLeaguePlayers.items).toHaveLength(486);
  expect(new Set(iLeaguePlayers.items.map((player) => player.teamId)).size).toBe(14);
  expect(iLeaguePlayers.items.every((player) => player.personId === null)).toBeTruthy();
  expect(iLeaguePlayers.items.some((player) => regularPlayers.items.some((regular) => regular.id === player.id))).toBeFalsy();
  for (const suffix of ["a", "b", "c", "d"]) {
    expect(iLeaguePlayers.items.some((player) => player.teamId === `i-league-2026-ipu-${suffix}`)).toBeTruthy();
  }
});

test("Iリーグ名簿監査は未登録選手を試合単位で重複登録しない", () => {
  expect(audit.missing).toHaveLength(0);
  expect(audit.duplicateCandidates).toEqual([]);
  expect(audit.crossTeamSameNameCandidates).toEqual([]);
  expect(audit.eventPlayerAudit.players).toEqual([]);
});

test("伊津遥人の異体字を正規化し通常登録とIリーグ登録を分離して3試合へ紐付ける", () => {
  const regular = regularPlayers.items.find((player) => normalizePlayerName(player.name) === "伊津遥人");
  const registration = iLeaguePlayers.items.find((player) => normalizePlayerName(player.name) === "伊津遥人");
  expect(normalizePlayerName("伊津 遙人")).toBe(normalizePlayerName("伊津遥人"));
  expect(regular).toMatchObject({ teamId: "hiroshima-shudo", name: "伊津 遙人" });
  expect(registration).toMatchObject({
    teamId: "i-league-2026-shudo", competitionId: I1, name: "伊津 遙人", personId: null,
  });
  expect(registration.id).not.toBe(regular.id);
  const directory = createTeamDirectory(catalog.items);
  const matches = linkMatchesToTeams([...div1.items, ...div2.items], directory);
  const stats = calculatePlayerStatistics(iLeaguePlayers.items, matches, directory).get(registration.id);
  expect(stats.matches.map((match) => match.matchId).sort()).toEqual([
    "football-system-17-566-26200", "football-system-17-566-26203", "football-system-17-566-26209",
  ]);
  expect(stats.substitutionsOn).toBe(2);
  expect(stats.substitutionsOff).toBe(1);
  expect(stats.minutes).toBe(108);
});

test("同姓同名を大会内teamIdごとの別登録とし同一チーム重複を検出する", () => {
  expect(createPlayerId("i-league-2026-ipu-a", "同姓 同名")).not.toBe(createPlayerId("i-league-2026-ipu-b", "同姓 同名"));
  expect(findRosterDuplicates([
    { teamId: "i-league-2026-ipu-a", name: "同姓 同名" },
    { teamId: "i-league-2026-ipu-a", name: "同姓同名" },
  ])).toHaveLength(1);
  expect(findRosterDuplicates([
    { teamId: "i-league-2026-ipu-a", name: "同姓 同名" },
    { teamId: "i-league-2026-ipu-b", name: "同姓 同名" },
  ])).toHaveLength(0);
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
  await expect(page.locator('[data-page="team"]')).toContainText("Iリーグの大会別公式登録");
  await expect(page.locator('[data-roster-count="25"]')).toBeVisible();

  await page.goto(`${BASE_URL}?view=admin`);
  const competition = page.getByLabel("補正する大会");
  await competition.selectOption(I1);
  await expect(page.getByLabel("補正する試合").locator("option")).toHaveCount(29);
  await expect(page.locator(".admin-save-target")).toContainText("Iリーグ1部");
  await competition.selectOption(I2);
  await expect(page.getByLabel("補正する試合").locator("option")).toHaveCount(16);
});

test("Iリーグランキングと選手詳細を大会登録単位で表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=rankings`);
  await page.getByRole("tab", { name: "Iリーグ一部" }).click();
  await expect(page.locator('[data-competition-id="jufa-chugoku-2026-i-league-division-1"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-ranking-count]')).not.toHaveAttribute("data-ranking-count", "0");
  await page.getByRole("tab", { name: "Iリーグ二部" }).click();
  await expect(page.locator(`[data-competition-id="${I2}"]`)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-ranking-count]')).not.toHaveAttribute("data-ranking-count", "0");

  await page.goto(`${BASE_URL}?view=players`);
  await page.getByLabel("選手登録大会").selectOption(I1);
  await expect(page.locator(".player-list")).toHaveAttribute("data-player-count", "326");

  const player = iLeaguePlayers.items.find((entry) => entry.teamId === "i-league-2026-ipu-a");
  await page.goto(`${BASE_URL}?view=player&id=${player.id}`);
  await expect(page.locator('[data-page="player"]')).toContainText(player.name);
  await expect(page.locator('[data-page="player"]')).toContainText("jufa-chugoku-2026-i-league-division-1");
});
