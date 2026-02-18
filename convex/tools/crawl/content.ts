"use node";

/**
 * HTML content extraction using Cheerio.
 * Strategy-agnostic — works with any HTML source (native fetch, Browserless, etc.).
 *
 * RSC/streaming pages (Next.js App Router, React streaming SSR) deliver all content
 * inside self.__next_f.push([1,"..."]) script tags. stripJunk() removes all <script>
 * tags, so we must extract RSC text BEFORE stripping. See extractRscContent().
 *
 * Call order matters:
 *   1. extractRscContent($)   — if RSC page (reads scripts before stripJunk)
 *   2. needsJsRendering($)    — checks scripts/noscript elements
 *   3. extractPageMetadata($) — reads JSON-LD from script[type="application/ld+json"]
 *   4. extractMainContent($)  — calls stripJunk() internally, removing all <script> tags
 */

import type { CheerioAPI } from "cheerio";
import type { Element } from "domhandler";

const cleanText = (text: string): string =>
  text.replaceAll(/\s+/g, " ").replaceAll("\u00a0", " ").trim();

/** RSC snippet readability thresholds */
const RSC_MIN_SNIPPET_LENGTH = 30;
const RSC_MIN_WORD_COUNT = 4;
const RSC_MAX_SYMBOL_RATIO = 0.08;

function isReadableRscSnippet(value: string): boolean {
  const text = cleanText(value);
  if (text.length < RSC_MIN_SNIPPET_LENGTH) return false;
  if (
    text.startsWith("/") ||
    text.startsWith("data:") ||
    text.includes("/_next/static/")
  ) {
    return false;
  }
  if (/^(?:[A-Za-z0-9_-]+\s+){6,}[A-Za-z0-9_-]+$/.test(text)) return false;
  if (/[{}[\]<>;$]/.test(text)) return false;

  const words = text.match(/[A-Za-z][A-Za-z'-]{2,}/g) ?? [];
  if (words.length < RSC_MIN_WORD_COUNT) return false;

  const symbolCount = (text.match(/[^A-Za-z0-9\s.,!?'"():-]/g) ?? []).length;
  const symbolRatio = symbolCount / text.length;
  return symbolRatio <= RSC_MAX_SYMBOL_RATIO;
}

/**
 * Extract human-readable text from Next.js RSC streaming payloads.
 * RSC format: self.__next_f.push([1,"<json-encoded-string>"])
 * The JSON string contains React component trees with embedded text nodes.
 * Returns empty string if no RSC payload is found.
 */
export const extractRscContent = ($: CheerioAPI): string => {
  const chunks: string[] = [];
  let matchCount = 0;
  let failCount = 0;
  $("script").each((_, el) => {
    const src = $(el).html() ?? "";
    // Match RSC push payloads: self.__next_f.push([1,"..."])
    // Cheerio decodes HTML entities in script content, so the inner string
    // contains literal \" sequences. Parse the full array literal as JSON
    // to correctly decode the string value.
    const match = /self\.__next_f\.push\((\[1,[\s\S]+?\])\s*\)/.exec(src);
    if (!match) return;
    matchCount += 1;
    try {
      // RSC wire format uses \$ as a React sigil escape — not valid JSON.
      // Replace \$ with $ before parsing so JSON.parse succeeds.
      const sanitized = match[1].replaceAll(/\\(\$)/g, "$1");
      const parsed: unknown = JSON.parse(sanitized);
      if (Array.isArray(parsed) && typeof parsed[1] === "string") {
        chunks.push(parsed[1]);
      }
    } catch (parseError) {
      failCount += 1;
      console.warn("[CRAWL] Unparseable RSC chunk:", {
        snippet: src.substring(0, 80),
        error: parseError instanceof Error ? parseError.message : "unknown",
      });
    }
  });
  if (failCount > 0) {
    console.warn(
      `[CRAWL] RSC extraction: ${String(failCount)}/${String(matchCount)} chunks failed to parse`,
    );
  }
  if (chunks.length === 0) return "";

  const combined = chunks.join("\n");
  const textMatches = combined.match(/"([^"\n]{15,})"/g) ?? [];
  const readable = Array.from(
    new Set(
      textMatches
        .map((match) => cleanText(match.slice(1, -1)))
        .filter(isReadableRscSnippet),
    ),
  ).slice(0, 120);

  return cleanText(readable.join(" "));
};

/**
 * Detect if a page likely needs JavaScript rendering for full content.
 * Must be called BEFORE stripJunk() since it checks for noscript/script elements.
 *
 * Detects:
 * - Next.js App Router RSC pages (self.__next_f.push payloads in scripts)
 * - Classic React SPA shells (#root, #__next, #app with minimal text)
 * - Explicit noscript JS warnings
 */
export const needsJsRendering = ($: CheerioAPI): boolean => {
  // RSC streaming pages: content is in __next_f script payloads, not HTML elements
  const hasRscPayload = $("script")
    .toArray()
    .some((el) => ($(el).html() ?? "").includes("__next_f"));
  if (hasRscPayload) return true;

  // Classic SPA shell: React root div present but body text is minimal
  const hasReactRoot = $("#root, #__next, #app").length > 0;
  if (hasReactRoot) {
    const bodyText = cleanText($("body").text());
    if (bodyText.length < 500) return true;
  }

  // Explicit noscript JS requirement
  const hasNoscript = $("noscript").text().toLowerCase().includes("javascript");
  return hasNoscript;
};

const stripJunk = ($: CheerioAPI) => {
  $("script, style, nav, footer, header, aside, noscript, iframe").remove();
  $('[aria-hidden="true"]').remove();
  $('[role="presentation"]').remove();
  $(".ads, .ad, .advertisement, .promo, .sidebar").remove();
};

export const extractPageMetadata = ($: CheerioAPI) => {
  const fallbackTitle =
    $("h1").first().text().trim() || $("h2").first().text().trim();
  return {
    title: $("title").text().trim() || fallbackTitle,
    description: $('meta[name="description"]').attr("content"),
    ogTitle: $('meta[property="og:title"]').attr("content"),
    ogDescription: $('meta[property="og:description"]').attr("content"),
    author: $('meta[name="author"]').attr("content"),
    publishedDate: $('meta[property="article:published_time"]').attr("content"),
    jsonLd: $('script[type="application/ld+json"]').first().html(),
  };
};

const extractLargestTextBlock = ($: CheerioAPI): string => {
  let bestNode: Element | null = null;
  let bestLen = 0;
  $("p, article, section, div").each((_, el) => {
    const text = cleanText($(el).text());
    if (text.length > bestLen) {
      bestLen = text.length;
      bestNode = el;
    }
  });
  if (bestNode) {
    return cleanText($(bestNode).text());
  }
  return "";
};

export const extractMainContent = ($: CheerioAPI): string => {
  stripJunk($);
  const main =
    $("article").first().text() ||
    $("main").first().text() ||
    $('[role="main"]').first().text() ||
    $(".content").first().text() ||
    $(".post").first().text();

  const cleaned = cleanText(main);
  if (cleaned.length > 300) return cleaned;

  const largest = extractLargestTextBlock($);
  if (largest.length > 0) return largest;

  return cleanText($("body").text());
};

const JUNK_PATTERNS = [
  /cookie policy/gi,
  /accept cookies/gi,
  /privacy policy/gi,
  /terms of service/gi,
  /subscribe to newsletter/gi,
  /follow us on/gi,
  /share this article/gi,
];

export function removeJunkPatterns(text: string): string {
  let cleaned = text;
  for (const pattern of JUNK_PATTERNS) {
    cleaned = cleaned.replaceAll(pattern, "");
  }
  return cleaned.trim();
}

/** Low-quality content detection thresholds */
const LOW_QUALITY_MIN_TOKEN_COUNT = 60;
const LOW_QUALITY_MIN_READABILITY_RATIO = 0.35;

export function isLowQualityContent(text: string): boolean {
  // Heuristic guard for RSC transport payload noise and class-list blobs that
  // can look "long enough" but are not readable page content.
  const hasTransportMarkers = /\b\d+:[A-Z]\[/.test(text);
  const hasChunkRuntimeNoise =
    text.includes("__next_f") || text.includes("webpackChunk");
  const tokenCount = text.split(/\s+/).length;
  const alphaWordCount = (text.match(/[A-Za-z]{4,}/g) ?? []).length;
  const readabilityRatio = tokenCount === 0 ? 0 : alphaWordCount / tokenCount;

  return (
    hasTransportMarkers ||
    hasChunkRuntimeNoise ||
    (tokenCount > LOW_QUALITY_MIN_TOKEN_COUNT &&
      readabilityRatio < LOW_QUALITY_MIN_READABILITY_RATIO)
  );
}
