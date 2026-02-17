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
  // Ensure Headless UI Dialog has a stable initial focusable element on open
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

      // Only dismiss dialog and navigate after successful deletion
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
            enter="transition-opacity ease-linear duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <button
              className="fixed inset-0 bg-gray-900/80"
              onClick={onClose}
              onKeyDown={handleOverlayKeyDown}
              type="button"
              aria-label="Close sidebar overlay"
            />
          </TransitionChild>

          <div className="fixed inset-0 flex pr-16 overflow-x-hidden">
            <TransitionChild
              as={Fragment}
              enter="transition ease-in-out duration-300 transform"
              enterFrom="-translate-x-full"
              enterTo="translate-x-0"
              leave="transition ease-in-out duration-300 transform"
              leaveFrom="translate-x-0"
              leaveTo="-translate-x-full"
            >
              <DialogPanel
                tabIndex={-1}
                className="relative flex w-full max-w-xs flex-1 min-w-0"
              >
                <TransitionChild
                  as={Fragment}
                  enter="ease-in-out duration-300"
                  enterFrom="opacity-0"
                  enterTo="opacity-100"
                  leave="ease-in-out duration-300"
                  leaveFrom="opacity-100"
                  leaveTo="opacity-0"
                >
                  <div className="absolute left-full top-0 flex w-16 justify-center pt-5">
                    <button
                      type="button"
                      className="-m-2.5 p-2.5"
                      onClick={onClose}
                      ref={closeButtonRef}
                    >
                      <span className="sr-only">Close sidebar</span>
                      <svg
                        className="h-6 w-6 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="1.5"
                        stroke="currentColor"
                        aria-label="Close sidebar"
                      >
                        <title>Close sidebar</title>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </TransitionChild>

                <div className="flex grow min-w-0 flex-col gap-y-5 overflow-y-auto overflow-x-hidden bg-white dark:bg-gray-900 px-6 pb-2">
                  <div className="flex h-16 shrink-0 items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                        <svg
                          className="w-5 h-5 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <title>Search</title>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                      </div>
                      <span className="text-lg font-semibold">Researchly</span>
                    </div>
                  </div>

                  <nav className="flex flex-1 flex-col">
                    <button
                      type="button"
                      onClick={handleNewChat}
                      disabled={isCreatingChat}
                      className="w-full px-4 py-3 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors flex items-center gap-2 mb-4 disabled:opacity-50 disabled:cursor-not-allowed"
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
                          aria-label="New chat"
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

                    <div className="space-y-1">
                      {deleteError && (
                        <p className="px-3 py-1 text-sm text-red-600 dark:text-red-400">
                          {deleteError}
                        </p>
                      )}
                      <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Recent Chats
                      </h3>
                      {chats.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-500">
                          No chats yet
                        </div>
                      ) : (
                        <div className="space-y-1">
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
                  </nav>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}
