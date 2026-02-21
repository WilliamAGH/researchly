/**
 * Theme mode selector: Auto / Light / Dark
 * Rendered as a segmented control inside the control panel dropdown.
 */

import React from "react";
import type { ThemeMode } from "@/components/ThemeProvider";

interface ThemeSelectorProps {
  readonly themeMode: ThemeMode;
  readonly onChange: (mode: ThemeMode) => void;
}

const MODES: ReadonlyArray<{
  value: ThemeMode;
  label: string;
  Icon: React.FC;
}> = [
  { value: "auto", label: "Auto", Icon: MonitorIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
];

export const ThemeSelector = React.memo(function ThemeSelector({
  themeMode,
  onChange,
}: ThemeSelectorProps) {
  return (
    <div className="px-4 py-3">
      <span className="block text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2 font-ui">
        Appearance
      </span>
      <fieldset
        className="flex rounded-lg bg-gray-100 dark:bg-gray-800/80 p-0.5 gap-0.5"
        aria-label="Theme mode"
      >
        <legend className="sr-only">Theme mode</legend>
        {MODES.map(({ value, label, Icon }) => {
          const selected = themeMode === value;
          return (
            <label
              key={value}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all duration-150 font-ui cursor-pointer ${
                selected
                  ? "bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <input
                type="radio"
                name="theme-mode"
                value={value}
                checked={selected}
                onChange={() => onChange(value)}
                className="sr-only"
              />
              <Icon />
              {label}
            </label>
          );
        })}
      </fieldset>
    </div>
  );
});

function MonitorIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5.636 5.636 4.222 4.222M19.778 19.778l-1.414-1.414M5.636 18.364 4.222 19.778M19.778 4.222l-1.414 1.414" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" />
    </svg>
  );
}
