import { mkdtemp, readFile, rename, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { request } from "playwright";
import * as cheerio from "cheerio";
import { auditRoster, createPlayerId, mergeDivisionPlayers, normalizePlayerName } from "./player-roster-utils.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const PLAYERS_PATH = resolve(ROOT, "site/data/players.json");
const MATCHES_PATH = resolve(ROOT, "site/data/seasons/2026/div2/matches.json");
const AUDIT_PATH = resolve(ROOT, "reports/player-audit-div2.json");
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
function cell($, row, selector) { const value = $(row).find(selector).first().clone(); value.find(".sp").remove(); return cleanText(value.text()); }
function number(value) { const parsed = Number.parseInt(cleanText(value).replace(/[^0-9]/g, ""), 10); return Number.isInteger(parsed) ? parsed : null; }
function gradeFromBirth(birth) { if (!birth) return null; const [year, month, day] = birth.split("-").map(Number); if (![year, month, day].every(Number.isInteger)) return null; const cohort = month < 4 || (month === 4 && day === 1) ? year - 1 : year; const grade = 2026 - (cohort + 19) + 1; return grade >= 1 && grade <= 4 ? grade : null; }

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
try {
  const existing = JSON.parse(await readFile(PLAYERS_PATH, "utf8"));
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
  const merged = mergeDivisionPlayers(existing.items, fetchedByTeam, targetTeamIds);
  const divisionCount = [...fetchedByTeam.values()].reduce((sum, roster) => sum + roster.length, 0);
  if (divisionCount < 250) throw new Error(`2部登録人数が${divisionCount}人と極端に少ないため更新を停止します`);
  const teamIdByName = new Map(SPECS.map((spec) => [spec.name, spec.id]));
  const audit = { ...auditRoster(matches.items, merged.players, targetTeamIds, teamIdByName), sources, merge: { added: merged.added, updated: merged.updated, deleted: merged.deleted }, divisionPlayerCount: divisionCount };
  const updatedAt = new Date().toISOString();
  await writeFile(PLAYER_TEMPORARY_PATH, `${JSON.stringify({ ...existing, updatedAt, count: merged.players.length, items: merged.players }, null, 2)}\n`);
  await writeFile(AUDIT_TEMPORARY_PATH, `${JSON.stringify(audit, null, 2)}\n`);
  JSON.parse(await readFile(PLAYER_TEMPORARY_PATH, "utf8"));
  JSON.parse(await readFile(AUDIT_TEMPORARY_PATH, "utf8"));
  await rename(AUDIT_TEMPORARY_PATH, AUDIT_PATH);
  await rename(PLAYER_TEMPORARY_PATH, PLAYERS_PATH);
  console.log(`合計: 2部${divisionCount}人 / 全体${merged.players.length}人`);
  console.log(`追加${merged.added}人 / 更新${merged.updated}人 / 削除${merged.deleted}人`);
  console.log(`名鑑未登録の試合選手: ${audit.missing.length}件`);
} finally {
  await api.dispose();
  await rm(PLAYER_TEMPORARY_PATH, { force: true });
  await rm(AUDIT_TEMPORARY_PATH, { force: true });
  await rm(backupDirectory, { recursive: true, force: true });
}
