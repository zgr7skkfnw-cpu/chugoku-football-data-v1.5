import { createNotice, createPageHeader, createPanel, createTeamEmblem, element } from "../ui/elements.js";
import { routeHref } from "../router.js";
import { getTeam } from "../utils/teams.js";
import { createMatchRow, createPlayerLinkRow } from "./shared.js";

export function renderSearchPage({ matches, teams, players, teamDirectory }) {
  const input = element("input", { className: "search-input global-search__input", attributes: { type: "search", placeholder: "チーム・選手・試合を検索", "aria-label": "全体検索", autofocus: "" } });
  const results = element("div", { className: "section-stack global-search__results" });
  const renderResults = () => {
    const query = normalize(input.value);
    const matchedTeams = teams.filter((team) => !query || normalize(`${team.name}${team.shortName}`).includes(query));
    const playerGroups = groupPlayerRegistrations(players);
    const matchedPlayers = playerGroups.filter((group) => !query || group.some((player) => normalize(`${player.name}${player.englishName ?? ""}${player.number ?? ""}${getTeam(teamDirectory, player.teamId)?.name ?? ""}`).includes(query))).slice(0, query ? 50 : 12);
    const matchedMatches = matches.filter((match) => query && normalize(`${match.homeTeam.name}${match.awayTeam.name}${match.venue ?? ""}${match.roundLabel ?? ""}`).includes(query)).slice(0, 30);
    results.replaceChildren(
      createPanel("チーム", matchedTeams.length ? element("div", { className: "search-team-list" }, matchedTeams.map((team) => element("a", { className: "search-team-row", attributes: { href: routeHref("team", { teamId: team.id }), "data-route": "team", "data-team-id": team.id } }, [createTeamEmblem(team), element("strong", { text: team.name })]))) : createNotice("一致するチームはありません。"), `${matchedTeams.length}件`),
      createPanel("選手", matchedPlayers.length ? element("div", { className: "player-list" }, matchedPlayers.map((group) => {
        const player = group[0];
        const row = createPlayerLinkRow({ player, team: getTeam(teamDirectory, player.teamId) });
        if (group.length > 1) row.append(element("small", { className: "search-player-registrations", text: `${group.length}登録（詳細で切替）` }));
        return row;
      })) : createNotice("一致する選手はありません。"), query ? `${matchedPlayers.length}人` : "一部表示"),
      query ? createPanel("試合", matchedMatches.length ? element("div", { className: "match-list" }, matchedMatches.map((match) => createMatchRow(match, teamDirectory))) : createNotice("一致する試合はありません。"), `${matchedMatches.length}件`) : null,
    );
  };
  let renderTimer = null;
  input.addEventListener("input", () => {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(renderResults, 140);
  });
  renderResults();
  return element("article", { className: "page", attributes: { "data-page": "search" } }, [
    createPageHeader({ eyebrow: "Search", title: "検索", description: "チーム名・選手名・背番号・対戦カードから探せます。" }),
    input,
    results,
  ]);
}

function normalize(value) { return String(value).normalize("NFKC").toLocaleLowerCase("ja").replace(/[\s　]+/g, "").replaceAll("遙", "遥"); }

function groupPlayerRegistrations(players) {
  const groups = new Map();
  for (const player of players) {
    const clubId = player.parentClubId ?? (player.competitionId ? null : player.teamId);
    const verifiedKey = player.personId
      ? `person:${player.personId}`
      : player.birth && clubId ? `registration:${normalize(player.name)}:${player.birth}:${clubId}` : `id:${player.id}`;
    if (!groups.has(verifiedKey)) groups.set(verifiedKey, []);
    groups.get(verifiedKey).push(player);
  }
  return [...groups.values()];
}
