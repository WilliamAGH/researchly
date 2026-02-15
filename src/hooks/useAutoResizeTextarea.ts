import { useCallback, useEffect } from "react";

type AutoResizeOptions = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  maxHeight: number;
  dependencies: Array<unknown>;
};

export function useAutoResizeTextarea({
  textareaRef,
  maxHeight,
  dependencies,
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

  // eslint-disable-next-line react-hooks/exhaustive-deps -- dependencies is a caller-provided array of values to trigger resize
  useEffect(() => {
    adjustTextarea();
  }, [adjustTextarea, ...dependencies]);

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
