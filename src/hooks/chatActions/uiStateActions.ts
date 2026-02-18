/**
 * UI state actions for chat.
 *
 * Extracted from useChatActions.ts per [LOC1a].
 * Simple setState wrappers for UI-only state mutations.
 */

import type { Dispatch, SetStateAction } from "react";
import type { ChatState } from "@/hooks/useChatState";

export function createUiStateActions(
  setState: Dispatch<SetStateAction<ChatState>>,
) {
  return {
    handleToggleSidebar() {
      setState((prev) => ({ ...prev, isSidebarOpen: !prev.isSidebarOpen }));
    },

    setShowFollowUpPrompt(show: boolean) {
      setState((prev) => ({ ...prev, showFollowUpPrompt: show }));
    },

    setShowShareModal(show: boolean) {
      setState((prev) => ({ ...prev, showShareModal: show }));
    },

    setPendingMessage(message: string) {
      setState((prev) => ({ ...prev, pendingMessage: message }));
    },

    addToHistory(message: string) {
      setState((prev) => ({
        ...prev,
        userHistory: [...prev.userHistory, message],
      }));
    },

    setError(message: string) {
      setState((prev) => ({ ...prev, error: message }));
    },

    clearError() {
      setState((prev) => ({ ...prev, error: null }));
    },
  };
}
