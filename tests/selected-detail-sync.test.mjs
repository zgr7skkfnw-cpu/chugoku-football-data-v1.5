import assert from "node:assert/strict";
import test from "node:test";

import {
  createSelectedDetailPlan,
  executeSelectedDetailSync,
  selectedGameIdsFromPoll,
} from "../scripts/sync/selected-detail-sync.mjs";
import { createAuditPlan } from "../scripts/sync/audit-plan.mjs";

const target = {
  key: "2026-1",
  competitionId: "2026-1",
  allowIncompleteLineups: false,
  includePlayerShots: false,
};

function substitution(minute, playerOut, playerIn) {
  return { minute, playerOut, playerIn };
}

function match(gameId, overrides = {}) {
  return {
    id: `stable-${gameId}`,
    gameId,
    competitionId: "2026-1",
    date: "2026-09-20",
    kickoff: "13:00",
    homeTeam: "広島経済大学",
    awayTeam: "山口大学",
    homeScore: 2,
    awayScore: 1,
    status: "finished",
    venue: "会場A",
    round: "第14節",
    group: "",
    lineups: {
      home: { starters: ["選手A"], substitutes: ["今岡 煌星"] },
      away: { starters: ["選手B"], substitutes: [] },
    },
    substitutions: {
      home: [
        substitution("53 分", "最上 尚哉", "今岡 煌星"),
        substitution("80 分", "又野 寛太", "今岡 煌星"),
      ],
      away: [],
    },
    goals: [],
    disciplinary: [],
    ...overrides,
  };
}

function listMatch(gameId, overrides = {}) {
  return {
    gameId,
    matchId: `stable-${gameId}`,
    detailAvailable: true,
    home: "広島経済大学",
    away: "山口大学",
    ...overrides,
  };
}

function harness({ existing = [match(25692), match(30000)], official = {}, list = null, fetchImpl } = {}) {
  let posts = 0;
  const parsedList = list ?? {
    detailTargets: existing.map((item) => listMatch(item.gameId, { matchId: item.id })),
    matches: existing.map((item) => listMatch(item.gameId, { matchId: item.id })),
  };
  const fetchDetailHtml = fetchImpl ?? (async (item) => {
    posts += 1;
    return JSON.stringify(official[item.gameId] ?? existing.find((entry) => entry.gameId === item.gameId));
  });
  return {
    existing,
    parsedList,
    posts: () => posts,
    create(ids, options = {}) {
      return createSelectedDetailPlan({
        targetKey: target.key,
        existingData: { items: existing, metadata: {} },
        parsedList,
        selectedGameIds: ids,
        fetchDetailHtml,
        parseDetail: (html) => JSON.parse(html),
        ...options,
      });
    },
  };
}

test("selected 1試合だけをdetail POSTする", async () => {
  const h = harness();
  const plan = await h.create([25692]);
  assert.equal(h.posts(), 1);
  assert.equal(plan.selectedGameIds.length, 1);
});

test("未選択試合をdetail POSTしない", async () => {
  const h = harness();
  await h.create([25692]);
  assert.equal(h.posts(), 1);
});

test("未選択試合を完全に維持する", async () => {
  const h = harness({ official: { 25692: match(25692, { homeScore: 3 }) } });
  const untouched = h.existing[1];
  const plan = await h.create([25692]);
  assert.strictEqual(plan.nextItems[1], untouched);
  assert.deepEqual(plan.nextItems[1], untouched);
});

test("substitutionsだけの公式訂正を検知する", async () => {
  const corrected = match(25692);
  corrected.substitutions.home[1].playerIn = "瀬川 智輝";
  const h = harness({ official: { 25692: corrected } });
  const plan = await h.create([25692]);
  assert.equal(plan.changed, true);
  assert.deepEqual(plan.changedGames[0].changedFields, ["substitutions"]);
});

test("score訂正を検知する", async () => {
  const h = harness({ official: { 25692: match(25692, { homeScore: 3 }) } });
  const plan = await h.create([25692]);
  assert.ok(plan.changedGames[0].changedFields.includes("homeScore"));
});

test("cards訂正を検知する", async () => {
  const h = harness({ official: { 25692: match(25692, { disciplinary: [{ minute: "70 分", player: "選手A", card: "yellow" }] }) } });
  const plan = await h.create([25692]);
  assert.ok(plan.changedGames[0].changedFields.includes("disciplinary"));
});

test("starting lineup訂正を検知する", async () => {
  const corrected = match(25692);
  corrected.lineups.home.starters = ["訂正選手"];
  const h = harness({ official: { 25692: corrected } });
  const plan = await h.create([25692]);
  assert.ok(plan.changedGames[0].changedFields.includes("lineups"));
});

test("bench/member訂正を検知する", async () => {
  const corrected = match(25692);
  corrected.lineups.home.substitutes = ["瀬川 智輝"];
  const h = harness({ official: { 25692: corrected } });
  const plan = await h.create([25692]);
  assert.ok(plan.changedGames[0].changedFields.includes("lineups"));
});

test("既存match.idを維持する", async () => {
  const official = match(25692, { id: "official-generated-id", homeScore: 3 });
  const h = harness({ official: { 25692: official } });
  const plan = await h.create([25692]);
  assert.equal(plan.nextItems[0].id, "stable-25692");
});

test("manual保持対象を維持する", async () => {
  const existing = match(25692, { manualOverride: { note: "keep" }, manualOverrideReason: "official correction pending" });
  const h = harness({ existing: [existing], official: { 25692: match(25692, { homeScore: 3 }) } });
  const plan = await h.create([25692]);
  assert.deepEqual(plan.nextItems[0].manualOverride, { note: "keep" });
  assert.equal(plan.nextItems[0].manualOverrideReason, "official correction pending");
});

test("gameId未公開から公開後も安定match.idを維持する", async () => {
  const unpublished = match(null, { id: "stable-fixture", gameId: null });
  const published = match(40000, { id: "new-generated-id" });
  const h = harness({
    existing: [unpublished],
    official: { 40000: published },
    list: { detailTargets: [listMatch(40000, { matchId: "stable-fixture" })], matches: [listMatch(40000, { matchId: "stable-fixture" })] },
  });
  const plan = await h.create([40000], { changeHints: [{ gameId: 40000, matchId: "stable-fixture" }] });
  assert.equal(plan.nextItems[0].id, "stable-fixture");
  assert.equal(plan.nextItems[0].gameId, 40000);
});

test("pollからauditとselected syncを通してgameId公開後の公式detailを反映する", async () => {
  const stableId = "football-system-schedule-0a377fb50741";
  const unpublished = {
    id: stableId,
    gameId: null,
    status: "scheduled",
    kickoffAt: "2026-09-27T13:00:00+09:00",
    round: 15,
    venue: "会場A",
    homeTeam: { name: "広島経済大学", score: null },
    awayTeam: { name: "山口大学", score: null },
    lineups: { home: { starters: [], substitutes: [] }, away: { starters: [], substitutes: [] } },
  };
  const untouched = match(30000);
  const listTarget = {
    id: "football-system-15-558-25693",
    gameId: 25693,
    fedId: 15,
    taikaiHoldId: 558,
    kickoffAt: "2026-09-27T13:00:00+09:00",
    round: 15,
    venue: "会場A",
    status: "finished",
    detailAvailable: true,
    homeTeam: { name: "広島経済大学", score: 11 },
    awayTeam: { name: "山口大学", score: 0 },
  };
  const pollResult = {
    competitionId: "2026-1",
    changed: true,
    changedGameIds: [25693],
    changes: [{
      type: "updated",
      gameId: 25693,
      matchId: stableId,
      changedFields: ["gameId", "score", "status", "detailAvailable"],
      before: { gameId: null, matchId: stableId, status: "scheduled" },
      after: { gameId: 25693, matchId: stableId, status: "finished" },
    }],
  };
  const auditPlan = createAuditPlan({
    mode: "recent",
    now: "2026-09-29T12:00:00+09:00",
    savedMatches: [unpublished, untouched],
    parsedList: { detailTargets: [listTarget] },
    pollResult,
  });
  const published = {
    ...unpublished,
    id: "official-generated-id",
    gameId: 25693,
    homeTeam: { name: "広島経済大学", score: 11 },
    awayTeam: { name: "山口大学", score: 0 },
    status: "finished",
    lineups: { home: { starters: ["新先発"], substitutes: [] }, away: { starters: ["選手B"], substitutes: [] } },
  };
  const selectedPlan = await createSelectedDetailPlan({
    targetKey: target.key,
    existingData: { items: [unpublished, untouched] },
    parsedList: { detailTargets: [listTarget] },
    selectedGameIds: auditPlan.selectedGameIds,
    changeHints: pollResult.changes,
    fetchDetailHtml: async () => JSON.stringify(published),
    parseDetail: (html) => JSON.parse(html),
  });
  assert.deepEqual(auditPlan.selectedGameIds, [25693]);
  assert.equal(selectedPlan.detailPosts, 1);
  assert.equal(selectedPlan.nextItems[0].id, stableId);
  assert.equal(selectedPlan.nextItems[0].gameId, 25693);
  assert.equal(selectedPlan.nextItems[0].homeTeam.score, 11);
  assert.equal(selectedPlan.nextItems[0].status, "finished");
  assert.deepEqual(selectedPlan.nextItems[0].lineups.home.starters, ["新先発"]);
  assert.strictEqual(selectedPlan.nextItems[1], untouched);
});

test("detailAvailable=falseならPOSTしない", async () => {
  const h = harness({ list: { detailTargets: [], matches: [listMatch(25692, { detailAvailable: false })] } });
  const plan = await h.create([25692]);
  assert.equal(h.posts(), 0);
  assert.deepEqual(plan.unavailableGameIds, [25692]);
  assert.equal(plan.changed, false);
});

test("複数selectedの1件取得失敗では書き込まない", async () => {
  let writes = 0;
  const h = harness({ fetchImpl: async (item) => {
    if (item.gameId === 30000) throw new Error("temporary failure");
    return JSON.stringify(match(item.gameId));
  } });
  await assert.rejects(() => executeSelectedDetailSync({
    planOptions: {
      targetKey: target.key,
      existingData: { items: h.existing, metadata: {} },
      parsedList: h.parsedList,
      selectedGameIds: [25692, 30000],
      fetchDetailHtml: async (item) => {
        if (item.gameId === 30000) throw new Error("temporary failure");
        return JSON.stringify(match(item.gameId));
      },
      parseDetail: (html) => JSON.parse(html),
    },
    write: async () => { writes += 1; },
  }), /temporary failure/);
  assert.equal(writes, 0);
});

test("parse失敗では書き込まない", async () => {
  let writes = 0;
  const h = harness({ fetchImpl: async () => "not-json" });
  await assert.rejects(() => executeSelectedDetailSync({
    planOptions: {
      targetKey: target.key,
      existingData: { items: h.existing, metadata: {} },
      parsedList: h.parsedList,
      selectedGameIds: [25692],
      fetchDetailHtml: async () => "not-json",
      parseDetail: (html) => JSON.parse(html),
    },
    write: async () => { writes += 1; },
  }));
  assert.equal(writes, 0);
});

test("同一データならchanged=false", async () => {
  const h = harness();
  const plan = await h.create([25692]);
  assert.equal(plan.changed, false);
});

test("poll changedGameIdsをselected syncへ渡して対象試合だけ更新する", async () => {
  const corrected = match(25692, { homeScore: 3 });
  const pollResult = {
    changedGameIds: [25692, 30000],
    parsedList: { detailTargets: [listMatch(25692)] },
    changes: [
      { type: "changed", gameId: 25692, matchId: "stable-25692", after: { gameId: 25692 } },
      { type: "removed", gameId: 30000, matchId: "stable-30000", before: { gameId: 30000 } },
    ],
  };
  const selection = selectedGameIdsFromPoll(pollResult);
  assert.deepEqual(selection.gameIds, [25692]);
  assert.equal(selection.requiresFullSync.length, 1);
  const h = harness({ official: { 25692: corrected }, list: pollResult.parsedList });
  const plan = await h.create(selection.gameIds, { changeHints: pollResult.changes });
  assert.equal(h.posts(), 1);
  assert.equal(plan.nextItems[0].homeScore, 3);
});

test("gameId 25692 fixtureを瀬川智輝へ訂正し他試合を維持する", async () => {
  const corrected = match(25692);
  corrected.substitutions.home[1].playerIn = "瀬川 智輝";
  const h = harness({ official: { 25692: corrected } });
  const untouched = h.existing[1];
  const plan = await h.create([25692]);
  assert.equal(h.posts(), 1);
  assert.equal(plan.changedGames.length, 1);
  assert.equal(plan.nextItems[0].substitutions.home[0].playerIn, "今岡 煌星");
  assert.equal(plan.nextItems[0].substitutions.home[1].playerIn, "瀬川 智輝");
  assert.equal(plan.nextItems[0].id, "stable-25692");
  assert.strictEqual(plan.nextItems[1], untouched);
});

test("dry-runは変更を検出しても書き込まない", async () => {
  let writes = 0;
  const h = harness({ official: { 25692: match(25692, { homeScore: 3 }) } });
  const result = await executeSelectedDetailSync({
    planOptions: {
      targetKey: target.key,
      existingData: { items: h.existing, metadata: {} },
      parsedList: h.parsedList,
      selectedGameIds: [25692],
      fetchDetailHtml: async () => JSON.stringify(match(25692, { homeScore: 3 })),
      parseDetail: (html) => JSON.parse(html),
    },
    dryRun: true,
    write: async () => { writes += 1; },
  });
  assert.equal(result.changed, true);
  assert.equal(writes, 0);
});
