"use node";

/**
 * Native platform fetch strategy.
 * Primary (fast) path — uses the built-in Node fetch with a 10s timeout.
 */

import type { FetchStrategy } from "./types";

const NATIVE_TIMEOUT_MS = 10_000;

/**
 * Fetch raw HTML using the platform's built-in `fetch()`.
 * Returns a typed FetchResult so the orchestrator can decide on fallback.
 */
export const fetchNative: FetchStrategy = async (url) => {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SearchChat/1.0; Web Content Reader)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
        Connection: "keep-alive",
      },
      signal: AbortSignal.timeout(NATIVE_TIMEOUT_MS),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown fetch error";
    const isTimeout = message.includes("timeout") || message.includes("abort");
    return {
      ok: false,
      errorCode: isTimeout ? "TIMEOUT" : "FETCH_FAILED",
      message,
    };
  }

  if (!response.ok) {
    const isClientError = response.status >= 400 && response.status < 500;
    return {
      ok: false,
      errorCode: isClientError ? "HTTP_CLIENT_ERROR" : "HTTP_SERVER_ERROR",
      message: `HTTP ${response.status} ${response.statusText}`,
    };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    return {
      ok: false,
      errorCode: "NOT_HTML",
      message: `Not an HTML page. Content-Type: ${contentType}`,
    };
  }

  const html = await response.text();
  return { ok: true, html, contentType };
};
