/**
 * Mobile sidebar drawer for chat navigation.
 * Slides in from the left with a scrim overlay.
 */

import {
  Dialog,
  DialogPanel,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { Fragment, useRef, useCallback, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { Chat } from "@/lib/types/chat";
import { logger } from "@/lib/logger";
import { useSessionAwareDeleteChat } from "@/hooks/useSessionAwareDeleteChat";
import { toConvexId } from "@/lib/utils/idValidation";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MobileChatListItem } from "@/components/MobileChatListItem";

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  chats: Chat[];
  currentChatId: Id<"chats"> | string | null;
  onSelectChat: (chatId: Id<"chats"> | string | null) => void;
  onNewChat: () => void;
  onRequestDeleteChat?: (chatId: Id<"chats"> | string) => void;
  isCreatingChat?: boolean;
}

export function MobileSidebar({
  isOpen,
  onClose,
  chats,
  currentChatId,
  onSelectChat,
  onNewChat,
  onRequestDeleteChat,
  isCreatingChat = false,
}: Readonly<MobileSidebarProps>) {
  const deleteChat = useSessionAwareDeleteChat();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteTargetIsCurrent, setDeleteTargetIsCurrent] = useState(false);

  const handleNewChat = useCallback(() => {
    logger.info("New Chat button clicked in MobileSidebar");
    onNewChat();
    onClose();
  }, [onNewChat, onClose]);

  const handleSelectChat = useCallback(
    (chatId: Id<"chats"> | string) => {
      onSelectChat(chatId);
      onClose();
    },
    [onSelectChat, onClose],
  );

  const handleOverlayKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  const handleSelectChatFromBtn = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const id = e.currentTarget.dataset.chatId;
      if (!id) return;
      handleSelectChat(id);
    },
    [handleSelectChat],
  );

  const handleDeleteChatFromBtn = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const id = e.currentTarget.dataset.chatId;
      const isCurrent = e.currentTarget.dataset.current === "1";
      if (!id) return;
      setDeleteError(null);
      setDeleteTargetId(id);
      setDeleteTargetIsCurrent(isCurrent);
    },
    [],
  );

  const confirmDeleteChat = useCallback(async () => {
    if (!deleteTargetId) return;
    const chatId = deleteTargetId;
    const isCurrent = deleteTargetIsCurrent;

    try {
      const resolvedChatId = toConvexId<"chats">(chatId);
      if (!resolvedChatId) {
        throw new Error(`Invalid chat ID for deletion: ${chatId}`);
      }
      if (onRequestDeleteChat) {
        onRequestDeleteChat(resolvedChatId);
      } else {
        await deleteChat(resolvedChatId);
      }

      setDeleteTargetId(null);
      setDeleteError(null);
      if (isCurrent) {
        onSelectChat(null);
      }
    } catch (err) {
      logger.error("Chat deletion failed:", err);
      setDeleteError("Failed to delete chat. Please try again.");
    }
  }, [
    deleteTargetId,
    deleteTargetIsCurrent,
    onRequestDeleteChat,
    deleteChat,
    onSelectChat,
  ]);

  const cancelDeleteChat = useCallback(() => {
    setDeleteTargetId(null);
    setDeleteError(null);
  }, []);

  return (
    <>
      <ConfirmDialog
        open={deleteTargetId !== null}
        onConfirm={() => void confirmDeleteChat()}
        onCancel={cancelDeleteChat}
        title="Delete chat"
        message="Delete this chat? This cannot be undone."
      />
      <Transition show={isOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50 lg:hidden mobile-sidebar-dialog"
          onClose={onClose}
          initialFocus={closeButtonRef}
        >
          <TransitionChild
            as={Fragment}
            enter="transition-opacity ease-linear duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <button
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={onClose}
              onKeyDown={handleOverlayKeyDown}
              type="button"
              aria-label="Close sidebar overlay"
            />
          </TransitionChild>

          <div className="fixed inset-0 flex pr-14 overflow-x-hidden">
            <TransitionChild
              as={Fragment}
              enter="transition ease-out duration-250 transform"
              enterFrom="-translate-x-full"
              enterTo="translate-x-0"
              leave="transition ease-in duration-200 transform"
              leaveFrom="translate-x-0"
              leaveTo="-translate-x-full"
            >
              <DialogPanel
                tabIndex={-1}
                className="relative flex w-full max-w-xs flex-1 min-w-0"
              >
                <TransitionChild
                  as={Fragment}
                  enter="ease-out duration-250"
                  enterFrom="opacity-0"
                  enterTo="opacity-100"
                  leave="ease-in duration-200"
                  leaveFrom="opacity-100"
                  leaveTo="opacity-0"
                >
                  <div className="absolute left-full top-0 flex w-14 justify-center pt-4">
                    <button
                      type="button"
                      className="p-1.5 rounded-full ring-1 ring-white/20 hover:ring-white/40 transition-all"
                      onClick={onClose}
                      ref={closeButtonRef}
                    >
                      <span className="sr-only">Close sidebar</span>
                      <svg
                        className="h-5 w-5 text-white/80"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="1.8"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </TransitionChild>

                <div className="flex grow min-w-0 flex-col overflow-y-auto overflow-x-hidden bg-white dark:bg-gray-900 border-r border-gray-200/40 dark:border-gray-700/40">
                  <div className="flex h-[3.75rem] sm:h-16 shrink-0 items-center px-3 sm:px-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-2.5 sm:gap-4">
                      <button
                        type="button"
                        onClick={onClose}
                        className="flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 ring-1 ring-gray-200/60 dark:ring-gray-700/60 hover:ring-emerald-400/50 dark:hover:ring-emerald-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        aria-label="Close sidebar"
                      >
                        <svg
                          className="w-[18px] h-[18px] text-gray-500 dark:text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                      </button>
                      <div className="w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-md flex items-center justify-center">
                        <svg
                          className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white"
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
                      </div>
                      <span className="text-lg font-semibold !normal-case tracking-normal text-gray-900 dark:text-white">
                        Researchly
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col px-4 pt-4 pb-6 gap-4">
                    <button
                      type="button"
                      onClick={handleNewChat}
                      disabled={isCreatingChat}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-ui"
                    >
                      {isCreatingChat ? <SpinnerIcon /> : <PlusIcon />}
                      {isCreatingChat ? "Creating..." : "New Chat"}
                    </button>

                    <div className="flex-1 flex flex-col gap-1.5">
                      <span className="block text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1 font-ui">
                        Recent
                      </span>

                      {deleteError && (
                        <p className="px-2 py-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md font-ui">
                          {deleteError}
                        </p>
                      )}

                      {chats.length === 0 ? (
                        <p className="px-1 py-3 text-sm text-gray-400 dark:text-gray-500 font-ui">
                          No chats yet
                        </p>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {chats.map((chat) => (
                            <MobileChatListItem
                              key={chat._id}
                              chat={chat}
                              isActive={currentChatId === chat._id}
                              onSelect={handleSelectChatFromBtn}
                              onDelete={handleDeleteChatFromBtn}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>
    </>
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
