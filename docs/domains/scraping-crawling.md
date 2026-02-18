# Scraping and Crawling Pipeline

This file defines the exact active behavior for URL discovery, scraping, and source persistence in the chat pipeline.

## Black-and-White Runtime Boundaries

- `search_web` and `scrape_webpage` are executed server-side in Convex Node actions (`"use node"` in [`convex/tools/search/tool.ts`](../../convex/tools/search/tool.ts), [`convex/tools/crawl/tool.ts`](../../convex/tools/crawl/tool.ts), [`convex/tools/crawl/action.ts`](../../convex/tools/crawl/action.ts)).
- The browser never executes scraping/crawling logic.
- The frontend Docker container does not crawl websites; it proxies `/api/*` to the Convex deployment URL ([`scripts/server.mjs`](../../scripts/server.mjs), [`docs/domains/deployment.md`](./deployment.md)).
- In local dev, Vite also proxies `/api` to Convex ([`vite.config.ts`](../../vite.config.ts)).

## End-to-End Call Path (One User Turn)

1. Client sends one turn to [`/api/ai/agent/stream`](../../convex/http/routes/aiAgent_stream.ts).
2. Server runs [`streamConversationalWorkflow`](../../convex/agents/workflow_conversational.ts).
3. The model run may call [`search_web`](../../convex/tools/search/tool.ts) and [`scrape_webpage`](../../convex/tools/crawl/tool.ts) in that same run.
4. Tool outputs are harvested from stream events into memory ([`convex/agents/streaming_harvest.ts`](../../convex/agents/streaming_harvest.ts)).
5. Harvested data is transformed into persisted `webResearchSources` ([`convex/agents/helpers_context.ts`](../../convex/agents/helpers_context.ts)).

## Dev Source Context Copy Contract

- Client explicitly requests debug source markdown with `includeDebugSourceContext: true` in the stream request when running local dev UI ([`src/lib/repositories/convex/ConvexStreamHandler.ts`](../../src/lib/repositories/convex/ConvexStreamHandler.ts)).
- HTTP route forwards that flag into workflow args ([`convex/http/routes/aiAgent_stream.ts`](../../convex/http/routes/aiAgent_stream.ts)).
- Workflow passes the same flag into harvested-source transformation ([`convex/agents/workflow_conversational.ts`](../../convex/agents/workflow_conversational.ts), [`convex/agents/helpers_context.ts`](../../convex/agents/helpers_context.ts)).
- When requested, server writes `metadata.serverContextMarkdown` per source (scraped and search-result metadata variants) in `webResearchSources`.
- For every persisted `scraped_page` source, server also stores `metadata.scrapedBodyContent` (cleaned scrape body, max 12,000 chars) and `metadata.scrapedBodyContentLength` in `webResearchSources` ([`convex/agents/helpers_context.ts`](../../convex/agents/helpers_context.ts)).
- UI dev mode renders a copy icon for every source card:
  - If `metadata.serverContextMarkdown` exists, copy uses that full server-context markdown.
  - Otherwise copy uses a persisted-source snapshot markdown built from the stored `webResearchSources` record, including `scrapedBodyContent` when present ([`src/components/MessageList/MessageSources.tsx`](../../src/components/MessageList/MessageSources.tsx), [`src/lib/domain/sourceContextMarkdown.ts`](../../src/lib/domain/sourceContextMarkdown.ts)).
- Source crawl status and full-context-markdown availability are independent signals.
- Existing historical messages are not backfilled; only new assistant messages persisted after this flow include `serverContextMarkdown`.

## URL Discovery Stack (search_web)

- Directory: `convex/tools/search/` — self-contained search module.
- Provider order in active code:
  1. SerpAPI DuckDuckGo when `SERP_API_KEY` exists ([`convex/tools/search/handler.ts`](../../convex/tools/search/handler.ts)).
  2. OpenRouter search fallback ([`convex/tools/search/providers/openrouter.ts`](../../convex/tools/search/providers/openrouter.ts)).
  3. Direct DuckDuckGo fallback ([`convex/tools/search/providers/duckduckgo.ts`](../../convex/tools/search/providers/duckduckgo.ts)).
  4. Final synthetic fallback link result ([`convex/tools/search/handler.ts`](../../convex/tools/search/handler.ts)).
- Search results are cached in-process with TTL from `CACHE_TTL.SEARCH_MS` ([`convex/tools/search/cache.ts`](../../convex/tools/search/cache.ts), [`convex/lib/constants/cache.ts#L8`](../../convex/lib/constants/cache.ts#L8)).

## Scraping Stack (scrape_webpage)

- Directory: `convex/tools/crawl/` — self-contained crawl module.
- Active scrape implementation path:
  - [`scrape_webpage` tool](../../convex/tools/crawl/tool.ts)
  - [`api.tools.crawl.action.scrapeUrl`](../../convex/tools/crawl/action.ts)
  - [`scrapeWithCheerio` orchestrator](../../convex/tools/crawl/orchestrator.ts)
- **Fetch strategy pipeline** (priority order):
  1. **Native fetch** ([`convex/tools/crawl/native.ts`](../../convex/tools/crawl/native.ts)) — platform `fetch()` with 10s timeout. Zero added latency on the happy path.
  2. **Browserless fallback** ([`convex/tools/crawl/browserless_generic.ts`](../../convex/tools/crawl/browserless_generic.ts)) — Browserless `/content` API, triggered on native `HTTP_CLIENT_ERROR`, `TIMEOUT`, and `FETCH_FAILED`, plus retry after native extraction failures (`Content too short`).
  3. **Browserless anti-bot fallback** (`/unblock`) — invoked when `/content` indicates target-site 403 via `X-Response-Code`.
- HTML content extraction: [`convex/tools/crawl/content.ts`](../../convex/tools/crawl/content.ts) — Cheerio-based, strategy-agnostic.
- Strategy contracts: [`convex/tools/crawl/types.ts`](../../convex/tools/crawl/types.ts) — `FetchStrategy`, `FetchResult`, `FetchErrorCode`.
- Playwright is not available in the Convex deployment runtime.

### Browserless Configuration

- `BROWSERLESS_API_TOKEN` — Required for fallback. If absent, fallback is silently skipped and native fetch errors are returned as-is.
- `BROWSERLESS_BASE_URL` — Optional, defaults to `https://production-sfo.browserless.io`.
- Timeout constants in [`convex/lib/constants/cache.ts`](../../convex/lib/constants/cache.ts): `BROWSERLESS.PAGE_TIMEOUT_MS` (15s), `BROWSERLESS.FETCH_TIMEOUT_MS` (20s).
- Browserless request waits are configured for JS-rendered pages (`gotoOptions.waitUntil: networkidle2`, `waitForSelector`, `waitForTimeout`) to avoid early `domcontentloaded` snapshots.
- Browserless `/content` retries on transient API rate/time failures with bounded exponential backoff.

## Scrape Success/Failure Rules

- URL is validated before scraping ([`convex/tools/crawl/action.ts`](../../convex/tools/crawl/action.ts)).
- Native fetch uses a 10s timeout ([`convex/tools/crawl/native.ts`](../../convex/tools/crawl/native.ts)).
- Non-HTML responses fail (`content-type` must include `text/html`).
- Extracted content is truncated to 12,000 chars max.
- After cleanup, content shorter than 100 chars is treated as failure.
- Tool-level scrape failure is signaled via `error`/`errorMessage` or `contentLength: 0` in tool output ([`convex/tools/crawl/tool.ts`](../../convex/tools/crawl/tool.ts)).
- Harvester records failed URLs and error messages (`failedScrapeUrls`, `failedScrapeErrors`) ([`convex/agents/streaming_harvest.ts`](../../convex/agents/streaming_harvest.ts)).
- Scrape failures are non-fatal for the conversational run; they are harvested as source status metadata and do not count toward fatal workflow tool-error threshold ([`convex/agents/streaming_processor_helpers.ts`](../../convex/agents/streaming_processor_helpers.ts), [`convex/agents/streaming_processor.ts`](../../convex/agents/streaming_processor.ts)).

## What Gets Persisted (and What Does Not)

- Persisted:
  - assistant `content`
  - `webResearchSources` metadata for UI/provenance, including scrape-status flags and per-`scraped_page` body content fields (`scrapedBodyContent`, `scrapedBodyContentLength`) ([`convex/agents/workflow_conversational.ts`](../../convex/agents/workflow_conversational.ts), [`convex/agents/orchestration_persistence.ts`](../../convex/agents/orchestration_persistence.ts), [`convex/agents/helpers_context.ts`](../../convex/agents/helpers_context.ts))
- Not persisted as raw tool event logs in this path:
  - full `search_web` tool output object
  - full `scrape_webpage` tool output object
- When `includeDebugSourceContext` is requested, `webResearchSources[].metadata.serverContextMarkdown` is attached for developer inspection and UI copy workflows ([`convex/agents/helpers_context.ts`](../../convex/agents/helpers_context.ts)).

## Important Non-Guarantees

- The pipeline does not guarantee every scrape succeeds.
- A turn can still complete with partial scrape failures; failed crawl state is surfaced in source metadata ([`convex/agents/helpers_context.ts`](../../convex/agents/helpers_context.ts)).
- Low-relevance marking is metadata classification, not retroactive model-context removal ([`convex/agents/helpers_context.ts`](../../convex/agents/helpers_context.ts)).
