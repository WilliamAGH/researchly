/**
 * Centralized SEO and Open Graph metadata constants.
 * Single source of truth consumed by useMetaTags (client) and
 * conceptually mirrored in the index.html template (server).
 */

export const SEO = {
  siteName: "Researchly",
  siteUrl: "https://researchly.bot",
  defaultTitle: "Researchly - AI-Powered Web Research",
  defaultDescription:
    "A powerful research tool: get direct answers to your questions with citations pulled straight from the web. Save hours with a bot that does the research for you.",
  ogImagePath: "/images/opengraph/researchly-og-card.png",
  ogImageWidth: 1200,
  ogImageHeight: 630,
  twitterCard: "summary_large_image" as const,
  twitterSite: "@williamcallahan",
  twitterCreator: "@williamcallahan",
  locale: "en_US",
  sharedDescription: "Shared Research Chat on Researchly",
  publicDescription: "AI-Powered Research Chat on Researchly",
  selectors: {
    ogTitle: 'meta[property="og:title"]',
    ogDescription: 'meta[property="og:description"]',
    twitterTitle: 'meta[name="twitter:title"]',
    twitterDescription: 'meta[name="twitter:description"]',
  },
} as const;
