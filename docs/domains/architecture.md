# Architecture

## High-level

- **Frontend**: React + Vite (`src/`)
- **Backend**: Convex (`convex/`)
- **Unauthenticated API**: Convex HTTP routes (`convex/http.ts` is the router entry point)
- **Authenticated chat**: Convex queries/mutations/actions + SSE streaming

## Convex Backend Taxonomy

Three mutually exclusive concern areas under `convex/`, plus cross-cutting infrastructure.

| Layer     | Purpose                                                          | Boundary                                                            |
| --------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| `tools/`  | WHAT agents can do — concrete capability implementations         | Self-contained per domain (~5-9 files)                              |
| `ai/`     | HOW we talk to LLMs — provider config, model resolution, prompts | Never fetches web content or searches                               |
| `agents/` | WHEN and WHY — workflow orchestration, streaming, definitions    | Composes `tools/` and `ai/`, never implements capabilities directly |

Cross-cutting modules:

- `lib/` — stateless shared utilities (constants, validators, URL helpers, security)
- `http/` — HTTP route handlers
- `schemas/` — canonical Zod schemas for external API boundaries ([TY1d])
- Feature domains (`chats/`, `enhancements/`, `sitemap/`) — facade + module pattern ([FS1f])

### tools/ — Capability Implementations

Each sub-folder owns its strategy types, implementations, Convex action, and OpenAI SDK tool definition:

```text
tools/
├── crawl/                          # Web page content retrieval
│   ├── types.ts                    #   FetchStrategy contract, FetchResult, FetchErrorCode
│   ├── native.ts                   #   Platform fetch() — primary strategy (~10s timeout)
│   ├── browserless_generic.ts      #   Browserless /content API — fallback for 403/blocked
│   ├── content.ts                  #   Cheerio HTML-to-text extraction (strategy-agnostic)
│   ├── orchestrator.ts             #   Strategy selection, in-memory cache, fallback logic
│   ├── action.ts                   #   Convex action entry point (scrapeUrl)
│   └── tool.ts                     #   OpenAI SDK tool definition (scrape_webpage)
│
├── search/                         # Web URL discovery
│   ├── providers/                  #   SerpAPI > OpenRouter > DuckDuckGo
│   ├── handler.ts                  #   Provider fallback chain
│   ├── cache.ts                    #   Search result cache
│   ├── utils.ts                    #   Search utilities
│   ├── action.ts                   #   Convex action (searchWeb)
│   └── tool.ts                     #   OpenAI SDK tool definition (search_web)
│
├── plan/                           # Research planning
│   ├── handler.ts                  #   Planning execution
│   ├── helpers.ts                  #   Planning utilities
│   ├── action.ts                   #   Convex action
│   └── tool.ts                     #   OpenAI SDK tool definition (plan_research)
│
└── vision/                         # Image analysis
    └── analysis.ts                 #   Vision pre-analysis for attached images
```

### ai/ — LLM Interactions

Provider configuration, model resolution, prompts, and streaming utilities:

```text
ai/
├── providers/
│   ├── openai.ts                   # OpenAI client factory
│   ├── openai_config.ts            # Model configuration
│   ├── openai_resolver.ts          # Model resolution logic
│   ├── openai_streaming.ts         # Streaming utilities
│   ├── openai_health.ts            # Health check
│   ├── openrouter_types.ts         # OpenRouter type definitions
│   └── fetch_instrumentation.ts    # Fetch instrumentation
└── prompts/
    ├── agent.ts                    # Agent system prompts
    └── search.ts                   # Search-related prompts
```

### agents/ — Orchestration

Composes `tools/` and `ai/`. Manages agent runs, streaming, and persistence:

```text
agents/
├── definitions.ts                  # Agent definitions
├── tools.ts                        # Tool registry — assembles tool arrays for agent runs
├── orchestration.ts                # Main orchestrator
├── orchestration_session.ts        # Session setup, history loading
├── orchestration_persistence.ts    # Post-run message persistence
├── orchestration_helpers.ts        # Orchestration utilities
├── workflow_conversational.ts      # Primary chat workflow
├── workflow_fast_path.ts           # Fast-path (no-search) workflow
├── workflow_parallel_path.ts       # Parallel research execution
├── workflow_instant.ts             # Instant response path
├── workflow_research.ts            # Legacy research workflow (dormant)
├── streaming_processor.ts          # SSE frame processing
├── streaming_harvest.ts            # Tool output harvesting
├── streaming_progress.ts          # Progress event emission
├── streaming_tool_events.ts        # Tool event handling
├── synthesis_executor.ts           # Synthesis prompt construction
├── parallel_research.ts            # Parallel search + scrape dispatch
├── parallel_research_scrape.ts     # Scrape phase execution
├── helpers_context.ts              # Web research source building
├── helpers_context_markdown.ts     # Source context markdown builders
├── helpers_builders.ts             # Prompt/context builders
├── input_builder.ts                # Agent input construction
├── workflow_logger.ts              # Core workflow logging
└── workflow_logger_research.ts     # Parallel research logging
```

### Feature Domains — Facade + Module Pattern

Per [FS1f], each feature domain has a **public facade** (`.ts`) and a **private module** (`/`):

```text
chats.ts                            # Facade: public API (exports only)
chats/                              # Module: domain logic (hidden implementation)
├── core.ts                         #   CRUD primitives
├── access.ts                       #   Read access validation
├── writeAccess.ts                  #   Write access and auth
├── messages.ts                     #   Message operations
└── ...
```

Same pattern applies to `enhancements.ts`/`enhancements/`, `sitemap.ts`/`sitemap/`.

## Agent Query Flow (Active Path)

One user turn, end to end:

1. Client sends `chatId` + `message` to `POST /api/ai/agent/stream`
2. HTTP route validates and sanitizes input ([`http/routes/aiAgent_stream.ts`](../../convex/http/routes/aiAgent_stream.ts))
3. [`workflow_conversational.ts`](../../convex/agents/workflow_conversational.ts) loads session, builds context, runs agent
4. Agent may call `plan_research`, `search_web`, `scrape_webpage` tools
5. Tool outputs are harvested from stream events ([`streaming_harvest.ts`](../../convex/agents/streaming_harvest.ts))
6. Harvested data becomes persisted `webResearchSources` ([`helpers_context.ts`](../../convex/agents/helpers_context.ts))
7. Assistant message + sources persisted ([`orchestration_persistence.ts`](../../convex/agents/orchestration_persistence.ts))

Detailed turn flow: [`context-pipeline.md`](./context-pipeline.md)
Scraping pipeline: [`scraping-crawling.md`](./scraping-crawling.md)

## Frontend Structure

**Pattern:** Feature-First / Colocation

```text
src/
├── components/                     # UI components (feature-grouped)
├── hooks/                          # React hooks (domain + generic)
│   ├── chatActions/                # Chat action handlers
│   └── utils/                      # Hook utilities
├── lib/                            # Shared utilities, repositories, domain logic
│   ├── repositories/               # Data access (Convex backend)
│   ├── domain/                     # Domain logic (framework-free)
│   └── utils/                      # Generic utilities
└── ...
```

## UI Notes

- Topic-change suggestions render inline; never block message input ([UI1a]).
- Status renders within chat content area, not as global overlays ([UI1b]).
