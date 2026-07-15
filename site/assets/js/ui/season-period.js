import { setState } from "../state.js";
import { element } from "./elements.js";

export const SEASON_PERIODS = [
  ["all", "通算"],
  ["first", "前期"],
  ["second", "後期"],
];

export function createSeasonPeriodTabs(activePeriod, className = "season-period-tabs") {
  return element(
    "div",
    { className: `chip-row ${className}`, attributes: { role: "tablist", "aria-label": "期間" } },
    SEASON_PERIODS.map(([period, label]) => {
      const selected = period === activePeriod;
      const button = element("button", {
        className: `filter-chip${selected ? " is-active" : ""}`,
        text: label,
        attributes: {
          type: "button",
          role: "tab",
          "aria-selected": String(selected),
          "data-season-period": period,
        },
      });
      button.addEventListener("click", () => setState({ seasonPeriod: period }));
      return button;
    }),
  );
}
