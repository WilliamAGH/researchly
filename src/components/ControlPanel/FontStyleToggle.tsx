/**
 * Font style toggle (serif / mono)
 * Clean switch control rendered inside the control panel dropdown.
 */

import React from "react";
import type { FontStyle } from "@/components/ThemeProvider";

interface FontStyleToggleProps {
  readonly fontStyle: FontStyle;
  readonly onChange: (style: FontStyle) => void;
}

export const FontStyleToggle = React.memo(function FontStyleToggle({
  fontStyle,
  onChange,
}: FontStyleToggleProps) {
  const isMono = fontStyle === "mono";

  return (
    <div className="px-4 py-3">
      <button
        type="button"
        role="switch"
        aria-checked={isMono}
        onClick={() => onChange(isMono ? "serif" : "mono")}
        className="w-full flex items-center justify-between gap-3 group"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm text-gray-700 dark:text-gray-300 font-ui">
            Monospace font
          </span>
        </div>
        <span
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
            isMono ? "bg-emerald-500" : "bg-gray-200 dark:bg-gray-700"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
              isMono ? "translate-x-[18px]" : "translate-x-[3px]"
            }`}
          />
        </span>
      </button>
    </div>
  );
});
