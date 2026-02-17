/**
 * Follow-up prompt banner
 * - Suggests starting a new chat vs continuing current
 * - Shows inline error if summarization failed
 * - Minimal, unobtrusive UI for quick choice
 */

import React from "react";

interface FollowUpPromptProps {
  isOpen: boolean;
  onContinue: () => void;
  onNewChat: () => void;
  onNewChatWithSummary?: () => void;
  /** Error from the last summarization attempt, shown inline so the user knows summary failed. */
  summaryError?: Error;
}

export function FollowUpPrompt({
  isOpen,
  onContinue,
  onNewChat,
  onNewChatWithSummary,
  summaryError,
}: Readonly<FollowUpPromptProps>) {
  if (!isOpen) return null;

  return (
    <output className="absolute bottom-full w-full max-w-3xl mx-auto left-0 right-0 px-3 mb-2 animate-slide-up z-40 block">
      <div className="w-full border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-200 rounded-md">
        <div className="px-3 sm:px-4 py-2">
          {/* Headline row */}
          <div className="flex items-center gap-2 mb-1">
            <svg
              aria-hidden="true"
              className="w-4 h-4 text-amber-600 dark:text-amber-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="text-sm font-medium">
              This looks like a new topic.
            </span>
          </div>

          {/* Content + actions row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-2">
            <div
              className="text-xs text-amber-800/90 dark:text-amber-200/90 sm:flex-1 min-w-0 truncate sm:whitespace-normal"
              title="New chats keep results focused and on topic."
            >
              Start a new chat for better results on changes from your original
              topic.
              {summaryError && (
                <span className="block mt-1 text-red-600 dark:text-red-400">
                  Could not load summary. Try again or start a plain new chat.
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto sm:flex-row sm:flex-wrap md:flex-nowrap sm:justify-end shrink-0">
              <button
                type="button"
                onClick={onNewChat}
                className="px-2 md:px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[13px] font-medium rounded-md transition-colors whitespace-nowrap w-full sm:w-auto"
              >
                Start New Chat
              </button>
              {onNewChatWithSummary && (
                <button
                  type="button"
                  onClick={onNewChatWithSummary}
                  className="px-2 md:px-2.5 py-1 bg-emerald-600/90 hover:bg-emerald-700 text-white text-[13px] font-medium rounded-md transition-colors whitespace-nowrap w-full sm:w-auto"
                >
                  New Chat w/ Summary
                </button>
              )}
              <button
                type="button"
                onClick={onContinue}
                className="px-2 md:px-2.5 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-[13px] font-medium rounded-md transition-colors whitespace-nowrap w-full sm:w-auto"
              >
                Continue Here
              </button>
            </div>
          </div>
        </div>
      </div>
    </output>
  );
}
