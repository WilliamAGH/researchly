/**
 * @vitest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCitationProcessor } from "../../../src/hooks/utils/useCitationProcessor";
import type { WebResearchSourceClient } from "../../../src/lib/schemas/messageStream";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("useCitationProcessor", () => {
  it("prefers exact slash-form repo citations before domain fallback", () => {
    const sources: WebResearchSourceClient[] = [
      {
        contextId: "ctx-1",
        type: "search_result",
        timestamp: Date.now(),
        title: "Repo One",
        url: "https://github.com/org-one/repo-one",
      },
      {
        contextId: "ctx-2",
        type: "search_result",
        timestamp: Date.now(),
        title: "Repo Two",
        url: "https://github.com/org-two/repo-two/",
      },
    ];

    const domainToUrlMap = new Map<string, string>([
      ["github.com", "https://github.com/org-one/repo-one"],
    ]);

    const { result } = renderHook(() =>
      useCitationProcessor(
        "Check [github.com/org-two/repo-two] for details.",
        sources,
        domainToUrlMap,
      ),
    );

    expect(result.current).toContain(
      "[github.com](https://github.com/org-two/repo-two/)",
    );
  });
});
