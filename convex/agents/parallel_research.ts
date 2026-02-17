"use node";
/**
 * Parallel Research Execution
 *
 * Extracted from orchestration.ts per [CC1b] DRY principle.
 * Executes search queries and webpage scrapes in parallel for faster research.
 *
 * @see {@link ./orchestration.ts} - consumer of this module
 */
import { api } from "../_generated/api";
import { AGENT_LIMITS } from "../lib/constants/cache";
import {
  createEmptyHarvestedData,
  type HarvestedData,
} from "../schemas/agents";
import type { SerpEnrichment } from "../schemas/search";
import type { WorkflowActionCtx } from "./orchestration_persistence";
import { logWorkflowError, logWorkflow } from "./workflow_logger";
import {
  logParallelSearch,
  logSearchResult,
  logParallelSearchComplete,
} from "./workflow_logger_research";
import { executeScrapePhase } from "./parallel_research_scrape";

// ============================================
// Types
// ============================================

/**
 * Search query from the planning phase.
 */
export interface PlannedSearchQuery {
  query: string;
  reasoning: string;
  priority: number;
}

/**
 * Parameters for parallel research execution.
 */
export interface ParallelResearchParams {
  ctx: WorkflowActionCtx;
  searchQueries: PlannedSearchQuery[];
  maxScrapeUrls?: number;
}

/**
 * Statistics from parallel research execution.
 */
export interface ParallelResearchStats {
  searchDurationMs: number;
  scrapeDurationMs: number;
  totalDurationMs: number;
  searchResultCount: number;
  scrapeSuccessCount: number;
  scrapeFailCount: number;
  queriesExecuted: number;
}

/**
 * Result of parallel research execution.
 */
export interface ParallelResearchResult {
  harvested: HarvestedData & { serpEnrichment: SerpEnrichment };
  stats: ParallelResearchStats;
}

/**
 * Stream event from parallel research.
 */
export type ParallelResearchEvent =
  | {
      type: "progress";
      stage: "searching" | "scraping";
      message: string;
      queries?: string[];
      urls?: string[];
    }
  | { type: "search_complete"; resultCount: number; durationMs: number }
  | {
      type: "scrape_complete";
      successCount: number;
      failCount: number;
      durationMs: number;
    };

// ============================================
// Parallel Research Executor
// ============================================

/**
 * Execute parallel research (search + scrape).
 *
 * This generator yields progress events while executing searches and scrapes
 * in parallel. It eliminates the 8-13 second LLM "thinking" gaps between
 * sequential tool calls.
 *
 * @param params - Research parameters
 * @yields ParallelResearchEvent for progress updates
 * @returns ParallelResearchResult with harvested data and statistics
 *
 * @example
 * ```ts
 * const research = executeParallelResearch({
 *   ctx,
 *   searchQueries: planningOutput.searchQueries,
 * });
 *
 * for await (const event of research) {
 *   if (event.type === "progress") {
 *     yield writeEvent("progress", event);
 *   }
 * }
 *
 * const result = await research.next();
 * const { harvested, stats } = result.value;
 * ```
 */
export async function* executeParallelResearch(
  params: ParallelResearchParams,
): AsyncGenerator<ParallelResearchEvent, ParallelResearchResult, undefined> {
  const {
    ctx,
    searchQueries,
    maxScrapeUrls = AGENT_LIMITS.MAX_SCRAPE_URLS,
  } = params;

  // Initialize harvested data container
  const serpEnrichment: SerpEnrichment = {};
  const harvested: HarvestedData & { serpEnrichment: SerpEnrichment } = {
    ...createEmptyHarvestedData(),
    serpEnrichment,
  };
  const stats: ParallelResearchStats = {
    searchDurationMs: 0,
    scrapeDurationMs: 0,
    totalDurationMs: 0,
    searchResultCount: 0,
    scrapeSuccessCount: 0,
    scrapeFailCount: 0,
    queriesExecuted: searchQueries.length,
  };

  const parallelStartTime = Date.now();

  // ============================================
  // Phase 1: Parallel Search
  // ============================================

  if (searchQueries.length > 0) {
    yield {
      type: "progress",
      stage: "searching",
      message: `${searchQueries.length} ${searchQueries.length === 1 ? "query" : "queries"} in parallel...`,
      queries: searchQueries.map((q) => q.query),
    };

    logParallelSearch(searchQueries.length);

    const searchStart = Date.now();

    const searchPromises = searchQueries.map(async (sq) => {
      const queryStart = Date.now();
      try {
        // @ts-ignore TS2589 - ActionCtx type inference depth exceeded
        const result = await ctx.runAction(api.tools.search.action.searchWeb, {
          query: sq.query,
          maxResults: 8,
        });
        logSearchResult(
          Date.now() - queryStart,
          sq.query,
          result.results?.length || 0,
        );
        return { query: sq.query, result, error: null };
      } catch (error) {
        logWorkflowError("SEARCH_FAILED", sq.query, error);
        return { query: sq.query, result: null, error };
      }
    });

    const searchResults = await Promise.all(searchPromises);
    stats.searchDurationMs = Date.now() - searchStart;

    // Harvest all search results
    for (const { result } of searchResults) {
      if (!result?.results) continue;

      for (const r of result.results) {
        harvested.searchResults.push({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          relevanceScore: r.relevanceScore || 0.5,
        });
        stats.searchResultCount++;
      }

      // Harvest enrichment from first successful search with enrichment
      if (
        result.enrichment &&
        Object.keys(harvested.serpEnrichment).length === 0
      ) {
        const enrich = result.enrichment;
        if (enrich.knowledgeGraph) {
          harvested.serpEnrichment.knowledgeGraph = enrich.knowledgeGraph;
        }
        if (enrich.answerBox) {
          harvested.serpEnrichment.answerBox = enrich.answerBox;
        }
        if (enrich.peopleAlsoAsk) {
          harvested.serpEnrichment.peopleAlsoAsk = enrich.peopleAlsoAsk;
        }
        if (enrich.relatedSearches) {
          harvested.serpEnrichment.relatedSearches = enrich.relatedSearches;
        }
      }
    }

    logParallelSearchComplete(stats.searchDurationMs, stats.searchResultCount);

    yield {
      type: "search_complete",
      resultCount: stats.searchResultCount,
      durationMs: stats.searchDurationMs,
    };
  }

  // ============================================
  // Phase 2: Parallel Scrape
  // ============================================

  if (harvested.searchResults.length > 0) {
    yield {
      type: "progress",
      stage: "scraping",
      message: `Scraping top sources in parallel...`,
      urls: harvested.searchResults.slice(0, maxScrapeUrls).map((r) => r.url),
    };

    const scrapeResult = await executeScrapePhase(
      ctx,
      harvested.searchResults,
      maxScrapeUrls,
    );

    harvested.scrapedContent.push(...scrapeResult.scrapedContent);
    stats.scrapeDurationMs = scrapeResult.scrapeDurationMs;
    stats.scrapeSuccessCount = scrapeResult.scrapeSuccessCount;
    stats.scrapeFailCount = scrapeResult.scrapeFailCount;

    yield {
      type: "scrape_complete",
      successCount: stats.scrapeSuccessCount,
      failCount: stats.scrapeFailCount,
      durationMs: stats.scrapeDurationMs,
    };
  }

  stats.totalDurationMs = Date.now() - parallelStartTime;

  logWorkflow(
    "PARALLEL_EXECUTION_COMPLETE",
    `Total execution: ${stats.totalDurationMs}ms (searches + scrapes)`,
  );

  return { harvested, stats };
}
