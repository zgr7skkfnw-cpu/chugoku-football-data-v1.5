import { expect, test } from "@playwright/test";

import {
  calculatePlayerStatistics,
  parseMatchMinute,
} from "../site/assets/js/utils/players.js";

test("出場時間へ前後半の追加時間を加算しない", () => {
  expect(parseMatchMinute("45+2")).toBe(45);
  expect(parseMatchMinute("90+5")).toBe(90);
  expect(parseMatchMinute("HT")).toBe(45);

  const players = [
    { id: "team-a-starter", teamId: "team-a", name: "先発 選手" },
    { id: "team-a-substitute", teamId: "team-a", name: "交代 選手" },
  ];
  const matches = [{
    id: "additional-time-test",
    status: "finished",
    kickoffAt: "2026-07-14T12:00:00+09:00",
    round: 1,
    homeTeam: { teamId: "team-a", name: "チームA" },
    awayTeam: { teamId: "team-b", name: "チームB" },
    lineups: {
      home: {
        teamId: "team-a",
        teamName: "チームA",
        starters: [{ name: "先発 選手" }],
        substitutes: [{ name: "交代 選手" }],
      },
      away: null,
    },
    substitutions: {
      home: ["45+2分 [out]先発 選手 [in]交代 選手"],
      away: [],
    },
    disciplinary: { home: [], away: [] },
    goals: [],
  }];
  const teamDirectory = { byId: new Map([["team-a", { id: "team-a", name: "チームA" }]]) };
  const stats = calculatePlayerStatistics(players, matches, teamDirectory);

  expect(stats.get("team-a-starter").minutes).toBe(45);
  expect(stats.get("team-a-substitute").minutes).toBe(45);
});
