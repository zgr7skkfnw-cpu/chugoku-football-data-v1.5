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
  content.append(activeTab === "suspensions" ? suspensionsTab(context) : activeTab === "standings" ? renderMatchCompetitionContext(context) : activeTab === "head-to-head" ? renderMatchHeadToHead(context) : previewTab(context));
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
    renderMatchInsights(forms, home, away, matches, match),
    topScorerPanel(context),
    isLeagueLike(competition, match) ? seasonToDatePanel(match, home, away, previousCompetition, competitionScope, teamDirectory) : null,
    createNotice(match.gameId == null ? "公式詳細はまだ公開されていません。日時・対戦カード・会場のみ表示しています。" : "試合終了後、公式詳細が公開されると試合記録へ切り替わります。"),
  ]);
}

function suspensionsTab({ match, home, away }) {
  const suspensions = match.suspensions;
  if (!suspensions?.home?.length && !suspensions?.away?.length) return element("div", { className: "section-stack", attributes: { "data-suspensions": "unpublished" } }, [createNotice("出場停止情報は公式記録未掲載です。公式に確認できない選手を推測表示していません。")]);
  return element("div", { className: "suspension-grid", attributes: { "data-suspensions": "official" } }, [[home, suspensions.home ?? []], [away, suspensions.away ?? []]].map(([team, items]) => createPanel(team?.name ?? "チーム", items.length ? element("div", { className: "detail-list" }, items.map((item) => element("div", { className: "suspension-row" }, [element("strong", { text: item.playerName ?? "選手名未掲載" }), element("span", { text: item.number == null ? "背番号 －" : `背番号 ${item.number}` }), element("span", { text: item.reason ?? "理由未掲載" }), element("small", { text: item.source ?? "公式根拠未掲載" })]))) : createNotice("公式記録未掲載"), "公式情報")));
}

export function renderMatchCompetitionContext(context, { includeCurrent = false } = {}) {
  const { match, home, away, matches, teamDirectory, competition } = context;
  if (competition?.dataStatus === "not-held") return createNotice(competition.message ?? "この大会は開催されません。");
  if (competition?.dataStatus === "not-published") return createNotice(competition.message ?? "大会情報はまだ公式発表されていません。");
  if (isTournament(competition, match)) return tournamentView(context);
  if (competition?.competitionType === "promotion-relegation") return promotionView(context);
  const scope = matches.filter((item) => item.competitionId === match.competitionId && sameGroup(item, match));
  const relevant = (includeCurrent ? matchesThrough(matches, match) : previousMatches(matches, match)).filter((item) => item.competitionId === match.competitionId && sameGroup(item, match));
  const rows = buildStandings(relevant, teamIdsFromMatches(scope));
  return element("div", { className: "section-stack", attributes: { "data-context-type": "standings" } }, [createPanel(match.groupName ? `${match.groupName} 順位表` : "順位表", standingTable(rows, teamDirectory, [home?.id, away?.id]), includeCurrent ? "この試合終了後まで" : "この試合の直前まで"), createNotice(includeCurrent ? "当該試合終了後までの同一大会の試合から再構成しています。" : "当該試合より前に終了した同一大会の試合から再構成しています。"), seasonToDatePanel(match, home, away, relevant, scope, teamDirectory, includeCurrent)]);
}

function tournamentView({ match, matches, teamDirectory }) {
  const competitionMatches = matches.filter((item) => item.competitionId === match.competitionId);
  const rounds = [...new Set(competitionMatches.map((item) => item.roundLabel ?? String(item.round ?? "ラウンド未掲載")))];
  let selectedRound = match.roundLabel ?? String(match.round ?? rounds[0]);
  const wrapper = element("div", { className: "section-stack", attributes: { "data-context-type": "tournament" } });
  let displayMode = "round";
  const modeSwitch = element("div", { className: "tournament-mode-switch", attributes: { role: "tablist", "aria-label": "トーナメント表示形式" } });
  const roundArea = element("div", { className: "tournament-round-view" });
  const overviewArea = element("div", { className: "tournament-overview" });
  const chips = element("div", { className: "tournament-round-tabs horizontal-scroll", attributes: { "data-swipe-exclude": "true" } });
  const list = element("div", { className: "tournament-round-matches" });
  const render = () => {
    [...chips.children].forEach((button) => { const active = button.dataset.round === selectedRound; button.classList.toggle("is-active", active); button.setAttribute("aria-selected", String(active)); });
    list.replaceChildren(...competitionMatches.filter((item) => (item.roundLabel ?? String(item.round ?? "ラウンド未掲載")) === selectedRound).map((item) => tournamentMatch(item, teamDirectory, item.id === match.id)));
  };
  chips.append(...rounds.map((round) => { const button = element("button", { className: "tournament-round-tab", text: round, attributes: { type: "button", role: "tab", "data-round": round } }); button.addEventListener("click", () => { selectedRound = round; render(); }); return button; }));
  const previous = element("button", { className: "button button--compact", text: "前のラウンド", attributes: { type: "button", "aria-label": "前のラウンド" } });
  const next = element("button", { className: "button button--compact", text: "次のラウンド", attributes: { type: "button", "aria-label": "次のラウンド" } });
  previous.addEventListener("click", () => { const index = rounds.indexOf(selectedRound); if (index > 0) { selectedRound = rounds[index - 1]; render(); } });
  next.addEventListener("click", () => { const index = rounds.indexOf(selectedRound); if (index < rounds.length - 1) { selectedRound = rounds[index + 1]; render(); } });
  const bracket = element("div", { className: "tournament-bracket", attributes: { "data-swipe-exclude": "true", tabindex: "0", role: "region", "aria-label": "トーナメント全体図。横方向にスクロールできます" } }, rounds.map((round) => element("section", { className: "tournament-bracket__round", attributes: { "data-bracket-round": round } }, [element("strong", { text: round }), ...competitionMatches.filter((item) => (item.roundLabel ?? String(item.round ?? "")) === round).map((item) => tournamentMatch(item, teamDirectory, item.id === match.id))])));
  const setMode = (mode) => { displayMode = mode; roundArea.hidden = mode !== "round"; overviewArea.hidden = mode !== "overview"; [...modeSwitch.children].forEach((button) => { const active = button.dataset.mode === mode; button.classList.toggle("is-active", active); button.setAttribute("aria-selected", String(active)); }); if (mode === "overview") requestAnimationFrame(() => bracket.querySelector(".is-highlighted")?.scrollIntoView({ inline: "center", block: "nearest" })); };
  modeSwitch.append(...[["overview", "全体"], ["round", "ラウンド別"]].map(([mode, label]) => { const button = element("button", { className: "tournament-mode-button", text: label, attributes: { type: "button", role: "tab", "data-mode": mode } }); button.addEventListener("click", () => setMode(mode)); return button; }));
  roundArea.append(chips, element("div", { className: "tournament-round-navigation" }, [previous, next]), list);
  overviewArea.append(element("p", { className: "horizontal-scroll-hint", text: "横にスクロールして全ラウンドを確認できます。" }), bracket, createNotice("公式な勝ち上がり接続情報は掲載されていません。試合結果から線を推測していません。"));
  render(); setMode(displayMode); wrapper.append(modeSwitch, roundArea, overviewArea); return wrapper;
}

function promotionView({ match, matches, teamDirectory, competition }) {
  const items = matches.filter((item) => item.competitionId === match.competitionId);
  return element("div", { className: "section-stack", attributes: { "data-context-type": "promotion" } }, [createPanel("対戦カード・大会情報", element("div", { className: "tournament-round-matches" }, items.map((item) => tournamentMatch(item, teamDirectory, item.id === match.id))), competition?.formatLabel ?? "公式大会情報"), competition?.notes ? createNotice(competition.notes) : createNotice("昇格・残留条件は公式要項に掲載された情報のみ表示します。")]);
}

export function renderMatchHeadToHead({ match, home, away, matches, teamDirectory }, { includeCurrent = false } = {}) {
  const history = matches.filter((item) => (includeCurrent || item.id !== match.id) && item.status === "finished" && [item.homeTeam.teamId, item.awayTeam.teamId].includes(home?.id) && [item.homeTeam.teamId, item.awayTeam.teamId].includes(away?.id)).sort((a, b) => new Date(b.kickoffAt) - new Date(a.kickoffAt));
  let venueFilter = "all"; let competitionFilter = "all"; let limitFilter = "all";
  const categories = [...new Set(history.map(competitionCategory))];
  const content = element("div");
  const render = () => {
    const scoped = history.filter((item) => (venueFilter === "all" || (venueFilter === "home" ? item.homeTeam.teamId === home?.id : item.awayTeam.teamId === home?.id)) && (competitionFilter === "all" || competitionCategory(item) === competitionFilter));
    const filtered = limitFilter === "all" ? scoped : scoped.slice(0, Number(limitFilter));
    const summary = summarizeH2h(filtered, home?.id, away?.id);
    content.replaceChildren(createPanel("対戦成績", h2hSummaryCard(home, away, summary, filtered), `${filtered.length}試合 / 総得点 ${summary.homeGoals}-${summary.awayGoals}`), createPanel("直近対戦", filtered.length ? element("div", { className: "h2h-history" }, filtered.map((item) => h2hRow(item, match.id))) : createNotice("該当する対戦記録はありません。"), `${filtered.length}試合`));
  };
  const filters = element("div", { className: "prematch-h2h-filters horizontal-scroll", attributes: { "data-swipe-exclude": "true", role: "region", "aria-label": "対戦成績フィルター。横方向にスクロールできます" } }, [selectControl("開催区分", [["all", "すべて"], ["home", "このチームがホーム"], ["away", "このチームがアウェー"]], (value) => { venueFilter = value; render(); }), selectControl("大会", [["all", "すべての大会"], ...categories.map((value) => [value, categoryDisplayName(value)])], (value) => { competitionFilter = value; render(); }), selectControl("期間", [["all", "全期間"], ["5", "直近5試合"], ["10", "直近10試合"]], (value) => { limitFilter = value; render(); })]);
  render(); return element("div", { className: "section-stack prematch-h2h", attributes: { "data-h2h-total": history.length } }, [includeCurrent ? createNotice("この試合を含む通算対戦成績です。") : null, filters, content]);
}

export function renderTeamForms(matches, match, teams, teamDirectory) {
  return createForms(teams.map((team) => ({ team, items: teamForm(matches, match, team?.id) })), teamDirectory);
}

export function renderMatchInsightsForContext({ matches, match, home, away }) {
  return renderMatchInsights([home, away].map((team) => ({ team, items: teamForm(matches, match, team?.id) })), home, away, matches, match);
}

function createForms(forms, teamDirectory) {
  return createPanel("全大会 直近5試合", element("div", { className: "prematch-form-grid" }, forms.map(({ team, items }) => element("section", { className: "prematch-form-team", attributes: { "data-form-team": team?.id ?? "" } }, [element("header", {}, [createTeamEmblem(team, "team-emblem team-emblem--standing"), createTeamNameLink(team, team?.name)]), items.length ? element("div", { className: "prematch-form-list" }, items.map((item) => element("a", { className: `prematch-form-result form-badge--${item.result.toLowerCase()}`, attributes: { href: routeHref("match", { matchId: item.match.id }), "data-route": "match", "data-match-id": item.match.id } }, [createTeamEmblem(getTeam(teamDirectory, item.opponentId), "team-emblem team-emblem--compact"), element("strong", { text: `${item.result === "W" ? "○" : item.result === "D" ? "△" : "●"} ${item.goalsFor}-${item.goalsAgainst}` }), element("small", { text: item.match.competitionName ?? item.match.leagueName ?? "大会名未掲載" })]))) : createNotice("過去の終了試合はありません。")]))), "試合日より前");
}

export function renderMatchInsights(forms, home, away, matches, match) {
  const insights = [];
  for (const { team, items } of forms) {
    if (!items.length) continue;
    const wins = items.filter((item) => item.result === "W").length; const draws = items.filter((item) => item.result === "D").length; const losses = items.length - wins - draws;
    if (wins >= 3) insights.push({ text: `${team?.shortName ?? team?.name}は直近${items.length}試合で${wins}勝`, basis: `直近${items.length}試合`, priority: 1 });
    const unbeaten = items.findIndex((item) => item.result === "L"); const unbeatenCount = unbeaten === -1 ? items.length : unbeaten;
    if (unbeatenCount >= 3) insights.push({ text: `${team?.shortName ?? team?.name}は${unbeatenCount}試合連続無敗`, basis: `直近${unbeatenCount}試合`, priority: 0 });
    const cleanSheets = items.filter((item) => item.goalsAgainst === 0).length;
    if (cleanSheets >= 2) insights.push({ text: `${team?.shortName ?? team?.name}は${items.length}試合中${cleanSheets}試合で無失点`, basis: `直近${items.length}試合`, priority: 4 });
    const concededRun = items.findIndex((item) => item.goalsAgainst === 0); const conceded = concededRun === -1 ? items.length : concededRun;
    if (conceded >= 3) insights.push({ text: `${team?.shortName ?? team?.name}は${conceded}試合連続で失点`, basis: `直近${conceded}試合`, priority: 4 });
  }
  const direct = matches.filter((item) => item.id !== match.id && item.status === "finished" && [item.homeTeam.teamId, item.awayTeam.teamId].includes(home?.id) && [item.homeTeam.teamId, item.awayTeam.teamId].includes(away?.id)).sort((a, b) => new Date(b.kickoffAt) - new Date(a.kickoffAt)).slice(0, 3);
  if (direct.length) { const homeWins = direct.filter((item) => goalsFor(item, home?.id) > goalsAgainst(item, home?.id)).length; if (homeWins >= 2) insights.push({ text: `この対戦では${home?.shortName ?? home?.name}が直近${direct.length}試合で${homeWins}勝`, basis: "通算対戦", priority: 1 }); }
  const unique = [...new Map(insights.sort((a, b) => a.priority - b.priority).map((item) => [item.text, item])).values()].slice(0, 5);
  return unique.length ? createPanel("インサイト", element("ul", { className: "prematch-insights", attributes: { "data-insight-count": unique.length } }, unique.map((item) => element("li", {}, [element("strong", { text: item.text }), element("small", { text: item.basis })]))), "登録済み試合から機械集計") : null;
}

function topScorerPanel({ match, matches, playerDirectory, playerStatistics, teamDirectory }) {
  const eligible = previousMatches(matches, match).filter((item) => item.competitionId === match.competitionId);
  const matchIds = new Set(eligible.map((item) => item.id)); const totals = new Map();
  for (const item of eligible) for (const goal of item.goals ?? []) { const side = goal.teamName === item.homeTeam.name ? item.homeTeam : item.awayTeam; const key = `${side.teamId}:${normalizePlayerName(goal.scorerName)}`; const value = totals.get(key) ?? { name: goal.scorerName, teamId: side.teamId, goals: 0, assists: 0 }; value.goals += 1; totals.set(key, value); for (const assistName of goal.assistNames ?? []) { const assistKey = `${side.teamId}:${normalizePlayerName(assistName)}`; const assist = totals.get(assistKey) ?? { name: assistName, teamId: side.teamId, goals: 0, assists: 0 }; assist.assists += 1; totals.set(assistKey, assist); } }
  const leaders = [...totals.values()].sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name, "ja")).filter((item, _, all) => item.goals > 0 && item.goals === all[0]?.goals);
  if (!leaders.length) return createNotice("得点ランキングは公式記録公開後に表示します。");
  const visible = leaders.slice(0, 3);
  return createPanel("得点王", element("div", { className: "prematch-scorer-list" }, [...visible.map((leader) => { const player = getPlayer(playerDirectory, leader.name, leader.teamId); const stats = player ? playerStatistics?.get(player.id) : null; const appearances = stats?.matches?.filter((item) => matchIds.has(item.matchId) && item.minutes > 0) ?? []; const minutes = appearances.length ? appearances.reduce((sum, item) => sum + item.minutes, 0) : null; const card = element(player ? "a" : "article", { className: "prematch-scorer", attributes: { ...(player ? { href: routeHref("player", { playerId: player.id }), "data-route": "player" } : {}), "data-player-id": player?.id ?? "" } }, [element("strong", { text: leader.name }), element("span", { text: getTeam(teamDirectory, leader.teamId)?.name ?? leader.teamId }), metric("背番号", player?.number ?? "－"), metric("ゴール", leader.goals), metric("アシスト", leader.assists), metric("シュート", "－"), metric("出場", appearances.length || "－"), metric("出場時間", minutes == null ? "－" : `${minutes}分`), metric("90分当たり", minutes > 0 ? (leader.goals * 90 / minutes).toFixed(2) : "－")]); return card; }), leaders.length > 3 ? element("p", { className: "prematch-scorer-more", text: `ほか${leaders.length - 3}名` }) : null]), `${leaders[0].goals}得点 / 同率${leaders.length}名`);
}

function seasonToDatePanel(match, home, away, relevant, scope, teamDirectory, includeCurrent = false) {
  const standings = buildStandings(relevant, teamIdsFromMatches(scope));
  const cards = [home, away].map((team) => seasonValues(team, relevant, standings, teamDirectory));
  return createPanel("今期これまでのデータ", seasonComparisonTable(cards), includeCurrent ? "この試合終了後まで" : "この試合の直前まで");
}

function seasonValues(team, matches, standings, teamDirectory) {
  const teamMatches = matches.filter((item) => [item.homeTeam.teamId, item.awayTeam.teamId].includes(team?.id)); const row = standings.find((item) => item.teamId === team?.id); const wins = teamMatches.filter((item) => goalsFor(item, team?.id) > goalsAgainst(item, team?.id)); const losses = teamMatches.filter((item) => goalsFor(item, team?.id) < goalsAgainst(item, team?.id));
  return { team, rank: row?.rank ?? null, played: row?.played ?? 0, won: row?.won ?? 0, drawn: row?.drawn ?? 0, lost: row?.lost ?? 0, points: row?.points ?? 0, averageFor: teamMatches.length ? row.goalsFor / teamMatches.length : null, averageAgainst: teamMatches.length ? row.goalsAgainst / teamMatches.length : null, goalDifference: row?.goalDifference ?? 0, cleanSheets: teamMatches.filter((item) => goalsAgainst(item, team?.id) === 0).length, biggestWin: extremeResult(wins, team?.id, true, teamDirectory), biggestLoss: extremeResult(losses, team?.id, false, teamDirectory), winningStreak: leadingStreak(teamMatches, team?.id, "W"), winless: leadingStreak(teamMatches, team?.id, "notW") };
}

function seasonComparisonTable(values) { const [home, away] = values; const rows = [["順位", "rank", "lower"], ["試合数", "played"], ["勝利", "won", "higher"], ["引き分け", "drawn"], ["敗戦", "lost", "lower"], ["勝点", "points", "higher"], ["平均得点", "averageFor", "higher"], ["平均被得点", "averageAgainst", "lower"], ["得失点差", "goalDifference", "higher"], ["無失点", "cleanSheets", "higher"], ["最大の勝利", "biggestWin"], ["最大の敗北", "biggestLoss"], ["連勝数", "winningStreak", "higher"], ["未勝利試合数", "winless", "lower"]]; return element("div", { className: "season-comparison season-comparison-table" }, [element("header", {}, [teamHeading(home.team), element("strong", { text: "比較項目" }), teamHeading(away.team)]), ...rows.map(([label, key, preference]) => comparisonMetric(label, home[key], away[key], preference, key))]); }

function buildStandings(matches, seedTeamIds = []) {
  const map = new Map(); const get = (id) => { if (!map.has(id)) map.set(id, { teamId: id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }); return map.get(id); };
  seedTeamIds.forEach(get);
  for (const match of matches.filter((item) => item.status === "finished" && Number.isFinite(item.homeTeam.score) && Number.isFinite(item.awayTeam.score))) { const home = get(match.homeTeam.teamId); const away = get(match.awayTeam.teamId); home.played += 1; away.played += 1; home.goalsFor += match.homeTeam.score; home.goalsAgainst += match.awayTeam.score; away.goalsFor += match.awayTeam.score; away.goalsAgainst += match.homeTeam.score; if (match.homeTeam.score > match.awayTeam.score) { home.won += 1; away.lost += 1; home.points += 3; } else if (match.homeTeam.score < match.awayTeam.score) { away.won += 1; home.lost += 1; away.points += 3; } else { home.drawn += 1; away.drawn += 1; home.points += 1; away.points += 1; } }
  return [...map.values()].map((row) => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst })).sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.teamId.localeCompare(b.teamId)).map((row, index) => ({ ...row, rank: index + 1 }));
}

function standingTable(rows, teamDirectory, highlighted) {
  const ids = new Set(highlighted.filter(Boolean)); const table = element("table", { className: "prematch-standing-table" }, [element("thead", {}, [element("tr", {}, ["#", "チーム", "試", "勝", "分", "負", "得失", "差", "点"].map((text) => element("th", { text })))]), element("tbody", {}, rows.map((row) => element("tr", { className: ids.has(row.teamId) ? "is-highlighted" : "", attributes: { "data-prematch-standing-team": row.teamId } }, [element("td", { text: row.rank }), element("td", {}, [createTeamNameLink(getTeam(teamDirectory, row.teamId), row.teamId)]), element("td", { text: row.played }), element("td", { text: row.won }), element("td", { text: row.drawn }), element("td", { text: row.lost }), element("td", { text: `${row.goalsFor}-${row.goalsAgainst}` }), element("td", { text: row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference }), element("td", { text: row.points })]))) ]); return element("div", { className: "table-scroll", attributes: { "data-swipe-exclude": "true" } }, [table]);
}

function tournamentMatch(match, teamDirectory, highlighted) { const home = getTeam(teamDirectory, match.homeTeam); const away = getTeam(teamDirectory, match.awayTeam); const homeWon = match.status === "finished" && (match.homeTeam.score > match.awayTeam.score || match.homeTeam.score === match.awayTeam.score && match.penaltyShootout?.home > match.penaltyShootout?.away); const awayWon = match.status === "finished" && (match.awayTeam.score > match.homeTeam.score || match.homeTeam.score === match.awayTeam.score && match.penaltyShootout?.away > match.penaltyShootout?.home); return element("a", { className: `tournament-match-card${highlighted ? " is-highlighted" : ""}`, attributes: { href: routeHref("match", { matchId: match.id }), "data-route": "match", "data-match-id": match.id, "aria-label": `${match.roundLabel ?? "ラウンド"} ${match.homeTeam.name} 対 ${match.awayTeam.name}` } }, [element("span", { text: `${match.roundLabel ?? "ラウンド未掲載"} ・ ${dateLabel(match.kickoffAt)}` }), element("div", { className: `tournament-team-row${homeWon ? " is-winner" : ""}` }, [createTeamEmblem(home, "team-emblem team-emblem--compact"), element("strong", { text: home?.name ?? match.homeTeam.name }), element("b", { text: match.status === "finished" ? match.homeTeam.score : "－" }), homeWon ? element("small", { text: "勝者" }) : null]), element("div", { className: `tournament-team-row${awayWon ? " is-winner" : ""}` }, [createTeamEmblem(away, "team-emblem team-emblem--compact"), element("strong", { text: away?.name ?? match.awayTeam.name }), element("b", { text: match.status === "finished" ? match.awayTeam.score : timeLabel(match.kickoffAt) }), awayWon ? element("small", { text: "勝者" }) : null]), match.penaltyShootout ? element("small", { text: `PK ${match.penaltyShootout.home}-${match.penaltyShootout.away}` }) : null]); }
function h2hRow(match, currentId) { return element("a", { className: `h2h-history-row${match.id === currentId ? " is-current" : ""}`, attributes: { href: routeHref("match", { matchId: match.id }), "data-route": "match", "data-match-id": match.id } }, [element("span", { text: longDateLabel(match.kickoffAt) }), element("span", { className: "h2h-match-context", text: `${match.competitionName ?? match.leagueName ?? "大会名未掲載"} / ${match.roundLabel ?? (match.round != null ? `第${match.round}節` : "区分未掲載")}` }), element("strong", { text: `${match.homeTeam.name} ${match.homeTeam.score}-${match.awayTeam.score} ${match.awayTeam.name}` }), match.penaltyShootout ? element("small", { text: `PK ${match.penaltyShootout.home}-${match.penaltyShootout.away}` }) : null, match.id === currentId ? element("em", { text: "この試合" }) : null]); }
function summarizeH2h(matches, homeId, awayId) { const result = { homeWins: 0, draws: 0, awayWins: 0, homeGoals: 0, awayGoals: 0, maximumMargin: 0, recentWinner: "引き分け" }; for (const item of matches) { const homeGoals = goalsFor(item, homeId); const awayGoals = goalsFor(item, awayId); result.homeGoals += homeGoals; result.awayGoals += awayGoals; result.maximumMargin = Math.max(result.maximumMargin, Math.abs(homeGoals - awayGoals)); if (homeGoals > awayGoals) result.homeWins += 1; else if (homeGoals < awayGoals) result.awayWins += 1; else result.draws += 1; } if (matches[0]) { const h = goalsFor(matches[0], homeId); const a = goalsFor(matches[0], awayId); result.recentWinner = h > a ? "home" : h < a ? "away" : "draw"; } return result; }
function h2hSummaryCard(home, away, summary, matches) { const total = matches.length; const percentage = (value) => total ? Math.round(value / total * 100) : 0; return element("div", { className: "h2h-visual-summary" }, [element("div", { className: "h2h-summary" }, [createH2hTeam(home, summary.homeWins, `勝利 ${percentage(summary.homeWins)}%`), element("div", { className: "h2h-draws" }, [element("strong", { text: String(summary.draws) }), element("span", { text: `引分 ${percentage(summary.draws)}%` })]), createH2hTeam(away, summary.awayWins, `勝利 ${percentage(summary.awayWins)}%`)]), total ? element("div", { className: "h2h-ratio", attributes: { role: "img", "aria-label": `ホーム勝利${summary.homeWins}、引き分け${summary.draws}、アウェー勝利${summary.awayWins}` } }, [["home", summary.homeWins, "ホーム勝"], ["draw", summary.draws, "引分"], ["away", summary.awayWins, "アウェー勝"]].filter(([, value]) => value).map(([type, value, label]) => element("span", { className: `is-${type}`, text: `${label} ${value}`, attributes: { style: `width:${value / total * 100}%` } }))) : null, element("div", { className: "h2h-extra-metrics" }, [metric("総対戦数", total), metric("総得点", `${summary.homeGoals}-${summary.awayGoals}`), metric("最大得点差", total ? summary.maximumMargin : "－"), metric("直近の勝者", summary.recentWinner === "home" ? home?.shortName ?? home?.name : summary.recentWinner === "away" ? away?.shortName ?? away?.name : total ? "引き分け" : "－")])]); }
function teamForm(matches, target, teamId) { return previousMatches(matches, target).filter((item) => [item.homeTeam.teamId, item.awayTeam.teamId].includes(teamId)).sort((a, b) => new Date(b.kickoffAt) - new Date(a.kickoffAt)).slice(0, 5).map((item) => { const forGoals = goalsFor(item, teamId); const against = goalsAgainst(item, teamId); return { match: item, opponentId: item.homeTeam.teamId === teamId ? item.awayTeam.teamId : item.homeTeam.teamId, goalsFor: forGoals, goalsAgainst: against, result: forGoals > against ? "W" : forGoals < against ? "L" : "D" }; }); }
function previousMatches(matches, target) { const kickoff = new Date(target.kickoffAt).getTime(); return matches.filter((item) => item.status === "finished" && Number.isFinite(item.homeTeam.score) && Number.isFinite(item.awayTeam.score) && new Date(item.kickoffAt).getTime() < kickoff); }
function matchesThrough(matches, target) { const kickoff = new Date(target.kickoffAt).getTime(); return matches.filter((item) => item.status === "finished" && Number.isFinite(item.homeTeam.score) && Number.isFinite(item.awayTeam.score) && new Date(item.kickoffAt).getTime() <= kickoff); }
function goalsFor(match, teamId) { return match.homeTeam.teamId === teamId ? match.homeTeam.score : match.awayTeam.score; }
function goalsAgainst(match, teamId) { return match.homeTeam.teamId === teamId ? match.awayTeam.score : match.homeTeam.score; }
function sameGroup(left, right) { return !right.groupName || left.groupName === right.groupName; }
function teamIdsFromMatches(matches) { return [...new Set(matches.flatMap((item) => [item.homeTeam.teamId, item.awayTeam.teamId]).filter(Boolean))]; }
function isLeagueLike(competition, match) { return ["league", "i-league"].includes(competition?.competitionType) || competition?.competitionType === "rookie-tournament" && Boolean(match.groupName); }
function isTournament(competition, match) { return competition?.competitionType === "tournament" || competition?.competitionType?.includes("playoff") || competition?.competitionType === "rookie-tournament" && !match.groupName; }
function contextTabLabel(competition, match) { if (competition?.dataStatus) return "大会情報"; if (competition?.competitionType === "promotion-relegation") return "大会情報"; return isTournament(competition, match) ? "トーナメント" : "順位表"; }
function competitionCategory(match) { const id = match.competitionId ?? ""; if (id.includes("i-league")) return "Iリーグ"; if (id.includes("championship")) return "選手権"; if (id.includes("rookie")) return "新人戦"; if (id.includes("promotion-relegation")) return "入替戦"; if (id.includes("playoff")) return "プレーオフ"; return "中国大学サッカーリーグ"; }
function categoryDisplayName(value) { return { 選手権: "中国大学サッカー選手権", 新人戦: "中国大学サッカー新人戦" }[value] ?? value; }
function selectControl(label, options, onChange) { const select = element("select", { className: "filter-select", attributes: { "aria-label": label } }, options.map(([value, text]) => element("option", { text, attributes: { value } }))); select.addEventListener("change", () => onChange(select.value)); return select; }
function createScoreTeam(team, fallback, side) { return element("div", { className: "prematch-v2-scoreboard__team" }, [createTeamEmblem(team, "team-emblem team-emblem--scoreboard"), createTeamNameLink(team, fallback), element("small", { text: side })]); }
function createH2hTeam(team, wins, label) { return element("div", { className: "h2h-team" }, [createTeamEmblem(team, "team-emblem team-emblem--h2h"), element("strong", { text: wins }), element("span", { text: label })]); }
function detail(label, value) { return element("div", { className: "detail-row" }, [element("span", { text: label }), element("strong", { text: value })]); }
function metric(label, value) { return element("div", { className: "prematch-metric" }, [element("span", { text: label }), element("strong", { text: value })]); }
function teamHeading(team) { return element("span", { className: "season-comparison-team season-comparison__team" }, [createTeamEmblem(team, "team-emblem team-emblem--compact"), element("strong", { text: team?.shortName ?? team?.name ?? "チーム未掲載" })]); }
function comparisonMetric(label, homeValue, awayValue, preference, key) { const format = (value) => value == null ? "－" : key?.startsWith("average") ? Number(value).toFixed(2) : value; const comparable = typeof homeValue === "number" && typeof awayValue === "number" && homeValue !== awayValue && preference; const homeBetter = comparable && (preference === "lower" ? homeValue < awayValue : homeValue > awayValue); const awayBetter = comparable && !homeBetter; return element("div", { className: "season-comparison-row", attributes: { "data-metric": key } }, [element("strong", { className: homeBetter ? "is-better" : "", text: format(homeValue) }), element("span", { text: label }), element("strong", { className: awayBetter ? "is-better" : "", text: format(awayValue) })]); }
function leadingStreak(matches, teamId, mode) { const ordered = [...matches].sort((a, b) => new Date(b.kickoffAt) - new Date(a.kickoffAt)); let count = 0; for (const item of ordered) { const result = goalsFor(item, teamId) > goalsAgainst(item, teamId) ? "W" : goalsFor(item, teamId) < goalsAgainst(item, teamId) ? "L" : "D"; if (mode === "W" ? result === "W" : result !== "W") count += 1; else break; } return count; }
function extremeResult(items, teamId, winning, teamDirectory) { if (!items.length) return "－"; const sorted = [...items].sort((a, b) => Math.abs(goalsFor(b, teamId) - goalsAgainst(b, teamId)) - Math.abs(goalsFor(a, teamId) - goalsAgainst(a, teamId)) || new Date(b.kickoffAt) - new Date(a.kickoffAt)); const item = sorted[0]; const opponentId = item.homeTeam.teamId === teamId ? item.awayTeam.teamId : item.homeTeam.teamId; return `${goalsFor(item, teamId)}-${goalsAgainst(item, teamId)} ${getTeam(teamDirectory, opponentId)?.shortName ?? getTeam(teamDirectory, opponentId)?.name ?? "相手未掲載"}`; }
function dateLabel(value) { return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short" }).format(new Date(value)); }
function longDateLabel(value) { return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(value)); }
function timeLabel(value) { return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
