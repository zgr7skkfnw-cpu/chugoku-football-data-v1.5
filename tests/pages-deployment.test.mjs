import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("人間によるmain pushは従来のPages workflowでdeployする", async () => {
  const pages = await read(".github/workflows/pages.yml");
  assert.match(pages, /push:\s*\n\s*branches:\s*\n\s*- main/);
  assert.match(pages, /actions\/deploy-pages@v4/);
});

test("feature branch pushは通常Pages deploy対象外", async () => {
  const pages = await read(".github/workflows/pages.yml");
  const branches = pages.match(/push:\s*\n\s*branches:\s*\n((?:\s*- .+\n)+)/)?.[1] ?? "";
  assert.match(branches, /- main/);
  assert.doesNotMatch(branches, /feature|\*\*/);
});

test("同期がdata commitした場合だけ、そのSHAをPagesへdeployする", async () => {
  const sync = await read(".github/workflows/sync-results.yml");
  assert.match(sync, /data_commit_sha: \$\{\{ steps\.commit-data\.outputs\.data_commit_sha \}\}/);
  assert.match(sync, /if: needs\.sync\.outputs\.data_commit_sha != ''/);
  assert.match(sync, /ref: \$\{\{ needs\.sync\.outputs\.data_commit_sha \}\}/);
  assert.match(sync, /deploy_sha=\$\{\{ needs\.sync\.outputs\.data_commit_sha \}\}/);
});

test("同期no-opではcommit出力を作らずdeployしない", async () => {
  const sync = await read(".github/workflows/sync-results.yml");
  const noDiff = sync.indexOf("if git diff --cached --quiet");
  const exit = sync.indexOf("exit 0", noDiff);
  const output = sync.indexOf('echo "data_commit_sha=$commit_sha"');
  assert.ok(noDiff >= 0 && noDiff < exit && exit < output);
});

test("同期・validation・test失敗時はcommitもdeployも実行されない", async () => {
  const sync = await read(".github/workflows/sync-results.yml");
  const synchronize = sync.indexOf("npm run update:data:smart");
  const validate = sync.indexOf("npm run validate:data");
  const tests = sync.indexOf("Run synchronization regression tests");
  const commit = sync.indexOf("git commit -m");
  assert.ok(synchronize >= 0 && synchronize < validate && validate < tests && tests < commit);
  assert.doesNotMatch(sync, /continue-on-error/);
  assert.match(sync, /needs: sync/);
});
