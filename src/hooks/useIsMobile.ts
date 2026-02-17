import { useState, useEffect } from "react";

/**
 * Hook to detect mobile device viewport using matchMedia.
 * Only fires when the breakpoint is actually crossed, avoiding
 * re-renders on every resize pixel.
 * @param breakpoint - Width threshold for mobile detection (default: 768px)
 * @returns boolean indicating if viewport is mobile size
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (globalThis.window === undefined) return false;
    return globalThis.window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
      .matches;
  });

  useEffect(() => {
    if (globalThis.window === undefined) return;
    const mql = globalThis.window.matchMedia(
      `(max-width: ${breakpoint - 1}px)`,
    );
    // Sync on mount in case SSR initial value diverged
    setIsMobile(mql.matches);

    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [breakpoint]);

  return isMobile;
}
