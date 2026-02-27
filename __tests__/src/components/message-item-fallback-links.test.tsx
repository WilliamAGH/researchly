/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageItem } from "../../../src/components/MessageList/MessageItem";
import { createLocalUIMessage } from "../../../src/lib/types/message";

vi.mock("@/components/ContentWithCitations", () => ({
  ContentWithCitations() {
    throw new Error("Simulated markdown rendering failure");
  },
}));

afterEach(() => {
  cleanup();
});

function renderFallbackMessage(content: string) {
  const message = createLocalUIMessage({
    id: "msg-1",
    chatId: "chat-1",
    role: "assistant",
    content,
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
}

describe("MessageItem fallback links", () => {
  it("renders normalized URLs as external links when formatted rendering fails", async () => {
    renderFallbackMessage("See https://Example.com/path for details.");

    await waitFor(() => {
      expect(
        screen.getByText("Failed to render formatted content."),
      ).toBeTruthy();
    });

    const link = await screen.findByRole("link", {
      name: "https://example.com/path",
    });

    expect(link.getAttribute("href")).toBe("https://example.com/path");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.textContent).toBe("https://example.com/path");
  });

  it("strips unmatched trailing punctuation from fallback URLs", async () => {
    renderFallbackMessage("See [source](https://Example.com/path).");

    await waitFor(() => {
      expect(
        screen.getByText("Failed to render formatted content."),
      ).toBeTruthy();
    });

    const link = await screen.findByRole("link", {
      name: "https://example.com/path",
    });

    expect(link.getAttribute("href")).toBe("https://example.com/path");
    expect(
      screen.queryByRole("link", { name: "https://example.com/path)." }),
    ).toBeNull();
    expect(screen.getByTestId("message-assistant").textContent).toContain(
      "See [source](https://example.com/path).",
    );
  });

  it("keeps balanced closing punctuation when it is part of the URL", async () => {
    renderFallbackMessage(
      "Read https://en.wikipedia.org/wiki/Function_(mathematics) next.",
    );

    await waitFor(() => {
      expect(
        screen.getByText("Failed to render formatted content."),
      ).toBeTruthy();
    });

    const link = await screen.findByRole("link", {
      name: "https://en.wikipedia.org/wiki/Function_(mathematics)",
    });

    expect(link.getAttribute("href")).toBe(
      "https://en.wikipedia.org/wiki/Function_(mathematics)",
    );
  });

  it("strips unmatched trailing square and curly brackets from fallback URLs", async () => {
    renderFallbackMessage(
      "See https://example.com/one] and https://example.com/two}.",
    );

    await waitFor(() => {
      expect(
        screen.getByText("Failed to render formatted content."),
      ).toBeTruthy();
    });

    const firstLink = await screen.findByRole("link", {
      name: "https://example.com/one",
    });
    const secondLink = await screen.findByRole("link", {
      name: "https://example.com/two",
    });

    expect(firstLink.getAttribute("href")).toBe("https://example.com/one");
    expect(secondLink.getAttribute("href")).toBe("https://example.com/two");
    expect(
      screen.queryByRole("link", { name: "https://example.com/one]" }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "https://example.com/two}" }),
    ).toBeNull();
  });
});
