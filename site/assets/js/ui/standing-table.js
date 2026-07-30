import { routeHref } from "../router.js";
import { createTeamEmblem, element } from "./elements.js";
import { getTeam } from "../utils/teams.js";

export const STANDING_COLUMNS = Object.freeze([
  ["rank", "順"],
  ["team", "チーム"],
  ["played", "試"],
  ["won", "勝"],
  ["drawn", "分"],
  ["lost", "敗"],
  ["goalsFor", "得"],
  ["goalsAgainst", "失"],
  ["goalDifference", "差"],
  ["points", "点"],
]);

export function createUnifiedStandingTable(
  standings,
  teamDirectory,
  { highlightedTeamIds = [], className = "", mode = "overall", showEmblems = false } = {},
) {
  const highlighted = new Set(highlightedTeamIds.filter(Boolean));
  const table = element("table", {
    className: `standing-table unified-standing-table${className ? ` ${className}` : ""}`,
    attributes: {
      "data-standing-count": String(standings.length),
      "data-standing-mode": mode,
      "data-standing-columns": STANDING_COLUMNS.map(([key]) => key).join(","),
    },
  });

  table.append(
    element("thead", {}, [
      element("tr", {}, STANDING_COLUMNS.map(([, label]) => element("th", { text: label }))),
    ]),
    element("tbody", {}, standings.map((row) => {
      const team = getTeam(teamDirectory, row.teamId);
      const values = {
        rank: row.rank || "－",
        played: row.played ?? "－",
        won: row.won ?? "－",
        drawn: row.drawn ?? "－",
        lost: row.lost ?? "－",
        goalsFor: row.goalsFor ?? "－",
        goalsAgainst: row.goalsAgainst ?? "－",
        goalDifference: signed(row.goalDifference),
        points: row.points ?? "－",
      };
      return element("tr", {
        className: highlighted.has(row.teamId) ? "is-highlighted" : "",
        attributes: {
          "data-standing-team": team?.name ?? row.teamId,
          "data-team-id": row.teamId,
        },
      }, STANDING_COLUMNS.map(([key]) => {
        if (key !== "team") return element("td", { text: String(values[key]), className: key });
        return element("td", { className: "team-cell" }, [
          element("a", {
            attributes: {
              href: routeHref("team", { teamId: row.teamId }),
              "data-route": "team",
              "data-team-id": row.teamId,
            },
          }, [
            showEmblems ? createTeamEmblem(team, "team-emblem unified-standing-table__emblem") : null,
            element("span", { text: team?.name ?? row.teamName ?? row.teamId }),
          ]),
        ]);
      }));
    })),
  );
  return table;
}

function signed(value) {
  if (!Number.isFinite(Number(value))) return "－";
  return `${Number(value) > 0 ? "+" : ""}${Number(value)}`;
}
