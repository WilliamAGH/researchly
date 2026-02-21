/**
 * CORS utilities for HTTP endpoints with strict origin validation.
 *
 * Security model:
 * - Origin present + valid   → response with CORS headers (cross-origin browser)
 * - Origin present + invalid → 403 (unauthorized cross-origin browser)
 * - Origin absent            → plain response (native app, same-origin, server-to-server)
 *
 * Browsers always set the Origin header for cross-origin requests (it is a
 * "forbidden" header that JavaScript cannot modify or omit). Absence of Origin
 * therefore means the request is NOT a cross-origin browser request — it is a
 * native mobile app (iOS/macOS URLSession, Android OkHttp), a server-to-server
 * call, or a same-origin navigation. These are allowed without CORS headers.
 */

/**
 * Get allowed origins from environment variable.
 * Returns null if CONVEX_ALLOWED_ORIGINS is not set (rejects cross-origin browser requests).
 */
function getAllowedOrigins(): string[] | null {
  const raw = (process.env.CONVEX_ALLOWED_ORIGINS || "").trim();
  if (!raw) {
    console.warn(
      "[WARN] CONVEX_ALLOWED_ORIGINS not set - API will reject all cross-origin requests",
    );
    return null;
  }
  const origins = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return normalizeDevOrigins(origins);
}

/**
 * Merge development convenience origins for Vite dev/preview servers.
 * Ensures all common dev ports (5173, 5174) and preview port (4173) are accepted.
 * Also includes 127.0.0.1 variants since browsers treat localhost vs 127.0.0.1 as different origins.
 */
const DEV_VITE_ORIGINS = new Set([
  // Dev server (vite dev)
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "https://localhost:5173",
  "https://localhost:5174",
  // Preview server (vite preview)
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "https://localhost:4173",
]);

const DEV_VITE_PORTS = new Set(["5173", "5174", "4173"]);

function isLocalDevOrigin(origin: string): boolean {
  // Wildcard entries (for example "*.example.com") are valid allow-list
  // patterns but not URL literals and should not be treated as malformed.
  if (origin.startsWith("*.")) {
    return false;
  }

  try {
    const url = new URL(origin);
    const isLocalhost =
      url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const isHttp = url.protocol === "http:" || url.protocol === "https:";
    return isHttp && isLocalhost && DEV_VITE_PORTS.has(url.port);
  } catch (error) {
    console.warn(
      `[WARN] Skipping invalid origin in CONVEX_ALLOWED_ORIGINS: ${origin}`,
      error,
    );
    return false;
  }
}

function normalizeDevOrigins(origins: string[]): string[] {
  const set = new Set(origins);

  // If any localhost/127.0.0.1 Vite origin is present, ensure all dev/preview ports are allowed.
  const hasLocalDevOrigin = origins.some((origin) => isLocalDevOrigin(origin));

  if (hasLocalDevOrigin) {
    for (const devOrigin of DEV_VITE_ORIGINS) {
      set.add(devOrigin);
    }
  }

  return Array.from(set);
}

/**
 * Validate a cross-origin request's Origin header against the allowlist.
 * Returns the validated origin string, or null if not allowed.
 *
 * Callers that need to distinguish "no Origin header" from "invalid Origin"
 * should check `request.headers.get("Origin")` first; this function treats
 * both cases as null.
 */
export function validateOrigin(requestOrigin: string | null): string | null {
  if (!requestOrigin) return null;

  const allowList = getAllowedOrigins();
  if (!allowList || allowList.length === 0) return null;

  if (allowList.includes(requestOrigin)) return requestOrigin;

  for (const allowed of allowList) {
    if (allowed.startsWith("*.")) {
      const domain = allowed.slice(2);
      try {
        const parsed = new URL(requestOrigin);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          continue;
        }
        if (
          parsed.hostname.endsWith(`.${domain}`) ||
          parsed.hostname === domain
        ) {
          return requestOrigin;
        }
      } catch (error) {
        console.warn("[CORS] Malformed origin rejected during wildcard check", {
          origin: requestOrigin,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
    }
  }

  console.warn(
    `[BLOCKED] Rejected request from unauthorized origin: ${requestOrigin}`,
  );
  return null;
}

/** Canonical 403 response for unauthorized or missing origins */
export function buildUnauthorizedOriginResponse(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized origin" }), {
    status: 403,
    headers: { "Content-Type": "application/json", Vary: "Origin" },
  });
}

const CORS_MAX_AGE = "600";
const DEFAULT_METHODS = "GET, POST, OPTIONS";

/** Build the shared CORS header set for a validated origin */
function buildCorsHeaders(
  validOrigin: string,
  options?: { methods?: string; allowHeaders?: string },
): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": validOrigin,
    "Access-Control-Allow-Methods": options?.methods ?? DEFAULT_METHODS,
    "Access-Control-Allow-Headers": options?.allowHeaders ?? "Content-Type",
    "Access-Control-Allow-Credentials": "false",
    "Access-Control-Max-Age": CORS_MAX_AGE,
    Vary: "Origin",
  };
}

export type CorsResponseParams = {
  body: string;
  status?: number;
  origin: string | null;
  contentType?: string;
  extraHeaders?: Record<string, string>;
};

/** HTTP status codes whose responses must not carry a body (RFC 9110) */
const NO_BODY_STATUSES = new Set([204, 205, 304]);

/** Return null when the status code forbids a body, otherwise the supplied body */
function resolveBody(body: string, status: number): string | null {
  return NO_BODY_STATUSES.has(status) ? null : body;
}

/** Build a Response with optional CORS headers (single response-construction path) */
function buildContentResponse(
  body: string,
  status: number,
  contentType: string | undefined,
  extraHeaders: Record<string, string> | undefined,
  corsHeaders?: Record<string, string>,
): Response {
  return new Response(resolveBody(body, status), {
    status,
    headers: {
      "Content-Type": contentType ?? "application/json",
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

/**
 * Build a response with CORS headers when appropriate.
 *
 * - Origin present + valid   → CORS headers attached
 * - Origin present + invalid → 403 (unauthorized cross-origin browser request)
 * - Origin absent            → plain response (native app / same-origin / direct)
 *
 * Native iOS/macOS apps (URLSession), Android, server-to-server calls, and
 * same-origin browser requests never send an Origin header. Browsers always
 * attach Origin for cross-origin requests and it cannot be forged by JS.
 */
export function corsResponse(params: CorsResponseParams) {
  const { body, status = 200, origin, contentType, extraHeaders } = params;

  if (!origin) {
    return buildContentResponse(body, status, contentType, extraHeaders);
  }

  const validOrigin = validateOrigin(origin);
  if (!validOrigin) return buildUnauthorizedOriginResponse();

  return buildContentResponse(
    body,
    status,
    contentType,
    extraHeaders,
    buildCorsHeaders(validOrigin),
  );
}

/** @deprecated Use {@link corsResponse} — it now handles both CORS and direct access. */
export const publicCorsResponse = corsResponse;

/**
 * CORS preflight response for OPTIONS requests.
 *
 * - Origin present + valid   → 204 with CORS headers
 * - Origin present + invalid → 403
 * - Origin absent            → 204 (not a browser preflight; native app / curl)
 */
export function corsPreflightResponse(request: Request, methods?: string) {
  const requestOrigin = request.headers.get("Origin");

  if (!requestOrigin) {
    return new Response(null, { status: 204 });
  }

  const validOrigin = validateOrigin(requestOrigin);
  if (!validOrigin) return buildUnauthorizedOriginResponse();

  const requested = request.headers.get("Access-Control-Request-Headers");
  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(validOrigin, {
      methods,
      allowHeaders: requested || "Content-Type",
    }),
  });
}
