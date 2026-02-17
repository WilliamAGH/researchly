/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReasoningDisplay } from "../../../src/components/ReasoningDisplay";

describe("ReasoningDisplay thinking visibility", () => {
  it("does not render the thinking component after streaming ends", () => {
    render(
      <ReasoningDisplay
        id="msg-1"
        reasoning="some reasoning"
        thinkingText="Thinking..."
        isThinkingActive={false}
        isStreaming={false}
        collapsed
        onToggle={vi.fn()}
      />,
    );

    expect(screen.queryByText("Thinking")).toBeNull();
    expect(screen.queryByLabelText("Toggle AI thinking display")).toBeNull();
  });

  it("renders while thinking is active during streaming", () => {
    render(
      <ReasoningDisplay
        id="msg-2"
        reasoning="live reasoning text"
        thinkingText="Thinking..."
        isThinkingActive
        isStreaming
        collapsed
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText("Thinking...")).not.toBeNull();
    expect(screen.getByLabelText("Toggle AI thinking display")).not.toBeNull();
  });

  it("stays visible during streaming when reasoning exists but thinking is inactive", () => {
    render(
      <ReasoningDisplay
        id="msg-3"
        reasoning="accumulated reasoning"
        thinkingText={undefined}
        isThinkingActive={false}
        isStreaming
        collapsed={false}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText("Reasoning")).not.toBeNull();
    expect(screen.getByText("accumulated reasoning")).not.toBeNull();
    expect(
      screen.getAllByLabelText("Toggle AI thinking display").length,
    ).toBeGreaterThan(0);
  });
});
