/**
 * Parallel research logging utilities.
 *
 * Extracted from workflow_logger.ts per [LOC1a].
 * These loggers are only consumed by the parallel research modules.
 */

import { logWorkflow } from "./workflow_logger";

/**
 * Log parallel search progress.
 */
export function logParallelSearch(queryCount: number): void {
  logWorkflow(
    "PARALLEL_SEARCH",
    `PARALLEL SEARCH: Executing ${queryCount} searches simultaneously...`,
  );
}

/**
 * Log individual search result.
 */
export function logSearchResult(
  durationMs: number,
  query: string,
  resultCount: number,
): void {
  logWorkflow(
    "PARALLEL_SEARCH",
    `PARALLEL SEARCH [${durationMs}ms]: "${query}" → ${resultCount} results`,
  );
}

/**
 * Log parallel search completion.
 */
export function logParallelSearchComplete(
  durationMs: number,
  totalResults: number,
): void {
  logWorkflow(
    "PARALLEL_SEARCH_COMPLETE",
    `PARALLEL SEARCH COMPLETE [${durationMs}ms]: ${totalResults} total results`,
  );
}

/**
 * Log parallel scrape progress.
 */
export function logParallelScrape(urlCount: number): void {
  logWorkflow(
    "PARALLEL_SCRAPE",
    `PARALLEL SCRAPE: Fetching ${urlCount} URLs simultaneously...`,
  );
}

/**
 * Log individual scrape result.
 */
export function logScrapeResult(
  durationMs: number,
  url: string,
  charCount: number,
): void {
  logWorkflow(
    "PARALLEL_SCRAPE",
    `PARALLEL SCRAPE [${durationMs}ms]: ${url} → ${charCount} chars`,
  );
}

/**
 * Log scrape skip due to minimal content.
 */
export function logScrapeSkip(
  durationMs: number,
  url: string,
  charCount: number,
): void {
  logWorkflow(
    "PARALLEL_SCRAPE_SKIP",
    `PARALLEL SCRAPE SKIP [${durationMs}ms]: ${url} (too short: ${charCount} chars)`,
  );
}

/**
 * Log parallel scrape completion.
 */
export function logParallelScrapeComplete(
  durationMs: number,
  successCount: number,
  totalCount: number,
): void {
  logWorkflow(
    "PARALLEL_SCRAPE_COMPLETE",
    `PARALLEL SCRAPE COMPLETE [${durationMs}ms]: ${successCount}/${totalCount} pages`,
  );
}
