const SEASONS_URL = new URL("../../../data/seasons/index.json", import.meta.url);
let seasonsPromise;

export function loadSeasonIndex() {
  seasonsPromise ??= fetch(SEASONS_URL, {
    headers: { Accept: "application/json" },
    cache: "force-cache",
  }).then(async (response) => {
    if (!response.ok) throw new Error(`年度一覧を取得できませんでした（HTTP ${response.status}）`);
    const data = await response.json();
    if (data.schemaVersion !== 1 || !Array.isArray(data.items)) throw new Error("年度一覧の形式が対応していません");
    return data;
  });
  return seasonsPromise;
}

export function dataUrl(path) {
  return new URL(`../../../data/${path}`, import.meta.url);
}
