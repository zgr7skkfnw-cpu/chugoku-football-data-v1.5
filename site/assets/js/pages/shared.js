import { routeHref } from "../router.js";
import { createKitImage, createTeamEmblem, element } from "../ui/elements.js";
import { formatKickoff } from "../utils/football.js";
import { getTeam } from "../utils/teams.js";

export function createMatchRow(match, teamDirectory) {
  const home = getTeam(teamDirectory, match.homeTeam);
  const away = getTeam(teamDirectory, match.awayTeam);

  const row = element(
    "div",
    {
      className: `match-row match-row--${match.status ?? "scheduled"}`,
      attributes: {
        "data-route": "match",
        "data-match-id": match.id,
        "data-match-card": match.id,
        role: "link",
        tabindex: "0",
        "aria-label": match.status === "finished"
          ? `${match.homeTeam.name} ${match.homeTeam.score}対${match.awayTeam.score} ${match.awayTeam.name} の詳細`
          : `${match.homeTeam.name}対${match.awayTeam.name} ${matchStatusLabel(match.status)}`,
      },
    },
    [
      element("div", { className: "match-time" }, [
        element("strong", { text: formatKickoff(match) }),
        element("span", { text: match.roundLabel ?? `第${match.round}節` }),
      ]),
      element("div", { className: "match-teams" }, [
        element("div", { className: "match-team" }, [
          element("span", { className: "match-team__visuals" }, [
            createTeamEmblem(home, "team-emblem team-emblem--match"),
            createKitImage(home, "home", "kit-icon kit-icon--match"),
          ]),
          createTeamNameLink(home, match.homeTeam.name),
        ]),
        element("div", { className: "match-team" }, [
          element("span", { className: "match-team__visuals" }, [
            createTeamEmblem(away, "team-emblem team-emblem--match"),
            createKitImage(away, "away", "kit-icon kit-icon--match"),
          ]),
          createTeamNameLink(away, match.awayTeam.name),
        ]),
      ]),
      element("div", { className: "score-box" }, [
        element("span", { text: match.homeTeam.score === null ? "–" : String(match.homeTeam.score) }),
        element("span", { text: match.awayTeam.score === null ? "–" : String(match.awayTeam.score) }),
        match.status === "finished" ? null : element("small", { text: matchStatusLabel(match.status) }),
      ]),
    ],
  );
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      row.click();
    }
  });
  return row;
}

export function createTeamNameLink(team, fallbackName, className = "team-name-link") {
  if (!team?.id) return element("span", { className, text: fallbackName });
  return element("a", {
    className,
    text: team.name ?? fallbackName,
    attributes: {
      href: routeHref("team", { teamId: team.id }),
      "data-route": "team",
      "data-team-id": team.id,
    },
  });
}

function matchStatusLabel(status) {
  return { scheduled: "予定", postponed: "延期", cancelled: "中止", suspended: "中断" }[status] ?? "未開催";
}

export function createPlayerRow({ initials, name, team, metric, metricLabel }) {
  return element("div", { className: "player-row" }, [
    element("span", { className: "avatar", text: initials }),
    element("div", { className: "row-copy" }, [
      element("strong", { text: name }),
      element("span", { text: team }),
    ]),
    element("div", { className: "metric" }, [
      element("strong", { text: String(metric) }),
      element("span", { text: metricLabel }),
    ]),
  ]);
}

export function createPlayerLinkRow({ player, team, metric = null, metricLabel = "" }) {
  return element(
    "a",
    {
      className: "player-row player-row--link",
      attributes: {
        href: routeHref("player", { playerId: player.id }),
        "data-route": "player",
        "data-player-id": player.id,
      },
    },
    [
      element("span", { className: "player-number", text: player.number ?? "–" }),
      element("span", { className: "player-team-visuals" }, [
        createTeamEmblem(team, "team-emblem team-emblem--player"),
        createKitImage(team, "home", "kit-icon kit-icon--player"),
      ]),
      element("div", { className: "row-copy" }, [
        element("strong", { text: player.name }),
        element("span", {
          text: [player.position, player.grade ? `${player.grade}年（推定）` : null, team?.name]
            .filter(Boolean)
            .join(" / "),
        }),
      ]),
      metric === null
        ? null
        : element("div", { className: "metric" }, [
            element("strong", { text: String(metric) }),
            element("span", { text: metricLabel }),
          ]),
    ],
  );
}

export function createMatchRoundGroup(matches, teamDirectory) {
  const firstMatch = matches[0];
  const roundLabel =
    firstMatch?.roundLabel
    ?? (firstMatch?.round != null ? `第${firstMatch.round}節` : "節未設定");

  const roundKey =
    firstMatch?.round != null
      ? String(firstMatch.round)
      : roundLabel;

  return element("section", {
    className: "match-round-group",
    attributes: {
      "data-match-round": roundKey,
    },
  }, [
    element("header", {
      className: "match-round-group__header",
    }, [
      element("strong", { text: roundLabel }),
      element("span", { text: `${matches.length}試合` }),
    ]),
    element("div", {
      className: "match-round-group__matches",
    }, matches.map((match) =>
      createMatchRow(match, teamDirectory))),
  ]);
}
