import { createNotice, createPanel, createTeamEmblem, element } from "../ui/elements.js";
import { enableHorizontalSwipe } from "../ui/swipe.js";
import { navigate, routeHref } from "../router.js";
import { getPlayer, normalizePlayerName } from "../utils/players.js";
import { getTeam } from "../utils/teams.js";
import { createTeamNameLink } from "./shared.js";

const TABS = ["preview", "suspensions", "standings", "head-to-head"];

export function renderScheduledMatchPage({ match, home, away, matches, teamDirectory, playerDirectory, playerStatistics, competition, selectedMatchTab = "preview" }) {
  const activeTab = TABS.includes(selectedMatchTab) ? selectedMatchTab : "preview";
  const statusLabel = { scheduled: "試合予定", postponed: "延期", cancelled: "中止", suspended: "中断" }[match.status] ?? "未開催";
  const page = element("article", { className: "page prematch-page prematch-v2", attributes: { "data-page": "match", "data-match-id": match.id, "data-prematch-active-tab": activeTab } });
  const scoreboard = element("section", { className: "match-scoreboard prematch-v2-scoreboard" }, [
    createScoreTeam(home, match.homeTeam.name, "ホーム"),
    element("div", { className: "prematch-v2-scoreboard__center" }, [element("strong", { text: timeLabel(match.kickoffAt) }), element("span", { text: dateLabel(match.kickoffAt) }), element("small", { text: statusLabel })]),
    createScoreTeam(away, match.awayTeam.name, "アウェイ"),
  ]);
  const thirdLabel = contextTabLabel(competition, match);
  const definitions = [["preview", "プレビュー"], ["suspensions", "出場停止"], ["standings", thirdLabel], ["head-to-head", "対戦"]];
  const tabs = element("div", { className: "prematch-tabs", attributes: { role: "tablist", "aria-label": "未開催試合情報" } });
  const changeTab = (tab) => navigate("match", { matchId: match.id, matchTab: tab });
  tabs.append(...definitions.map(([key, label]) => {
    const selected = activeTab === key;
    const button = element("button", { className: `prematch-tab${selected ? " is-active" : ""}`, text: label, attributes: { type: "button", role: "tab", "aria-selected": String(selected), "data-prematch-tab": key } });
    button.addEventListener("click", () => changeTab(key));
    return button;
  }));
  const content = element("div", { className: "prematch-tab-content", attributes: { "data-prematch-content": activeTab } });
  const index = TABS.indexOf(activeTab);
  enableHorizontalSwipe(content, { onLeft: () => TABS[index + 1] && changeTab(TABS[index + 1]), onRight: () => TABS[index - 1] && changeTab(TABS[index - 1]) });
  const context = { match, home, away, matches, teamDirectory, playerDirectory, playerStatistics, competition };
  content.append(activeTab === "suspensions" ? createNotice("出場停止情報は準備中です。") : activeTab === "standings" ? competitionTab(context) : activeTab === "head-to-head" ? createNotice("対戦成績は準備中です。") : previewTab(context));
  page.append(
    element("header", { className: "prematch-v2-header" }, [element("span", { text: match.competitionName ?? match.leagueName ?? "大会名未掲載" }), element("h1", { text: statusLabel }), element("p", { text: match.roundLabel ?? (match.round != null ? `第${match.round}節` : "節・ラウンド未掲載") })]),
    scoreboard, tabs, content,
  );
  return page;
}

function previewTab(context) {
  const { match, home, away, matches, teamDirectory, competition } = context;
  const forms = [home, away].map((team) => ({ team, items: teamForm(matches, match, team?.id) }));
  const competitionScope = matches.filter((item) => item.competitionId === match.competitionId && sameGroup(item, match));
  const previousCompetition = previousMatches(matches, match).filter((item) => item.competitionId === match.competitionId && sameGroup(item, match));
  return element("div", { className: "section-stack prematch-preview" }, [
    createPanel("試合情報", element("div", { className: "detail-list" }, [detail("大会", match.competitionName ?? match.leagueName ?? "公式記録未掲載"), detail("節・ラウンド", match.roundLabel ?? (match.round != null ? `第${match.round}節` : "公式記録未掲載")), detail("日付", longDateLabel(match.kickoffAt)), detail("キックオフ", timeLabel(match.kickoffAt)), detail("会場", match.venue ?? "公式記録未掲載")]), "公式日程"),
    createForms(forms, teamDirectory),
    topScorerPanel(context),
    createNotice(match.gameId == null ? "公式詳細はまだ公開されていません。日時・対戦カード・会場のみ表示しています。" : "試合終了後、公式詳細が公開されると試合記録へ切り替わります。"),
  ]);
}

function suspensionsTab({ match, home, away }) {
  const suspensions = match.suspensions;
  if (!suspensions?.home?.length && !suspensions?.away?.length) return element("div", { className: "section-stack", attributes: { "data-suspensions": "unpublished" } }, [createNotice("出場停止情報は公式記録未掲載です。公式に確認できない選手を推測表示していません。")]);
  return element("div", { className: "suspension-grid", attributes: { "data-suspensions": "official" } }, [[home, suspensions.home ?? []], [away, suspensions.away ?? []]].map(([team, items]) => createPanel(team?.name ?? "チーム", items.length ? element("div", { className: "detail-list" }, items.map((item) => element("div", { className: "suspension-row" }, [element("strong", { text: item.playerName ?? "選手名未掲載" }), element("span", { text: item.number == null ? "背番号 －" : `背番号 ${item.number}` }), element("span", { text: item.reason ?? "理由未掲載" }), element("small", { text: item.source ?? "公式根拠未掲載" })]))) : createNotice("公式記録未掲載"), "公式情報")));
}

function competitionTab(context) {
  const { match, home, away, matches, teamDirectory, competition } = context;
  if (competition?.dataStatus === "not-held") return createNotice(competition.message ?? "この大会は開催されません。");
  if (competition?.dataStatus === "not-published") return createNotice(competition.message ?? "大会情報はまだ公式発表されていません。");
  if (isTournament(competition, match)) return tournamentView(context);
  if (competition?.competitionType === "promotion-relegation") return promotionView(context);
  const scope = matches.filter((item) => item.competitionId === match.competitionId && sameGroup(item, match));
  const relevant = previousMatches(matches, match).filter((item) => item.competitionId === match.competitionId && sameGroup(item, match));
  const rows = buildStandings(relevant, teamIdsFromMatches(scope));
  return element("div", { className: "section-stack", attributes: { "data-context-type": "standings" } }, [createPanel(match.groupName ? `${match.groupName} 順位表` : "順位表", standingTable(rows, teamDirectory, [home?.id, away?.id]), "当該試合より前"), createNotice("当該試合より前に終了した同一大会の試合から再構成しています。")]);
}

function tournamentView({ match, matches, teamDirectory }) {
  const competitionMatches = matches.filter((item) => item.competitionId === match.competitionId);
  const rounds = [...new Set(competitionMatches.map((item) => item.roundLabel ?? String(item.round ?? "ラウンド未掲載")))];
  let selectedRound = match.roundLabel ?? String(match.round ?? rounds[0]);
  const wrapper = element("div", { className: "section-stack", attributes: { "data-context-type": "tournament" } });
  const chips = element("div", { className: "tournament-round-tabs horizontal-scroll", attributes: { "data-swipe-exclude": "true" } });
  const list = element("div", { className: "tournament-round-matches" });
  const render = () => {
    [...chips.children].forEach((button) => button.classList.toggle("is-active", button.dataset.round === selectedRound));
    list.replaceChildren(...competitionMatches.filter((item) => (item.roundLabel ?? String(item.round ?? "ラウンド未掲載")) === selectedRound).map((item) => tournamentMatch(item, teamDirectory, item.id === match.id)));
  };
  chips.append(...rounds.map((round) => { const button = element("button", { className: "tournament-round-tab", text: round, attributes: { type: "button", "data-round": round } }); button.addEventListener("click", () => { selectedRound = round; render(); }); return button; }));
  const bracket = element("div", { className: "tournament-bracket", attributes: { "data-swipe-exclude": "true" } }, rounds.map((round) => element("section", { className: "tournament-bracket__round" }, [element("strong", { text: round }), ...competitionMatches.filter((item) => (item.roundLabel ?? String(item.round ?? "")) === round).map((item) => tournamentMatch(item, teamDirectory, item.id === match.id))])));
  render(); wrapper.append(chips, list, createPanel("ラウンド全体", bracket, "横スクロール"), createNotice("公式データに勝ち上がり接続先がない試合は、推測で線を結んでいません。")); return wrapper;
}

function promotionView({ match, matches, teamDirectory, competition }) {
  const items = matches.filter((item) => item.competitionId === match.competitionId);
  return element("div", { className: "section-stack", attributes: { "data-context-type": "promotion" } }, [createPanel("対戦カード・大会情報", element("div", { className: "tournament-round-matches" }, items.map((item) => tournamentMatch(item, teamDirectory, item.id === match.id))), competition?.formatLabel ?? "公式大会情報"), competition?.notes ? createNotice(competition.notes) : createNotice("昇格・残留条件は公式要項に掲載された情報のみ表示します。")]);
}

function headToHeadTab({ match, home, away, matches, teamDirectory }) {
  const history = matches.filter((item) => item.id !== match.id && item.status === "finished" && [item.homeTeam.teamId, item.awayTeam.teamId].includes(home?.id) && [item.homeTeam.teamId, item.awayTeam.teamId].includes(away?.id)).sort((a, b) => new Date(b.kickoffAt) - new Date(a.kickoffAt));
  let venueFilter = "all"; let competitionFilter = "all";
  const categories = [...new Set(history.map(competitionCategory))];
  const content = element("div");
  const render = () => {
    const filtered = history.filter((item) => (venueFilter === "all" || (venueFilter === "home" ? item.homeTeam.teamId === home?.id : item.awayTeam.teamId === home?.id)) && (competitionFilter === "all" || competitionCategory(item) === competitionFilter));
    const summary = summarizeH2h(filtered, home?.id, away?.id);
    content.replaceChildren(createPanel("対戦成績", element("div", { className: "h2h-summary" }, [createH2hTeam(home, summary.homeWins, "勝利"), element("div", { className: "h2h-draws" }, [element("strong", { text: String(summary.draws) }), element("span", { text: "引分" })]), createH2hTeam(away, summary.awayWins, "勝利")]), `${filtered.length}試合 / 得点 ${summary.homeGoals}-${summary.awayGoals}`), createPanel("直近対戦", filtered.length ? element("div", { className: "h2h-history" }, filtered.map((item) => h2hRow(item))) : createNotice("該当する対戦記録はありません。"), `${filtered.length}試合`));
  };
  const filters = element("div", { className: "prematch-h2h-filters horizontal-scroll", attributes: { "data-swipe-exclude": "true" } }, [selectControl("開催区分", [["all", "すべて"], ["home", "ホーム"], ["away", "アウェー"]], (value) => { venueFilter = value; render(); }), selectControl("大会", [["all", "すべての大会"], ...categories.map((value) => [value, value])], (value) => { competitionFilter = value; render(); })]);
  render(); return element("div", { className: "section-stack prematch-h2h", attributes: { "data-h2h-total": history.length } }, [filters, content]);
}

function createForms(forms, teamDirectory) {
  return createPanel("全大会 直近5試合", element("div", { className: "prematch-form-grid" }, forms.map(({ team, items }) => element("section", { className: "prematch-form-team", attributes: { "data-form-team": team?.id ?? "" } }, [element("header", {}, [createTeamEmblem(team, "team-emblem team-emblem--standing"), createTeamNameLink(team, team?.name)]), items.length ? element("div", { className: "prematch-form-list" }, items.map((item) => element("a", { className: `prematch-form-result form-badge--${item.result.toLowerCase()}`, attributes: { href: routeHref("match", { matchId: item.match.id }), "data-route": "match", "data-match-id": item.match.id } }, [createTeamEmblem(getTeam(teamDirectory, item.opponentId), "team-emblem team-emblem--compact"), element("strong", { text: `${item.result === "W" ? "○" : item.result === "D" ? "△" : "●"} ${item.goalsFor}-${item.goalsAgainst}` }), element("small", { text: item.match.competitionName ?? item.match.leagueName ?? "大会名未掲載" })]))) : createNotice("過去の終了試合はありません。")]))), "試合日より前");
}

function insightsPanel(forms, home, away, matches, match) {
  const insights = [];
  for (const { team, items } of forms) {
    if (!items.length) continue;
    const wins = items.filter((item) => item.result === "W").length; const draws = items.filter((item) => item.result === "D").length; const losses = items.length - wins - draws;
    insights.push(`${team?.shortName ?? team?.name}は直近${items.length}試合で${wins}勝${draws}分${losses}敗`);
    const unbeaten = items.findIndex((item) => item.result === "L"); const unbeatenCount = unbeaten === -1 ? items.length : unbeaten;
    if (unbeatenCount >= 3) insights.push(`${team?.shortName ?? team?.name}は直近${unbeatenCount}試合で無敗`);
    if (items.length >= 3) insights.push(`${team?.shortName ?? team?.name}は直近${items.length}試合で平均${(items.reduce((sum, item) => sum + item.goalsFor, 0) / items.length).toFixed(1)}得点`);
  }
  const direct = matches.filter((item) => item.id !== match.id && item.status === "finished" && [item.homeTeam.teamId, item.awayTeam.teamId].includes(home?.id) && [item.homeTeam.teamId, item.awayTeam.teamId].includes(away?.id)).sort((a, b) => new Date(b.kickoffAt) - new Date(a.kickoffAt)).slice(0, 3);
  if (direct.length) { const homeWins = direct.filter((item) => goalsFor(item, home?.id) > goalsAgainst(item, home?.id)).length; insights.push(`直近対戦${direct.length}試合では${home?.shortName ?? home?.name}が${homeWins}勝`); }
  return insights.length ? createPanel("インサイト", element("ul", { className: "prematch-insights", attributes: { "data-insight-count": Math.min(5, insights.length) } }, [...new Set(insights)].slice(0, 5).map((text) => element("li", { text }))), "登録済み試合から機械集計") : null;
}

function topScorerPanel({ match, matches, playerDirectory, playerStatistics, teamDirectory }) {
  const eligible = previousMatches(matches, match).filter((item) => item.competitionId === match.competitionId);
  const matchIds = new Set(eligible.map((item) => item.id)); const totals = new Map();
  for (const item of eligible) for (const goal of item.goals ?? []) { const side = goal.teamName === item.homeTeam.name ? item.homeTeam : item.awayTeam; const key = `${side.teamId}:${normalizePlayerName(goal.scorerName)}`; const value = totals.get(key) ?? { name: goal.scorerName, teamId: side.teamId, goals: 0, assists: 0 }; value.goals += 1; totals.set(key, value); for (const assistName of goal.assistNames ?? []) { const assistKey = `${side.teamId}:${normalizePlayerName(assistName)}`; const assist = totals.get(assistKey) ?? { name: assistName, teamId: side.teamId, goals: 0, assists: 0 }; assist.assists += 1; totals.set(assistKey, assist); } }
  const leaders = [...totals.values()].sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name, "ja")).filter((item, _, all) => item.goals > 0 && item.goals === all[0]?.goals);
  if (!leaders.length) return createNotice("得点ランキングは公式記録公開後に表示します。");
  return createPanel("得点王", element("div", { className: "prematch-scorer-list" }, leaders.map((leader) => { const player = getPlayer(playerDirectory, leader.name, leader.teamId); const stats = player ? playerStatistics?.get(player.id) : null; const appearances = stats?.matches?.filter((item) => matchIds.has(item.matchId) && item.minutes > 0) ?? []; return element("article", { className: "prematch-scorer", attributes: { "data-player-id": player?.id ?? "" } }, [element("strong", { text: leader.name }), element("span", { text: getTeam(teamDirectory, leader.teamId)?.name ?? leader.teamId }), metric("ゴール", leader.goals), metric("アシスト", leader.assists), metric("シュート", "－"), metric("出場", appearances.length || "－"), metric("出場時間", appearances.length ? `${appearances.reduce((sum, item) => sum + item.minutes, 0)}分` : "－")]); })), `${leaders[0].goals}得点`);
}

function seasonToDatePanel(match, home, away, relevant, scope, teamDirectory) {
  const standings = buildStandings(relevant, teamIdsFromMatches(scope)); return createPanel("今期これまでのデータ", element("div", { className: "season-comparison" }, [home, away].map((team) => seasonCard(team, relevant, standings, teamDirectory))), "同一シーズン・同一大会 / 試合日前");
}

function seasonCard(team, matches, standings, teamDirectory) {
  const teamMatches = matches.filter((item) => [item.homeTeam.teamId, item.awayTeam.teamId].includes(team?.id)); const row = standings.find((item) => item.teamId === team?.id); const wins = teamMatches.filter((item) => goalsFor(item, team?.id) > goalsAgainst(item, team?.id)); const losses = teamMatches.filter((item) => goalsFor(item, team?.id) < goalsAgainst(item, team?.id));
  return element("section", { className: "season-comparison__team", attributes: { "data-season-team": team?.id ?? "" } }, [element("header", {}, [createTeamEmblem(team, "team-emblem team-emblem--standing"), element("strong", { text: team?.shortName ?? team?.name })]), metric("順位", row?.rank ?? "－"), metric("勝利", row?.won ?? 0), metric("引分", row?.drawn ?? 0), metric("敗戦", row?.lost ?? 0), metric("平均得点", teamMatches.length ? (row.goalsFor / teamMatches.length).toFixed(2) : "－"), metric("平均被得点", teamMatches.length ? (row.goalsAgainst / teamMatches.length).toFixed(2) : "－"), metric("無失点", teamMatches.filter((item) => goalsAgainst(item, team?.id) === 0).length), metric("最大の勝利", extremeResult(wins, team?.id, true, teamDirectory)), metric("最大の敗北", extremeResult(losses, team?.id, false, teamDirectory))]);
}

function buildStandings(matches, seedTeamIds = []) {
  const map = new Map(); const get = (id) => { if (!map.has(id)) map.set(id, { teamId: id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }); return map.get(id); };
  seedTeamIds.forEach(get);
  for (const match of matches.filter((item) => item.status === "finished" && Number.isFinite(item.homeTeam.score) && Number.isFinite(item.awayTeam.score))) { const home = get(match.homeTeam.teamId); const away = get(match.awayTeam.teamId); home.played += 1; away.played += 1; home.goalsFor += match.homeTeam.score; home.goalsAgainst += match.awayTeam.score; away.goalsFor += match.awayTeam.score; away.goalsAgainst += match.homeTeam.score; if (match.homeTeam.score > match.awayTeam.score) { home.won += 1; away.lost += 1; home.points += 3; } else if (match.homeTeam.score < match.awayTeam.score) { away.won += 1; home.lost += 1; away.points += 3; } else { home.drawn += 1; away.drawn += 1; home.points += 1; away.points += 1; } }
  return [...map.values()].map((row) => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst })).sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.teamId.localeCompare(b.teamId)).map((row, index) => ({ ...row, rank: index + 1 }));
}

function standingTable(rows, teamDirectory, highlighted) {
  const ids = new Set(highlighted.filter(Boolean)); const table = element("table", { className: "prematch-standing-table" }, [element("thead", {}, [element("tr", {}, ["#", "チーム", "試", "勝", "分", "負", "得失", "差", "点"].map((text) => element("th", { text })))]), element("tbody", {}, rows.map((row) => element("tr", { className: ids.has(row.teamId) ? "is-highlighted" : "", attributes: { "data-prematch-standing-team": row.teamId } }, [element("td", { text: row.rank }), element("td", {}, [createTeamNameLink(getTeam(teamDirectory, row.teamId), row.teamId)]), element("td", { text: row.played }), element("td", { text: row.won }), element("td", { text: row.drawn }), element("td", { text: row.lost }), element("td", { text: `${row.goalsFor}-${row.goalsAgainst}` }), element("td", { text: row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference }), element("td", { text: row.points })]))) ]); return element("div", { className: "table-scroll", attributes: { "data-swipe-exclude": "true" } }, [table]);
}

function tournamentMatch(match, teamDirectory, highlighted) { return element("a", { className: `tournament-match-card${highlighted ? " is-highlighted" : ""}`, attributes: { href: routeHref("match", { matchId: match.id }), "data-route": "match", "data-match-id": match.id } }, [element("span", { text: dateLabel(match.kickoffAt) }), element("strong", {}, [element("span", { text: getTeam(teamDirectory, match.homeTeam)?.name ?? match.homeTeam.name }), element("span", { text: match.status === "finished" ? `${match.homeTeam.score} - ${match.awayTeam.score}` : timeLabel(match.kickoffAt) }), element("span", { text: getTeam(teamDirectory, match.awayTeam)?.name ?? match.awayTeam.name })]), match.penaltyShootout ? element("small", { text: `PK ${match.penaltyShootout.home}-${match.penaltyShootout.away}` }) : null]); }
function h2hRow(match) { return element("a", { className: "h2h-history-row", attributes: { href: routeHref("match", { matchId: match.id }), "data-route": "match", "data-match-id": match.id } }, [element("span", { text: longDateLabel(match.kickoffAt) }), element("span", { className: "h2h-match-context", text: match.competitionName ?? match.leagueName ?? "大会名未掲載" }), element("strong", { text: `${match.homeTeam.name} ${match.homeTeam.score}-${match.awayTeam.score} ${match.awayTeam.name}` }), match.penaltyShootout ? element("small", { text: `PK ${match.penaltyShootout.home}-${match.penaltyShootout.away}` }) : null]); }
function summarizeH2h(matches, homeId, awayId) { const result = { homeWins: 0, draws: 0, awayWins: 0, homeGoals: 0, awayGoals: 0 }; for (const item of matches) { const homeGoals = goalsFor(item, homeId); const awayGoals = goalsFor(item, awayId); result.homeGoals += homeGoals; result.awayGoals += awayGoals; if (homeGoals > awayGoals) result.homeWins += 1; else if (homeGoals < awayGoals) result.awayWins += 1; else result.draws += 1; } return result; }
function teamForm(matches, target, teamId) { return previousMatches(matches, target).filter((item) => [item.homeTeam.teamId, item.awayTeam.teamId].includes(teamId)).sort((a, b) => new Date(b.kickoffAt) - new Date(a.kickoffAt)).slice(0, 5).map((item) => { const forGoals = goalsFor(item, teamId); const against = goalsAgainst(item, teamId); return { match: item, opponentId: item.homeTeam.teamId === teamId ? item.awayTeam.teamId : item.homeTeam.teamId, goalsFor: forGoals, goalsAgainst: against, result: forGoals > against ? "W" : forGoals < against ? "L" : "D" }; }); }
function previousMatches(matches, target) { const kickoff = new Date(target.kickoffAt).getTime(); return matches.filter((item) => item.status === "finished" && Number.isFinite(item.homeTeam.score) && Number.isFinite(item.awayTeam.score) && new Date(item.kickoffAt).getTime() < kickoff); }
function goalsFor(match, teamId) { return match.homeTeam.teamId === teamId ? match.homeTeam.score : match.awayTeam.score; }
function goalsAgainst(match, teamId) { return match.homeTeam.teamId === teamId ? match.awayTeam.score : match.homeTeam.score; }
function sameGroup(left, right) { return !right.groupName || left.groupName === right.groupName; }
function teamIdsFromMatches(matches) { return [...new Set(matches.flatMap((item) => [item.homeTeam.teamId, item.awayTeam.teamId]).filter(Boolean))]; }
function isLeagueLike(competition, match) { return ["league", "i-league"].includes(competition?.competitionType) || competition?.competitionType === "rookie-tournament" && Boolean(match.groupName); }
function isTournament(competition, match) { return competition?.competitionType === "tournament" || competition?.competitionType?.includes("playoff") || competition?.competitionType === "rookie-tournament" && !match.groupName; }
function contextTabLabel(competition, match) { if (competition?.dataStatus) return "大会情報"; if (competition?.competitionType === "promotion-relegation") return "大会情報"; return isTournament(competition, match) ? "トーナメント" : "順位表"; }
function competitionCategory(match) { const id = match.competitionId ?? ""; if (id.includes("i-league")) return "Iリーグ"; if (id.includes("championship")) return "選手権"; if (id.includes("rookie")) return "新人戦"; if (id.includes("promotion-relegation")) return "入替戦"; if (id.includes("playoff")) return "プレーオフ"; return "中国大学サッカーリーグ"; }
function selectControl(label, options, onChange) { const select = element("select", { className: "filter-select", attributes: { "aria-label": label } }, options.map(([value, text]) => element("option", { text, attributes: { value } }))); select.addEventListener("change", () => onChange(select.value)); return select; }
function createScoreTeam(team, fallback, side) { return element("div", { className: "prematch-v2-scoreboard__team" }, [createTeamEmblem(team, "team-emblem team-emblem--scoreboard"), createTeamNameLink(team, fallback), element("small", { text: side })]); }
function createH2hTeam(team, wins, label) { return element("div", { className: "h2h-team" }, [createTeamEmblem(team, "team-emblem team-emblem--h2h"), element("strong", { text: wins }), element("span", { text: label })]); }
function detail(label, value) { return element("div", { className: "detail-row" }, [element("span", { text: label }), element("strong", { text: value })]); }
function metric(label, value) { return element("div", { className: "prematch-metric" }, [element("span", { text: label }), element("strong", { text: value })]); }
function extremeResult(items, teamId, winning, teamDirectory) { if (!items.length) return "－"; const sorted = [...items].sort((a, b) => Math.abs(goalsFor(b, teamId) - goalsAgainst(b, teamId)) - Math.abs(goalsFor(a, teamId) - goalsAgainst(a, teamId)) || new Date(b.kickoffAt) - new Date(a.kickoffAt)); const item = sorted[0]; const opponentId = item.homeTeam.teamId === teamId ? item.awayTeam.teamId : item.homeTeam.teamId; return `${goalsFor(item, teamId)}-${goalsAgainst(item, teamId)} ${getTeam(teamDirectory, opponentId)?.shortName ?? getTeam(teamDirectory, opponentId)?.name ?? "相手未掲載"}`; }
function dateLabel(value) { return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short" }).format(new Date(value)); }
function longDateLabel(value) { return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(value)); }
function timeLabel(value) { return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
