/**
 * Unified control panel dropdown.
 * Houses theme selector, font toggle, and account controls in one menu.
 * Uses a portal (fixed positioning) to escape ancestor overflow clipping.
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@/components/ThemeProvider";
import { ControlPanelTrigger } from "@/components/ControlPanel/ControlPanelTrigger";
import { ThemeSelector } from "@/components/ControlPanel/ThemeSelector";
import { FontStyleToggle } from "@/components/ControlPanel/FontStyleToggle";
import { AccountSection } from "@/components/ControlPanel/AccountSection";

interface ControlPanelProps {
  readonly onSignIn: () => void;
  readonly onSignUp: () => void;
}

export function ControlPanel({ onSignIn, onSignUp }: ControlPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDialogElement>(null);
  const { themeMode, setThemeMode, fontStyle, setFontStyle } = useTheme();
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const close = useCallback(() => setIsOpen(false), []);

  const handleSignIn = useCallback(() => {
    close();
    onSignIn();
  }, [close, onSignIn]);

  const handleSignUp = useCallback(() => {
    close();
    onSignUp();
  }, [close, onSignUp]);

  // Position the portal panel below the trigger button
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPanelPos({
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    });
  }, [isOpen]);

  // Close on click outside (check both trigger and panel refs)
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return;
      const inTrigger = triggerRef.current?.contains(e.target);
      const inPanel = panelRef.current?.contains(e.target);
      if (!inTrigger && !inPanel) close();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen, close]);

  return (
    <div ref={triggerRef}>
      <ControlPanelTrigger onClick={toggle} isOpen={isOpen} />

      {isOpen &&
        createPortal(
          <dialog
            ref={panelRef}
            open
            aria-label="Settings"
            style={{ top: panelPos.top, right: panelPos.right, left: "auto" }}
            className="fixed w-64 m-0 p-0 rounded-xl bg-white dark:bg-gray-900 border border-gray-200/70 dark:border-gray-700/70 shadow-xl shadow-gray-900/8 dark:shadow-black/30 animate-panel-in z-[100]"
          >
            <ThemeSelector themeMode={themeMode} onChange={setThemeMode} />
            <div className="mx-4 h-px bg-gray-100 dark:bg-gray-800" />
            <FontStyleToggle fontStyle={fontStyle} onChange={setFontStyle} />
            <div className="mx-4 h-px bg-gray-100 dark:bg-gray-800" />
            <AccountSection
              onSignIn={handleSignIn}
              onSignUp={handleSignUp}
              onClose={close}
            />
          </dialog>,
          document.body,
        )}
    </div>
  );
}
