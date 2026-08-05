import fs from "node:fs";
import { expect, test } from "@playwright/test";
import {
  playerStatisticsScopeKey,
  selectPlayerStatisticsCompetition,
} from "../site/assets/js/utils/players.js";

const BASE_URL = "http://localhost:4173/";
const seasonIndex = JSON.parse(fs.readFileSync("site/data/seasons/index.json", "utf8"));
const teamCatalog = JSON.parse(fs.readFileSync("site/data/team-catalog.json", "utf8")).items;
const definitions = seasonIndex.items.flatMap((item) => item.competitions.map((competition) => ({
  ...competition,
  season: item.season,
})));
const TARGET_COMPETITIONS = [
  "jufa-chugoku-2026-division-1",
  "jufa-chugoku-2026-division-2",
  "jufa-chugoku-2026-i-league-division-1",
  "jufa-chugoku-2026-i-league-division-2",
  "jufa-chugoku-2026-championship",
  "jufa-chugoku-2026-rookie-tournament",
  "jufa-chugoku-2025-i-league-upper-playoff",
  "jufa-chugoku-2025-i-league-lower-playoff",
  "jufa-chugoku-2025-division-2-playoff",
  "jufa-chugoku-2025-promotion-relegation",
];
const UNPUBLISHED_COMPETITIONS = [
  ["jufa-chugoku-2026-division-1-promotion-playoff", "ipu"],
  ["jufa-chugoku-2026-promotion-relegation", "ipu"],
  ["jufa-chugoku-2026-i-league-playoff", "i-league-2026-ipu-a"],
];

function competitionFixture(competitionId, preferredTeamName = null) {
  const definition = definitions.find((entry) => entry.id === competitionId);
  const data = JSON.parse(fs.readFileSync(`site/data/${definition.matches}`, "utf8"));
  const finished = data.items.filter((match) => match.status === "finished");
  const selected = preferredTeamName
    ? finished.find((match) => [match.homeTeam.name, match.awayTeam.name].includes(preferredTeamName))
    : finished[0];
  const teamName = preferredTeamName ?? selected?.homeTeam.name;
  const team = teamCatalog.find((entry) => entry.competitionId === competitionId
      && (entry.name === teamName || entry.aliases?.includes(teamName)))
    ?? teamCatalog.find((entry) => !entry.competitionId
      && (entry.name === teamName || entry.aliases?.includes(teamName)));
  const teamMatches = finished.filter((match) =>
    match.homeTeam.name === teamName || match.awayTeam.name === teamName);
  const record = teamMatches.reduce((totals, match) => {
    const home = match.homeTeam.name === teamName;
    totals.goalsFor += Number(home ? match.homeTeam.score : match.awayTeam.score);
    totals.goalsAgainst += Number(home ? match.awayTeam.score : match.homeTeam.score);
    return totals;
  }, { goalsFor: 0, goalsAgainst: 0 });
  return { definition, data, team, teamName, teamMatches, record };
}

test("選手統計キャッシュはseason・competitionId・teamId・periodをすべてキーに含める", () => {
  const player = { id: "player-1", teamId: "team-1", name: "選手A" };
  const base = new Map([[player.id, {
    player,
    matches: TARGET_COMPETITIONS.map((competitionId, index) => ({
      matchId: `match-${index}`,
      season: competitionId.includes("2025") ? 2025 : 2026,
      competitionId,
      teamId: "team-1",
      period: "all",
      started: true,
      substitutionOn: false,
      minutes: index + 1,
      goals: 1,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
    })),
  }]]);
  const keys = new Set(TARGET_COMPETITIONS.map((competitionId) => playerStatisticsScopeKey({
    season: competitionId.includes("2025") ? 2025 : 2026,
    competitionId,
    teamId: "team-1",
    period: "all",
  })));
  expect(keys.size).toBe(TARGET_COMPETITIONS.length);
  for (const competitionId of TARGET_COMPETITIONS) {
    const scoped = selectPlayerStatisticsCompetition(base, {
      season: competitionId.includes("2025") ? 2025 : 2026,
      competitionId,
      teamId: "team-1",
      period: "all",
    }).get(player.id);
    expect(scoped.matches).toHaveLength(1);
    expect(scoped.matches[0].competitionId).toBe(competitionId);
    expect(scoped.goals).toBe(1);
  }
});

for (const competitionId of TARGET_COMPETITIONS) {
  test(`${competitionId} は試合数・得失点・選手・ゴール分類を大会内だけから表示する`, async ({ page }) => {
    const fixture = competitionFixture(competitionId);
    expect(fixture.team, `${fixture.teamName} のteamIdを解決できること`).toBeTruthy();
    await page.goto(`${BASE_URL}?view=team&id=${fixture.team.id}&season=${fixture.definition.season}&competition=${competitionId}&tab=stats`);
    const stats = page.locator(`[data-stats-scope="${fixture.definition.season}:${competitionId}:${fixture.team.id}"]`);
    await expect(stats).toBeVisible();
    const overall = stats.locator('[data-record-scope="総合"]');
    await expect(overall).toHaveAttribute("data-played", String(fixture.teamMatches.length));
    await expect(overall).toHaveAttribute("data-goals-for", String(fixture.record.goalsFor));
    await expect(overall).toHaveAttribute("data-goals-against", String(fixture.record.goalsAgainst));

    const allowedIds = new Set(fixture.data.items.map((match) => match.id));
    const goalSourceIds = (await stats.locator(".goal-classification").getAttribute("data-source-match-ids"))?.split(",").filter(Boolean) ?? [];
    expect(goalSourceIds.every((id) => allowedIds.has(id))).toBe(true);
    for (const source of await stats.locator(".internal-ranking-panel [data-source-competitions]").all()) {
      const ids = (await source.getAttribute("data-source-competitions"))?.split(",").filter(Boolean) ?? [];
      expect(ids.every((id) => id === competitionId)).toBe(true);
    }
  });
}

for (const [competitionId, teamId] of UNPUBLISHED_COMPETITIONS) {
  test(`${competitionId} の未公開データへ他大会の成績を流用しない`, async ({ page }) => {
    await page.goto(`${BASE_URL}?view=team&id=${teamId}&season=2026&competition=${competitionId}&tab=stats`);
    const stats = page.locator(`[data-stats-scope="2026:${competitionId}:${teamId}"]`);
    await expect(stats).toBeVisible();
    await expect(stats.locator('[data-record-scope="総合"]')).toHaveAttribute("data-played", "");
    await expect(stats.locator(".internal-ranking-panel [data-source-competitions]")).toHaveCount(0);
    await expect(stats.locator(".goal-classification")).toHaveAttribute("data-source-match-ids", "");
  });
}

test("通常リーグと新人戦を切り替えるとIPUの大会別集計を履歴・再読み込みでも復元する", async ({ page }) => {
  const regular = competitionFixture("jufa-chugoku-2026-division-1", "IPU・環太平洋大学");
  const rookie = competitionFixture("jufa-chugoku-2026-rookie-tournament", "IPU・環太平洋大学");
  const regularUrl = `${BASE_URL}?view=team&id=ipu&season=2026&competition=${regular.definition.id}&tab=stats`;
  const rookieUrl = `${BASE_URL}?view=team&id=ipu&season=2026&competition=${rookie.definition.id}&tab=stats`;
  await page.goto(regularUrl);
  await expect(page.locator('[data-record-scope="総合"]')).toHaveAttribute("data-played", String(regular.teamMatches.length));
  await page.goto(rookieUrl);
  await expect(page.locator('[data-record-scope="総合"]')).toHaveAttribute("data-played", String(rookie.teamMatches.length));
  expect(rookie.teamMatches.length).not.toBe(regular.teamMatches.length);
  await page.reload();
  await expect(page.locator("[data-stats-scope]")).toHaveAttribute("data-stats-scope", `2026:${rookie.definition.id}:ipu`);
  await page.goBack();
  await expect(page.locator("[data-stats-scope]")).toHaveAttribute("data-stats-scope", `2026:${regular.definition.id}:ipu`);
  await page.goForward();
  await expect(page.locator("[data-stats-scope]")).toHaveAttribute("data-stats-scope", `2026:${rookie.definition.id}:ipu`);
});
