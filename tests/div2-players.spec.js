import { test, expect } from "@playwright/test";
import { auditRoster, createPlayerId, mergeDivisionPlayers } from "../scripts/sync/player-roster-utils.mjs";
import playersData from "../site/data/players.json" with { type: "json" };
import auditData from "../reports/player-audit-div2.json" with { type: "json" };

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

test("2部ランキングとチームのスカッドを実データで表示する", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=rankings`);
  await page.getByRole("tab", { name: "2部" }).click();
  await expect(page.locator('[data-ranking-count]')).toBeVisible();
  await expect(page.getByText("高木 蒼志").first()).toBeVisible();
  await page.goto(`${BASE_URL}?view=team&id=hiroshima-institute-of-technology`);
  await expect(page.locator('[data-roster-count="17"]')).toBeVisible();
});
