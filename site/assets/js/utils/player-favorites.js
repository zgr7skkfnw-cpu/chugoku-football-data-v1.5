const KEY = "chugoku-football.favorite-players";

export function loadFavoritePlayerIds() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === "string"))] : [];
  } catch { return []; }
}

export function saveFavoritePlayerIds(ids) {
  localStorage.setItem(KEY, JSON.stringify([...new Set(ids)]));
}

export function toggleFavoritePlayer(id, currentIds) {
  const next = currentIds.includes(id) ? currentIds.filter((value) => value !== id) : [...currentIds, id];
  saveFavoritePlayerIds(next);
  return next;
}
