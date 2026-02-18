"use node";

import { z } from "zod"; // v3 - required by @openai/agents peer dependency
import { tool } from "@openai/agents";
import type { FunctionTool } from "@openai/agents";
import { api } from "../../_generated/api";
import { generateMessageId } from "../../lib/id_generator";
import { getErrorMessage } from "../../lib/errors";
import { CONTENT_LIMITS } from "../../lib/constants/cache";
import {
  getActionCtx,
  type AgentToolRunContext,
} from "../../agents/tools_context";

// Must exceed native fetch timeout (10s) + Browserless fetch timeout (20s) to allow
// the full fallback pipeline to complete. Set to 35s: 10s native + 20s Browserless + 5s overhead.
const SCRAPE_TOOL_TIMEOUT_MS = 35_000;

type ScrapeToolResponse = {
  contextId: string;
  url: string;
  reasoning: string;
  title: string;
  content: string;
  summary: string;
  contentLength: number;
  scrapedAt: number;
  error?: string;
  errorMessage?: string;
  _toolCallMetadata: {
    toolName: "scrape_webpage";
    callStart: number;
    durationMs: number;
  };
};

function buildScrapeResponse(
  base: {
    contextId: string;
    url: string;
    reasoning: string;
    callStart: number;
  },
  content: {
    title: string;
    content: string;
    summary: string;
    contentLength: number;
  },
  failure?: { error: string; errorMessage: string },
): ScrapeToolResponse {
  return {
    contextId: base.contextId,
    url: base.url,
    reasoning: base.reasoning,
    title: content.title,
    content: content.content,
    summary: content.summary,
    contentLength: content.contentLength,
    scrapedAt: Date.now(),
    ...(failure
      ? { error: failure.error, errorMessage: failure.errorMessage }
      : {}),
    _toolCallMetadata: {
      toolName: "scrape_webpage",
      callStart: base.callStart,
      durationMs: Date.now() - base.callStart,
    },
  };
}

async function runScrapeActionWithTimeout(
  actionCtx: ReturnType<typeof getActionCtx>,
  url: string,
): Promise<Awaited<ReturnType<typeof actionCtx.runAction>>> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(`Scrape tool timeout after ${SCRAPE_TOOL_TIMEOUT_MS}ms`),
      );
    }, SCRAPE_TOOL_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      actionCtx.runAction(api.tools.crawl.action.scrapeUrl, { url }),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

/**
 * Web Scraping Tool
 *
 * Fetches and parses webpage content for detailed information.
 * Uses FunctionTool<any, any, unknown> per [SDK1] policy — required for SDK compatibility.
 */
// oxfmt-ignore
// oxlint-disable-next-line typescript-eslint/no-explicit-any -- Required by OpenAI Agents SDK; see docs/contracts/sdk-integration.md
export const scrapeWebpageTool: FunctionTool<any, any, unknown> = tool({  
  name: "scrape_webpage",
  description: `Fetch and parse the full content of a specific webpage. Use this when you need:
- Detailed information from a specific URL
- Content verification from official sources
- In-depth article or page content
- Information beyond search result snippets
Returns the page title, full cleaned content, and a summary.

OUTPUT FORMAT EXAMPLE:
{
  "contextId": "019a122e-....",
  "url": "https://example.com/page",
  "title": "Example Page",
  "content": "Full cleaned content...",
  "summary": "Short synopsis..."
}
Emit exactly one sourcesUsed entry with type "scraped_page" and relevance "high", copying the contextId verbatim.`,
  parameters: z.object({
    url: z
      .string()
      .regex(/^https?:\/\/\S+$/i, "Must be an http or https URL")
      .describe(
        "The complete URL to scrape. Must be http or https. Example: 'https://www.bananarepublic.com/about'",
      ),
    reasoning: z
      .string()
      .describe(
        "Brief explanation of why you need to scrape this specific URL",
      ),
  }),
  execute: async (
    input: { url: string; reasoning: string },
    ctx: AgentToolRunContext,
  ) => {
    const actionCtx = getActionCtx(ctx);
    const contextId = generateMessageId();
    const callStart = Date.now();

    console.info("SCRAPE TOOL CALLED:", {
      contextId,
      url: input.url,
      reasoning: input.reasoning,
      timestamp: new Date().toISOString(),
    });

    const base = { contextId, url: input.url, reasoning: input.reasoning, callStart };

    try {
      const content = await runScrapeActionWithTimeout(actionCtx, input.url);

      if (
        (typeof content.error === "string" && content.error.length > 0) ||
        (typeof content.errorCode === "string" && content.errorCode.length > 0)
      ) {
        const errorMessage =
          typeof content.error === "string" && content.error.length > 0
            ? content.error
            : "Unknown scrape error";
        console.warn("[WARN] SCRAPE TOOL REPORTED FAILURE:", {
          contextId,
          url: input.url,
          error: errorMessage,
          errorCode: content.errorCode,
          durationMs: Date.now() - callStart,
        });

        return buildScrapeResponse(
          base,
          {
            title: content.title,
            content: content.content,
            summary: content.summary || `Content unavailable from ${content.title}`,
            contentLength: 0,
          },
          { error: "Scrape failed", errorMessage },
        );
      }

      console.info("[OK] SCRAPE TOOL SUCCESS:", {
        contextId,
        url: input.url,
        titleLength: content.title.length,
        contentLength: content.content.length,
        durationMs: Date.now() - callStart,
      });

      return buildScrapeResponse(base, {
        title: content.title,
        content: content.content,
        summary:
          content.summary ||
          `${content.content.substring(0, CONTENT_LIMITS.SUMMARY_TRUNCATE_LENGTH)}...`,
        contentLength: content.content.length,
      });
    } catch (error) {
      console.error("[ERROR] SCRAPE TOOL ERROR:", {
        contextId,
        url: input.url,
        error: getErrorMessage(error),
        durationMs: Date.now() - callStart,
      });

      // Extract hostname for display purposes only (not business logic).
      // "unknown" is a safe fallback for UI display; the actual error is already
      // logged and preserved in errorMessage field.
      let hostname = "unknown";
      try {
        hostname = new URL(input.url).hostname;
      } catch (parseError) {
        console.warn("URL parse failed in scrape error handler", {
          url: input.url,
          error: getErrorMessage(parseError),
        });
      }

      return buildScrapeResponse(
        base,
        {
          title: hostname,
          content: `Unable to fetch content from ${input.url}`,
          summary: `Content unavailable from ${hostname}`,
          contentLength: 0,
        },
        { error: "Scrape failed", errorMessage: getErrorMessage(error, "Unknown scrape error") },
      );
    }
  },
});
