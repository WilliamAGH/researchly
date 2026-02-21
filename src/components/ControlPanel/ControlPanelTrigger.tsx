/**
 * Control panel trigger button
 * Shows user initial (authenticated) or settings icon (anonymous).
 */

import React from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

interface ControlPanelTriggerProps {
  readonly onClick: () => void;
  readonly isOpen: boolean;
}

export const ControlPanelTrigger = React.memo(function ControlPanelTrigger({
  onClick,
  isOpen,
}: ControlPanelTriggerProps) {
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(api.auth.loggedInUser);
  const initial = extractInitial(user?.email);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open control panel"
      aria-expanded={isOpen}
      className="relative flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 ring-1 ring-gray-200/60 dark:ring-gray-700/60 hover:ring-emerald-400/50 dark:hover:ring-emerald-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      {isAuthenticated && initial ? (
        <span className="flex items-center justify-center w-full h-full rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-sm font-semibold select-none font-ui">
          {initial}
        </span>
      ) : (
        <SettingsIcon />
      )}
    </button>
  );
});

function extractInitial(email: string | undefined | null): string | null {
  if (!email) return null;
  return email.charAt(0).toUpperCase();
}

function SettingsIcon() {
  return (
    <svg
      className="w-[18px] h-[18px] text-gray-500 dark:text-gray-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.08 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.08Z" />
    </svg>
  );
}
