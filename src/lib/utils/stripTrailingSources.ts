/**
 * Client-side trailing source/reference section stripper.
 *
 * Removes "Sources:", "References:", numbered reference lists, and bare URL
 * blocks that LLMs append at the end of responses. These duplicate the app's
 * styled citation pills and source cards rendered by MessageSources.
 *
 * Mirrors the server-side patterns in convex/agents/answerParser.ts but runs
 * in the browser so trailing citations are hidden during streaming — before
 * the server's stripped `persisted` event arrives.
 */

/** Matches `## Sources` / `### References` heading followed by any content */
const MARKDOWN_HEADING_SOURCES =
  /\n+#{1,3}\s*(?:Sources?|References?|Citations?):?\s*\n[\s\S]*$/i;

/** Matches `**Sources:**` / `**References:**` bold header followed by content */
const BOLD_HEADER_SOURCES =
  /\n+\*\*(?:Sources?|References?|Citations?)\*\*:?\s*\n[\s\S]*$/i;

/** Matches plain `Sources:` header followed by bullet/numbered/bare-URL items */
const PLAIN_HEADER_SOURCES =
  /\n+(?:Sources?|References?|Citations?):?\s*\n(?:\s*[-•*\d[\]]+[.):]*\s+.+(?:\n|$))+$/i;

/**
 * Numbered bracket references without a header (2+ consecutive entries).
 * e.g. `[1] https://example.com` or `[1]: https://example.com`
 */
const NUMBERED_BRACKET_REFS = /\n+(?:\[\d+\]:?\s+https?:\/\/\S+(?:\n|$)){2,}$/;

/** Trailing bare-URL list (2+ URLs on consecutive lines after a blank line) */
const TRAILING_BARE_URLS = /\n\n(?:[-•*]?\s*https?:\/\/\S+(?:\n|$)){2,}$/;

const TRAILING_SOURCES_PATTERNS = [
  MARKDOWN_HEADING_SOURCES,
  BOLD_HEADER_SOURCES,
  PLAIN_HEADER_SOURCES,
  NUMBERED_BRACKET_REFS,
  TRAILING_BARE_URLS,
];

/**
 * Strip trailing "Sources:" / "References:" sections and reference lists
 * that the LLM appends at the end of its response.
 */
export function stripTrailingSources(text: string): string {
  let result = text;
  for (const pattern of TRAILING_SOURCES_PATTERNS) {
    result = result.replace(pattern, "");
  }
  return result;
}
