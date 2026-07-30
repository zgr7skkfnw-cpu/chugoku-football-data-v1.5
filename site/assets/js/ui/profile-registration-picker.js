import { element } from "./elements.js";

export function createProfileRegistrationPicker({
  label = "シーズンを選択",
  current,
  options = [],
}) {
  if (!current || options.length < 2) return null;

  const trigger = element("button", {
    className: "profile-season-picker",
    attributes: {
      type: "button",
      "aria-haspopup": "dialog",
      "aria-expanded": "false",
    },
  }, [
    element("span", { className: "profile-season-picker__icon", text: current.icon ?? "🏆", attributes: { "aria-hidden": "true" } }),
    element("span", { className: "profile-season-picker__copy" }, [
      element("strong", { text: current.name }),
      element("small", { text: `${current.season}年${current.detail ? `｜${current.detail}` : ""}` }),
    ]),
    element("span", { className: "profile-season-picker__arrow", text: "⌄", attributes: { "aria-hidden": "true" } }),
  ]);
  const backdrop = element("div", { className: "profile-season-sheet-backdrop", attributes: { hidden: "hidden" } });
  const sheet = element("section", {
    className: "profile-season-sheet",
    attributes: {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": label,
      hidden: "hidden",
      tabindex: "-1",
    },
  }, [
    element("span", { className: "profile-season-sheet__handle", attributes: { "aria-hidden": "true" } }),
    element("header", {}, [
      element("h2", { text: label }),
      element("button", { className: "profile-season-sheet__close", text: "閉じる", attributes: { type: "button", "aria-label": "シーズン選択を閉じる" } }),
    ]),
    element("div", { className: "profile-season-sheet__options", attributes: { role: "radiogroup" } }, options.map((option) =>
      element("a", {
        className: `profile-season-option${option.selected ? " is-selected" : ""}`,
        attributes: {
          href: option.href,
          "data-route": option.route,
          ...option.data,
          role: "radio",
          "aria-checked": String(Boolean(option.selected)),
        },
      }, [
        element("span", { className: "profile-season-option__radio", attributes: { "aria-hidden": "true" } }),
        element("span", { className: "profile-season-picker__icon", text: option.icon ?? "🏆", attributes: { "aria-hidden": "true" } }),
        element("span", { className: "profile-season-option__copy" }, [
          element("strong", { text: option.name }),
          element("small", { text: `${option.season}年${option.detail ? `｜${option.detail}` : ""}` }),
        ]),
      ]))),
  ]);
  const closeButton = sheet.querySelector(".profile-season-sheet__close");
  let previousOverflow = "";

  const close = () => {
    sheet.hidden = true;
    backdrop.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    document.body.style.overflow = previousOverflow;
    trigger.focus();
  };
  const open = () => {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheet.hidden = false;
    backdrop.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    sheet.querySelector('[aria-checked="true"]')?.focus() ?? closeButton.focus();
  };
  trigger.addEventListener("click", open);
  backdrop.addEventListener("click", close);
  closeButton.addEventListener("click", close);
  sheet.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...sheet.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  return element("div", { className: "profile-season-picker-wrap" }, [trigger, backdrop, sheet]);
}
