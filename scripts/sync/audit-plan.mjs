const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const AUDIT_MODES = Object.freeze({
  recent: Object.freeze({ windowMs: 72 * HOUR_MS, reason: "recent-window" }),
  daily: Object.freeze({ windowMs: 14 * DAY_MS, reason: "daily-window" }),
  full: Object.freeze({ windowMs: null, reason: "full-audit" }),
});

export function createAuditPlan({
  mode,
  now = new Date(),
  savedMatches,
  parsedList,
  pollResult = { changedGameIds: [] },
}) {
  const modeConfig = AUDIT_MODES[mode];
  if (!modeConfig) throw new Error(`未対応の監査モードです: ${mode}`);
  const nowMs = instantValue(now, "現在時刻");
  const savedItems = savedMatches ?? [];
  const officialByGameId = new Map((parsedList.detailTargets ?? []).map((match) => [match.gameId, match]));
  const selected = new Map();

  for (const savedMatch of savedItems) {
    const officialMatch = officialByGameId.get(savedMatch.gameId);
    if (!isSafelyFinishedMatch(savedMatch, officialMatch, nowMs)) continue;
    const ageMs = nowMs - auditReferenceTime(savedMatch);
    if (modeConfig.windowMs === null || ageMs <= modeConfig.windowMs) {
      addReason(selected, savedMatch.gameId, modeConfig.reason, savedMatch, officialMatch);
    }
  }

  const pollChanges = pollResult.changes?.length
    ? pollResult.changes
    : (pollResult.changedGameIds ?? []).map((gameId) => ({ gameId }));
  for (const change of pollChanges) {
    const gameId = change.after?.gameId ?? change.gameId;
    const officialMatch = officialByGameId.get(gameId);
    if (!isOfficialSafelyFinishedMatch(officialMatch, nowMs)) continue;
    const savedMatch = findSavedMatchForPollChange(savedItems, change);
    addReason(selected, gameId, mode === "full" ? modeConfig.reason : "poll-change", savedMatch, officialMatch, change.matchId);
    if (modeConfig.windowMs !== null) {
      const ageMs = nowMs - auditReferenceTime(savedMatch ?? officialMatch);
      if (ageMs <= modeConfig.windowMs) {
        addReason(selected, gameId, modeConfig.reason, savedMatch, officialMatch, change.matchId);
      }
    }
  }

  const selections = [...selected.values()].sort((left, right) => left.gameId - right.gameId);
  return {
    mode,
    selectedGameIds: selections.map((selection) => selection.gameId),
    selections,
    pollChanged: (pollResult.changedGameIds ?? []).length,
    windowSelected: selections.filter((selection) => selection.reasons.includes(modeConfig.reason)).length,
    selectedGames: selections.length,
    plannedDetailPosts: selections.length,
  };
}

export function isSafelyFinishedMatch(savedMatch, officialMatch, now = Date.now()) {
  if (!savedMatch || !officialMatch) return false;
  if (savedMatch.status !== "finished" || officialMatch.status !== "finished") return false;
  if (!Number.isInteger(officialMatch.gameId) || officialMatch.gameId !== savedMatch.gameId) return false;
  return isOfficialSafelyFinishedMatch(officialMatch, now);
}

export function isOfficialSafelyFinishedMatch(officialMatch, now = Date.now()) {
  if (!officialMatch || officialMatch.status !== "finished") return false;
  if (!Number.isInteger(officialMatch.gameId)) return false;
  if (officialMatch.detailAvailable === false) return false;
  const homeScore = officialMatch.homeTeam?.score ?? officialMatch.score?.home;
  const awayScore = officialMatch.awayTeam?.score ?? officialMatch.score?.away;
  if (!Number.isFinite(Number(homeScore)) || !Number.isFinite(Number(awayScore))) return false;
  try {
    return instantValue(officialMatch.kickoffAt, "kickoffAt") <= instantValue(now, "現在時刻");
  } catch {
    return false;
  }
}

export async function executeAuditPlan({ plan, planOnly = false, dryRun = true, runSelected }) {
  if (planOnly || plan.selectedGameIds.length === 0) {
    return { plan, detailPosts: 0, changedGames: 0, selectedResult: null };
  }
  const selectedResult = await runSelected({
    selectedGameIds: plan.selectedGameIds,
    dryRun,
  });
  return {
    plan,
    detailPosts: selectedResult.detailPosts,
    changedGames: selectedResult.changedGames.length,
    selectedResult,
  };
}

function addReason(selected, gameId, reason, savedMatch, officialMatch, matchId = null) {
  if (!selected.has(gameId)) {
    selected.set(gameId, {
      gameId,
      kickoffAt: savedMatch?.kickoffAt ?? officialMatch.kickoffAt,
      reasons: [],
      matchId: savedMatch?.id ?? matchId ?? officialMatch.id ?? null,
    });
  }
  const entry = selected.get(gameId);
  if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
}

function findSavedMatchForPollChange(savedMatches, change) {
  const matchId = change.matchId ?? change.before?.matchId ?? null;
  if (matchId) {
    const matches = savedMatches.filter((match) => match.id === matchId);
    if (matches.length > 1) throw new Error(`poll changeのmatchIdが重複しています: ${matchId}`);
    if (matches.length === 1) return matches[0];
  }

  const gameId = change.after?.gameId ?? change.gameId ?? change.before?.gameId;
  if (Number.isInteger(gameId)) {
    const matches = savedMatches.filter((match) => match.gameId === gameId);
    if (matches.length > 1) throw new Error(`poll changeのgameIdが重複しています: ${gameId}`);
    if (matches.length === 1) return matches[0];
  }

  const identity = change.after ?? change.before ?? change.identity;
  if (!identity) return null;
  const matches = savedMatches.filter((match) =>
    match.kickoffAt === identity.kickoffAt
    && match.homeTeam?.name === identity.home
    && match.awayTeam?.name === identity.away);
  if (matches.length > 1) {
    throw new Error(`poll changeの安全な一意照合に失敗しました: ${identity.home} vs ${identity.away}`);
  }
  return matches[0] ?? null;
}

function auditReferenceTime(match) {
  if (match.finishedAt) return instantValue(match.finishedAt, `gameId=${match.gameId} finishedAt`);
  const kickoffMs = instantValue(match.kickoffAt, `gameId=${match.gameId} kickoffAt`);
  const playingMinutes = Number(match.matchFormat?.match(/試合時間\s*[：:]\s*(\d+)分/)?.[1] ?? 90);
  const extraMinutes = Number(match.matchFormat?.match(/延長\s*[：:]\s*(\d+)分/)?.[1] ?? 0);
  // 公式一覧には終了時刻がないため、試合時間と通常のハーフタイム15分から安全側に終了時刻を推定する。
  return kickoffMs + (playingMinutes + extraMinutes + 15) * 60 * 1000;
}

function instantValue(value, label) {
  if (value instanceof Date) {
    const result = value.getTime();
    if (Number.isFinite(result)) return result;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const result = Date.parse(value);
    if (Number.isFinite(result)) return result;
  }
  throw new Error(`${label}はタイムゾーン付き日時で指定してください: ${value}`);
}
