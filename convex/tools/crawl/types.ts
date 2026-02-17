"use node";

/**
 * Fetch strategy contracts for the crawl pipeline.
 * Pure types — no runtime dependencies.
 */

export type FetchErrorCode =
  | "HTTP_CLIENT_ERROR" // 4xx (403 forbidden, 401 unauthorized)
  | "HTTP_SERVER_ERROR" // 5xx
  | "TIMEOUT"
  | "NOT_HTML"
  | "FETCH_FAILED";

export type FetchResult =
  | { ok: true; html: string; contentType: string }
  | { ok: false; errorCode: FetchErrorCode; message: string };

/** A strategy that fetches raw HTML from a URL. */
export type FetchStrategy = (url: string) => Promise<FetchResult>;
