import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { request } from "@playwright/test";
import * as cheerio from "cheerio";
import { buildTeamStats } from "../build/build-team-stats.mjs";
import { buildHeadToHead } from "../build/build-head-to-head.mjs";
import { buildSeasonIndex } from "../build/build-season-index.mjs";

const TARGETS = {
  "2024-1": {
    season: 2024,
    division: 1,
    competitionId: "jufa-chugoku-2024-division-1",
    stage: "regular",
    sourcePageUrl: "https://jufa-chugoku.jp/result/2024/tid_485/",
    outputPath: "../../site/data/seasons/2024/matches.json",
    minimumScheduleCount: 44,
    minimumDetailCount: 44,
    allowIncompleteLineups: true,
    buildStats: true,
  },
  "2024-2": {
    season: 2024,
    division: 2,
    competitionId: "jufa-chugoku-2024-division-2",
    stage: "regular",
    sourcePageUrl: "https://jufa-chugoku.jp/result/2024/tid_486/",
    outputPath: "../../site/data/seasons/2024/div2/matches.json",
    minimumScheduleCount: 44,
    minimumDetailCount: 44,
    allowIncompleteLineups: true,
    buildStats: true,
  },
  "2024-2-playoff": {
    season: 2024,
    division: 2,
    competitionId: "jufa-chugoku-2024-division-2-playoff",
    stage: "division-2-playoff",
    sourcePageUrl: "https://jufa-chugoku.jp/result/2024/tid_508/",
    outputPath: "../../site/data/seasons/2024/div2/playoff/matches.json",
    minimumScheduleCount: 3,
    minimumDetailCount: 3,
    allowIncompleteLineups: true,
    buildStats: false,
  },
  "2025-1": {
    season: 2025,
    division: 1,
    competitionId: "jufa-chugoku-2025-division-1",
    stage: "regular",
    sourcePageUrl: "https://jufa-chugoku.jp/result/2025/tid_516/",
    outputPath: "../../site/data/seasons/2025/matches.json",
    minimumScheduleCount: 44,
    minimumDetailCount: 44,
    allowIncompleteLineups: true,
    buildStats: true,
  },
  "2025-2": {
    season: 2025,
    division: 2,
    competitionId: "jufa-chugoku-2025-division-2",
    stage: "regular",
    sourcePageUrl: "https://jufa-chugoku.jp/result/2025/tid_517/",
    outputPath: "../../site/data/seasons/2025/div2/matches.json",
    minimumScheduleCount: 44,
    minimumDetailCount: 44,
    allowIncompleteLineups: true,
    buildStats: true,
  },
  "2025-2-playoff": {
    season: 2025,
    division: 2,
    competitionId: "jufa-chugoku-2025-division-2-playoff",
    stage: "division-2-playoff",
    sourcePageUrl: "https://jufa-chugoku.jp/result/2025/tid_546/",
    outputPath: "../../site/data/seasons/2025/div2/playoff/matches.json",
    minimumScheduleCount: 3,
    minimumDetailCount: 3,
    allowIncompleteLineups: true,
    buildStats: false,
  },
  "2025-promotion-relegation": {
    season: 2025,
    division: null,
    competitionId: "jufa-chugoku-2025-promotion-relegation",
    stage: "promotion-relegation",
    sourcePageUrl: "https://jufa-chugoku.jp/result/2025/tid_547/",
    outputPath: "../../site/data/seasons/2025/promotion-relegation/matches.json",
    minimumScheduleCount: 2,
    minimumDetailCount: 2,
    allowIncompleteLineups: true,
    buildStats: false,
  },
  "2026-1": {
    season: 2026,
    division: 1,
    competitionId: "jufa-chugoku-2026-division-1",
    stage: "regular",
    sourcePageUrl: "https://jufa-chugoku.jp/result/2026/tid_558/",
    outputPath: "../../site/data/seasons/2026/matches.json",
    minimumScheduleCount: 44,
    minimumDetailCount: 44,
    allowIncompleteLineups: false,
    buildStats: true,
  },
  "2026-2": {
    season: 2026,
    division: 2,
    competitionId: "jufa-chugoku-2026-division-2",
    stage: "regular",
    sourcePageUrl: "https://jufa-chugoku.jp/result/2026/tid_559/",
    outputPath: "../../site/data/seasons/2026/div2/matches.json",
    minimumScheduleCount: 55,
    minimumDetailCount: 1,
    allowIncompleteLineups: true,
    buildStats: true,
  },
  "2026-i-league-1": {
    season: 2026,
    division: 1,
    competitionId: "jufa-chugoku-2026-i-league-division-1",
    stage: "i-league-regular",
    sourcePageUrl: "https://jufa-chugoku.jp/result/2026/tid_566/",
    outputPath: "../../site/data/seasons/2026/i-league/div1/matches.json",
    minimumScheduleCount: 28,
    minimumDetailCount: 1,
    allowIncompleteLineups: true,
    buildStats: false,
  },
  "2026-i-league-2": {
    season: 2026,
    division: 2,
    competitionId: "jufa-chugoku-2026-i-league-division-2",
    stage: "i-league-regular",
    sourcePageUrl: "https://jufa-chugoku.jp/result/2026/tid_567/",
    outputPath: "../../site/data/seasons/2026/i-league/div2/matches.json",
    minimumScheduleCount: 15,
    minimumDetailCount: 1,
    allowIncompleteLineups: true,
    buildStats: false,
  },
};
const targetKey = process.argv.find((argument) => argument.startsWith("--target="))?.split("=")[1] ?? "2026-1";
const target = TARGETS[targetKey];

if (!target) {
  throw new Error(`未対応の同期対象です: ${targetKey}`);
}

const SOURCE_PAGE_URL = target.sourcePageUrl;
const EXPECTED_IFRAME_HOST = "football-system.jp";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  target.outputPath,
);
const MINIMUM_SCHEDULE_COUNT = target.minimumScheduleCount;
const MINIMUM_DETAIL_COUNT = target.minimumDetailCount;
const DETAIL_CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 30_000;
const USER_AGENT =
  "ChugokuFootballData/0.3 (results-sync; https://jufa-chugoku.jp/)";

const cleanText = (value = "") =>
  value
    .replaceAll("\u3000", " ")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toInteger = (value) => {
  const match = cleanText(value).match(/-?\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
};

function assertAllowedUrl(value, { host, label }) {
  const url = new URL(value);

  if (url.protocol !== "https:" || url.hostname !== host) {
    throw new Error(`${label}が許可されていないURLです: ${url.href}`);
  }

  return url;
}

async function fetchText(context, url, options = {}) {
  const attempts = options.attempts ?? 3;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await context.fetch(url, {
        method: options.method ?? "GET",
        form: options.form,
        headers: options.headers,
        failOnStatusCode: false,
        timeout: REQUEST_TIMEOUT_MS,
      });

      if (!response.ok()) {
        throw new Error(`HTTP ${response.status()} ${response.statusText()}`);
      }

      const text = await response.text();

      if (!text.trim()) {
        throw new Error("レスポンス本文が空です");
      }

      return text;
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 500));
      }
    }
  }

  throw new Error(`${url} の取得に失敗しました: ${lastError?.message ?? "不明なエラー"}`);
}

function extractIframeUrl(pageHtml) {
  const $ = cheerio.load(pageHtml);
  const iframeSource = $("iframe.score_h08").first().attr("src") ?? $("iframe").first().attr("src");

  if (!iframeSource) {
    throw new Error("JUFA中国ページにiframeが見つかりません");
  }

  return assertAllowedUrl(new URL(iframeSource, SOURCE_PAGE_URL), {
    host: EXPECTED_IFRAME_HOST,
    label: "iframe URL",
  });
}

function parseScore(value) {
  const match = cleanText(value).match(/(\d+)\s*-\s*(\d+)/);
  return match
    ? { home: Number.parseInt(match[1], 10), away: Number.parseInt(match[2], 10) }
    : null;
}

function parseKickoffAt(dateText, timeText) {
  const date = cleanText(dateText).match(/(\d{4})\/(\d{2})\/(\d{2})/);
  const time = cleanText(timeText).match(/(\d{1,2}):(\d{2})/);

  if (!date || !time) {
    throw new Error(`試合日時を解析できません: ${dateText} ${timeText}`);
  }

  const [, year, month, day] = date;
  const hour = time[1].padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${time[2]}:00+09:00`;
}

function parseListHtml(listHtml) {
  const $ = cheerio.load(listHtml);
  const table = $("table.game_schedule").first();

  if (!table.length) {
    throw new Error("football-system一覧にtable.game_scheduleが見つかりません");
  }

  const competitionName = cleanText($("table.head td.name").first().text());
  const allScheduleRows = table.find("tr").filter((_, row) => {
    const $row = $(row);
    return cleanText($row.find("td.team_home").text()) && cleanText($row.find("td.team_away").text());
  });
  const matches = [];
  const scheduledMatches = [];

  allScheduleRows.each((sourceOrder, row) => {
    const $row = $(row);
    const detailLink = $row.find("[onclick*='gamedetail']").first();
    const onclick = detailLink.attr("onclick") ?? "";
    const identifiers = onclick.match(
      /gamedetail\s*\(\s*['"]?(\d+)['"]?\s*,\s*['"]?(\d+)['"]?\s*,\s*['"]?(\d+)['"]?\s*\)/i,
    );

    const round = toInteger($row.find("td.round").text());
    const kickoffAt = parseKickoffAt(
      $row.find("td.match_date").text(),
      $row.find("td.match_time").text(),
    );
    const venue = cleanText($row.find("td.arena.pc").first().text()) || null;
    const homeName = cleanText($row.find("td.team_home").text());
    const awayName = cleanText($row.find("td.team_away").text());
    const rowText = cleanText($row.text());
    const scheduleStatus = rowText.includes("中止")
      ? "cancelled"
      : rowText.includes("延期")
        ? "postponed"
        : rowText.includes("中断")
          ? "suspended"
          : "scheduled";

    // football-systemは結果詳細が公開された試合にだけgamedetailを付与する。
    if (!identifiers) {
      const stableKey = `${round}|${kickoffAt}|${homeName}|${awayName}`;
      const digest = createHash("sha1").update(stableKey).digest("hex").slice(0, 12);
      scheduledMatches.push({
        id: `football-system-schedule-${digest}`,
        gameId: null,
        fedId: null,
        taikaiHoldId: null,
        sourceOrder,
        competitionName,
        round,
        kickoffAt,
        venue,
        status: scheduleStatus,
        homeTeam: { name: homeName, score: null },
        awayTeam: { name: awayName, score: null },
      });
      return;
    }

    const [, gameId, fedId, taikaiHoldId] = identifiers;
    const score = parseScore($row.find("td.match_result").text());

    if (!score) {
      throw new Error(`game_id=${gameId} の一覧スコアを解析できません`);
    }

    matches.push({
      id: `football-system-${fedId}-${taikaiHoldId}-${gameId}`,
      gameId: Number.parseInt(gameId, 10),
      fedId: Number.parseInt(fedId, 10),
      taikaiHoldId: Number.parseInt(taikaiHoldId, 10),
      sourceOrder,
      competitionName,
      round,
      kickoffAt,
      venue,
      status: "finished",
      homeTeam: {
        name: homeName,
        score: score.home,
      },
      awayTeam: {
        name: awayName,
        score: score.away,
      },
    });
  });

  if (allScheduleRows.length < MINIMUM_SCHEDULE_COUNT) {
    throw new Error(`一覧の試合行が少なすぎます: ${allScheduleRows.length}件`);
  }

  return {
    competitionName,
    scheduleCount: allScheduleRows.length,
    detailTargets: matches,
    scheduledMatches,
  };
}

function valueAfterHeader($, tableSelector, label) {
  const header = $(tableSelector)
    .first()
    .find("th")
    .filter((_, cell) => cleanText($(cell).text()) === label)
    .first();
  return header.length ? cleanText(header.next("td").text()) : "";
}

function parsePeriodScores($) {
  const periods = [];

  $("table.result_02_score tr").each((_, row) => {
    const labelCell = $(row).find("th").first();

    if (!labelCell.length) {
      return;
    }

    const label = cleanText(labelCell.text());
    const home = toInteger(labelCell.prev("td").text());
    const away = toInteger(labelCell.next("td").text());

    if (label && home !== null && away !== null) {
      periods.push({ label, home, away });
    }
  });

  return periods;
}

function parseOfficials($) {
  const labels = new Set(["主審", "副審", "第４審判", "マッチコミッショナー", "会場責任者", "記録員"]);
  const officials = [];

  $("table.result_01").first().find("th").each((_, header) => {
    const role = cleanText($(header).text());
    const name = cleanText($(header).next("td").text());

    if (labels.has(role) && name) {
      officials.push({ role, name });
    }
  });

  return officials;
}

function parseLineups($, listMatch) {
  const sideCells = $("table.result_07")
    .first()
    .find("td.left, td.right")
    .filter((_, cell) => $(cell).find("table.result_07_player").length > 0)
    .slice(0, 2)
    .toArray();

  if (sideCells.length !== 2) {
    throw new Error(`game_id=${listMatch.gameId} のメンバー表を解析できません`);
  }

  const teamNames = [listMatch.homeTeam.name, listMatch.awayTeam.name];
  const sides = sideCells.map((cell, sideIndex) => {
    const $cell = $(cell);
    const starters = [];
    const substitutes = [];
    let parsingSubstitutes = false;

    $cell.find("table.result_07_player").first().find("tr").each((_, row) => {
      if (cleanText($(row).find("th").text()) === "SUB") {
        parsingSubstitutes = true;
        return;
      }

      const name = cleanText($(row).find("td.player").text());

      if (!name) {
        return;
      }

      const player = {
        name,
        number: toInteger($(row).find("td.number").text()),
        position: cleanText($(row).find("td.position").text()) || null,
      };
      (parsingSubstitutes ? substitutes : starters).push(player);
    });

    if (starters.length !== 11 && !target.allowIncompleteLineups) {
      throw new Error(
        `game_id=${listMatch.gameId} ${teamNames[sideIndex]} の先発が11人ではありません: ${starters.length}人`,
      );
    }

    if (starters.length !== 11) {
      console.warn(
        `掲載メンバー注意 game_id=${listMatch.gameId} ${teamNames[sideIndex]}: 先発${starters.length}人`,
      );
    }

    return {
      teamName: teamNames[sideIndex],
      manager: cleanText($cell.find("table.result_07_president td").first().text()) || null,
      starters,
      substitutes,
    };
  });

  return { home: sides[0], away: sides[1] };
}

function parseResultSections($) {
  const result = {
    substitutions: { home: [], away: [] },
    disciplinary: { home: [], away: [] },
    goalSummary: { home: [], away: [] },
  };
  const keyByLabel = {
    交代: "substitutions",
    "警告／退場": "disciplinary",
    "得点（アシスト）": "goalSummary",
  };

  $("table.result_04 tr").each((_, row) => {
    const label = cleanText($(row).children("th").first().text());
    const key = keyByLabel[label];

    if (!key) {
      return;
    }

    const cells = $(row).children("td");
    result[key].home = $(cells[0])
      .find("p")
      .map((__, paragraph) => cleanText($(paragraph).text()))
      .get()
      .filter(Boolean);
    result[key].away = $(cells[1])
      .find("p")
      .map((__, paragraph) => cleanText($(paragraph).text()))
      .get()
      .filter(Boolean);
  });

  return result;
}

function parseGoalTimeline($) {
  return $("table.result_05 tr")
    .filter((_, row) => $(row).find("td.time").length > 0)
    .map((_, row) => {
      const $row = $(row);
      const players = $row
        .find("td.player")
        .map((__, cell) => cleanText($(cell).text()) || null)
        .get();
      const numbers = $row
        .find("td.number")
        .map((__, cell) => cleanText($(cell).text()) || null)
        .get();
      const actions = $row
        .find("td.action")
        .map((__, cell) => cleanText($(cell).text()) || null)
        .get();

      return {
        minute: toInteger($row.find("td.time").text()),
        teamName: cleanText($row.find("td.team").text()),
        scorerNumber: numbers.at(-1) ?? null,
        scorerName: players[0] ?? null,
        assistNames: players.slice(1).filter(Boolean),
        buildUp: numbers.slice(0, -1).map((number, index) => ({
          number,
          action: actions[index] ?? null,
        })),
        finish: actions.at(-1) ?? null,
      };
    })
    .get();
}

function parseDetailHtml(detailHtml, listMatch) {
  const $ = cheerio.load(detailHtml);

  if (!$("body#game_result").length || !$("table.result_01").length) {
    throw new Error(`game_id=${listMatch.gameId} の詳細HTML形式が想定外です`);
  }

  const detailTeams = $("table.result_02 > tbody > tr > td.team, table.result_02 > tr > td.team")
    .map((_, cell) => cleanText($(cell).clone().children("br").remove().end().text()).replace("[Kickoff]", "").trim())
    .get();

  if (
    detailTeams.length >= 2 &&
    (detailTeams[0] !== listMatch.homeTeam.name || detailTeams[1] !== listMatch.awayTeam.name)
  ) {
    throw new Error(
      `game_id=${listMatch.gameId} の対戦チームが一覧と詳細で一致しません: ${detailTeams.join(" / ")}`,
    );
  }

  const conditions = valueAfterHeader($, "table.result_01", "天候/風/ピッチ")
    .split("/")
    .map(cleanText);
  const attendanceText = valueAfterHeader($, "table.result_01", "観客数");
  const resultSections = parseResultSections($);

  return {
    ...listMatch,
    matchNumber: toInteger(valueAfterHeader($, "table.result_01", "マッチNo.")),
    competitionName:
      valueAfterHeader($, "table.result_01", "大会名") || listMatch.competitionName,
    roundLabel: valueAfterHeader($, "table.result_01", "節／回戦") || null,
    matchFormat: valueAfterHeader($, "table.result_01", "試合形式") || null,
    attendance: attendanceText ? toInteger(attendanceText) : null,
    conditions: {
      weather: conditions[0] || null,
      wind: conditions[1] || null,
      pitch: conditions[2] || null,
    },
    officials: parseOfficials($),
    lineups: parseLineups($, listMatch),
    scoreByPeriod: parsePeriodScores($),
    substitutions: resultSections.substitutions,
    disciplinary: resultSections.disciplinary,
    goalSummary: resultSections.goalSummary,
    goals: parseGoalTimeline($),
    officialStatus: "confirmed",
    source: {
      provider: "football-system.jp",
      gameId: listMatch.gameId,
      fedId: listMatch.fedId,
      taikaiHoldId: listMatch.taikaiHoldId,
    },
  };
}

async function fetchDetails(context, detailUrl, listUrl, matches) {
  const results = new Array(matches.length);
  const errors = [];
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (cursor < matches.length) {
      const index = cursor;
      cursor += 1;
      const match = matches[index];

      try {
        const detailHtml = await fetchText(context, detailUrl.href, {
          method: "POST",
          form: {
            game_id: String(match.gameId),
            fed_id: String(match.fedId),
            taikai_hold_id: String(match.taikaiHoldId),
          },
          headers: { Referer: listUrl.href },
        });
        results[index] = parseDetailHtml(detailHtml, match);
        completed += 1;

        if (completed % 10 === 0 || completed === matches.length) {
          console.log(`詳細取得: ${completed}/${matches.length}件`);
        }
      } catch (error) {
        errors.push({ gameId: match.gameId, message: error.message });
      }
    }
  }

  await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, () => worker()));
  return { matches: results.filter(Boolean), errors };
}

async function readPreviousOutput() {
  try {
    return JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw new Error(`既存JSONを読み込めません: ${error.message}`);
  }
}

function countChanges(previousItems = [], nextItems = []) {
  const previous = new Map(previousItems.map((item) => [item.id, JSON.stringify(item)]));
  const next = new Map(nextItems.map((item) => [item.id, JSON.stringify(item)]));
  let changes = 0;

  for (const [id, serialized] of next) {
    if (previous.get(id) !== serialized) {
      changes += 1;
    }
  }

  for (const id of previous.keys()) {
    if (!next.has(id)) {
      changes += 1;
    }
  }

  return changes;
}

function preserveScheduledMatchIds(previousItems = [], nextItems = []) {
  const previousByFixture = new Map(previousItems.map((match) => [
    `${match.round}\0${match.homeTeam?.name}\0${match.awayTeam?.name}`,
    match,
  ]));

  return nextItems.map((match) => {
    const fixture = `${match.round}\0${match.homeTeam?.name}\0${match.awayTeam?.name}`;
    const previous = previousByFixture.get(fixture);
    if (
      previous?.id?.startsWith("football-system-schedule-")
      && match.id !== previous.id
      && match.gameId != null
    ) {
      console.log(`既存試合IDを維持: ${previous.id} (game_id=${match.gameId})`);
      return { ...match, id: previous.id };
    }
    return match;
  });
}

async function writeOutput(data) {
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  const temporaryPath = `${OUTPUT_PATH}.tmp`;
  const backupDirectory = await mkdtemp(join(tmpdir(), `chugoku-results-${targetKey}-`));
  const backupPath = resolve(backupDirectory, "matches.json");
  let hasBackup = false;
  try {
    try {
      await copyFile(OUTPUT_PATH, backupPath);
      hasBackup = true;
      console.log(`同期前バックアップ: ${backupDirectory}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    JSON.parse(await readFile(temporaryPath, "utf8"));
    await rename(temporaryPath, OUTPUT_PATH);
  } catch (error) {
    if (hasBackup) await copyFile(backupPath, OUTPUT_PATH);
    throw error;
  } finally {
    await rm(temporaryPath, { force: true });
    await rm(backupDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const startedAt = new Date();
  const context = await request.newContext({
    timeout: REQUEST_TIMEOUT_MS,
    extraHTTPHeaders: {
      "Accept-Language": "ja,en;q=0.8",
      "User-Agent": USER_AGENT,
    },
  });

  let resultCount = 0;
  let changeCount = 0;
  let errors = [];

  try {
    console.log(`JUFA中国取得: ${SOURCE_PAGE_URL}`);
    const pageHtml = await fetchText(context, SOURCE_PAGE_URL);
    const iframeUrl = extractIframeUrl(pageHtml);
    console.log(`iframe取得: ${iframeUrl.href}`);

    const listHtml = await fetchText(context, iframeUrl.href, {
      headers: { Referer: SOURCE_PAGE_URL },
    });
    const parsedList = parseListHtml(listHtml);
    const detailUrl = assertAllowedUrl(new URL("./pubGameResultConf.php", iframeUrl), {
      host: EXPECTED_IFRAME_HOST,
      label: "詳細POST URL",
    });

    console.log(
      `一覧解析: 全${parsedList.scheduleCount}試合 / 詳細公開済み${parsedList.detailTargets.length}試合`,
    );

    const detailResult = await fetchDetails(
      context,
      detailUrl,
      iframeUrl,
      parsedList.detailTargets,
    );
    errors = detailResult.errors;
    resultCount = detailResult.matches.length + parsedList.scheduledMatches.length;

    if (errors.length > 0) {
      throw new Error(`詳細取得に${errors.length}件失敗しました`);
    }

    if (detailResult.matches.length < MINIMUM_DETAIL_COUNT) {
      throw new Error(`詳細取得件数が最低件数未満です: ${detailResult.matches.length}/${MINIMUM_DETAIL_COUNT}件`);
    }

    const fetchedItems = [...detailResult.matches, ...parsedList.scheduledMatches]
      .map(({ sourceOrder, ...match }) => target.stage === "i-league-regular"
        ? ({ ...match, competitionId: target.competitionId })
        : match)
      .sort((left, right) =>
        left.kickoffAt.localeCompare(right.kickoffAt) || (left.gameId ?? 0) - (right.gameId ?? 0),
      );
    const previous = await readPreviousOutput();
    const items = preserveScheduledMatchIds(previous?.items, fetchedItems);
    changeCount = countChanges(previous?.items, items);

    if (changeCount > 0 || !previous) {
      const syncedAt = new Date().toISOString();
      await writeOutput({
        schemaVersion: 1,
        seasonId: target.competitionId,
        stage: target.stage,
        competitionName: parsedList.competitionName,
        updatedAt: syncedAt,
        source: {
          pageUrl: SOURCE_PAGE_URL,
          iframeUrl: iframeUrl.href,
          detailPostUrl: detailUrl.href,
          retrievedAt: syncedAt,
        },
        scheduleCount: parsedList.scheduleCount,
        matchCount: items.length,
        items,
      });
      console.log(`JSON保存: ${OUTPUT_PATH}`);
    } else {
      console.log("試合データに変更はありません。JSONは書き換えませんでした。");
    }
  } catch (error) {
    if (!errors.some((entry) => entry.message === error.message)) {
      errors.push({ gameId: null, message: error.message });
    }
    process.exitCode = 1;
  } finally {
    await context.dispose();
  }

  for (const error of errors) {
    console.error(
      `同期エラー${error.gameId ? ` game_id=${error.gameId}` : ""}: ${error.message}`,
    );
  }

  const durationSeconds = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  console.log("\n同期サマリー");
  console.log(`取得件数: ${resultCount}件`);
  console.log(`変更件数: ${changeCount}件`);
  console.log(`エラー数: ${errors.length}件`);
  console.log(`処理時間: ${durationSeconds}秒`);
}

await main();
if (!process.exitCode && target.buildStats) await buildTeamStats({ season: target.season, division: target.division });
if (!process.exitCode) await buildHeadToHead();
if (!process.exitCode) await buildSeasonIndex();
