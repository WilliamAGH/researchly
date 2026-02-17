import React, { useCallback, useEffect, useRef } from "react";

const COLLAPSED_PREVIEW_MAX_CHARS = 140;

interface ReasoningDisplayProps {
  id: string;
  reasoning: string;
  thinkingText?: string;
  isThinkingActive?: boolean;
  isStreaming?: boolean;
  hasStartedContent?: boolean;
  collapsed: boolean;
  onToggle: (id: string) => void;
}

function getCollapsedPreviewText(reasoning: string): string {
  const singleLine = reasoning.replaceAll(/\s+/g, " ").trim();
  if (!singleLine) return "";
  if (singleLine.length <= COLLAPSED_PREVIEW_MAX_CHARS) {
    return singleLine;
  }
  return `...${singleLine.slice(-COLLAPSED_PREVIEW_MAX_CHARS)}`;
}

export function ReasoningDisplay({
  id,
  reasoning,
  thinkingText,
  isThinkingActive = false,
  isStreaming = false,
  hasStartedContent = false,
  collapsed,
  onToggle,
}: Readonly<ReasoningDisplayProps>) {
  const handleToggle = useCallback(() => {
    onToggle(`reasoning-${id}`);
  }, [id, onToggle]);

  // Force WebKit repaint when thinking state transitions to inactive.
  // Mobile Safari can leave CSS animations (animate-spin) stuck on
  // composited layers when the class is removed without a repaint.
  const spinnerRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (isThinkingActive || !spinnerRef.current) return;
    const el = spinnerRef.current;
    el.style.animation = "none";
    // Reading layout forces a synchronous reflow/repaint
    void el.getBoundingClientRect();
    el.style.animation = "";
  }, [isThinkingActive]);

  const normalizedReasoning = reasoning.replace(/^\s*-\s+/, "");
  const hasReasoning = normalizedReasoning.trim().length > 0;
  const shouldRenderPanel =
    isStreaming && (isThinkingActive || hasReasoning || thinkingText?.trim());
  if (!shouldRenderPanel) return null;

  const displayThinkingText = isThinkingActive
    ? thinkingText?.trim() || "Thinking..."
    : "Reasoning";
  const collapsedPreview = getCollapsedPreviewText(normalizedReasoning);
  const showCollapsedPreview = collapsed && collapsedPreview.length > 0;

  return (
    <div className="mt-1 max-w-full overflow-hidden">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full text-left px-2 py-3 rounded bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-800/50 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 active:bg-blue-200/50 dark:active:bg-blue-900/40 transition-colors touch-manipulation"
        aria-expanded={collapsed ? "false" : "true"}
        aria-label="Toggle AI thinking display"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1 flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300 flex-shrink-0">
              <svg
                ref={spinnerRef}
                className={`w-4 h-4 flex-shrink-0 ${isThinkingActive ? "animate-spin" : ""}`}
                style={{ willChange: isThinkingActive ? "transform" : "auto" }}
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="min-w-0 break-words">{displayThinkingText}</span>
            </div>
            {showCollapsedPreview && (
              <div className="min-w-0 flex-1 text-[10px] sm:text-xs text-blue-700/90 dark:text-blue-300/90 font-mono leading-relaxed whitespace-nowrap truncate opacity-90">
                {collapsedPreview}
                {isStreaming && !hasStartedContent && (
                  <span className="animate-pulse ml-0.5">▊</span>
                )}
              </div>
            )}
          </div>
          <svg
            className={`w-2.5 h-2.5 sm:w-3 sm:h-3 text-blue-500 dark:text-blue-400 opacity-60 transition-transform flex-shrink-0 ${collapsed ? "" : "rotate-180"}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>
      {collapsed || !hasReasoning ? null : (
        <div className="mt-1 p-2 rounded bg-blue-50/30 dark:bg-blue-900/10 border border-blue-200/30 dark:border-blue-800/30 max-w-full overflow-hidden">
          <div className="text-[10px] sm:text-xs text-blue-700/90 dark:text-blue-300/90 font-mono leading-relaxed whitespace-pre-wrap break-words max-h-48 overflow-auto opacity-90">
            {normalizedReasoning}
            {isStreaming && !hasStartedContent && (
              <span className="animate-pulse ml-0.5">▊</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
