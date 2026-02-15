import { useCallback, useEffect } from "react";

type AutoResizeOptions = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  maxHeight: number;
  /** Serialized key that triggers re-measurement (e.g. `JSON.stringify([a, b])`) */
  depsKey: string;
};

export function useAutoResizeTextarea({
  textareaRef,
  maxHeight,
  depsKey,
}: AutoResizeOptions) {
  const adjustTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    ta.style.height = "auto";

    const style = window.getComputedStyle(ta);
    const minHeight = parseFloat(style.minHeight) || 0;
    const scrollHeight = ta.scrollHeight;
    const target = Math.min(Math.max(scrollHeight, minHeight), maxHeight);

    ta.style.height = `${target}px`;
  }, [maxHeight, textareaRef]);

  useEffect(() => {
    adjustTextarea();
  }, [adjustTextarea, depsKey]);

  useEffect(() => {
    const handler: EventListener = () =>
      requestAnimationFrame(() => adjustTextarea());
    window.addEventListener("resize", handler);
    window.addEventListener("orientationchange", handler);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("orientationchange", handler);
    };
  }, [adjustTextarea]);
}
