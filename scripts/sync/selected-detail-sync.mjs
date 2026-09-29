import { isDeepStrictEqual } from "node:util";

import { RESULT_TARGETS } from "./result-targets.mjs";

const LOCAL_PRESERVED_FIELDS = Object.freeze([
  "manualOverride",
  "manualOverrideReason",
  "manualOverrideUpdatedAt",
]);

export function selectedGameIdsFromPoll(pollResult) {
  const available = new Set((pollResult.parsedList?.detailTargets ?? []).map((match) => match.gameId));
  const gameIds = (pollResult.changedGameIds ?? []).filter((gameId) => available.has(gameId));
  const requiresFullSync = (pollResult.changes ?? []).filter((change) => {
    const gameId = change.after?.gameId ?? change.before?.gameId ?? null;
    return gameId === null || !available.has(gameId);
  });
  return { gameIds, requiresFullSync };
}

export async function createSelectedDetailPlan({
  targetKey,
  existingData,
  parsedList,
  selectedGameIds,
  changeHints = [],
  fetchDetailHtml,
  parseDetail,
  warn = () => {},
}) {
  const target = RESULT_TARGETS[targetKey];
  if (!target) throw new Error(`未対応の同期対象です: ${targetKey}`);
  if (typeof parseDetail !== "function") throw new Error("詳細parserを指定してください");
  const requestedIds = [...new Set(selectedGameIds.map(Number))];
  if (requestedIds.some((gameId) => !Number.isInteger(gameId))) {
    throw new Error("gameIdは整数で指定してください");
  }
  const detailByGameId = new Map((parsedList.detailTargets ?? []).map((match) => [match.gameId, match]));
  const unavailableGameIds = requestedIds.filter((gameId) => !detailByGameId.has(gameId));
  const availableTargets = requestedIds.map((gameId) => detailByGameId.get(gameId)).filter(Boolean);
  const existingItems = existingData.items ?? [];

  // 全selected取得とparseが完了するまで、既存dataには一切触れない。
  const parsedMatches = await Promise.all(availableTargets.map(async (listMatch) => {
    const detailHtml = await fetchDetailHtml(listMatch);
    const parsed = parseDetail(detailHtml, listMatch, {
      allowIncompleteLineups: target.allowIncompleteLineups,
      includePlayerShots: targetKey === "2026-rookie",
      warn,
    });
    const { sourceOrder, ...officialMatch } = parsed;
    return target.stage === "i-league-regular"
      ? { ...officialMatch, competitionId: target.competitionId }
      : officialMatch;
  }));

  const replacements = [];
  for (const officialMatch of parsedMatches) {
    const hint = changeHints.find((change) => change.gameId === officialMatch.gameId);
    const existingIndex = findExistingMatchIndex(existingItems, officialMatch, hint);
    const existingMatch = existingIndex >= 0 ? existingItems[existingIndex] : null;
    const nextMatch = mergeOfficialMatch(existingMatch, officialMatch);
    const changedFields = existingMatch
      ? changedTopLevelFields(existingMatch, nextMatch)
      : ["added"];
    replacements.push({
      gameId: officialMatch.gameId,
      existingIndex,
      existingMatch,
      nextMatch,
      changedFields,
      changed: changedFields.length > 0,
    });
  }

  const nextItems = [...existingItems];
  for (const replacement of replacements) {
    if (replacement.existingIndex >= 0) nextItems[replacement.existingIndex] = replacement.nextMatch;
    else nextItems.push(replacement.nextMatch);
  }
  const changedGames = replacements.filter((replacement) => replacement.changed);
  return {
    targetKey,
    selectedGameIds: requestedIds,
    detailGameIds: availableTargets.map((match) => match.gameId),
    unavailableGameIds,
    detailPosts: availableTargets.length,
    changed: changedGames.length > 0,
    changedGames,
    replacements,
    nextItems,
    nextData: {
      ...existingData,
      scheduleCount: parsedList.scheduleCount,
      matchCount: nextItems.length,
      items: nextItems,
    },
  };
}

export async function executeSelectedDetailSync({
  planOptions,
  validate = async () => {},
  dryRun = true,
  write = async () => {},
  buildDerived = async () => {},
}) {
  const plan = await createSelectedDetailPlan(planOptions);
  await validate(plan);
  if (plan.changed && !dryRun) {
    await write(plan);
    await buildDerived(plan);
  }
  return plan;
}

export function mergeOfficialMatch(existingMatch, officialMatch) {
  if (!existingMatch) return officialMatch;
  const preserved = {};
  for (const field of LOCAL_PRESERVED_FIELDS) {
    if (Object.hasOwn(existingMatch, field)) preserved[field] = existingMatch[field];
  }
  return {
    ...officialMatch,
    id: existingMatch.id,
    ...preserved,
  };
}

function findExistingMatchIndex(existingItems, officialMatch, hint) {
  const byGameId = existingItems.findIndex((match) => match.gameId === officialMatch.gameId);
  if (byGameId >= 0) return byGameId;
  if (hint?.matchId) {
    const byHint = existingItems.findIndex((match) => match.id === hint.matchId);
    if (byHint >= 0) return byHint;
  }
  const candidates = existingItems
    .map((match, index) => ({ match, index }))
    .filter(({ match }) =>
      match.gameId == null
      && match.groupName === officialMatch.groupName
      && match.round === officialMatch.round
      && match.homeTeam?.name === officialMatch.homeTeam?.name
      && match.awayTeam?.name === officialMatch.awayTeam?.name);
  return candidates.length === 1 ? candidates[0].index : -1;
}

function changedTopLevelFields(before, after) {
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  fields.delete("id");
  return [...fields].filter((field) => !isDeepStrictEqual(before[field], after[field])).sort();
}
