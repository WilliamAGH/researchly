# Researchly iOS/macOS Client — Content Rendering Specification

> **Audience**: Swift team building the native Apple client.
> **Purpose**: Reproduce the web frontend's content formatting and rendering pipeline in SwiftUI.

---

## 1. Architecture Overview

The Convex Swift client (`ConvexMobile`) handles data transport via WebSocket. The HTTP endpoints (SSE streaming at `/api/ai/agent/stream`, search, scrape, publish) are also accessible from `URLSession` — no `Origin` header is required from native apps.

All assistant content arrives as **Markdown** (GitHub Flavored Markdown). The rendering pipeline is:

```
Raw Markdown Content
  → Citation Processing (pattern replacement)
  → Trailing Citation Cleanup (post-stream only)
  → Markdown Rendering (GFM + line breaks)
  → HTML Sanitization
  → Custom Element Rendering (citation pills, tables, code blocks)
```

---

## 2. Data Models

### 2.1 Message

```
Message {
  _id: String                              // Convex document ID (string-backed)
  chatId: String
  role: "user" | "assistant" | "system"
  content: String                          // Markdown text (assistant) or plain text (user)
  timestamp: Number                        // Unix millis
  isStreaming: Boolean?                    // true while SSE stream is active
  reasoning: String?                       // LLM thinking/reasoning text
  thinking: String?                        // Transient "Thinking..." label during reasoning phase
  workflowId: String?
  webResearchSources: [WebResearchSource]? // Sources used for this response
  imageStorageIds: [String]?               // Convex storage IDs for user-attached images
  persisted: Boolean?                      // true after server confirms DB write
}
```

### 2.2 WebResearchSource

```
WebResearchSource {
  contextId: String       // UUIDv7 — stable identifier
  type: "search_result" | "scraped_page" | "research_summary"
  url: String?            // The source URL
  title: String?
  timestamp: Number       // Unix millis
  relevanceScore: Number? // 0.0–1.0
  metadata: {
    crawlAttempted: Boolean?
    crawlSucceeded: Boolean?
    crawlErrorMessage: String?
    markedLowRelevance: Boolean?
    relevanceThreshold: Number?
    scrapedBodyContent: String?       // Full scraped page text (dev inspection)
    scrapedBodyContentLength: Number?
  }?
}
```

### 2.3 SearchProgress (Workflow Status)

```
SearchProgress {
  stage: "idle" | "thinking" | "planning" | "searching" | "scraping"
         | "analyzing" | "generating" | "finalizing"
  message: String?
  urls: [String]?          // URLs being processed
  currentUrl: String?      // Currently active URL
  queries: [String]?       // Search queries being executed
  sourcesUsed: Number?
  toolReasoning: String?   // LLM reasoning for this tool call
  toolQuery: String?       // Search query being executed
  toolUrl: String?         // URL being scraped
}
```

---

## 3. SSE Streaming Protocol

### 3.1 Connection

```
POST /api/ai/agent/stream
Content-Type: application/json

Body: {
  "message": "user query text",
  "chatId": "<convex chat ID>",
  "sessionId": "<optional UUIDv7>",
  "webResearchSources": [...],            // optional prior sources
  "imageStorageIds": ["<storage_id>"],    // optional image attachments
  "priorChatSummary": "..."              // optional context
}
```

Response: `text/event-stream; charset=utf-8`

### 3.2 Event Types

Each line is `data: {JSON}\n\n`. The stream ends with `data: [DONE]\n\n`.

| Event Type       | Key Fields                                                                                                         | Description                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `workflow_start` | `workflowId`                                                                                                       | Workflow initialized                                                         |
| `progress`       | `stage`, `message`, `toolReasoning?`, `toolQuery?`, `toolUrl?`, `queries?`, `urls?`, `currentUrl?`, `sourcesUsed?` | Status updates during research                                               |
| `reasoning`      | `content`                                                                                                          | LLM thinking/reasoning text (accumulate, don't replace)                      |
| `content`        | `content?`, `delta?`                                                                                               | Answer text chunks — **append** `delta` (or `content`) to accumulated buffer |
| `metadata`       | `metadata.workflowId?`, `metadata.webResearchSources?`                                                             | Final sources list                                                           |
| `complete`       | `workflow?`                                                                                                        | Workflow finished, awaiting persistence                                      |
| `persisted`      | `payload.assistantMessageId`, `payload.answer`, `payload.workflowId`, `payload.webResearchSources`                 | Authoritative DB-persisted data — replace local message with this            |
| `error`          | `error`                                                                                                            | Error message                                                                |

### 3.3 State Machine

```
idle → workflow_start → progress* → reasoning* → content* → metadata → complete → persisted
```

- `progress` events can interleave with `reasoning`
- `content` chunks arrive after research completes
- `metadata` arrives near end with final sources
- `persisted` is the final authoritative state — replace accumulated content with `payload.answer`

---

## 4. Content Rendering Rules

### 4.1 User Messages

- Render as **plain text** with `whitespace-pre-wrap` (preserve line breaks and whitespace)
- No markdown processing
- If `imageStorageIds` exist, render image thumbnails (max 300×300pt) above the text

### 4.2 Assistant Messages — Markdown

Render with **GitHub Flavored Markdown** (GFM) plus these extensions:

#### Supported Elements

| Element                    | Rendering                                                                   |
| -------------------------- | --------------------------------------------------------------------------- |
| Paragraphs                 | Standard, margin: 0.5rem top, 0.75rem bottom                                |
| Headings (h1–h6)           | Standard heading sizes                                                      |
| Bold (`**text**`)          | Semibold (bold in dark mode for contrast)                                   |
| Italic (`*text*`)          | Standard italic                                                             |
| Underline (`<u>text</u>`)  | Underline decoration                                                        |
| Strikethrough (`~~text~~`) | GFM strikethrough                                                           |
| Links (`[text](url)`)      | Tappable, open in external browser, `noopener noreferrer`                   |
| Unordered lists            | Disc bullets, 1.25rem left padding                                          |
| Ordered lists              | Decimal numbers, 1.25rem left padding                                       |
| Blockquotes                | 4px left border (primary color), 1rem left padding, italic                  |
| Horizontal rules           | Standard separator line                                                     |
| Inline code (`` `code` ``) | Monospace font, muted background, rounded corners                           |
| Code blocks (` ``` `)      | Monospace font, muted background, horizontal scroll, NO syntax highlighting |
| Tables (GFM)               | Scrollable container, border-collapse, alternating row backgrounds          |
| Line breaks                | Single newline = `<br>` (via remark-breaks)                                 |

#### Typography

- Body text inherits page font (user can toggle between serif and monospace)
- Serif: "Playfair Display", Georgia, "Times New Roman", serif
- Monospace (toggle): "JetBrains Mono", "SF Mono", Monaco, Inconsolata, monospace
- Code blocks always use: "JetBrains Mono", "Fira Code", monospace
- Numeric style: `lining-nums` (tabular figures)
- Long unbroken strings (URLs, tokens): word-wrap at any point

#### Dark Mode

- Normal paragraph/list text: 85% foreground opacity
- Bold text: full opacity + font-bold weight
- Links and code: full foreground opacity
- Table headers: slightly darker background
- Alternate table rows: subtle background tint

### 4.3 HTML Sanitization

Only these HTML tags are allowed in rendered markdown (strip everything else):

```
p, ul, ol, li, strong, em, del, u, br, hr,
h1, h2, h3, h4, h5, h6,
pre, code, blockquote, span,
table, thead, tbody, tr, th, td,
a (href, target, rel only)
code (className only)
```

**Blocked**: `<script>`, `<style>`, `<iframe>`, `<img>` (in markdown), `<form>`, event handlers, `javascript:` URLs.

---

## 5. Citation System

### 5.1 Citation Processing Pipeline

Citations connect inline text references to the `webResearchSources` attached to each message.

**Step 1 — Build domain-to-URL map**:

- Deduplicate sources by normalized URL (strip `www.`, trailing slashes, fragments)
- Priority: `scraped_page` > failed crawls > `search_result`
- Map each unique hostname → first-seen full URL

**Step 2 — Pattern replacement** (runs on raw markdown before rendering):

- Regex: `\[([^\]]+)\](?:\(([^)]+)\))?`
- Handles these input patterns:
  - `[domain.com]` → `[domain.com](matched_url)`
  - `[https://example.com/path]` → `[example.com](https://example.com/path)`
  - `[domain.com](url)` → normalize domain display, keep URL
  - `[github.com/user/repo]` → extract domain, find matching URL
- If no matching URL in sources → leave the original text unchanged

**Step 3 — Trailing citation cleanup** (post-stream only, NOT during streaming):

- Scan the last 2000 characters for LLM-appended citation sections
- Detect and remove these patterns:
  - `## Sources` / `### References` headings with content below
  - `**Sources:**` bold sections
  - `Sources:` with bullet/numbered lists
  - Numbered reference lists: `[1] https://...`
  - 3+ consecutive bare URL lines
- Extract URLs from removed section
- URLs already cited inline → discard
- Unique URLs → re-add as inline citation pills: `[domain.com](url)`

### 5.2 Citation Pill Rendering

When a link's URL matches a source in `webResearchSources`, render it as a **citation pill** instead of a regular link:

**Visual spec**:

- Inline-flex container with rounded corners (6pt radius)
- Horizontal padding: 6pt, vertical padding: 2pt, horizontal margin: 4pt
- Background: light gray (dark mode: dark gray)
- Text: gray-600 (dark mode: gray-400)
- Font: medium weight, same size as body
- Max text width: min(200pt, 40% viewport width) with ellipsis truncation
- External link icon (3×3 unit SVG arrow) at trailing edge, 60% opacity
- Tappable → open URL in external browser

**Hover/highlight state** (for synchronized highlighting with source cards):

- Background: yellow-200 (dark mode: yellow-900/50)
- Text: yellow-900 (dark mode: yellow-200)
- Ring: 2pt yellow-400 border

**Domain display**: Strip protocol (`https://`) and `www.` prefix. Show just `example.com`.

### 5.3 Source Cards

Sources appear in a collapsible section above the message content.

**Collapsed state**: Show first 3 sources as small preview badges (favicon + domain).

**Expanded state**: Grid of source cards, each showing:

- **Favicon**: Deterministic SVG icon generated from hostname (NOT fetched from web)
  - 16×16 rounded rect, hue derived from `hash(hostname) % 360`
  - White letter (first char of hostname) centered
- **Title**: Source page title (fallback to hostname)
- **Domain**: Extracted hostname
- **Badges** (optional):
  - Relevance: "High" (green) if relevanceScore > 0.7, "Med" if > 0.4
  - Type: "Crawled" (blue) if `scraped_page`, "Summary" if `research_summary`
  - Crawl failure: "Failed" (red) if `crawlAttempted && !crawlSucceeded`

**Favicon generation algorithm** (no external requests):

```
hue = (hash(hostname) % 360)
fill = HSL(hue, 62%, 42%)
stroke = HSL((hue + 35) % 360, 58%, 30%)
initial = first alphanumeric char of hostname, uppercased (or "?")
→ Render 16×16 rounded-rect SVG with centered letter
```

---

## 6. Reasoning/Thinking Display

When `reasoning` text exists on a message:

- Show in a collapsible panel above the main content
- **Collapsed**: Show last 140 characters of reasoning as preview
- **Expanded**: Full reasoning text (plain text, not markdown)
- **During streaming** (`isStreaming && thinking`):
  - Show animated spinner/indicator
  - Append blinking cursor character `▊` to end of reasoning text
- Label: "Thinking" or "Reasoning"

---

## 7. Progress Indicators

During streaming, show workflow progress based on `SearchProgress.stage`:

| Stage        | Icon      | Label     | Description                    |
| ------------ | --------- | --------- | ------------------------------ |
| `thinking`   | Brain     | Thinking  | Processing your request...     |
| `planning`   | Clipboard | Planning  | Analyzing research needs...    |
| `searching`  | Search    | Searching | Finding relevant sources...    |
| `scraping`   | Globe     | Reading   | Extracting page content...     |
| `analyzing`  | Chart     | Analyzing | Processing research data...    |
| `generating` | Pencil    | Writing   | Composing your answer...       |
| `finalizing` | Check     | Saving    | Saving and securing results... |

Show `toolQuery` (search query) or `toolUrl` (URL being scraped) as secondary text when available. Show `toolReasoning` as tertiary text.

---

## 8. Image Attachments

User messages may have `imageStorageIds` — Convex storage IDs for uploaded images.

- Fetch URLs via Convex `storage.getUrl(storageId)` (or batch query)
- Display as thumbnails: max 300×300pt, maintain aspect ratio
- Show loading skeleton while fetching
- Show error placeholder if image fetch fails or image is deleted
- Images appear above the message text

---

## 9. Copy/Export & Overflow

**Copy format**: `"User: <text>\nAssistant: <text>\nSources:\n  • Title: URL"`.
Strip markdown tags to plain text. Include sources after each assistant message.

**Overflow protection** (critical for all content containers):

- Long unbroken strings (URLs, base64, hashes): word-wrap at any point
- Tables: horizontal scroll container, prevent layout expansion
- Code blocks: horizontal scroll, max-width 100%, `overscroll-behavior-x: contain`
- Citation pills: max-width `min(200pt, 40% screen)`, text ellipsis truncation
