import "server-only";

// =============================================================================
// Oxylabs Web Scraper API — Realtime client (§9 / §16)
// POST https://realtime.oxylabs.io/v1/queries
// source: "universal", render: "html" — returns raw HTML in results[0].content
// =============================================================================

const OXYLABS_ENDPOINT = "https://realtime.oxylabs.io/v1/queries";
const OXYLABS_TIMEOUT_MS = 180_000;

export interface OxylabsResult {
  html: string;
  statusCode: number;
  finalUrl: string;
}

export class OxylabsError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "AUTH_FAILED"
      | "RATE_LIMITED"
      | "BAD_REQUEST"
      | "EMPTY_CONTENT"
      | "HTTP_ERROR"
      | "NETWORK_ERROR"
      | "TIMEOUT"
  ) {
    super(message);
    this.name = "OxylabsError";
  }
}

/**
 * Fetches a URL through the Oxylabs Realtime Web Scraper API.
 * Uses Basic Auth from OXY_WSA_USERNAME / OXY_WSA_PASSWORD.
 * Returns { html, statusCode, finalUrl } on success.
 * Throws OxylabsError on any failure.
 *
 * Credentials are never logged or included in thrown error messages.
 */
export async function fetchHtml(url: string): Promise<OxylabsResult> {
  const username = process.env.OXY_WSA_USERNAME;
  const password = process.env.OXY_WSA_PASSWORD;

  if (!username || !password) {
    throw new OxylabsError(
      "Oxylabs credentials are not configured (OXY_WSA_USERNAME / OXY_WSA_PASSWORD)",
      "AUTH_FAILED"
    );
  }

  const credentials = Buffer.from(`${username}:${password}`).toString("base64");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OXYLABS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(OXYLABS_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "universal",
        url,
        render: "html",
      }),
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new OxylabsError(
        `Oxylabs request timed out after ${OXYLABS_TIMEOUT_MS / 1000}s for: ${url}`,
        "TIMEOUT"
      );
    }
    throw new OxylabsError(
      `Oxylabs network error for ${url}: ${err instanceof Error ? err.message : String(err)}`,
      "NETWORK_ERROR"
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    throw new OxylabsError("Oxylabs authentication failed", "AUTH_FAILED");
  }
  if (response.status === 429) {
    throw new OxylabsError("Oxylabs rate limit exceeded", "RATE_LIMITED");
  }
  if (response.status === 400) {
    throw new OxylabsError(`Oxylabs bad request for: ${url}`, "BAD_REQUEST");
  }
  if (!response.ok) {
    throw new OxylabsError(
      `Oxylabs HTTP ${response.status} for: ${url}`,
      "HTTP_ERROR"
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new OxylabsError(
      `Oxylabs returned non-JSON response for: ${url}`,
      "HTTP_ERROR"
    );
  }

  const results = (body as { results?: unknown[] }).results;
  if (!Array.isArray(results) || results.length === 0) {
    throw new OxylabsError(
      `Oxylabs returned no results for: ${url}`,
      "EMPTY_CONTENT"
    );
  }

  const first = results[0] as {
    content?: string;
    status_code?: number;
    url?: string;
  };

  if (!first.content || first.content.trim().length === 0) {
    throw new OxylabsError(
      `Oxylabs returned empty content for: ${url}`,
      "EMPTY_CONTENT"
    );
  }

  const statusCode = first.status_code ?? 200;
  if (statusCode >= 400) {
    throw new OxylabsError(
      `Target page returned HTTP ${statusCode} for: ${url}`,
      "HTTP_ERROR"
    );
  }

  return {
    html: first.content,
    statusCode,
    finalUrl: first.url ?? url,
  };
}
