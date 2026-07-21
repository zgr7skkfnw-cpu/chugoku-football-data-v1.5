import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SEASONS_PATH = resolve(ROOT, "site/data/seasons");
const TEAM_CATALOG_PATH = resolve(ROOT, "site/data/team-catalog.json");
const OUTPUT_PATH = resolve(ROOT, "site/data/head-to-head.json");

export async function buildHeadToHead() {
  const catalog = await readJson(TEAM_CATALOG_PATH);
  const teamIndexes = createTeamNameIndexes(catalog.items ?? []);
  const seasonDirectories = (await readdir(SEASONS_PATH, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))
    .sort((left, right) => Number(left.name) - Number(right.name));
  const games = [];
  const sources = [];

  for (const directory of seasonDirectories) {
    const seasonPath = resolve(SEASONS_PATH, directory.name);
    let manifest;
    try {
      manifest = await readJson(resolve(seasonPath, "season.json"));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }

    for (const competition of manifest.competitions ?? []) {
      if (!competition.matches) continue;
      let matchData;
      try {
        matchData = await readJson(resolve(seasonPath, competition.matches));
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }

      let accepted = 0;
      for (const match of matchData.items ?? []) {
        if (match.status !== "finished") continue;
        const homeTeamId = resolveTeamId(teamIndexes, competition.id, match.homeTeam?.name);
        const awayTeamId = resolveTeamId(teamIndexes, competition.id, match.awayTeam?.name);
        if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) continue;
        games.push(createGame(match, manifest, competition, homeTeamId, awayTeamId));
        accepted += 1;
      }
      sources.push({
        season: manifest.season,
        competitionId: competition.id,
        leagueName: competition.leagueName ?? competition.name,
        stageId: competition.stage,
        stageName: competition.stageName ?? competition.stage,
        matchCount: accepted,
      });
    }
  }

  let output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceSeasons: [...new Set(sources.map((source) => source.season))],
    sources,
    matchCount: games.length,
    items: aggregateGames(games, catalog.items ?? []),
  };
  try {
    const previous = await readJson(OUTPUT_PATH);
    const { generatedAt: previousGeneratedAt, ...previousContent } = previous;
    const { generatedAt: _nextGeneratedAt, ...nextContent } = output;
    if (JSON.stringify(previousContent) === JSON.stringify(nextContent)) {
      output = { ...output, generatedAt: previousGeneratedAt };
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeJsonAtomic(OUTPUT_PATH, output);
  console.log(`対戦成績JSON保存: ${OUTPUT_PATH}`);
  console.log(`対象: ${sources.length}大会 / ${games.length}試合`);
  return output;
}

function createGame(match, manifest, competition, homeTeamId, awayTeamId) {
  const round = Number(match.round);
  const firstToRound = Number(competition.periodRules?.first?.toRound);
  return {
    matchId: match.id,
    season: manifest.season,
    competitionId: competition.id,
    leagueName: competition.leagueName ?? competition.name,
    stageId: competition.stage,
    stageName: competition.stageName ?? competition.stage,
    kickoffAt: match.kickoffAt,
    round: match.round,
    period: Number.isFinite(firstToRound) && Number.isFinite(round)
      ? (round <= firstToRound ? "first" : "second")
      : null,
    homeTeamId,
    awayTeamId,
    homeScore: Number(match.homeTeam.score),
    awayScore: Number(match.awayTeam.score),
  };
}

function aggregateGames(games, teams) {
  const byTeam = new Map(teams.map((team) => [team.id, new Map()]));
  for (const game of games) {
    addPerspective(byTeam, game, game.homeTeamId, game.awayTeamId, "home", game.homeScore, game.awayScore);
    addPerspective(byTeam, game, game.awayTeamId, game.homeTeamId, "away", game.awayScore, game.homeScore);
  }
  return teams.map((team) => ({
    teamId: team.id,
    opponents: [...byTeam.get(team.id).entries()].map(([opponentTeamId, matches]) => {
      const sorted = matches.sort((left, right) => new Date(right.kickoffAt) - new Date(left.kickoffAt));
      return {
        opponentTeamId,
        played: sorted.length,
        won: sorted.filter((match) => match.result === "W").length,
        drawn: sorted.filter((match) => match.result === "D").length,
        lost: sorted.filter((match) => match.result === "L").length,
        goalsFor: sorted.reduce((sum, match) => sum + match.goalsFor, 0),
        goalsAgainst: sorted.reduce((sum, match) => sum + match.goalsAgainst, 0),
        matches: sorted,
      };
    }).sort((left, right) => left.opponentTeamId.localeCompare(right.opponentTeamId)),
  }));
}

function addPerspective(byTeam, game, teamId, opponentTeamId, side, goalsFor, goalsAgainst) {
  const opponents = byTeam.get(teamId);
  if (!opponents) return;
  if (!opponents.has(opponentTeamId)) opponents.set(opponentTeamId, []);
  opponents.get(opponentTeamId).push({
    matchId: game.matchId,
    season: game.season,
    competitionId: game.competitionId,
    leagueName: game.leagueName,
    stageId: game.stageId,
    stageName: game.stageName,
    kickoffAt: game.kickoffAt,
    round: game.round,
    period: game.period,
    side,
    goalsFor,
    goalsAgainst,
    result: goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "D",
  });
}

function createTeamNameIndexes(teams) {
  const global = new Map();
  const byCompetition = new Map();
  for (const team of teams) {
    const index = team.competitionId ? byCompetition : global;
    for (const name of [team.name, ...(team.aliases ?? [])]) {
      const key = team.competitionId
        ? `${team.competitionId}\0${normalizeName(name)}`
        : normalizeName(name);
      index.set(key, team.id);
    }
  }
  return { global, byCompetition };
}

function resolveTeamId(indexes, competitionId, name) {
  return indexes.byCompetition.get(`${competitionId}\0${normalizeName(name)}`)
    ?? indexes.global.get(normalizeName(name));
}

function normalizeName(value) {
  return String(value ?? "").normalize("NFKC").replace(/[\s　]+/g, "");
}

async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
async function writeJsonAtomic(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildHeadToHead();
