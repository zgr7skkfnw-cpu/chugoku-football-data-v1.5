import assert from "node:assert/strict";
import test from "node:test";

import { createAuditPlan, executeAuditPlan, isSafelyFinishedMatch } from "../scripts/sync/audit-plan.mjs";

const NOW = "2026-09-24T15:00:00+09:00";

function saved(gameId, ageMs, overrides = {}) {
  const finishedAt = new Date(Date.parse(NOW) - ageMs).toISOString();
  return {
    id: `stable-${gameId}`,
    gameId,
    kickoffAt: finishedAt,
    finishedAt,
    status: "finished",
    homeTeam: { name: "A", score: 1 },
    awayTeam: { name: "B", score: 0 },
    ...overrides,
  };
}

function official(match, overrides = {}) {
  return {
    gameId: match.gameId,
    kickoffAt: match.kickoffAt,
    status: "finished",
    detailAvailable: true,
    homeTeam: { name: "A", score: 1 },
    awayTeam: { name: "B", score: 0 },
    ...overrides,
  };
}

function plan(mode, matches, { changedGameIds = [], changes = [], officialOverrides = new Map() } = {}) {
  return createAuditPlan({
    mode,
    now: NOW,
    savedMatches: matches,
    parsedList: { detailTargets: matches.map((match) => official(match, officialOverrides.get(match.gameId))) },
    pollResult: { changedGameIds, changes },
  });
}

test("24時間前終了はrecent", () => assert.deepEqual(plan("recent", [saved(1, 24 * 3600000)]).selectedGameIds, [1]));
test("71時間59分前はrecent", () => assert.deepEqual(plan("recent", [saved(1, (71 * 60 + 59) * 60000)]).selectedGameIds, [1]));
test("72時間ちょうどはrecent", () => assert.deepEqual(plan("recent", [saved(1, 72 * 3600000)]).selectedGameIds, [1]));
test("72時間01分前はrecent対象外", () => assert.deepEqual(plan("recent", [saved(1, 72 * 3600000 + 60000)]).selectedGameIds, []));
test("13日前はdaily", () => assert.deepEqual(plan("daily", [saved(1, 13 * 86400000)]).selectedGameIds, [1]));
test("14日ちょうどはdaily", () => assert.deepEqual(plan("daily", [saved(1, 14 * 86400000)]).selectedGameIds, [1]));
test("14日01分前はdaily対象外", () => assert.deepEqual(plan("daily", [saved(1, 14 * 86400000 + 60000)]).selectedGameIds, []));

test("古い試合でもpoll changeならrecent", () => {
  const result = plan("recent", [saved(1, 30 * 86400000)], { changedGameIds: [1] });
  assert.deepEqual(result.selections[0].reasons, ["poll-change"]);
});

test("gameId 25692型はpoll変更なしでも翌日にrecent-window", () => {
  const result = plan("recent", [saved(25692, 24 * 3600000)]);
  assert.deepEqual(result.selections, [{
    gameId: 25692,
    kickoffAt: result.selections[0].kickoffAt,
    reasons: ["recent-window"],
    matchId: "stable-25692",
  }]);
});

test("未開催は対象外", () => {
  const match = saved(1, -3600000, { status: "scheduled" });
  assert.deepEqual(plan("full", [match]).selectedGameIds, []);
});

test("detailAvailable=falseは対象外", () => {
  const match = saved(1, 3600000);
  assert.deepEqual(plan("full", [match], { officialOverrides: new Map([[1, { detailAvailable: false }]]) }).selectedGameIds, []);
});

for (const status of ["cancelled", "postponed", "suspended"]) {
  test(`${status}は対象外`, () => {
    const match = saved(1, 3600000, { status });
    assert.equal(isSafelyFinishedMatch(match, official(match, { status }), Date.parse(NOW)), false);
  });
}

test("fullは全終了済みdetail公開試合を選択", () => {
  const result = plan("full", [saved(1, 400 * 86400000), saved(2, 24 * 3600000)]);
  assert.deepEqual(result.selectedGameIds, [1, 2]);
  assert.deepEqual(result.selections[0].reasons, ["full-audit"]);
});

test("poll-changeとrecent-windowを1gameIdへ統合", () => {
  const result = plan("recent", [saved(1, 24 * 3600000)], { changedGameIds: [1, 1] });
  assert.deepEqual(result.selections[0].reasons, ["recent-window", "poll-change"]);
});

test("gameId未公開から公開された終了試合をstable matchIdで選択する", () => {
  const unpublished = saved(null, 24 * 3600000, {
    id: "stable-25693",
    gameId: null,
    status: "scheduled",
    homeTeam: { name: "A", score: null },
    awayTeam: { name: "B", score: null },
  });
  const result = createAuditPlan({
    mode: "recent",
    now: NOW,
    savedMatches: [unpublished],
    parsedList: { detailTargets: [official(unpublished, { gameId: 25693 })] },
    pollResult: {
      changedGameIds: [25693],
      changes: [{
        gameId: 25693,
        matchId: "stable-25693",
        before: { gameId: null, matchId: "stable-25693", status: "scheduled" },
        after: { gameId: 25693, matchId: "stable-25693", status: "finished" },
      }],
    },
  });
  assert.equal(result.pollChanged, 1);
  assert.equal(result.selectedGames, 1);
  assert.equal(result.plannedDetailPosts, 1);
  assert.deepEqual(result.selectedGameIds, [25693]);
  assert.deepEqual(result.selections[0].reasons, ["poll-change", "recent-window"]);
  assert.equal(result.selections[0].matchId, "stable-25693");
});

test("1節5試合のgameId同時公開を欠落・重複なく選択する", () => {
  const unpublished = Array.from({ length: 5 }, (_, index) => saved(null, 24 * 3600000, {
    id: `stable-${index}`,
    gameId: null,
    status: "scheduled",
    homeTeam: { name: `H${index}`, score: null },
    awayTeam: { name: `A${index}`, score: null },
  }));
  const detailTargets = unpublished.map((match, index) => official(match, {
    gameId: 25693 + index,
    homeTeam: { name: `H${index}`, score: index + 1 },
    awayTeam: { name: `A${index}`, score: 0 },
  }));
  const changes = unpublished.map((match, index) => ({
    gameId: 25693 + index,
    matchId: match.id,
    before: { gameId: null, matchId: match.id, status: "scheduled" },
    after: { gameId: 25693 + index, matchId: match.id, status: "finished" },
  }));
  const result = createAuditPlan({
    mode: "recent",
    now: NOW,
    savedMatches: unpublished,
    parsedList: { detailTargets },
    pollResult: { changedGameIds: changes.map((change) => change.gameId), changes },
  });
  assert.equal(result.pollChanged, 5);
  assert.equal(result.selectedGames, 5);
  assert.equal(result.plannedDetailPosts, 5);
  assert.deepEqual(result.selectedGameIds, [25693, 25694, 25695, 25696, 25697]);
});

test("plan-onlyはselected syncを呼ばずdetail POST 0", async () => {
  let calls = 0;
  const result = await executeAuditPlan({
    plan: plan("recent", [saved(1, 3600000)]),
    planOnly: true,
    runSelected: async () => { calls += 1; },
  });
  assert.equal(calls, 0);
  assert.equal(result.detailPosts, 0);
});

test("dry-runをselected syncへ渡しファイル保存を要求しない", async () => {
  let received;
  const result = await executeAuditPlan({
    plan: plan("recent", [saved(1, 3600000)]),
    dryRun: true,
    runSelected: async (options) => {
      received = options;
      return { detailPosts: 1, changedGames: [] };
    },
  });
  assert.equal(received.dryRun, true);
  assert.equal(result.detailPosts, 1);
});

test("selected sync失敗は監査から伝播する", async () => {
  await assert.rejects(() => executeAuditPlan({
    plan: plan("recent", [saved(1, 3600000)]),
    runSelected: async () => { throw new Error("detail failure"); },
  }), /detail failure/);
});

test("JSTとUTCの同一時刻で境界結果が一致する", () => {
  const match = saved(1, 72 * 3600000);
  const jst = createAuditPlan({ mode: "recent", now: NOW, savedMatches: [match], parsedList: { detailTargets: [official(match)] } });
  const utc = createAuditPlan({ mode: "recent", now: "2026-09-24T06:00:00Z", savedMatches: [match], parsedList: { detailTargets: [official(match)] } });
  assert.deepEqual(jst.selectedGameIds, utc.selectedGameIds);
});

test("タイムゾーンなし時刻は環境依存を避けるため拒否する", () => {
  const match = saved(1, 3600000, { kickoffAt: "2026-09-24T14:00:00", finishedAt: "2026-09-24T15:30:00" });
  assert.deepEqual(plan("recent", [match]).selectedGameIds, []);
});
