"use node";

/**
 * Crawl orchestrator — strategy selection, in-memory cache, content extraction.
 * Tries native fetch first (fast path). Falls back to Browserless for blocked URLs.
 */

import { load } from "cheerio";
import { CACHE_TTL } from "../../lib/constants/cache";
import { validateScrapeUrl } from "../../lib/url";
import { getErrorMessage } from "../../lib/errors";
import {
  extractMainContent,
  extractPageMetadata,
  extractRscContent,
  isLowQualityContent,
  needsJsRendering,
  removeJunkPatterns,
} from "./content";
import { fetchNative } from "./native";
import { fetchBrowserless } from "./browserless_generic";
import type { FetchErrorCode } from "./types";

const MAX_CONTENT_LENGTH = 12_000;
const MIN_CONTENT_LENGTH = 100;
const SUMMARY_MAX_LENGTH = 500;
const SCRAPE_CACHE_MAX_ENTRIES = 100;
const ERROR_CACHE_TTL_MS = 30_000;

export type ScrapeResult = {
  title: string;
  content: string;
  summary?: string;
  needsJsRendering?: boolean;
  error?: string;
  errorCode?: string;
};

type CacheEntry = {
  exp: number;
  val: ScrapeResult;
};

declare global {
  var __scrapeCache: Map<string, CacheEntry> | undefined;
}

const getScrapeCache = (): Map<string, CacheEntry> => {
  globalThis.__scrapeCache ??= new Map<string, CacheEntry>();
  return globalThis.__scrapeCache;
};

/** Attempt Browserless for network-level failures likely fixed by headless rendering. */
function shouldAttemptBrowserless(errorCode: FetchErrorCode): boolean {
  return (
    errorCode === "HTTP_CLIENT_ERROR" ||
    errorCode === "TIMEOUT" ||
    errorCode === "FETCH_FAILED"
  );
}

/** Retry with Browserless when native HTML extracts to unusably short content. */
function shouldRetryBrowserlessAfterExtractionFailure(
  errorMessage: string,
): boolean {
  return (
    errorMessage.includes("Content too short") ||
    errorMessage.includes("Content quality check failed")
  );
}

type FetchSuccess = {
  html: string;
  source: "native" | "browserless";
};

function tryExtractAndClean(
  url: string,
  html: string,
): { ok: true; result: ScrapeResult } | { ok: false; error: string } {
  try {
    return { ok: true, result: extractAndClean(url, html) };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

/** Retry extraction via Browserless when native HTML was unusable. */
async function retryExtractionWithBrowserless(
  url: string,
  nativeError: string,
): Promise<ScrapeResult> {
  console.info(
    "[CRAWL] Native extraction failed, trying Browserless fallback:",
    { url, error: nativeError },
  );
  const browserlessResult = await fetchBrowserless(url);
  if (!browserlessResult.ok) {
    throw new Error(
      `Native extraction failed: ${nativeError}; Browserless fetch failed: ${browserlessResult.message}`,
    );
  }

  const retryAttempt = tryExtractAndClean(url, browserlessResult.html);
  if (retryAttempt.ok) {
    console.info("[OK] Browserless extraction fallback succeeded:", {
      url,
      contentLength: retryAttempt.result.content.length,
    });
    return retryAttempt.result;
  }
  throw new Error(
    `Native extraction failed: ${nativeError}; Browserless extraction failed: ${retryAttempt.error}`,
  );
}

/** Extract hostname for display labels. Falls back to URL prefix for malformed URLs. */
function extractHostnameForDisplay(url: string): string {
  try {
    return new URL(url).hostname;
  } catch (error) {
    console.warn("[WARN] Failed to parse URL for hostname:", {
      url: url.substring(0, 100),
      error: getErrorMessage(error),
    });
    return url.substring(0, 50);
  }
}

function buildErrorResult(
  url: string,
  errorMessage: string,
  errorCode: string,
): ScrapeResult {
  const hostname = extractHostnameForDisplay(url);
  return {
    title: hostname,
    content: `Unable to fetch content from ${url}: ${errorMessage}`,
    summary: `Content unavailable from ${hostname}`,
    needsJsRendering: false,
    error: errorMessage,
    errorCode,
  };
}

/** Check cache and evict expired entries; return hit if present. */
function getCachedScrape(url: string): ScrapeResult | undefined {
  const cache = getScrapeCache();
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.exp <= now) cache.delete(key);
  }
  const cached = cache.get(url);
  if (cached && cached.exp > now) {
    // Move-to-end for LRU ordering
    cache.delete(url);
    cache.set(url, cached);
    return cached.val;
  }
  return undefined;
}

function cacheScrapeResult(
  url: string,
  val: ScrapeResult,
  ttlMs: number,
): void {
  const cache = getScrapeCache();
  cache.set(url, { exp: Date.now() + ttlMs, val });
  while (cache.size > SCRAPE_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

export async function scrapeWithCheerio(url: string): Promise<ScrapeResult> {
  const validation = validateScrapeUrl(url);
  if (!validation.ok) {
    return {
      title: "invalid_url",
      content: `Unable to fetch content from ${url}: ${validation.error}`,
      summary: validation.error,
      needsJsRendering: false,
      error: `Invalid URL: ${validation.error}`,
      errorCode: "INVALID_URL",
    };
  }
  const validatedUrl = validation.url;

  const cached = getCachedScrape(validatedUrl);
  if (cached) return cached;

  console.info("Scraping URL initiated:", { url: validatedUrl });

  try {
    const fetched = await fetchWithFallback(validatedUrl);
    const attempt = tryExtractAndClean(validatedUrl, fetched.html);

    let result: ScrapeResult;
    if (attempt.ok) {
      result = attempt.result;
    } else if (
      fetched.source === "native" &&
      shouldRetryBrowserlessAfterExtractionFailure(attempt.error)
    ) {
      result = await retryExtractionWithBrowserless(
        validatedUrl,
        attempt.error,
      );
    } else {
      throw new Error(attempt.error);
    }

    cacheScrapeResult(validatedUrl, result, CACHE_TTL.SCRAPE_MS);
    console.info("[OK] Scraping completed:", {
      url: validatedUrl,
      contentLength: result.content.length,
    });
    return result;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    const errorCode = classifyError(errorMessage);
    console.error("[ERROR] Scraping failed:", {
      url: validatedUrl,
      error: errorMessage,
      errorCode,
    });
    const val = buildErrorResult(validatedUrl, errorMessage, errorCode);
    cacheScrapeResult(validatedUrl, val, ERROR_CACHE_TTL_MS);
    return val;
  }
}

/**
 * Try native fetch first. If blocked (4xx), attempt Browserless fallback.
 * Throws on unrecoverable failure so the caller's catch block handles it.
 */
async function fetchWithFallback(url: string): Promise<FetchSuccess> {
  const nativeResult = await fetchNative(url);

  if (nativeResult.ok) {
    console.info("[OK] Native fetch succeeded:", {
      url,
      contentLength: nativeResult.html.length,
    });
    return { html: nativeResult.html, source: "native" };
  }

  if (shouldAttemptBrowserless(nativeResult.errorCode)) {
    console.info("[CRAWL] Native fetch blocked, trying Browserless fallback:", {
      url,
      errorCode: nativeResult.errorCode,
      nativeMessage: nativeResult.message,
    });

    const browserlessResult = await fetchBrowserless(url);
    if (browserlessResult.ok) {
      console.info("[OK] Browserless fallback succeeded:", { url });
      return { html: browserlessResult.html, source: "browserless" };
    }

    console.warn("[WARN] Browserless fallback also failed:", {
      url,
      errorCode: browserlessResult.errorCode,
      message: browserlessResult.message,
    });
    // Throw the original native error since Browserless also failed
    throw new Error(
      `${nativeResult.message}; Browserless fallback failed: ${browserlessResult.message}`,
    );
  }

  throw new Error(nativeResult.message);
}

/** Parse HTML with Cheerio and extract cleaned content. */
function extractAndClean(url: string, html: string): ScrapeResult {
  const $ = load(html);
  const metadata = extractPageMetadata($);

  // needsJsRendering MUST be called before extractMainContent (which calls stripJunk
  // and removes all <script> tags, destroying RSC payloads and noscript signals).
  const needsRender = needsJsRendering($);

  // For RSC/streaming pages, extract text from script payloads before stripJunk runs.
  // extractMainContent calls stripJunk internally, so RSC content must be read first.
  const rscContent = needsRender ? extractRscContent($) : "";

  const extractedContent =
    rscContent.length >= MIN_CONTENT_LENGTH
      ? rscContent
      : extractMainContent($);

  const content =
    extractedContent.length > MAX_CONTENT_LENGTH
      ? `${extractedContent.substring(0, MAX_CONTENT_LENGTH)}...`
      : extractedContent;

  const title =
    metadata.title ||
    metadata.ogTitle ||
    metadata.description ||
    extractHostnameForDisplay(url);

  const cleanedContent = removeJunkPatterns(content);

  if (cleanedContent.length < MIN_CONTENT_LENGTH) {
    throw new Error(
      `Content too short after cleaning (${cleanedContent.length} characters)`,
    );
  }
  if (isLowQualityContent(cleanedContent)) {
    throw new Error("Content quality check failed (non-readable extraction)");
  }

  const summaryLength = Math.min(SUMMARY_MAX_LENGTH, cleanedContent.length);
  const summary =
    cleanedContent.substring(0, summaryLength) +
    (cleanedContent.length > summaryLength ? "..." : "");

  return {
    title,
    content: cleanedContent,
    summary,
    needsJsRendering: needsRender,
  };
}

function classifyError(message: string): string {
  if (message.includes("HTTP 4")) return "HTTP_CLIENT_ERROR";
  if (message.includes("HTTP 5")) return "HTTP_SERVER_ERROR";
  if (message.includes("timeout")) return "TIMEOUT";
  if (message.includes("Content too short")) return "CONTENT_TOO_SHORT";
  if (message.includes("Not an HTML")) return "NOT_HTML";
  return "SCRAPE_FAILED";
}
