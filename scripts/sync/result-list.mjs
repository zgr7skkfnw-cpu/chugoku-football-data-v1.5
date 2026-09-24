import { createHash } from "node:crypto";

import * as cheerio from "cheerio";

export const cleanResultText = (value = "") =>
  String(value)
    .replaceAll("\u3000", " ")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function resultInteger(value) {
  const match = cleanResultText(value).match(/-?\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}

export function extractResultIframeUrl(pageHtml, sourcePageUrl) {
  const $ = cheerio.load(pageHtml);
  const iframeSource = $("iframe.score_h08").first().attr("src") ?? $("iframe").first().attr("src");
  if (!iframeSource) throw new Error("JUFA中国ページにiframeが見つかりません");
  const url = new URL(iframeSource, sourcePageUrl);
  if (url.protocol !== "https:" || url.hostname !== "football-system.jp") {
    throw new Error(`iframe URLが許可されていないURLです: ${url.href}`);
  }
  return url;
}

export function parseResultScore(value) {
  const match = cleanResultText(value).match(/(\d+)\s*-\s*(\d+)/);
  return match
    ? { home: Number.parseInt(match[1], 10), away: Number.parseInt(match[2], 10) }
    : null;
}

export function parseResultKickoffAt(dateText, timeText) {
  const date = cleanResultText(dateText).match(/(\d{4})\/(\d{2})\/(\d{2})/);
  const time = cleanResultText(timeText).match(/(\d{1,2}):(\d{2})/);
  if (!date || !time) throw new Error(`試合日時を解析できません: ${dateText} ${timeText}`);
  const [, year, month, day] = date;
  return `${year}-${month}-${day}T${time[1].padStart(2, "0")}:${time[2]}:00+09:00`;
}

export function parseResultListHtml(listHtml, { minimumScheduleCount = 1 } = {}) {
  const $ = cheerio.load(listHtml);
  const tables = $("table.game_schedule");
  if (!tables.length) throw new Error("football-system一覧にtable.game_scheduleが見つかりません");

  const competitionName = cleanResultText($("table.head td.name").first().text());
  const groupNames = $("table.head td.name").map((_, cell) => cleanResultText($(cell).text())).get();
  const allScheduleRows = [];
  tables.each((tableIndex, table) => {
    $(table).find("tr").each((_, row) => {
      const $row = $(row);
      if (cleanResultText($row.find("td.team_home").text()) && cleanResultText($row.find("td.team_away").text())) {
        allScheduleRows.push({ row, groupName: groupNames[tableIndex] || competitionName });
      }
    });
  });
  if (!allScheduleRows.length) throw new Error("football-system一覧の試合行が0件です");
  if (allScheduleRows.length < minimumScheduleCount) {
    throw new Error(`一覧の試合行が少なすぎます: ${allScheduleRows.length}件`);
  }

  const detailTargets = [];
  const scheduledMatches = [];
  allScheduleRows.forEach(({ row, groupName }, sourceOrder) => {
    const $row = $(row);
    const onclick = $row.find("[onclick*='gamedetail']").first().attr("onclick") ?? "";
    const identifiers = onclick.match(
      /gamedetail\s*\(\s*['"]?(\d+)['"]?\s*,\s*['"]?(\d+)['"]?\s*,\s*['"]?(\d+)['"]?\s*\)/i,
    );
    const round = resultInteger($row.find("td.round").text());
    const kickoffAt = parseResultKickoffAt($row.find("td.match_date").text(), $row.find("td.match_time").text());
    const venue = cleanResultText($row.find("td.arena.pc").first().text()) || null;
    const homeName = cleanResultText($row.find("td.team_home").text());
    const awayName = cleanResultText($row.find("td.team_away").text());
    const rowText = cleanResultText($row.text());
    const scheduleStatus = rowText.includes("中止")
      ? "cancelled"
      : rowText.includes("延期")
        ? "postponed"
        : rowText.includes("中断")
          ? "suspended"
          : "scheduled";
    const group = groupNames.length > 1 ? groupName.replace(/^.*新人戦\s*/, "") : null;

    if (!identifiers) {
      const stableKey = `${groupName}|${round}|${kickoffAt}|${homeName}|${awayName}`;
      const digest = createHash("sha1").update(stableKey).digest("hex").slice(0, 12);
      scheduledMatches.push({
        id: `football-system-schedule-${digest}`,
        gameId: null,
        fedId: null,
        taikaiHoldId: null,
        sourceOrder,
        competitionName: groupName,
        groupName: group,
        roundLabel: group ? `${group} 第${round}節` : null,
        penaltyShootout: null,
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
    const score = parseResultScore($row.find("td.match_result").text());
    if (!score) throw new Error(`game_id=${gameId} の一覧スコアを解析できません`);
    detailTargets.push({
      id: `football-system-${fedId}-${taikaiHoldId}-${gameId}`,
      gameId: Number.parseInt(gameId, 10),
      fedId: Number.parseInt(fedId, 10),
      taikaiHoldId: Number.parseInt(taikaiHoldId, 10),
      sourceOrder,
      competitionName: groupName,
      groupName: group,
      round,
      kickoffAt,
      venue,
      status: "finished",
      homeTeam: { name: homeName, score: score.home },
      awayTeam: { name: awayName, score: score.away },
    });
  });

  return {
    competitionName,
    scheduleCount: allScheduleRows.length,
    detailTargets,
    scheduledMatches,
  };
}
