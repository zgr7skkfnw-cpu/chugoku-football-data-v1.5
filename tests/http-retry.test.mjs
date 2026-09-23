import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { fetchTextWithRetry } from "../scripts/sync/http-retry.mjs";

const response = (status, body = "ok", headers = {}) => ({
  ok: () => status >= 200 && status < 300,
  status: () => status,
  statusText: () => ({ 404: "Not Found", 429: "Too Many Requests", 503: "Service Unavailable" })[status] ?? "",
  headers: () => headers,
  text: async () => body,
});

function contextFrom(sequence) {
  let calls = 0;
  return {
    context: {
      fetch: async () => {
        const item = sequence[calls++];
        if (item instanceof Error) throw item;
        return item;
      },
    },
    calls: () => calls,
  };
}

const fastOptions = (delays) => ({
  attempts: 4,
  timeoutMs: 45_000,
  baseDelayMs: 1_000,
  maxDelayMs: 8_000,
  maxRetryAfterMs: 15_000,
  sleep: async (delayMs) => delays.push(delayMs),
});

test("正常応答は再試行せず取得する", async () => {
  const mock = contextFrom([response(200, "result")]);
  const delays = [];
  assert.equal(await fetchTextWithRetry(mock.context, "https://example.test", {}, fastOptions(delays)), "result");
  assert.equal(mock.calls(), 1);
  assert.deepEqual(delays, []);
});

test("一時的timeoutは待機後に再試行して成功する", async () => {
  const mock = contextFrom([new Error("apiRequestContext.fetch: Timeout 45000ms exceeded."), response(200, "recovered")]);
  const delays = [];
  assert.equal(await fetchTextWithRetry(mock.context, "https://example.test", {}, fastOptions(delays)), "recovered");
  assert.equal(mock.calls(), 2);
  assert.deepEqual(delays, [1_000]);
});

test("HTTP 429はRetry-Afterを尊重して再試行する", async () => {
  const mock = contextFrom([response(429, "", { "retry-after": "3" }), response(200, "recovered")]);
  const delays = [];
  assert.equal(await fetchTextWithRetry(mock.context, "https://example.test", {}, fastOptions(delays)), "recovered");
  assert.deepEqual(delays, [3_000]);
});

test("HTTP 5xxは指数バックオフで再試行する", async () => {
  const mock = contextFrom([response(503), response(503), response(200, "recovered")]);
  const delays = [];
  assert.equal(await fetchTextWithRetry(mock.context, "https://example.test", {}, fastOptions(delays)), "recovered");
  assert.deepEqual(delays, [1_000, 2_000]);
});

test("恒久的なHTTP 4xxは再試行しない", async () => {
  const mock = contextFrom([response(404)]);
  const delays = [];
  await assert.rejects(
    fetchTextWithRetry(mock.context, "https://example.test", {}, fastOptions(delays)),
    /HTTP 404 Not Found/,
  );
  assert.equal(mock.calls(), 1);
  assert.deepEqual(delays, []);
});

test("一時障害が上限まで続けば4回で安全に失敗する", async () => {
  const mock = contextFrom(Array.from({ length: 4 }, () => new Error("ETIMEDOUT")));
  const delays = [];
  await assert.rejects(
    fetchTextWithRetry(mock.context, "https://example.test", {}, fastOptions(delays)),
    /最大4回.*ETIMEDOUT/,
  );
  assert.equal(mock.calls(), 4);
  assert.deepEqual(delays, [1_000, 2_000, 4_000]);
});

test("同期処理は全詳細取得成功後にだけデータを書き込む", async () => {
  const source = await readFile(new URL("../scripts/sync/sync-results.mjs", import.meta.url), "utf8");
  const detailFailureGuard = source.indexOf("if (errors.length > 0)");
  const minimumGuard = source.indexOf("if (detailResult.matches.length < MINIMUM_DETAIL_COUNT)");
  const writeCall = source.indexOf("await writeOutput({");
  assert.ok(detailFailureGuard >= 0 && detailFailureGuard < writeCall);
  assert.ok(minimumGuard >= 0 && minimumGuard < writeCall);
  assert.match(source, /if \(!process\.exitCode\) await buildHeadToHead\(\)/);
});
