import assert from "node:assert/strict";
import test from "node:test";

import {
  assertUnknownPlayersResolved,
  commitRosterAndMatch,
  createSelectedRosterPlan,
  selectRosterSpecifications,
} from "../scripts/sync/selected-roster-sync.mjs";
import { findUnknownSelectedPlayers } from "../scripts/sync/sync-selected-results.mjs";

const specs = [
  { teamId: "team-a", teamName: "大学A", division: 1, registrationUrl: "https://football-system.jp/a" },
  { teamId: "team-b", teamName: "大学B", division: 2, registrationUrl: "https://football-system.jp/b" },
];
const catalog = { items: specs.map((specification) => ({ id: specification.teamId, name: specification.teamName })) };

function rosterHtml(specification, names = []) {
  const rosterNames = [...names, ...Array.from({ length: Math.max(0, 10 - names.length) }, (_, index) => `既存 選手${index + 1}`)];
  return `<table class="team_info"><tr><td class="team_JP_name">${specification.teamName}</td></tr></table>
  <table class="team_info">${rosterNames.map((name, index) => `<tr>
    <td class="player_name">${name}</td><td class="player_En_name">PLAYER ${index}</td>
    <td class="player_number">${index + 1}</td><td class="player_position">MF</td>
    <td class="player_birth">2005.01.01</td><td class="player_height">170cm</td>
    <td class="player_weight">65kg</td><td class="player_previous">高校</td>
  </tr>`).join("")}</table>`;
}

function existingPlayers(teamIds = ["team-a", "team-b"]) {
  return teamIds.flatMap((teamId) => Array.from({ length: 10 }, (_, index) => ({
    id: `${teamId}-${index}`,
    teamId,
    name: `既存 選手${index + 1}`,
  })));
}

async function makePlan(teamIds, { namesByTeam = new Map(), players = existingPlayers(), specifications = specs } = {}) {
  let requests = 0;
  const plan = await createSelectedRosterPlan({
    teamIds,
    playersData: { items: players, count: players.length },
    teamCatalog: catalog,
    specifications,
    fetchRosterHtml: async (specification) => {
      requests += 1;
      return rosterHtml(specification, namesByTeam.get(specification.teamId));
    },
  });
  return { plan, requests };
}

test("1チーム指定はroster GET 1", async () => {
  const { plan, requests } = await makePlan(["team-a"]);
  assert.equal(requests, 1); assert.equal(plan.requests, 1);
});

test("2チーム指定はroster GET 2", async () => {
  const { plan, requests } = await makePlan(["team-a", "team-b"]);
  assert.equal(requests, 2); assert.equal(plan.teamsChecked, 2);
});

test("未指定チームはGET 0", async () => {
  const { plan, requests } = await makePlan([]);
  assert.equal(requests, 0); assert.equal(plan.requests, 0);
});

test("既存選手のみならplayers差分なし", async () => {
  const { plan } = await makePlan(["team-a"]);
  assert.equal(plan.changed, false); assert.equal(plan.additions.length, 0);
});

test("新規公式選手を追加候補にする", async () => {
  const names = new Map([["team-a", ["新規 選手"]]]);
  const { plan } = await makePlan(["team-a"], { namesByTeam: names });
  assert.equal(plan.additions.length, 1); assert.equal(plan.additions[0].name, "新規 選手");
});

test("公式名簿にいない未知選手は安全に失敗", () => {
  assert.throws(() => assertUnknownPlayersResolved([{ teamId: "team-a", name: "不存在" }], existingPlayers()), /未解決/);
});

test("teamId不明は安全に失敗", async () => {
  await assert.rejects(() => makePlan(["unknown"]), /対象teamIdではありません/);
});

test("名簿設定のteamId重複は安全に失敗", () => {
  assert.throws(() => selectRosterSpecifications(["team-a"], [specs[0], specs[0]]), /重複/);
});

test("公式名簿内の同姓同名は安全に失敗", async () => {
  const names = new Map([["team-a", ["同名 選手", "同名 選手"]]]);
  await assert.rejects(() => makePlan(["team-a"], { namesByTeam: names }), /同姓同名/);
});

test("selected detail未知選手から該当teamIdだけを抽出", () => {
  const plan = selectedMatchPlan("新規 選手");
  const unknown = findUnknownSelectedPlayers(plan, { playersData: { items: existingPlayers() }, teamCatalog: catalog });
  assert.deepEqual(unknown.map((entry) => entry.teamId), ["team-a"]);
});

test("roster取得後に未知選手を解決できる", async () => {
  const unknown = [{ teamId: "team-a", name: "新規 選手" }];
  const { plan } = await makePlan(["team-a"], { namesByTeam: new Map([["team-a", ["新規 選手"]]]) });
  assert.equal(assertUnknownPlayersResolved(unknown, plan.nextPlayersData.items), true);
});

test("roster取得後も解決不能なら失敗", async () => {
  const { plan } = await makePlan(["team-a"]);
  assert.throws(() => assertUnknownPlayersResolved([{ teamId: "team-a", name: "不存在" }], plan.nextPlayersData.items), /未解決/);
});

test("重複team指定は1回だけ取得", async () => {
  const { plan, requests } = await makePlan(["team-a", "team-a"]);
  assert.equal(requests, 1); assert.equal(plan.teamsChecked, 1);
});

test("dry-run用計画は入力playersDataを変更しない", async () => {
  const players = existingPlayers();
  const before = structuredClone(players);
  await makePlan(["team-a"], { players, namesByTeam: new Map([["team-a", ["新規 選手"]]]) });
  assert.deepEqual(players, before);
});

test("daily roster auditは21チームだけを取得可能", async () => {
  const specifications = Array.from({ length: 21 }, (_, index) => ({
    teamId: `team-${index}`, teamName: `大学${index}`, division: index < 10 ? 1 : 2,
    registrationUrl: `https://football-system.jp/${index}`,
  }));
  const localCatalog = { items: specifications.map((entry) => ({ id: entry.teamId, name: entry.teamName })) };
  let requests = 0;
  const plan = await createSelectedRosterPlan({
    teamIds: specifications.map((entry) => entry.teamId), specifications,
    playersData: { items: [] }, teamCatalog: localCatalog,
    fetchRosterHtml: async (specification) => { requests += 1; return rosterHtml(specification); },
  });
  assert.equal(requests, 21); assert.equal(plan.teamsChecked, 21);
});

test("match保存失敗時はplayers保存をrollbackする", async () => {
  const events = [];
  await assert.rejects(() => commitRosterAndMatch({
    rosterChanged: true,
    writePlayers: async () => events.push("players-written"),
    writeMatch: async () => { events.push("match-failed"); throw new Error("match failure"); },
    rollback: async () => events.push("rolled-back"),
  }), /match failure/);
  assert.deepEqual(events, ["players-written", "match-failed", "rolled-back"]);
});

function selectedMatchPlan(playerName) {
  return {
    targetKey: "2026-1",
    replacements: [{ changed: true, nextMatch: {
      gameId: 1,
      homeTeam: { name: "大学A" }, awayTeam: { name: "大学B" },
      lineups: {
        home: { starters: [{ name: playerName }], substitutes: [] },
        away: { starters: [], substitutes: [] },
      },
    } }],
  };
}
