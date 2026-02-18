"use node";

/**
 * Convex action entry point for web scraping.
 * Delegates to scrapeWithCheerio which handles URL validation internally.
 */

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { scrapeWithCheerio } from "./orchestrator";

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
    return await scrapeWithCheerio(args.url);
  },
});
