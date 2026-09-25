import assert from "node:assert/strict";
import test from "node:test";

import { resolveSmartSyncMode, SMART_SCHEDULES, smartModePlan } from "../scripts/sync/smart-sync-mode.mjs";

test("active hour cronはhourly", () => assert.equal(resolveSmartSyncMode({ eventName: "schedule", schedule: SMART_SCHEDULES.hourly }), "hourly"));
test("overnight cronもhourly", () => assert.match(SMART_SCHEDULES.hourly, /18,21/));
test("daily cronはdaily", () => assert.equal(resolveSmartSyncMode({ eventName: "schedule", schedule: SMART_SCHEDULES.daily }), "daily"));
test("weekly cronはweekly", () => assert.equal(resolveSmartSyncMode({ eventName: "schedule", schedule: SMART_SCHEDULES.weekly }), "weekly"));
for (const mode of ["hourly", "daily", "weekly", "manual-full"]) {
  test(`workflow_dispatch ${mode}`, () => assert.equal(resolveSmartSyncMode({ eventName: "workflow_dispatch", dispatchMode: mode }), mode));
}
test("hourlyはrecentでroster全監査なし", () => assert.deepEqual(smartModePlan("hourly"), { fullSync: false, auditMode: "recent", rosterAudit: false }));
test("dailyは14日監査とroster監査", () => assert.deepEqual(smartModePlan("daily"), { fullSync: false, auditMode: "daily", rosterAudit: true }));
test("weeklyは全件監査とroster監査", () => assert.deepEqual(smartModePlan("weekly"), { fullSync: false, auditMode: "full", rosterAudit: true }));
test("manual-fullは既存full sync", () => assert.equal(smartModePlan("manual-full").fullSync, true));
test("未知scheduleは安全に失敗", () => assert.throws(() => resolveSmartSyncMode({ eventName: "schedule", schedule: "0 0 * * *" }), /未対応/));
