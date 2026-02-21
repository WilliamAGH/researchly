import { DialogPanel, DialogTitle } from "@headlessui/react";
import type { PrivacyOption } from "@/components/share/shareModalTypes";

type ShareModalContentProps = {
  selectedPrivacy: PrivacyOption;
  displayUrl: string;
  busy: boolean;
  urlCopied: boolean;
  markdownCopied: boolean;
  markdownContent: string;
  showMarkdown: boolean;
  closeBtnRef: React.RefObject<HTMLButtonElement>;
  onSelectPrivacy: (privacy: PrivacyOption) => void;
  onGenerateOrCopy: () => void;
  onCopyMarkdown: () => void;
  onClose: () => void;
};

function getPlaceholder(privacy: PrivacyOption): string {
  if (privacy === "llm") return "Generate LLM-friendly .txt link";
  if (privacy === "shared") return "Generate shared link";
  return "Generate public link";
}

function getActionAriaLabel(displayUrl: string, busy: boolean): string {
  if (displayUrl) return "Copy URL to clipboard";
  if (busy) return "Generating…";
  return "Generate URL";
}

function ActionButtonContent({
  displayUrl,
  urlCopied,
  busy,
}: Readonly<{
  displayUrl: string;
  urlCopied: boolean;
  busy: boolean;
}>) {
  if (displayUrl) {
    return <>{urlCopied ? "Copied!" : "Copy"}</>;
  }
  if (busy) {
    return (
      <span className="inline-flex items-center gap-2">
        <svg
          className="w-4 h-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            strokeWidth="4"
            className="opacity-25"
          />
          <path d="M4 12a8 8 0 018-8" strokeWidth="4" className="opacity-75" />
        </svg>
        Generating…
      </span>
    );
  }
  return <>Generate URL</>;
}

export function ShareModalContent({
  selectedPrivacy,
  displayUrl,
  busy,
  urlCopied,
  markdownCopied,
  markdownContent,
  showMarkdown,
  closeBtnRef,
  onSelectPrivacy,
  onGenerateOrCopy,
  onCopyMarkdown,
  onClose,
}: Readonly<ShareModalContentProps>) {
  const showLinkSection =
    selectedPrivacy === "shared" ||
    selectedPrivacy === "public" ||
    selectedPrivacy === "llm";

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
      />

      <div className="fixed inset-0 flex items-center justify-center">
        <DialogPanel className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm sm:max-w-md w-full mx-4 p-5 sm:p-6 border border-gray-200 dark:border-gray-700 font-serif">
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          <div className="text-center mb-6">
            <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
                />
              </svg>
            </div>
            <DialogTitle
              id="share-modal-title"
              className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2 dark:uppercase dark:tracking-wide"
            >
              Share this conversation
            </DialogTitle>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              {selectedPrivacy === "private" &&
                "Only you can access this chat."}
              {selectedPrivacy === "shared" &&
                "Anyone with the link can view (not indexed)."}
              {selectedPrivacy === "public" &&
                "Publicly viewable and may appear in search results."}
              {selectedPrivacy === "llm" &&
                "LLM-friendly link; same visibility as Shared (not indexed)."}
            </p>
          </div>

          <div className="space-y-4">
            <PrivacyFieldset
              selectedPrivacy={selectedPrivacy}
              onSelectPrivacy={onSelectPrivacy}
            />

            {showLinkSection && (
              <div className="space-y-3">
                <label
                  htmlFor="share-url-input"
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Link
                </label>
                <div className="flex gap-2">
                  <input
                    id="share-url-input"
                    name="shareUrl"
                    type="text"
                    value={displayUrl}
                    placeholder={getPlaceholder(selectedPrivacy)}
                    readOnly
                    className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={onGenerateOrCopy}
                    className="px-3 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-60"
                    aria-label={getActionAriaLabel(displayUrl, busy)}
                    disabled={busy}
                  >
                    <ActionButtonContent
                      displayUrl={displayUrl}
                      urlCopied={urlCopied}
                      busy={busy}
                    />
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {showMarkdown && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Export as Markdown
                  </div>
                  <div className="flex gap-2">
                    <input
                      id="share-markdown-output"
                      name="shareMarkdownOutput"
                      type="text"
                      value={markdownContent}
                      readOnly
                      className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      onClick={onCopyMarkdown}
                      className="px-3 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-60"
                    >
                      {markdownCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </DialogPanel>
      </div>
    </>
  );
}

const PRIVACY_OPTIONS: ReadonlyArray<{
  value: PrivacyOption;
  title: string;
  description: string;
}> = [
  {
    value: "private",
    title: "Private",
    description: "Only you can see this chat.",
  },
  {
    value: "shared",
    title: "Shared",
    description: "Anyone with the link can view. Not indexed.",
  },
  {
    value: "public",
    title: "Public",
    description: "Anyone can view and it may appear in search results.",
  },
  {
    value: "llm",
    title: "LLM Link (Markdown .txt)",
    description: "Same visibility as Shared, formatted for LLMs; not indexed.",
  },
];

function PrivacyFieldset({
  selectedPrivacy,
  onSelectPrivacy,
}: Readonly<{
  selectedPrivacy: PrivacyOption;
  onSelectPrivacy: (p: PrivacyOption) => void;
}>) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Privacy Level
      </legend>
      <div className="mt-1 flex flex-col space-y-2">
        {PRIVACY_OPTIONS.map(({ value, title, description }) => (
          <label
            key={value}
            className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
            aria-label={title}
          >
            <input
              type="radio"
              name="privacy"
              value={value}
              checked={selectedPrivacy === value}
              onChange={() => onSelectPrivacy(value)}
              className="w-4 h-4 text-emerald-600 bg-gray-100 border-gray-300 focus:ring-emerald-500"
            />
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                {title}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {description}
              </div>
            </div>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
