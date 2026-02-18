"use node";

/**
 * Parallel Scrape Execution Phase
 *
 * Extracted from parallel_research.ts per [LOC1a] / [MO1d].
 * Handles URL deduplication, parallel scrape dispatch, and result aggregation.
 */

import { api } from "../_generated/api";
import { generateMessageId } from "../lib/id_generator";
import { CONTENT_LIMITS, RELEVANCE_SCORES } from "../lib/constants/cache";
import type { ScrapedContent } from "../schemas/search";
import type { WorkflowActionCtx } from "./orchestration_persistence";
import { logWorkflowError } from "./workflow_logger";
import {
  logParallelScrape,
  logScrapeResult,
  logScrapeSkip,
  logParallelScrapeComplete,
} from "./workflow_logger_research";

/** Minimal search result shape needed for scrape candidate selection. */
export interface ScrapeCandidate {
  url: string;
  relevanceScore?: number;
}

/**
 * Select and rank scrape targets from raw search results.
 *
 * Deduplicates by URL, keeps only HTTP(S), sorts by relevance, and caps at
 * `maxUrls`. Used by both the progress event and the actual scrape dispatch
 * so the two never diverge (see [CC1b] DRY).
 */
export function selectScrapeTargets(
  searchResults: ScrapeCandidate[],
  maxUrls: number,
): ScrapeCandidate[] {
  return Array.from(new Map(searchResults.map((r) => [r.url, r])).values())
    .filter((r) => r.url?.startsWith("http"))
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
    .slice(0, maxUrls);
}

/** Result of the parallel scrape phase. */
export interface ScrapePhaseResult {
  scrapedContent: ScrapedContent[];
  scrapeSuccessCount: number;
  scrapeFailCount: number;
  scrapeDurationMs: number;
}

/**
 * Deduplicate URLs from search results, select top candidates, and scrape in parallel.
 */
export async function executeScrapePhase(
  ctx: WorkflowActionCtx,
  searchResults: ScrapeCandidate[],
  maxScrapeUrls: number,
): Promise<ScrapePhaseResult> {
  const uniqueUrls = selectScrapeTargets(searchResults, maxScrapeUrls);

  if (uniqueUrls.length === 0) {
    return {
      scrapedContent: [],
      scrapeSuccessCount: 0,
      scrapeFailCount: 0,
      scrapeDurationMs: 0,
    };
  }

  logParallelScrape(uniqueUrls.length);
  const scrapeStart = Date.now();

  const scrapePromises = uniqueUrls.map(async (urlInfo) => {
    const url = urlInfo.url;
    const contextId = generateMessageId();
    const singleScrapeStart = Date.now();

    try {
      // @ts-ignore TS2589 - convex action type inference depth exceeded
      const content = await ctx.runAction(api.tools.crawl.action.scrapeUrl, {
        url,
      });

      // Reject error-as-data results from scrapeWithCheerio (which returns
      // error details in content/error fields instead of throwing), and
      // reject pages with too little useful content.
      if (
        content.error ||
        content.content.length < CONTENT_LIMITS.MIN_CONTENT_LENGTH
      ) {
        logScrapeSkip(
          Date.now() - singleScrapeStart,
          url,
          content.content.length,
        );
        return null;
      }

      logScrapeResult(
        Date.now() - singleScrapeStart,
        url,
        content.content.length,
      );

      const scraped: ScrapedContent = {
        url,
        title: content.title,
        content: content.content,
        summary:
          content.summary ||
          content.content.substring(0, CONTENT_LIMITS.SUMMARY_TRUNCATE_LENGTH),
        contentLength: content.content.length,
        scrapedAt: Date.now(),
        contextId,
        relevanceScore: urlInfo.relevanceScore || RELEVANCE_SCORES.SCRAPED_PAGE,
      };
      return scraped;
    } catch (error) {
      logWorkflowError(
        "SCRAPE_FAILED",
        `${url} [${Date.now() - singleScrapeStart}ms]`,
        error,
      );
      return null;
    }
  });

  const scrapeResults = await Promise.all(scrapePromises);
  const scrapeDurationMs = Date.now() - scrapeStart;

  const successfulScrapes = scrapeResults.filter(
    (r): r is ScrapedContent => r !== null,
  );

  logParallelScrapeComplete(
    scrapeDurationMs,
    successfulScrapes.length,
    uniqueUrls.length,
  );

  return {
    scrapedContent: successfulScrapes,
    scrapeSuccessCount: successfulScrapes.length,
    scrapeFailCount: uniqueUrls.length - successfulScrapes.length,
    scrapeDurationMs,
  };
}
