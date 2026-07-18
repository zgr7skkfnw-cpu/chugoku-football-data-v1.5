import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const seasonArgument = process.argv.find((argument) =>
  argument.startsWith("--season="),
);

const season = seasonArgument
  ? seasonArgument.split("=")[1]
  : "2026";

if (!/^\d{4}$/.test(season)) {
  console.error("エラー：シーズンは4桁の西暦で指定してください。");
  console.error("例：npm run apply:overrides -- --season=2026");
  process.exit(1);
}

const downloadsDirectory = path.join(
  os.homedir(),
  "Downloads",
);

const projectRoot = process.cwd();

const destinationDirectory = path.join(
  projectRoot,
  "site",
  "data",
  "seasons",
  season,
);

const destinationPath = path.join(
  destinationDirectory,
  "manual-match-overrides.json",
);

const entries = await readdir(downloadsDirectory, {
  withFileTypes: true,
});

const candidates = [];

for (const entry of entries) {
  if (!entry.isFile()) {
    continue;
  }

  if (
    !/^manual-match-overrides(?: \(\d+\))?\.json$/.test(
      entry.name,
    )
  ) {
    continue;
  }

  const filePath = path.join(
    downloadsDirectory,
    entry.name,
  );

  const fileStat = await stat(filePath);

  candidates.push({
    name: entry.name,
    path: filePath,
    modifiedAt: fileStat.mtimeMs,
  });
}

if (!candidates.length) {
  console.error(
    "エラー：Downloadsに補正JSONが見つかりませんでした。",
  );
  console.error(
    "管理画面からJSONをダウンロードしてから、もう一度実行してください。",
  );
  process.exit(1);
}

candidates.sort(
  (a, b) => b.modifiedAt - a.modifiedAt,
);

const latestFile = candidates[0];

let data;

try {
  const rawText = await readFile(
    latestFile.path,
    "utf8",
  );

  data = JSON.parse(rawText);
} catch (error) {
  console.error(
    `エラー：${latestFile.name}をJSONとして読み込めませんでした。`,
  );
  console.error(error.message);
  process.exit(1);
}

if (
  !data
  || typeof data !== "object"
  || !Array.isArray(data.items)
) {
  console.error(
    "エラー：補正JSONにitems配列がありません。",
  );
  process.exit(1);
}

for (const [index, item] of data.items.entries()) {
  if (
    !item
    || typeof item !== "object"
    || typeof item.matchId !== "string"
    || !item.matchId.trim()
    || !item.override
    || typeof item.override !== "object"
  ) {
    console.error(
      `エラー：itemsの${index + 1}件目の形式が正しくありません。`,
    );
    process.exit(1);
  }
}

await mkdir(destinationDirectory, {
  recursive: true,
});

try {
  await stat(destinationPath);

  const backupPath = path.join(
    destinationDirectory,
    "manual-match-overrides.backup.json",
  );

  await copyFile(
    destinationPath,
    backupPath,
  );

  console.log(
    `既存ファイルをバックアップしました：${path.relative(projectRoot, backupPath)}`,
  );
} catch {
  // 既存ファイルがない場合はバックアップしない
}

await writeFile(
  destinationPath,
  `${JSON.stringify(data, null, 2)}\n`,
  "utf8",
);

console.log("");
console.log(`使用したファイル：${latestFile.name}`);
console.log(`補正件数：${data.items.length}件`);
console.log(
  `反映先：${path.relative(projectRoot, destinationPath)}`,
);
console.log("");
console.log("補正JSONの反映が完了しました。");
