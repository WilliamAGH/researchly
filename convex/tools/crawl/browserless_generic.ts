"use node";

/**
 * Browserless /content API fetch strategy.
 * Fallback for URLs blocked by native fetch (403, 401).
 * Returns fully-rendered HTML from a headless browser.
 *
 * Verified against:
 *   https://docs.browserless.io/rest-apis/content
 *   https://docs.browserless.io/rest-apis/request-configuration
 *
 * Key API facts (verified 2025-02):
 * - POST /content?token=TOKEN, Content-Type: application/json, returns text/html
 * - bestAttempt: continues when async events (goto, waitFor*) fail or timeout
 * - gotoOptions mirrors Puppeteer GoToOptions; waitUntil uses lowercase enum
 * - rejectResourceTypes blocks network requests by Puppeteer resource type
 * - Site HTTP status propagated via X-Response-Code response header (HTTP 200 from
 *   Browserless does NOT mean target site succeeded)
 * - waitUntil: "networkidle2" waits until <=2 in-flight requests for 500ms — required
 *   for JS-rendered pages (Next.js RSC, React SPA) to fully hydrate before snapshot.
 *   "domcontentloaded" fires too early: RSC script payloads are present but React has
 *   not yet written DOM elements, so Cheerio still sees an empty body.
 * - /unblock is the anti-bot endpoint for 403/CAPTCHA scenarios where /content returns
 *   blocked pages.
 */

import { BROWSERLESS } from "../../lib/constants/cache";
import type { FetchStrategy } from "./types";

const DEFAULT_BASE_URL = "https://production-sfo.browserless.io";
const UNBLOCK_QUERY = "proxy=residential";
const RATE_LIMIT_HTTP_STATUS = 429;
const MAX_BROWSERLESS_ATTEMPTS = 2;
const RETRY_BASE_DELAY_MS = 250;
const WAIT_FOR_SELECTOR_TIMEOUT_MS = 4_000;
const WAIT_FOR_RENDER_TIMEOUT_MS = 800;

/** Resource types to skip — we only need DOM HTML, not visual assets. */
const BLOCKED_RESOURCES = ["image", "stylesheet", "font", "media"] as const;

type BrowserlessPayload = {
  url: string;
  bestAttempt: true;
  rejectResourceTypes: readonly string[];
  gotoOptions: {
    waitUntil: "networkidle2";
    timeout: number;
  };
  waitForSelector: {
    selector: string;
    timeout: number;
    visible: true;
  };
  waitForTimeout: number;
};

type BrowserlessCallResult =
  | { ok: true; html: string }
  | {
      ok: false;
      errorCode:
        | "HTTP_CLIENT_ERROR"
        | "HTTP_SERVER_ERROR"
        | "TIMEOUT"
        | "FETCH_FAILED";
      message: string;
      shouldRetry: boolean;
      shouldTryUnblock: boolean;
    };

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

type CallErrorOptions = {
  shouldRetry?: boolean;
  shouldTryUnblock?: boolean;
};

function callError(
  errorCode:
    | "HTTP_CLIENT_ERROR"
    | "HTTP_SERVER_ERROR"
    | "TIMEOUT"
    | "FETCH_FAILED",
  message: string,
  options: CallErrorOptions = {},
): BrowserlessCallResult {
  return {
    ok: false,
    errorCode,
    message,
    shouldRetry: options.shouldRetry ?? false,
    shouldTryUnblock: options.shouldTryUnblock ?? false,
  };
}

/** Classify an HTTP status into a typed error with retry/unblock signals. */
function classifyHttpStatus(
  status: number,
  message: string,
): BrowserlessCallResult {
  return callError(
    status >= 400 && status < 500 ? "HTTP_CLIENT_ERROR" : "HTTP_SERVER_ERROR",
    message,
    {
      shouldRetry: status === RATE_LIMIT_HTTP_STATUS || status >= 500,
      shouldTryUnblock: status === 403,
    },
  );
}

const buildContentPayload = (url: string): BrowserlessPayload => ({
  url,
  bestAttempt: true,
  rejectResourceTypes: [...BLOCKED_RESOURCES],
  gotoOptions: {
    waitUntil: "networkidle2",
    timeout: BROWSERLESS.PAGE_TIMEOUT_MS,
  },
  waitForSelector: {
    selector: "main, article, [role='main'], #__next, #root, #app",
    timeout: WAIT_FOR_SELECTOR_TIMEOUT_MS,
    visible: true,
  },
  waitForTimeout: WAIT_FOR_RENDER_TIMEOUT_MS,
});

async function callContentApi(
  endpoint: string,
  payload: BrowserlessPayload,
): Promise<BrowserlessCallResult> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(BROWSERLESS.FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Browserless fetch failed";
    const isTimeout = message.includes("timeout") || message.includes("abort");
    return callError(
      isTimeout ? "TIMEOUT" : "FETCH_FAILED",
      `Browserless: ${message}`,
      { shouldRetry: isTimeout },
    );
  }

  if (!response.ok) {
    return classifyHttpStatus(
      response.status,
      `Browserless API error: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const siteStatusRaw = response.headers.get("X-Response-Code");
  if (siteStatusRaw) {
    const siteStatus = Number.parseInt(siteStatusRaw, 10);
    if (!Number.isNaN(siteStatus) && siteStatus >= 400) {
      return classifyHttpStatus(
        siteStatus,
        `Target site returned ${siteStatus} via Browserless`,
      );
    }
  }

  const html = await response.text();
  if (!html || html.trim().length === 0) {
    return callError("FETCH_FAILED", "Browserless returned empty HTML");
  }

  return { ok: true, html };
}

async function callUnblockApi(
  baseUrl: string,
  token: string,
  url: string,
): Promise<BrowserlessCallResult> {
  const endpoint = `${baseUrl}/unblock?token=${token}&${UNBLOCK_QUERY}&timeout=${BROWSERLESS.UNBLOCK_TIMEOUT_QUERY_MS}`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        content: true,
        cookies: false,
        screenshot: false,
        browserWSEndpoint: false,
        ttl: 0,
        bestAttempt: true,
        gotoOptions: {
          waitUntil: "networkidle2",
          timeout: BROWSERLESS.PAGE_TIMEOUT_MS,
        },
      }),
      signal: AbortSignal.timeout(BROWSERLESS.UNBLOCK_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unblock request failed";
    return callError(
      "FETCH_FAILED",
      `Browserless /unblock request failed: ${message}`,
    );
  }

  if (!response.ok) {
    const isClientError = response.status >= 400 && response.status < 500;
    return callError(
      isClientError ? "HTTP_CLIENT_ERROR" : "HTTP_SERVER_ERROR",
      `Browserless /unblock error: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const raw: unknown = await response.json();
  const html =
    typeof raw === "object" &&
    raw !== null &&
    "content" in raw &&
    typeof raw.content === "string"
      ? raw.content
      : "";
  if (html.trim().length === 0) {
    return callError(
      "FETCH_FAILED",
      "Browserless /unblock returned empty content",
    );
  }

  return { ok: true, html };
}

/**
 * Fetch HTML via the Browserless /content API.
 * No-op if `BROWSERLESS_API_TOKEN` is not set — returns a typed error
 * so the orchestrator can report "not configured" without crashing.
 */
export const fetchBrowserless: FetchStrategy = async (url) => {
  const token = process.env.BROWSERLESS_API_TOKEN;
  if (!token) {
    return {
      ok: false,
      errorCode: "FETCH_FAILED",
      message: "Browserless not configured (BROWSERLESS_API_TOKEN missing)",
    };
  }

  const baseUrl = process.env.BROWSERLESS_BASE_URL ?? DEFAULT_BASE_URL;
  const endpoint = `${baseUrl}/content?token=${token}`;
  const payload = buildContentPayload(url);

  for (let attempt = 1; attempt <= MAX_BROWSERLESS_ATTEMPTS; attempt += 1) {
    const result = await callContentApi(endpoint, payload);
    if (result.ok) {
      return { ok: true, html: result.html, contentType: "text/html" };
    }

    if (result.shouldTryUnblock) {
      const unblockResult = await callUnblockApi(baseUrl, token, url);
      if (unblockResult.ok) {
        return {
          ok: true,
          html: unblockResult.html,
          contentType: "text/html",
        };
      }
      return {
        ok: false,
        errorCode: unblockResult.errorCode,
        message: `${result.message}; ${unblockResult.message}`,
      };
    }

    if (!result.shouldRetry || attempt === MAX_BROWSERLESS_ATTEMPTS) {
      return {
        ok: false,
        errorCode: result.errorCode,
        message: result.message,
      };
    }

    const backoffMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
    console.warn("[CRAWL] Browserless retry after error:", {
      url,
      attempt,
      backoffMs,
      errorCode: result.errorCode,
      message: result.message,
    });
    await sleep(backoffMs);
  }

  return {
    ok: false,
    errorCode: "FETCH_FAILED",
    message: "Browserless fetch failed after retries",
  };
};
