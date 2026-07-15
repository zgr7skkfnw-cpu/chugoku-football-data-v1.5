import { routeHref } from "../router.js";
import {
  createNotice,
  createPageHeader,
  createTeamEmblem,
  createTeamPhoto,
  element,
} from "../ui/elements.js";
import { calculateStandings } from "../utils/football.js";
import { createSeasonPeriodTabs } from "../ui/season-period.js";

export function renderTeamsPage({ matches, teams, teamStats, seasonPeriod }) {
  const standings = teamStats?.periods?.[seasonPeriod]?.standings ?? calculateStandings(matches);
  const standingByName = new Map(standings.map((row) => [row.teamId ?? row.teamName, row]));
  const orderedTeams = [...teams].sort(
    (left, right) =>
      (standingByName.get(left.id)?.rank ?? 999) -
      (standingByName.get(right.id)?.rank ?? 999),
  );
  const cards = orderedTeams.map((team) => createTeamCard(team, standingByName.get(team.id)));

  return element("article", { className: "page", attributes: { "data-page": "teams" } }, [
    createPageHeader({
      eyebrow: "Clubs",
      title: "チーム",
      description: "チーム写真、エンブレム、現在順位から各大学のプロフィールを確認できます。",
    }),
    createSeasonPeriodTabs(seasonPeriod),
    element("div", { className: "section-stack" }, [
      element("div", {
        className: "team-card-grid",
        attributes: { "data-team-count": String(cards.length) },
      }, cards),
      createNotice(`${cards.length}チーム / JUFA中国2026年度登録`),
    ]),
  ]);
}

function createTeamCard(team, standing) {
  const goalDifference = standing?.goalDifference ?? 0;
  return element(
    "a",
    {
      className: "team-card",
      attributes: {
        href: routeHref("team", { teamId: team.id }),
        "data-route": "team",
        "data-team-id": team.id,
        "aria-label": `${team.name}のチーム詳細を表示`,
      },
    },
    [
      element("div", { className: "team-card__media" }, [
        createTeamPhoto(team, "team-photo team-card__photo"),
        element("span", { className: "team-card__rank", text: `${standing?.rank ?? "–"}位` }),
      ]),
      element("div", { className: "team-card__body" }, [
        createTeamEmblem(team, "team-emblem team-emblem--card"),
        element("div", { className: "team-card__copy" }, [
          element("strong", { text: team.name }),
          element("span", { text: team.shortName }),
        ]),
        element("dl", { className: "team-card__stats" }, [
          createCardStat("勝点", standing?.points ?? 0),
          createCardStat("得失点差", `${goalDifference > 0 ? "+" : ""}${goalDifference}`),
        ]),
      ]),
    ],
  );
}

function createCardStat(label, value) {
  return element("div", {}, [
    element("dt", { text: label }),
    element("dd", { text: String(value) }),
  ]);
}
