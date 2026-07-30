import { element } from "./elements.js";

const ICONS = Object.freeze({
  goal: ["⚽", "ゴール"],
  assist: [null, "アシスト"],
  yellow: ["■", "イエローカード"],
  red: ["■", "レッドカード"],
  starter: ["先", "先発"],
  bench: ["控", "ベンチ"],
});

export function createMatchEventIcon(type, count = null) {
  const [glyph, label] = ICONS[type] ?? ["•", type];
  return element("span", {
    className: `match-event-icon match-event-icon--${type}`,
    attributes: { role: "img", "aria-label": count == null ? label : `${label}${count}` },
  }, [
    type === "assist"
      ? createAssistIcon()
      : element("span", { className: "match-event-icon__glyph", text: glyph, attributes: { "aria-hidden": "true" } }),
    count == null ? null : element("span", { className: "match-event-icon__count", text: String(count) }),
  ]);
}

function createAssistIcon() {
  const wrap = element("span", {
    className: "match-event-icon__glyph match-event-icon__assist",
    attributes: { "aria-hidden": "true", title: "アシスト" },
  });
  wrap.innerHTML = `<svg viewBox="0 0 24 16" width="18" height="14" focusable="false" aria-hidden="true">
    <path d="M3 3.5c2.8 0 5.2 1.2 7.1 3.3l2.1 2.3 6.4 1.4c1.5.3 2.4 1.2 2.4 2.4 0 1.1-.9 1.9-2.1 1.9H7.3c-2.8 0-4.7-1.5-5.3-4.1L1.4 8h3.8L3 3.5Zm7.7 5.7-2-2.1-2.2 2.1h4.2Z" fill="currentColor"/>
    <path d="M13.4 2.2 16.8 1l1.4 4.1-3.5 1.2-1.3-4.1Z" fill="currentColor"/>
  </svg>`;
  return wrap;
}
