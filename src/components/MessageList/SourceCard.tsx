/**
 * Individual source card for the expanded sources list.
 * Extracted from MessageSources per [LOC1] / [FS1b].
 */

import React from "react";
import { CopyButton } from "@/components/CopyButton";
import type { WebSourceCard } from "@/lib/domain/webResearchSources";
import type { WebResearchSourceClient } from "@/lib/schemas/messageStream";
import {
  getDomainFromUrl,
  getFaviconUrl,
  getSafeHostname,
} from "@/lib/utils/favicon";

const HIGH_RELEVANCE_THRESHOLD = 0.8;
const MEDIUM_RELEVANCE_THRESHOLD = 0.5;

export type CrawlState =
  | "succeeded"
  | "failed"
  | "not_attempted"
  | "not_applicable";

/** Per-source data computed by the parent and passed as a single object. */
export interface SourceCardData {
  source: WebSourceCard;
  crawlState: CrawlState;
  markedLowRelevance: boolean;
  crawlErrorMessage: string | undefined;
  serverContextMarkdown: string | undefined;
}

interface SourceCardProps {
  data: SourceCardData;
  messageId: string;
  index: number;
  hoveredSourceUrl: string | null;
  onSourceHover: (url: string | null) => void;
  showDevSourceContextCopy: boolean;
  /** When true, removes card links from the tab order (expanded list is hidden). */
  isCollapsed?: boolean;
}

function resolveCrawlStatus(
  source: { type?: WebResearchSourceClient["type"] },
  markedLowRelevance: boolean,
  crawlState: CrawlState,
  crawlErrorMessage: string | undefined,
): { label: string; dotColor: string } | null {
  if (source.type === "research_summary") return null;
  if (markedLowRelevance) {
    return {
      label: "Low relevance source",
      dotColor: "bg-slate-500/70 dark:bg-slate-400/70",
    };
  }
  if (crawlState === "succeeded") {
    return { label: "Crawl successful", dotColor: "bg-emerald-500/80" };
  }
  if (crawlState === "failed") {
    const msg = crawlErrorMessage
      ? `Crawl failed: ${crawlErrorMessage.length > 120 ? crawlErrorMessage.slice(0, 120) + "..." : crawlErrorMessage}. Some sites do not allow automated visitors — other sources were used instead.`
      : "Crawl attempted, failed. Some sites do not allow automated visitors — other sources were used instead.";
    return { label: msg, dotColor: "bg-amber-500/80" };
  }
  return null;
}

function resolveRelevanceBadge(
  score: number | undefined,
): { label: string; color: string } | null {
  if (score === undefined) return null;
  if (score >= HIGH_RELEVANCE_THRESHOLD) {
    return {
      label: "high",
      color:
        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    };
  }
  if (score >= MEDIUM_RELEVANCE_THRESHOLD) {
    return {
      label: "medium",
      color:
        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    };
  }
  return null;
}

function resolveTypeBadge(
  type: string | undefined,
): { label: string; color: string } | null {
  if (type === "scraped_page") {
    return {
      label: "crawled",
      color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    };
  }
  if (type === "research_summary") {
    return {
      label: "summary",
      color:
        "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    };
  }
  return null;
}

export const SourceCard = React.memo(function SourceCard({
  data,
  messageId,
  index,
  hoveredSourceUrl,
  onSourceHover,
  showDevSourceContextCopy,
  isCollapsed = false,
}: SourceCardProps) {
  const {
    source,
    crawlState,
    markedLowRelevance,
    crawlErrorMessage,
    serverContextMarkdown,
  } = data;
  const hostname = getDomainFromUrl(source.url) || getSafeHostname(source.url);
  const favicon = getFaviconUrl(source.url);
  const isHovered = hoveredSourceUrl === source.url;
  const crawlStatus = resolveCrawlStatus(
    source,
    markedLowRelevance,
    crawlState,
    crawlErrorMessage,
  );
  const relevanceBadge = resolveRelevanceBadge(source.relevanceScore);
  const typeBadge = resolveTypeBadge(source.type);

  return (
    <div
      key={`${messageId}-source-${source.url}-${index}`}
      className="flex items-start gap-2"
    >
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={isCollapsed ? -1 : 0}
        aria-hidden={isCollapsed}
        className={`block flex-1 min-w-0 p-2 sm:p-3 rounded-lg border transition-all ${
          isHovered
            ? "border-yellow-400 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20"
            : "border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
        }`}
        onMouseEnter={() => onSourceHover(source.url)}
        onMouseLeave={() => onSourceHover(null)}
      >
        <div className="flex items-start gap-2">
          {favicon && (
            <img src={favicon} alt="" className="w-4 h-4 mt-0.5 rounded" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <div className="font-medium text-[15px] sm:text-base text-gray-900 dark:text-gray-100 line-clamp-1 flex-1 min-w-0">
                {source.title}
              </div>
              {typeBadge && (
                <span
                  className={`px-1.5 py-0.5 text-[10px] sm:text-xs font-medium rounded flex-shrink-0 ${typeBadge.color}`}
                >
                  {typeBadge.label}
                </span>
              )}
              {relevanceBadge && (
                <span
                  className={`px-1.5 py-0.5 text-[10px] sm:text-xs font-medium rounded flex-shrink-0 ${relevanceBadge.color}`}
                >
                  {relevanceBadge.label}
                </span>
              )}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
              <span className="inline-flex items-center gap-1.5">
                {crawlStatus && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${crawlStatus.dotColor}`}
                    title={crawlStatus.label}
                    aria-label={crawlStatus.label}
                  />
                )}
                <span>{hostname}</span>
              </span>
            </div>
          </div>
        </div>
      </a>
      {showDevSourceContextCopy && serverContextMarkdown && (
        <CopyButton
          text={serverContextMarkdown}
          size="sm"
          className="mt-2 sm:mt-3 shrink-0"
          title="Copy Convex source context (Markdown)"
          ariaLabel="Copy Convex source context markdown"
        />
      )}
    </div>
  );
});
