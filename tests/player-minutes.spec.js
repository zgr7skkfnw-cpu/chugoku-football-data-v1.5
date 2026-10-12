import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

import {
  calculatePlayerStatistics,
  normalizePlayerName,
  parseMatchMinute,
  sortPlayerStatistics,
} from "../site/assets/js/utils/players.js";
import { createTeamDirectory, linkMatchesToTeams } from "../site/assets/js/utils/teams.js";

test("追加時間の公式時刻を保持し、前半ATのOUTだけ44分境界にする", () => {
  expect(parseMatchMinute("45+2")).toBe(45);
  expect(parseMatchMinute("90+5")).toBe(90);
  expect(parseMatchMinute("90 ＋4 分")).toBe(90);
  expect(parseMatchMinute("HT")).toBe(45);

  const players = [
    { id: "team-a-starter", teamId: "team-a", name: "先発 選手" },
    { id: "team-a-substitute", teamId: "team-a", name: "交代 選手" },
  ];
  const matches = [{
    id: "additional-time-test",
    status: "finished",
    kickoffAt: "2026-07-14T12:00:00+09:00",
    round: 1,
    homeTeam: { teamId: "team-a", name: "チームA" },
    awayTeam: { teamId: "team-b", name: "チームB" },
    lineups: {
      home: {
        teamId: "team-a",
        teamName: "チームA",
        starters: [{ name: "先発 選手" }],
        substitutes: [{ name: "交代 選手" }],
      },
      away: null,
    },
    substitutions: {
      home: ["45 ＋2 分 [out]先発 選手 [in]交代 選手"],
      away: [],
    },
    disciplinary: { home: ["90 ＋4 分 交代 選手 C1 反スポーツ"], away: [] },
    goals: [],
  }];
  const teamDirectory = { byId: new Map([["team-a", { id: "team-a", name: "チームA" }]]) };
  const stats = calculatePlayerStatistics(players, matches, teamDirectory);

  expect(matches[0].substitutions.home[0]).toBe("45 ＋2 分 [out]先発 選手 [in]交代 選手");
  expect(stats.get("team-a-starter").minutes).toBe(44);
  expect(stats.get("team-a-substitute").minutes).toBe(45);
  expect(stats.get("team-a-substitute").yellowCards).toBe(1);
});

for (const [label, minute] of [["89", "89"], ["90", "90"], ["90+1", "90 ＋1"], ["90+5", "90 ＋5"], ["90+10", "90 ＋10"]]) {
  test(`${label}分交代はOUT 89分・IN 1分として配分する`, () => {
    const stats = calculate(`${minute} 分 [out]先発 選手 [in]交代 選手`);
    expect(stats.get("starter").minutes).toBe(89);
    expect(stats.get("substitute").minutes).toBe(1);
    expect(stats.get("starter").minutes + stats.get("substitute").minutes).toBe(90);
  });
}

test("交代なしとHT交代は従来の境界を維持する", () => {
  expect(calculate(null).get("starter").minutes).toBe(90);
  const stats = calculate("HT [out]先発 選手 [in]交代 選手");
  expect(stats.get("starter").minutes).toBe(45);
  expect(stats.get("substitute").minutes).toBe(45);
});

for (const time of ["45 ＋1", "45 ＋5"]) {
  test(`${time}分交代はOUT 44分・IN 45分として配分する`, () => {
    const stats = calculate(`${time} 分 [out]先発 選手 [in]交代 選手`);
    expect(stats.get("starter").minutes).toBe(44);
    expect(stats.get("substitute").minutes).toBe(45);
    expect(stats.get("starter").minutes + stats.get("substitute").minutes).toBe(89);
  });
}

test("45+○分INとHT INから60分OUTはいずれも15分", () => {
  for (const firstEvent of [
    "45 ＋3 分 [out]先発 選手 [in]中間 選手",
    "HT [out]先発 選手 [in]中間 選手",
  ]) {
    const stats = calculate([firstEvent, "60 分 [out]中間 選手 [in]交代 選手"]);
    expect(stats.get("middle").minutes).toBe(15);
  }
});

test("途中出場選手が45+○分にOUTした場合は44分境界までを集計する", () => {
  const stats = calculate([
    "20 分 [out]先発 選手 [in]中間 選手",
    "45 ＋3 分 [out]中間 選手 [in]交代 選手",
  ]);
  expect(stats.get("middle").minutes).toBe(24);
});

for (const [on, expected] of [[60, 29], [80, 9], [82, 7]]) {
  test(`${on}分INから90分以降OUTは${expected}分`, () => {
    const stats = calculate([
      `${on} 分 [out]先発 選手 [in]中間 選手`,
      "90 ＋5 分 [out]中間 選手 [in]交代 選手",
    ]);
    expect(stats.get("middle").minutes).toBe(expected);
  });
}

for (const on of ["90", "90 ＋1", "90 ＋5"]) {
  test(`${on}分IN後に90分以降OUTしても最低1分`, () => {
    const stats = calculate([
      `${on} 分 [out]先発 選手 [in]中間 選手`,
      "90 ＋7 分 [out]中間 選手 [in]交代 選手",
    ]);
    expect(stats.get("starter").minutes).toBe(89);
    expect(stats.get("middle").minutes).toBe(1);
    expect(stats.get("substitute").minutes).toBe(1);
    expect([...stats.values()].reduce((sum, entry) => sum + entry.minutes, 0)).toBe(91);
  });
}

test("ベンチ入りのみには最低1分を与えない", () => {
  const stats = calculate(null);
  expect(stats.get("substitute").minutes).toBe(0);
  expect(stats.get("substitute").appearances).toBe(0);
  expect(stats.get("substitute").benchSelections).toBe(1);
});

test("90分以降の退場は89分境界、90分未満と前半ATの退場は従来どおり", () => {
  for (const card of ["90 分 先発 選手 CS 警告2回", "90 ＋1 分 先発 選手 S1 著しい反則", "90 ＋5 分 先発 選手 S1 著しい反則"]) {
    const stats = calculate(null, { disciplinary: [card] });
    expect(stats.get("starter").minutes).toBe(89);
  }
  expect(calculate(null, { disciplinary: ["70 分 先発 選手 S1 著しい反則"] }).get("starter").minutes).toBe(70);
  expect(calculate(null, { disciplinary: ["45 ＋3 分 先発 選手 S1 著しい反則"] }).get("starter").minutes).toBe(45);
});

test("途中出場から90分以降の退場は89分境界までを集計し、公式時刻を保持する", () => {
  const disciplinary = "90 ＋3 分 中間 選手 S1 著しい反則";
  const stats = calculate("60 分 [out]先発 選手 [in]中間 選手", { disciplinary: [disciplinary] });
  expect(stats.get("middle").minutes).toBe(29);
  expect(stats.get("middle").redCards).toBe(1);
  expect(disciplinary).toBe("90 ＋3 分 中間 選手 S1 著しい反則");
});

test("延長あり試合には終盤交代の89/1ルールを適用しない", () => {
  const stats = calculate("90 ＋5 分 [out]先発 選手 [in]交代 選手", {
    matchFormat: "試合時間：90分 延長：30分 PK戦：なし",
  });
  expect(stats.get("starter").minutes).toBe(90);
  expect(stats.get("substitute").minutes).toBe(0);
});

test("新しいminutesを90分換算とランキングの共通値として利用できる", () => {
  const stats = calculate("90 ＋1 分 [out]先発 選手 [in]交代 選手", {
    goals: [{ teamName: "チームA", scorerName: "交代 選手", assistNames: [] }],
  });
  const substitute = stats.get("substitute");
  expect(substitute.minutes).toBe(1);
  expect(substitute.goals * 90 / substitute.minutes).toBe(90);
  expect(sortPlayerStatistics(stats, "minutes").map((entry) => entry.minutes)).toEqual([89, 1, 0]);
});

test("退場後の欠員時間だけチーム合計出場時間から減算する", () => {
  const fixtures = [
    { label: "通常試合・退場なし", expected: 990 },
    { label: "72分直接退場", disciplinary: ["72 分 選手1 S5 阻止（他）"], expected: 972 },
    { label: "82分直接退場", disciplinary: ["82 分 選手1 S1 著しい反則"], expected: 982 },
    {
      label: "通常交代あり・退場なし",
      substitutions: ["60 分 [out]選手1 [in]選手12"],
      expected: 990,
    },
    { label: "90+の退場", disciplinary: ["90 ＋3 分 選手1 CS 警告2回"], expected: 989 },
    {
      label: "退場＋通常交代",
      substitutions: ["60 分 [out]選手2 [in]選手12"],
      disciplinary: ["72 分 選手1 S5 阻止（他）"],
      expected: 972,
    },
  ];

  for (const fixture of fixtures) {
    const { match, statistics, teamTotal } = calculateTeamFixture(fixture);
    expect(teamTotal, fixture.label).toBe(fixture.expected);
    expect(
      expectedRegulationTeamMinutes(match, "home", statistics),
      `${fixture.label} expectation`,
    ).toBe(fixture.expected);
  }
});

test("2026年の実例と正常チームの990分を維持する", async () => {
  const [playersData, teamsData, seasonData, division1, division2] = await Promise.all([
    readJson("../site/data/players.json"),
    readJson("../site/data/team-catalog.json"),
    readJson("../site/data/seasons/2026/season.json"),
    readJson("../site/data/seasons/2026/matches.json"),
    readJson("../site/data/seasons/2026/div2/matches.json"),
  ]);
  const teamDirectory = createTeamDirectory(teamsData.items);
  const allStatistics = [];
  for (const data of [division1, division2]) {
    const competition = seasonData.competitions.find((entry) => entry.id === data.seasonId);
    const matches = linkMatchesToTeams(data.items.map((match) => ({
      ...match,
      season: 2026,
      competitionId: data.seasonId,
      periodRules: competition.periodRules,
    })), teamDirectory);
    const statistics = calculatePlayerStatistics(playersData.items, matches, teamDirectory);
    allStatistics.push(statistics);
    for (const match of matches.filter((entry) => entry.status === "finished")) {
      for (const side of ["home", "away"]) {
        if (knownAbnormalTeamMatch(match.id, match[`${side}Team`].teamId)) continue;
        const teamTotal = [...statistics.values()]
          .filter((stats) => stats.player.teamId === match[`${side}Team`].teamId)
          .reduce((sum, stats) => sum + (stats.matches.find((entry) => entry.matchId === match.id)?.minutes ?? 0), 0);
        const expected = officialMinuteException(match.id, match[`${side}Team`].teamId)
          ?? expectedRegulationTeamMinutes(match, side, statistics);
        expect(teamTotal, `${match.id} ${side}`).toBe(expected);
      }
    }
  }
  const [first] = allStatistics;
  expect(first.get("fukuyama-8fb0d41ccc41").matches.find((entry) => entry.matchId === "football-system-15-558-25625").minutes).toBe(89);
  expect(first.get("fukuyama-9e84e2f015ec").matches.find((entry) => entry.matchId === "football-system-15-558-25625").minutes).toBe(1);
  expect(first.get("hiroshima-keizai-2653b58d241c").matches.find((entry) => entry.matchId === "football-system-15-558-25659").minutes).toBe(89);
  expect(first.get("hiroshima-keizai-babd07df03e5").matches.find((entry) => entry.matchId === "football-system-15-558-25659").minutes).toBe(1);
  expect(first.get("hiroshima-d66c858f34af").matches.find((entry) => entry.matchId === "football-system-15-558-25649").minutes).toBe(7);
  expect(first.get("hiroshima-ae5983ca9ee7").matches.find((entry) => entry.matchId === "football-system-15-558-25649").minutes).toBe(1);
  expect(first.get("hiroshima-c2205cbf4c49").matches.find((entry) => entry.matchId === "football-system-15-558-25649").minutes).toBe(44);
  expect(first.get("hiroshima-2dabedfc4f46").matches.find((entry) => entry.matchId === "football-system-15-558-25649").minutes).toBe(45);
  expect(first.get("hiroshima-f1447d82fcce").matches.find((entry) => entry.matchId === "football-system-15-558-25649").minutes).toBe(44);
  expect(first.get("hiroshima-5f572603cac2").matches.find((entry) => entry.matchId === "football-system-15-558-25649").minutes).toBe(45);
  expect(first.get("hiroshima-keizai-cacfc5d5f339").matches.find((entry) => entry.matchId === "football-system-schedule-44886142f49b").minutes).toBe(44);
  expect(first.get("hiroshima-keizai-ffdbbf4c063f").matches.find((entry) => entry.matchId === "football-system-schedule-44886142f49b").minutes).toBe(45);
  const [, second] = allStatistics;
  expect(second.get("okayama-5c428e75d4dc").matches.find((entry) => entry.matchId === "football-system-15-559-25725").minutes).toBe(31);
  expect(second.get("okayama-1af62c4e7763").matches.find((entry) => entry.matchId === "football-system-15-559-25751").minutes).toBe(89);
});

function calculate(substitutions, options = {}) {
  const players = [
    { id: "starter", teamId: "team-a", name: "先発 選手", position: "MF" },
    { id: "middle", teamId: "team-a", name: "中間 選手", position: "MF" },
    { id: "substitute", teamId: "team-a", name: "交代 選手", position: "MF" },
  ];
  const match = {
    id: "minutes-test",
    season: 2026,
    competitionId: "test-competition",
    status: "finished",
    kickoffAt: "2026-09-23T12:00:00+09:00",
    round: 1,
    matchFormat: options.matchFormat ?? "試合時間：90分 PK戦：なし",
    homeTeam: { teamId: "team-a", name: "チームA", score: 0 },
    awayTeam: { teamId: "team-b", name: "チームB", score: 0 },
    lineups: { home: { teamId: "team-a", teamName: "チームA", starters: [{ name: "先発 選手" }], substitutes: [{ name: "中間 選手" }, { name: "交代 選手" }] }, away: null },
    substitutions: { home: substitutions ? (Array.isArray(substitutions) ? substitutions : [substitutions]) : [], away: [] },
    disciplinary: { home: options.disciplinary ?? [], away: [] },
    goals: options.goals ?? [],
  };
  return calculatePlayerStatistics(players, [match], { byId: new Map() });
}

function calculateTeamFixture({ substitutions = [], disciplinary = [] }) {
  const players = Array.from({ length: 12 }, (_, index) => ({
    id: `team-a-${index + 1}`,
    teamId: "team-a",
    name: `選手${index + 1}`,
    position: index === 0 ? "GK" : "MF",
  }));
  const match = {
    id: "team-total-minutes-test",
    season: 2026,
    competitionId: "test-competition",
    status: "finished",
    kickoffAt: "2026-10-12T13:00:00+09:00",
    round: 1,
    matchFormat: "試合時間：90分 PK戦：なし",
    homeTeam: { teamId: "team-a", name: "チームA", score: 0 },
    awayTeam: { teamId: "team-b", name: "チームB", score: 0 },
    lineups: {
      home: {
        teamId: "team-a",
        teamName: "チームA",
        starters: players.slice(0, 11).map(({ name }) => ({ name })),
        substitutes: [{ name: players[11].name }],
      },
      away: null,
    },
    substitutions: { home: substitutions, away: [] },
    disciplinary: { home: disciplinary, away: [] },
    goals: [],
  };
  const statistics = calculatePlayerStatistics(players, [match], { byId: new Map() });
  const teamTotal = [...statistics.values()].reduce(
    (sum, stats) => sum + (stats.matches.find((entry) => entry.matchId === match.id)?.minutes ?? 0),
    0,
  );
  return { match, statistics, teamTotal };
}

function expectedRegulationTeamMinutes(match, side, statistics) {
  const duration = 90;
  if (/延長\s*[：:]\s*(?!0\s*分)\d+\s*分/.test(match.matchFormat ?? "")) {
    throw new Error(`${match.id} ${side}: 延長戦のチーム合計出場時間は自動判定対象外です`);
  }
  const teamId = match[`${side}Team`]?.teamId;
  const substitutions = (match.substitutions?.[side] ?? [])
    .map(parseExpectedSubstitution)
    .filter(Boolean)
    .map((event) => ({
      ...event,
      inBoundaryMinute: expectedBoundaryMinute(event, "in", duration),
      outBoundaryMinute: expectedBoundaryMinute(event, "out", duration),
    }));
  let missingMinutes = 0;
  for (const rawEvent of match.disciplinary?.[side] ?? []) {
    const event = parseExpectedDisciplinary(rawEvent);
    if (!event?.isRed) continue;
    if (event.hasAddedTime && event.minute < duration) {
      throw new Error(`${match.id} ${side}: 前半追加時間の退場は自動判定対象外です: ${rawEvent}`);
    }
    const playerStats = [...statistics.values()].find(
      (stats) => stats.player.teamId === teamId
        && normalizePlayerName(stats.player.name) === normalizePlayerName(event.name),
    );
    const matchEntry = playerStats?.matches.find((entry) => entry.matchId === match.id);
    if (!matchEntry) {
      throw new Error(`${match.id} ${side}: 退場選手を出場記録へ解決できません: ${rawEvent}`);
    }
    const normalizedName = normalizePlayerName(event.name);
    const onEvent = substitutions.find(
      (substitution) => normalizePlayerName(substitution.playerIn) === normalizedName,
    );
    const offEvent = substitutions.find(
      (substitution) => normalizePlayerName(substitution.playerOut) === normalizedName,
    );
    const boundaryMinute = event.minute >= duration ? duration - 1 : event.minute;
    if (!matchEntry.started && (!onEvent || onEvent.inBoundaryMinute > boundaryMinute)) continue;
    if (offEvent?.outBoundaryMinute <= boundaryMinute) continue;
    if (offEvent?.outBoundaryMinute > boundaryMinute) {
      throw new Error(`${match.id} ${side}: 退場選手に交代OUTも記録されています: ${rawEvent}`);
    }
    missingMinutes += duration - boundaryMinute;
  }
  return 11 * duration - missingMinutes;
}

function parseExpectedSubstitution(text) {
  const match = String(text).match(/^(HT|\d+(?:\s*[+＋]\s*\d+)?)\s*(?:分)?\s+\[out\](.*?)\s+\[in\](.*)$/);
  if (!match) return null;
  return {
    minute: match[1] === "HT" ? 45 : parseMatchMinute(match[1]),
    hasAddedTime: /[+＋]/.test(match[1]),
    playerOut: match[2].trim(),
    playerIn: match[3].trim(),
  };
}

function parseExpectedDisciplinary(text) {
  const match = String(text).match(/^(HT|\d+(?:\s*[+＋]\s*\d+)?)\s*(?:分)?\s+(.+?)\s+(C[1-9]|CS|S[1-9])(?:\s|$)/);
  if (!match) return null;
  return {
    minute: match[1] === "HT" ? 45 : parseMatchMinute(match[1]),
    hasAddedTime: /[+＋]/.test(match[1]),
    name: match[2].trim(),
    isRed: match[3] === "CS" || /^S[1-9]$/.test(match[3]),
  };
}

function expectedBoundaryMinute(event, direction, duration) {
  if (event.minute >= duration) return duration - 1;
  if (direction === "out" && event.minute === 45 && event.hasAddedTime) return 44;
  return event.minute;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));
}

function knownAbnormalTeamMatch(matchId, teamId) {
  return new Set([
    "football-system-15-558-25625\0fukuyama-heisei",
    "football-system-15-558-25638\0ipu",
    "football-system-15-558-25630\0hiroshima-shudo",
    "football-system-schedule-44886142f49b\0hiroshima-keizai",
    "football-system-15-559-25716\0shimonoseki-city",
    "football-system-15-559-25727\0shimonoseki-city",
    "football-system-15-559-25734\0hiroshima-institute-of-technology",
    "football-system-15-559-25763\0okayama-science",
    "football-system-15-559-25765\0shimonoseki-city",
    "football-system-schedule-f3876807d9d5\0hiroshima-international",
  ]).has(`${matchId}\0${teamId}`);
}

function officialMinuteException(matchId, teamId) {
  return new Map([
    ["football-system-15-558-25649\0hiroshima", 988],
  ]).get(`${matchId}\0${teamId}`) ?? null;
}
