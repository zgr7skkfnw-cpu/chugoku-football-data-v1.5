import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { request } from "playwright";
import * as cheerio from "cheerio";
import { auditRoster, createPlayerId, createRosterSnapshot, mergeDivisionPlayers, normalizePlayerName, rosterSnapshotChanged } from "./player-roster-utils.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const PLAYERS_PATH = resolve(ROOT, "site/data/players.json");
const MATCHES_PATH = resolve(ROOT, "site/data/seasons/2026/div2/matches.json");
const AUDIT_PATH = resolve(ROOT, "reports/player-audit-div2.json");
const SNAPSHOT_DIRECTORY = resolve(ROOT, "reports/roster-snapshots/2026/div2");
const PLAYER_TEMPORARY_PATH = `${PLAYERS_PATH}.tmp`;
const AUDIT_TEMPORARY_PATH = `${AUDIT_PATH}.tmp`;
const WAIT_MS = 500;
const SPECS = [
  ["okayama-science", "岡山理科大学", 594], ["okayama", "岡山大学", 593],
  ["hiroshima-international", "広島国際大学", 607], ["tottori", "鳥取大学", 591],
  ["shimonoseki-city", "下関市立大学", 608], ["shimane", "島根大学", 592],
  ["hiroshima-institute-of-technology", "広島工業大学", 600], ["kibi-international", "吉備国際大学", 597],
  ["shujitsu", "就実大学", 771], ["onomichi-city", "尾道市立大学", 602],
  ["university-of-shimane", "島根県立大学", 831],
].map(([id, name, pageId]) => ({ id, name, pageId }));

function cleanText(value) { return String(value ?? "").replace(/[\s　]+/g, " ").trim(); }
function sameExcept(left, right, ignoredKeys) {
  const omit = (value) => Object.fromEntries(Object.entries(value).filter(([key]) => !ignoredKeys.includes(key)));
  return JSON.stringify(omit(left)) === JSON.stringify(omit(right));
}
function cell($, row, selector) { const value = $(row).find(selector).first().clone(); value.find(".sp").remove(); return cleanText(value.text()); }
function number(value) { const parsed = Number.parseInt(cleanText(value).replace(/[^0-9]/g, ""), 10); return Number.isInteger(parsed) ? parsed : null; }
function gradeFromBirth(birth) { if (!birth) return null; const [year, month, day] = birth.split("-").map(Number); if (![year, month, day].every(Number.isInteger)) return null; const cohort = month < 4 || (month === 4 && day === 1) ? year - 1 : year; const grade = 2026 - (cohort + 19) + 1; return grade >= 1 && grade <= 4 ? grade : null; }
function snapshotFileName(date) { const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString(); return `${jst.slice(0, 10).replaceAll("-", "")}-${jst.slice(11, 19).replaceAll(":", "")}-jst.json`; }
async function readLatestSnapshot() { await mkdir(SNAPSHOT_DIRECTORY, { recursive: true }); const files = (await readdir(SNAPSHOT_DIRECTORY)).filter((name) => /^\d{8}-\d{6}-jst\.json$/.test(name)).sort(); if (!files.length) return null; return JSON.parse(await readFile(resolve(SNAPSHOT_DIRECTORY, files.at(-1)), "utf8")); }
function summarizeRemovedPlayers(removed, matches, teamNameById) {
  return removed.map((player) => {
    const teamName = teamNameById.get(player.teamId);
    const records = [];
    for (const match of matches.filter((entry) => entry.status === "finished")) for (const side of ["home", "away"]) {
      if (match[`${side}Team`]?.name !== teamName) continue;
      const inLineup = [...(match.lineups?.[side]?.starters ?? []), ...(match.lineups?.[side]?.substitutes ?? [])].some((entry) => normalizePlayerName(entry.name) === normalizePlayerName(player.name));
      const goals = (match.goals ?? []).filter((entry) => normalizePlayerName(entry.scorerName) === normalizePlayerName(player.name) || (entry.assistNames ?? []).some((name) => normalizePlayerName(name) === normalizePlayerName(player.name))).length;
      const substitutions = (match.substitutions?.[side] ?? []).filter((entry) => normalizePlayerName(entry).includes(normalizePlayerName(player.name))).length;
      const cards = (match.disciplinary?.[side] ?? []).filter((entry) => normalizePlayerName(entry).includes(normalizePlayerName(player.name))).length;
      if (inLineup || goals || substitutions || cards) records.push({ matchId: match.id, inLineup, goals, substitutions, cards });
    }
    return { ...player, appearedInOfficialMatches: records.length > 0, records };
  });
}

async function fetchRoster(api, spec) {
  const pageUrl = `https://jufa-chugoku.jp/team/${spec.pageId}.html`;
  const page = await api.get(pageUrl);
  if (!page.ok()) throw new Error(`${spec.name}チームページ取得失敗: HTTP ${page.status()}`);
  const $page = cheerio.load(await page.text());
  const iframeSource = $page("iframe.score_h04").attr("src");
  if (!iframeSource) throw new Error(`${spec.name}の登録情報URLがありません`);
  const registrationUrl = new URL(iframeSource, pageUrl).href;
  const response = await api.get(registrationUrl);
  if (!response.ok()) throw new Error(`${spec.name}登録情報取得失敗: HTTP ${response.status()}`);
  const $ = cheerio.load(await response.text());
  const players = [];
  $("table.team_info").eq(1).find("tr").each((_, row) => {
    const rawName = cell($, row, ".player_name");
    if (!rawName) return;
    const name = cleanText(rawName).replace(/\s*\[Cap\]\s*$/i, "");
    const birth = cell($, row, ".player_birth").replaceAll(".", "-") || null;
    players.push({
      id: createPlayerId(spec.id, name), teamId: spec.id, name,
      englishName: cell($, row, ".player_En_name") || "",
      number: number(cell($, row, ".player_number")), position: cell($, row, ".player_position") || null,
      grade: gradeFromBirth(birth), height: number(cell($, row, ".player_height")), weight: number(cell($, row, ".player_weight")),
      birth, hometown: null, previousTeam: cell($, row, ".player_previous") || "",
    });
  });
  if (!players.length) throw new Error(`${spec.name}の公式登録が0人のため更新を停止します`);
  return { players, registrationUrl };
}

const backupDirectory = await mkdtemp(join(tmpdir(), "chugoku-div2-roster-"));
await copyFile(PLAYERS_PATH, join(backupDirectory, "players.json"));
const api = await request.newContext({ timeout: 30000, extraHTTPHeaders: { Accept: "text/html,application/xhtml+xml", "User-Agent": "ChugokuFootballData/1.0 (+division-2-roster-sync)" } });
let pendingSnapshotTemporaryPath = null;
try {
  const existing = JSON.parse(await readFile(PLAYERS_PATH, "utf8"));
  const existingAudit = JSON.parse(await readFile(AUDIT_PATH, "utf8"));
  const matches = JSON.parse(await readFile(MATCHES_PATH, "utf8"));
  const fetchedByTeam = new Map();
  const sources = [];
  for (const [index, spec] of SPECS.entries()) {
    if (index) await new Promise((resolveDelay) => setTimeout(resolveDelay, WAIT_MS));
    const result = await fetchRoster(api, spec);
    fetchedByTeam.set(spec.id, result.players);
    sources.push({ teamId: spec.id, teamName: spec.name, pageId: spec.pageId, registrationUrl: result.registrationUrl, count: result.players.length });
    console.log(`${spec.name}: ${result.players.length}人`);
  }
  const targetTeamIds = new Set(SPECS.map((spec) => spec.id));
  const teamIdByName = new Map(SPECS.map((spec) => [spec.name, spec.id]));
  const appearedPlayerIds = new Set();
  for (const match of matches.items.filter((entry) => entry.status === "finished")) for (const side of ["home", "away"]) {
    const teamId = teamIdByName.get(match[`${side}Team`]?.name);
    if (!teamId) continue;
    for (const player of [...(match.lineups?.[side]?.starters ?? []), ...(match.lineups?.[side]?.substitutes ?? [])]) appearedPlayerIds.add(createPlayerId(teamId, player.name));
  }
  const merged = mergeDivisionPlayers(existing.items, fetchedByTeam, targetTeamIds, appearedPlayerIds);
  const divisionCount = [...fetchedByTeam.values()].reduce((sum, roster) => sum + roster.length, 0);
  if (divisionCount < 250) throw new Error(`2部登録人数が${divisionCount}人と極端に少ないため更新を停止します`);
  const updatedAt = new Date();
  const previousSnapshot = await readLatestSnapshot();
  const officialPlayers = [...fetchedByTeam.values()].flat();
  const snapshot = createRosterSnapshot({ syncedAt: updatedAt.toISOString(), sources, players: officialPlayers, previous: previousSnapshot });
  const shouldSaveSnapshot = !previousSnapshot || rosterSnapshotChanged(snapshot);
  const snapshotPath = resolve(SNAPSHOT_DIRECTORY, snapshotFileName(updatedAt));
  const snapshotTemporaryPath = `${snapshotPath}.tmp`;
  pendingSnapshotTemporaryPath = snapshotTemporaryPath;
  const teamNameById = new Map(SPECS.map((spec) => [spec.id, spec.name]));
  const removedCandidates = summarizeRemovedPlayers(snapshot.changes.removed, matches.items, teamNameById);
  let audit = { ...auditRoster(matches.items, merged.players, targetTeamIds, teamIdByName), sources, merge: { added: merged.added, updated: merged.updated, deleted: merged.deleted, preserved: merged.preserved }, divisionPlayerCount: divisionCount, removedCandidates, snapshot: { previous: previousSnapshot?.syncedAt ?? null, saved: shouldSaveSnapshot, path: shouldSaveSnapshot ? `reports/roster-snapshots/2026/div2/${snapshotFileName(updatedAt)}` : null, changes: snapshot.changes } };
  let playersOutput = { ...existing, updatedAt: updatedAt.toISOString(), count: merged.players.length, items: merged.players };
  if (sameExcept(existing, playersOutput, ["updatedAt"])) playersOutput = { ...playersOutput, updatedAt: existing.updatedAt };
  if (sameExcept(existingAudit, audit, ["checkedAt"])) audit = { ...audit, checkedAt: existingAudit.checkedAt };
  await writeFile(PLAYER_TEMPORARY_PATH, `${JSON.stringify(playersOutput, null, 2)}\n`);
  await writeFile(AUDIT_TEMPORARY_PATH, `${JSON.stringify(audit, null, 2)}\n`);
  if (shouldSaveSnapshot) await writeFile(snapshotTemporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  JSON.parse(await readFile(PLAYER_TEMPORARY_PATH, "utf8"));
  JSON.parse(await readFile(AUDIT_TEMPORARY_PATH, "utf8"));
  if (shouldSaveSnapshot) JSON.parse(await readFile(snapshotTemporaryPath, "utf8"));
  await rename(AUDIT_TEMPORARY_PATH, AUDIT_PATH);
  if (shouldSaveSnapshot) await rename(snapshotTemporaryPath, snapshotPath);
  await rename(PLAYER_TEMPORARY_PATH, PLAYERS_PATH);
  console.log(`合計: 2部${divisionCount}人 / 全体${merged.players.length}人`);
  console.log(`追加${merged.added}人 / 更新${merged.updated}人 / 削除${merged.deleted}人`);
  console.log(`名鑑未登録の試合選手: ${audit.missing.length}件`);
  console.log(shouldSaveSnapshot ? `名簿スナップショット保存: ${snapshotPath}` : "名簿スナップショット: 前回から変更なし");
} finally {
  await api.dispose();
  await rm(PLAYER_TEMPORARY_PATH, { force: true });
  await rm(AUDIT_TEMPORARY_PATH, { force: true });
  if (pendingSnapshotTemporaryPath) await rm(pendingSnapshotTemporaryPath, { force: true });
  await rm(backupDirectory, { recursive: true, force: true });
}
