"use node";

/**
 * Convex action entry point for web search.
 * Delegates to the search handler with provider fallback chain.
 */

import { v } from "convex/values";
import { action } from "../../_generated/server";
import {
  vSearchResult,
  vSerpEnrichment,
  vSearchMethod,
} from "../../lib/validators";
import { runSearchWeb } from "./handler";

/**
 * Perform web search using available providers.
 * Tries: SERP API -> OpenRouter -> DuckDuckGo -> Fallback
 */
export const searchWeb = action({
  args: {
    query: v.string(),
    maxResults: v.optional(v.number()),
  },
  returns: v.object({
    results: v.array(vSearchResult),
    searchMethod: vSearchMethod,
    hasRealResults: v.boolean(),
    enrichment: v.optional(vSerpEnrichment),
    providerErrors: v.optional(
      v.array(v.object({ provider: v.string(), error: v.string() })),
    ),
    allProvidersFailed: v.optional(v.boolean()),
  }),
  handler: async (_ctx, args) => runSearchWeb(args),
});
