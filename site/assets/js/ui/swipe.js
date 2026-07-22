const DEFAULT_EXCLUDE = ".table-scroll, [data-swipe-exclude], .horizontal-scroll, .tournament-bracket, input, select, textarea";

export function enableHorizontalSwipe(node, { onLeft, onRight, threshold = 56, exclude = DEFAULT_EXCLUDE } = {}) {
  let start = null;
  node.style.touchAction = "pan-y";
  node.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" || event.target.closest(exclude)) return;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  node.addEventListener("pointerup", (event) => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) < threshold || Math.abs(dx) <= Math.abs(dy) * 1.25) return;
    if (dx < 0) onLeft?.();
    else onRight?.();
  });
  node.addEventListener("pointercancel", () => { start = null; });
  return node;
}
