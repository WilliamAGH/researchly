import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const createToken = internalMutation({
  args: {
    workflowId: v.string(),
    chatId: v.id("chats"),
    sessionId: v.optional(v.string()),
    issuedAt: v.number(),
    expiresAt: v.number(),
  },
  returns: v.id("workflowTokens"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("workflowTokens", {
      workflowId: args.workflowId,
      chatId: args.chatId,
      sessionId: args.sessionId,
      status: "active",
      issuedAt: args.issuedAt,
      expiresAt: args.expiresAt,
    });
  },
});

export const completeToken = internalMutation({
  args: {
    tokenId: v.id("workflowTokens"),
  },
  returns: v.object({ updated: v.boolean() }),
  handler: async (ctx, args) => {
    const token = await ctx.db.get(args.tokenId);
    if (!token) {
      console.error("[workflowTokens] Token not found for completion", {
        tokenId: args.tokenId,
      });
      return { updated: false };
    }
    if (token.status !== "active") {
      console.warn("[workflowTokens] Token not in active state", {
        tokenId: args.tokenId,
        currentStatus: token.status,
      });
      return { updated: false };
    }
    await ctx.db.patch(args.tokenId, {
      status: "completed",
    });
    return { updated: true };
  },
});

export const invalidateToken = internalMutation({
  args: {
    tokenId: v.id("workflowTokens"),
  },
  returns: v.object({ updated: v.boolean() }),
  handler: async (ctx, args) => {
    const token = await ctx.db.get(args.tokenId);
    if (!token) {
      console.error("[workflowTokens] Token not found for invalidation", {
        tokenId: args.tokenId,
      });
      return { updated: false };
    }
    if (token.status !== "active") {
      return { updated: false };
    }
    await ctx.db.patch(args.tokenId, { status: "invalidated" });
    return { updated: true };
  },
});
