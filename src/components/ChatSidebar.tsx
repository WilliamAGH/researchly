import React, { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { Chat } from "@/lib/types/chat";
import { logger } from "@/lib/logger";
import { toConvexId } from "@/lib/utils/idValidation";
import { useSessionAwareDeleteChat } from "@/hooks/useSessionAwareDeleteChat";
import { ConfirmDialog } from "@/components/ConfirmDialog";

/**
 * Execute chat deletion based on available handlers.
 */
async function executeDeleteChat(
  chatId: string,
  chat: Chat | undefined,
  handlers: {
    onRequestDeleteChat?: (chatId: Id<"chats"> | string) => void;
    deleteChat: (chatId: Id<"chats">) => Promise<void>;
  },
): Promise<void> {
  const { onRequestDeleteChat, deleteChat } = handlers;
  const resolvedId = String(chat?._id ?? chatId);
  const convexId = toConvexId<"chats">(resolvedId);

  if (!convexId) {
    throw new Error(`Invalid chat ID for deletion: ${resolvedId}`);
  }

  if (onRequestDeleteChat) {
    onRequestDeleteChat(convexId);
    return;
  }

  await deleteChat(convexId);
}

/**
 * Props for the ChatSidebar component
 * @interface ChatSidebarProps
 */
interface ChatSidebarProps {
  /** List of all available chats to display */
  chats: Chat[];
  /** ID of the currently selected/active chat */
  currentChatId: Id<"chats"> | string | null;
  /** Callback fired when user selects a chat from the list */
  onSelectChat: (chatId: Id<"chats"> | string | null) => void;
  /** Callback fired when user clicks the "New Chat" button */
  onNewChat: () => void;
  /** Optional callback to request deletion of a synced chat */
  onRequestDeleteChat?: (chatId: Id<"chats"> | string) => void;
  /** Callback to toggle sidebar open/closed state */
  onToggle: () => void;
  /** Indicates if a new chat is currently being created (shows loading state) */
  isCreatingChat?: boolean;
}

/**
 * ChatSidebar component - Main navigation sidebar for chat selection and management
 *
 * Provides:
 * - List of all available chats with titles
 * - Chat selection functionality
 * - New chat creation button
 * - Chat deletion capabilities
 * - Responsive behavior (drawer on mobile, sidebar on desktop)
 *
 * @component
 * @param {ChatSidebarProps} props - Component props
 * @returns {JSX.Element} Rendered sidebar component
 */
export function ChatSidebar({
  chats,
  currentChatId,
  onSelectChat,
  onNewChat,
  onRequestDeleteChat,
  onToggle,
  isCreatingChat = false,
}: Readonly<ChatSidebarProps>) {
  const deleteChat = useSessionAwareDeleteChat();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleSelectChat = React.useCallback(
    (chatId: Id<"chats"> | string) => {
      onSelectChat(chatId);
    },
    [onSelectChat],
  );

  // Avoid inline functions in JSX: use dataset-driven handlers
  const handleSelectClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const { chatId } = e.currentTarget.dataset;
      if (!chatId) return;
      const match = chats.find((c) => String(c._id) === chatId);
      handleSelectChat(match ? match._id : chatId);
    },
    [chats, handleSelectChat],
  );

  const handleDeleteClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const { chatId } = e.currentTarget.dataset;
      if (!chatId) return;
      setDeleteTargetId(chatId);
    },
    [],
  );

  const confirmDeleteChat = React.useCallback(async () => {
    if (!deleteTargetId) return;
    const chat = chats.find((c) => String(c._id) === deleteTargetId);

    try {
      setDeleteError(null);
      await executeDeleteChat(deleteTargetId, chat, {
        onRequestDeleteChat,
        deleteChat,
      });

      // Only dismiss dialog and navigate after successful deletion
      setDeleteTargetId(null);
      const currentIdString =
        currentChatId === null ? null : String(currentChatId);
      if (chat?._id && currentIdString === String(chat._id)) {
        onSelectChat(null);
      }
    } catch (err) {
      logger.warn("Chat deletion failed:", err);
      setDeleteError("Failed to delete chat. Please try again.");
    }
  }, [
    deleteTargetId,
    chats,
    onRequestDeleteChat,
    deleteChat,
    onSelectChat,
    currentChatId,
  ]);

  const cancelDeleteChat = React.useCallback(() => {
    setDeleteTargetId(null);
  }, []);

  // Always render the sidebar container so tests can locate the "New Chat" button
  // even when visually hidden on small screens. We use CSS to hide it when closed.

  return (
    <div className="w-full h-full bg-muted/30 flex flex-col">
      <ConfirmDialog
        open={deleteTargetId !== null}
        onConfirm={() => void confirmDeleteChat()}
        onCancel={cancelDeleteChat}
        title="Delete chat"
        message="Delete this chat? This cannot be undone."
      />
      <div className="p-3 sm:p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Chats</h3>
          <button
            type="button"
            onClick={() => {
              onToggle();
            }}
            className="p-1 hover:bg-muted rounded transition-colors"
            title="Close sidebar"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <title>Close sidebar</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <button
          type="button"
          onClick={onNewChat}
          disabled={isCreatingChat}
          className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreatingChat ? (
            <svg
              className="w-5 h-5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <title>Creating chat</title>
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
          ) : (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <title>New chat</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          )}
          {isCreatingChat ? "Creating..." : "New Chat"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {deleteError && (
          <div
            role="alert"
            className="mx-2 mt-2 px-3 py-2 text-sm text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-900/20 rounded-lg flex items-center justify-between gap-2"
          >
            <span>{deleteError}</span>
            <button
              type="button"
              onClick={() => setDeleteError(null)}
              className="flex-shrink-0 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
              aria-label="Dismiss error"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <title>Dismiss</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}
        {chats.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            No chats yet. Start a new conversation!
          </div>
        ) : (
          <div className="p-2">
            {chats.map((chat) => {
              const resolvedChatId = String(chat._id);
              const isSelected =
                currentChatId !== null &&
                String(currentChatId) === resolvedChatId;

              return (
                <div
                  key={chat._id}
                  className="flex items-center gap-2 mb-1 pr-2 min-w-0"
                >
                  <button
                    type="button"
                    data-chat-id={resolvedChatId}
                    onClick={handleSelectClick}
                    className={`flex-1 min-w-0 p-3 rounded-lg text-left hover:bg-muted transition-colors ${
                      isSelected ? "bg-muted" : ""
                    }`}
                  >
                    <div className="text-sm font-medium truncate min-w-0 leading-tight">
                      {chat.title}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 min-w-0 mt-0.5">
                      <span className="truncate">
                        {new Date(chat.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    data-chat-id={resolvedChatId}
                    onClick={handleDeleteClick}
                    className="flex-shrink-0 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200"
                    title="Delete chat"
                    aria-label="Delete chat"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <title>Delete chat</title>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
