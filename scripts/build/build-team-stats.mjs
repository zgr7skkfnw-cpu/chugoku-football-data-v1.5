import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PLAYERS_PATH = resolve(ROOT, "site/data/players.json");
const TEAM_CATALOG_PATH = resolve(ROOT, "site/data/team-catalog.json");
const PERIODS = ["all", "first", "second"];

export async function buildTeamStats({ season = 2026, division = 1 } = {}) {
  const seasonPath = resolve(ROOT, `site/data/seasons/${season}/season.json`);
  const [seasonData, catalogData, playersData] = await Promise.all([
    readJson(seasonPath),
    readJson(TEAM_CATALOG_PATH),
    season === 2026 ? readJson(PLAYERS_PATH) : Promise.resolve({ items: [] }),
  ]);
  const competition = seasonData.competitions.find((entry) => entry.division === division && entry.stage === "regular");
  if (!competition?.matches || !competition?.teamStats) throw new Error(`${division}部の大会設定が見つかりません`);
  const matchesPath = resolve(dirname(seasonPath), competition.matches);
  const outputPath = resolve(dirname(seasonPath), competition.teamStats);
  const matchesData = await readJson(matchesPath);
  const catalogById = new Map((catalogData.items ?? []).map((team) => [team.id, team]));
  const teams = competition.teamIds.map((teamId) => catalogById.get(teamId)).filter(Boolean);
  const teamByName = new Map();
  for (const team of teams) {
    for (const name of [team.name, ...(team.aliases ?? [])]) teamByName.set(name, team);
  }
  const playerByTeamAndName = new Map(
    playersData.items.map((player) => [playerKey(player.teamId, player.name), player]),
  );
  const finishedMatches = matchesData.items
    .filter((match) => match.status === "finished")
    .map((match) => linkMatch(match, teamByName))
    .filter((match) => match.homeTeam.teamId && match.awayTeam.teamId);

  const periods = Object.fromEntries(
    PERIODS.map((period) => {
      const matches = finishedMatches.filter((match) => matchPeriodMatches(match, period, competition.periodRules));
      const progression = calculateRankProgression(matches, teams);
      const standings = withRankChanges(calculateStandings(matches, teams), progression);
      const homeStandings = calculateStandings(matches, teams, "home");
      const awayStandings = calculateStandings(matches, teams, "away");
      const teamEntries = teams.map((team) => {
        const teamMatches = matches.filter((match) => includesTeam(match, team.id));
        return {
          teamId: team.id,
          rank: standings.find((row) => row.teamId === team.id)?.rank ?? null,
          overall: calculateRecord(team.id, teamMatches),
          home: calculateRecord(team.id, teamMatches, "home"),
          away: calculateRecord(team.id, teamMatches, "away"),
          form: calculateForm(team.id, teamMatches),
          stats: calculateExtraStats(team.id, teamMatches, playerByTeamAndName),
          rankProgression: progression.get(team.id) ?? [],
        };
      });
      return [period, { standings, homeStandings, awayStandings, teams: teamEntries, rankings: createTeamRankings(teamEntries) }];
    }),
  );

  const output = {
    schemaVersion: 1,
    seasonId: matchesData.seasonId,
    updatedAt: matchesData.updatedAt,
    competitionId: competition.id,
    division,
    periodRules: competition.periodRules,
    periods,
  };
  await writeJsonAtomic(outputPath, output);
  console.log(`チーム分析JSON保存: ${outputPath}`);
  console.log(`対象: ${season}年度 ${division}部 / ${teams.length}チーム / ${finishedMatches.length}試合`);
  return output;
}

function linkMatch(match, teamByName) {
  return {
    ...match,
    homeTeam: { ...match.homeTeam, teamId: teamByName.get(match.homeTeam.name)?.id ?? null },
    awayTeam: { ...match.awayTeam, teamId: teamByName.get(match.awayTeam.name)?.id ?? null },
  };
}

function matchPeriodMatches(match, period, periodRules) {
  if (period === "all") return true;
  const round = Number(match.round);
  const rules = periodRules?.[period];
  return Number.isFinite(round) && round >= rules.fromRound && round <= rules.toRound;
}

function includesTeam(match, teamId) {
  return match.homeTeam.teamId === teamId || match.awayTeam.teamId === teamId;
}

function calculateRecord(teamId, matches, sideFilter = null) {
  const record = { played: 0, won: 0, drawn: 0, lost: 0, points: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 };
  for (const match of matches) {
    const side = match.homeTeam.teamId === teamId ? "home" : "away";
    if (sideFilter && side !== sideFilter) continue;
    const own = side === "home" ? match.homeTeam.score : match.awayTeam.score;
    const opponent = side === "home" ? match.awayTeam.score : match.homeTeam.score;
    record.played += 1;
    record.goalsFor += own;
    record.goalsAgainst += opponent;
    if (own > opponent) { record.won += 1; record.points += 3; }
    else if (own < opponent) record.lost += 1;
    else { record.drawn += 1; record.points += 1; }
  }
  record.goalDifference = record.goalsFor - record.goalsAgainst;
  return record;
}

function calculateStandings(matches, teams, sideFilter = null) {
  return teams
    .map((team) => ({ teamId: team.id, ...calculateRecord(team.id, matches.filter((match) => includesTeam(match, team.id)), sideFilter) }))
    .sort((left, right) => right.points - left.points || right.goalDifference - left.goalDifference || right.goalsFor - left.goalsFor || left.teamId.localeCompare(right.teamId))
    .map((row, index) => ({ ...row, rank: row.played ? index + 1 : null }));
}

function withRankChanges(standings, progression) {
  return standings.map((row) => {
    const history = progression.get(row.teamId) ?? [];
    const previous = history.at(-2)?.rank ?? null;
    return { ...row, rankChange: row.rank && previous ? previous - row.rank : null };
  });
}

function calculateRankProgression(matches, teams) {
  const rounds = [...new Set(matches.map((match) => Number(match.round)).filter(Number.isInteger))].sort((a, b) => a - b);
  const result = new Map(teams.map((team) => [team.id, []]));
  for (const round of rounds) {
    const table = calculateStandings(matches.filter((match) => Number(match.round) <= round), teams);
    for (const row of table) {
      if (row.played) result.get(row.teamId).push({ round, rank: row.rank });
    }
  }
  return result;
}

function calculateForm(teamId, matches) {
  return [...matches]
    .sort((left, right) => new Date(right.kickoffAt) - new Date(left.kickoffAt))
    .slice(0, 5)
    .map((match) => {
      const side = match.homeTeam.teamId === teamId ? "home" : "away";
      const own = side === "home" ? match.homeTeam.score : match.awayTeam.score;
      const opponent = side === "home" ? match.awayTeam.score : match.homeTeam.score;
      const opponentTeam = side === "home" ? match.awayTeam : match.homeTeam;
      return { matchId: match.id, kickoffAt: match.kickoffAt, round: match.round, period: Number(match.round) <= 9 ? "first" : "second", side, opponentTeamId: opponentTeam.teamId, opponentName: opponentTeam.name, goalsFor: own, goalsAgainst: opponent, result: own > opponent ? "W" : own < opponent ? "L" : "D" };
    });
}

function calculateExtraStats(teamId, matches, playerDirectory) {
  let cleanSheets = 0;
  let scorelessMatches = 0;
  let yellowCards = 0;
  let redCards = 0;
  let benchSelections = 0;
  const ages = [];
  for (const match of matches) {
    const side = match.homeTeam.teamId === teamId ? "home" : "away";
    const own = side === "home" ? match.homeTeam.score : match.awayTeam.score;
    const against = side === "home" ? match.awayTeam.score : match.homeTeam.score;
    if (against === 0) cleanSheets += 1;
    if (own === 0) scorelessMatches += 1;
    for (const entry of match.disciplinary?.[side] ?? []) {
      const code = String(entry).match(/\s(C[1-9]|CS|S[1-9])(?:\s|$)/)?.[1];
      if (/^C[1-9]$/.test(code ?? "")) yellowCards += 1;
      if (code === "CS" || /^S[1-9]$/.test(code ?? "")) redCards += 1;
    }
    const lineup = match.lineups?.[side];
    benchSelections += lineup?.substitutes?.length ?? 0;
    for (const starter of lineup?.starters ?? []) {
      const player = playerDirectory.get(playerKey(teamId, starter.name));
      const age = player?.birth ? ageAt(player.birth, match.kickoffAt) : null;
      if (age !== null) ages.push(age);
    }
  }
  const record = calculateRecord(teamId, matches);
  return {
    averageGoals: average(record.goalsFor, record.played),
    averageConceded: average(record.goalsAgainst, record.played),
    cleanSheets,
    scorelessMatches,
    yellowCards,
    redCards,
    benchSelections,
    averageBench: average(benchSelections, record.played),
    averageStartingAge: ages.length ? round(ages.reduce((sum, age) => sum + age, 0) / ages.length) : null,
  };
}

function createTeamRankings(teamEntries) {
  const metrics = ["averageGoals", "averageConceded", "cleanSheets", "scorelessMatches", "yellowCards", "redCards", "benchSelections", "averageBench", "averageStartingAge"];
  return Object.fromEntries(metrics.map((metric) => [metric, teamEntries
    .filter((entry) => entry.stats[metric] !== null)
    .sort((left, right) => right.stats[metric] - left.stats[metric] || left.teamId.localeCompare(right.teamId))
    .map((entry, index) => ({ rank: index + 1, teamId: entry.teamId, value: entry.stats[metric] }))]));
}

function normalizeName(value) { return String(value ?? "").normalize("NFKC").replace(/\s*\[Cap\]\s*$/i, "").replace(/[\s　]+/g, ""); }
function playerKey(teamId, name) { return `${teamId}\0${normalizeName(name)}`; }
function ageAt(birth, date) { const born = new Date(`${birth}T00:00:00+09:00`); const played = new Date(date); if (Number.isNaN(born.valueOf()) || Number.isNaN(played.valueOf())) return null; return (played - born) / 31_556_952_000; }
function average(total, count) { return count ? round(total / count) : 0; }
function round(value) { return Math.round(value * 100) / 100; }
async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
async function writeJsonAtomic(path, data) { await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.tmp`; await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8"); await rename(temporary, path); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const division = Number(process.argv.find((argument) => argument.startsWith("--division="))?.split("=")[1] ?? 1);
  const season = Number(process.argv.find((argument) => argument.startsWith("--season="))?.split("=")[1] ?? 2026);
  await buildTeamStats({ season, division });
}
