import { useMemo } from "react";
import { getDomainFromUrl } from "@/lib/utils/favicon";
import { logger } from "@/lib/logger";
import { stripTrailingSources } from "@/lib/utils/stripTrailingSources";
import {
  toNormalizedUrlKey,
  toWebSourceCards,
} from "@/lib/domain/webResearchSources";
import type { WebResearchSourceClient } from "@/lib/schemas/messageStream";

/**
 * Hook to process content and replace citations with interactive markers
 * Centralizes the logic for handling markdown links and citation patterns
 */
export function useCitationProcessor(
  content: string,
  webResearchSources: WebResearchSourceClient[] | undefined,
  domainToUrlMap: Map<string, string>,
): string {
  return useMemo(() => {
    const cards = toWebSourceCards(webResearchSources);
    const cardByNormalizedUrl = new Map(
      cards
        .map((card) => {
          const key = toNormalizedUrlKey(card.url);
          return key ? ([key, card] as const) : null;
        })
        .filter((entry): entry is readonly [string, (typeof cards)[number]] =>
          Boolean(entry),
        ),
    );

    // Strip trailing "Sources:" / "References:" sections that the LLM appends.
    // This runs client-side so trailing citations are hidden during streaming,
    // before the server's stripped `persisted` event arrives.
    const stripped = stripTrailingSources(content);

    // Replace [domain.com] or [full URL] with custom markers that survive markdown processing
    // Updated regex to capture potential following (url) part of a markdown link
    // This handles cases where LLM outputs [domain.com](url) - we want to consume the whole thing
    const citationRegex = /\[([^\]]+)\](?:\(([^)]+)\))?/g;

    return stripped.replace(citationRegex, (match, citedText, existingUrl) => {
      let domain = citedText;
      let url: string | undefined;

      // If matches a full markdown link [text](url), use the existing URL if valid
      if (existingUrl) {
        url = existingUrl;
        // Try to get a cleaner domain for display from the link text or the URL
        const extractedDomain = getDomainFromUrl(existingUrl);
        if (
          extractedDomain &&
          (citedText.includes(extractedDomain) ||
            citedText === existingUrl ||
            citedText.startsWith("http"))
        ) {
          domain = extractedDomain;
        } else {
          // If the link text is something else (e.g. "here"), keep it or use domain?
          // For citations, we usually want the domain.
          // If citedText looks like a URL or domain, normalize it.
          if (citedText.includes(".") && !citedText.includes(" ")) {
            domain = getDomainFromUrl(citedText) || citedText;
          }
        }
      } else {
        // Check if cited text is a full URL
        if (
          citedText.startsWith("http://") ||
          citedText.startsWith("https://")
        ) {
          // Extract domain from the full URL citation
          try {
            const normalizedCitation = toNormalizedUrlKey(citedText);
            const exactCard = normalizedCitation
              ? cardByNormalizedUrl.get(normalizedCitation)
              : undefined;

            domain = new URL(citedText).hostname.replace("www.", "");
            url = exactCard?.url ?? domainToUrlMap.get(domain);
          } catch (error) {
            logger.warn("Failed to parse cited URL for markdown citation", {
              citedText,
              error,
            });
            url = domainToUrlMap.get(citedText);
          }
        } else if (citedText.includes("/")) {
          // Handle cases like "github.com/user/repo"
          const domainPart = citedText.split("/")[0];
          domain = domainPart;

          const normalizedCitation = toNormalizedUrlKey(`https://${citedText}`);
          const exactCard = normalizedCitation
            ? cardByNormalizedUrl.get(normalizedCitation)
            : undefined;
          url = exactCard?.url ?? domainToUrlMap.get(domain);

          // If not found, try to find a URL that contains this path
          if (!url) {
            const matchingCard = cards.find((c) => {
              const cardDomain = getDomainFromUrl(c.url);
              return cardDomain === domain && c.url.includes(citedText);
            });
            url = matchingCard?.url;
          }
        } else {
          // Simple domain citation
          url = domainToUrlMap.get(citedText);
          domain = citedText;
        }
      }

      if (url) {
        // Output standard markdown link - anchor renderer handles citation styling
        return `[${domain}](${url})`;
      }

      // Citation pattern found but no matching URL - log for debugging
      logger.debug("Citation not resolved: no matching URL found in sources", {
        citedText,
        domain,
        mapSize: domainToUrlMap.size,
        cardCount: cards.length,
      });
      return match;
    });
  }, [content, domainToUrlMap, webResearchSources]);
}
