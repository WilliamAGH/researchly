import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../convex/ai/providers/openai_streaming.ts", () => ({
  collectOpenRouterChatCompletionText: vi.fn(),
}));

import { collectOpenRouterChatCompletionText } from "../../../../convex/ai/providers/openai_streaming.ts";
import { searchWithOpenRouter } from "../../../../convex/tools/search/providers/openrouter.ts";

const mockCollect = vi.mocked(collectOpenRouterChatCompletionText);

beforeEach(() => {
  mockCollect.mockReset();
});

describe("openrouter provider", () => {
  it("extracts annotated citations when present", async () => {
    const completion = {
      choices: [
        {
          message: {
            content: "Answer text",
            annotations: [
              {
                type: "url_citation",
                url_citation: {
                  title: "Example",
                  url: "https://example.com",
                  content: "Snippet text",
                  start_index: 0,
                  end_index: 12,
                },
              },
            ],
          },
        },
      ],
    };

    mockCollect.mockResolvedValue({
      text: "Answer text",
      completion: completion,
    } as unknown as Awaited<
      ReturnType<typeof collectOpenRouterChatCompletionText>
    >);

    const result = await searchWithOpenRouter("test", 5);

    expect(result.results.length).toBe(1);
    expect(result.results[0]?.url).toBe("https://example.com");
    expect(result.results[0]?.title).toBe("Example");
  });

  it("falls back to URL extraction when annotations are missing", async () => {
    const completion = {
      choices: [
        {
          message: {
            content: "See https://example.org for details.",
          },
        },
      ],
    };

    mockCollect.mockResolvedValue({
      text: "See https://example.org for details.",
      completion: completion,
    } as unknown as Awaited<
      ReturnType<typeof collectOpenRouterChatCompletionText>
    >);

    const result = await searchWithOpenRouter("test", 5);

    expect(result.results.length).toBe(1);
    expect(result.results[0]?.url).toBe("https://example.org");
    expect(result.results[0]?.snippet).toContain("See https://example.org");
  });
});
