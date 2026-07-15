const HEAD_TO_HEAD_URL = new URL("../../../data/head-to-head.json", import.meta.url);
let headToHeadPromise;

export function loadHeadToHead() {
  headToHeadPromise ??= fetch(HEAD_TO_HEAD_URL, {
    headers: { Accept: "application/json" },
    cache: "force-cache",
  }).then(async (response) => {
    if (!response.ok) throw new Error(`対戦成績データを取得できませんでした（HTTP ${response.status}）`);
    const data = await response.json();
    if (data.schemaVersion !== 1 || !Array.isArray(data.items)) {
      throw new Error("対戦成績データの形式が対応していません");
    }
    return data;
  });
  return headToHeadPromise;
}
