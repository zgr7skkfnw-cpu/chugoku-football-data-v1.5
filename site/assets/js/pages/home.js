import { createNotice, createPanel, element } from "../ui/elements.js";
import { createMatchRow } from "./shared.js";
import { saveFavoriteTeamId } from "../utils/favorites.js";
import { setState } from "../state.js";
import { createSeasonSelect } from "../ui/season-select.js";

const JST_TIME_ZONE = "Asia/Tokyo";

export function renderHomePage({ matches, teamDirectory, favoriteTeamId, teams, selectedSeason, availableSeasons }) {
  const favoriteTeam = teamDirectory?.byId.get(favoriteTeamId) ?? null;
  const seasonMatches = matches.filter((match) => match.season === selectedSeason);
  const page = element("article", { className: "page home-feed", attributes: { "data-page": "home" } });
  const content = element("div", { className: "home-feed__content" });
  let selectedDate = defaultDate(seasonMatches, selectedSeason);

  const renderDate = () => {
    const selectedMatches = seasonMatches
      .filter((match) => dateKey(match.kickoffAt) === selectedDate)
      .sort((left, right) => favoritePriority(right, favoriteTeam) - favoritePriority(left, favoriteTeam)
        || left.division - right.division
        || new Date(left.kickoffAt) - new Date(right.kickoffAt));
    const tomorrowKey = shiftDate(selectedDate, 1);
    const tomorrowMatches = seasonMatches
      .filter((match) => dateKey(match.kickoffAt) === tomorrowKey)
      .sort((left, right) => favoritePriority(right, favoriteTeam) - favoritePriority(left, favoriteTeam)
        || new Date(left.kickoffAt) - new Date(right.kickoffAt));

    content.replaceChildren(...[
      createSeasonSelect(selectedSeason, availableSeasons),
      createDateControls(selectedDate, (nextDate) => { selectedDate = nextDate; renderDate(); }),
      createMatchDayHeading(selectedDate, selectedMatches.length),
      selectedMatches.length
        ? element("div", { className: "section-stack league-schedule-groups", attributes: { "data-date-matches": String(selectedMatches.length) } }, createScheduleGroups(selectedMatches, favoriteTeam, teamDirectory))
        : createNotice(selectedDate === todayKey() ? "今日の試合はありません" : "この日の試合はありません"),
      selectedMatches.length === 0 && tomorrowMatches.length
        ? createPanel("明日の試合", element("div", { className: "section-stack tomorrow-match-list" }, createScheduleGroups(tomorrowMatches, favoriteTeam, teamDirectory)), `${shortTime(tomorrowMatches[0].kickoffAt)}開始`)
        : null,
      favoriteTeam ? null : createFavoritePrompt(teams),
    ].filter(Boolean));
  };

  renderDate();
  page.append(content);
  return page;
}

function createMatchDayHeading(selectedDate, count) {
  return element("header", { className: "home-match-day" }, [
    element("h1", { text: selectedDate === todayKey() ? "今日の試合" : displayDate(selectedDate) }),
    element("span", { text: `${count}試合` }),
  ]);
}

function createScheduleGroups(matches, favoriteTeam, teamDirectory) {
  const followed = favoriteTeam ? matches.filter((match) => favoritePriority(match, favoriteTeam)) : [];
  const followedIds = new Set(followed.map((match) => match.id));
  const sections = [];
  if (followed.length) {
    sections.push(createPanel("フォロー中", createMatchList(followed, teamDirectory), `${followed.length}試合`));
  }
  const groups = [...new Map(matches
    .filter((match) => !followedIds.has(match.id))
    .sort((left, right) => competitionOrder(left) - competitionOrder(right))
    .map((match) => [match.competitionId, match])).values()];
  for (const definition of groups) {
    const leagueMatches = matches.filter((match) => match.competitionId === definition.competitionId && !followedIds.has(match.id));
    sections.push(createPanel(
      definition.stageId === "regular" ? definition.leagueName : `${definition.leagueName} / ${definition.stageName}`,
      createMatchList(leagueMatches, teamDirectory),
      `${leagueMatches.length}試合`,
    ));
  }
  return sections;
}

function competitionOrder(match) {
  if (match.stageId === "regular" && match.division === 1) return 1;
  if (match.stageId === "regular" && match.division === 2) return 2;
  if (match.stageId === "division-2-playoff") return 3;
  if (match.stageId === "promotion-relegation") return 4;
  return 9;
}

function createMatchList(matches, teamDirectory) {
  return element("div", { className: "match-list" }, matches
    .sort((left, right) => new Date(left.kickoffAt) - new Date(right.kickoffAt))
    .map((match) => createMatchRow(match, teamDirectory)));
}

function createDateControls(selectedDate, onSelect) {
  const controls = element("section", { className: "match-date-navigation", attributes: { "aria-label": "試合日を選択" } });
  const dates = [-2, -1, 0, 1, 2].map((offset) => shiftDate(selectedDate, offset));
  const strip = element("div", { className: "home-date-strip" }, dates.map((date, index) => {
    const button = element("button", {
      className: `home-date-button${index === 2 ? " is-active" : ""}`,
      attributes: { type: "button", "aria-pressed": String(index === 2), "data-date": date },
    }, [
      element("small", { text: relativeDateLabel(date) }),
      element("strong", { text: dayLabel(date) }),
    ]);
    button.addEventListener("click", () => onSelect(date));
    return button;
  }));
  const picker = element("input", {
    className: "home-date-picker",
    attributes: { type: "date", value: selectedDate, "aria-label": "日付を指定" },
  });
  picker.addEventListener("change", () => { if (picker.value) onSelect(picker.value); });
  controls.append(strip, picker);
  return controls;
}

function createFavoritePrompt(teams) {
  const select = element("select", { className: "filter-select", attributes: { "aria-label": "お気に入りチーム" } }, [
    element("option", { text: "チームを選択", attributes: { value: "" } }),
    ...teams.map((team) => element("option", { text: team.name, attributes: { value: team.id } })),
  ]);
  const button = element("button", { className: "favorite-button", text: "♡ お気に入り登録", attributes: { type: "button" } });
  button.addEventListener("click", () => { if (select.value) { saveFavoriteTeamId(select.value); setState({ favoriteTeamId: select.value }); } });
  return element("div", { className: "my-team-card" }, [element("span", { className: "my-team-card__heart", text: "♡" }), element("div", { className: "row-copy" }, [element("strong", { text: "マイチームを登録" }), select]), button]);
}

function favoritePriority(match, team) { return team && (match.homeTeam.teamId === team.id || match.awayTeam.teamId === team.id) ? 1 : 0; }
function todayKey() { return new Intl.DateTimeFormat("sv-SE", { timeZone: JST_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function defaultDate(matches, season) {
  if (season === Number(todayKey().slice(0, 4))) return todayKey();
  return matches.length ? dateKey([...matches].sort((left, right) => new Date(right.kickoffAt) - new Date(left.kickoffAt))[0].kickoffAt) : `${season}-01-01`;
}
function dateKey(value) { return new Intl.DateTimeFormat("sv-SE", { timeZone: JST_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); }
function shiftDate(date, amount) { const value = new Date(`${date}T12:00:00+09:00`); value.setDate(value.getDate() + amount); return dateKey(value); }
function displayDate(date) { return new Intl.DateTimeFormat("ja-JP", { timeZone: JST_TIME_ZONE, month: "long", day: "numeric", weekday: "short" }).format(new Date(`${date}T12:00:00+09:00`)); }
function dayLabel(date) { return new Intl.DateTimeFormat("ja-JP", { timeZone: JST_TIME_ZONE, month: "numeric", day: "numeric" }).format(new Date(`${date}T12:00:00+09:00`)); }
function relativeDateLabel(date) { const offset = Math.round((new Date(`${date}T12:00:00+09:00`) - new Date(`${todayKey()}T12:00:00+09:00`)) / 86400000); return offset === 0 ? "今日" : offset === -1 ? "昨日" : offset === 1 ? "明日" : new Intl.DateTimeFormat("ja-JP", { weekday: "short", timeZone: JST_TIME_ZONE }).format(new Date(`${date}T12:00:00+09:00`)); }
function shortTime(value) { return new Intl.DateTimeFormat("ja-JP", { timeZone: JST_TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
