/**
 * Chat access validation.
 *
 * Extracted from core.ts per [LOC1a].
 * Supports dual ownership: chats can have both userId AND sessionId.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { hasUserAccess, hasSessionAccess } from "../lib/auth";

/**
 * Validate chat access for a given context.
 *
 * Access paths:
 * 1. Convex queries/mutations (use userId from auth context)
 * 2. HTTP endpoints (use sessionId, since httpAction has no auth context)
 * 3. Shared/public chats are accessible to anyone
 */
export async function validateChatAccess(
  ctx: QueryCtx | MutationCtx,
  chatId: Id<"chats">,
  sessionId?: string,
) {
  const userId = await getAuthUserId(ctx);
  const chat = await ctx.db.get(chatId);

  if (!chat) return null;

  // Shared and public chats are accessible regardless of owner or session
  if (chat.privacy === "shared" || chat.privacy === "public") {
    return chat;
  }

  // For authenticated users: check userId matches (Convex queries/mutations)
  if (hasUserAccess(chat, userId)) {
    return chat;
  }

  // For sessionId-based access: HTTP endpoints or anonymous users
  // Note: HTTP actions don't have auth context, so they rely on sessionId
  if (!chat.userId && hasSessionAccess(chat, sessionId)) {
    return chat;
  }

  // No valid access path
  // SECURITY: Reject chats without proper ownership (userId or sessionId)
  // If a chat has neither, it's a data integrity issue that should not grant access
  return null;
}
