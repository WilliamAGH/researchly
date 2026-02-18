# Compaction & Context Transfer Audit — "New Chat w/ Summary"

> **Status**: All bugs fixed — 2026-02-17  
> **Scope**: Full A-to-Z flow from UI button click → backend context injection  
> **Details**: See `docs/plans/compaction-context-transfer-fixes.md` for architecture and fix specifics.

---

## 1. What "New Chat w/ Summary" Is Supposed to Do

When a user clicks **"New Chat w/ Summary"** in the `FollowUpPrompt` banner:

1. Compact the current chat's recent messages into a short context string.
2. Create a brand-new chat.
3. Send the user's pending follow-up message in that new chat **with the compact summary
   pre-injected** so the agent has continuity.

This is the canonical 2026 pattern for **context compaction**: instead of carrying a full
conversation history across chats (expensive, lossy), you distill the prior context into a
short summary and inject it as a system-level prefix in the new chat's first turn.

---

## 2. Correct Modern Pattern

```text
[Old Chat] → summarize(last N messages + rollingSummary)
           → compact string (≤ 2 KB)
           → inject into new chat's FIRST agent call
              as a prefix in conversationContext
           → agent sees: "[CONTEXT FROM PRIOR CONVERSATION]\n...\n\n[CURRENT CONVERSATION]\n..."
```

The summary must travel **server-side** — it must be part of the `conversationContext` string
that `initializeWorkflowSession` receives. It must **not** live only in ephemeral React state.

---

## 3. Fixed Flow (Current State)

```text
User clicks "New Chat w/ Summary"
  → handleNewChatWithSummary (useEnhancedFollowUpPrompt.ts)
      1. await summarizeRecentAction({ chatId })      ← sequential, not racing
      2. priorChatSummaryRef.current = summary         ← stored in ref, not state
      3. if failure → setSummaryError + abort          ← fail loudly
      4. setPendingMessage(messageToSend)
      5. await handleNewChat({ userInitiated: true })
  → useEffect fires when pendingMessage + currentChatId ready
      → sendRef.current(msg, undefined, summary)       ← summary attached
  → handleSendMessage (useMessageHandler.ts)
      → chatActions.sendMessage(..., priorChatSummary)
  → sendMessageWithStreaming (chatActions/sendMessage.ts)
      → repository.generateResponse(..., priorChatSummary)
  → ConvexStreamHandler.generateResponse
      → POST body: { message, chatId, ..., priorChatSummary }
  → aiAgent_stream.ts HTTP route
      → sanitizeTextInput(payload.priorChatSummary, 2000)
      → streamConversationalWorkflow({ ..., priorChatSummary })
  → initializeWorkflowSession (orchestration_session.ts)
      → conversationContext = "[CONTEXT FROM PRIOR CONVERSATION]\n{summary}\n\n[CURRENT CONVERSATION]\n{base}"
  → Agent sees full cross-chat context on first turn ✅
```

---

## 4. Bug Inventory (All Fixed)

| #   | Sev      | File                           | Bug                                              | Status   |
| --- | -------- | ------------------------------ | ------------------------------------------------ | -------- |
| 1   | CRITICAL | `useEnhancedFollowUpPrompt.ts` | Summary stored in state, never sent              | ✅ Fixed |
| 2   | CRITICAL | `ConvexStreamHandler.ts`       | No `priorChatSummary` param                      | ✅ Fixed |
| 3   | CRITICAL | `aiAgent_stream.ts`            | HTTP route ignores summary                       | ✅ Fixed |
| 4   | CRITICAL | `orchestration_session.ts`     | `StreamingWorkflowArgs` missing field            | ✅ Fixed |
| 5   | CRITICAL | `orchestration_session.ts`     | Summary never injected into context              | ✅ Fixed |
| 6   | HIGH     | `useEnhancedFollowUpPrompt.ts` | Race: summary and navigation racing              | ✅ Fixed |
| 7   | HIGH     | `useEnhancedFollowUpPrompt.ts` | Silent degradation on summary failure            | ✅ Fixed |
| 8   | MEDIUM   | `ConvexStreamHandler.ts`       | Dead `conversationContext` POST field            | ✅ Fixed |
| 9   | MEDIUM   | `chats/utils.ts`               | Double-includes last user/assistant msgs         | ✅ Fixed |
| 10  | MEDIUM   | `chats/utils.ts`               | O(n²) `join().length` check in loop              | ✅ Fixed |
| 11  | LOW      | `FollowUpPrompt.tsx`           | `summaryError` never rendered                    | ✅ Fixed |
| 12  | LOW      | `chats/utils.ts`               | Narrow filler-word list in `generateChatTitle`   | ✅ Fixed |
| 13  | LOW      | `chats/core.ts`                | `createChat` had no `rollingSummary` param       | ✅ Fixed |
| 14  | LOW      | `ChatLayout.tsx` / `index.tsx` | `plannerHint` threaded instead of `summaryError` | ✅ Fixed |

---

## 5. Files Changed

| File                                                 | What Changed                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `convex/chats/utils.ts`                              | Expanded `QUESTION_PREFIXES` (40+ entries), iterative stripping, dedup fix, O(n²) fix |
| `convex/chats/core.ts`                               | Added `rollingSummary` param to `createChat`                                          |
| `convex/agents/orchestration_session.ts`             | `priorChatSummary` in `StreamingWorkflowArgs`; label-prefixed context injection       |
| `convex/http/routes/aiAgent_stream.ts`               | Parse + forward `priorChatSummary`                                                    |
| `src/lib/repositories/convex/ConvexStreamHandler.ts` | Add `priorChatSummary`; remove dead `fetchMessages` + `conversationContext` build     |
| `src/lib/repositories/ChatRepository.ts`             | Updated `generateResponse` interface                                                  |
| `src/lib/repositories/ConvexChatRepository.ts`       | Forward `priorChatSummary`; remove dead 3rd ctor arg                                  |
| `src/hooks/chatActions/sendMessage.ts`               | Added `priorChatSummary` to `SendMessageParams`                                       |
| `src/hooks/useChatActions.ts`                        | `sendMessage` accepts + forwards `priorChatSummary`                                   |
| `src/hooks/useMessageHandler.ts`                     | `handleSendMessage` + `sendRef` updated signature                                     |
| `src/hooks/useEnhancedFollowUpPrompt.ts`             | Sequential await, `priorChatSummaryRef`, abort-on-failure, `summaryError`             |
| `src/components/FollowUpPrompt.tsx`                  | Renders `summaryError` inline; `Readonly<>`                                           |
| `src/components/ChatInterface/ChatLayout.tsx`        | `plannerHint` → `summaryError`                                                        |
| `src/components/ChatInterface/index.tsx`             | Destructures `summaryError` from hook                                                 |

---

## 6. What Did NOT Change

- `convex/chats/summarization.ts` — `summarizeRecentAction` is correct; no changes needed.
- `convex/agents/helpers_builders.ts` — correct; the prefix injection point is upstream.
- `convex/chats/updates.ts:updateRollingSummary` — correct; unchanged.
