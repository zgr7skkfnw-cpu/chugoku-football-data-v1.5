import { dataUrl, loadSeasonIndex } from "./seasons.js";

let matchesPromise;

export async function loadMatches() {
  matchesPromise ??= loadSeasonIndex().then(async (index) => {
    const competitionDefinitions = index.items.flatMap((season) => season.competitions
      .map((competition) => ({ ...competition, season: season.season })));
    const definitions = competitionDefinitions.filter((competition) => competition.matches);
    const competitions = await Promise.all(definitions.map(loadCompetition));
    const competitionMetadata = {};
    for (const competition of competitions.filter((entry) => entry.stageId === "regular")) {
      competitionMetadata[competition.season] ??= {};
      competitionMetadata[competition.season][competition.division] = competition.metadata;
    }
    const defaultMetadata = competitionMetadata[index.defaultSeason]?.[1] ?? null;
    return {
      matches: competitions.flatMap((competition) => competition.matches),
      metadata: defaultMetadata,
      competitionMetadata,
      competitionDefinitions,
      availableSeasons: index.items.map((item) => item.season),
      defaultSeason: index.defaultSeason,
    };
  });
  return matchesPromise;
}

async function loadCompetition(competition) {
  const matchesUrl = dataUrl(competition.matches);

  const [response, manualOverrides] = await Promise.all([
    fetch(matchesUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    }),
    competition.manualOverrides
      ? loadManualOverrides(dataUrl(competition.manualOverrides))
      : Promise.resolve([]),
  ]);

  if (!response.ok) {
    throw new Error(
      `${competition.name}の試合データを取得できませんでした（HTTP ${response.status}）`,
    );
  }

  const data = await response.json();

  if (data.schemaVersion !== 1 || !Array.isArray(data.items)) {
    throw new Error(
      `${competition.name}の試合データ形式が対応していません`,
    );
  }

  const mergedItems = applyManualOverrides(
    data.items,
    manualOverrides,
  );

  return {
    season: competition.season,
    division: competition.division,
    stageId: competition.stage,
    matches: mergedItems.map((match) => ({
      ...match,
      season: competition.season,
      competitionId: competition.id,
      division: competition.division,
      leagueName: competition.leagueName,
      stageId: competition.stage,
      stageName: competition.stageName,
    })),
    metadata: {
      competitionId: competition.id,
      competitionName: data.competitionName,
      leagueName: competition.leagueName,
      division: competition.division,
      stageId: competition.stage,
      stageName: competition.stageName,
      updatedAt: data.updatedAt,
      matchCount: data.matchCount,
      scheduleCount: data.scheduleCount,
      source: data.source,
      manualOverrideCount: manualOverrides.length,
    },
  };
}

/**
 * 同じフォルダにある手動補正ファイルを読み込みます。
 *
 * 補正ファイルが存在しない大会では、空配列を返します。
 */
async function loadManualOverrides(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    console.warn(
      `手動補正データを取得できませんでした（HTTP ${response.status}）`,
    );
    return [];
  }

  const data = await response.json();

  if (data.schemaVersion !== 1 || !Array.isArray(data.items)) {
    console.warn("手動補正データの形式が正しくありません。");
    return [];
  }

  return data.items;
}

/**
 * matchIdが一致する試合へ手動補正を重ねます。
 */
function applyManualOverrides(matches, overrides) {
  const overrideMap = new Map(
    overrides
      .filter((item) => item?.matchId && item?.override)
      .map((item) => [item.matchId, item]),
  );

  return matches.map((match) => {
    const manual = overrideMap.get(match.id);

    if (!manual) {
      return match;
    }

    return mergeMatchData(match, {
      ...manual.override,
      manualOverride: true,
      manualOverrideReason: manual.reason ?? null,
      manualOverrideUpdatedAt: manual.updatedAt ?? null,
    });
  });
}

/**
 * オブジェクトは深く統合し、配列は補正側の内容で置き換えます。
 */
function mergeMatchData(original, override) {
  if (
    !isPlainObject(original)
    || !isPlainObject(override)
  ) {
    return override;
  }

  const merged = { ...original };

  for (const [key, value] of Object.entries(override)) {
    if (
      isPlainObject(value)
      && isPlainObject(original[key])
    ) {
      merged[key] = mergeMatchData(
        original[key],
        value,
      );
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

function isPlainObject(value) {
  return (
    value !== null
    && typeof value === "object"
    && !Array.isArray(value)
  );
}
