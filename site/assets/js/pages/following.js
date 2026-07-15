import { createNotice, createPageHeader, createPanel, element } from "../ui/elements.js";
import { getLatestMatches } from "../utils/football.js";
import { createMatchRow } from "./shared.js";
import { routeHref } from "../router.js";

export function renderFollowingPage({ matches, teamDirectory, favoriteTeamId, teamStats }) {
  const team = teamDirectory?.byId.get(favoriteTeamId);
  if (!team) {
    return element("article", { className: "page", attributes: { "data-page": "following" } }, [
      createPageHeader({ eyebrow: "Following", title: "フォロー中", description: "お気に入りチームの試合と順位をまとめて表示します。" }),
      createNotice("フォロー中のチームはありません。チームページまたは試合タブから登録してください。"),
      element("a", { className: "primary-link", text: "チームを選ぶ", attributes: { href: routeHref("teams"), "data-route": "teams" } }),
    ]);
  }
  const teamMatches = matches.filter((match) => match.homeTeam.teamId === team.id || match.awayTeam.teamId === team.id);
  const next = [...teamMatches].filter((match) => match.status !== "finished" && new Date(match.kickoffAt) >= new Date()).sort((a, b) => new Date(a.kickoffAt) - new Date(b.kickoffAt)).slice(0, 3);
  const latest = getLatestMatches(teamMatches, 5);
  const standing = teamStats?.periods?.all?.standings?.find((row) => row.teamId === team.id);
  return element("article", { className: "page", attributes: { "data-page": "following" } }, [
    createPageHeader({ eyebrow: "Following", title: "フォロー中", description: `${team.name}を優先表示しています。`, badge: `現在 ${standing?.rank ?? "–"}位` }),
    element("div", { className: "section-stack" }, [
      createPanel("次の試合", next.length ? element("div", { className: "match-list" }, next.map((match) => createMatchRow(match, teamDirectory))) : createNotice("次の試合は未掲載です。"), team.shortName),
      createPanel("最新結果", element("div", { className: "match-list" }, latest.map((match) => createMatchRow(match, teamDirectory))), `${latest.length}試合`),
      element("a", { className: "primary-link", text: `${team.name}の詳細を見る`, attributes: { href: routeHref("team", { teamId: team.id }), "data-route": "team", "data-team-id": team.id } }),
    ]),
  ]);
}
