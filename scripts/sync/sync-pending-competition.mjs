const TARGETS = {
  "2026-division-2-playoff": { name: "2026 1部昇格プレーオフ", taikaiHoldId: null },
  "2026-i-league-playoff": { name: "2026 Iリーグ順位決定プレーオフ", taikaiHoldId: null },
  "2026-promotion-relegation": { name: "2026 1部・2部入替戦", taikaiHoldId: null, dataStatus: "not-held" },
};

const targetKey = process.argv.find((argument) => argument.startsWith("--target="))?.split("=")[1];
const target = TARGETS[targetKey];
if (!target) {
  console.error(`未対応の同期対象です: ${targetKey ?? "未指定"}`);
  process.exitCode = 1;
} else if (target.dataStatus === "not-held") {
  console.log(`${target.name}：大会要項上、実施しません。同期は行いません。`);
} else if (target.taikaiHoldId == null) {
  console.log(`${target.name}：公式taikaiHoldIdが未設定です。同期は行いません。`);
} else {
  console.error(`${target.name}：同期設定は未完成です。`);
  process.exitCode = 1;
}
