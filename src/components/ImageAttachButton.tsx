import React from "react";

interface ImageAttachButtonProps {
  disabled?: boolean;
  onClick: () => void;
}

/** Paperclip-style button to open the image file picker. */
export const ImageAttachButton = React.memo(function ImageAttachButton({
  disabled,
  onClick,
}: ImageAttachButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Attach image"
      title="Attach image"
      disabled={disabled}
      className="absolute left-2 top-1/2 -translate-y-1/2 p-2 text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors disabled:opacity-60"
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    </button>
  );
});
