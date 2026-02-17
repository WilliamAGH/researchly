"use node";

/**
 * Debug/provenance markdown builders for source context.
 *
 * Extracted from helpers_context.ts per [LOC1a].
 * These are developer-inspection payloads only — they do NOT affect model context.
 */

import { RELEVANCE_SCORES } from "../lib/constants/cache";

/** Scraped page source shape for markdown builder. */
export type ScrapedHarvestedSource = {
  contextId: string;
  url: string;
  title: string;
  content: string;
  summary: string;
  contentLength: number;
  scrapedAt?: number;
  relevanceScore?: number;
};

/** Search result source shape for markdown builder. */
export type SearchHarvestedSource = {
  contextId?: string;
  url: string;
  title: string;
  snippet: string;
  relevanceScore?: number;
};

function formatIsoDate(timestamp: number | undefined): string {
  if (typeof timestamp !== "number") {
    return "unknown";
  }
  return new Date(timestamp).toISOString();
}

/**
 * Build debug/provenance markdown for a scraped page source.
 */
export function buildScrapedSourceContextMarkdown(
  scraped: ScrapedHarvestedSource,
): string {
  return [
    "## Convex Server Source Context",
    "- sourceType: scraped_page",
    `- contextId: ${scraped.contextId}`,
    `- url: ${scraped.url}`,
    `- title: ${scraped.title || "Untitled"}`,
    `- scrapedAt: ${formatIsoDate(scraped.scrapedAt)}`,
    `- relevanceScore: ${scraped.relevanceScore ?? RELEVANCE_SCORES.SCRAPED_PAGE}`,
    `- contentLength: ${scraped.contentLength}`,
    "",
    "### Summary",
    scraped.summary || "_none_",
    "",
    "### Content",
    "```text",
    scraped.content || "",
    "```",
  ].join("\n");
}

/**
 * Build debug/provenance markdown for a search-result source.
 */
export function buildSearchSourceContextMarkdown(params: {
  source: SearchHarvestedSource;
  crawlAttempted: boolean;
  crawlSucceeded: boolean;
  crawlErrorMessage?: string;
  markedLowRelevance: boolean;
}): string {
  const { source } = params;

  return [
    "## Convex Server Source Context",
    "- sourceType: search_result",
    `- contextId: ${source.contextId ?? "generated-after-harvest"}`,
    `- url: ${source.url}`,
    `- title: ${source.title || "Untitled"}`,
    `- relevanceScore: ${source.relevanceScore ?? RELEVANCE_SCORES.SEARCH_RESULT}`,
    `- crawlAttempted: ${params.crawlAttempted ? "true" : "false"}`,
    `- crawlSucceeded: ${params.crawlSucceeded ? "true" : "false"}`,
    params.crawlErrorMessage
      ? `- crawlErrorMessage: ${params.crawlErrorMessage}`
      : "- crawlErrorMessage: none",
    `- markedLowRelevance: ${params.markedLowRelevance ? "true" : "false"}`,
    "",
    "### Snippet",
    source.snippet || "_none_",
  ].join("\n");
}
