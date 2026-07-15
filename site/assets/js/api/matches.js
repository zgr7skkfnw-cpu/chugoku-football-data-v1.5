import { dataUrl, loadSeasonIndex } from "./seasons.js";

let matchesPromise;

export async function loadMatches() {
  matchesPromise ??= loadSeasonIndex().then(async (index) => {
    const definitions = index.items.flatMap((season) => season.competitions
      .filter((competition) => competition.matches)
      .map((competition) => ({ ...competition, season: season.season })));
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
      availableSeasons: index.items.map((item) => item.season),
      defaultSeason: index.defaultSeason,
    };
  });
  return matchesPromise;
}

async function loadCompetition(competition) {
  const response = await fetch(dataUrl(competition.matches), {
    headers: { Accept: "application/json" },
    cache: "force-cache",
  });
  if (!response.ok) throw new Error(`${competition.name}の試合データを取得できませんでした（HTTP ${response.status}）`);
  const data = await response.json();
  if (data.schemaVersion !== 1 || !Array.isArray(data.items)) throw new Error(`${competition.name}の試合データ形式が対応していません`);

  return {
    season: competition.season,
    division: competition.division,
    stageId: competition.stage,
    matches: data.items.map((match) => ({
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
    },
  };
}
