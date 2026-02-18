# LOC Extraction Plan — Files Over 325 Lines

Files approaching or exceeding the 350 LOC hard cap ([LOC1a]).
Each extraction follows SRP ([MO1d]) and the clean-code skill's [FN2] rule.

## Completed — P0 and P1

All P0 and P1 extractions have been applied.

| #   | File                                 | Was | Extracted To                    | Now   |
| --- | ------------------------------------ | --- | ------------------------------- | ----- |
| 1   | `convex/agents/parallel_research.ts` | 351 | `parallel_research_scrape.ts`   | 270   |
| 2   | `convex/agents/helpers_context.ts`   | 350 | `helpers_context_markdown.ts`   | < 325 |
| 3   | `convex/agents/workflow_logger.ts`   | 347 | `workflow_logger_research.ts`   | < 325 |
| 4   | `src/hooks/useChatActions.ts`        | 344 | `chatActions/uiStateActions.ts` | < 325 |
| 5   | `convex/lib/security/webContent.ts`  | 342 | `webContent_url.ts`             | 301   |
| 6   | `convex/chats/core.ts`               | 341 | `access.ts`                     | 301   |

## P2 — 326-340 LOC (fix when touching these files)

### 7. `src/hooks/useMessageListScroll.ts` (334 LOC)

**Extract**: Unseen message tracking (~30 LOC) → `src/hooks/useUnseenMessageCount.ts`

- Unseen count state, tracking logic
- Result: ~304 LOC

### 8. `convex/lib/url.ts` (332 LOC)

**Extract**: IP parsing utilities (~160 LOC) → `convex/lib/url_ip.ts`

- IPv4/IPv6 parsing, private/localhost detection, IP range constants
- Biggest win: reduces `url.ts` to ~172 LOC
- Result: Two focused files each well under 200 LOC

### 9. `src/components/MessageInput.tsx` (332 LOC)

**Extract**: Keyboard/event handlers (~43 LOC) → `src/hooks/useMessageInputKeyboard.ts`

- `handleKeyDown` with IME composition handling, Enter-to-send, history navigation
- Follows existing pattern: `src/hooks/useMessageInputFocus.ts` is already a sibling hook
- Do NOT create `src/components/MessageInput/` directory — hooks belong in `hooks/`
- Result: ~289 LOC

### 10. `src/components/MessageList/index.tsx` (332 LOC)

**Extract**: Collapse state management (~45 LOC) → `src/components/MessageList/useCollapseState.ts`

- `collapsedById` state, auto-collapse effect, `toggleCollapsed`
- Result: ~287 LOC

### 11. `convex/chats/schemaNormalization.ts` (331 LOC)

**Extract**: Comparison utilities (~30 LOC) → `convex/chats/schemaNormalization_utils.ts`

- `canonicalizeForComparison`, `stableStringify`, `hasCanonicalSourceDiff`
- Result: ~301 LOC

### 12. `src/components/ChatSidebar.tsx` (329 LOC)

**Extract**: Delete confirmation flow (~60 LOC) → `src/hooks/useChatSidebarDeletion.ts`

- `executeDeleteChat` utility, `deleteTargetId`/`deleteError` state, confirm/cancel handlers
- Follows existing pattern: `useDeletionHandlers.ts` and `useSessionAwareDeleteChat.ts` already in `hooks/`
- Do NOT create `src/components/ChatSidebar/` directory — deletion hooks belong in `hooks/`
- Result: ~269 LOC

## Summary

| Priority  | Count  | Status                              |
| --------- | ------ | ----------------------------------- |
| P0        | 2      | Complete                            |
| P1        | 4      | Complete                            |
| P2        | 6      | Fix on next touch — all 329-334 LOC |
| **Total** | **12** | 6 done, 6 remaining                 |

## Verification

After each extraction:

- `npm run lint:loc` must pass
- `npm run typecheck` must pass
- `npm run lint` must pass
- `npm run lint:convex-imports` must pass (for convex/ files)
