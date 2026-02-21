/**
 * Desktop chat sidebar for chat navigation and management.
 * Fixed-position panel rendered alongside the main content area.
 */

import React, { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { Chat } from "@/lib/types/chat";
import { logger } from "@/lib/logger";
import { toConvexId } from "@/lib/utils/idValidation";
import { useSessionAwareDeleteChat } from "@/hooks/useSessionAwareDeleteChat";
import { ConfirmDialog } from "@/components/ConfirmDialog";

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

interface ChatSidebarProps {
  chats: Chat[];
  currentChatId: Id<"chats"> | string | null;
  onSelectChat: (chatId: Id<"chats"> | string | null) => void;
  onNewChat: () => void;
  onRequestDeleteChat?: (chatId: Id<"chats"> | string) => void;
  onToggle: () => void;
  isCreatingChat?: boolean;
}

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

  return (
    <div className="w-full h-full bg-white dark:bg-gray-900 flex flex-col">
      <ConfirmDialog
        open={deleteTargetId !== null}
        onConfirm={() => void confirmDeleteChat()}
        onCancel={cancelDeleteChat}
        title="Delete chat"
        message="Delete this chat? This cannot be undone."
      />

      <div className="px-4 pt-4 pb-3 flex flex-col gap-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 font-ui">
            Chats
          </span>
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center justify-center w-7 h-7 rounded-full ring-1 ring-gray-200/60 dark:ring-gray-700/60 hover:ring-emerald-400/50 dark:hover:ring-emerald-500/50 transition-all duration-150"
            title="Close sidebar"
            aria-label="Close sidebar"
          >
            <svg
              className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          onClick={onNewChat}
          disabled={isCreatingChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-ui"
        >
          {isCreatingChat ? <SpinnerIcon /> : <PlusIcon />}
          {isCreatingChat ? "Creating..." : "New Chat"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {deleteError && (
          <div
            role="alert"
            className="mb-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center justify-between gap-2 font-ui"
          >
            <span>{deleteError}</span>
            <button
              type="button"
              onClick={() => setDeleteError(null)}
              className="flex-shrink-0 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
              aria-label="Dismiss error"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        {chats.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-gray-400 dark:text-gray-500 font-ui">
            No chats yet. Start a new conversation!
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {chats.map((chat) => {
              const resolvedChatId = String(chat._id);
              const isSelected =
                currentChatId !== null &&
                String(currentChatId) === resolvedChatId;

              return (
                <div
                  key={chat._id}
                  className="group flex items-start gap-1 min-w-0"
                >
                  <button
                    type="button"
                    data-chat-id={resolvedChatId}
                    onClick={handleSelectClick}
                    className={`flex-1 min-w-0 px-3 py-2.5 rounded-lg text-left transition-colors duration-150 ${
                      isSelected
                        ? "bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-200/60 dark:ring-emerald-700/40"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
                    }`}
                  >
                    <div
                      className={`text-[13px] font-medium leading-snug line-clamp-2 min-w-0 ${
                        isSelected
                          ? "text-emerald-800 dark:text-emerald-300"
                          : "text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {chat.title}
                    </div>
                    <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-ui">
                      {new Date(chat.updatedAt).toLocaleDateString()}
                    </div>
                  </button>
                  <button
                    type="button"
                    data-chat-id={resolvedChatId}
                    onClick={handleDeleteClick}
                    className="flex-shrink-0 mt-2 p-1.5 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-500 dark:hover:text-red-400 rounded-md transition-all duration-150"
                    title="Delete chat"
                    aria-label="Delete chat"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
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

function PlusIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="w-4 h-4 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
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
  );
}
