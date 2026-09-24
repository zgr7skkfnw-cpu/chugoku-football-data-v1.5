import { isDeepStrictEqual } from "node:util";

import { cleanResultText } from "./result-list.mjs";

export const CANONICAL_LIST_FIELDS = Object.freeze([
  "group",
  "round",
  "gameId",
  "fedId",
  "taikaiHoldId",
  "kickoffAt",
  "home",
  "away",
  "score",
  "status",
  "venue",
  "detailAvailable",
]);

export function canonicalSnapshotFromParsedList(parsedList) {
  return canonicalSnapshotFromMatches([
    ...(parsedList.detailTargets ?? []),
    ...(parsedList.scheduledMatches ?? []),
  ]);
}

export function canonicalSnapshotFromMatches(matches) {
  return matches.map(canonicalListMatch).sort(compareCanonicalMatches);
}

export function canonicalListMatch(match) {
  const gameId = integerOrNull(match.gameId);
  const fedId = integerOrNull(match.fedId ?? match.source?.fedId);
  const taikaiHoldId = integerOrNull(match.taikaiHoldId ?? match.source?.taikaiHoldId);
  const home = canonicalText(match.homeTeam?.name ?? match.home ?? "");
  const away = canonicalText(match.awayTeam?.name ?? match.away ?? "");
  const score = scoreOrNull(match.homeTeam?.score ?? match.score?.home, match.awayTeam?.score ?? match.score?.away);
  return {
    matchId: typeof match.id === "string" ? match.id : null,
    group: canonicalText(match.groupName ?? match.group ?? "") || null,
    round: integerOrNull(match.round),
    gameId,
    fedId,
    taikaiHoldId,
    kickoffAt: String(match.kickoffAt ?? ""),
    home,
    away,
    score,
    status: normalizeStatus(match.status, gameId),
    venue: canonicalText(match.venue ?? "") || null,
    detailAvailable: gameId !== null,
  };
}

export function validateCanonicalSnapshot(snapshot, {
  label = "一覧",
  previousCount = null,
  minimumCountRatio = 0.6,
} = {}) {
  if (!Array.isArray(snapshot) || snapshot.length === 0) {
    throw new Error(`${label}の試合が0件です`);
  }
  if (
    Number.isInteger(previousCount)
    && previousCount > 0
    && snapshot.length < Math.ceil(previousCount * minimumCountRatio)
  ) {
    throw new Error(`${label}の試合数が既存データから急減しました: ${previousCount}件 → ${snapshot.length}件`);
  }

  const gameIds = new Set();
  const stableKeys = new Set();
  for (const match of snapshot) {
    if (!match.home || !match.away || !match.kickoffAt) {
      throw new Error(`${label}に必須項目がない試合があります`);
    }
    if (match.gameId !== null) {
      if (gameIds.has(match.gameId)) throw new Error(`${label}に重複gameIdがあります: ${match.gameId}`);
      gameIds.add(match.gameId);
    }
    const key = stableSnapshotKey(match);
    if (stableKeys.has(key)) throw new Error(`${label}に重複安定キーがあります: ${key}`);
    stableKeys.add(key);
  }
  return snapshot;
}

export function compareCanonicalSnapshots(previousSnapshot, currentSnapshot, { competitionId } = {}) {
  validateCanonicalSnapshot(previousSnapshot, { label: `${competitionId ?? "competition"} 保存済み一覧` });
  validateCanonicalSnapshot(currentSnapshot, {
    label: `${competitionId ?? "competition"} 公式一覧`,
    previousCount: previousSnapshot.length,
  });

  const previous = new Set(previousSnapshot);
  const current = new Set(currentSnapshot);
  const pairs = [];
  pairUnique(previous, current, (match) => match.gameId === null ? null : `game:${match.gameId}`, pairs);
  pairUnique(previous, current, (match) => match.matchId ? `id:${match.matchId}` : null, pairs);
  pairUnique(previous, current, (match) => `slot:${match.group ?? ""}\0${match.round ?? ""}\0${match.kickoffAt}\0${match.venue ?? ""}`, pairs);
  pairUnique(previous, current, (match) => `fixture:${match.home}\0${match.away}`, pairs);

  const changes = [];
  for (const [before, after] of pairs) {
    const changedFields = CANONICAL_LIST_FIELDS.filter(
      (field) => !isDeepStrictEqual(before[field], after[field]),
    );
    if (changedFields.length) changes.push(changeRecord("updated", before, after, changedFields));
  }
  for (const match of previous) changes.push(changeRecord("removed", match, null, ["removed"]));
  for (const match of current) changes.push(changeRecord("added", null, match, ["added"]));
  changes.sort((left, right) => changeSortKey(left).localeCompare(changeSortKey(right), "ja"));

  return {
    competitionId,
    changed: changes.length > 0,
    changedGameIds: [...new Set(changes.flatMap((change) => change.gameId === null ? [] : [change.gameId]))].sort((a, b) => a - b),
    changes,
  };
}

function pairUnique(previous, current, keyOf, pairs) {
  const previousByKey = groupRemaining(previous, keyOf);
  const currentByKey = groupRemaining(current, keyOf);
  for (const [key, previousMatches] of previousByKey) {
    if (!key || previousMatches.length !== 1) continue;
    const currentMatches = currentByKey.get(key);
    if (currentMatches?.length !== 1) continue;
    const before = previousMatches[0];
    const after = currentMatches[0];
    previous.delete(before);
    current.delete(after);
    pairs.push([before, after]);
  }
}

function groupRemaining(matches, keyOf) {
  const result = new Map();
  for (const match of matches) {
    const key = keyOf(match);
    if (!key) continue;
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(match);
  }
  return result;
}

function changeRecord(type, before, after, changedFields) {
  const current = after ?? before;
  return {
    type,
    gameId: after?.gameId ?? before?.gameId ?? null,
    matchId: before?.matchId ?? after?.matchId ?? null,
    changedFields,
    before,
    after,
    identity: {
      home: current.home,
      away: current.away,
      kickoffAt: current.kickoffAt,
    },
  };
}

function changeSortKey(change) {
  return `${change.after?.kickoffAt ?? change.before?.kickoffAt ?? ""}\0${change.gameId ?? ""}\0${change.matchId ?? ""}`;
}

function stableSnapshotKey(match) {
  if (match.gameId !== null) return `game:${match.gameId}`;
  return `fixture:${match.group ?? ""}\0${match.round ?? ""}\0${match.kickoffAt}\0${match.home}\0${match.away}`;
}

function compareCanonicalMatches(left, right) {
  return stableSnapshotKey(left).localeCompare(stableSnapshotKey(right), "ja");
}

function integerOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function canonicalText(value) {
  return cleanResultText(String(value ?? "").normalize("NFKC"));
}

function scoreOrNull(home, away) {
  if ([home, away].some((value) => value === null || value === undefined || value === "")) {
    return null;
  }
  const homeScore = Number(home);
  const awayScore = Number(away);
  return Number.isFinite(homeScore) && Number.isFinite(awayScore)
    ? { home: homeScore, away: awayScore }
    : null;
}

function normalizeStatus(value, gameId) {
  if (["cancelled", "postponed", "suspended"].includes(value)) return value;
  return gameId === null ? "scheduled" : "finished";
}
