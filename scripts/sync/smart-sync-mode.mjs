export const SMART_SCHEDULES = Object.freeze({
  hourly: "17 0-15,18,21-23 * * *",
  daily: "37 17 * * *",
  weekly: "37 19 * * 6",
});

export const SMART_MODES = Object.freeze(["hourly", "daily", "weekly", "manual-full"]);

export function resolveSmartSyncMode({ eventName, schedule, dispatchMode }) {
  if (eventName === "workflow_dispatch") {
    if (!SMART_MODES.includes(dispatchMode)) throw new Error(`未対応の手動modeです: ${dispatchMode}`);
    return dispatchMode;
  }
  if (eventName !== "schedule") throw new Error(`未対応のeventです: ${eventName}`);
  const entry = Object.entries(SMART_SCHEDULES).find(([, cron]) => cron === schedule);
  if (!entry) throw new Error(`未対応のscheduleです: ${schedule}`);
  return entry[0];
}

export function smartModePlan(mode) {
  if (!SMART_MODES.includes(mode)) throw new Error(`未対応のsmart sync modeです: ${mode}`);
  if (mode === "manual-full") return { fullSync: true, auditMode: null, rosterAudit: true };
  return {
    fullSync: false,
    auditMode: mode === "hourly" ? "recent" : mode === "daily" ? "daily" : "full",
    rosterAudit: mode !== "hourly",
  };
}
