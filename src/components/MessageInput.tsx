/** Message input textarea: auto-resize, Enter-to-send, mobile-optimized, image attachments */

import React, { useState, useRef, useCallback } from "react";
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea";
import { useMessageInputFocus } from "@/hooks/useMessageInputFocus";
import { useInputHistory } from "@/hooks/useInputHistory";
import { ImageAttachButton } from "@/components/ImageAttachButton";
import { ImageAttachmentPreview } from "@/components/ImageAttachmentPreview";
import { MessageInputActions } from "@/components/MessageInputActions";
import {
  ACCEPTED_IMAGE_TYPES,
  type ImageUploadState,
} from "@/hooks/useImageUpload";

const TEXTAREA_CLASSES = [
  "w-full pr-36 resize-none overflow-y-auto overflow-x-hidden",
  "text-base tracking-tight font-ui slashed-zero lining-nums tabular-nums break-words whitespace-pre-wrap",
  "rounded-2xl border border-gray-200/80 dark:border-gray-700/60 outline-none",
  "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500",
  "shadow-sm shadow-gray-200/50 dark:shadow-black/20",
  "focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/30 dark:focus:ring-emerald-400/30",
  "focus:shadow-md focus:shadow-emerald-500/5 dark:focus:shadow-emerald-400/5",
  "transition-all duration-200 message-input-textarea message-textarea",
].join(" ");

interface MessageInputProps {
  /** Callback when message is sent (with optional image storage IDs) */
  readonly onSendMessage: (
    message: string,
    imageStorageIds?: string[],
  ) => void | Promise<void>;
  /** Open share modal */
  readonly onShare?: () => void;
  /** Start a new chat */
  readonly onNewChat?: () => void;
  /** Disable input during generation */
  readonly disabled?: boolean;
  /** Placeholder text */
  readonly placeholder?: string;
  /** Optional draft-change callback (debounced in parent) */
  readonly onDraftChange?: (draft: string) => void;
  /** Optional history of previous user messages (oldest -> newest) */
  readonly history?: Array<string>;
  /** Image upload state from useImageUpload hook */
  readonly imageUpload?: ImageUploadState;
}

/** Message input with auto-resize and keyboard shortcuts */
export function MessageInput({
  onSendMessage,
  onShare,
  onNewChat,
  disabled = false,
  placeholder = "Ask me anything...",
  onDraftChange,
  history = [],
  imageUpload,
}: MessageInputProps) {
  const MAX_TEXTAREA_HEIGHT = 200;
  const [message, setMessage] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);

  const { historyIndex, handleHistoryNavigation, resetHistory } =
    useInputHistory({
      history,
      currentMessage: message,
      setMessage,
      onDraftChange,
      textareaRef,
    });

  const sendCurrentMessage = React.useCallback(async () => {
    const trimmed = message.trim();
    const hadImages = Boolean(imageUpload?.hasImages);
    if ((!trimmed && !hadImages) || disabled || imageUpload?.isUploading)
      return;
    setSendError(null);
    try {
      const storageIds = hadImages ? await imageUpload?.uploadAll() : undefined;
      const hasUploadedImages = Boolean(storageIds && storageIds.length > 0);

      // If this was an image-only submit and nothing was uploaded, do not clear input.
      if (!trimmed && hadImages && !hasUploadedImages) {
        setSendError("No images were uploaded");
        return;
      }

      const sendPromise = onSendMessage(
        trimmed,
        hasUploadedImages ? storageIds : undefined,
      );

      // Clear immediately so we don't block on streaming responses.
      setMessage("");
      onDraftChange?.("");
      resetHistory();
      if (!hadImages || hasUploadedImages) {
        imageUpload?.clear();
      }

      void Promise.resolve(sendPromise).catch((error) => {
        const msg =
          error instanceof Error ? error.message : "Failed to send message";
        setSendError(msg);
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to send message";
      setSendError(msg);
    }
  }, [
    message,
    disabled,
    onSendMessage,
    onDraftChange,
    resetHistory,
    imageUpload,
  ]);

  const handleSubmit = React.useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      void sendCurrentMessage();
    },
    [sendCurrentMessage],
  );

  const clearSendError = React.useCallback(() => {
    if (sendError) setSendError(null);
  }, [sendError]);

  /** Track IME composition state via ref for iOS Safari predictive text. */
  const handleCompositionStart = useCallback(() => {
    composingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false;
  }, []);

  /** Enter to send, Shift+Enter for newline, ArrowUp/Down for history. */
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        const isComposing =
          composingRef.current || (e.nativeEvent.isComposing ?? false);
        if (isComposing) {
          e.preventDefault();
          // Defer: if compositionend fires right after (iOS Safari Return),
          // the microtask will see composingRef === false and send.
          void Promise.resolve().then(() => {
            if (!composingRef.current) {
              void sendCurrentMessage();
            }
          });
          return;
        }
        e.preventDefault();
        void sendCurrentMessage();
        return;
      }

      // Guard other keys against active composition (CJK arrow keys, etc.)
      const isComposing =
        composingRef.current || (e.nativeEvent.isComposing ?? false);
      if (isComposing) return;

      // Ignore modifier combos for history navigation
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      // Delegate history navigation to the hook
      const ta = textareaRef.current;
      if (!ta) return;
      const atStart = ta.selectionStart === 0 && ta.selectionEnd === 0;
      const atEnd =
        ta.selectionStart === message.length &&
        ta.selectionEnd === message.length;

      if (handleHistoryNavigation(e.key, atStart, atEnd)) {
        e.preventDefault();
      }
    },
    [sendCurrentMessage, message, handleHistoryNavigation],
  );

  const handlePaste = React.useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!imageUpload) return;
      const imageFiles = Array.from(e.clipboardData.files).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (imageFiles.length === 0) return;

      // Only block default paste when at least one image is an accepted type.
      // Unsupported types (GIF, WebP, BMP) still produce rejection banners via
      // addImages, but text content in the clipboard won't be silently dropped.
      if (imageFiles.some((f) => ACCEPTED_IMAGE_TYPES.has(f.type))) {
        e.preventDefault();
      }
      imageUpload.addImages(imageFiles);
    },
    [imageUpload],
  );

  const handleFileSelect = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!imageUpload || !e.target.files) return;
      imageUpload.addImages(Array.from(e.target.files));
      e.target.value = "";
    },
    [imageUpload],
  );

  useAutoResizeTextarea({
    textareaRef,
    maxHeight: MAX_TEXTAREA_HEIGHT,
    depsKey: JSON.stringify([message, placeholder, disabled]),
  });
  useMessageInputFocus({ textareaRef, disabled });

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setMessage(val);
      clearSendError();
      if (historyIndex !== null) {
        resetHistory();
      }
      onDraftChange?.(val);
    },
    [historyIndex, onDraftChange, resetHistory, clearSendError],
  );

  const hasPendingContent = message.trim() || imageUpload?.hasImages;

  return (
    <div>
      {/* Inline send error */}
      {sendError && (
        <div className="px-3 sm:px-4 pb-1">
          <div className="text-sm text-red-600 dark:text-red-400">
            {sendError}
          </div>
        </div>
      )}
      {/* Image attachment preview strip */}
      {imageUpload &&
        (imageUpload.hasImages || imageUpload.rejections.length > 0) && (
          <ImageAttachmentPreview
            images={imageUpload.images}
            onRemove={imageUpload.removeImage}
            isUploading={imageUpload.isUploading}
            rejections={imageUpload.rejections}
            onDismissRejection={imageUpload.dismissRejection}
          />
        )}
      <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-1">
        <form onSubmit={handleSubmit}>
          <div className="relative flex items-center">
            <textarea
              id="message-input"
              name="message"
              ref={textareaRef}
              value={message}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              onPaste={handlePaste}
              enterKeyHint="send"
              placeholder={placeholder}
              aria-label="Message input"
              data-testid="message-input"
              disabled={disabled}
              rows={1}
              autoComplete="off"
              className={`${TEXTAREA_CLASSES} ${imageUpload ? "pl-11" : "pl-3 sm:pl-4"} ${message ? "pt-3 pb-3" : "pt-[0.625rem] pb-[0.875rem]"}`}
            />
            {/* Hidden file input for image picker */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              tabIndex={-1}
            />
            {/* Image attach button — left side of input */}
            {imageUpload && (
              <ImageAttachButton
                disabled={disabled}
                onClick={() => fileInputRef.current?.click()}
              />
            )}
            <MessageInputActions
              onNewChat={onNewChat}
              onShare={onShare}
              message={message}
              disabled={disabled}
            />
            <button
              type="submit"
              aria-label="Send message"
              title="Send message"
              disabled={!hasPendingContent || disabled}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 w-8 h-8 sm:w-7 sm:h-7 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg flex items-center justify-center transition-colors"
            >
              <svg
                className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
