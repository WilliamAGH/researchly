import React from "react";
import { safeParseHttpUrl } from "../../../convex/lib/urlHttp";

const FALLBACK_HTTP_URL_REGEX = /https?:\/\/[^\s<>"']+/g;
const TRAILING_SENTENCE_PUNCTUATION_REGEX = /[.,!?;:]+$/;

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

// LLM bug traceability: fixes trailing punctuation link breakage reported by chatgpt-codex-connector and CodeRabbit.
function splitTrailingPunctuation(rawUrl: string): {
  urlCandidate: string;
  trailingPunctuation: string;
} {
  let urlCandidate = rawUrl;
  let trailingPunctuation = "";

  const sentencePunctuation =
    urlCandidate.match(TRAILING_SENTENCE_PUNCTUATION_REGEX)?.[0] ?? "";
  if (sentencePunctuation) {
    urlCandidate = urlCandidate.slice(0, -sentencePunctuation.length);
    trailingPunctuation = sentencePunctuation;
  }

  const bracketPairs: Array<[open: string, close: string]> = [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ];

  let didTrimBracket = true;
  while (didTrimBracket && urlCandidate.length > 0) {
    didTrimBracket = false;
    for (const [open, close] of bracketPairs) {
      if (!urlCandidate.endsWith(close)) continue;
      const openCount = countMatches(
        urlCandidate,
        new RegExp(`\\${open}`, "g"),
      );
      const closeCount = countMatches(
        urlCandidate,
        new RegExp(`\\${close}`, "g"),
      );
      if (closeCount > openCount) {
        urlCandidate = urlCandidate.slice(0, -1);
        trailingPunctuation = `${close}${trailingPunctuation}`;
        didTrimBracket = true;
      }
      break;
    }
  }

  return { urlCandidate, trailingPunctuation };
}

function renderFallbackContentWithLinks(content: string): React.ReactNode[] {
  if (!content) return [""];

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;
  FALLBACK_HTTP_URL_REGEX.lastIndex = 0;

  while ((match = FALLBACK_HTTP_URL_REGEX.exec(content)) !== null) {
    const rawUrl = match[0];
    const start = match.index;
    const { urlCandidate, trailingPunctuation } =
      splitTrailingPunctuation(rawUrl);

    if (start > lastIndex) {
      nodes.push(content.slice(lastIndex, start));
    }

    const normalizedUrl = safeParseHttpUrl(urlCandidate)?.toString();
    if (normalizedUrl) {
      nodes.push(
        <a
          key={`fallback-link-${start}`}
          href={normalizedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-blue-400/70 text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200 break-all"
        >
          {normalizedUrl}
        </a>,
      );
      if (trailingPunctuation) {
        nodes.push(trailingPunctuation);
      }
    } else {
      nodes.push(rawUrl);
    }

    lastIndex = start + rawUrl.length;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  return nodes;
}

export function MessageFallbackContent({ content }: { content: string }) {
  return (
    <div className="whitespace-pre-wrap text-gray-900 dark:text-gray-100 leading-relaxed break-words">
      {renderFallbackContentWithLinks(content)}
    </div>
  );
}
