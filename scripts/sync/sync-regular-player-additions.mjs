import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { request } from "@playwright/test";

import { fetchTextWithRetry } from "./http-retry.mjs";
import { parseOfficialRoster, planRegularRosterAdditions } from "./regular-roster-diff.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const PLAYERS_PATH = resolve(ROOT, "site/data/players.json");
const TEAM_CATALOG_PATH = resolve(ROOT, "site/data/team-catalog.json");
const TEMPORARY_PATH = `${PLAYERS_PATH}.tmp`;
const WAIT_MS = 250;

const SPECIFICATIONS = [
  ["ipu", "IPU・環太平洋大学", 1, "https://football-system.jp/fss/pub_teaminfo_jufa_chugoku.php?tid=Vb2DRDIZ%2B2M%3D"],
  ["hiroshima-keizai", "広島経済大学", 1, "https://football-system.jp/fss/pub_teaminfo.php?tid=5lA0uLGR2%2BA%3D"],
  ["fukuyama", "福山大学", 1, "https://football-system.jp/fss/pub_teaminfo.php?tid=mP77admFzug%3D"],
  ["hiroshima", "広島大学", 1, "https://football-system.jp/fss/pub_teaminfo.php?tid=n0ziWt124vM%3D"],
  ["hiroshima-bunka-gakuen", "広島文化学園大学", 1, "https://football-system.jp/fss/pub_teaminfo.php?tid=sG9eESVG1Bo%3D"],
  ["shunan-public", "周南公立大学", 1, "https://football-system.jp/fss/pub_teaminfo.php?tid=QWJhLXmDJpw%3D"],
  ["hiroshima-shudo", "広島修道大学", 1, "https://football-system.jp/fss/pub_teaminfo.php?tid=FLuWDd0daWs%3D"],
  ["fukuyama-heisei", "福山平成大学", 1, "https://football-system.jp/fss/pub_teaminfo.php?tid=sKjyqqP9CH4%3D"],
  ["kawasaki-medical-welfare", "川崎医療福祉大学", 1, "https://football-system.jp/fss/pub_teaminfo.php?tid=W7lDL2HlcOw%3D"],
  ["yamaguchi", "山口大学", 1, "https://football-system.jp/fss/pub_teaminfo.php?tid=bfZzFj6WQ2I%3D"],
  ["okayama-science", "岡山理科大学", 2, "https://football-system.jp/fss/pub_teaminfo.php?tid=gG8OL7%2F89Kg%3D"],
  ["okayama", "岡山大学", 2, "https://football-system.jp/fss/pub_teaminfo.php?tid=Mr5AcdF5KcM%3D"],
  ["hiroshima-international", "広島国際大学", 2, "https://football-system.jp/fss/pub_teaminfo.php?tid=yFvc3FfHDJ4%3D"],
  ["tottori", "鳥取大学", 2, "https://football-system.jp/fss/pub_teaminfo.php?tid=ygdwKaj%2F2eI%3D"],
  ["shimonoseki-city", "下関市立大学", 2, "https://football-system.jp/fss/pub_teaminfo.php?tid=InoboPxTbK4%3D"],
  ["shimane", "島根大学", 2, "https://football-system.jp/fss/pub_teaminfo.php?tid=NLPK6hdkyBc%3D"],
  ["hiroshima-institute-of-technology", "広島工業大学", 2, "https://football-system.jp/fss/pub_teaminfo.php?tid=uxaJWQpBxsk%3D"],
  ["kibi-international", "吉備国際大学", 2, "https://football-system.jp/fss/pub_teaminfo.php?tid=UASoxzNsFqA%3D"],
  ["shujitsu", "就実大学", 2, "https://football-system.jp/fss/pub_teaminfo.php?tid=KCAX%2FSq8Umo%3D"],
  ["onomichi-city", "尾道市立大学", 2, "https://football-system.jp/fss/pub_teaminfo.php?tid=wwI0Hs8y5W0%3D"],
  ["university-of-shimane", "島根県立大学", 2, "https://football-system.jp/fss/pub_teaminfo.php?tid=eDcnsECM8mQ%3D"],
].map(([teamId, teamName, division, registrationUrl]) => ({ teamId, teamName, division, registrationUrl }));

function assertOfficialUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "football-system.jp") {
    throw new Error(`許可されていない公式名簿URLです: ${url.href}`);
  }
  return url.href;
}

async function main() {
  const [playersData, teamCatalog] = await Promise.all([
    readFile(PLAYERS_PATH, "utf8").then(JSON.parse),
    readFile(TEAM_CATALOG_PATH, "utf8").then(JSON.parse),
  ]);
  const validTeamIds = new Set((teamCatalog.items ?? []).filter((team) => !team.competitionId).map((team) => team.id));
  const api = await request.newContext({
    timeout: 45_000,
    extraHTTPHeaders: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ja,en;q=0.8",
      "User-Agent": "ChugokuFootballData/1.0 (+regular-roster-diff-sync)",
    },
  });
  const officialRosters = new Map();
  try {
    for (const [index, specification] of SPECIFICATIONS.entries()) {
      if (index) await new Promise((resolveDelay) => setTimeout(resolveDelay, WAIT_MS));
      const url = assertOfficialUrl(specification.registrationUrl);
      const html = await fetchTextWithRetry(api, url, {}, {
        attempts: 4,
        timeoutMs: 45_000,
        onRetry: ({ nextAttempt, delayMs, error }) => console.warn(
          `[roster-sync] 再試行 ${nextAttempt}/4 (${delayMs}ms後): ${specification.teamName} - ${error.message}`,
        ),
      });
      const roster = parseOfficialRoster(html, specification);
      officialRosters.set(specification.teamId, roster);
      console.log(`[roster-sync] ${specification.teamName}: 公式${roster.length}人`);
    }
  } finally {
    await api.dispose();
  }

  const additions = planRegularRosterAdditions({
    existingPlayers: playersData.items ?? [],
    officialRosters,
    specifications: SPECIFICATIONS,
    validTeamIds,
  });
  if (!additions.length) {
    console.log("[roster-sync] 新規登録選手なし。players.jsonは書き換えませんでした。");
    return;
  }

  const updated = {
    ...playersData,
    updatedAt: new Date().toISOString(),
    count: (playersData.items ?? []).length + additions.length,
    items: [...(playersData.items ?? []), ...additions],
  };
  await mkdir(dirname(PLAYERS_PATH), { recursive: true });
  try {
    await writeFile(TEMPORARY_PATH, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
    JSON.parse(await readFile(TEMPORARY_PATH, "utf8"));
    await rename(TEMPORARY_PATH, PLAYERS_PATH);
  } finally {
    await rm(TEMPORARY_PATH, { force: true });
  }
  for (const player of additions) {
    console.log(`[roster-sync] 追加: ${player.teamId} ${player.name} #${player.number ?? "-"} ${player.position ?? "-"} (${player.id})`);
  }
  console.log(`[roster-sync] ${additions.length}人を公式名簿から追加しました。`);
}

await main().catch((error) => {
  console.error(`[roster-sync] 失敗: ${error.message}`);
  console.error("players.jsonは更新しません。GitHub Actionsでは後続の試合同期・commit・pushへ進みません。");
  process.exitCode = 1;
});
