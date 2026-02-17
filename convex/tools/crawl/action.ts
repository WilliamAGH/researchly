"use node";

/**
 * Convex action entry point for web scraping.
 * Validates the URL and delegates to the crawl orchestrator.
 */

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { scrapeWithCheerio } from "./orchestrator";
import { validateScrapeUrl } from "../../lib/url";

export const scrapeUrl = action({
  args: {
    url: v.string(),
  },
  returns: v.object({
    title: v.string(),
    content: v.string(),
    summary: v.optional(v.string()),
    needsJsRendering: v.optional(v.boolean()),
    error: v.optional(v.string()),
    errorCode: v.optional(v.string()),
  }),
  handler: async (_ctx, args) => {
    const validation = validateScrapeUrl(args.url);
    if (!validation.ok) {
      throw new Error(validation.error);
    }
    return await scrapeWithCheerio(validation.url);
  },
});
