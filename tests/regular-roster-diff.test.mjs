import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createPlayerDirectory, getPlayer } from "../site/assets/js/utils/players.js";
import {
  createRegularRosterPlayerId,
  parseOfficialRoster,
  planRegularRosterAdditions,
} from "../scripts/sync/regular-roster-diff.mjs";

const YAMAGUCHI = {
  teamId: "yamaguchi",
  teamName: "山口大学",
  division: 1,
  registrationUrl: "https://football-system.jp/fss/pub_teaminfo.php?tid=test",
};

function player(name, number = 1, overrides = {}) {
  return {
    id: createRegularRosterPlayerId(YAMAGUCHI.teamId, name, 1),
    teamId: YAMAGUCHI.teamId,
    name,
    englishName: "TEST Player",
    number,
    position: "MF",
    grade: 1,
    height: 170,
    weight: 60,
    birth: "2007-04-02",
    hometown: null,
    previousTeam: "テスト高校",
    ...overrides,
  };
}

function rosterWithShimizuHtml() {
  const rows = [
    ["清水　慶太", "SHIMIZU Keita", 6, "FW", "2004.09.14", 173, 63, "基町高校"],
    ...Array.from({ length: 9 }, (_, index) => [`登録 選手${index}`, `PLAYER ${index}`, index + 20, "MF", "2007.04.02", 170, 60, "テスト高校"]),
  ];
  return `<table class="team_info"><tr><td class="team_JP_name">山口大学</td></tr></table>
    <table class="team_info">${rows.map(([name, englishName, number, position, birth, height, weight, previous]) => `<tr>
      <td class="player_number">${number}</td><td class="player_position pc">${position}</td>
      <td class="player_name">${name}</td><td class="player_En_name pc">${englishName}</td>
      <td class="player_birth">${birth}</td><td class="player_height">${height}cm</td>
      <td class="player_weight pc">${weight}kg</td><td class="player_previous">${previous}</td>
    </tr>`).join("")}</table>`;
}

function plan(existingPlayers, officialPlayers, options = {}) {
  return planRegularRosterAdditions({
    existingPlayers,
    officialRosters: new Map([[YAMAGUCHI.teamId, officialPlayers]]),
    specifications: [YAMAGUCHI],
    validTeamIds: options.validTeamIds ?? new Set([YAMAGUCHI.teamId]),
  });
}

test("公式名簿から清水慶太を正しい決定的IDと登録情報で追加できる", () => {
  const official = parseOfficialRoster(rosterWithShimizuHtml(), YAMAGUCHI);
  const additions = plan(official.slice(1), official);
  const shimizu = additions.find((entry) => entry.name === "清水 慶太");
  assert.deepEqual(shimizu, {
    id: "yamaguchi-5c1ffabd12eb",
    teamId: "yamaguchi",
    name: "清水 慶太",
    englishName: "SHIMIZU Keita",
    number: 6,
    position: "FW",
    grade: 4,
    height: 173,
    weight: 63,
    birth: "2004-09-14",
    hometown: null,
    previousTeam: "基町高校",
  });
});

test("既存選手は重複追加せず変更対象にしない", () => {
  const official = parseOfficialRoster(rosterWithShimizuHtml(), YAMAGUCHI);
  assert.deepEqual(plan(official, official), []);
});

test("公式名簿内の同姓同名が曖昧なら追加しない", () => {
  const candidate = player("同姓 同名");
  assert.throws(() => plan([], [candidate, { ...candidate, number: 2 }]), /公式名簿内で同姓同名が曖昧/);
});

test("teamIdを解決できない場合は追加しない", () => {
  assert.throws(() => plan([], [player("新規 選手")], { validTeamIds: new Set() }), /teamIdを一意に解決できません/);
});

test("生成playerIdが既存IDと衝突する場合は追加しない", () => {
  const candidate = player("新規 選手");
  const collision = player("別の 選手", 99, { id: candidate.id, teamId: "other-team" });
  assert.throws(() => plan([collision], [candidate]), /playerId衝突/);
});

test("公式名簿にいない試合出場選手を名前だけで作らない", () => {
  const official = Array.from({ length: 10 }, (_, index) => player(`公式 選手${index}`, index + 1));
  const additions = plan([], official);
  assert.equal(additions.some((entry) => entry.name === "名簿外 選手"), false);
});

test("差分なしならrunnerはplayers.jsonを書き換えない", async () => {
  const runner = await readFile(new URL("../scripts/sync/sync-regular-player-additions.mjs", import.meta.url), "utf8");
  const noDiffGuard = runner.indexOf("if (!additions.length)");
  const writeCall = runner.indexOf("await writeFile(TEMPORARY_PATH");
  assert.ok(noDiffGuard >= 0 && noDiffGuard < writeCall);
  assert.match(runner.slice(noDiffGuard, writeCall), /return;/);
});

test("名簿同期後は全角空白の清水慶太を山口大学選手として解決できる", () => {
  const official = parseOfficialRoster(rosterWithShimizuHtml(), YAMAGUCHI);
  const existing = official.filter((entry) => entry.name !== "清水 慶太");
  const additions = plan(existing, official);
  const resolved = getPlayer(createPlayerDirectory([...existing, ...additions]), "清水　慶太", "yamaguchi");
  assert.equal(resolved?.id, "yamaguchi-5c1ffabd12eb");
  assert.equal(resolved?.number, 6);
  assert.equal(resolved?.position, "FW");
});

test("名簿または後続同期が失敗すればworkflowはcommit・pushへ進まない", async () => {
  const workflow = await readFile(new URL("../.github/workflows/sync-results.yml", import.meta.url), "utf8");
  const autoSync = workflow.indexOf("npm run update:data:auto");
  const commit = workflow.indexOf("git commit");
  const push = workflow.indexOf("git push");
  assert.ok(autoSync >= 0 && autoSync < commit && commit < push);
  assert.doesNotMatch(workflow, /continue-on-error/);
});
