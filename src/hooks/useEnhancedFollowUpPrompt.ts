import { useState, useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { logger } from "@/lib/logger";
import type { Id } from "../../convex/_generated/dataModel";
import { toConvexId } from "@/lib/utils/idValidation";
import { isTopicChange } from "@/lib/utils/topicDetection";

/** Minimum user messages between consecutive follow-up prompt appearances. */
const FOLLOW_UP_COOLDOWN_MESSAGES = 4;

interface UseEnhancedFollowUpPromptProps {
  currentChatId: string | null;
  handleNewChat: (opts?: { userInitiated?: boolean }) => Promise<string | null>;
  sendRef: RefObject<
    | ((
        message: string,
        imageStorageIds?: string[],
        priorChatSummary?: string,
      ) => Promise<void>)
    | null
  >;
  summarizeRecentAction?: (args: { chatId: Id<"chats"> }) => Promise<string>;
  chatState: {
    messages?: Array<{ role?: string; content?: string }>;
    isGenerating?: boolean;
  } | null;
}

interface FollowUpCheckResult {
  shouldShow: boolean;
  suggestions: string[];
  followUpMessage: string | null;
}

/** Check if follow-up prompt should be shown based on message history */
function checkFollowUpConditions(
  messages: Array<{ role?: string; content?: string }>,
  isGenerating: boolean | undefined,
): FollowUpCheckResult {
  const userMessages = messages.filter((m) => m?.role === "user");
  const assistantMessages = messages.filter((m) => m?.role === "assistant");

  // Require at least 4 user messages before ever showing the prompt
  if (userMessages.length < 4 || assistantMessages.length === 0) {
    return { shouldShow: false, suggestions: [], followUpMessage: null };
  }

  const lastMessage = messages[messages.length - 1];
  const hasUserHistory = messages.some((m) => m?.role === "user");
  const lastUserMessage = userMessages[userMessages.length - 1];
  const previousUserMessage = userMessages[userMessages.length - 2];

  if (
    !hasUserHistory ||
    lastMessage?.role !== "assistant" ||
    !lastMessage.content ||
    !lastUserMessage?.content ||
    !previousUserMessage?.content
  ) {
    return { shouldShow: false, suggestions: [], followUpMessage: null };
  }

  // Only show if there's a topic change
  const hasTopicChanged = isTopicChange(
    lastUserMessage.content,
    previousUserMessage.content,
  );

  if (hasTopicChanged) {
    const suggestions = generateFollowUpSuggestions(lastMessage.content);
    return {
      shouldShow: suggestions.length > 0 && !isGenerating,
      suggestions,
      followUpMessage: lastUserMessage.content,
    };
  }

  return { shouldShow: false, suggestions: [], followUpMessage: null };
}

function generateFollowUpSuggestions(content: string): string[] {
  const suggestions: string[] = [];
  const contentLower = content.toLowerCase();

  if (contentLower.includes("code")) {
    suggestions.push(
      "Can you explain this code in more detail?",
      "How can I test this implementation?",
    );
  }

  if (contentLower.includes("error")) {
    suggestions.push("What causes this error?", "How can I debug this issue?");
  }

  if (suggestions.length === 0) {
    suggestions.push("Tell me more about this", "What are the alternatives?");
  }

  return suggestions.slice(0, 3);
}

/**
 * Hook to manage enhanced follow-up prompts and chat continuations
 */
export function useEnhancedFollowUpPrompt({
  currentChatId,
  handleNewChat,
  sendRef,
  summarizeRecentAction,
  chatState,
}: UseEnhancedFollowUpPromptProps) {
  const [showFollowUpPrompt, setShowFollowUpPrompt] = useState(false);
  // Queue used only when user explicitly chooses "Start New Chat" flow.
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  /** Guards against dispatching the same pending message twice (race condition). */
  const dispatchedRef = useRef(false);
  /** Compact summary from the prior chat; stored in a ref so the dispatch effect reads it synchronously. */
  const priorChatSummaryRef = useRef<string | null>(null);
  /**
   * Number of user messages present the last time the prompt was shown.
   * Initialized to 0 so the first eligible show is gated by the message
   * minimum in checkFollowUpConditions; after that, the prompt may only
   * re-appear once at least FOLLOW_UP_COOLDOWN_MESSAGES more have been sent.
   */
  const lastShownAtUserMsgCountRef = useRef(0);
  // Candidate message detected from topic shift; never auto-sent by itself.
  const [followUpMessage, setFollowUpMessage] = useState<string | null>(null);
  const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([]);
  const [summaryError, setSummaryError] = useState<Error | null>(null);

  /** Evaluate follow-up conditions with cooldown gating. */
  const evaluateFollowUp = useCallback(() => {
    const messages = chatState?.messages || [];
    const userMsgCount = messages.filter((m) => m?.role === "user").length;
    const result = checkFollowUpConditions(messages, chatState?.isGenerating);
    const cooledDown =
      userMsgCount - lastShownAtUserMsgCountRef.current >=
      FOLLOW_UP_COOLDOWN_MESSAGES;

    return {
      ...result,
      shouldShow: result.shouldShow && cooledDown,
      userMsgCount,
    };
  }, [chatState?.messages, chatState?.isGenerating]);

  // Generate follow-up suggestions based on last assistant message
  useEffect(() => {
    const {
      shouldShow,
      suggestions,
      followUpMessage: msg,
      userMsgCount,
    } = evaluateFollowUp();

    if (shouldShow) {
      lastShownAtUserMsgCountRef.current = userMsgCount;
      setFollowUpSuggestions(suggestions);
      setFollowUpMessage(msg);
      setShowFollowUpPrompt(true);
    } else {
      setShowFollowUpPrompt(false);
      setFollowUpMessage(null);
    }
  }, [evaluateFollowUp]);

  const resetFollowUp = useCallback(() => {
    setShowFollowUpPrompt(false);
    setFollowUpSuggestions([]);
    setPendingMessage(null);
    setFollowUpMessage(null);
    setSummaryError(null);
  }, []);

  const maybeShowFollowUpPrompt = useCallback(() => {
    const {
      shouldShow,
      followUpMessage: msg,
      userMsgCount,
    } = evaluateFollowUp();

    if (shouldShow) {
      lastShownAtUserMsgCountRef.current = userMsgCount;
      setFollowUpMessage(msg);
      setShowFollowUpPrompt(true);
    }
  }, [evaluateFollowUp]);

  const handleContinueChat = useCallback(() => {
    resetFollowUp();
  }, [resetFollowUp]);

  const handleNewChatForFollowUp = useCallback(async () => {
    const messageToSend = followUpMessage;
    lastShownAtUserMsgCountRef.current = 0;
    resetFollowUp();
    if (messageToSend) {
      setPendingMessage(messageToSend);
    }
    await handleNewChat({ userInitiated: true });
  }, [followUpMessage, handleNewChat, resetFollowUp]);

  const handleNewChatWithSummary = useCallback(async () => {
    const messageToSend = followUpMessage;
    resetFollowUp();

    // Step 1: Fetch the summary BEFORE navigation so it's ready when the new chat loads.
    priorChatSummaryRef.current = null;
    if (summarizeRecentAction && currentChatId) {
      const convexChatId = toConvexId<"chats">(currentChatId);
      if (!convexChatId) {
        setSummaryError(new Error("Invalid chat ID — cannot summarize."));
        return;
      }
      try {
        const summary = await summarizeRecentAction({ chatId: convexChatId });
        priorChatSummaryRef.current = summary;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("Failed to summarize recent chat:", error);
        setSummaryError(error);
        // Abort: do not start a new chat if summary fails
        return;
      }
    }

    // Step 2: Queue the message and navigate — the dispatch effect will attach the summary.
    if (messageToSend) {
      setPendingMessage(messageToSend);
    }
    await handleNewChat({ userInitiated: true });
  }, [
    currentChatId,
    followUpMessage,
    handleNewChat,
    resetFollowUp,
    summarizeRecentAction,
  ]);

  // Send pending message when chat is ready
  useEffect(() => {
    if (!pendingMessage) {
      dispatchedRef.current = false;
      return;
    }
    if (!currentChatId || !sendRef.current) return;
    if (dispatchedRef.current) return;

    dispatchedRef.current = true;
    const summary = priorChatSummaryRef.current;
    priorChatSummaryRef.current = null;
    let stale = false;
    const sendMessage = async () => {
      try {
        await sendRef.current?.(
          pendingMessage,
          undefined,
          summary ?? undefined,
        );
        if (!stale) {
          setPendingMessage(null);
        }
      } catch (err) {
        logger.error("Failed to send follow-up message:", err);
        if (!stale) {
          setPendingMessage(null);
        }
      } finally {
        // Always reset guard so new pending messages can dispatch,
        // whether the send succeeded, failed, or was stale.
        dispatchedRef.current = false;
      }
    };
    void sendMessage();
    return () => {
      stale = true;
    };
  }, [pendingMessage, currentChatId, sendRef]);

  return {
    showFollowUpPrompt,
    pendingMessage,
    resetFollowUp,
    maybeShowFollowUpPrompt,
    setPendingMessage,
    handleContinueChat,
    handleNewChatForFollowUp,
    handleNewChatWithSummary,
    followUpSuggestions,
    /** Error from last summarization attempt, if any. Callers can use this to show UI feedback. */
    summaryError,
  };
}
