import { createHash } from "node:crypto";

import * as cheerio from "cheerio";

export function cleanRosterText(value) {
  return String(value ?? "").normalize("NFKC").replace(/[\s　]+/g, " ").trim();
}

export function normalizeRosterName(value) {
  return cleanRosterText(value)
    .replace(/\s*\[Cap\]\s*$/i, "")
    .replace(/[\s　]+/g, "")
    .replaceAll("遙", "遥");
}

export function createRegularRosterPlayerId(teamId, name, division) {
  const idName = division === 1
    ? cleanRosterText(name).replace(/\s*\[Cap\]\s*$/i, "")
    : normalizeRosterName(name);
  const digest = createHash("sha1").update(`${teamId}\0${idName}`).digest("hex").slice(0, 12);
  return `${teamId}-${digest}`;
}

function numberFrom(value) {
  const parsed = Number.parseInt(cleanRosterText(value).replace(/[^0-9]/g, ""), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function gradeFromBirth(birth, season = 2026) {
  if (!birth) return null;
  const [year, month, day] = birth.split("-").map(Number);
  if (![year, month, day].every(Number.isInteger)) return null;
  const cohort = month < 4 || (month === 4 && day === 1) ? year - 1 : year;
  const grade = season - (cohort + 19) + 1;
  return grade >= 1 && grade <= 4 ? grade : null;
}

function cell($, row, selector) {
  const value = $(row).find(selector).first().clone();
  value.find(".sp").remove();
  return cleanRosterText(value.text());
}

export function parseOfficialRoster(html, specification) {
  const $ = cheerio.load(html);
  const teamName = cleanRosterText($("table.team_info").eq(0).find(".team_JP_name").text());
  if (!teamName) throw new Error(`${specification.teamId}: 公式名簿のチーム名を取得できません`);
  if (teamName !== specification.teamName) {
    throw new Error(`${specification.teamId}: 公式チーム名が一致しません (${teamName} / ${specification.teamName})`);
  }

  const rows = $("table.team_info").eq(1).find("tr");
  if (!rows.length) throw new Error(`${specification.teamId}: 公式名簿テーブルを取得できません`);
  const players = [];
  rows.each((_, row) => {
    const name = cell($, row, ".player_name").replace(/\s*\[Cap\]\s*$/i, "");
    if (!name) return;
    const birth = cell($, row, ".player_birth").replaceAll(".", "-") || null;
    players.push({
      id: createRegularRosterPlayerId(specification.teamId, name, specification.division),
      teamId: specification.teamId,
      name,
      englishName: cell($, row, ".player_En_name") || "",
      number: numberFrom(cell($, row, ".player_number")),
      position: cell($, row, ".player_position") || null,
      grade: gradeFromBirth(birth),
      height: numberFrom(cell($, row, ".player_height")),
      weight: numberFrom(cell($, row, ".player_weight")),
      birth,
      hometown: null,
      previousTeam: cell($, row, ".player_previous") || "",
    });
  });
  if (players.length < 10) {
    throw new Error(`${specification.teamId}: 公式登録が${players.length}人と少ないため構造変更の可能性があります`);
  }
  return players;
}

function groupBy(values, keyOf) {
  const groups = new Map();
  for (const value of values) {
    const key = keyOf(value);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  return groups;
}

export function planRegularRosterAdditions({ existingPlayers, officialRosters, specifications, validTeamIds }) {
  const specByTeam = new Map();
  for (const specification of specifications) {
    if (!validTeamIds.has(specification.teamId)) {
      throw new Error(`${specification.teamId}: teamIdを一意に解決できません`);
    }
    if (specByTeam.has(specification.teamId)) {
      throw new Error(`${specification.teamId}: 名簿同期対象teamIdが重複しています`);
    }
    specByTeam.set(specification.teamId, specification);
  }

  const existingById = new Map(existingPlayers.map((player) => [player.id, player]));
  if (existingById.size !== existingPlayers.length) throw new Error("players.jsonに重複playerIdがあります");
  const existingByTeamName = groupBy(
    existingPlayers,
    (player) => `${player.teamId}\0${normalizeRosterName(player.name)}`,
  );
  const additions = [];

  for (const specification of specifications) {
    const roster = officialRosters.get(specification.teamId);
    if (!roster) throw new Error(`${specification.teamId}: 公式名簿を取得できません`);
    const officialByName = groupBy(roster, (player) => normalizeRosterName(player.name));
    for (const [normalizedName, candidates] of officialByName) {
      if (!normalizedName) throw new Error(`${specification.teamId}: 氏名を正規化できない公式登録があります`);
      if (candidates.length !== 1) {
        throw new Error(`${specification.teamId}: 公式名簿内で同姓同名が曖昧です (${candidates.map((p) => p.name).join(", ")})`);
      }
      const candidate = candidates[0];
      const existingCandidates = existingByTeamName.get(`${specification.teamId}\0${normalizedName}`) ?? [];
      if (existingCandidates.length > 1) {
        throw new Error(`${specification.teamId}: players.json内で同姓同名が曖昧です (${candidate.name})`);
      }
      if (existingCandidates.length === 1) continue;
      const collision = existingById.get(candidate.id) ?? additions.find((player) => player.id === candidate.id);
      if (collision) {
        throw new Error(`${specification.teamId}: playerId衝突 ${candidate.id} (${candidate.name} / ${collision.name})`);
      }
      additions.push(candidate);
    }
  }

  return additions;
}
