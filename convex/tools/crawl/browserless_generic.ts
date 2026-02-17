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
 */

import { BROWSERLESS } from "../../lib/constants/cache";
import type { FetchStrategy } from "./types";

const DEFAULT_BASE_URL = "https://production-sfo.browserless.io";

/** Resource types to skip — we only need DOM HTML, not visual assets. */
const BLOCKED_RESOURCES = ["image", "stylesheet", "font", "media"] as const;

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

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        bestAttempt: true,
        rejectResourceTypes: [...BLOCKED_RESOURCES],
        gotoOptions: {
          waitUntil: "domcontentloaded",
          timeout: BROWSERLESS.PAGE_TIMEOUT_MS,
        },
      }),
      signal: AbortSignal.timeout(BROWSERLESS.FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Browserless fetch failed";
    const isTimeout = message.includes("timeout") || message.includes("abort");
    return {
      ok: false,
      errorCode: isTimeout ? "TIMEOUT" : "FETCH_FAILED",
      message: `Browserless: ${message}`,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      errorCode: response.status >= 500 ? "HTTP_SERVER_ERROR" : "FETCH_FAILED",
      message: `Browserless API error: HTTP ${response.status} ${response.statusText}`,
    };
  }

  // Browserless returns 200 even when the target site errors.
  // The actual site status is in X-Response-Code.
  const siteStatusRaw = response.headers.get("X-Response-Code");
  if (siteStatusRaw) {
    const siteStatus = Number.parseInt(siteStatusRaw, 10);
    if (!Number.isNaN(siteStatus) && siteStatus >= 400) {
      const isClientError = siteStatus >= 400 && siteStatus < 500;
      return {
        ok: false,
        errorCode: isClientError ? "HTTP_CLIENT_ERROR" : "HTTP_SERVER_ERROR",
        message: `Target site returned ${siteStatus} via Browserless`,
      };
    }
  }

  const html = await response.text();
  if (!html || html.trim().length === 0) {
    return {
      ok: false,
      errorCode: "FETCH_FAILED",
      message: "Browserless returned empty HTML",
    };
  }

  return { ok: true, html, contentType: "text/html" };
};
