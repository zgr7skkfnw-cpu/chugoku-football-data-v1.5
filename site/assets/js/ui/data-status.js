import { createIcon } from "./icons.js";
import { element } from "./elements.js";

export function renderLoadingState() {
  return element("article", { className: "page data-status", attributes: { "data-status": "loading" } }, [
    element("div", { className: "initial-loader", attributes: { role: "status" } }, [
      element("span", { className: "loader-dot", attributes: { "aria-hidden": "true" } }),
      element("span", { text: "試合データを読み込んでいます" }),
    ]),
  ]);
}

export function renderErrorState(message) {
  return element("article", { className: "page data-status", attributes: { "data-status": "error" } }, [
    element("div", { className: "data-error", attributes: { role: "alert" } }, [
      createIcon("info"),
      element("div", {}, [
        element("h1", { text: "データを表示できません" }),
        element("p", { text: message }),
        element("p", { text: "時間をおいてページを再読み込みしてください。" }),
      ]),
    ]),
  ]);
}
