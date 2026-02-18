/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Doc } from "../../../convex/_generated/dataModel";
import { useMessageHandler } from "../../../src/hooks/useMessageHandler";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function buildChat(
  id: string,
  sessionId: string,
  userId?: string,
): Doc<"chats"> {
  return {
    _id: id as Doc<"chats">["_id"],
    _creationTime: Date.now(),
    title: "Test Chat",
    sessionId,
    userId: userId as Doc<"chats">["userId"],
    privacy: "private",
    shareId: "share_test",
    publicId: "public_test",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe("useMessageHandler regressions", () => {
  it("rethrows send errors after surfacing them", async () => {
    const sendError = new Error("Unauthorized");
    const setErrorMessage = vi.fn();
    const chatActions = {
      sendMessage: vi.fn().mockRejectedValue(sendError),
    };

    const { result } = renderHook(() =>
      useMessageHandler({
        isGenerating: false,
        currentChatId: "chat_1",
        messageCount: 0,
        chatState: {
          messages: [],
          chats: [buildChat("chat_1", "session_remote")],
        },
        setIsGenerating: vi.fn(),
        setMessageCount: vi.fn(),
        handleNewChat: vi.fn(),
        maybeShowFollowUpPrompt: vi.fn(),
        chatActions: chatActions as never,
        navigateToChat: vi.fn(),
        setErrorMessage,
      }),
    );

    await act(async () => {
      await expect(result.current.handleSendMessage("hello")).rejects.toThrow(
        "Unauthorized",
      );
    });

    expect(setErrorMessage).toHaveBeenCalled();
  });

  it("passes the selected chat sessionId to sendMessage", async () => {
    const chatActions = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    };

    const { result } = renderHook(() =>
      useMessageHandler({
        isGenerating: false,
        currentChatId: "chat_1",
        messageCount: 0,
        chatState: {
          messages: [],
          chats: [buildChat("chat_1", "session_from_chat")],
        },
        setIsGenerating: vi.fn(),
        setMessageCount: vi.fn(),
        handleNewChat: vi.fn(),
        maybeShowFollowUpPrompt: vi.fn(),
        chatActions: chatActions as never,
        navigateToChat: vi.fn(),
        setErrorMessage: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleSendMessage("hello");
    });

    expect(chatActions.sendMessage).toHaveBeenCalledWith(
      "chat_1",
      "hello",
      undefined,
      "session_from_chat",
      undefined,
    );
  });
});
