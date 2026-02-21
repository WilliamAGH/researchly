/**
 * Theme & Font Style Provider
 * Manages application theme (auto/light/dark) and font style (serif/mono)
 * with localStorage persistence and optional Convex sync for authenticated users.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";
import { logger } from "@/lib/logger";

export type ThemeMode = "auto" | "light" | "dark";
export type FontStyle = "serif" | "mono";
type ResolvedTheme = "light" | "dark";

const THEME_KEY = "researchly_theme";
const FONT_KEY = "researchly_font_style";

function readStorage(key: string, allowed: readonly string[]): string | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "string" && allowed.includes(parsed)
      ? parsed
      : null;
  } catch (error) {
    logger.error("Failed to read from localStorage", { key, error });
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    logger.error("Failed to write to localStorage", { key, error });
  }
}

function getSystemTheme(): ResolvedTheme {
  if (typeof globalThis.matchMedia !== "function") return "light";
  return globalThis.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  resolvedTheme: ResolvedTheme;
  fontStyle: FontStyle;
  setFontStyle: (style: FontStyle) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [selectedMode, setSelectedMode] = useState<ThemeMode>(() => {
    if (globalThis.window === undefined) return "auto";
    const stored = readStorage(THEME_KEY, ["auto", "light", "dark"]);
    if (stored === "auto" || stored === "light" || stored === "dark")
      return stored;
    return "auto";
  });

  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);
  const resolvedTheme: ResolvedTheme =
    selectedMode === "auto" ? systemTheme : selectedMode;

  const [selectedFont, setSelectedFont] = useState<FontStyle>(() => {
    if (globalThis.window === undefined) return "serif";
    const stored = readStorage(FONT_KEY, ["serif", "mono"]);
    if (stored === "serif" || stored === "mono") return stored;
    return "serif";
  });

  const { isAuthenticated } = useConvexAuth();
  // @ts-ignore TS2589: Convex generic type instantiation is excessively deep
  const userPrefs = useQuery(api.preferences.getUserPreferences);
  const updatePrefs = useMutation(api.preferences.updateUserPreferences);

  // Sync theme from Convex prefs on first load (only if no local override)
  useEffect(() => {
    if (!userPrefs?.theme) return;
    const hasLocal = localStorage.getItem(THEME_KEY) !== null;
    if (hasLocal) return;
    if (userPrefs.theme === "system") {
      setSelectedMode("auto");
    } else if (userPrefs.theme === "light" || userPrefs.theme === "dark") {
      setSelectedMode(userPrefs.theme);
    }
  }, [userPrefs]);

  // Listen to OS color-scheme changes for auto mode
  useEffect(() => {
    const mql = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mql) return;
    const handler = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Apply theme class to <html>
  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(resolvedTheme);
  }, [resolvedTheme]);

  // Apply font class to <html>
  useEffect(() => {
    document.documentElement.classList.remove("font-mode-mono");
    if (selectedFont === "mono") {
      document.documentElement.classList.add("font-mode-mono");
    }
  }, [selectedFont]);

  const setThemeMode = useCallback(
    async (mode: ThemeMode) => {
      setSelectedMode(mode);
      writeStorage(THEME_KEY, mode);
      if (isAuthenticated) {
        const convexVal = mode === "auto" ? "system" : mode;
        try {
          await updatePrefs({ theme: convexVal });
        } catch (error) {
          logger.error("Failed to save theme preference:", error);
        }
      }
    },
    [isAuthenticated, updatePrefs],
  );

  const setFontStyle = useCallback((style: FontStyle) => {
    setSelectedFont(style);
    writeStorage(FONT_KEY, style);
  }, []);

  const contextValue = useMemo(
    () => ({
      themeMode: selectedMode,
      setThemeMode,
      resolvedTheme,
      fontStyle: selectedFont,
      setFontStyle,
    }),
    [selectedMode, setThemeMode, resolvedTheme, selectedFont, setFontStyle],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
