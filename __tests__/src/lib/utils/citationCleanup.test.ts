import { describe, it, expect } from "vitest";
import { cleanTrailingCitations } from "../../../../src/lib/utils/citationCleanup";

describe("cleanTrailingCitations", () => {
  const BODY =
    "Here is the answer about climate change.\n\nIt affects many regions.";

  it("returns content unchanged when no trailing citations exist", () => {
    expect(cleanTrailingCitations(BODY, new Set())).toBe(BODY);
  });

  it("strips duplicate trailing `## Sources` section", () => {
    const content = `${BODY}\n\n## Sources\n- https://example.com\n- https://other.com`;
    const cited = new Set(["https://example.com", "https://other.com"]);
    expect(cleanTrailingCitations(content, cited)).toBe(BODY);
  });

  it("strips duplicate `**References:**` bold header section", () => {
    const content = `${BODY}\n\n**References:**\n1. https://a.com\n2. https://b.com`;
    const cited = new Set(["https://a.com", "https://b.com"]);
    expect(cleanTrailingCitations(content, cited)).toBe(BODY);
  });

  it("strips duplicate numbered reference list `[1] url`", () => {
    const content = `${BODY}\n[1] https://a.com\n[2] https://b.com`;
    const cited = new Set(["https://a.com", "https://b.com"]);
    expect(cleanTrailingCitations(content, cited)).toBe(BODY);
  });

  it("strips duplicate `[1]: url` colon-style references", () => {
    const content = `${BODY}\n[1]: https://a.com\n[2]: https://b.com`;
    const cited = new Set(["https://a.com", "https://b.com"]);
    expect(cleanTrailingCitations(content, cited)).toBe(BODY);
  });

  it("rescues unique URLs as inline citation pills", () => {
    const content = `${BODY}\n\n## Sources\n- https://cited.com\n- https://unique.com`;
    const cited = new Set(["https://cited.com"]);
    const result = cleanTrailingCitations(content, cited);
    expect(result).toContain("[unique.com](https://unique.com)");
    expect(result).not.toContain("## Sources");
    expect(result).not.toContain("https://cited.com");
  });

  it("rescues multiple unique URLs", () => {
    const content = `${BODY}\n\nSources:\n- https://dup.com\n- https://new1.com\n- https://new2.com`;
    const cited = new Set(["https://dup.com"]);
    const result = cleanTrailingCitations(content, cited);
    expect(result).toContain("[new1.com](https://new1.com)");
    expect(result).toContain("[new2.com](https://new2.com)");
    expect(result).not.toContain("Sources:");
  });

  it("strips bare URL list (3+ consecutive URLs)", () => {
    const content = `${BODY}\n- https://a.com\n- https://b.com\n- https://c.com`;
    const cited = new Set(["https://a.com", "https://b.com", "https://c.com"]);
    expect(cleanTrailingCitations(content, cited)).toBe(BODY);
  });

  it("extracts clean domain from www URLs", () => {
    const content = `${BODY}\n\n## Sources\n- https://www.example.com/page`;
    const result = cleanTrailingCitations(content, new Set());
    expect(result).toContain("[example.com](https://www.example.com/page)");
  });

  it("does not modify content during streaming (empty set, no trailing)", () => {
    // This tests the integration assumption: cleanup is only called post-stream
    expect(cleanTrailingCitations(BODY, new Set())).toBe(BODY);
  });
});
