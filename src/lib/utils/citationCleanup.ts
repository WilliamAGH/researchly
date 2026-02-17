/**
 * Client-side trailing citation cleanup.
 * Safety net for LLM-appended source lists that escape server-side stripping.
 * Runs once after streaming completes — never during active streaming.
 */

/** Trailing citation section patterns (markdown content, not HTML) */
const TRAILING_PATTERNS = [
  /** `## Sources` / `### References` heading sections */
  /\n#{1,3}\s*(?:Sources?|References?):?\s*\n[\s\S]*$/i,
  /** `**Sources:**` bold header sections (colon may be inside or outside bold) */
  /\n\*\*(?:Sources?|References?):?\*\*:?\s*\n[\s\S]*$/i,
  /** `Sources:` plain header with bullet/numbered list */
  /\n(?:Sources?|References?):?\s*\n(?:\s*[-•*\d]+\.?\s+.+(?:\n|$))+$/i,
  /** Numbered reference list: `[1] https://...` or `[1]: https://...` */
  /(?:\n\s*\[\d+\]:?\s+https?:\/\/\S+)+\s*$/i,
  /** Bare URL list at end (3+ consecutive lines of URLs) */
  /(?:\n\s*[-•*]?\s*https?:\/\/\S+){3,}\s*$/i,
];

/** Extract all URLs from a trailing citation block */
const URL_EXTRACT = /https?:\/\/[^\s)\]>,]+/g;

/**
 * Remove trailing citation sections that duplicate already-inline-cited URLs.
 * Unique (not-yet-cited) URLs are restyled as inline citation pill markdown.
 *
 * @param content - Raw markdown content (post-stream)
 * @param inlineCitedUrls - URLs already rendered as inline citation pills
 * @returns Cleaned markdown content
 */
export function cleanTrailingCitations(
  content: string,
  inlineCitedUrls: Set<string>,
): string {
  // Only inspect the tail to avoid false positives in body content
  const tail = content.slice(-500);
  let matchedPattern: RegExp | null = null;
  let matchResult: RegExpMatchArray | null = null;

  for (const pattern of TRAILING_PATTERNS) {
    const m = tail.match(pattern);
    if (m && (!matchResult || m[0].length > matchResult[0].length)) {
      matchedPattern = pattern;
      matchResult = m;
    }
  }

  if (!matchedPattern || !matchResult) return content;

  // Compute match position from the tail offset — never re-run the regex on the
  // full string, which could match an earlier legitimate heading and over-strip.
  const tailStart = Math.max(0, content.length - 500);
  const matchIndex = tailStart + (matchResult.index ?? 0);

  const trailingBlock = matchResult[0];
  const extractedUrls = (trailingBlock.match(URL_EXTRACT) ?? []).map((url) =>
    url.replace(/\.+$/, ""),
  );

  // Separate unique (not inline-cited) URLs from duplicates
  const uniqueUrls = extractedUrls.filter((url) => !inlineCitedUrls.has(url));

  // Strip the trailing block
  const cleaned = content.slice(0, matchIndex).trimEnd();

  // Re-add unique URLs as inline citation pill markdown (domain-only display)
  if (uniqueUrls.length === 0) return cleaned;

  const pills = uniqueUrls
    .map((url) => {
      const domain = safeExtractDomain(url);
      return `[${domain}](${url})`;
    })
    .join(" ");

  return `${cleaned}\n\n${pills}`;
}

/** Extract display domain from URL, falling back to the raw URL */
function safeExtractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
