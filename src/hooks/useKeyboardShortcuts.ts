import { useEffect, useCallback, useMemo, useRef } from "react";
import type { TouchEvent } from "react";

interface UseKeyboardShortcutsProps {
  isMobile: boolean;
  sidebarOpen: boolean;
  onToggleSidebar?: () => void;
  onNewChat: () => Promise<void>;
  onShare: () => void;
}

/**
 * Hook to manage keyboard shortcuts and interaction handlers
 * Returns handlers for swipe, sidebar toggle, new chat, and session management
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
      if (e.key === "Escape" && isMobile && sidebarOpen) {
        e.preventDefault();
        onToggleSidebar?.();
        return;
      }
    },
    [isMobile, sidebarOpen, onToggleSidebar, onNewChat, onShare],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Refs for swipe tracking — stable across re-renders and sidebarOpen changes
  const touchStartXRef = useRef(0);

  // Swipe handlers for mobile
  const swipeHandlers = useMemo(() => {
    if (!isMobile) return {};

    const handleTouchStart = (e: TouchEvent) => {
      touchStartXRef.current = e.touches[0].clientX;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const swipeDistance = e.changedTouches[0].clientX - touchStartXRef.current;

      // Swipe right to open sidebar
      if (swipeDistance > 100 && !sidebarOpen) {
        onToggleSidebar?.();
      }
      // Swipe left to close sidebar
      else if (swipeDistance < -100 && sidebarOpen) {
        onToggleSidebar?.();
      }
    };

    return {
      onTouchStart: handleTouchStart,
      onTouchEnd: handleTouchEnd,
    };
  }, [isMobile, sidebarOpen, onToggleSidebar]);

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
    swipeHandlers,
    handleToggleSidebar,
    handleNewChatButton,
    startNewChatSession,
  };
}
