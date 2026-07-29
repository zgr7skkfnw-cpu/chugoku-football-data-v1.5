import { test, expect } from "@playwright/test";
import div1 from "../site/data/seasons/2026/i-league/div1/matches.json" with { type: "json" };
import div2 from "../site/data/seasons/2026/i-league/div2/matches.json" with { type: "json" };
import stats1 from "../site/data/seasons/2026/i-league/div1/team-stats.json" with { type: "json" };
import stats2 from "../site/data/seasons/2026/i-league/div2/team-stats.json" with { type: "json" };
import catalog from "../site/data/team-catalog.json" with { type: "json" };
import regularPlayers from "../site/data/players.json" with { type: "json" };
import iLeaguePlayers from "../site/data/seasons/2026/i-league/players.json" with { type: "json" };
import audit from "../reports/player-audit-i-league.json" with { type: "json" };
import seasonIndex from "../site/data/seasons/index.json" with { type: "json" };
import { createPlayerId, findRosterDuplicates, normalizePlayerName } from "../scripts/sync/player-roster-utils.mjs";
import { calculatePlayerStatistics } from "../site/assets/js/utils/players.js";
import { createTeamDirectory, linkMatchesToTeams } from "../site/assets/js/utils/teams.js";

const BASE_URL = "http://127.0.0.1:4173/";
const I1 = "jufa-chugoku-2026-i-league-division-1";
const I2 = "jufa-chugoku-2026-i-league-division-2";

function competitionTeamId(competitionId, name) {
  return catalog.items.find((team) => team.competitionId === competitionId && team.name === name)?.id;
}

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

test("Iリーグ486人を通常リーグ829人以上と分離して14チームへ登録する", () => {
  expect(regularPlayers.items.length).toBeGreaterThanOrEqual(829);
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
  await page.getByRole("link", { name: "Iリーグ中国の詳細を表示" }).click();
  await expect(page.locator(".standing-table")).toHaveAttribute("data-standing-count", "8");
  await expect(page.getByRole("link", { name: "IPU・環太平洋大学A" }).first()).toBeVisible();

  await page.getByRole("tab", { name: "I 2部" }).click();
  await expect(page.locator(".standing-table")).toHaveAttribute("data-standing-count", "6");
  await expect(page.getByRole("link", { name: "IPU・環太平洋大学B" }).first()).toBeVisible();
});

test("リーグ一覧のIリーグカードはcompetitionIdと2026年度をURLへ保持する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=standings`);
  await page.getByRole("link", { name: "Iリーグ中国の詳細を表示" }).click();
  await expect(page).toHaveURL(new RegExp(`competition=${I1}.*season=2026`));
  await expect(page.locator(".standing-table")).toHaveAttribute("data-standing-count", "8");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Iリーグ 中国2026 1部", exact: true })).toBeVisible();
  await expect(page.locator(".standing-table")).toHaveAttribute("data-standing-count", "8");

  await page.getByRole("tab", { name: "I 2部" }).click();
  await expect(page).toHaveURL(new RegExp(`competition=${I2}.*season=2026`));
  await expect(page.locator(".standing-table")).toHaveAttribute("data-standing-count", "6");
  await expect(page.getByRole("heading", { name: "Iリーグ 中国2026 2部", exact: true })).toBeVisible();
});

test("Iリーグページに9月5日の公式予定7試合を表示し詳細を開ける", async ({ page }) => {
  const september5Div1 = div1.items.filter((match) => match.kickoffAt.startsWith("2026-09-05"));
  const september5Div2 = div2.items.filter((match) => match.kickoffAt.startsWith("2026-09-05"));
  expect(september5Div1).toHaveLength(4);
  expect(september5Div2).toHaveLength(3);
  expect([...september5Div1, ...september5Div2].every((match) => match.gameId === null && match.status === "scheduled")).toBeTruthy();

  for (const [competitionId, expected, excluded] of [[I1, september5Div1, september5Div2], [I2, september5Div2, september5Div1]]) {
    await page.goto(`${BASE_URL}?view=league&competition=${competitionId}&season=2026`);
    await page.getByRole("tab", { name: "試合", exact: true }).click();
    for (const match of expected) await expect(page.locator(`[data-match-id="${match.id}"]`)).toBeVisible();
    for (const match of excluded) await expect(page.locator(`[data-match-id="${match.id}"]`)).toHaveCount(0);
  }

  const match = september5Div1[0];
  await page.goto(`${BASE_URL}?view=match&id=${match.id}`);
  await expect(page.locator('[data-page="match"]')).toContainText("2026年9月5日(土)");
  await expect(page.locator('[data-page="match"]')).toContainText("キックオフ16:00");
  await expect(page.locator(".match-scoreboard")).toContainText(match.homeTeam.name);
  await expect(page.locator(".match-scoreboard")).toContainText(match.awayTeam.name);
  await expect(page.locator('[data-page="match"]')).toContainText(match.venue);
  await expect(page.locator('[data-page="match"]')).not.toContainText("undefined");
});

test("Iリーグ全43試合の大会・節・状態・識別情報を保持する", () => {
  for (const [competitionId, data, expectedRounds, expectedFinished, expectedScheduled] of [
    [I1, div1, [1, 2, 3, 4, 5, 6, 7], 16, 12],
    [I2, div2, [1, 2, 3, 4, 5], 9, 6],
  ]) {
    expect(new Set(data.items.map((match) => match.competitionId))).toEqual(new Set([competitionId]));
    expect([...new Set(data.items.map((match) => Number(match.round)))].sort((a, b) => a - b)).toEqual(expectedRounds);
    expect(data.items.filter((match) => match.status === "finished")).toHaveLength(expectedFinished);
    expect(data.items.filter((match) => match.status === "scheduled")).toHaveLength(expectedScheduled);
    expect(data.items.every((match) => (
      match.id
      && match.kickoffAt
      && competitionTeamId(competitionId, match.homeTeam?.name)
      && competitionTeamId(competitionId, match.awayTeam?.name)
      && match.venue
      && ["finished", "scheduled"].includes(match.status)
      && (match.gameId == null || Number.isInteger(match.gameId))
    ))).toBeTruthy();
    expect(new Set(data.items.map((match) => match.id)).size).toBe(data.items.length);
  }
});

test("Iリーグ全43試合を大会・チーム・詳細画面で欠落なく表示する", async ({ page }) => {
  for (const [competitionId, data, excluded] of [[I1, div1, div2], [I2, div2, div1]]) {
    const directUrl = `${BASE_URL}?view=league&competition=${competitionId}&season=2026`;
    await page.goto(directUrl);
    await page.getByRole("tab", { name: "試合", exact: true }).click();
    await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", String(data.items.length));
    await expect(page.locator(".match-row--finished")).toHaveCount(data.items.filter((match) => match.status === "finished").length);
    await expect(page.locator(".match-row--scheduled")).toHaveCount(data.items.filter((match) => match.status === "scheduled").length);
    for (const match of data.items) await expect(page.locator(`[data-match-id="${match.id}"]`)).toBeVisible();
    for (const match of excluded.items) await expect(page.locator(`[data-match-id="${match.id}"]`)).toHaveCount(0);

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`competition=${competitionId}.*season=2026`));
    await page.getByRole("tab", { name: "試合", exact: true }).click();
    await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", String(data.items.length));

    for (const match of data.items) {
      for (const teamId of [
        competitionTeamId(competitionId, match.homeTeam.name),
        competitionTeamId(competitionId, match.awayTeam.name),
      ]) {
        await page.goto(`${BASE_URL}?view=team&id=${teamId}`);
        await expect(page.locator(`.match-row[data-match-id="${match.id}"]`)).toBeVisible();
      }
      await page.goto(`${BASE_URL}?view=match&id=${match.id}`);
      await expect(page.locator('[data-page="match"]')).toHaveAttribute("data-match-id", match.id);
      await expect(page.locator(".match-scoreboard")).toContainText(match.homeTeam.name);
      await expect(page.locator(".match-scoreboard")).toContainText(match.awayTeam.name);
      await expect(page.locator('[data-page="match"]')).toContainText(match.venue);
    }
  }
});

test("公開HTMLの管理画面はseason indexからIリーグ補正先とダウンロード名を生成する", async ({ page }) => {
  const definitions = seasonIndex.items.find((entry) => entry.season === 2026).competitions;
  for (const [competitionId, expectedPath] of [
    [I1, "seasons/2026/i-league/div1/manual-match-overrides.json"],
    [I2, "seasons/2026/i-league/div2/manual-match-overrides.json"],
  ]) {
    expect(definitions.find((entry) => entry.id === competitionId)).toMatchObject({
      matches: expect.stringContaining("matches.json"),
      teams: expect.stringContaining("teams.json"),
      teamStats: expect.stringContaining("team-stats.json"),
      manualOverrides: expectedPath,
      dataAvailable: true,
    });
  }

  await page.goto(`${BASE_URL}?view=admin`);
  await page.getByLabel("補正する年度").selectOption("2026");
  const competition = page.getByLabel("補正する大会");
  await expect(competition.locator("option")).toHaveCount(9);
  await expect(competition.locator(`option[value="${I1}"]`)).toHaveText("Iリーグ 中国2026 1部");
  await expect(competition.locator(`option[value="${I2}"]`)).toHaveText("Iリーグ 中国2026 2部");

  page.on("dialog", (dialog) => dialog.accept());
  for (const [competitionId, data, filename] of [
    [I1, div1, "2026-i-league-division-1-manual-match-overrides.json"],
    [I2, div2, "2026-i-league-division-2-manual-match-overrides.json"],
  ]) {
    await competition.selectOption(competitionId);
    await expect(page.getByLabel("補正する試合").locator("option")).toHaveCount(data.items.length + 1);
    const scheduled = data.items.find((match) => match.status === "scheduled");
    await page.getByLabel("補正する試合").selectOption(scheduled.id);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "統合済み補正JSONをダウンロード" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(filename);
    await download.delete();
  }
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
