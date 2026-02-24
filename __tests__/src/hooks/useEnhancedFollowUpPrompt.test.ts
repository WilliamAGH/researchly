/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEnhancedFollowUpPrompt } from "../../../src/hooks/useEnhancedFollowUpPrompt";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("useEnhancedFollowUpPrompt", () => {
  it("keeps prompt open and sets error when summary generation fails", async () => {
    const summarizeRecentAction = vi
      .fn()
      .mockRejectedValue(new Error("summary failed"));
    const handleNewChat = vi.fn().mockResolvedValue("new_chat_id");
    const sendRef = { current: vi.fn() };

    const chatState = {
      isGenerating: false,
      messages: [
        { role: "user", content: "Tell me one fact about Saturn." },
        { role: "assistant", content: "Saturn has rings." },
        { role: "user", content: "Tell me one fact about Jupiter." },
        { role: "assistant", content: "Jupiter is the largest planet." },
        { role: "user", content: "Let's switch topics to TypeScript basics." },
        {
          role: "assistant",
          content: "TypeScript adds type safety to JavaScript.",
        },
        { role: "user", content: "Let's switch topics to cooking pasta." },
        { role: "assistant", content: "Use salted water and cook al dente." },
      ],
    };

    const { result } = renderHook(() =>
      useEnhancedFollowUpPrompt({
        currentChatId: "jx7ca48hgt8fjm2j2xz6e1kpzh81gpc2",
        handleNewChat,
        sendRef,
        summarizeRecentAction,
        chatState,
      }),
    );

    expect(result.current.showFollowUpPrompt).toBe(true);

    await act(async () => {
      await result.current.handleNewChatWithSummary();
    });

    expect(summarizeRecentAction).toHaveBeenCalledTimes(1);
    expect(handleNewChat).not.toHaveBeenCalled();
    expect(result.current.showFollowUpPrompt).toBe(true);
    expect(result.current.summaryError).toBeInstanceOf(Error);
    expect(result.current.summaryError?.message).toContain("summary failed");
  });
});
