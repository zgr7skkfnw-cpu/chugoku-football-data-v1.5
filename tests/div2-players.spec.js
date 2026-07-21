import { test, expect } from "@playwright/test";
import { auditRoster, createPlayerId, createRosterSnapshot, mergeDivisionPlayers, rosterSnapshotChanged } from "../scripts/sync/player-roster-utils.mjs";
import playersData from "../site/data/players.json" with { type: "json" };
import auditData from "../reports/player-audit-div2.json" with { type: "json" };
import matchesData from "../site/data/seasons/2026/div2/matches.json" with { type: "json" };
import { parseMatchMinute } from "../site/assets/js/utils/players.js";

const BASE_URL = "http://127.0.0.1:4173/";

test("2部11チームの名簿と1部507人を維持する", () => {
  const division2 = playersData.items.filter((player) => auditData.sources.some((source) => source.teamId === player.teamId));
  expect(new Set(division2.map((player) => player.teamId)).size).toBe(11);
  expect(division2.length).toBeGreaterThanOrEqual(250);
  expect(playersData.items.length - division2.length).toBe(507);
  expect(auditData.duplicateCandidates).toEqual([]);
});

test("異なるチームの同姓同名を分離し同一チーム重複と0人更新を停止する", () => {
  expect(createPlayerId("team-a", "同姓 同名")).not.toBe(createPlayerId("team-b", "同姓 同名"));
  const duplicate = { name: "同姓 同名", englishName: "SAME Name", birth: "2005-01-01", number: 1, position: "GK" };
  expect(() => mergeDivisionPlayers([], new Map([["team-a", [{ ...duplicate, id: "1", teamId: "team-a" }, { ...duplicate, id: "2", teamId: "team-a", number: 2 }]]]), new Set(["team-a"]))).toThrow(/同姓同名/);
  expect(() => mergeDivisionPlayers([{ ...duplicate, id: "1", teamId: "team-a" }], new Map([["team-a", []]]), new Set(["team-a"]))).toThrow(/0人/);
});

test("試合名をチームIDへ対応させ名鑑未登録を監査する", () => {
  const match = { id: "m1", status: "finished", homeTeam: { name: "A大学" }, awayTeam: { name: "B大学" }, lineups: { home: { starters: [{ name: "登録 選手", number: 9, position: "FW" }, { name: "未登録 選手", number: 10, position: "MF" }] }, away: { starters: [] } } };
  const roster = [{ id: "a-1", teamId: "team-a", name: "登録選手", number: 9, position: "FW" }];
  const audit = auditRoster([match], roster, new Set(["team-a"]), new Map([["A大学", "team-a"]]));
  expect(audit.checkedLineupEntries).toBe(2);
  expect(audit.missing).toHaveLength(1);
});

test("試合出場済み選手を現名簿から外れても保持し同一名簿ではスナップショットを増やさない", () => {
  const former = { id: createPlayerId("team-a", "過去 選手"), teamId: "team-a", name: "過去 選手", englishName: "Former Player", number: 14, position: "MF", grade: 4, height: 170, weight: 65, birth: "2004-01-01", hometown: null, previousTeam: "高校" };
  const current = { ...former, id: createPlayerId("team-a", "現在 選手"), name: "現在 選手" };
  const merged = mergeDivisionPlayers([former], new Map([["team-a", [current]]]), new Set(["team-a"]), new Set([former.id]));
  expect(merged.players.map((player) => player.id)).toContain(former.id);
  expect(merged.preserved).toBe(1);
  const source = [{ teamId: "team-a", teamName: "A大学", pageId: 1, registrationUrl: "https://example.com", count: 1 }];
  const first = createRosterSnapshot({ syncedAt: "2026-07-21T00:00:00.000Z", sources: source, players: [current] });
  const second = createRosterSnapshot({ syncedAt: "2026-07-21T01:00:00.000Z", sources: source, players: [current], previous: first });
  expect(rosterSnapshotChanged(second)).toBe(false);
});

test("加藤晴太を現在名簿へ推測追加せず公式2試合の出場記録を維持する", () => {
  const records = matchesData.items.filter((match) => ["football-system-15-559-25716", "football-system-15-559-25727"].includes(match.id));
  expect(records).toHaveLength(2);
  const first = records.find((match) => match.id.endsWith("25716"));
  const third = records.find((match) => match.id.endsWith("25727"));
  expect(first.lineups.home.starters).toContainEqual({ name: "加藤 晴太", number: 14, position: "MF" });
  expect(first.substitutions.home).toContain("64 分 [out]加藤 晴太 [in]福田 尊");
  expect(third.lineups.away.substitutes).toContainEqual({ name: "加藤 晴太", number: 14, position: "MF" });
  expect(third.substitutions.away).toContain("71 分 [out]中村 迅 [in]加藤 晴太");
  expect(parseMatchMinute(first.substitutions.home.find((entry) => entry.includes("加藤 晴太")))).toBe(64);
  expect(90 - parseMatchMinute(third.substitutions.away.find((entry) => entry.includes("加藤 晴太")))).toBe(19);
  expect(playersData.items.some((player) => player.teamId === "shimonoseki-city" && player.name === "加藤 晴太")).toBe(false);
  expect(auditData.missing).toEqual([{ teamId: "shimonoseki-city", name: "加藤 晴太", number: 14, position: "MF", matchIds: ["football-system-15-559-25716", "football-system-15-559-25727"] }]);
});

test("名簿未登録でも加藤晴太を試合詳細に表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=match&id=football-system-15-559-25716`);
  await expect(page.locator('[data-page="match"]')).toContainText("加藤 晴太");
  await expect(page.locator('[data-page="match"]')).toContainText("64 分");
});

test("2部ランキングとチームのスカッドを実データで表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=rankings`);
  await page.getByRole("tab", { name: "2部" }).click();
  await expect(page.locator('[data-ranking-count]')).toBeVisible();
  await expect(page.getByText("高木 蒼志").first()).toBeVisible();
  await page.goto(`${BASE_URL}?view=team&id=hiroshima-institute-of-technology`);
  await expect(page.locator('[data-roster-count="17"]')).toBeVisible();
});
