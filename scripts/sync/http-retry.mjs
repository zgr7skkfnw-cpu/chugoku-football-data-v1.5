const DEFAULT_RETRYABLE_STATUS_CODES = new Set([408, 425, 429]);
const DEFAULT_RETRYABLE_ERROR_PATTERN =
  /timeout|timed out|econnreset|etimedout|econnrefused|ehostunreach|enetunreach|eai_again|enotfound|socket hang up|connection reset|network error|fetch failed|temporary failure/i;

export const DEFAULT_HTTP_RETRY_OPTIONS = Object.freeze({
  attempts: 4,
  timeoutMs: 45_000,
  baseDelayMs: 1_000,
  maxDelayMs: 8_000,
  maxRetryAfterMs: 15_000,
});

export class HttpStatusError extends Error {
  constructor(status, statusText, retryAfterMs = null) {
    super(`HTTP ${status}${statusText ? ` ${statusText}` : ""}`);
    this.name = "HttpStatusError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function parseRetryAfter(value, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

function responseRetryAfterMs(response) {
  const headers = typeof response.headers === "function" ? response.headers() : {};
  return parseRetryAfter(headers?.["retry-after"] ?? headers?.["Retry-After"]);
}

export function isRetryableHttpError(error) {
  if (error instanceof HttpStatusError) {
    return DEFAULT_RETRYABLE_STATUS_CODES.has(error.status)
      || (error.status >= 500 && error.status < 600);
  }
  return DEFAULT_RETRYABLE_ERROR_PATTERN.test(`${error?.code ?? ""} ${error?.message ?? error ?? ""}`);
}

function retryDelayMs(error, retryNumber, options) {
  const exponential = Math.min(
    options.maxDelayMs,
    options.baseDelayMs * (2 ** (retryNumber - 1)),
  );
  if (!Number.isFinite(error?.retryAfterMs)) return exponential;
  return Math.min(options.maxRetryAfterMs, Math.max(exponential, error.retryAfterMs));
}

export async function fetchTextWithRetry(context, url, requestOptions = {}, retryOptions = {}) {
  const options = { ...DEFAULT_HTTP_RETRY_OPTIONS, ...retryOptions };
  const sleep = options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  let lastError;

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      const response = await context.fetch(url, {
        method: requestOptions.method ?? "GET",
        form: requestOptions.form,
        headers: requestOptions.headers,
        failOnStatusCode: false,
        timeout: options.timeoutMs,
      });

      if (!response.ok()) {
        throw new HttpStatusError(
          response.status(),
          response.statusText(),
          responseRetryAfterMs(response),
        );
      }

      const text = await response.text();
      if (!text.trim()) {
        const error = new Error("レスポンス本文が空です");
        error.code = "EMPTY_RESPONSE";
        throw error;
      }
      return text;
    } catch (error) {
      lastError = error;
      const retryable = error?.code === "EMPTY_RESPONSE" || isRetryableHttpError(error);
      if (!retryable || attempt >= options.attempts) break;
      const delayMs = retryDelayMs(error, attempt, options);
      options.onRetry?.({ attempt, nextAttempt: attempt + 1, delayMs, error, url });
      await sleep(delayMs);
    }
  }

  throw new Error(
    `${url} の取得に失敗しました（最大${options.attempts}回）: ${lastError?.message ?? "不明なエラー"}`,
    { cause: lastError },
  );
}
