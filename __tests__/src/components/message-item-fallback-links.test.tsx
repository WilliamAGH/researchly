/**
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageItem } from "../../../src/components/MessageList/MessageItem";
import { createLocalUIMessage } from "../../../src/lib/types/message";

vi.mock("@/components/ContentWithCitations", () => ({
  ContentWithCitations() {
    throw new Error("Simulated markdown rendering failure");
  },
}));

describe("MessageItem fallback links", () => {
  it("renders normalized URLs as external links when formatted rendering fails", async () => {
    const message = createLocalUIMessage({
      id: "msg-1",
      chatId: "chat-1",
      role: "assistant",
      content: "See https://Example.com/path for details.",
    });

    render(
      <MessageItem
        message={message}
        index={0}
        collapsedById={{}}
        hoveredSourceUrl={null}
        onToggleCollapsed={vi.fn()}
        onDeleteMessage={vi.fn()}
        onSourceHover={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Failed to render formatted content.")).toBeTruthy();
    });

    const link = await screen.findByRole("link", {
      name: "https://example.com/path",
    });

    expect(link.getAttribute("href")).toBe("https://example.com/path");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.textContent).toBe("https://example.com/path");
  });
});
