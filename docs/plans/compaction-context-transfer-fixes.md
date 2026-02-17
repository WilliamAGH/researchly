# Compaction & Context Transfer — Fix Architecture

> **Status**: Implemented — 2026-02-17
> **Companion audit**: `docs/plans/compaction-context-transfer-audit.md`

---

## 1. Files Changed

| File                                                 | Change                                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `convex/agents/orchestration_session.ts`             | Added `priorChatSummary` to `StreamingWorkflowArgs`; labeled injection in `initializeWorkflowSession` |
| `convex/http/routes/aiAgent_stream.ts`               | Parses `priorChatSummary` from POST body; forwards to workflow                                        |
| `convex/chats/core.ts`                               | Added `rollingSummary?: string` seed param to `createChat`                                            |
| `convex/chats/utils.ts`                              | Fixed `buildContextSummary` deduplication + O(n²) loop; expanded `generateChatTitle` filler list      |
| `src/lib/repositories/convex/ConvexStreamHandler.ts` | Added `priorChatSummary` param; removed dead `conversationContext` POST field                         |
| `src/lib/repositories/ChatRepository.ts`             | Updated `generateResponse` interface + abstract signature                                             |
| `src/lib/repositories/ConvexChatRepository.ts`       | Forwarded `priorChatSummary` to `streamHandler`                                                       |
| `src/hooks/chatActions/sendMessage.ts`               | Added `priorChatSummary` to `SendMessageParams`; forwarded to `repository.generateResponse`           |
| `src/hooks/useChatActions.ts`                        | Added `priorChatSummary` to `sendMessage` interface and implementation                                |
| `src/hooks/useMessageHandler.ts`                     | Updated `sendRef` type; `handleSendMessage` accepts + forwards `priorChatSummary`                     |
| `src/hooks/useEnhancedFollowUpPrompt.ts`             | Full refactor: sequential ordering, `priorChatSummaryRef`, abort on failure, `summaryError`           |
| `src/components/FollowUpPrompt.tsx`                  | Replaced `hintReason`/`hintConfidence` with `summaryError`; renders inline error                      |
| `src/components/ChatInterface/ChatLayout.tsx`        | Replaced `plannerHint` with `summaryError`; passes to `FollowUpPrompt`                                |
| `src/components/ChatInterface/index.tsx`             | Removed `plannerHint` usage; passes `summaryError` to `ChatLayout`                                    |

---

## 2. What Does NOT Need to Change

- `convex/chats/summarization.ts` — `summarizeRecentAction` computes the correct summary.
- `convex/agents/helpers_builders.ts:buildConversationContext` — correct as-is; receives summary via prefix.
- `convex/chats/updates.ts:updateRollingSummary` — correct; the alternative `createChat` seed path is now enabled.
- The `rollingSummary` schema field — correct; already exists.

---

## 3. Tiny Chat Title Analysis (generateChatTitle)

### Problem

`generateChatTitle` used a narrow filler list that missed the most common question openers:

- Missing: `"what is a"`, `"what are"`, `"how does"`, `"give me"`, `"find me"`, `"what's"`, etc.
- Only stripped prefixes anchored at the start with a single pass — compound openers
  (`"Can you please tell me about X"`) were only partially stripped.
- No semantic inversion: "What is a term for veiled threat" → still produces
  `"Term or phrase for veile..."` rather than `"Veiled threat synonyms"`.

### Fix Applied

- Expanded `QUESTION_PREFIXES` to cover all common question/request openers (40+ entries).
- Applied iteratively in a `do...while` loop until no more prefixes match.

### Remaining Limitation

String manipulation alone cannot invert question structure into a topic noun phrase.
The ideal 2026 approach is an LLM micro-prompt call when `currentTitle === "New Chat"`:

```
System: "Generate a 3-5 word noun phrase title. No verbs. No questions. Output ONLY the title."
User: "<first message>"
```

This is how ChatGPT, Claude.ai, and Cursor generate titles. The cost is ~100 input + ~10 output
tokens. If implemented, it would go in `orchestration_persistence.ts:updateChatTitleIfNeeded`.

---

## 4. SRP/DDD Violations in Context Pipeline

### Current State (Two Parallel Context-Building Functions)

| Function                   | Location                            | Max chars        | Image support | Purpose                    |
| -------------------------- | ----------------------------------- | ---------------- | ------------- | -------------------------- |
| `buildContextSummary`      | `convex/chats/utils.ts`             | 1600 (default)   | No            | Cross-chat compact summary |
| `buildConversationContext` | `convex/agents/helpers_builders.ts` | `CONTENT_LIMITS` | Yes           | In-workflow history        |

Both solve variations of the same problem without sharing a primitive.

### Recommended Clean Architecture (Future Work)

```
convex/context/
  extraction.ts    — extractMessages(chatId, limit): common DB query primitive
  formatting.ts    — formatAsConversation(messages): for agent workflow context
  compaction.ts    — buildCompactSummary(messages, maxChars): for cross-chat transfer
```

This would eliminate the three independent DB queries (one in `summarizeRecent`,
one in `initializeWorkflowSession`, one was in `ConvexStreamHandler` — now removed).

---

## 5. Summary Table (All Bugs)

| #   | Severity | Status   | Bug                                                                    |
| --- | -------- | -------- | ---------------------------------------------------------------------- |
| 1   | CRITICAL | ✅ Fixed | Summary stored in React state only, never sent to backend              |
| 2   | CRITICAL | ✅ Fixed | `ConvexStreamHandler` had no `priorChatSummary` parameter              |
| 3   | CRITICAL | ✅ Fixed | HTTP route had no `priorChatSummary` field                             |
| 4   | CRITICAL | ✅ Fixed | `StreamingWorkflowArgs` had no summary field                           |
| 5   | CRITICAL | ✅ Fixed | No injection point for cross-chat summary in `buildAgentInput`         |
| 6   | HIGH     | ✅ Fixed | Race condition: summary call and navigation raced                      |
| 7   | HIGH     | ✅ Fixed | Silent degradation: summary failure continued to new chat creation     |
| 8   | MEDIUM   | ✅ Fixed | Dead `conversationContext` POST field (built, never read by backend)   |
| 9   | MEDIUM   | ✅ Fixed | `buildContextSummary` double-included last user/assistant messages     |
| 10  | MEDIUM   | ✅ N/A   | Frontend magic `MAX_CONTEXT_CHARS=4000` (dead code removed with Bug 8) |
| 11  | LOW      | ✅ Fixed | `summaryError` never rendered in UI                                    |
| 12  | LOW      | Open     | `getRollingSummary` fragile cast on `v.any()` return                   |
| 13  | MEDIUM   | ✅ Fixed | `createChat` could not seed `rollingSummary` (missing mutation param)  |
| 14  | MEDIUM   | ✅ Fixed | O(n²) `join().length` inside loop in `buildContextSummary`             |
| 15  | HIGH     | ✅ Fixed | Missing `[CONTEXT FROM PRIOR CONVERSATION]` label on injected summary  |
