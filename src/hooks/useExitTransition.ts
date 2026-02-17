/**
 * useExitTransition — delays React unmount so CSS exit animations can play.
 *
 * Returns `mounted` (keep in DOM?) and `exiting` (apply exit CSS classes?).
 * When `show` flips false → `exiting` becomes true for `durationMs`,
 * then `mounted` becomes false and the caller can safely unmount children.
 */

import { useEffect, useState, useRef } from "react";

const DEFAULT_EXIT_DURATION_MS = 300;

export function useExitTransition(
  show: boolean,
  durationMs = DEFAULT_EXIT_DURATION_MS,
): { mounted: boolean; exiting: boolean } {
  const [mounted, setMounted] = useState(show);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (show) {
      // Entering: mount immediately, cancel any pending exit
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setMounted(true);
      setExiting(false);
    } else if (mounted && !exiting) {
      // Exiting: start exit animation, unmount after duration
      setExiting(true);
      timerRef.current = setTimeout(() => {
        setMounted(false);
        setExiting(false);
        timerRef.current = null;
      }, durationMs);
    }
  }, [show, durationMs, mounted, exiting]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { mounted, exiting };
}
