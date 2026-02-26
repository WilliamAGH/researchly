import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCitationProcessor } from "../../../src/hooks/utils/useCitationProcessor";
import { toDomainToUrlMap } from "../../../src/lib/domain/webResearchSources";
import type { WebResearchSourceClient } from "../../../src/lib/schemas/messageStream";

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
  it("maps bare domain/path citations to the matching URL, not first domain URL", () => {
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
    const content =
      "Compare [github.com/BerriAI/litellm] against [github.com/mylxsw/llm-gateway].";

    const { result } = renderHook(() =>
      useCitationProcessor(content, sources, domainToUrlMap),
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
