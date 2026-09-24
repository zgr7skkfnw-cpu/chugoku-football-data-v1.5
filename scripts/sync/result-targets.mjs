export const RESULT_TARGETS = Object.freeze({
  "2024-1": target(2024, 1, "jufa-chugoku-2024-division-1", "regular", 485, "../../site/data/seasons/2024/matches.json", 44, 44, true, true),
  "2024-2": target(2024, 2, "jufa-chugoku-2024-division-2", "regular", 486, "../../site/data/seasons/2024/div2/matches.json", 44, 44, true, true),
  "2024-2-playoff": target(2024, 2, "jufa-chugoku-2024-division-2-playoff", "division-2-playoff", 508, "../../site/data/seasons/2024/div2/playoff/matches.json", 3, 3, true, false),
  "2025-1": target(2025, 1, "jufa-chugoku-2025-division-1", "regular", 516, "../../site/data/seasons/2025/matches.json", 44, 44, true, true),
  "2025-2": target(2025, 2, "jufa-chugoku-2025-division-2", "regular", 517, "../../site/data/seasons/2025/div2/matches.json", 44, 44, true, true),
  "2025-2-playoff": target(2025, 2, "jufa-chugoku-2025-division-2-playoff", "division-2-playoff", 546, "../../site/data/seasons/2025/div2/playoff/matches.json", 3, 3, true, false),
  "2025-promotion-relegation": target(2025, null, "jufa-chugoku-2025-promotion-relegation", "promotion-relegation", 547, "../../site/data/seasons/2025/promotion-relegation/matches.json", 2, 2, true, false),
  "2026-1": target(2026, 1, "jufa-chugoku-2026-division-1", "regular", 558, "../../site/data/seasons/2026/matches.json", 44, 44, false, true),
  "2026-2": target(2026, 2, "jufa-chugoku-2026-division-2", "regular", 559, "../../site/data/seasons/2026/div2/matches.json", 55, 1, true, true),
  "2026-i-league-1": target(2026, 1, "jufa-chugoku-2026-i-league-division-1", "i-league-regular", 566, "../../site/data/seasons/2026/i-league/div1/matches.json", 28, 1, true, false),
  "2026-i-league-2": target(2026, 2, "jufa-chugoku-2026-i-league-division-2", "i-league-regular", 567, "../../site/data/seasons/2026/i-league/div2/matches.json", 15, 1, true, false),
  "2026-championship": target(2026, null, "jufa-chugoku-2026-championship", "championship", 563, "../../site/data/seasons/2026/championship/matches.json", 22, 22, true, false),
  "2026-rookie": target(2026, null, "jufa-chugoku-2026-rookie-tournament", "rookie-tournament", 575, "../../site/data/seasons/2026/rookie/matches.json", 1, 0, true, false),
  "2025-i-league-upper-playoff": target(2025, null, "jufa-chugoku-2025-i-league-upper-playoff", "i-league-playoff-upper", 538, "../../site/data/seasons/2025/i-league/playoff/upper/matches.json", 5, 5, true, false),
  "2025-i-league-lower-playoff": target(2025, null, "jufa-chugoku-2025-i-league-lower-playoff", "i-league-playoff-lower", 539, "../../site/data/seasons/2025/i-league/playoff/lower/matches.json", 8, 8, true, false),
});

export const POLL_TARGET_KEYS = Object.freeze([
  "2026-1",
  "2026-2",
  "2026-rookie",
  "2026-i-league-1",
  "2026-i-league-2",
  "2026-championship",
]);

function target(
  season,
  division,
  competitionId,
  stage,
  tid,
  outputPath,
  minimumScheduleCount,
  minimumDetailCount,
  allowIncompleteLineups,
  buildStats,
) {
  return Object.freeze({
    season,
    division,
    competitionId,
    stage,
    sourcePageUrl: `https://jufa-chugoku.jp/result/${season}/tid_${tid}/`,
    outputPath,
    minimumScheduleCount,
    minimumDetailCount,
    allowIncompleteLineups,
    buildStats,
  });
}
