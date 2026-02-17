/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageInput } from "../../../src/components/MessageInput";

describe("MessageInput IME enter behavior", () => {
  it("prevents newline insertion when Enter is pressed during composition", async () => {
    const onSendMessage = vi.fn().mockResolvedValue(undefined);

    render(<MessageInput onSendMessage={onSendMessage} />);

    const textarea = screen.getByLabelText("Message input");
    fireEvent.change(textarea, { target: { value: "hello" } });
    fireEvent.compositionStart(textarea);

    const enterEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(enterEvent, "isComposing", { value: true });
    textarea.dispatchEvent(enterEvent);

    expect(enterEvent.defaultPrevented).toBe(true);

    fireEvent.compositionEnd(textarea);

    await waitFor(() => {
      expect(onSendMessage).toHaveBeenCalledWith("hello", undefined);
    });
  });
});
