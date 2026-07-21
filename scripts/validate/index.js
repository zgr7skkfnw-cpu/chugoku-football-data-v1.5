import { readFile } from "node:fs/promises";
import { calculatePlayerStatistics, createPlayerDirectory, getPlayer } from "../../site/assets/js/utils/players.js";
import { createTeamDirectory, linkMatchesToTeams } from "../../site/assets/js/utils/teams.js";

const PLAYER_KEYS = [
  "id",
  "teamId",
  "name",
  "englishName",
  "number",
  "position",
  "grade",
  "height",
  "weight",
  "birth",
  "hometown",
  "previousTeam",
];

const [teamsData, playersData, matchesData, teamStatsData, teamCatalogData, venueCatalogData, seasonData, division2MatchesData, division2TeamStatsData, iLeague1MatchesData, iLeague2MatchesData, iLeague1StatsData, iLeague2StatsData, headToHeadData, seasonIndexData, season2025Data, matches2025Division1, matches2025Division2, matches2025Playoff, matches2025Relegation, stats2025Division1, stats2025Division2] = await Promise.all([
  readJson("site/data/teams.json"),
  readJson("site/data/players.json"),
  readJson("site/data/seasons/2026/matches.json"),
  readJson("site/data/seasons/2026/team-stats.json"),
  readJson("site/data/team-catalog.json"),
  readJson("site/data/venue-catalog.json"),
  readJson("site/data/seasons/2026/season.json"),
  readJson("site/data/seasons/2026/div2/matches.json"),
  readJson("site/data/seasons/2026/div2/team-stats.json"),
  readJson("site/data/seasons/2026/i-league/div1/matches.json"),
  readJson("site/data/seasons/2026/i-league/div2/matches.json"),
  readJson("site/data/seasons/2026/i-league/div1/team-stats.json"),
  readJson("site/data/seasons/2026/i-league/div2/team-stats.json"),
  readJson("site/data/head-to-head.json"),
  readJson("site/data/seasons/index.json"),
  readJson("site/data/seasons/2025/season.json"),
  readJson("site/data/seasons/2025/matches.json"),
  readJson("site/data/seasons/2025/div2/matches.json"),
  readJson("site/data/seasons/2025/div2/playoff/matches.json"),
  readJson("site/data/seasons/2025/promotion-relegation/matches.json"),
  readJson("site/data/seasons/2025/team-stats.json"),
  readJson("site/data/seasons/2025/div2/team-stats.json"),
]);

const errors = [];
const teams = teamsData.items ?? [];
const players = playersData.items ?? [];
const teamCatalog = teamCatalogData.items ?? [];
const profilesById = new Map(teams.map((team) => [team.id, team]));
const teamDirectory = createTeamDirectory(teamCatalog.map((team) => ({ ...team, ...(profilesById.get(team.id) ?? {}) })));
const playerDirectory = createPlayerDirectory(players);
const matches = linkMatchesToTeams(matchesData.items ?? [], teamDirectory);
const catalogIds = new Set(teamCatalog.map((team) => team.id));
const catalogNames = new Map();
const competitionTeamNames = new Map();
const division2TeamIds = new Set(seasonData.competitions.find((competition) => competition.division === 2 && competition.stage === "regular")?.teamIds ?? []);
const expectedDivision2Emblems = new Set([...division2TeamIds].filter((teamId) => teamId !== "university-of-shimane"));

for (const team of teamCatalog) {
  if (team.competitionId) {
    const key = `${team.competitionId}\0${team.name}`;
    if (competitionTeamNames.has(key)) errors.push(`${key}: duplicate competition team name`);
    competitionTeamNames.set(key, team.id);
    if (!catalogIds.has(team.parentClubId)) errors.push(`${team.id}: unknown parentClubId ${team.parentClubId}`);
    continue;
  }
  for (const name of [team.name, ...(team.aliases ?? [])]) {
    if (catalogNames.has(name) && catalogNames.get(name) !== team.id) {
      errors.push(`${name}: duplicate team catalog name`);
    }
    catalogNames.set(name, team.id);
  }
  if (expectedDivision2Emblems.has(team.id)) {
    if (!team.emblem) {
      errors.push(`${team.id}: division 2 emblem is missing`);
    } else {
      try {
        await readFile(new URL(`../../site${team.emblem}`, import.meta.url));
      } catch {
        errors.push(`${team.id}: emblem file does not exist at ${team.emblem}`);
      }
    }
    if (team.kits) errors.push(`${team.id}: division 2 mini kits must not be registered`);
  }
}

if (teamCatalogData.schemaVersion !== 1) errors.push("team-catalog.json schemaVersion must be 1");
if (catalogIds.size !== teamCatalog.length) errors.push("team-catalog.json contains duplicate team ids");
if (venueCatalogData.schemaVersion !== 1) errors.push("venue-catalog.json schemaVersion must be 1");
if (venueCatalogData.displayNameStrategy !== "source") {
  errors.push("venue-catalog.json must preserve source display names");
}
const venueIds = new Set();
const venueNames = new Set();
for (const venue of venueCatalogData.items ?? []) {
  if (venueIds.has(venue.id)) errors.push(`${venue.id}: duplicate venue id`);
  venueIds.add(venue.id);
  for (const name of [venue.name, ...(venue.aliases ?? [])]) {
    if (venueNames.has(name)) errors.push(`${name}: duplicate venue name or alias`);
    venueNames.add(name);
  }
}
if (seasonData.schemaVersion !== 1 || seasonData.season !== 2026) {
  errors.push("season.json must describe season 2026 with schemaVersion 1");
}
if (seasonData.regulations?.division1?.teamCount !== 10) {
  errors.push("season.json division 1 team count must be 10");
}
if (seasonData.regulations?.division2?.teamCount !== 11) {
  errors.push("season.json division 2 team count must be 11");
}

if (seasonIndexData.schemaVersion !== 1 || seasonIndexData.defaultSeason !== 2026) {
  errors.push("seasons/index.json must use schemaVersion 1 and default to 2026");
}
if ((seasonIndexData.items ?? []).map((item) => item.season).join(",") !== "2026,2025,2024") {
  errors.push("seasons/index.json must list 2026, 2025 and 2024 in descending order");
}
if (season2025Data.schemaVersion !== 1 || season2025Data.season !== 2025) {
  errors.push("2025/season.json must describe season 2025 with schemaVersion 1");
}
for (const competition of season2025Data.competitions ?? []) {
  for (const teamId of competition.teamIds ?? []) {
    if (!catalogIds.has(teamId)) errors.push(`${competition.id}: unknown catalog teamId ${teamId}`);
  }
}
const historicalCounts = [
  ["2025 division 1", matches2025Division1, 90],
  ["2025 division 2", matches2025Division2, 90],
  ["2025 division 2 playoff", matches2025Playoff, 3],
  ["2025 promotion/relegation", matches2025Relegation, 2],
];
for (const [label, data, expected] of historicalCounts) {
  if (data.schemaVersion !== 1 || data.items?.length !== expected) {
    errors.push(`${label}: expected ${expected} matches`);
  }
  for (const match of data.items ?? []) {
    for (const teamName of [match.homeTeam?.name, match.awayTeam?.name]) {
      if (!catalogNames.has(teamName)) errors.push(`${match.id}: unknown historical team ${teamName}`);
    }
  }
}
for (const [label, data] of [["2025 division 1", stats2025Division1], ["2025 division 2", stats2025Division2]]) {
  if (data.schemaVersion !== 1 || data.periods?.all?.standings?.length !== 10) {
    errors.push(`${label} team stats must contain 10 standings rows`);
  }
}
if ((seasonData.regulations?.division1?.automaticRelegationPositions ?? []).length !== 0) {
  errors.push("season.json division 1 must not have automatic relegation in 2026");
}
if ((seasonData.regulations?.division2?.automaticPromotionPositions ?? []).join(",") !== "1,2,3") {
  errors.push("season.json division 2 automatic promotion positions must be 1,2,3");
}
if ((seasonData.regulations?.division2?.promotionPlayoffPositions ?? []).join(",") !== "4,5,6") {
  errors.push("season.json division 2 promotion playoff positions must be 4,5,6");
}

for (const competition of seasonData.competitions ?? []) {
  for (const teamId of competition.teamIds ?? []) {
    if (!catalogIds.has(teamId)) errors.push(`${competition.id}: unknown catalog teamId ${teamId}`);
  }
}

for (const match of division2MatchesData.items ?? []) {
  for (const teamName of [match.homeTeam?.name, match.awayTeam?.name]) {
    if (!catalogNames.has(teamName)) errors.push(`${match.id}: unknown division 2 team ${teamName}`);
  }
}

if (division2MatchesData.seasonId !== "jufa-chugoku-2026-division-2") {
  errors.push("division 2 matches seasonId mismatch");
}

const iLeagueChecks = [
  ["jufa-chugoku-2026-i-league-division-1", iLeague1MatchesData, iLeague1StatsData, 28, 8],
  ["jufa-chugoku-2026-i-league-division-2", iLeague2MatchesData, iLeague2StatsData, 15, 6],
];
const allMatchIds = new Set([...matchesData.items, ...division2MatchesData.items].map((match) => match.id));
for (const [competitionId, matchData, statsData, expectedMatches, expectedTeams] of iLeagueChecks) {
  if (matchData.seasonId !== competitionId || matchData.items?.length !== expectedMatches) {
    errors.push(`${competitionId}: expected ${expectedMatches} matches`);
  }
  const competition = seasonData.competitions.find((entry) => entry.id === competitionId);
  const teamIds = new Set(competition?.teamIds ?? []);
  if (teamIds.size !== expectedTeams) errors.push(`${competitionId}: expected ${expectedTeams} unique teamIds`);
  const linked = linkMatchesToTeams(matchData.items ?? [], teamDirectory);
  for (const match of linked) {
    if (allMatchIds.has(match.id)) errors.push(`${match.id}: match id collides across competitions`);
    allMatchIds.add(match.id);
    if (!teamIds.has(match.homeTeam.teamId) || !teamIds.has(match.awayTeam.teamId)) {
      errors.push(`${match.id}: I-league team does not resolve inside ${competitionId}`);
    }
  }
  if (statsData.competitionId !== competitionId || statsData.periods?.all?.standings?.length !== expectedTeams) {
    errors.push(`${competitionId}: team-stats mismatch`);
  }
  const finishedCount = (matchData.items ?? []).filter((match) => match.status === "finished").length;
  const statsPlayed = (statsData.periods?.all?.standings ?? []).reduce((sum, row) => sum + row.played, 0) / 2;
  if (statsPlayed !== finishedCount) errors.push(`${competitionId}: team-stats match count mismatch`);
}

if (teamStatsData.schemaVersion !== 1) errors.push("team-stats.json schemaVersion must be 1");
if (division2TeamStatsData.schemaVersion !== 1 || division2TeamStatsData.division !== 2) {
  errors.push("division 2 team-stats.json schemaVersion or division is invalid");
}
if (headToHeadData.schemaVersion !== 1 || !Array.isArray(headToHeadData.items)) {
  errors.push("head-to-head.json schemaVersion or items is invalid");
}
for (const source of headToHeadData.sources ?? []) {
  if (!source.leagueName || !source.stageId || !source.stageName) {
    errors.push(`${source.competitionId}: head-to-head source labels are incomplete`);
  }
}
for (const team of headToHeadData.items ?? []) {
  for (const opponent of team.opponents ?? []) {
    for (const match of opponent.matches ?? []) {
      if (!match.kickoffAt || !match.season || !match.leagueName || !match.stageId || !match.stageName) {
        errors.push(`${match.matchId}: head-to-head match context is incomplete`);
      }
    }
  }
}
for (const period of ["all", "first", "second"]) {
  const periodData = teamStatsData.periods?.[period];
  if (periodData?.teams?.length !== teams.length) errors.push(`${period}: team stats count mismatch`);
  if (periodData?.standings?.length !== teams.length) errors.push(`${period}: standings count mismatch`);
  if (periodData?.homeStandings?.length !== teams.length) errors.push(`${period}: home standings count mismatch`);
  if (periodData?.awayStandings?.length !== teams.length) errors.push(`${period}: away standings count mismatch`);
}
for (const period of ["all", "first", "second"]) {
  const periodData = division2TeamStatsData.periods?.[period];
  if (periodData?.teams?.length !== 11) errors.push(`${period}: division 2 team stats count mismatch`);
  if (periodData?.standings?.length !== 11) errors.push(`${period}: division 2 standings count mismatch`);
  if (periodData?.homeStandings?.length !== 11) errors.push(`${period}: division 2 home standings count mismatch`);
  if (periodData?.awayStandings?.length !== 11) errors.push(`${period}: division 2 away standings count mismatch`);
}

if (playersData.schemaVersion !== 3) {
  errors.push(`players.json schemaVersion: expected 3, got ${playersData.schemaVersion}`);
}

const playerIds = new Set();
for (const player of players) {
  const actualKeys = Object.keys(player);
  if (actualKeys.join("|") !== PLAYER_KEYS.join("|")) {
    errors.push(`${player.id ?? player.name}: player fields do not match the schema`);
  }
  if (playerIds.has(player.id)) errors.push(`${player.id}: duplicate player id`);
  playerIds.add(player.id);
  if (!teamDirectory.byId.has(player.teamId)) {
    errors.push(`${player.id}: unknown teamId ${player.teamId}`);
  }
  if (player.grade !== null && ![1, 2, 3, 4].includes(player.grade)) {
    errors.push(`${player.id}: invalid inferred grade ${player.grade}`);
  }
  if (typeof player.englishName !== "string") {
    errors.push(`${player.id}: englishName must be a string`);
  }
}

let unresolvedLineupPlayers = 0;
for (const match of matches) {
  for (const side of ["home", "away"]) {
    const lineup = match.lineups?.[side];
    if (!lineup) continue;
    for (const entry of [...(lineup.starters ?? []), ...(lineup.substitutes ?? [])]) {
      if (!getPlayer(playerDirectory, entry.name, lineup.teamId)) {
        unresolvedLineupPlayers += 1;
        errors.push(`${match.id}: unresolved ${side} player ${entry.name}`);
      }
    }
  }
}

const statistics = calculatePlayerStatistics(players, matches, teamDirectory);
const statKeys = [
  "appearances",
  "starts",
  "minutes",
  "goals",
  "assists",
  "yellowCards",
  "redCards",
  "benchSelections",
  "substitutionsOn",
  "substitutionsOff",
  "fullAppearances",
  "cleanSheets",
];
for (const stats of statistics.values()) {
  if (stats.minutes < 0 || !Number.isInteger(stats.minutes)) {
    errors.push(`${stats.player.id}: invalid playing time ${stats.minutes}`);
  }
  for (const key of statKeys) {
    if (stats[key] !== stats.periods.first[key] + stats.periods.second[key]) {
      errors.push(`${stats.player.id}: ${key} period totals do not match`);
    }
  }
}

const officialBenchRegistrations = matches.reduce(
  (total, match) =>
    total +
    (match.lineups?.home?.substitutes?.length ?? 0) +
    (match.lineups?.away?.substitutes?.length ?? 0),
  0,
);
const calculatedBenchRegistrations = [...statistics.values()].reduce(
  (total, stats) => total + stats.benchSelections,
  0,
);
const storedBenchRegistrations = teamStatsData.periods?.all?.teams?.reduce(
  (total, team) => total + team.stats.benchSelections,
  0,
);
if (officialBenchRegistrations !== calculatedBenchRegistrations) {
  errors.push(
    `bench registrations: expected ${officialBenchRegistrations}, got ${calculatedBenchRegistrations}`,
  );
}
if (officialBenchRegistrations !== storedBenchRegistrations) {
  errors.push(`team-stats bench registrations: expected ${officialBenchRegistrations}, got ${storedBenchRegistrations}`);
}

if (errors.length) {
  console.error(`Data validation failed (${errors.length} errors)`);
  for (const error of errors.slice(0, 30)) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const inferredGrades = players.filter((player) => player.grade !== null).length;
  console.log("Data validation passed");
  console.log(`Teams: ${teams.length}`);
  console.log(`Players: ${players.length}`);
  console.log(`Inferred grades: ${inferredGrades}`);
  console.log(`Matches: ${matches.length}`);
  console.log(`Team catalog: ${teamCatalog.length}`);
  console.log(`Venue catalog: ${(venueCatalogData.items ?? []).length}`);
  console.log(`Division 2 matches: ${(division2MatchesData.items ?? []).length}`);
  console.log(`I-League division 1 matches: ${(iLeague1MatchesData.items ?? []).length}`);
  console.log(`I-League division 2 matches: ${(iLeague2MatchesData.items ?? []).length}`);
  console.log(`Division 2 emblems: ${expectedDivision2Emblems.size}/${division2TeamIds.size}`);
  console.log(`Historical matches (2025): ${historicalCounts.reduce((sum, [, data]) => sum + data.items.length, 0)}`);
  console.log(`Bench registrations: ${calculatedBenchRegistrations}`);
  console.log(`Unresolved lineup players: ${unresolvedLineupPlayers}`);
}

async function readJson(path) {
  return JSON.parse(await readFile(new URL(`../../${path}`, import.meta.url), "utf8"));
}
