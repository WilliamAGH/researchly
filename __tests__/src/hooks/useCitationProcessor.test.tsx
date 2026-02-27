/**
 * @vitest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCitationProcessor } from "../../../src/hooks/utils/useCitationProcessor";
import { toDomainToUrlMap } from "../../../src/lib/domain/webResearchSources";
import type { WebResearchSourceClient } from "../../../src/lib/schemas/messageStream";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function buildSource(
  contextId: string,
  url: string,
  title: string,
): WebResearchSourceClient {
  return {
    contextId,
    type: "search_result",
    url,
    title,
    timestamp: Date.now(),
  };
}

describe("useCitationProcessor", () => {
  it("prefers exact slash-form repo citations before domain fallback", () => {
    const sources: WebResearchSourceClient[] = [
      buildSource("ctx-1", "https://github.com/org-one/repo-one", "Repo One"),
      buildSource("ctx-2", "https://github.com/org-two/repo-two/", "Repo Two"),
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

  it("maps multiple slash-form GitHub citations to the matching URLs", () => {
    const sources: WebResearchSourceClient[] = [
      buildSource("ctx-1", "https://github.com/thushan/olla", "olla"),
      buildSource("ctx-2", "https://github.com/BerriAI/litellm", "litellm"),
      buildSource(
        "ctx-3",
        "https://github.com/mylxsw/llm-gateway",
        "llm-gateway",
      ),
    ];
    const domainToUrlMap = toDomainToUrlMap(sources);

    const { result } = renderHook(() =>
      useCitationProcessor(
        "Compare [github.com/BerriAI/litellm] against [github.com/mylxsw/llm-gateway].",
        sources,
        domainToUrlMap,
      ),
    );

    expect(result.current).toContain(
      "[github.com](https://github.com/BerriAI/litellm)",
    );
    expect(result.current).toContain(
      "[github.com](https://github.com/mylxsw/llm-gateway)",
    );
    expect(result.current).not.toContain(
      "[github.com](https://github.com/thushan/olla)",
    );
  });

  it("resolves non-GitHub slash citations to their matching source URL", () => {
    const sources: WebResearchSourceClient[] = [
      buildSource("ctx-1", "https://docs.example.com/start", "Start"),
      buildSource("ctx-2", "https://docs.example.com/guides/advanced", "Guide"),
      buildSource("ctx-3", "https://docs.example.com/reference/api", "API"),
    ];
    const domainToUrlMap = toDomainToUrlMap(sources);

    const { result } = renderHook(() =>
      useCitationProcessor(
        "Read [docs.example.com/guides/advanced] and [docs.example.com/reference/api]",
        sources,
        domainToUrlMap,
      ),
    );

    expect(result.current).toContain(
      "[docs.example.com](https://docs.example.com/guides/advanced)",
    );
    expect(result.current).toContain(
      "[docs.example.com](https://docs.example.com/reference/api)",
    );
    expect(result.current).not.toContain(
      "[docs.example.com](https://docs.example.com/start)",
    );
  });

  it("keeps domain-only citations mapped to first-seen domain URL", () => {
    const sources: WebResearchSourceClient[] = [
      buildSource("ctx-1", "https://github.com/thushan/olla", "olla"),
      buildSource("ctx-2", "https://github.com/BerriAI/litellm", "litellm"),
    ];
    const domainToUrlMap = toDomainToUrlMap(sources);

    const { result } = renderHook(() =>
      useCitationProcessor("See [github.com]", sources, domainToUrlMap),
    );

    expect(result.current).toContain(
      "[github.com](https://github.com/thushan/olla)",
    );
  });
});
