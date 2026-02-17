import { useEffect, useCallback } from "react";

interface UseKeyboardShortcutsProps {
  isMobile: boolean;
  sidebarOpen: boolean;
  onToggleSidebar?: () => void;
  onNewChat: () => Promise<void>;
  onShare: () => void;
}

/**
 * Hook to manage keyboard shortcuts and interaction handlers.
 * Returns handlers for sidebar toggle, new chat, and session management.
 *
 * Swipe-to-open/close sidebar was intentionally removed.
 * The hamburger button and Cmd/Ctrl+/ keyboard shortcut are the sole controls
 * for the sidebar. Swipe gestures conflicted with horizontal scrolling in
 * tables and code blocks, causing the sidebar to open inadvertently.
 */
export function useKeyboardShortcuts({
  isMobile,
  sidebarOpen,
  onToggleSidebar,
  onNewChat,
  onShare,
}: UseKeyboardShortcutsProps) {
  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Cmd/Ctrl + K - New chat
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        void onNewChat();
        return;
      }

      // Cmd/Ctrl + / - Toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        onToggleSidebar?.();
        return;
      }

      // Cmd/Ctrl + S - Share
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        onShare();
        return;
      }

      // Escape - Close sidebar on mobile
      if (e.code === "Escape" && isMobile && sidebarOpen) {
        e.preventDefault();
        onToggleSidebar?.();
      }
    },
    [isMobile, sidebarOpen, onToggleSidebar, onNewChat, onShare],
  );

  useEffect(() => {
    globalThis.window.addEventListener("keydown", handleKeyDown);
    return () =>
      globalThis.window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Handler for sidebar toggle button
  const handleToggleSidebar = useCallback(() => {
    onToggleSidebar?.();
  }, [onToggleSidebar]);

  // Handler for new chat button
  const handleNewChatButton = useCallback(async () => {
    await onNewChat();
  }, [onNewChat]);

  // Handler for starting a new chat session (clearing state)
  const startNewChatSession = useCallback(async () => {
    await onNewChat();
  }, [onNewChat]);

  return {
    handleToggleSidebar,
    handleNewChatButton,
    startNewChatSession,
  };
}
