"use node";

/**
 * Convex action entry points for search planning.
 * Delegates to the plan handler for LLM-assisted query generation.
 */

import { v } from "convex/values";
import { action, internalAction } from "../../_generated/server";
import { isValidUuidV7 } from "../../lib/uuid";
import { runPlanSearch } from "./handler";
import { invalidatePlanCacheForChat as invalidateCacheForChat } from "../search/cache";

/**
 * Plan context-aware web search with LLM assistance.
 */
export const planSearch = action({
  args: {
    chatId: v.id("chats"),
    newMessage: v.string(),
    sessionId: v.optional(v.string()),
    maxContextMessages: v.optional(v.number()),
  },
  returns: v.object({
    shouldSearch: v.boolean(),
    contextSummary: v.string(),
    queries: v.array(v.string()),
    suggestNewChat: v.boolean(),
    decisionConfidence: v.number(),
    reasons: v.string(),
  }),
  handler: async (ctx, args) => {
    if (args.sessionId && !isValidUuidV7(args.sessionId)) {
      throw new Error("Invalid sessionId format");
    }
    return runPlanSearch(ctx, args);
  },
});

/** Invalidate planner cache for a chat. */
export const invalidatePlanCacheForChat = internalAction({
  args: { chatId: v.id("chats") },
  returns: v.null(),
  handler: async (_ctx, args) => {
    invalidateCacheForChat(args.chatId);
    return null;
  },
});
