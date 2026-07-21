import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { request } from "playwright";
import * as cheerio from "cheerio";
import { auditRoster, createPlayerId, findRosterDuplicates, normalizePlayerName } from "./player-roster-utils.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const PLAYERS_PATH = resolve(ROOT, "site/data/seasons/2026/i-league/players.json");
const AUDIT_PATH = resolve(ROOT, "reports/player-audit-i-league.json");
const MATCH_PATHS = [
  resolve(ROOT, "site/data/seasons/2026/i-league/div1/matches.json"),
  resolve(ROOT, "site/data/seasons/2026/i-league/div2/matches.json"),
];
const WAIT_MS = 500;
const MINIMUM_TOTAL = 140;
const COMPETITION_1 = "jufa-chugoku-2026-i-league-division-1";
const COMPETITION_2 = "jufa-chugoku-2026-i-league-division-2";
const SPECS = [
  ["i-league-2026-ipu-a", "IPU・環太平洋大学A", "ipu", COMPETITION_1, 624],
  ["i-league-2026-fukuyama-a", "福山大学A", "fukuyama", COMPETITION_1, 621],
  ["i-league-2026-hue-a", "広島経済大学A", "hiroshima-keizai", COMPETITION_1, 635],
  ["i-league-2026-hiroshima-a", "広島大学A", "hiroshima", COMPETITION_1, 631],
  ["i-league-2026-shudo", "広島修道大学", "hiroshima-shudo", COMPETITION_1, 638],
  ["i-league-2026-hbg", "広島文化学園大学", "hiroshima-bunka-gakuen", COMPETITION_1, 658],
  ["i-league-2026-heisei", "福山平成大学", "fukuyama-heisei", COMPETITION_1, 640],
  ["i-league-2026-ous", "岡山理科大学", "okayama-science", COMPETITION_1, 810],
  ["i-league-2026-ipu-b", "IPU・環太平洋大学B", "ipu", COMPETITION_2, 660],
  ["i-league-2026-ipu-d", "IPU・環太平洋大学D", "ipu", COMPETITION_2, 627],
  ["i-league-2026-hue-b", "広島経済大学B", "hiroshima-keizai", COMPETITION_2, 636],
  ["i-league-2026-fukuyama-b", "福山大学B", "fukuyama", COMPETITION_2, 622],
  ["i-league-2026-ipu-c", "IPU・環太平洋大学C", "ipu", COMPETITION_2, 626],
  ["i-league-2026-hiroshima-b", "広島大学B", "hiroshima", COMPETITION_2, 632],
].map(([teamId, teamName, parentClubId, competitionId, officialPageId]) => ({ teamId, teamName, parentClubId, competitionId, officialPageId }));

function cleanText(value) { return String(value ?? "").replace(/[\s　]+/g, " ").trim(); }
function cell($, row, selector) { const node = $(row).find(selector).first().clone(); node.find(".sp").remove(); return cleanText(node.text()); }
function integer(value) { const parsed = Number.parseInt(cleanText(value).replace(/[^0-9]/g, ""), 10); return Number.isInteger(parsed) ? parsed : null; }
function gradeFromBirth(birth) {
  if (!birth) return null;
  const [year, month, day] = birth.split("-").map(Number);
  if (![year, month, day].every(Number.isInteger)) return null;
  const cohort = month < 4 || (month === 4 && day === 1) ? year - 1 : year;
  const grade = 2026 - (cohort + 19) + 1;
  return grade >= 1 && grade <= 4 ? grade : null;
}

async function fetchRoster(api, spec) {
  const pageUrl = `https://jufa-chugoku.jp/team/${spec.officialPageId}.html`;
  const page = await api.get(pageUrl);
  if (!page.ok()) throw new Error(`${spec.teamName}チームページ取得失敗: HTTP ${page.status()}`);
  const $page = cheerio.load(await page.text());
  const iframeSource = $page("iframe.score_h04").attr("src");
  if (!iframeSource) throw new Error(`${spec.teamName}の登録情報URLがありません`);
  const registrationUrl = new URL(iframeSource, pageUrl).href;
  const response = await api.get(registrationUrl);
  if (!response.ok()) throw new Error(`${spec.teamName}登録情報取得失敗: HTTP ${response.status()}`);
  const $ = cheerio.load(await response.text());
  const players = [];
  $("table.team_info").eq(1).find("tr").each((_, row) => {
    const rawName = cell($, row, ".player_name");
    if (!rawName) return;
    const name = rawName.replace(/\s*\[Cap\]\s*$/i, "");
    const birth = cell($, row, ".player_birth").replaceAll(".", "-") || null;
    const id = createPlayerId(spec.teamId, name);
    players.push({
      id, registrationPlayerId: id, personId: null,
      competitionId: spec.competitionId, teamId: spec.teamId, parentClubId: spec.parentClubId,
      officialPageId: spec.officialPageId, name, normalizedName: normalizePlayerName(name),
      englishName: cell($, row, ".player_En_name") || "", number: integer(cell($, row, ".player_number")),
      position: cell($, row, ".player_position") || null, grade: gradeFromBirth(birth),
      birth, height: integer(cell($, row, ".player_height")), weight: integer(cell($, row, ".player_weight")),
      hometown: null, previousTeam: cell($, row, ".player_previous") || "",
    });
  });
  if (!players.length) throw new Error(`${spec.teamName}の公式登録が0人のため更新を停止します`);
  return { players, pageUrl, registrationUrl };
}

function findCrossTeamCandidates(players) {
  const groups = new Map();
  for (const player of players) {
    if (!groups.has(player.normalizedName)) groups.set(player.normalizedName, []);
    groups.get(player.normalizedName).push(player);
  }
  return [...groups.entries()].filter(([, entries]) => new Set(entries.map((entry) => entry.teamId)).size > 1)
    .map(([normalizedName, entries]) => ({ normalizedName, candidates: entries.map(({ id, name, teamId, competitionId, number, position, birth }) => ({ id, name, teamId, competitionId, number, position, birth })) }));
}

function auditEventPlayers(matches, players) {
  const roster = new Set(players.map((player) => `${player.teamId}\0${player.normalizedName}`));
  const teamIdByName = new Map(SPECS.map((spec) => [spec.teamName, spec.teamId]));
  const occurrences = [];
  const check = (match, teamId, name, eventType) => {
    if (!teamId || !name || cleanText(name) === "オウンゴール" || roster.has(`${teamId}\0${normalizePlayerName(name)}`)) return;
    occurrences.push({ matchId: match.id, teamId, name: cleanText(name), eventType });
  };
  for (const match of matches.filter((entry) => entry.status === "finished")) {
    for (const goal of match.goals ?? []) {
      const teamId = teamIdByName.get(goal.teamName);
      check(match, teamId, goal.scorerName, "goal");
      for (const name of goal.assistNames ?? []) check(match, teamId, name, "assist");
    }
    for (const side of ["home", "away"]) {
      const teamId = teamIdByName.get(match[`${side}Team`]?.name);
      for (const substitution of match.substitutions?.[side] ?? []) {
        check(match, teamId, substitution.match(/\[out\]([^[]+)/)?.[1], "substitution-out");
        check(match, teamId, substitution.match(/\[in\]([^[]+)/)?.[1], "substitution-in");
      }
      for (const disciplinary of match.disciplinary?.[side] ?? []) {
        const name = cleanText(disciplinary).replace(/^.*?\d+\s*分\s*/, "").split(/\s+C\d+\s+/)[0].replace(/\s*\[(?:yellow|red)\].*$/i, "");
        check(match, teamId, name, "disciplinary");
      }
    }
  }
  return {
    occurrences,
    players: [...new Map(occurrences.map((entry) => [`${entry.teamId}\0${normalizePlayerName(entry.name)}`, { teamId: entry.teamId, name: entry.name, eventTypes: new Set(), matchIds: new Set() }])).values()].map((entry) => {
      for (const occurrence of occurrences.filter((item) => item.teamId === entry.teamId && normalizePlayerName(item.name) === normalizePlayerName(entry.name))) {
        entry.eventTypes.add(occurrence.eventType); entry.matchIds.add(occurrence.matchId);
      }
      return { teamId: entry.teamId, name: entry.name, eventTypes: [...entry.eventTypes], matchIds: [...entry.matchIds] };
    }),
  };
}

await mkdir(resolve(PLAYERS_PATH, ".."), { recursive: true });
await mkdir(resolve(AUDIT_PATH, ".."), { recursive: true });
const backupDirectory = await mkdtemp(join(tmpdir(), "chugoku-i-league-roster-"));
let hadExistingPlayers = false;
try { await copyFile(PLAYERS_PATH, join(backupDirectory, "players.json")); hadExistingPlayers = true; } catch (error) { if (error.code !== "ENOENT") throw error; }
const playersTemporaryPath = `${PLAYERS_PATH}.tmp`;
const auditTemporaryPath = `${AUDIT_PATH}.tmp`;
const api = await request.newContext({ timeout: 30000, extraHTTPHeaders: { Accept: "text/html,application/xhtml+xml", "User-Agent": "ChugokuFootballData/1.0 (+i-league-roster-sync)" } });
try {
  const fetchedByTeam = new Map();
  const sources = [];
  for (const [index, spec] of SPECS.entries()) {
    if (index) await new Promise((resolveDelay) => setTimeout(resolveDelay, WAIT_MS));
    const result = await fetchRoster(api, spec);
    fetchedByTeam.set(spec.teamId, result.players);
    sources.push({ teamId: spec.teamId, teamName: spec.teamName, parentClubId: spec.parentClubId, competitionId: spec.competitionId, officialPageId: spec.officialPageId, pageUrl: result.pageUrl, registrationUrl: result.registrationUrl, count: result.players.length });
    console.log(`${spec.teamName}: ${result.players.length}人`);
  }
  const players = [...fetchedByTeam.values()].flat();
  if (players.length < MINIMUM_TOTAL) throw new Error(`Iリーグ登録人数が${players.length}人と極端に少ないため更新を停止します`);
  const duplicates = findRosterDuplicates(players);
  if (duplicates.length) throw new Error(`同一大会・同一チーム内の同姓同名候補が${duplicates.length}件あります`);
  if (hadExistingPlayers) {
    const existing = JSON.parse(await readFile(PLAYERS_PATH, "utf8"));
    for (const spec of SPECS) {
      const before = existing.items.filter((player) => player.teamId === spec.teamId).length;
      const after = fetchedByTeam.get(spec.teamId).length;
      if (before && after < Math.floor(before * 0.6)) throw new Error(`${spec.teamName}の登録人数が${before}人から${after}人へ急減したため更新を停止します`);
    }
  }
  const matches = (await Promise.all(MATCH_PATHS.map(async (path) => JSON.parse(await readFile(path, "utf8"))))).flatMap((data) => data.items);
  const targetTeamIds = new Set(SPECS.map((spec) => spec.teamId));
  const teamIdByName = new Map(SPECS.map((spec) => [spec.teamName, spec.teamId]));
  const audit = {
    ...auditRoster(matches, players, targetTeamIds, teamIdByName),
    source: "JUFA中国 2026年度Iリーグチーム登録",
    season: 2026, competitions: [COMPETITION_1, COMPETITION_2], sources,
    totalCount: players.length, crossTeamSameNameCandidates: findCrossTeamCandidates(players),
    eventPlayerAudit: auditEventPlayers(matches, players),
  };
  const updatedAt = new Date().toISOString();
  const output = { schemaVersion: 1, season: 2026, updatedAt, count: players.length, competitions: [COMPETITION_1, COMPETITION_2], items: players };
  await writeFile(playersTemporaryPath, `${JSON.stringify(output, null, 2)}\n`);
  await writeFile(auditTemporaryPath, `${JSON.stringify(audit, null, 2)}\n`);
  JSON.parse(await readFile(playersTemporaryPath, "utf8"));
  JSON.parse(await readFile(auditTemporaryPath, "utf8"));
  await rename(playersTemporaryPath, PLAYERS_PATH);
  await rename(auditTemporaryPath, AUDIT_PATH);
  console.log(`Iリーグ登録合計: ${players.length}人`);
  console.log(`名鑑未登録の試合選手: ${audit.missing.length}人 / ${audit.missingOccurrences.length}件`);
  console.log(`複数チーム間の同一氏名候補: ${audit.crossTeamSameNameCandidates.length}件`);
} catch (error) {
  if (hadExistingPlayers) await copyFile(join(backupDirectory, "players.json"), PLAYERS_PATH);
  throw error;
} finally {
  await api.dispose();
  await rm(playersTemporaryPath, { force: true });
  await rm(auditTemporaryPath, { force: true });
  await rm(backupDirectory, { recursive: true, force: true });
}
