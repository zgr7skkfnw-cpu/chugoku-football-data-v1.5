const TEAMS_URL = new URL("../../../data/teams.json", import.meta.url);
const PLAYERS_URL = new URL("../../../data/players.json", import.meta.url);
const I_LEAGUE_PLAYERS_URL = new URL("../../../data/seasons/2026/i-league/players.json", import.meta.url);
const TEAM_CATALOG_URL = new URL("../../../data/team-catalog.json", import.meta.url);
let teamsPromise;
let playersPromise;
let teamCatalogPromise;

async function fetchJson(url, label) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "force-cache",
  });

  if (!response.ok) {
    throw new Error(`${label}を取得できませんでした（HTTP ${response.status}）`);
  }

  return response.json();
}

export function loadTeams() {
  teamsPromise ??= fetchJson(TEAMS_URL, "チームデータ").then((data) => {
    if (data.schemaVersion !== 1 || !Array.isArray(data.items)) {
      throw new Error("チームデータの形式が対応していません");
    }
    return { teams: data.items, updatedAt: data.updatedAt };
  });
  return teamsPromise;
}

export function loadPlayers() {
  playersPromise ??= Promise.all([
    fetchJson(PLAYERS_URL, "選手データ"),
    fetchJson(I_LEAGUE_PLAYERS_URL, "Iリーグ選手データ"),
  ]).then(([data, iLeagueData]) => {
    if (data.schemaVersion !== 3 || !Array.isArray(data.items)) {
      throw new Error("選手データの形式が対応していません");
    }
    if (iLeagueData.schemaVersion !== 1 || !Array.isArray(iLeagueData.items)) {
      throw new Error("Iリーグ選手データの形式が対応していません");
    }
    return {
      players: [...data.items, ...iLeagueData.items],
      updatedAt: [data.updatedAt, iLeagueData.updatedAt].filter(Boolean).sort().at(-1),
      playerCounts: { regular: data.items.length, iLeague: iLeagueData.items.length },
    };
  });
  return playersPromise;
}

export function loadTeamCatalog() {
  teamCatalogPromise ??= fetchJson(TEAM_CATALOG_URL, "チーム一覧データ").then((data) => {
    if (data.schemaVersion !== 1 || !Array.isArray(data.items)) {
      throw new Error("チーム一覧データの形式が対応していません");
    }
    return data.items;
  });
  return teamCatalogPromise;
}
