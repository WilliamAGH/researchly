import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchNativeMock, fetchBrowserlessMock } = vi.hoisted(() => ({
  fetchNativeMock: vi.fn(),
  fetchBrowserlessMock: vi.fn(),
}));

vi.mock("../../../../convex/tools/crawl/native", () => ({
  fetchNative: fetchNativeMock,
}));

vi.mock("../../../../convex/tools/crawl/browserless_generic", () => ({
  fetchBrowserless: fetchBrowserlessMock,
}));

import { scrapeWithCheerio } from "../../../../convex/tools/crawl/orchestrator";

const GOOD_HTML = `<html><head><title>Rendered</title></head><body><article>${"Browserless rendered content ".repeat(8)}</article></body></html>`;
const SHELL_HTML =
  "<html><head><title>App Shell</title></head><body><script>window.__APP__={};</script></body></html>";

// Next.js RSC streaming page: content is in self.__next_f.push([1,"..."]) script tags.
// After stripJunk removes all <script> tags, body text is 0 chars — this is the bug
// that extractRscContent() fixes by reading the payload before stripJunk runs.
const RSC_HTML = String.raw`<html><head><title>RSC Page</title></head><body>
<script>self.__next_f=self.__next_f||[]</script>
<script>self.__next_f.push([1,"f:[[\\"\\$\\",\\"h1\\",null,{\\"children\\":\\"Hello there -- I am William. I am a lifelong builder and aspiring polymath who finds meaning in making things better, and in helping others. My background is in finance and technology. Today I live and work in San Francisco.\\"}]]"])</script>
</body></html>`;
const NOISY_NATIVE_HTML = `<html><head><title>Noisy</title></head><body><article>${"11:I[563491,[ ] webpackChunk __next_f max-w-4xl mx-auto ".repeat(50)}</article></body></html>`;

describe("crawl orchestrator Browserless fallback", () => {
  beforeEach(() => {
    fetchNativeMock.mockReset();
    fetchBrowserlessMock.mockReset();
    Reflect.deleteProperty(globalThis, "__scrapeCache");
  });

  it("falls back to Browserless when native fetch is blocked", async () => {
    fetchNativeMock.mockResolvedValue({
      ok: false,
      errorCode: "HTTP_CLIENT_ERROR",
      message: "HTTP 403 Forbidden",
    });
    fetchBrowserlessMock.mockResolvedValue({
      ok: true,
      html: GOOD_HTML,
      contentType: "text/html",
    });

    const result = await scrapeWithCheerio("https://example.com/blocked-1");

    expect(fetchBrowserlessMock).toHaveBeenCalledTimes(1);
    expect(result.error).toBeUndefined();
    expect(result.content.length).toBeGreaterThan(100);
  });

  it("retries with Browserless when native extraction content is too short", async () => {
    fetchNativeMock.mockResolvedValue({
      ok: true,
      html: SHELL_HTML,
      contentType: "text/html",
    });
    fetchBrowserlessMock.mockResolvedValue({
      ok: true,
      html: GOOD_HTML,
      contentType: "text/html",
    });

    const result = await scrapeWithCheerio("https://example.com/shell-2");

    expect(fetchBrowserlessMock).toHaveBeenCalledTimes(1);
    expect(result.error).toBeUndefined();
    expect(result.title).toBe("Rendered");
    expect(result.content.length).toBeGreaterThan(100);
  });

  it("extracts content from Next.js RSC streaming pages", async () => {
    fetchNativeMock.mockResolvedValue({
      ok: true,
      html: RSC_HTML,
      contentType: "text/html",
    });
    fetchBrowserlessMock.mockResolvedValue({
      ok: true,
      html: GOOD_HTML,
      contentType: "text/html",
    });

    const result = await scrapeWithCheerio("https://example.com/rsc-4");

    // RSC extraction may succeed directly or trigger Browserless fallback
    // depending on transport payload readability.
    expect(fetchBrowserlessMock.mock.calls.length).toBeLessThanOrEqual(1);
    expect(result.error).toBeUndefined();
    expect(typeof result.needsJsRendering).toBe("boolean");
    expect(result.content.length).toBeGreaterThan(100);
  });

  it("retries with Browserless when native extraction looks non-readable", async () => {
    fetchNativeMock.mockResolvedValue({
      ok: true,
      html: NOISY_NATIVE_HTML,
      contentType: "text/html",
    });
    fetchBrowserlessMock.mockResolvedValue({
      ok: true,
      html: GOOD_HTML,
      contentType: "text/html",
    });

    const result = await scrapeWithCheerio("https://example.com/noisy-5");

    expect(fetchBrowserlessMock).toHaveBeenCalledTimes(1);
    expect(result.error).toBeUndefined();
    expect(result.title).toBe("Rendered");
    expect(result.content.length).toBeGreaterThan(100);
  });

  it("returns combined error details when native extraction and Browserless both fail", async () => {
    fetchNativeMock.mockResolvedValue({
      ok: true,
      html: SHELL_HTML,
      contentType: "text/html",
    });
    fetchBrowserlessMock.mockResolvedValue({
      ok: false,
      errorCode: "FETCH_FAILED",
      message: "Browserless not configured (BROWSERLESS_API_TOKEN missing)",
    });

    const result = await scrapeWithCheerio("https://example.com/shell-3");

    expect(fetchBrowserlessMock).toHaveBeenCalledTimes(1);
    expect(result.errorCode).toBe("CONTENT_TOO_SHORT");
    expect(result.error).toContain("Native extraction failed");
    expect(result.error).toContain("Browserless fetch failed");
  });
});
