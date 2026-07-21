import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_PATH = resolve(ROOT, "site/data");
const SEASONS_PATH = resolve(DATA_PATH, "seasons");
const OUTPUT_PATH = resolve(SEASONS_PATH, "index.json");

export async function buildSeasonIndex() {
  const directories = (await readdir(SEASONS_PATH, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))
    .sort((left, right) => Number(right.name) - Number(left.name));
  const items = [];
  for (const directory of directories) {
    const seasonDirectory = resolve(SEASONS_PATH, directory.name);
    const manifest = JSON.parse(await readFile(resolve(seasonDirectory, "season.json"), "utf8"));
    items.push({
      season: manifest.season,
      updatedAt: manifest.updatedAt,
      competitions: (manifest.competitions ?? []).map((competition) => ({
        id: competition.id,
        name: competition.name,
        leagueName: competition.leagueName,
        division: competition.division,
        competitionType: competition.competitionType ?? "league",
        stage: competition.stage,
        stageName: competition.stageName,
        parentCompetitionId: competition.parentCompetitionId ?? null,
        competitionGroup: competition.competitionGroup ?? null,
        displaySection: competition.displaySection ?? null,
        dataStatus: competition.dataStatus ?? null,
        dateFrom: competition.dateFrom ?? null,
        dateTo: competition.dateTo ?? null,
        results: competition.results ?? null,
        matches: competition.matches ? dataRelativePath(resolve(seasonDirectory, competition.matches)) : null,
        teams: competition.teams ? dataRelativePath(resolve(seasonDirectory, competition.teams)) : null,
        manualOverrides: competition.manualOverrides
          ? dataRelativePath(resolve(seasonDirectory, competition.manualOverrides))
          : null,
        teamStats: competition.teamStats ? dataRelativePath(resolve(seasonDirectory, competition.teamStats)) : null,
        ...(competition.dataAvailable != null ? { dataAvailable: competition.dataAvailable } : {}),
        teamIds: competition.teamIds ?? [],
      })),
    });
  }
  const output = { schemaVersion: 1, defaultSeason: items[0]?.season ?? null, items };
  await writeJsonAtomic(OUTPUT_PATH, output);
  console.log(`年度索引JSON保存: ${OUTPUT_PATH}`);
  console.log(`対象年度: ${items.map((item) => item.season).join(", ")}`);
  return output;
}

function dataRelativePath(path) {
  return relative(DATA_PATH, path).split(sep).join("/");
}

async function writeJsonAtomic(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildSeasonIndex();
