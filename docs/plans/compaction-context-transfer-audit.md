# Compaction & Context Transfer Audit — "New Chat w/ Summary"

> **Status**: Audit complete — 2026-02-17  
> **Scope**: Full A-to-Z flow from UI button click → backend context injection  
> **Verdict**: The feature is fundamentally broken. The summary is computed but never reaches the new chat's first agent turn.

---

## 1. What "New Chat w/ Summary" Is Supposed to Do

When a user clicks **"New Chat w/ Summary"** in the `FollowUpPrompt` banner:

1. Compact the current chat's recent messages into a short context string.
2. Create a brand-new chat.
3. Send the user's pending follow-up message in that new chat **with the compact summary pre-injected** so the agent has continuity.

This is the canonical 2026 pattern for **context compaction**: instead of carrying a full conversation history across chats (expensive, lossy), you distill the prior context into a short summary and inject it as a system-level prefix in the new chat's first turn.

---

## 2. The Correct Modern Pattern (2026 Best Practice)

For coding agents and research assistants, the correct compaction flow is:

```
[Old Chat] → summarize(last N messages + rollingSummary)
           → compact string (≤ 2 KB)
           → inject into new chat's FIRST agent call
              as a system message OR as a prefix in the user turn
           → agent sees: "[CONTEXT FROM PRIOR CHAT]\n...\n\nUser: <new question>"
```

The summary must travel **server-side** — it must be part of the `conversationContext` string that `buildConversationContext()` / `buildAgentInput()` receives, OR it must be stored in the new chat's `rollingSummary` field **before** the first message is sent.

The summary must **not** live only in ephemeral React state.

---

## 3. The Actual Flow (Broken)

### Step 1 — UI: `handleNewChatWithSummary` (useEnhancedFollowUpPrompt.ts:155-185)

```typescript
const handleNewChatWithSummary = useCallback(async () => {
  const messageToSend = followUpMessage;
  resetFollowUp();
  if (messageToSend) setPendingMessage(messageToSend);   // ← stored in React state

  if (summarizeRecentAction && currentChatId) {
    const convexChatId = toConvexId<"chats">(currentChatId);
    try {
      const summary = await summarizeRecentAction({ chatId: convexChatId });
      setPlannerHint({ reason: String(summary) });        // ← stored in React state ONLY
    } catch (err) {
      setSummaryError(error);
      // Continue with new chat creation despite summary failure ← silent degradation
    }
  }

  await handleNewChat({ userInitiated: true });           // ← creates new chat, navigates
}, [...]);
```

**What happens to `plannerHint`?**  
It is stored in `useState` inside `useEnhancedFollowUpPrompt`. It is returned to `ChatInterface/index.tsx` and passed down to `ChatLayout` → `FollowUpPrompt` as `hintReason` — **purely for display in the UI banner**. It is never passed to the backend.

### Step 2 — New Chat Created

`handleNewChat` calls `unified.createChat("New Chat")` → `repository.createChat()` → Convex `createChat` mutation. The new chat is created with **no `rollingSummary`** and no context from the old chat.

### Step 3 — Pending Message Sent

The `useEffect` in `useEnhancedFollowUpPrompt` fires when `pendingMessage` and `currentChatId` are both set:

```typescript
useEffect(() => {
  if (!pendingMessage || !currentChatId || !sendRef.current) return;
  if (dispatchedRef.current) return;
  dispatchedRef.current = true;
  void sendMessage();
}, [pendingMessage, currentChatId, sendRef]);
```

This calls `sendRef.current(pendingMessage)` → `handleSendMessage` → `chatActions.sendMessage` → `ConvexStreamHandler.generateResponse`.

### Step 4 — HTTP POST to `/api/ai/agent/stream`

`ConvexStreamHandler.generateResponse` (ConvexStreamHandler.ts:47-80) builds the POST body:

```typescript
body: JSON.stringify({
  message,
  chatId: IdUtils.toConvexChatId(chatId),
  sessionId: sessionIdOverride ?? this.sessionId,
  conversationContext: chatHistory
    .map((m) => `${roleLabel(m.role)}: ${m.content}`)
    .join("\n")
    .slice(0, MAX_CONTEXT_CHARS),
  includeDebugSourceContext,
  imageStorageIds,
}),
```

`chatHistory` is fetched from the **new chat** (`this.fetchMessages(chatId)`), which has **zero messages** at this point. So `conversationContext` is an empty string `""`.

**The summary is not in the POST body. It never reaches the server.**

### Step 5 — HTTP Route Receives Request

`aiAgent_stream.ts` receives the POST. It reads `payload.message`, `payload.chatId`, `payload.sessionId`, `payload.webResearchSources`, `payload.imageStorageIds`. It does **not** read any `contextSummary` or `plannerHint` field — because none was sent.

### Step 6 — `streamConversationalWorkflow` Runs

`initializeWorkflowSession` fetches recent messages for the new chat (empty), builds `conversationContext = ""`, and calls `buildAgentInput`:

```typescript
const agentInput = buildAgentInput({
  userQuery: args.userQuery,
  conversationContext, // ← ""
  imageUrls,
  imageAnalysis,
  attachImages: imageUrls.length > 0,
});
```

The agent sees only the raw user message with zero prior context. **The summary is completely lost.**

---

## 4. Complete Bug Inventory

### Bug 1 — CRITICAL: Summary Never Reaches the Backend

**File**: `src/hooks/useEnhancedFollowUpPrompt.ts:155-185`  
**What**: `setPlannerHint({ reason: String(summary) })` stores the summary in React state. Nothing ever sends it to the server.  
**Why broken**: `plannerHint` flows only to `FollowUpPrompt.tsx` as `hintReason` for display. It is never included in the HTTP POST body, never written to the new chat's `rollingSummary`, and never injected into `conversationContext`.

### Bug 2 — CRITICAL: `ConvexStreamHandler` Ignores `plannerHint` / Context Summary

**File**: `src/lib/repositories/convex/ConvexStreamHandler.ts:47-80`  
**What**: `generateResponse` accepts `(chatId, message, imageStorageIds?, sessionIdOverride?)`. There is no parameter for a context summary or prior-chat hint.  
**Why broken**: Even if the caller had the summary, there is no way to pass it through the repository layer to the HTTP POST body.

### Bug 3 — CRITICAL: HTTP Route Has No `contextSummary` Field

**File**: `convex/http/routes/aiAgent_stream.ts`  
**What**: The route parses `message`, `chatId`, `sessionId`, `webResearchSources`, `imageStorageIds`, `includeDebugSourceContext`. There is no `contextSummary` or `priorChatSummary` field.  
**Why broken**: Even if the frontend sent a summary, the backend would silently ignore it.

### Bug 4 — CRITICAL: `StreamingWorkflowArgs` Has No Summary Field

**File**: `convex/agents/orchestration_session.ts:22-30`  
**What**: `StreamingWorkflowArgs` = `{ chatId, sessionId?, userQuery, webResearchSources?, includeDebugSourceContext?, imageStorageIds? }`. No `priorChatSummary` or `contextSummary` field.  
**Why broken**: Even if the HTTP route parsed a summary, it could not pass it to `streamConversationalWorkflow`.

### Bug 5 — CRITICAL: `buildAgentInput` Cannot Inject Cross-Chat Summary

**File**: `convex/agents/input_builder.ts`  
**What**: `buildAgentInput` takes `{ userQuery, conversationContext, imageUrls, imageAnalysis, attachImages }`. `conversationContext` is built from the **new chat's** message history (empty on first turn).  
**Why broken**: There is no mechanism to inject a cross-chat summary into the agent's context window.

### Bug 6 — RACE CONDITION: `plannerHint` Set After `handleNewChat` Navigates

**File**: `src/hooks/useEnhancedFollowUpPrompt.ts:155-185`  
**What**: The sequence is:

```
1. setPendingMessage(messageToSend)   ← triggers useEffect when currentChatId changes
2. await summarizeRecentAction(...)   ← async, takes 200-2000ms
3. setPlannerHint(...)                ← sets hint AFTER step 2
4. await handleNewChat(...)           ← navigates, changes currentChatId
```

The `useEffect` that sends `pendingMessage` fires when `currentChatId` changes (step 4). By that time, `summarizeRecentAction` may or may not have completed (step 2). If the new chat navigation resolves before the summary call completes, the message is sent with no summary. If the summary completes first, `plannerHint` is set but still never sent to the backend.  
**Why broken**: The ordering is non-deterministic. The summary call and the navigation race each other.

### Bug 7 — SILENT DEGRADATION: Summary Failure Swallowed

**File**: `src/hooks/useEnhancedFollowUpPrompt.ts:175-181`  
**What**:

```typescript
} catch (err) {
  logger.error("Failed to summarize recent chat:", error);
  setSummaryError(error);
  // Continue with new chat creation despite summary failure
}
```

**Why broken**: Violates `[EH1a]` — the error is caught, logged, and then execution continues as if nothing happened. The user gets a "New Chat w/ Summary" that has no summary, with no UI indication that the summary failed. `summaryError` is returned from the hook but is never rendered anywhere in the component tree.

### Bug 8 — WRONG FUNCTION: `summarizeRecentAction` vs `summarizeRecent`

**File**: `convex/chats/summarization.ts`  
**What**: Two functions exist:

- `summarizeRecent` (query) — directly queries the DB, uses `chat.rollingSummary`, returns a proper compact summary.
- `summarizeRecentAction` (action) — calls `api.chats.messages.getChatMessages` and `api.chats.core.getChatById`, then calls `buildContextSummary`.

The action version has a subtle bug: `getChatById` returns `v.union(v.any(), v.null())` — the `getRollingSummary` helper in `summarization.ts` does a runtime type check on the result, but `getChatById` returns the full chat doc as `v.any()`. This works, but it's fragile — if the return type ever changes, `getRollingSummary` silently returns `undefined` and the rolling summary is dropped from the compact output.

### Bug 9 — ARCHITECTURAL: `rollingSummary` Never Written for New Chats

**File**: `convex/chats/updates.ts` + `convex/messages.ts`  
**What**: `updateRollingSummary` is an `internalMutation` that writes `rollingSummary` to a chat. It is called from `convex/tools/plan/handler.ts` (the search planner). But:

1. The search planner only runs for the **current** chat, not for newly created chats.
2. When a new chat is created via `createChat`, `rollingSummary` is not set.
3. There is no mechanism to **seed** a new chat's `rollingSummary` with the prior chat's compact summary at creation time.

**Why broken**: Even if the summary were computed correctly, there is no write path to put it into the new chat before the first message is sent.

### Bug 10 — DUPLICATE CONTEXT BUILDING: Frontend vs Backend

**File**: `src/lib/repositories/convex/ConvexStreamHandler.ts:52-65` vs `convex/agents/orchestration_session.ts:130-135`  
**What**: The frontend builds its own `conversationContext` string:

```typescript
const recent = await this.fetchMessages(chatId);
const chatHistory = recent.slice(-MAX_CONTEXT_MESSAGES)
  .map((m) => ({ role: m.role, content: m.content }));
// ...
conversationContext: chatHistory
  .map((m) => `${roleLabel(m.role)}: ${m.content}`)
  .join("\n")
  .slice(0, MAX_CONTEXT_CHARS),
```

The backend **also** builds `conversationContext` in `initializeWorkflowSession` via `buildConversationContext(recentMessages)`.

**Why broken**: There are now **two** context-building paths with different logic, different limits (`MAX_CONTEXT_CHARS = 4000` frontend vs `CONTENT_LIMITS.MAX_CONTEXT_CHARS` backend), and different formatting. The frontend-built context is sent in the POST body but **ignored** by the backend — `aiAgent_stream.ts` never reads `payload.conversationContext`. The backend re-fetches messages independently. This means:

- The frontend wastes a DB round-trip fetching messages just to build a string that is discarded.
- The `conversationContext` field in the POST body is dead code.
- Any cross-chat summary injected into the frontend's `conversationContext` would be silently dropped.

### Bug 11 — LIMIT MISMATCH: Frontend 4000 chars vs Backend `CONTENT_LIMITS`

**File**: `src/lib/repositories/convex/ConvexStreamHandler.ts:49` vs `convex/lib/constants/cache.ts`  
**What**: Frontend hardcodes `MAX_CONTEXT_CHARS = 4000` and `MAX_CONTEXT_MESSAGES = 20`. Backend uses `CONTENT_LIMITS.MAX_CONTEXT_CHARS` and `CONTENT_LIMITS.MAX_CONTEXT_MESSAGES` from a shared constants file. These values may diverge over time since the frontend constant is a magic number, not imported from the shared constants.

### Bug 12 — `buildContextSummary` Deduplication Logic Is Broken

**File**: `convex/chats/utils.ts:buildContextSummary`  
**What**: The deduplication check uses `included.has(line)` where `included` is initialized from `lines` (which contains the `rollingSummary` and the last 2 user turns and last assistant turn). Then it iterates `recent` and checks if the formatted line is already in `included`. But the lines in `included` are formatted as `"User: ..."` / `"Assistant: ..."` while the loop also formats them the same way — so the check works for exact matches. However, the `rollingSummary` is added raw (not formatted as `"User:"` or `"Assistant:"`), so it will never match any message line. This means the rolling summary is always included even if it duplicates content already in the recent messages.

More critically: the function adds the `rollingSummary` first (up to 800 chars), then the last 2 user turns (up to 380 chars each), then the last assistant turn (up to 380 chars), then iterates `recent` again to add compact one-liners. This means the last user and assistant messages appear **twice** in the output — once verbatim and once as compact one-liners — because the `included` set check uses the full formatted line but the compact one-liner is truncated to 220 chars, so it won't match the 380-char verbatim version.

---

## 5. The Correct Fix Architecture

### Fix 1 — Add `priorChatSummary` to `StreamingWorkflowArgs`

```typescript
// convex/agents/orchestration_session.ts
export interface StreamingWorkflowArgs {
  chatId: Id<"chats">;
  sessionId?: string;
  userQuery: string;
  webResearchSources?: WebResearchSource[];
  includeDebugSourceContext?: boolean;
  imageStorageIds?: Id<"_storage">[];
  priorChatSummary?: string; // ← ADD THIS
}
```

### Fix 2 — Inject `priorChatSummary` into `buildAgentInput`

In `initializeWorkflowSession`, after building `conversationContext`:

```typescript
// If a prior-chat summary was provided, prepend it to conversationContext
const effectiveContext = args.priorChatSummary
  ? `[CONTEXT FROM PRIOR CONVERSATION]\n${args.priorChatSummary}\n\n[CURRENT CONVERSATION]\n${conversationContext}`
  : conversationContext;

const conversationContextFinal = effectiveContext;
```

Then pass `conversationContextFinal` to `buildAgentInput`.

### Fix 3 — Add `priorChatSummary` to HTTP Route

```typescript
// convex/http/routes/aiAgent_stream.ts
const priorChatSummary = sanitizeTextInput(payload.priorChatSummary, 2000);

// Pass to streamConversationalWorkflow:
const eventStream = streamConversationalWorkflow(ctx, {
  chatId,
  sessionId,
  userQuery: message,
  webResearchSources,
  includeDebugSourceContext,
  imageStorageIds,
  priorChatSummary, // ← ADD THIS
});
```

### Fix 4 — Add `priorChatSummary` to `ConvexStreamHandler.generateResponse`

```typescript
// src/lib/repositories/convex/ConvexStreamHandler.ts
async *generateResponse(
  chatId: string,
  message: string,
  imageStorageIds?: string[],
  sessionIdOverride?: string,
  priorChatSummary?: string,  // ← ADD THIS
): AsyncGenerator<MessageStreamChunk> {
  // ...
  body: JSON.stringify({
    message,
    chatId: IdUtils.toConvexChatId(chatId),
    sessionId: sessionIdOverride ?? this.sessionId,
    includeDebugSourceContext,
    imageStorageIds,
    priorChatSummary,  // ← ADD THIS (remove dead conversationContext field)
  }),
```

### Fix 5 — Thread `priorChatSummary` Through the Repository Layer

```typescript
// src/lib/repositories/ChatRepository.ts (interface)
generateResponse(
  chatId: string,
  message: string,
  imageStorageIds?: string[],
  sessionIdOverride?: string,
  priorChatSummary?: string,
): AsyncGenerator<MessageStreamChunk>;

// src/lib/repositories/ConvexChatRepository.ts
generateResponse(
  chatId: string,
  message: string,
  imageStorageIds?: string[],
  sessionIdOverride?: string,
  priorChatSummary?: string,
): AsyncGenerator<MessageStreamChunk> {
  return this.streamHandler.generateResponse(
    chatId, message, imageStorageIds, sessionIdOverride, priorChatSummary,
  );
}
```

### Fix 6 — Fix `handleNewChatWithSummary` to Pass Summary to First Message

The summary must be passed to `sendRef.current` when the pending message is dispatched. The cleanest approach:

```typescript
// src/hooks/useEnhancedFollowUpPrompt.ts
// Replace plannerHint with a ref that holds the summary string
const priorChatSummaryRef = useRef<string | null>(null);

const handleNewChatWithSummary = useCallback(async () => {
  const messageToSend = followUpMessage;
  resetFollowUp();

  // Compute summary BEFORE creating new chat (sequential, not racing)
  let summary: string | null = null;
  if (summarizeRecentAction && currentChatId) {
    const convexChatId = toConvexId<"chats">(currentChatId);
    if (convexChatId) {
      try {
        summary = await summarizeRecentAction({ chatId: convexChatId });
      } catch (err) {
        logger.error("Failed to summarize recent chat:", err);
        // Surface error to user — do NOT silently continue
        setSummaryError(err instanceof Error ? err : new Error(String(err)));
        return; // Abort — don't create a "w/ Summary" chat with no summary
      }
    }
  }

  priorChatSummaryRef.current = summary;
  if (messageToSend) setPendingMessage(messageToSend);
  await handleNewChat({ userInitiated: true });
}, [
  currentChatId,
  followUpMessage,
  handleNewChat,
  resetFollowUp,
  summarizeRecentAction,
]);

// In the send useEffect, pass the summary:
useEffect(() => {
  if (!pendingMessage || !currentChatId || !sendRef.current) return;
  if (dispatchedRef.current) return;
  dispatchedRef.current = true;
  const summary = priorChatSummaryRef.current;
  priorChatSummaryRef.current = null; // consume once

  void (async () => {
    try {
      await sendRef.current?.(pendingMessage, undefined, summary ?? undefined);
    } catch (err) {
      logger.error("Failed to send follow-up message:", err);
    } finally {
      setPendingMessage(null);
      dispatchedRef.current = false;
    }
  })();
}, [pendingMessage, currentChatId, sendRef]);
```

### Fix 7 — Update `sendRef` Signature

```typescript
// src/hooks/useMessageHandler.ts
sendRef.current = async (msg: string, ids?: string[], priorChatSummary?: string) =>
  handleSendMessage(msg, ids, priorChatSummary);

// handleSendMessage must accept and forward priorChatSummary:
await chatActions.sendMessage(
  activeChatId,
  messageInput.trim(),
  imageStorageIds,
  chatState.chats.find(...)?.sessionId,
  priorChatSummary,  // ← ADD
);
```

### Fix 8 — Fix the Race Condition (Sequential Ordering)

The current code does:

```
setPendingMessage → summarize (async) → setPlannerHint → handleNewChat
```

The fixed code must do:

```
summarize (await, sequential) → store summary in ref → setPendingMessage → handleNewChat
```

This eliminates the race because the summary is computed and stored **before** navigation changes `currentChatId`, which is what triggers the pending message dispatch.

### Fix 9 — Remove Dead `conversationContext` from POST Body

`ConvexStreamHandler` currently fetches messages and builds a `conversationContext` string that the backend ignores. Remove this dead code:

```typescript
// REMOVE these lines from ConvexStreamHandler.generateResponse:
const recent = await this.fetchMessages(chatId);
const chatHistory = recent.slice(-MAX_CONTEXT_MESSAGES)
  .map((m) => ({ role: m.role, content: m.content }));
// ...
conversationContext: chatHistory.map(...).join("\n").slice(0, MAX_CONTEXT_CHARS),
```

The backend already fetches messages independently in `initializeWorkflowSession`. The frontend fetch is a wasted DB round-trip.

### Fix 10 — Fix `buildContextSummary` Double-Inclusion Bug

```typescript
// convex/chats/utils.ts
export function buildContextSummary(params: { ... }): string {
  const { messages, rollingSummary, maxChars = 1600 } = params;
  const sanitize = normalizeWhitespace;
  const recent = messages.slice(-14);

  const lines: string[] = [];
  const includedContent = new Set<string>(); // track by content, not formatted line

  if (rollingSummary) {
    const txt = sanitize(rollingSummary).slice(0, 800);
    if (txt) {
      lines.push(txt);
      // Don't add to includedContent — rolling summary is a meta-summary, not a message
    }
  }

  const lastUsers = [...recent].reverse().filter((m) => m.role === "user").slice(0, 2).reverse();
  const lastAssistant = [...recent].reverse().find((m) => m.role === "assistant");

  for (const m of lastUsers) {
    const txt = sanitize(m.content).slice(0, 380);
    if (txt) {
      lines.push(`User: ${txt}`);
      includedContent.add(m.content ?? "");
    }
  }
  if (lastAssistant) {
    const txt = sanitize(lastAssistant.content).slice(0, 380);
    if (txt) {
      lines.push(`Assistant: ${txt}`);
      includedContent.add(lastAssistant.content ?? "");
    }
  }

  // Compact one-liners for remaining messages not already included verbatim
  for (const m of recent) {
    if (includedContent.has(m.content ?? "")) continue; // skip already-included
    const txt = sanitize(m.content);
    if (!txt) continue;
    const label = m.role === "assistant" ? "Assistant" : m.role === "user" ? "User" : "System";
    lines.push(`${label}: ${txt.slice(0, 220)}`);
    if (lines.join("\n").length >= maxChars) break;
  }

  return lines.join("\n").slice(0, maxChars);
}
```

### Fix 11 — Surface `summaryError` in the UI

```typescript
// src/components/FollowUpPrompt.tsx — add error display
{summaryError && (
  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
    Could not load summary. Try again or start a plain new chat.
  </p>
)}
```

And pass `summaryError` from `useEnhancedFollowUpPrompt` through `ChatLayout` to `FollowUpPrompt`.

---

## 6. Summary Table of All Bugs

| #   | Severity | File                                            | Bug                                                                    | Fix                                                                     |
| --- | -------- | ----------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | CRITICAL | `useEnhancedFollowUpPrompt.ts`                  | Summary stored in React state only, never sent to backend              | Pass summary through `sendRef` → repository → HTTP POST                 |
| 2   | CRITICAL | `ConvexStreamHandler.ts`                        | No parameter for cross-chat summary                                    | Add `priorChatSummary` param to `generateResponse`                      |
| 3   | CRITICAL | `aiAgent_stream.ts`                             | HTTP route has no `priorChatSummary` field                             | Parse and forward `priorChatSummary` to workflow args                   |
| 4   | CRITICAL | `orchestration_session.ts`                      | `StreamingWorkflowArgs` has no summary field                           | Add `priorChatSummary?: string` to interface                            |
| 5   | CRITICAL | `input_builder.ts` / `orchestration_session.ts` | No injection point for cross-chat summary                              | Prepend summary to `conversationContext` in `initializeWorkflowSession` |
| 6   | HIGH     | `useEnhancedFollowUpPrompt.ts`                  | Race: summary call and navigation race each other                      | Await summary sequentially before `handleNewChat`                       |
| 7   | HIGH     | `useEnhancedFollowUpPrompt.ts`                  | Silent degradation on summary failure                                  | Abort on failure, surface error to user                                 |
| 8   | MEDIUM   | `ConvexStreamHandler.ts`                        | Dead `conversationContext` POST field (built but ignored by backend)   | Remove frontend context-building; backend re-fetches anyway             |
| 9   | MEDIUM   | `chats/utils.ts`                                | `buildContextSummary` double-includes last user/assistant messages     | Fix deduplication to track by content, not formatted line               |
| 10  | MEDIUM   | `ConvexStreamHandler.ts`                        | Frontend hardcodes `MAX_CONTEXT_CHARS=4000` instead of shared constant | Import from `CONTENT_LIMITS`                                            |
| 11  | LOW      | `FollowUpPrompt.tsx` / `ChatLayout.tsx`         | `summaryError` never rendered                                          | Add error display in `FollowUpPrompt`                                   |
| 12  | LOW      | `summarization.ts`                              | `getRollingSummary` fragile runtime cast on `v.any()` return           | Use typed query return or explicit cast with validation                 |

---

## 7. Files That Must Change

1. `convex/agents/orchestration_session.ts` — add `priorChatSummary` to `StreamingWorkflowArgs`; inject into `conversationContext`
2. `convex/http/routes/aiAgent_stream.ts` — parse `priorChatSummary` from payload; pass to workflow
3. `src/lib/repositories/convex/ConvexStreamHandler.ts` — add `priorChatSummary` param; remove dead `conversationContext` build; remove dead `fetchMessages` call
4. `src/lib/repositories/ChatRepository.ts` — update `generateResponse` interface signature
5. `src/lib/repositories/ConvexChatRepository.ts` — forward `priorChatSummary` to `streamHandler`
6. `src/hooks/useEnhancedFollowUpPrompt.ts` — fix ordering (sequential await), fix race, fix silent degradation, pass summary via ref
7. `src/hooks/useMessageHandler.ts` — accept and forward `priorChatSummary` in `handleSendMessage` and `sendRef`
8. `src/hooks/useChatActions.ts` — accept `priorChatSummary` in `sendMessage` action
9. `convex/chats/utils.ts` — fix `buildContextSummary` deduplication
10. `src/components/FollowUpPrompt.tsx` — render `summaryError`
11. `src/components/ChatInterface/ChatLayout.tsx` — pass `summaryError` prop

---

## 8. What Does NOT Need to Change

- `convex/chats/summarization.ts` — the `summarizeRecentAction` function is correct; it computes the right summary. The problem is what happens to the result after it's returned.
- `convex/agents/helpers_builders.ts:buildConversationContext` — correct; just needs to receive the summary as part of the messages or as a prefix.
- `convex/chats/updates.ts:updateRollingSummary` — correct; but an alternative fix path would be to write the summary to the new chat's `rollingSummary` at creation time (requires a new mutation parameter).
- The `rollingSummary` schema field — correct; already exists and is the right place for per-chat compact context.
