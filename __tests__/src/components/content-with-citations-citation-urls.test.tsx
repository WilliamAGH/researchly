/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContentWithCitations } from "../../../src/components/ContentWithCitations";
import type { WebResearchSourceClient } from "../../../src/lib/schemas/messageStream";

describe("ContentWithCitations citation URL set", () => {
  it("renders exact repo citation links as citation pills even when domain map points elsewhere", () => {
    const webResearchSources: WebResearchSourceClient[] = [
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

    render(
      <ContentWithCitations
        content="Compare [github.com/org-two/repo-two]"
        webResearchSources={webResearchSources}
      />,
    );

    const citation = screen.getByRole("link", { name: "github.com" });
    expect(citation.getAttribute("data-citation-url")).toBe(
      "https://github.com/org-two/repo-two/",
    );
  });
});
