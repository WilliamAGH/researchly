"use node";

/**
 * Context Management Helpers for Agent Workflows
 *
 * Handles source harvesting, normalization, and context/provenance tracking.
 * Used by orchestration.ts to prepare data for LLM context window.
 */

import { RELEVANCE_SCORES } from "../lib/constants/cache";
import { generateMessageId } from "../lib/id_generator";
import { normalizeHttpUrl } from "../lib/urlHttp";
import type { WebResearchSource } from "../lib/validators";
import { isUuidV7, normalizeUrl } from "./helpers_utils";
import {
  buildScrapedSourceContextMarkdown,
  buildSearchSourceContextMarkdown,
  type ScrapedHarvestedSource,
  type SearchHarvestedSource,
} from "./helpers_context_markdown";

const MAX_SOURCE_URL_LENGTH = 2048;

function normalizeSourceUrl(url: string | undefined): string | undefined {
  return normalizeHttpUrl(url, MAX_SOURCE_URL_LENGTH);
}

function requireNormalizedUrl(
  url: string,
  contextId: string,
  label: string,
): string | null {
  const normalized = normalizeSourceUrl(url);
  if (!normalized) {
    console.error(`[agents] Excluded ${label} with invalid URL`, {
      contextId,
      originalUrl: url,
    });
    return null;
  }
  return normalized;
}

function toNormalizedUrlSet(urls: string[]): Set<string> {
  return new Set(
    urls
      .map((url) => normalizeUrl(url))
      .filter((url): url is string => url !== null),
  );
}

export function normalizeSourceContextIds(
  sourcesUsed: Array<{
    url?: string;
    contextId?: string;
    type: "search_result" | "scraped_page";
  }>,
  urlContextMap: Map<string, string>,
): {
  normalized: Array<{
    url?: string;
    contextId: string;
    type: "search_result" | "scraped_page";
  }>;
  invalidCount: number;
} {
  const invalidSources: Array<{ url?: string; type: string }> = [];

  const normalized = (sourcesUsed || []).map((source) => {
    let contextId = source.contextId;
    if (!isUuidV7(contextId) && typeof source.url === "string") {
      const normalizedUrl = normalizeUrl(source.url);
      if (normalizedUrl) {
        const mapped = urlContextMap.get(normalizedUrl);
        if (mapped) {
          contextId = mapped;
        }
      }
    }

    if (!contextId || !isUuidV7(contextId)) {
      contextId = generateMessageId();
      invalidSources.push({ url: source.url, type: source.type });
    }

    return {
      ...source,
      contextId,
    };
  });

  return { normalized, invalidCount: invalidSources.length };
}

export function buildWebResearchSourcesFromHarvested(
  harvested: {
    scrapedContent: ScrapedHarvestedSource[];
    searchResults: SearchHarvestedSource[];
    failedScrapeUrls?: Set<string>;
    failedScrapeErrors?: Map<string, string>;
  },
  options?: { includeDebugSourceContext?: boolean },
): WebResearchSource[] {
  const includeDebugSourceContext = options?.includeDebugSourceContext === true;
  const webResearchSources: WebResearchSource[] = [];
  const now = Date.now();

  for (const scraped of harvested.scrapedContent) {
    const normalizedUrl = requireNormalizedUrl(
      scraped.url,
      scraped.contextId,
      "scraped source",
    );
    if (!normalizedUrl) continue;

    const metadata: Record<string, string | number | boolean> = {
      crawlAttempted: true,
      crawlSucceeded: true,
      // Persist the cleaned body captured by scrape_webpage for downstream UI/debug copy.
      scrapedBodyContent: scraped.content,
      scrapedBodyContentLength: scraped.contentLength,
    };
    if (includeDebugSourceContext) {
      metadata.serverContextMarkdown =
        buildScrapedSourceContextMarkdown(scraped);
    }

    webResearchSources.push({
      contextId: scraped.contextId,
      type: "scraped_page",
      url: normalizedUrl,
      title: scraped.title,
      timestamp: scraped.scrapedAt ?? now,
      relevanceScore: scraped.relevanceScore ?? RELEVANCE_SCORES.SCRAPED_PAGE,
      metadata,
    });
  }

  // Deduplicate and normalize scraped URLs
  const scrapedUrls = harvested.scrapedContent
    .map((s) => normalizeSourceUrl(s.url))
    .filter((url): url is string => typeof url === "string");
  const scrapedNormalizedUrls = toNormalizedUrlSet(scrapedUrls);

  // Deduplicate and normalize failed scrape URLs
  const failedUrls = Array.from(
    harvested.failedScrapeUrls ?? new Set<string>(),
  );
  const failedNormalizedUrls = toNormalizedUrlSet(failedUrls);

  const failedErrorByUrl = new Map<string, string>();
  for (const [url, error] of harvested.failedScrapeErrors ?? new Map()) {
    const normalized = normalizeUrl(url);
    if (normalized && typeof error === "string" && error.trim().length > 0) {
      failedErrorByUrl.set(normalized, error);
    }
  }

  for (const result of harvested.searchResults) {
    const normalizedUrl = requireNormalizedUrl(
      result.url,
      result.contextId ?? "unknown",
      "search result",
    );
    if (!normalizedUrl) continue;

    const normalizedResultUrl = normalizeUrl(normalizedUrl) ?? normalizedUrl;
    if (!scrapedNormalizedUrls.has(normalizedResultUrl)) {
      const wasFailedScrape = failedNormalizedUrls.has(normalizedResultUrl);
      const crawlErrorMessage = failedErrorByUrl.get(normalizedResultUrl);
      const relevanceScore =
        result.relevanceScore ?? RELEVANCE_SCORES.SEARCH_RESULT;
      // This flag is source metadata for UI/provenance only.
      // It does NOT remove tool output from the already-executed model run.
      const markedLowRelevance =
        !wasFailedScrape && relevanceScore < RELEVANCE_SCORES.MEDIUM_THRESHOLD;

      const metadata: Record<string, string | number | boolean> = {};
      if (wasFailedScrape) {
        metadata.crawlAttempted = true;
        metadata.crawlSucceeded = false;
        if (crawlErrorMessage) {
          metadata.crawlErrorMessage = crawlErrorMessage;
        }
      } else if (markedLowRelevance) {
        metadata.crawlAttempted = false;
        metadata.markedLowRelevance = true;
        metadata.relevanceThreshold = RELEVANCE_SCORES.MEDIUM_THRESHOLD;
      }
      if (includeDebugSourceContext) {
        metadata.serverContextMarkdown = buildSearchSourceContextMarkdown({
          source: result,
          crawlAttempted: wasFailedScrape,
          crawlSucceeded: !wasFailedScrape,
          crawlErrorMessage,
          markedLowRelevance,
        });
      }

      webResearchSources.push({
        contextId: result.contextId ?? generateMessageId(),
        type: "search_result",
        url: normalizedUrl,
        title: result.title,
        timestamp: now,
        relevanceScore,
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      });
    }
  }

  const uniqueSources = Array.from(
    new Map(
      webResearchSources.map((ref) => {
        const rawUrl = ref.url;
        if (rawUrl) {
          return [normalizeUrl(rawUrl) ?? rawUrl, ref] as const;
        }
        return [`${ref.type}:${ref.contextId}`, ref] as const;
      }),
    ).values(),
  );

  return uniqueSources;
}

/**
 * Convert normalized sources to WebResearchSource format.
 * Maps relevance labels to numeric scores for persistence.
 */
export function convertToWebResearchSources(
  sources: Array<{
    url: string;
    title: string;
    contextId: string;
    type: "search_result" | "scraped_page";
    relevance: "high" | "medium" | "low";
  }>,
): WebResearchSource[] {
  const now = Date.now();
  const relevanceToScore: Record<"high" | "medium" | "low", number> = {
    high: RELEVANCE_SCORES.HIGH_LABEL,
    medium: RELEVANCE_SCORES.MEDIUM_LABEL,
    low: RELEVANCE_SCORES.LOW_LABEL,
  };

  const converted: WebResearchSource[] = [];
  for (const source of sources) {
    const normalizedUrl = requireNormalizedUrl(
      source.url,
      source.contextId,
      "source",
    );
    if (!normalizedUrl) continue;

    converted.push({
      contextId: source.contextId,
      type: source.type,
      url: normalizedUrl,
      title: source.title,
      timestamp: now,
      relevanceScore: relevanceToScore[source.relevance],
    });
  }
  return converted;
}
