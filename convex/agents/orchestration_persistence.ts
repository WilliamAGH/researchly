"use node";

/**
 * Workflow Persistence Helpers
 *
 * Extracted from orchestration.ts per [DR1a] to eliminate duplicate patterns
 * for chat title updates, message persistence, and workflow completion.
 *
 * These helpers require the Node.js runtime for Convex action context operations.
 * See [CX1g] - only actions may run in the Node.js runtime.
 */

import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { generateChatTitle } from "../chats/utils";
import type { StreamingPersistPayload } from "../schemas/agents";
import type { WebResearchSource } from "../lib/validators";
import { TOKEN_NOT_FOUND, TOKEN_WRONG_STATUS } from "../workflowTokens";

// ============================================
// Types
// ============================================
// Design Decision: Parameter Objects
// -----------------------------------
// These interfaces use parameter objects instead of positional arguments because:
// 1. Functions have 4+ parameters, making positional calls error-prone
// 2. Named parameters are self-documenting at call sites
// 3. Optional fields (sessionId, searchResults, etc.) are cleaner with objects
// 4. Adding new optional parameters doesn't break existing callers
// 5. TypeScript provides full autocomplete and type checking
//
// The PersistAssistantMessageParams interface has 7 fields because message
// persistence requires all this data - the alternative would be multiple
// function calls or a less type-safe approach.

/**
 * Minimal context needed for persistence operations.
 * Uses Pick<ActionCtx, ...> pattern matching StreamingWorkflowCtx in orchestration.ts
 * for proper type inference on Convex mutation/query/action calls.
 */
export type WorkflowActionCtx = Pick<
  ActionCtx,
  "runMutation" | "runQuery" | "runAction" | "storage"
>;

/** Parameters for chat title update */
export interface UpdateChatTitleParams {
  ctx: WorkflowActionCtx;
  chatId: Id<"chats">;
  currentTitle: string | undefined;
  intent: string;
  /** LLM-generated title from planner — used directly when available. */
  chatTitle?: string;
}

/**
 * Parameters for assistant message persistence.
 * Fields map directly to internal.messages.addMessage arguments.
 */
export interface PersistAssistantMessageParams {
  /** Convex action context for running mutations */
  ctx: WorkflowActionCtx;
  /** Target chat for the message */
  chatId: Id<"chats">;
  /** Message content (markdown text) */
  content: string;
  /** Workflow ID for tracing */
  workflowId: string;
  /** Optional workflow token for session-rotated workflows */
  workflowTokenId?: Id<"workflowTokens"> | null;
  /** Optional session ID for HTTP action auth */
  sessionId?: string;
  /** Canonical: structured web research sources used by the system */
  webResearchSources?: WebResearchSource[];
}

/** Parameters for workflow completion */
export interface CompleteWorkflowParams {
  ctx: WorkflowActionCtx;
  workflowTokenId: Id<"workflowTokens"> | null;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Update chat title if it's still the default "New Chat".
 * Prefers the LLM-generated chatTitle from the planner when available;
 * falls back to generateChatTitle (prefix-strip + truncate) for
 * instant/conversational paths that skip planning.
 */
export async function updateChatTitleIfNeeded(
  params: UpdateChatTitleParams,
): Promise<void> {
  const { ctx, chatId, currentTitle, intent, chatTitle } = params;

  if (currentTitle === "New Chat" || !currentTitle) {
    const title = chatTitle?.trim()
      ? chatTitle.trim().slice(0, 50)
      : generateChatTitle({ intent });
    // @ts-ignore - Known Convex TS2589 issue with complex type inference in ctx.runMutation
    await ctx.runMutation(internal.chats.internalUpdateChatTitle, {
      chatId,
      title,
    });
  }
}

/**
 * Persist an assistant message to the database.
 * Returns the created message ID.
 *
 * @see {@link ../messages.ts} - addMessage mutation
 */
export async function persistAssistantMessage(
  params: PersistAssistantMessageParams,
): Promise<Id<"messages">> {
  const {
    ctx,
    chatId,
    content,
    workflowId,
    workflowTokenId,
    sessionId,
    webResearchSources = [],
  } = params;

  if (sessionId) {
    // @ts-ignore - Known Convex TS2589 issue with complex type inference in ctx.runMutation
    return await ctx.runMutation(internal.messages.addMessageHttp, {
      chatId,
      role: "assistant",
      content,
      webResearchSources,
      workflowId,
      isStreaming: false,
      sessionId,
      ...(workflowTokenId ? { workflowTokenId } : {}),
    });
  }

  return await ctx.runMutation(internal.messages.addMessage, {
    chatId,
    role: "assistant",
    content,
    webResearchSources,
    workflowId,
    isStreaming: false,
    sessionId,
  });
}

/**
 * Mark a workflow token as completed.
 *
 * @see {@link ../workflowTokens.ts} - completeToken mutation
 */
export async function completeWorkflow(
  params: CompleteWorkflowParams,
): Promise<void> {
  const { ctx, workflowTokenId } = params;

  if (workflowTokenId) {
    try {
      await ctx.runMutation(internal.workflowTokens.completeToken, {
        tokenId: workflowTokenId,
      });
    } catch (error) {
      // Race: error handler may have already invalidated or completed
      // this token concurrently. Only suppress that expected race —
      // infrastructure errors must propagate.
      const msg = error instanceof Error ? error.message : String(error);
      // Use includes() rather than startsWith() — Convex may wrap or prefix
      // error messages during ctx.runMutation propagation across action/mutation
      // boundaries, so a prefix-only check risks missing the expected race.
      if (msg.includes(TOKEN_WRONG_STATUS) || msg.includes(TOKEN_NOT_FOUND)) {
        console.warn("[completeWorkflow] Token already transitioned:", {
          tokenId: String(workflowTokenId),
          error: msg,
        });
        return;
      }
      throw error;
    }
  }
}

/**
 * Combined helper to persist message and complete workflow.
 * Encapsulates the common pattern: persist -> build payload -> mark complete.
 */
export async function persistAndCompleteWorkflow(
  params: PersistAssistantMessageParams & {
    workflowTokenId: Id<"workflowTokens"> | null;
  },
): Promise<StreamingPersistPayload> {
  const assistantMessageId = await persistAssistantMessage(params);

  const payload: StreamingPersistPayload = {
    assistantMessageId,
    workflowId: params.workflowId,
    answer: params.content,
    webResearchSources: params.webResearchSources || [],
  };

  await completeWorkflow({
    ctx: params.ctx,
    workflowTokenId: params.workflowTokenId,
  });

  return payload;
}
