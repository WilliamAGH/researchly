import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchBrowserless } from "../../../../convex/tools/crawl/browserless_generic";

describe("browserless_generic", () => {
  const originalToken = process.env.BROWSERLESS_API_TOKEN;
  const originalBaseUrl = process.env.BROWSERLESS_BASE_URL;

  beforeEach(() => {
    process.env.BROWSERLESS_API_TOKEN = "test-token";
    process.env.BROWSERLESS_BASE_URL = "https://browserless.example";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.BROWSERLESS_API_TOKEN = originalToken;
    process.env.BROWSERLESS_BASE_URL = originalBaseUrl;
    vi.useRealTimers();
  });

  it("sends network-idle and wait directives for JS pages", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("<html><body>ready content for scrape</body></html>", {
        status: 200,
      }),
    );

    const result = await fetchBrowserless("https://example.com/page");

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, options] = fetchMock.mock.calls[0];
    // JSON.parse returns `any`; no cast needed — TypeScript already treats it as any.
    const body = JSON.parse(String(options?.body));
    expect(body.gotoOptions?.waitUntil).toBe("networkidle2");
    expect(body.waitForSelector?.selector).toContain("main");
    expect(body.waitForSelector?.visible).toBe(true);
    expect(body.waitForTimeout).toBeGreaterThan(0);
  });

  it("retries content API on 429 and succeeds on a later attempt", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("", { status: 429, statusText: "Too Many Requests" }),
      )
      .mockResolvedValueOnce(
        new Response("<html><body>retry success content</body></html>", {
          status: 200,
        }),
      );

    const resultPromise = fetchBrowserless("https://example.com/rate-limited");
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to /unblock when target site returns 403 via Browserless", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("<html><body>blocked</body></html>", {
          status: 200,
          headers: new Headers({ "X-Response-Code": "403" }),
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: "<html><body>unblocked full content text</body></html>",
          }),
          {
            status: 200,
            headers: new Headers({ "Content-Type": "application/json" }),
          },
        ),
      );

    const result = await fetchBrowserless("https://example.com/protected");

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/unblock?");
    expect(String(fetchMock.mock.calls[1][0])).toContain("proxy=residential");
  });
});
