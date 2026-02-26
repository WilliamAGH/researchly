import { useMemo } from "react";
import { getDomainFromUrl } from "@/lib/utils/favicon";
import { logger } from "@/lib/logger";
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
    const urlSet = new Set(cards.map((c) => c.url));
    const cardByNormalizedUrl = new Map<string, string>();

    for (const card of cards) {
      const normalizedKey = toNormalizedUrlKey(card.url);
      if (!normalizedKey || cardByNormalizedUrl.has(normalizedKey)) {
        continue;
      }
      cardByNormalizedUrl.set(normalizedKey, card.url);
    }

    // Replace [domain.com] or [full URL] with custom markers that survive markdown processing
    // Updated regex to capture potential following (url) part of a markdown link
    // This handles cases where LLM outputs [domain.com](url) - we want to consume the whole thing
    const citationRegex = /\[([^\]]+)\](?:\(([^)]+)\))?/g;

    return content.replace(citationRegex, (match, citedText, existingUrl) => {
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
            domain = new URL(citedText).hostname.replace("www.", "");
            // Try to find exact URL match first
            if (urlSet.has(citedText)) {
              url = citedText;
            } else {
              // Fallback to domain matching
              url = domainToUrlMap.get(domain);
            }
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

          const parsedCitation =
            citedText.startsWith("http://") || citedText.startsWith("https://")
              ? citedText
              : `https://${citedText}`;
          const normalizedCitationUrl = toNormalizedUrlKey(parsedCitation);

          if (normalizedCitationUrl) {
            url = cardByNormalizedUrl.get(normalizedCitationUrl);
          }

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
