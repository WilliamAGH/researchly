/**
 * Shared utility functions for chat operations
 */

import { normalizeWhitespace } from "../lib/text";

/** Width of the "\n" separator between joined lines (used for char-budget math). */
const NEWLINE_CHAR_WIDTH = 1;

/**
 * Build a compact context summary from messages
 * Used by summarizeRecent / summarizeRecentAction to build cross-chat context
 * and by the planner to reduce token usage
 */
export function buildContextSummary(params: {
  messages: Array<{
    role: "user" | "assistant" | "system";
    content?: string;
    timestamp?: number;
  }>;
  rollingSummary?: string;
  maxChars?: number;
}): string {
  const { messages, rollingSummary, maxChars = 1600 } = params;
  const sanitize = normalizeWhitespace;
  const recent = messages.slice(-14); // cap to last 14 turns for cost

  // Collect last 2 user turns verbatim (truncated), then last assistant, then compact older
  const lastUsers = [...recent]
    .reverse()
    .filter((m) => m.role === "user")
    .slice(0, 2)
    .reverse();
  const lastAssistant = [...recent]
    .reverse()
    .find((m) => m.role === "assistant");

  const lines: string[] = [];
  if (rollingSummary) {
    lines.push(sanitize(rollingSummary).slice(0, 800));
  }
  for (const m of lastUsers) {
    const txt = sanitize(m.content).slice(0, 380);
    if (txt) lines.push(`User: ${txt}`);
  }
  if (lastAssistant) {
    const txt = sanitize(lastAssistant.content).slice(0, 380);
    if (txt) lines.push(`Assistant: ${txt}`);
  }
  // Track raw content to avoid double-including verbatim messages below
  const includedContent = new Set<string>();
  for (const m of lastUsers) {
    if (m.content) includedContent.add(m.content);
  }
  if (lastAssistant?.content) includedContent.add(lastAssistant.content);

  // Add compact one-liners for remaining messages.
  // Track running length to avoid O(n²) join() inside the loop.
  let usedChars = lines.join("\n").length;
  for (const m of recent) {
    if (includedContent.has(m.content ?? "")) continue;
    const txt = sanitize(m.content);
    if (!txt) continue;
    let label: string;
    if (m.role === "assistant") {
      label = "Assistant";
    } else if (m.role === "user") {
      label = "User";
    } else {
      label = "System";
    }
    const line = `${label}: ${txt.slice(0, 220)}`;
    const added = (usedChars > 0 ? NEWLINE_CHAR_WIDTH : 0) + line.length;
    if (usedChars + added > maxChars) break;
    lines.push(line);
    usedChars += added;
  }
  return lines.join("\n").slice(0, maxChars);
}

/**
 * CRITICAL: This is the ONLY place where chat titles are generated.
 * All chat titles in the entire application use this 25 character limit.
 * DO NOT create alternative title generation functions.
 */
const DEFAULT_TITLE_MAX_LENGTH = 25;

/**
 * Generate a concise chat title from user intent/message
 *
 * SINGLE SOURCE OF TRUTH for all chat title generation.
 * - Default max length: 25 characters (used everywhere in the app)
 * - Removes filler words ("what is the", "tell me about", etc.)
 * - Smart word-boundary truncation
 * - Capitalizes first letter
 *
 * Frontend (src/lib/types/unified.ts:TitleUtils) only provides sanitization,
 * NOT generation. All title generation happens here.
 */
export function generateChatTitle(params: {
  intent: string;
  maxLength?: number;
}): string {
  const { intent, maxLength = DEFAULT_TITLE_MAX_LENGTH } = params;
  if (!intent) return "New Chat";

  const sanitized = normalizeWhitespace(intent.replaceAll(/<+/g, ""));
  if (!sanitized) return "New Chat";

  // Remove common question/request prefixes to expose the core topic.
  // Applied iteratively so compound openers like "Can you please tell me about X"
  // reduce fully to "X" in multiple passes.
  const QUESTION_PREFIXES = [
    "what is a ",
    "what is an ",
    "what is the ",
    "what are the ",
    "what are some ",
    "what are ",
    "what is ",
    "what's the ",
    "what's a ",
    "what's an ",
    "what's ",
    "what was ",
    "what were ",
    "how do i ",
    "how do you ",
    "how does ",
    "how would i ",
    "how would you ",
    "how can i ",
    "how to ",
    "how do ",
    "can you ",
    "can i ",
    "could you ",
    "would you ",
    "should i ",
    "give me a ",
    "give me an ",
    "give me ",
    "find me a ",
    "find me an ",
    "find me ",
    "show me ",
    "tell me about ",
    "tell me ",
    "explain the ",
    "explain ",
    "understand the ",
    "define ",
    "describe ",
    "list ",
    "please ",
    "i need a ",
    "i need an ",
    "i need ",
    "i want a ",
    "i want ",
    "definition of ",
    "meaning of ",
  ];

  let compressed = sanitized.toLowerCase();
  let prev: string;
  do {
    prev = compressed;
    for (const prefix of QUESTION_PREFIXES) {
      if (compressed.startsWith(prefix)) {
        compressed = compressed.slice(prefix.length);
        break;
      }
    }
  } while (compressed !== prev);
  compressed = compressed.trim();

  // Capitalize first letter
  if (compressed) {
    compressed = compressed.charAt(0).toUpperCase() + compressed.slice(1);
  } else {
    compressed = sanitized;
  }

  if (compressed.length <= maxLength) return compressed;

  // Smart truncation at word boundary
  const truncated = compressed.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxLength / 2)) {
    return `${truncated.slice(0, lastSpace)}...`;
  }
  return `${truncated}...`;
}
