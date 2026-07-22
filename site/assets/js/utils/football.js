const teamColors = [
  "#2476d3",
  "#d34b55",
  "#9a6bd6",
  "#d58a2f",
  "#188e79",
  "#5f72c9",
  "#bf5a98",
  "#418b45",
  "#b96734",
  "#536779",
];

export function getTeamVisual(name) {
  let hash = 0;

  for (const character of name) {
    hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  }

  const label = name.startsWith("IPU") ? "IPU" : name.replace("大学", "").slice(0, 1);
  return { id: label, name, color: teamColors[hash % teamColors.length] };
}

export function getLatestMatches(matches, limit = 3) {
  return [...matches]
    .filter((match) => match.status === "finished")
    .sort((left, right) => new Date(right.kickoffAt) - new Date(left.kickoffAt))
    .slice(0, limit);
}

export function sortMatchesNewestFirst(matches) {
  return [...matches].sort(
    (left, right) =>
      new Date(right.kickoffAt) - new Date(left.kickoffAt) || right.gameId - left.gameId,
  );
}

export function filterMatchesByPeriod(matches, period = "all") {
  if (period === "all") return matches;
  return matches.filter((match) => {
    const round = Number(match.round);
    const firstToRound = match.division === 2 ? 11 : 9;
    const finalRound = match.division === 2 ? 22 : 18;
    return period === "first"
      ? round >= 1 && round <= firstToRound
      : round > firstToRound && round <= finalRound;
  });
}

export function calculateStandings(matches) {
  const table = new Map();

  function getRow(teamName) {
    if (!table.has(teamName)) {
      table.set(teamName, {
        teamName,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      });
    }

    return table.get(teamName);
  }

  for (const match of matches) {
    const homeScore = match.homeTeam?.score;
    const awayScore = match.awayTeam?.score;

    if (
      match.status !== "finished" ||
      !Number.isInteger(homeScore) ||
      !Number.isInteger(awayScore)
    ) {
      continue;
    }

    const home = getRow(match.homeTeam.name);
    const away = getRow(match.awayTeam.name);
    home.played += 1;
    away.played += 1;
    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;
    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (homeScore < awayScore) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  return [...table.values()]
    .map((row) => ({
      ...row,
      goalDifference: row.goalsFor - row.goalsAgainst,
    }))
    .sort(
      (left, right) =>
        right.points - left.points ||
        right.goalDifference - left.goalDifference ||
        right.goalsFor - left.goalsFor ||
        left.teamName.localeCompare(right.teamName, "ja"),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function calculatePlayerRankings(matches) {
  const rankings = new Map();

  for (const match of matches) {
    for (const goal of match.goals ?? []) {
      if (!goal.scorerName) {
        continue;
      }

      const key = `${goal.teamName}\u0000${goal.scorerName}`;
      const current = rankings.get(key) ?? {
        name: goal.scorerName,
        teamName: goal.teamName,
        goals: 0,
        matches: new Set(),
      };
      current.goals += 1;
      current.matches.add(match.id);
      rankings.set(key, current);
    }
  }

  return [...rankings.values()]
    .map(({ matches: matchIds, ...entry }) => ({ ...entry, appearances: matchIds.size }))
    .sort(
      (left, right) =>
        right.goals - left.goals || left.name.localeCompare(right.name, "ja"),
    );
}

export function formatKickoff(match, options = {}) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    ...(options.includeYear ? { year: "numeric" } : {}),
    ...(options.includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(match.kickoffAt));
}

export function formatUpdatedAt(value) {
  if (!value) {
    return "更新時刻不明";
  }

  return `${new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))} 更新`;
}

/**

 * 試合を節ごとにまとめます。

 * 節の順番は、各グループの最初の試合日時に従います。

 */

export function groupMatchesByRound(matches) {

  const sorted = sortMatchesChronologically(matches);

  const groups = [];

  const groupMap = new Map();

  for (const match of sorted) {

    const roundKey = String(match?.roundLabel ?? match?.round ?? "unknown");

    if (!groupMap.has(roundKey)) {

      const group = {

        roundKey,

        matches: [],

      };

      groupMap.set(roundKey, group);

      groups.push(group);

    }

    groupMap.get(roundKey).matches.push(match);

  }

  return groups;

}

/**

 * 今日または次の試合を含む節を、一覧枠の一番上に合わせます。

 * 今後の試合がない場合は、直近に終了した試合の節を表示します。

 */

export function positionMatchTimeline(list, matches) {
  const sortedMatches = sortMatchesChronologically(matches);
  const nowTime = Date.now();
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // 今日の試合があれば状態にかかわらず優先します。
  let targetMatch = sortedMatches.find((match) => match?.kickoffAt?.slice(0, 10) === todayKey);

  // 今日に試合がなければ、現在以降の未終了試合を探します。
  if (!targetMatch) targetMatch = sortedMatches.find((match) => {
    const kickoffTime = new Date(match?.kickoffAt).getTime();

    return (
      match?.status !== "finished"
      && Number.isFinite(kickoffTime)
      && kickoffTime >= nowTime
    );
  });

  // 日付が古いまま未終了になっている試合がある場合の予備処理
  if (!targetMatch) {
    targetMatch = sortedMatches.find(
      (match) => match?.status !== "finished",
    );
  }

  // 今後の試合がなければ、直近に終了した試合を表示
  if (!targetMatch) {
    targetMatch = [...sortedMatches]
      .reverse()
      .find((match) => Number.isFinite(new Date(match?.kickoffAt).getTime()));
  }

  if (!targetMatch) {
    list.scrollTop = 0;
    return;
  }

  const roundKey =
    targetMatch?.round != null
      ? String(targetMatch.round)
      : String(targetMatch?.roundLabel ?? "unknown");

  const escapedRoundKey =
    typeof CSS !== "undefined" && CSS.escape
      ? CSS.escape(roundKey)
      : roundKey;

  let attempts = 0;
  const maxAttempts = 30;

  const moveToTargetRound = () => {
    attempts += 1;

    // ページへの接続とレイアウト確定を待つ
    if (!list.isConnected) {
      if (attempts < maxAttempts) {
        requestAnimationFrame(moveToTargetRound);
      }
      return;
    }

    const target = list.querySelector(
      `[data-match-round="${escapedRoundKey}"]`,
    );

    if (!target) {
      list.scrollTop = 0;
      return;
    }

    list.querySelectorAll(".is-timeline-focus").forEach((item) => item.classList.remove("is-timeline-focus"));
    target.classList.add("is-timeline-focus");

    const listRect = list.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetTop =
      list.scrollTop + targetRect.top - listRect.top;

    list.scrollTop = targetTop;

    // 高さがまだ変化中なら再計算
    if (
      attempts < maxAttempts
      && Math.abs(list.scrollTop - targetTop) > 2
    ) {
      requestAnimationFrame(moveToTargetRound);
    }
  };

  requestAnimationFrame(moveToTargetRound);
}

/**
 * 試合を開催日時の古い順に並べます。
 */
export function sortMatchesChronologically(matches) {
  return [...matches].sort((left, right) => {
    const leftTime = new Date(left?.kickoffAt).getTime();
    const rightTime = new Date(right?.kickoffAt).getTime();

    const safeLeftTime = Number.isFinite(leftTime)
      ? leftTime
      : Number.MAX_SAFE_INTEGER;

    const safeRightTime = Number.isFinite(rightTime)
      ? rightTime
      : Number.MAX_SAFE_INTEGER;

    return safeLeftTime - safeRightTime;
  });
}
