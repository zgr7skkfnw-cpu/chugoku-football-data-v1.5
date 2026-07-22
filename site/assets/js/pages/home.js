import { createNotice, createTeamEmblem, element } from "../ui/elements.js";
import { createMatchRow } from "./shared.js";
import { navigate, routeHref } from "../router.js";
import { enableHorizontalSwipe } from "../ui/swipe.js";

const JST_TIME_ZONE = "Asia/Tokyo";
const collapsedByDate = new Map();

export function renderHomePage({ matches, teamDirectory, favoriteTeamIds = [], selectedDate }) {
  const currentSeason = Number(todayKey().slice(0, 4));
  const seasonMatches = matches.filter((match) => match.season === currentSeason);
  const activeDate = selectedDate ?? todayKey();
  const selectedMatches = seasonMatches
    .filter((match) => dateKey(match.kickoffAt) === activeDate)
    .sort((a, b) => new Date(a.kickoffAt) - new Date(b.kickoffAt));
  const page = element("article", { className: "page home-feed", attributes: { "data-page": "home", "data-selected-date": activeDate } });
  const changeDate = (date) => navigate("home", { date, replace: true });
  const dateNavigation = createDateControls(activeDate, changeDate);
  enableHorizontalSwipe(page, { onLeft: () => changeDate(shiftDate(activeDate, 1)), onRight: () => changeDate(shiftDate(activeDate, -1)) });

  const content = element("div", { className: "home-feed__content" }, [
    dateNavigation,
    activeDate === shiftDate(todayKey(), 1)
      ? createTomorrowFavorite(selectedMatches, favoriteTeamIds, teamDirectory)
      : null,
    selectedMatches.length
      ? element("div", { className: "league-schedule-groups", attributes: { "data-date-matches": String(selectedMatches.length) } }, createScheduleGroups(selectedMatches, teamDirectory, activeDate))
      : createNotice(activeDate === todayKey() ? "今日の試合はありません" : "この日の試合はありません"),
  ]);
  page.append(content);
  return page;
}

function createScheduleGroups(matches, teamDirectory, selectedDate) {
  const definitions = [...new Map([...matches].sort((a, b) => competitionOrder(a) - competitionOrder(b)).map((match) => [match.competitionId, match])).values()];
  return definitions.map((definition) => {
    const leagueMatches = matches.filter((match) => match.competitionId === definition.competitionId);
    const collapsed = collapsedByDate.get(selectedDate)?.has(definition.competitionId) ?? false;
    const body = element("div", { className: "match-list collapsible-competition__body" }, leagueMatches.map((match) => createMatchRow(match, teamDirectory)));
    body.hidden = collapsed;
    const arrow = element("span", { className: "collapsible-competition__arrow", text: collapsed ? "⌄" : "⌃", attributes: { "aria-hidden": "true" } });
    const button = element("button", { className: "collapsible-competition__toggle", attributes: { type: "button", "aria-expanded": String(!collapsed) } }, [
      element("span", { className: "collapsible-competition__name", text: competitionLabel(definition) }),
      element("span", { className: "collapsible-competition__count", text: String(leagueMatches.length) }),
      arrow,
    ]);
    button.addEventListener("click", () => {
      const set = collapsedByDate.get(selectedDate) ?? new Set();
      body.hidden = !body.hidden;
      if (body.hidden) set.add(definition.competitionId); else set.delete(definition.competitionId);
      collapsedByDate.set(selectedDate, set);
      button.setAttribute("aria-expanded", String(!body.hidden));
      arrow.textContent = body.hidden ? "⌄" : "⌃";
    });
    return element("section", { className: "collapsible-competition", attributes: { "data-competition-id": definition.competitionId } }, [button, body]);
  });
}

function createTomorrowFavorite(matches, favoriteTeamIds, teamDirectory) {
  const followedIds = new Set(favoriteTeamIds);
  const followed = matches
    .filter((match) => followedIds.has(match.homeTeam.teamId) || followedIds.has(match.awayTeam.teamId))
    .sort((left, right) => new Date(left.kickoffAt) - new Date(right.kickoffAt));
  return element("section", { className: "tomorrow-following" }, [
    element("h1", { text: "フォロー中のチームの試合" }),
    followed.length ? element("div", { className: "tomorrow-following__list" }, followed.map((match) => {
      const home = teamDirectory.byId.get(match.homeTeam.teamId);
      const away = teamDirectory.byId.get(match.awayTeam.teamId);
      return element("a", { className: "tomorrow-following__card", attributes: { href: routeHref("match", { matchId: match.id }), "data-route": "match", "data-match-id": match.id } }, [
        createTeamEmblem(home, "team-emblem team-emblem--compact"),
        element("span", {}, [element("strong", { text: weekday(match.kickoffAt) }), element("small", { text: shortTime(match.kickoffAt) })]),
        createTeamEmblem(away, "team-emblem team-emblem--compact"),
      ]);
    })) : createNotice("フォロー中のチームの試合はありません。"),
  ]);
}

function createDateControls(selectedDate, onSelect) {
  const controls = element("section", { className: "match-date-navigation", attributes: { "aria-label": "試合日を選択" } });
  const dates = [-2, -1, 0, 1, 2].map((offset) => shiftDate(selectedDate, offset));
  const previous = element("button", { className: "date-arrow", text: "‹", attributes: { type: "button", "aria-label": "前日" } });
  const next = element("button", { className: "date-arrow", text: "›", attributes: { type: "button", "aria-label": "翌日" } });
  previous.addEventListener("click", () => onSelect(shiftDate(selectedDate, -1)));
  next.addEventListener("click", () => onSelect(shiftDate(selectedDate, 1)));
  const strip = element("div", { className: "home-date-strip" }, dates.map((date, index) => {
    const button = element("button", { className: `home-date-button${index === 2 ? " is-active" : ""}`, attributes: { type: "button", "aria-pressed": String(index === 2), "data-date": date } }, [
      element("small", { text: relativeDateLabel(date) }), element("strong", { text: dayLabel(date) }),
    ]);
    button.addEventListener("click", () => onSelect(date)); return button;
  }));
  const today = element("button", { className: "today-button", text: "今日", attributes: { type: "button" } });
  today.addEventListener("click", () => onSelect(todayKey()));
  controls.append(previous, strip, next, today);
  return controls;
}

function competitionLabel(match) { return match.stageId === "regular" ? match.leagueName : `${match.leagueName} / ${match.stageName}`; }
function competitionOrder(match) { if (match.stageId === "regular" && match.division === 1) return 1; if (match.stageId === "regular" && match.division === 2) return 2; if (match.stageId === "i-league-regular") return 3 + (match.division ?? 0) / 10; if (match.stageId === "championship") return 4; if (match.stageId === "rookie") return 5; return 9; }
function todayKey() { return new Intl.DateTimeFormat("sv-SE", { timeZone: JST_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function dateKey(value) { return new Intl.DateTimeFormat("sv-SE", { timeZone: JST_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); }
function shiftDate(date, amount) { const value = new Date(`${date}T12:00:00+09:00`); value.setDate(value.getDate() + amount); return dateKey(value); }
function dayLabel(date) { return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "short", timeZone: JST_TIME_ZONE }).format(new Date(`${date}T12:00:00+09:00`)); }
function relativeDateLabel(date) { const offset = Math.round((new Date(`${date}T12:00:00+09:00`) - new Date(`${todayKey()}T12:00:00+09:00`)) / 86400000); return offset === 0 ? "今日" : offset === -1 ? "昨日" : offset === 1 ? "明日" : weekday(date); }
function weekday(value) { return new Intl.DateTimeFormat("ja-JP", { weekday: "short", timeZone: JST_TIME_ZONE }).format(new Date(value.includes?.("T") ? value : `${value}T12:00:00+09:00`)); }
function shortTime(value) { return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: JST_TIME_ZONE }).format(new Date(value)); }
