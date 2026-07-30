import { element } from "./elements.js";

const ICONS = Object.freeze({
  goal: ["⚽", "ゴール"],
  assist: ["◢", "アシスト"],
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
    element("span", { className: "match-event-icon__glyph", text: glyph, attributes: { "aria-hidden": "true" } }),
    count == null ? null : element("span", { className: "match-event-icon__count", text: String(count) }),
  ]);
}
