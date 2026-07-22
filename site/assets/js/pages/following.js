import { createNotice, createTeamEmblem, element } from "../ui/elements.js";
import { routeHref } from "../router.js";
import { enableHorizontalSwipe } from "../ui/swipe.js";

export function renderFollowingPage({ matches, teamDirectory, playerDirectory, favoriteTeamIds = [], favoritePlayerIds = [] }) {
  let activeTab = "teams";
  const page = element("article", { className: "page following-page", attributes: { "data-page": "following" } });
  const tabs = element("div", { className: "following-tabs", attributes: { role: "tablist", "aria-label": "フォロー対象" } });
  const content = element("div", { className: "following-content" });
  const render = () => {
    for (const tab of tabs.children) { const selected = tab.dataset.followingTab === activeTab; tab.classList.toggle("is-active", selected); tab.setAttribute("aria-selected", String(selected)); }
    content.replaceChildren(activeTab === "teams" ? createTeamCards() : createPlayerCards());
  };
  const createTeamCards = () => {
    const now = new Date();
    const cards = favoriteTeamIds.map((teamId, followedIndex) => {
      const team = teamDirectory?.byId.get(teamId);
      if (!team) return null;
      const next = matches
        .filter((match) => includesTeam(match, team.id) && match.status !== "finished" && new Date(match.kickoffAt) >= now)
        .sort((a, b) => new Date(a.kickoffAt) - new Date(b.kickoffAt))[0];
      return { team, next, followedIndex };
    }).filter(Boolean).sort(compareFollowedTeams);
    if (!cards.length) return createNotice("フォロー中のチームはありません。チームページまたは試合タブから登録してください。");
    return element("div", { className: "following-card-grid" }, cards.map(({ team, next }) => createTeamCard(team, next, teamDirectory)));
  };
  const createPlayerCards = () => {
    const players = favoritePlayerIds.map((id) => playerDirectory?.byId.get(id)).filter(Boolean);
    if (!players.length) return createNotice("フォロー中の選手はいません。選手ページからフォローできます。");
    return element("div", { className: "following-player-grid" }, players.map((player) => {
      const team = teamDirectory?.byId.get(player.teamId);
      return element("a", { className: "following-player-card", attributes: { href: routeHref("player", { playerId: player.id }), "data-route": "player", "data-player-id": player.id } }, [
        element("span", { className: "following-player-avatar", text: player.name.replace(/[\s　]+/g, "").slice(0, 1), attributes: { "aria-hidden": "true" } }),
        element("strong", { text: player.name }), element("span", { text: team?.name ?? "所属チーム未掲載" }),
      ]);
    }));
  };
  for (const [id, label] of [["teams", "チーム"], ["players", "選手"]]) {
    const tab = element("button", { className: "following-tab", text: label, attributes: { type: "button", role: "tab", "data-following-tab": id } });
    tab.addEventListener("click", () => { activeTab = id; render(); }); tabs.append(tab);
  }
  enableHorizontalSwipe(content, { onLeft: () => { activeTab = "players"; render(); }, onRight: () => { activeTab = "teams"; render(); } });
  render(); page.append(element("h1", { className: "page-title following-title", text: "フォロー中" }), tabs, content); return page;
}

function createTeamCard(team, next, teamDirectory) {
  const primary = team.colors?.primary ?? "#e8edf2";
  const secondary = team.colors?.secondary ?? "#cfd8e3";
  const dark = contrastIsDark(primary);
  const opponentId = next ? (next.homeTeam.teamId === team.id ? next.awayTeam.teamId : next.homeTeam.teamId) : null;
  const opponent = teamDirectory?.byId.get(opponentId);
  const card = element("a", { className: `following-team-card${dark ? " is-dark" : ""}`, attributes: { href: routeHref("team", { teamId: team.id }), "data-route": "team", "data-team-id": team.id, "data-next-kickoff": next?.kickoffAt ?? "" } }, [
    createTeamEmblem(team, "team-emblem following-team-card__emblem"), element("strong", { text: team.name }),
    next ? element("span", { text: `次戦：${opponent?.name ?? "対戦相手未掲載"}` }) : element("span", { text: "次の試合はまだ決まっていません。" }),
    next ? element("time", { text: formatKickoff(next.kickoffAt) }) : null,
  ]);
  card.style.setProperty("--card-primary", primary); card.style.setProperty("--card-secondary", secondary); return card;
}
function contrastIsDark(hex) { const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "e8edf2"; const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16)); return (r * 299 + g * 587 + b * 114) / 1000 < 145; }
function formatKickoff(value) { return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date(value)); }
function includesTeam(match, id) { return match.homeTeam.teamId === id || match.awayTeam.teamId === id; }
function compareFollowedTeams(left, right) {
  if (left.next && right.next) {
    const timeDifference = new Date(left.next.kickoffAt) - new Date(right.next.kickoffAt);
    return timeDifference || left.followedIndex - right.followedIndex;
  }
  if (left.next) return -1;
  if (right.next) return 1;
  return left.followedIndex - right.followedIndex;
}
