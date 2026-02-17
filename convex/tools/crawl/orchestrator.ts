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
  needsJsRendering,
  normalizeScrapedText,
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

/** Only attempt Browserless for client-side blocks (403, 401, etc.). */
function shouldAttemptBrowserless(errorCode: FetchErrorCode): boolean {
  return errorCode === "HTTP_CLIENT_ERROR";
}

function buildErrorResult(
  url: string,
  errorMessage: string,
  errorCode: string,
): ScrapeResult {
  // Hostname extraction is display-only (title/summary labels), not business logic.
  // Fallback to URL prefix is intentional graceful degradation; the actual error is
  // surfaced via errorMessage/errorCode fields in the returned ScrapeResult.
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch (error) {
    console.warn("[WARN] Failed to parse URL for hostname:", {
      url: url.substring(0, 100),
      error: getErrorMessage(error),
    });
    hostname = url.substring(0, 50);
  }

  return {
    title: hostname,
    content: `Unable to fetch content from ${url}: ${errorMessage}`,
    summary: `Content unavailable from ${hostname}`,
    needsJsRendering: false,
    error: errorMessage,
    errorCode,
  };
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
  const cache = getScrapeCache();
  const now = Date.now();

  // Evict expired entries
  for (const [key, entry] of cache) {
    if (entry.exp <= now) cache.delete(key);
  }

  const cached = cache.get(validatedUrl);
  if (cached && cached.exp > now) {
    cache.delete(validatedUrl);
    cache.set(validatedUrl, cached);
    return cached.val;
  }

  console.info("Scraping URL initiated:", { url: validatedUrl });

  const enforceCapacity = () => {
    while (cache.size > SCRAPE_CACHE_MAX_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) break;
      cache.delete(oldestKey);
    }
  };

  try {
    const html = await fetchWithFallback(validatedUrl);
    const result = extractAndClean(validatedUrl, html);

    cache.set(validatedUrl, {
      exp: Date.now() + CACHE_TTL.SCRAPE_MS,
      val: result,
    });
    enforceCapacity();
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
    cache.set(validatedUrl, { exp: Date.now() + ERROR_CACHE_TTL_MS, val });
    enforceCapacity();
    return val;
  }
}

/**
 * Try native fetch first. If blocked (4xx), attempt Browserless fallback.
 * Throws on unrecoverable failure so the caller's catch block handles it.
 */
async function fetchWithFallback(url: string): Promise<string> {
  const nativeResult = await fetchNative(url);

  if (nativeResult.ok) {
    console.info("[OK] Native fetch succeeded:", {
      url,
      contentLength: nativeResult.html.length,
    });
    return nativeResult.html;
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
      return browserlessResult.html;
    }

    console.warn("[WARN] Browserless fallback also failed:", {
      url,
      errorCode: browserlessResult.errorCode,
      message: browserlessResult.message,
    });
    // Throw the original native error since Browserless also failed
    throw new Error(nativeResult.message);
  }

  throw new Error(nativeResult.message);
}

/** Parse HTML with Cheerio and extract cleaned content. */
function extractAndClean(url: string, html: string): ScrapeResult {
  const $ = load(html);
  const metadata = extractPageMetadata($);
  const bodyText = normalizeScrapedText($("body").text());
  const needsRender = needsJsRendering($, bodyText.length);
  const extractedContent = extractMainContent($);

  const content =
    extractedContent.length > MAX_CONTENT_LENGTH
      ? `${extractedContent.substring(0, MAX_CONTENT_LENGTH)}...`
      : extractedContent;

  const title =
    metadata.title ||
    metadata.ogTitle ||
    metadata.description ||
    new URL(url).hostname;

  const cleanedContent = removeJunkPatterns(content);

  if (cleanedContent.length < MIN_CONTENT_LENGTH) {
    throw new Error(
      `Content too short after cleaning (${cleanedContent.length} characters)`,
    );
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

const JUNK_PATTERNS = [
  /cookie policy/gi,
  /accept cookies/gi,
  /privacy policy/gi,
  /terms of service/gi,
  /subscribe to newsletter/gi,
  /follow us on/gi,
  /share this article/gi,
];

function removeJunkPatterns(text: string): string {
  let cleaned = text;
  for (const pattern of JUNK_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  return cleaned.trim();
}

function classifyError(message: string): string {
  if (message.includes("HTTP 4")) return "HTTP_CLIENT_ERROR";
  if (message.includes("HTTP 5")) return "HTTP_SERVER_ERROR";
  if (message.includes("timeout")) return "TIMEOUT";
  if (message.includes("Content too short")) return "CONTENT_TOO_SHORT";
  if (message.includes("Not an HTML")) return "NOT_HTML";
  return "SCRAPE_FAILED";
}
