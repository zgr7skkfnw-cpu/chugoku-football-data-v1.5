import test from "node:test";
import assert from "node:assert/strict";

import { parseResultListHtml } from "../scripts/sync/result-list.mjs";
import {
  canonicalListMatch,
  canonicalSnapshotFromMatches,
  compareCanonicalSnapshots,
  validateCanonicalSnapshot,
} from "../scripts/sync/result-list-poll.mjs";

const base = (overrides = {}) => canonicalListMatch({
  id: "football-system-schedule-stable",
  groupName: null,
  round: 1,
  gameId: 100,
  fedId: 15,
  taikaiHoldId: 558,
  kickoffAt: "2026-04-01T11:00:00+09:00",
  homeTeam: { name: "大学 A", score: 1 },
  awayTeam: { name: "大学 B", score: 0 },
  status: "finished",
  venue: "会場 A",
  ...overrides,
});

const compare = (before, after) => compareCanonicalSnapshots(before, after, { competitionId: "2026-1" });
const updatedFields = (before, after) => compare([before], [after]).changes[0]?.changedFields ?? [];

test("公式一覧HTMLをcanonical化し装飾と空白を正規化する", () => {
  const parsed = parseResultListHtml(listHtml(), { minimumScheduleCount: 1 });
  assert.equal(parsed.scheduleCount, 1);
  assert.equal(parsed.detailTargets[0].gameId, 100);
  assert.equal(parsed.detailTargets[0].homeTeam.name, "大学 A");
  assert.equal(parsed.detailTargets[0].kickoffAt, "2026-04-01T11:00:00+09:00");
});

test("完全一致ならchanged=false", () => {
  const match = base();
  assert.equal(compare([match], [{ ...match }]).changed, false);
});

test("未開催試合のscoreはnullとしてcanonical化する", () => {
  const scheduled = base({ gameId: null, homeTeam: { name: "大学 A", score: null }, awayTeam: { name: "大学 B", score: null } });
  assert.equal(scheduled.score, null);
});

test("スコア変更を検知する", () => {
  assert.deepEqual(updatedFields(base(), base({ homeTeam: { name: "大学 A", score: 2 } })), ["score"]);
});

test("kickoff変更を検知する", () => {
  assert.deepEqual(updatedFields(base(), base({ kickoffAt: "2026-04-01T13:00:00+09:00" })), ["kickoffAt"]);
});

test("会場変更を検知する", () => {
  assert.deepEqual(updatedFields(base(), base({ venue: "会場 B" })), ["venue"]);
});

test("対戦カード変更を一意な日時・節・会場で対応付けて検知する", () => {
  const before = base({ gameId: null, fedId: null, taikaiHoldId: null, status: "scheduled", homeTeam: { name: "大学 A", score: null }, awayTeam: { name: "大学 B", score: null } });
  const after = base({ gameId: null, fedId: null, taikaiHoldId: null, status: "scheduled", homeTeam: { name: "大学 C", score: null }, awayTeam: { name: "大学 B", score: null } });
  assert.deepEqual(updatedFields(before, after), ["home"]);
});

test("status変更を検知する", () => {
  const before = base({ gameId: null, fedId: null, taikaiHoldId: null, status: "scheduled", homeTeam: { name: "大学 A", score: null }, awayTeam: { name: "大学 B", score: null } });
  const after = { ...before, status: "postponed" };
  assert.deepEqual(updatedFields(before, after), ["status"]);
});

test("gameId未公開から公開を同一試合の変更として検知する", () => {
  const before = base({ gameId: null, fedId: null, taikaiHoldId: null, status: "scheduled", homeTeam: { name: "大学 A", score: null }, awayTeam: { name: "大学 B", score: null } });
  const result = compare([before], [base()]);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].type, "updated");
  assert.ok(result.changes[0].changedFields.includes("gameId"));
  assert.ok(result.changes[0].changedFields.includes("detailAvailable"));
});

test("detail未公開から公開を検知する", () => {
  const before = { ...base(), detailAvailable: false };
  assert.deepEqual(updatedFields(before, base()), ["detailAvailable"]);
});

test("新規試合追加を検知する", () => {
  const added = base({ id: "new", gameId: 101, homeTeam: { name: "大学 C", score: 0 }, awayTeam: { name: "大学 D", score: 0 } });
  const result = compare([base()], [base(), added]);
  assert.equal(result.changes[0].type, "added");
  assert.deepEqual(result.changes[0].changedFields, ["added"]);
});

test("試合消失を検知する", () => {
  const removed = base({ id: "old", gameId: 101, homeTeam: { name: "大学 C", score: 0 }, awayTeam: { name: "大学 D", score: 0 } });
  const retained = base({ id: "retained", gameId: 102, homeTeam: { name: "大学 E", score: 0 }, awayTeam: { name: "大学 F", score: 0 } });
  const result = compare([base(), removed, retained], [base(), retained]);
  assert.equal(result.changes[0].type, "removed");
  assert.deepEqual(result.changes[0].changedFields, ["removed"]);
});

test("group変更を検知する", () => {
  assert.deepEqual(updatedFields(base({ groupName: "A" }), base({ groupName: "B" })), ["group"]);
});

test("round変更を検知する", () => {
  assert.deepEqual(updatedFields(base(), base({ round: 2 })), ["round"]);
});

test("substitutionsだけの変更はpoll対象外", () => {
  const before = canonicalSnapshotFromMatches([{ ...rawMatch(), substitutions: { home: ["80 分 [out]又野 寛太 [in]今岡 煌星"], away: [] } }]);
  const after = canonicalSnapshotFromMatches([{ ...rawMatch(), substitutions: { home: ["80 分 [out]又野 寛太 [in]瀬川 智輝"], away: [] } }]);
  assert.equal(compare(before, after).changed, false);
});

test("HTML空または構造異常なら安全に失敗する", () => {
  assert.throws(() => parseResultListHtml("<html><body></body></html>"), /game_schedule/);
});

test("一覧件数の異常減少なら安全に失敗する", () => {
  const previous = Array.from({ length: 10 }, (_, index) => base({ id: `p${index}`, gameId: 100 + index, homeTeam: { name: `H${index}`, score: 1 }, awayTeam: { name: `A${index}`, score: 0 } }));
  const current = previous.slice(0, 5);
  assert.throws(() => compare(previous, current), /急減/);
});

test("gameId重複なら安全に失敗する", () => {
  assert.throws(() => validateCanonicalSnapshot([base(), { ...base(), matchId: "other" }]), /重複gameId/);
});

test("未公開試合の安定キー重複なら安全に失敗する", () => {
  const scheduled = base({ gameId: null, fedId: null, taikaiHoldId: null, status: "scheduled", homeTeam: { name: "大学 A", score: null }, awayTeam: { name: "大学 B", score: null } });
  assert.throws(() => validateCanonicalSnapshot([scheduled, { ...scheduled, matchId: "other" }]), /重複安定キー/);
});

test("公式一覧順序だけの変更はchanged=false", () => {
  const second = base({ id: "second", gameId: 101, homeTeam: { name: "大学 C", score: 2 }, awayTeam: { name: "大学 D", score: 2 } });
  assert.equal(compare([base(), second], [second, base()]).changed, false);
});

function rawMatch() {
  return {
    id: "football-system-15-558-100",
    gameId: 100,
    fedId: 15,
    taikaiHoldId: 558,
    round: 1,
    kickoffAt: "2026-04-01T11:00:00+09:00",
    homeTeam: { name: "大学 A", score: 1 },
    awayTeam: { name: "大学 B", score: 0 },
    status: "finished",
    venue: "会場 A",
  };
}

function listHtml() {
  return `<!doctype html><html><body>
    <table class="head"><tr><td class="name">2026年度 大会</td></tr></table>
    <table class="game_schedule"><tr>
      <td class="round">第 1 節</td>
      <td class="match_date">2026/04/01</td>
      <td class="match_time">11:00</td>
      <td class="team_home">大学　A</td>
      <td class="match_result"><button onclick="gamedetail(100, 15, 558)">1 - 0</button></td>
      <td class="team_away">大学 B</td>
      <td class="arena pc"><span>会場 A</span></td>
    </tr></table>
  </body></html>`;
}
