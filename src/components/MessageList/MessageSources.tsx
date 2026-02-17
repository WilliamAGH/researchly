/**
 * Message Sources (Web Research Sources)
 *
 * Renders the canonical `webResearchSources` domain object.
 * UI cards are derived-only via a single adapter.
 * Collapse/expand uses CSS grid-template-rows for smooth height transitions.
 */

import React from "react";
import {
  hasWebResearchSources,
  toWebSourceCards,
} from "@/lib/domain/webResearchSources";
import type { WebResearchSourceClient } from "@/lib/schemas/messageStream";
import {
  getDomainFromUrl,
  getFaviconUrl,
  getSafeHostname,
} from "@/lib/utils/favicon";
import { SourceCard } from "./SourceCard";

const PREVIEW_SOURCE_COUNT = 3;

type CrawlState = "succeeded" | "failed" | "not_attempted" | "not_applicable";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSourceCrawlState(source: {
  type?: WebResearchSourceClient["type"];
  metadata?: WebResearchSourceClient["metadata"];
}): CrawlState {
  if (source.type === "research_summary") return "not_applicable";
  if (source.type === "scraped_page") return "succeeded";
  if (!isRecord(source.metadata)) return "not_attempted";

  const attempted = source.metadata.crawlAttempted;
  const succeeded = source.metadata.crawlSucceeded;
  if (source.metadata.markedLowRelevance === true) return "not_attempted";
  if (attempted === true && succeeded === false) return "failed";
  if (attempted === true && succeeded === true) return "succeeded";
  return "not_attempted";
}

function getServerContextMarkdown(
  metadata: WebResearchSourceClient["metadata"],
): string | undefined {
  if (!isRecord(metadata)) return undefined;
  const raw = metadata.serverContextMarkdown;
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

interface MessageSourcesProps {
  id: string;
  webResearchSources: WebResearchSourceClient[] | undefined;
  collapsed: boolean;
  onToggle: (id: string) => void;
  hoveredSourceUrl: string | null;
  onSourceHover: (url: string | null) => void;
}

export function MessageSources({
  id,
  webResearchSources,
  collapsed,
  onToggle,
  hoveredSourceUrl,
  onSourceHover,
}: MessageSourcesProps) {
  const messageId = id || "unknown";
  const handleToggleClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      onToggle(messageId);
    },
    [messageId, onToggle],
  );
  if (!hasWebResearchSources(webResearchSources)) return null;

  const displaySources = toWebSourceCards(webResearchSources);
  const previewSources = displaySources.slice(0, PREVIEW_SOURCE_COUNT);
  const showDevSourceContextCopy = import.meta.env.DEV;
  const sourceRows = displaySources.map((source) => ({
    source,
    crawlState: getSourceCrawlState(source),
    markedLowRelevance: source.metadata?.markedLowRelevance === true,
    crawlErrorMessage:
      typeof source.metadata?.crawlErrorMessage === "string"
        ? source.metadata.crawlErrorMessage
        : undefined,
    serverContextMarkdown: showDevSourceContextCopy
      ? getServerContextMarkdown(source.metadata)
      : undefined,
  }));

  return (
    <div className="mt-3 max-w-full min-w-0 overflow-hidden">
      <button
        type="button"
        onClick={handleToggleClick}
        className="w-full text-left px-2 sm:px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 transition-colors touch-manipulation"
        aria-expanded={!collapsed}
        aria-label="Toggle sources display"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 sm:gap-2 text-[15px] sm:text-base text-gray-700 dark:text-gray-300 min-w-0">
            <svg
              className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <span className="font-medium">Sources</span>
            <span className="text-gray-500 dark:text-gray-400">
              ({displaySources.length})
            </span>
          </div>
          <svg
            className={`w-3 h-3 sm:w-4 sm:h-4 text-gray-500 dark:text-gray-400 transition-transform flex-shrink-0 ${collapsed ? "" : "rotate-180"}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>

        {/* Preview badges — always mounted, animated via grid-rows */}
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
            collapsed
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0"
          }`}
          aria-hidden={!collapsed}
        >
          <div className="overflow-hidden min-h-0">
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {previewSources.map((source, i) => {
                const hostname =
                  getDomainFromUrl(source.url) || getSafeHostname(source.url);
                const favicon = getFaviconUrl(source.url);
                return (
                  <a
                    key={`${messageId}-preview-${source.url}-${i}`}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    tabIndex={collapsed ? 0 : -1}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
                  >
                    {favicon && (
                      <img src={favicon} alt="" className="w-3 h-3 rounded" />
                    )}
                    <span className="max-w-[120px] truncate">{hostname}</span>
                  </a>
                );
              })}
              {displaySources.length > PREVIEW_SOURCE_COUNT && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  +{displaySources.length - PREVIEW_SOURCE_COUNT} more
                </span>
              )}
            </div>
          </div>
        </div>
      </button>

      {/* Expanded source list — always mounted, animated via grid-rows */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
        }`}
        aria-hidden={collapsed}
      >
        <div className="overflow-hidden min-h-0">
          <div className="mt-2 space-y-2 px-2 max-h-[300px] overflow-y-auto">
            {sourceRows.map(
              (
                {
                  source,
                  crawlState,
                  markedLowRelevance,
                  crawlErrorMessage,
                  serverContextMarkdown,
                },
                i,
              ) => (
                <SourceCard
                  key={`${messageId}-source-${source.url}-${i}`}
                  source={source}
                  messageId={messageId}
                  index={i}
                  crawlState={crawlState}
                  markedLowRelevance={markedLowRelevance}
                  crawlErrorMessage={crawlErrorMessage}
                  serverContextMarkdown={serverContextMarkdown}
                  hoveredSourceUrl={hoveredSourceUrl}
                  onSourceHover={onSourceHover}
                  showDevSourceContextCopy={showDevSourceContextCopy}
                />
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
