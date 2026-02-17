import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/** Named error prefixes for token mutation failures. */
export const TOKEN_NOT_FOUND = "TOKEN_NOT_FOUND";
export const TOKEN_WRONG_STATUS = "TOKEN_WRONG_STATUS";

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
  returns: v.null(),
  handler: async (ctx, args) => {
    const token = await ctx.db.get(args.tokenId);
    if (!token) {
      throw new Error(
        `${TOKEN_NOT_FOUND}: completeToken called with nonexistent tokenId=${args.tokenId}`,
      );
    }
    if (token.status !== "active") {
      throw new Error(
        `${TOKEN_WRONG_STATUS}: completeToken expected active, got ${token.status} for tokenId=${args.tokenId}`,
      );
    }
    await ctx.db.patch(args.tokenId, {
      status: "completed",
    });
    return null;
  },
});

export const invalidateToken = internalMutation({
  args: {
    tokenId: v.id("workflowTokens"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const token = await ctx.db.get(args.tokenId);
    if (!token) {
      throw new Error(
        `${TOKEN_NOT_FOUND}: invalidateToken called with nonexistent tokenId=${args.tokenId}`,
      );
    }
    if (token.status !== "active") {
      throw new Error(
        `${TOKEN_WRONG_STATUS}: invalidateToken expected active, got ${token.status} for tokenId=${args.tokenId}`,
      );
    }
    await ctx.db.patch(args.tokenId, { status: "invalidated" });
    return null;
  },
});
