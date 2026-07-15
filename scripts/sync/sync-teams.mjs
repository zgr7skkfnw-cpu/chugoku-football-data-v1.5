import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { request } from "playwright";
import { buildTeamStats } from "../build/build-team-stats.mjs";
import { buildHeadToHead } from "../build/build-head-to-head.mjs";
import { buildSeasonIndex } from "../build/build-season-index.mjs";

const execFileAsync = promisify(execFile);
const ROOT = new URL("../../", import.meta.url);
const OUTPUT_TEAMS = new URL("site/data/teams.json", ROOT);
const OUTPUT_PLAYERS = new URL("site/data/players.json", ROOT);
const OUTPUT_AUDIT = new URL("site/data/player-audit.json", ROOT);
const MATCHES_FILE = new URL("site/data/seasons/2026/matches.json", ROOT);
const IMAGE_ROOT = new URL("site/assets/images/teams/", ROOT);
const JUFA_ORIGIN = "https://jufa-chugoku.jp";

const TEAM_SPECS = [
  {
    id: "ipu",
    pageId: 595,
    shortName: "IPU",
    colors: { primary: "#183E91", secondary: "#FFFFFF" },
    homeGround: "IPU・環太平洋大学 赤坂グラウンド",
    instagram: "https://www.instagram.com/ipusoccer/",
  },
  {
    id: "hiroshima-keizai",
    pageId: 598,
    shortName: "広経大",
    colors: { primary: "#DF102B", secondary: "#78172D" },
    homeGround: "広島経済大学 陸上競技場",
    instagram: "",
  },
  {
    id: "fukuyama",
    pageId: 604,
    shortName: "福山大",
    colors: { primary: "#173A70", secondary: "#FFFFFF" },
    homeGround: "福山大学",
    instagram: "https://www.instagram.com/fukuyama_univ.football_club/",
  },
  {
    id: "hiroshima",
    pageId: 605,
    shortName: "広島大",
    colors: { primary: "#472495", secondary: "#FFFFFF" },
    homeGround: "広島大学",
    instagram: "",
  },
  {
    id: "hiroshima-bunka-gakuen",
    pageId: 601,
    shortName: "文化大",
    colors: { primary: "#0B3F8A", secondary: "#FFFFFF" },
    homeGround: "広島文化学園大学",
    instagram: "",
  },
  {
    id: "shunan-public",
    pageId: 668,
    shortName: "周南大",
    aliases: ["徳山大学"],
    colors: { primary: "#D71F32", secondary: "#FFFFFF" },
    homeGround: "周南公立大学",
    instagram: "https://www.instagram.com/shunan_u/",
  },
  {
    id: "hiroshima-shudo",
    pageId: 599,
    shortName: "広修大",
    colors: { primary: "#173F94", secondary: "#FFFFFF" },
    homeGround: "広島修道大学",
    instagram: "https://www.instagram.com/shudosoccer1960/",
  },
  {
    id: "fukuyama-heisei",
    pageId: 603,
    shortName: "福平大",
    colors: { primary: "#146BD2", secondary: "#FFFFFF" },
    homeGround: "福山平成大学",
    instagram: "",
  },
  {
    id: "kawasaki-medical-welfare",
    pageId: 596,
    shortName: "川崎福",
    colors: { primary: "#087C59", secondary: "#FFFFFF" },
    homeGround: "川崎医療福祉大学グラウンド",
    instagram: "",
  },
  {
    id: "yamaguchi",
    pageId: 609,
    shortName: "山口大",
    colors: { primary: "#07824C", secondary: "#242A31" },
    homeGround: "やまぐちサッカー交流広場",
    instagram: "https://www.instagram.com/yamadai.soccer/",
  },
];

const EMBLEM_LABELS = {
  ipu: "IPU",
  "hiroshima-keizai": "HUE",
  fukuyama: "FU",
  hiroshima: "HU",
  "hiroshima-bunka-gakuen": "HBG",
  "shunan-public": "SU",
  "hiroshima-shudo": "HSU",
  "fukuyama-heisei": "FHU",
  "kawasaki-medical-welfare": "KUMW",
  yamaguchi: "YU",
};

function cleanText(value) {
  return String(value ?? "").replace(/[\s　]+/g, " ").trim();
}

function parseNumber(value) {
  const number = Number.parseInt(cleanText(value), 10);
  return Number.isInteger(number) ? number : null;
}

function parseMeasurement(value) {
  const number = Number.parseInt(cleanText(value).replace(/[^0-9]/g, ""), 10);
  return Number.isInteger(number) ? number : null;
}

function normalizePlayerName(value) {
  return cleanText(value).replace(/\s*\[Cap\]\s*$/i, "");
}

function createPlayerId(teamId, name) {
  const digest = createHash("sha1")
    .update(`${teamId}\0${normalizePlayerName(name)}`)
    .digest("hex")
    .slice(0, 12);
  return `${teamId}-${digest}`;
}

function estimateAcademicGrade(birth, seasonId = 2026) {
  if (!birth) return null;
  const [year, month, day] = birth.split("-").map(Number);
  if (![year, month, day].every(Number.isInteger)) return null;
  const cohortYear = month < 4 || (month === 4 && day === 1) ? year - 1 : year;
  const grade = seasonId - (cohortYear + 19) + 1;
  return grade >= 1 && grade <= 4 ? grade : null;
}

function tableCell($, row, selector) {
  const cell = $(row).find(selector).first().clone();
  cell.find(".sp").remove();
  return cleanText(cell.text());
}

async function download(api, url, output) {
  const response = await api.get(url);
  if (!response.ok()) {
    throw new Error(`画像取得失敗: ${url} (HTTP ${response.status()})`);
  }
  await writeFile(output, await response.body());
}

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function convertEmblemToPng(source, output) {
  if (process.platform === "darwin") {
    await execFileAsync("sips", ["-s", "format", "png", source, "--out", output]);
    await unlink(source);
    return;
  }

  const bytes = await readFile(source);
  await writeFile(output, bytes);
  await unlink(source);
}

async function createPlaceholderEmblem(spec, output) {
  const source = new URL("emblem-placeholder.svg", new URL(`${spec.id}/`, IMAGE_ROOT));
  const label = EMBLEM_LABELS[spec.id] ?? spec.shortName;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="64" fill="#10151c"/>
  <path d="M128 20 218 54v68c0 58-36 96-90 116-54-20-90-58-90-116V54Z" fill="${spec.colors.primary}" stroke="${spec.colors.secondary}" stroke-width="10"/>
  <text x="128" y="145" fill="${spec.colors.secondary}" font-family="Arial,sans-serif" font-size="${label.length > 3 ? 42 : 56}" font-weight="800" text-anchor="middle">${label}</text>
</svg>`;
  await writeFile(source, svg);
  if (process.platform === "darwin") {
    await execFileAsync("sips", ["-s", "format", "png", fileURLToPath(source), "--out", fileURLToPath(output)]);
    await unlink(source);
    return;
  }
  await writeFile(output, svg);
  await unlink(source);
}

async function fetchTeam(api, spec) {
  const pageUrl = `${JUFA_ORIGIN}/team/${spec.pageId}.html`;
  const pageResponse = await api.get(pageUrl);
  if (!pageResponse.ok()) {
    throw new Error(`チームページ取得失敗: ${pageUrl} (HTTP ${pageResponse.status()})`);
  }

  const pageHtml = await pageResponse.text();
  const $page = cheerio.load(pageHtml);
  const iframeUrl = new URL($page("iframe.score_h04").attr("src"), pageUrl).href;
  const photoUrl = new URL($page(".set > img").first().attr("src"), pageUrl).href;
  const registrationResponse = await api.get(iframeUrl);
  if (!registrationResponse.ok()) {
    throw new Error(`登録情報取得失敗: ${iframeUrl} (HTTP ${registrationResponse.status()})`);
  }

  const $ = cheerio.load(await registrationResponse.text());
  const infoTable = $("table.team_info").eq(0);
  const name = cleanText(infoTable.find(".team_JP_name").text());
  const hometown = cleanText(infoTable.find("tr").eq(1).find("td").first().text());
  const website = infoTable.find("tr").eq(2).find("a").attr("href") ?? "";
  const emblemSourcePath = infoTable.find(".team_emblem img").attr("src");
  const emblemUrl = emblemSourcePath ? new URL(emblemSourcePath, iframeUrl).href : null;
  const players = [];

  $("table.team_info")
    .eq(1)
    .find("tr")
    .each((_, row) => {
      const playerName = tableCell($, row, ".player_name");
      if (!playerName) return;
      const name = normalizePlayerName(playerName);
      const birth = tableCell($, row, ".player_birth").replaceAll(".", "-") || null;
      players.push({
        id: createPlayerId(spec.id, name),
        teamId: spec.id,
        name,
        englishName: tableCell($, row, ".player_En_name") || "",
        number: parseNumber(tableCell($, row, ".player_number")),
        position: tableCell($, row, ".player_position") || null,
        grade: estimateAcademicGrade(birth),
        height: parseMeasurement(tableCell($, row, ".player_height")),
        weight: parseMeasurement(tableCell($, row, ".player_weight")),
        birth,
        hometown: null,
        previousTeam: tableCell($, row, ".player_previous") || "",
      });
    });

  const staff = [];
  $("table.team_info")
    .eq(2)
    .find("tr")
    .each((_, row) => {
      const staffName = tableCell($, row, ".staff_name");
      if (!staffName) return;
      staff.push({
        role: tableCell($, row, ".staff_position"),
        name: staffName,
        englishName: tableCell($, row, ".staff_En_name"),
        license: tableCell($, row, ".staff_license"),
      });
    });

  const imageDirectory = new URL(`${spec.id}/`, IMAGE_ROOT);
  await mkdir(imageDirectory, { recursive: true });
  const teamPhoto = new URL("team.jpg", imageDirectory);
  const emblemSource = new URL("emblem-source.jpg", imageDirectory);
  const emblem = new URL("emblem.png", imageDirectory);
  await download(api, photoUrl, teamPhoto);
  // Curated local emblems are the canonical assets and must survive future data syncs.
  if (!(await fileExists(fileURLToPath(emblem)))) {
    if (emblemUrl) {
      await download(api, emblemUrl, emblemSource);
      await convertEmblemToPng(fileURLToPath(emblemSource), fileURLToPath(emblem));
    } else {
      await createPlaceholderEmblem(spec, emblem);
    }
  }

  const coach = staff.find((member) => member.role === "監督")?.name ?? "";
  return {
    team: {
      id: spec.id,
      name,
      shortName: spec.shortName,
      aliases: spec.aliases ?? [],
      emblem: `/assets/images/teams/${spec.id}/emblem.png`,
      teamPhoto: `/assets/images/teams/${spec.id}/team.jpg`,
      kits: {
        home: `/assets/images/kits/${spec.id}/home.svg`,
        away: `/assets/images/kits/${spec.id}/away.svg`,
      },
      colors: spec.colors,
      homeGround: spec.homeGround,
      hometown,
      coach,
      founded: "",
      website,
      instagram: spec.instagram,
      staff,
      sources: {
        team: pageUrl,
        registration: iframeUrl,
      },
    },
    players,
  };
}

function auditPlayers(matches, teams, players) {
  const teamIdByName = new Map(teams.map((team) => [team.name, team.id]));
  const roster = new Map();
  for (const player of players) {
    roster.set(`${player.teamId}\0${normalizePlayerName(player.name)}`, player);
  }

  const missing = [];
  const numberMismatches = [];
  const positionMismatches = [];
  const seen = new Set();

  for (const match of matches) {
    for (const side of ["home", "away"]) {
      const lineup = match.lineups?.[side];
      if (!lineup) continue;
      const teamId = teamIdByName.get(lineup.teamName);
      for (const entry of [...(lineup.starters ?? []), ...(lineup.substitutes ?? [])]) {
        const name = normalizePlayerName(entry.name);
        const occurrenceKey = `${teamId}\0${name}\0${entry.number}\0${entry.position}`;
        if (seen.has(occurrenceKey)) continue;
        seen.add(occurrenceKey);
        const registered = roster.get(`${teamId}\0${name}`);
        const context = { matchId: match.id, teamId, name };
        if (!registered) {
          missing.push({ ...context, number: entry.number, position: entry.position });
          continue;
        }
        if (entry.number !== null && registered.number !== null && entry.number !== registered.number) {
          numberMismatches.push({
            ...context,
            matchNumber: entry.number,
            registeredNumber: registered.number,
          });
        }
        if (entry.position && registered.position && entry.position !== registered.position) {
          positionMismatches.push({
            ...context,
            matchPosition: entry.position,
            registeredPosition: registered.position,
          });
        }
      }
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    source: "JUFA中国 2026年度チーム登録",
    checkedLineupEntries: seen.size,
    missing,
    numberMismatches,
    positionMismatches,
  };
}

const api = await request.newContext({
  extraHTTPHeaders: {
    Accept: "text/html,application/xhtml+xml",
    "User-Agent": "ChugokuFootballData/1.0 (+team-profile-sync)",
  },
});

try {
  const results = await Promise.all(TEAM_SPECS.map((spec) => fetchTeam(api, spec)));
  const teams = results.map(({ team }) => team);
  const players = results.flatMap(({ players: roster }) => roster);
  const matchData = JSON.parse(await readFile(MATCHES_FILE, "utf8"));
  const audit = auditPlayers(matchData.items, teams, players);
  const updatedAt = new Date().toISOString();

  await writeFile(
    OUTPUT_TEAMS,
    `${JSON.stringify({ schemaVersion: 1, seasonId: 2026, updatedAt, items: teams }, null, 2)}\n`,
  );
  await writeFile(
    OUTPUT_PLAYERS,
    `${JSON.stringify({ schemaVersion: 3, seasonId: 2026, updatedAt, count: players.length, items: players }, null, 2)}\n`,
  );
  await writeFile(OUTPUT_AUDIT, `${JSON.stringify(audit, null, 2)}\n`);

  console.log(`チーム: ${teams.length}件`);
  console.log(`登録選手: ${players.length}件`);
  console.log(`試合登録に存在しない選手: ${audit.missing.length}件`);
  console.log(`背番号相違: ${audit.numberMismatches.length}件`);
  console.log(`ポジション相違: ${audit.positionMismatches.length}件`);
} finally {
  await api.dispose();
}

await buildTeamStats();
await buildHeadToHead();
await buildSeasonIndex();
