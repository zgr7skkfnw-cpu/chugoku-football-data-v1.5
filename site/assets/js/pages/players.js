import { createNotice, createPageHeader, createPanel, element } from "../ui/elements.js";
import { getTeam } from "../utils/teams.js";
import { createPlayerLinkRow } from "./shared.js";

export function renderPlayersPage({ players, teams, leagueTeams = teams, teamDirectory }) {
  let registrationFilter = "regular";
  const list = element("div", {
    className: "player-list",
    attributes: { "data-player-count": String(players.length) },
  });
  const resultMeta = element("span", { className: "panel__meta", text: `${players.length}選手` });
  const search = element("input", {
    className: "search-input",
    attributes: {
      type: "search",
      placeholder: "選手名・背番号・チームで検索",
      "aria-label": "選手検索",
    },
  });
  const teamFilter = createSelect("チーム", [
    ["", "すべてのチーム"],
    ...leagueTeams.filter((team) => players.some((player) => player.teamId === team.id)).map((team) => [team.id, team.name]),
  ]);
  const positionFilter = createSelect("ポジション", [
    ["", "全ポジション"],
    ...["GK", "DF", "MF", "FW"].map((position) => [position, position]),
  ]);
  const gradeFilter = createSelect("推定学年", [
    ["", "全学年"],
    ...[1, 2, 3, 4].map((grade) => [String(grade), `${grade}年（推定）`]),
  ]);
  const competitionFilter = createSelect("選手登録大会", [
    ["regular", "中国大学リーグ登録"],
    ["jufa-chugoku-2026-i-league-division-1", "Iリーグ中国 1部登録"],
    ["jufa-chugoku-2026-i-league-division-2", "Iリーグ中国 2部登録"],
  ]);

  function updateList() {
    const query = search.value.normalize("NFKC").toLocaleLowerCase("ja").replace(/[\s　]+/g, "");
    const filtered = players.filter((player) => {
      const team = getTeam(teamDirectory, player.teamId);
      const searchable = `${player.name}${player.englishName ?? ""}${player.number ?? ""}${team?.name ?? ""}${team?.shortName ?? ""}`
        .normalize("NFKC")
        .toLocaleLowerCase("ja")
        .replace(/[\s　]+/g, "");
      return (
        (registrationFilter === "regular" ? !player.competitionId : player.competitionId === registrationFilter) &&
        (!query || searchable.includes(query)) &&
        (!teamFilter.value || player.teamId === teamFilter.value) &&
        (!positionFilter.value || player.position === positionFilter.value) &&
        (!gradeFilter.value || player.grade === Number(gradeFilter.value))
      );
    });
    list.dataset.playerCount = String(filtered.length);
    resultMeta.textContent = `${filtered.length}選手`;
    list.replaceChildren(
      ...(filtered.length
        ? filtered.map((player) =>
            createPlayerLinkRow({ player, team: getTeam(teamDirectory, player.teamId) }),
          )
        : [createNotice("条件に一致する選手はいません。")]),
    );
  }

  for (const control of [search, teamFilter, positionFilter, gradeFilter]) {
    control.addEventListener(control === search ? "input" : "change", updateList);
  }
  competitionFilter.addEventListener("change", () => { registrationFilter = competitionFilter.value; updateList(); });
  updateList();

  return element("article", { className: "page", attributes: { "data-page": "players" } }, [
    createPageHeader({
      eyebrow: "Players",
      title: "選手",
      description: "JUFA中国の2026年度登録選手を検索できます。",
    }),
    element("div", { className: "section-stack" }, [
      element("section", { className: "player-filters" }, [
        search,
        element("div", { className: "filter-grid" }, [competitionFilter, teamFilter, positionFilter, gradeFilter]),
      ]),
      createPanel("登録選手", list, resultMeta),
      createNotice("学年のみ生年月日から標準進学時の学年を推定しています。"),
    ]),
  ]);
}

function createSelect(label, options) {
  return element(
    "select",
    { className: "filter-select", attributes: { "aria-label": label } },
    options.map(([value, text]) => element("option", { text, attributes: { value } })),
  );
}
