import { dataUrl, loadSeasonIndex } from "./seasons.js";

let leagueStatsPromise;

export function loadLeagueStats() {
  leagueStatsPromise ??= loadSeasonIndex().then(async (index) => {
    const definitions = index.items.flatMap((season) => season.competitions
      .filter((competition) => competition.stage === "regular" && competition.teamStats)
      .map((competition) => ({ ...competition, season: season.season })));
    const entries = await Promise.all(definitions.map(async (competition) => {
      const response = await fetch(dataUrl(competition.teamStats), {
        headers: { Accept: "application/json" },
        cache: "force-cache",
      });
      if (!response.ok) throw new Error(`${competition.name}のチーム分析データを取得できませんでした（HTTP ${response.status}）`);
      const data = await response.json();
      if (data.schemaVersion !== 1 || !data.periods) throw new Error(`${competition.name}のチーム分析データ形式が対応していません`);
      return { season: competition.season, division: competition.division, data };
    }));
    const result = {};
    for (const entry of entries) {
      result[entry.season] ??= {};
      result[entry.season][entry.division] = entry.data;
    }
    return result;
  });
  return leagueStatsPromise;
}
