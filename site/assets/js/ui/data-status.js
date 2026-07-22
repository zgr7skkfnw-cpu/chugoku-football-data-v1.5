import { createIcon } from "./icons.js";
import { element } from "./elements.js";

export function renderLoadingState() {
  return element("article", { className: "page data-status", attributes: { "data-status": "loading" } }, [
    element("div", { className: "initial-loader", attributes: { role: "status" } }, [
      element("span", { className: "loader-dot", attributes: { "aria-hidden": "true" } }),
      element("span", { text: "読み込み中…" }),
    ]),
  ]);
}

export function renderErrorState(message) {
  return element("article", { className: "page data-status", attributes: { "data-status": "error" } }, [
    element("div", { className: "data-error", attributes: { role: "alert" } }, [
      createIcon("info"),
      element("div", {}, [
        element("h1", { text: "データを読み込めませんでした。" }),
        element("p", { text: "時間をおいて再度お試しください。" }),
        element("details", { className: "data-error__details" }, [
          element("summary", { text: "エラーの詳細" }),
          element("p", { text: message }),
        ]),
        element("button", { className: "button data-retry", text: "再試行", attributes: { type: "button", "data-retry-load": "true" } }),
      ]),
    ]),
  ]);
}
