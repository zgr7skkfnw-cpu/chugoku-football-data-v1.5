import { createNotice, createPanel, createTeamEmblem, element } from "../ui/elements.js";
import { navigate, routeHref } from "../router.js";
import { enableHorizontalSwipe } from "../ui/swipe.js";
import { getPlayer, normalizePlayerName } from "../utils/players.js";
import { createTeamNameLink } from "./shared.js";
import { renderMatchCompetitionContext, renderMatchHeadToHead, renderTeamForms } from "./scheduled-match.js";

const TABS = ["info", "lineup", "stats", "standings", "head-to-head"];

export function renderFinishedMatchPage({ match, home, away, matches, teamDirectory, playerDirectory, playerStatistics, competition, selectedMatchTab = "info" }) {
  const activeTab = TABS.includes(selectedMatchTab) ? selectedMatchTab : "info";
  const contextLabel = competitionTabLabel(competition, match);
  const page = element("article", { className: "page finished-match-v2", attributes: { "data-page": "match", "data-match-id": match.id, "data-finished-active-tab": activeTab } });
  const scoreboard = element("section", { className: "match-scoreboard finished-scoreboard" }, [
    scoreTeam(home, match.homeTeam.name, "ホーム"),
    element("div", { className: "match-scoreboard__score finished-scoreboard__score" }, [element("strong", { text: `${match.homeTeam.score} - ${match.awayTeam.score}` }), match.penaltyShootout ? element("span", { text: `PK ${match.penaltyShootout.home}-${match.penaltyShootout.away}` }) : null, element("small", { text: "試合終了" })]),
    scoreTeam(away, match.awayTeam.name, "アウェイ"),
  ]);
  const definitions = [["info", "試合情報"], ["lineup", "ラインナップ"], ["stats", "スタッツ"], ["standings", contextLabel], ["head-to-head", "対戦"]];
  const tabs = element("div", { className: "finished-match-tabs", attributes: { role: "tablist", "aria-label": "終了済み試合情報" } });
  const changeTab = (tab) => navigate("match", { matchId: match.id, matchTab: tab });
  tabs.append(...definitions.map(([key, label]) => {
    const selected = key === activeTab;
    const button = element("button", { className: `finished-match-tab${selected ? " is-active" : ""}`, text: label, attributes: { id: `finished-tab-${key}`, type: "button", role: "tab", "aria-selected": String(selected), "aria-controls": `finished-panel-${key}`, tabindex: selected ? "0" : "-1", "data-finished-tab": key } });
    button.addEventListener("click", () => changeTab(key));
    return button;
  }));
  tabs.addEventListener("keydown", (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const next = TABS[(TABS.indexOf(activeTab) + offset + TABS.length) % TABS.length];
    changeTab(next);
  });
  const content = element("div", { className: "finished-match-content", attributes: { id: `finished-panel-${activeTab}`, role: "tabpanel", "aria-labelledby": `finished-tab-${activeTab}`, "data-finished-content": activeTab } });
  const index = TABS.indexOf(activeTab);
  enableHorizontalSwipe(content, { onLeft: () => TABS[index + 1] && changeTab(TABS[index + 1]), onRight: () => TABS[index - 1] && changeTab(TABS[index - 1]) });
  const context = { match, home, away, matches, teamDirectory, playerDirectory, playerStatistics, competition };
  content.append(activeTab === "lineup" ? lineupTab(context) : activeTab === "stats" ? statsTab(context) : activeTab === "standings" ? renderMatchCompetitionContext(context, { includeCurrent: true }) : activeTab === "head-to-head" ? renderMatchHeadToHead(context, { includeCurrent: true }) : informationTab(context));
  page.append(
    element("header", { className: "finished-match-header" }, [element("span", { text: match.competitionName ?? match.leagueName ?? "大会名未掲載" }), element("h1", { text: "試合終了" }), element("p", { text: match.roundLabel ?? (match.round != null ? `第${match.round}節` : "節・ラウンド未掲載") })]),
    scoreboard, periodScores(match), tabs, content,
  );
  return page;
}

function informationTab({ match, home, away, matches, teamDirectory, playerDirectory }) {
  return element("div", { className: "section-stack finished-info" }, [
    createPanel("タイムライン", timeline(match, home, away, playerDirectory), "公式掲載イベント"),
    createPanel("会場・天候", element("div", { className: "detail-list" }, [detail("会場名", match.venue ?? "－"), detail("天候", conditionLabel(match.conditions)), detail("観客数", match.attendance == null ? "－" : `${match.attendance}人`)]), "公式記録掲載項目"),
    createPanel("審判・運営", match.officials?.length ? element("div", { className: "detail-list" }, match.officials.map((official) => detail(official.role, official.name))) : createNotice("審判・運営情報は公式記録未掲載です。"), `${match.officials?.length ?? 0}名`),
    createPanel("その他の公式情報", element("div", { className: "detail-list" }, [detail("日付", longDate(match.kickoffAt)), detail("キックオフ", timeLabel(match.kickoffAt)), detail("試合形式", match.matchFormat ?? "－（未掲載）"), match.wasResumed ? detail("再開日", match.resumedDate?.replaceAll("-", "/") ?? "日付未掲載") : null, match.wasResumed ? detail("備考", match.statusNote ?? "中断後に再開された試合") : null]), "公式試合記録"),
    createPanel("重要スタッツ", overviewStats(match), "試合合計"),
    renderTeamForms(matches, match, [home, away], teamDirectory),
    sourceNotice(match),
  ]);
}

function lineupTab({ match, home, away, matches, teamDirectory, playerDirectory }) {
  if (!match.lineups?.home?.starters?.length && !match.lineups?.away?.starters?.length) return createNotice("ラインナップは公式記録未掲載です。");
  const wrapper = element("div", { className: "section-stack finished-lineups", attributes: { "data-lineups": "official" } });
  const toggle = element("button", { className: "lineup-stats-toggle", text: "今期のスタッツを表示", attributes: { type: "button", "aria-pressed": "false", "data-swipe-exclude": "true" } });
  const grid = element("div", { className: "finished-lineup-grid" });
  const seasonStats = buildSeasonPlayerStats(matches, match);
  const sides = [["home", home], ["away", away]];
  const render = () => {
    const showStats = toggle.getAttribute("aria-pressed") === "true";
    grid.replaceChildren(...sides.map(([side, team]) => lineupTeam(match, side, team, playerDirectory, seasonStats, showStats)));
    toggle.textContent = showStats ? "今期のスタッツを非表示" : "今期のスタッツを表示";
  };
  toggle.addEventListener("click", () => { toggle.setAttribute("aria-pressed", String(toggle.getAttribute("aria-pressed") !== "true")); render(); });
  render();
  const homeCount = match.lineups?.home?.starters?.length ?? 0; const awayCount = match.lineups?.away?.starters?.length ?? 0;
  wrapper.append(toggle, element("small", { className: "lineup-stats-caption", text: "当該大会・当該シーズンのこの試合終了時点" }), grid);
  if ((homeCount && homeCount !== 11) || (awayCount && awayCount !== 11)) wrapper.append(createNotice(`${homeCount !== 11 ? `${match.homeTeam.name} ${homeCount}名` : ""}${homeCount !== 11 && awayCount !== 11 ? "、" : ""}${awayCount !== 11 ? `${match.awayTeam.name} ${awayCount}名` : ""}が公式記録の先発欄に掲載されています。11人目は補完していません。`));
  return wrapper;
}

function lineupTeam(match, side, team, playerDirectory, seasonStats, showStats) {
  const lineup = match.lineups?.[side];
  if (!lineup) return createPanel(team?.name ?? side, createNotice("ラインナップは公式記録未掲載です。"));
  const substitutions = (match.substitutions?.[side] ?? []).map(parseSubstitution);
  const playerRow = (entry, isStarter) => {
    const cleanName = stripCaptain(entry.name); const player = getPlayer(playerDirectory, cleanName, team?.id);
    const sub = substitutions.find((item) => (isStarter ? item.out : item.in) === cleanName);
    const stats = seasonStats.get(`${team?.id}:${normalizePlayerName(cleanName)}`) ?? { goals: 0, assists: 0 };
    const content = [element("span", { className: "lineup-player__number", text: entry.number == null ? "－" : String(entry.number) }), element("strong", { text: cleanName }), entry.name?.includes("[Cap]") ? element("span", { className: "lineup-badge", text: "CAP" }) : null, entry.position === "GK" ? element("span", { className: "lineup-badge", text: "GK" }) : element("span", { className: "lineup-player__position", text: entry.position ?? "－" }), sub ? element("small", { text: isStarter ? `${sub.label} OUT` : `${sub.label} IN` }) : !isStarter ? element("small", { text: "未出場" }) : null, showStats ? element("span", { className: "lineup-season-stats", text: `得点 ${stats.goals} / アシスト ${stats.assists}` }) : null];
    return element("li", { className: "finished-lineup-player" }, [player ? element("a", { className: "lineup-player__link", attributes: { href: routeHref("player", { playerId: player.id }), "data-route": "player", "data-player-id": player.id } }, content) : element("span", { className: "lineup-player__link" }, content)]);
  };
  return createPanel(team?.name ?? lineup.teamName, element("div", {}, [element("h4", { text: "スタメン" }), element("ol", { className: "finished-lineup-list" }, (lineup.starters ?? []).map((entry) => playerRow(entry, true))), element("h4", { text: "控え" }), lineup.substitutes?.length ? element("ol", { className: "finished-lineup-list finished-lineup-list--bench" }, lineup.substitutes.map((entry) => playerRow(entry, false))) : createNotice("控え選手は公式記録未掲載です。"), detail("監督", lineup.manager ?? "公式記録未掲載")]), `先発 ${lineup.starters?.length ?? 0}名`);
}

function statsTab({ match, home, away }) {
  const periods = ["すべて", "前半", "後半", ...(match.scoreByPeriod ?? []).map((item) => item.label).filter((label) => label.includes("延長"))];
  const uniquePeriods = [...new Set(periods)]; let active = "すべて";
  const tabs = element("div", { className: "finished-stats-periods horizontal-scroll", attributes: { "data-swipe-exclude": "true" } });
  const content = element("div");
  const render = () => {
    [...tabs.children].forEach((button) => button.classList.toggle("is-active", button.dataset.period === active));
    if (active !== "すべて") { content.replaceChildren(createNotice(`${active}のスタッツ内訳は公式記録未掲載です。合計値を按分していません。`)); return; }
    content.replaceChildren(createPanel("重要スタッツ", comparisonStats(match, home, away), "試合合計"), createPanel("反則", disciplinaryStats(match, home, away), "公式懲戒記録"), createPanel("選手別シュート数", playerShotRanking(match, home, away), match.playerShots?.length ? `${match.playerShots.length}選手` : "公式記録"));
  };
  tabs.append(...uniquePeriods.map((period) => { const button = element("button", { className: "finished-stats-period", text: period, attributes: { type: "button", "data-period": period } }); button.addEventListener("click", () => { active = period; render(); }); return button; }));
  render(); return element("div", { className: "section-stack finished-stats" }, [tabs, content]);
}

function playerShotRanking(match, home, away) {
  const records = [...(match.playerShots ?? [])]
    .filter((item) => Number.isInteger(item.shots) && item.shots >= 0)
    .sort((left, right) => right.shots - left.shots || left.side.localeCompare(right.side) || left.name.localeCompare(right.name, "ja"));
  if (!records.length) return createNotice("選手別シュート数は公式記録に掲載されていません。");
  let expanded = false;
  const list = element("ol", { className: "player-shot-ranking" });
  const toggle = element("button", { className: "secondary-button player-shot-toggle", text: "全選手を見る", attributes: { type: "button", "aria-expanded": "false" } });
  const render = () => {
    const visible = expanded ? records : records.slice(0, 3);
    let previousShots = null; let previousRank = 0;
    list.replaceChildren(...visible.map((record, index) => {
      const rank = record.shots === previousShots ? previousRank : index + 1;
      previousShots = record.shots; previousRank = rank;
      const team = record.side === "home" ? home : away;
      return element("li", { className: `player-shot-row is-${record.side}` }, [
        element("strong", { text: String(rank) }),
        createTeamEmblem(team, "team-emblem team-emblem--compact"),
        element("div", {}, [element("strong", { text: record.name }), element("span", { text: `${team?.name ?? (record.side === "home" ? match.homeTeam.name : match.awayTeam.name)} / ${record.side.toUpperCase()}` })]),
        element("span", { text: record.number == null ? "－" : `#${record.number}` }),
        element("b", { text: `${record.shots}本` }),
      ]);
    }));
    toggle.textContent = expanded ? "上位3人に戻す" : "全選手を見る";
    toggle.setAttribute("aria-expanded", String(expanded));
  };
  toggle.addEventListener("click", () => { expanded = !expanded; render(); });
  render();
  return element("div", { className: "player-shot-ranking-wrap" }, [list, records.length > 3 ? toggle : null]);
}

function timeline(match, home, away, playerDirectory) {
  const events = []; let sequence = 0;
  for (const goal of match.goals ?? []) { const side = goal.teamName === match.homeTeam.name ? "home" : "away"; const teamId = side === "home" ? home?.id : away?.id; const player = getPlayer(playerDirectory, goal.scorerName, teamId); const minute = eventMinute(goal.minuteLabel ?? goal.minute); events.push({ sequence: sequence++, minute, phase: eventPhase(minute), label: goal.minuteLabel ?? `${goal.minute}分`, side, type: goal.scorerName?.includes("オウンゴール") ? "オウンゴール" : goal.finish === "PK" ? "PKゴール" : "ゴール", title: goal.scorerName ?? "得点者未掲載", player, meta: goal.assistNames?.length ? `アシスト ${goal.assistNames.join("、")}` : "" }); }
  for (const side of ["home", "away"]) for (const raw of match.substitutions?.[side] ?? []) { const parsed = parseSubstitution(raw); const minute = eventMinute(parsed.label); events.push({ sequence: sequence++, minute, phase: eventPhase(minute), label: parsed.label, side, type: "交代", title: `IN ${parsed.in || "－"}`, meta: `OUT ${parsed.out || "－"}` }); }
  for (const side of ["home", "away"]) for (const raw of match.disciplinary?.[side] ?? []) { const parsed = parseDisciplinary(raw); const minute = eventMinute(parsed.label); events.push({ sequence: sequence++, minute, phase: eventPhase(minute), label: parsed.label, side, type: parsed.type, title: parsed.player || raw, meta: parsed.reason }); }
  if (!events.length) return createNotice("公式の試合イベントは掲載されていません。");
  events.sort((a, b) => a.minute - b.minute || a.sequence - b.sequence);
  const children = []; let phase = null; for (const item of events) { if (item.phase !== phase) { phase = item.phase; children.push(element("div", { className: "finished-timeline-phase", text: phase })); } children.push(element("div", { className: `finished-timeline-row is-${item.side}`, attributes: { "data-event-type": item.type } }, [element("div", { className: "finished-timeline-event" }, [element("strong", { text: item.type }), item.player ? element("a", { className: "player-inline-link", text: item.title, attributes: { href: routeHref("player", { playerId: item.player.id }), "data-route": "player", "data-player-id": item.player.id } }) : element("span", { text: item.title }), item.meta ? element("small", { text: item.meta }) : null]), element("time", { text: item.label })])); } return element("div", { className: "finished-timeline" }, children);
}

function overviewStats(match) {
  const stats = match.manualStatistics; const cards = cardCounts(match);
  return element("div", { className: "finished-overview-stats" }, [["総シュート", "shots"], ["コーナーキック", "cornerKicks"], ["オフサイド", "offsides"]].map(([label, key]) => summaryRow(label, stats?.home?.[key], stats?.away?.[key])).concat([summaryRow("イエローカード", cards.home.yellow, cards.away.yellow), summaryRow("レッドカード", cards.home.red, cards.away.red)]));
}

function comparisonStats(match, home, away) {
  const stats = match.manualStatistics;
  return element("div", { className: "finished-stat-comparison" }, [["総シュート数", "shots"], ["オフサイド数", "offsides"], ["コーナーキック数", "cornerKicks"], ["直接フリーキック数", "directFreeKicks"], ["間接フリーキック数", "indirectFreeKicks"]].map(([label, key]) => comparisonRow(label, stats?.home?.[key], stats?.away?.[key], home, away)));
}

function disciplinaryStats(match, home, away) { const cards = cardCounts(match); return element("div", { className: "finished-stat-comparison" }, [comparisonRow("イエローカード", cards.home.yellow, cards.away.yellow, home, away), comparisonRow("2枚目のイエロー", cards.home.secondYellow, cards.away.secondYellow, home, away), comparisonRow("レッドカード", cards.home.red, cards.away.red, home, away)]); }
function comparisonRow(label, homeValue, awayValue, home, away) { const available = homeValue != null || awayValue != null; const h = homeValue ?? null; const a = awayValue ?? null; const total = (h ?? 0) + (a ?? 0); return element("div", { className: "finished-stat-row" }, [element("div", { className: "finished-stat-values" }, [element("strong", { text: h == null ? "－" : h }), element("span", { text: label }), element("strong", { text: a == null ? "－" : a })]), available && total > 0 ? element("div", { className: "finished-stat-bars" }, [element("span", { className: "is-home", attributes: { style: `width:${(h ?? 0) / total * 100}%;background:${home?.primaryColor ?? "var(--accent)"}` } }), element("span", { className: "is-away", attributes: { style: `width:${(a ?? 0) / total * 100}%;background:${away?.primaryColor ?? "#4a82d8"}` } })]) : null]); }
function summaryRow(label, home, away) { return element("div", { className: "finished-overview-row" }, [element("strong", { text: home == null ? "－" : home }), element("span", { text: label }), element("strong", { text: away == null ? "－" : away })]); }
function periodScores(match) { const values = ["前半", "後半", "延長前半", "延長後半"].map((label) => { const row = match.scoreByPeriod?.find((item) => item.label === label); return element("div", { className: "finished-period-score" }, [element("strong", { text: row?.home ?? "－" }), element("span", { text: label }), element("strong", { text: row?.away ?? "－" })]); }); if (match.penaltyShootout) values.push(element("div", { className: "finished-period-score" }, [element("strong", { text: match.penaltyShootout.home }), element("span", { text: "PK" }), element("strong", { text: match.penaltyShootout.away })])); return element("div", { className: "finished-period-scores period-score-list" }, values); }
function scoreTeam(team, fallback, side) { return element("div", { className: "match-scoreboard__team" }, [createTeamEmblem(team, "team-emblem team-emblem--scoreboard"), createTeamNameLink(team, fallback), element("span", { text: side })]); }
function buildSeasonPlayerStats(matches, target) { const map = new Map(); for (const match of matches.filter((item) => item.competitionId === target.competitionId && item.status === "finished" && new Date(item.kickoffAt) <= new Date(target.kickoffAt))) for (const goal of match.goals ?? []) { const team = goal.teamName === match.homeTeam.name ? match.homeTeam : match.awayTeam; const scorerKey = `${team.teamId}:${normalizePlayerName(goal.scorerName)}`; const scorer = map.get(scorerKey) ?? { goals: 0, assists: 0 }; scorer.goals += 1; map.set(scorerKey, scorer); for (const name of goal.assistNames ?? []) { const key = `${team.teamId}:${normalizePlayerName(name)}`; const assist = map.get(key) ?? { goals: 0, assists: 0 }; assist.assists += 1; map.set(key, assist); } } return map; }
function parseSubstitution(raw = "") { const label = raw.match(/^(HT|\d+(?:\s*[＋+]\s*\d+)?\s*分)/)?.[1]?.replace(/\s+/g, " ") ?? "時刻未掲載"; return { label, out: stripCaptain(raw.match(/\[out\](.*?)\s*\[in\]/)?.[1]?.trim() ?? ""), in: stripCaptain(raw.match(/\[in\](.*)$/)?.[1]?.trim() ?? "") }; }
function parseDisciplinary(raw = "") { const label = raw.match(/^(\d+(?:\s*[＋+]\s*\d+)?\s*分|HT)/)?.[1] ?? "時刻未掲載"; const rest = raw.slice(raw.indexOf(label) + label.length).trim(); const code = rest.match(/\s(CS|C\d+|S\d+)\s/)?.[1] ?? ""; const player = code ? rest.slice(0, rest.indexOf(code)).trim() : rest; const reason = code ? rest.slice(rest.indexOf(code) + code.length).trim() : ""; return { label, player, reason, type: code === "CS" ? "2枚目のイエロー" : code.startsWith("S") ? "レッドカード" : "イエローカード" }; }
function cardCounts(match) { const result = { home: { yellow: 0, secondYellow: 0, red: 0 }, away: { yellow: 0, secondYellow: 0, red: 0 } }; for (const side of ["home", "away"]) for (const raw of match.disciplinary?.[side] ?? []) { const type = parseDisciplinary(raw).type; if (type === "レッドカード") result[side].red += 1; else if (type === "2枚目のイエロー") result[side].secondYellow += 1; else result[side].yellow += 1; } return result; }
function eventMinute(value) { if (value === "HT") return 45.5; const text = String(value ?? ""); const base = Number(text.match(/\d+/)?.[0] ?? 999); const extra = Number(text.match(/[＋+]\s*(\d+)/)?.[1] ?? 0); return base + extra / 100; }
function eventPhase(minute) { if (minute <= 45.99) return "前半"; if (minute <= 90.99) return "後半"; if (minute <= 105.99) return "延長前半"; return "延長後半"; }
function stripCaptain(name = "") { return name.replace(/\s*\[Cap\]\s*/g, "").trim(); }
function competitionTabLabel(competition, match) { if (competition?.competitionType === "promotion-relegation") return "大会情報"; const type = competition?.competitionType ?? ""; return type === "tournament" || type.includes("playoff") || type === "rookie-tournament" && !match.groupName ? "トーナメント" : "順位表"; }
function sourceNotice(match) { return createNotice(match.manualOverride ? "公式試合記録を基に手動補完したデータです。" : match.gameId != null ? `football-system / game_id=${match.gameId}` : "試合記録の取得元情報は未掲載です。"); }
function detail(label, value) { return element("div", { className: "detail-row" }, [element("span", { text: label }), element("strong", { text: value })]); }
function conditionLabel(value) { const items = [value?.weather, value?.wind, value?.pitch].filter(Boolean); return items.length ? items.join(" / ") : "－（未掲載）"; }
function longDate(value) { return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(value)); }
function timeLabel(value) { return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
