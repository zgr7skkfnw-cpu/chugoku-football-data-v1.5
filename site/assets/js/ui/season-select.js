import { setState } from "../state.js";
import { element } from "./elements.js";

export function createSeasonSelect(selectedSeason, availableSeasons) {
  const select = element("select", {
    className: "season-select",
    attributes: { "aria-label": "年度を選択" },
  }, availableSeasons.map((season) => element("option", {
    text: `${season}年度`,
    attributes: { value: String(season), ...(season === selectedSeason ? { selected: "selected" } : {}) },
  })));
  select.addEventListener("change", () => setState({ selectedSeason: Number(select.value), leagueDivision: 1 }));
  return element("div", { className: "season-selector" }, [
    element("span", { text: "シーズン" }),
    select,
  ]);
}
