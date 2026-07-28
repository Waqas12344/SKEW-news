import "server-only";

import type { Source } from "@/lib/supabase/types";

// =============================================================================
// Candidate URL filtering (§9 / §11 / §12)
//
// NON_ARTICLE_PATTERNS is the single canonical home of the non-article
// reject list (§9). Never duplicate it in other modules — reference this file.
// =============================================================================

// ---------------------------------------------------------------------------
// Non-article reject list (§9)
// Matches against the URL pathname. A URL matching any pattern is rejected.
// ---------------------------------------------------------------------------
export const NON_ARTICLE_PATTERNS: RegExp[] = [
  // Category / section pages
  /\/(categor(?:y|ies)|sections?)\//i,
  // Topic / tag pages
  /\/(topics?|tags?)\//i,
  // Author / profile pages
  /\/(authors?|profiles?|contributors?)\//i,
  // Search pages
  /\/search(\?|\/|$)/i,
  // Navigation structure (menu / footer links with no article path)
  /^\/(#.*)?$/,
  // Show / program / podcast pages
  /\/(shows?|programs?|podcasts?|episodes?)\//i,
  // Live pages
  /\/(live|live-[a-z])/i,
  /\-live(\/|$)/i,
  // Game pages
  /\/games?\//i,
  // Product / review / shopping pages
  /\/(products?|reviews?|shop|shopping|store)\//i,
  // Corporate / support pages
  /\/(about|contact|terms|privacy|corporate|support|help|faq)(\/|$)/i,
  // Newsletter / subscription pages
  /\/(newsletters?|subscri(?:be|ptions?))(\/|\?|$)/i,
  // Video-only hubs (not individual articles with text)
  /\/videos?\//i,
  // Collections / specials (Reuters, BBC)
  /\/(collections?|specials?|graphics?|interactives?)\//i,
  // Weather
  /\/weather(\/|$)/i,
  // Sport hub pages (BBC /sport landing, not individual match articles)
  /^\/sport(\/|$)/i,
];

// Tracking query params that are safe to strip (non-identity-changing)
const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "source",
  "campaign",
  "fbclid",
  "gclid",
  "msclkid",
  "cmpid",
  "cmp",
  "icid",
  "linkId",
  "mod",
  "s",
  "sr",
];

/**
 * Normalizes a URL for dedupe and filtering:
 * - Removes fragment (#...)
 * - Strips known tracking query params
 * - Removes trailing slash from the path (but not from root "/")
 */
export function normalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.hash = "";

    for (const param of TRACKING_PARAMS) {
      u.searchParams.delete(param);
    }

    // Remove trailing slash unless it's the root path
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }

    return u.href;
  } catch {
    return rawUrl;
  }
}

/**
 * Returns true if a URL should be rejected as a non-article page.
 * Checks against the non-article reject list and the source homepage.
 */
export function isRejectedUrl(url: string, sourceListingUrl: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return true; // unparseable → reject
  }

  // Reject if it is exactly the source homepage
  try {
    const normalized = normalizeUrl(url);
    const normalizedHome = normalizeUrl(sourceListingUrl);
    if (normalized === normalizedHome) return true;
  } catch {
    // fall through
  }

  // Reject very shallow paths (depth < 2 real segments — likely a section root)
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) return true;

  // Reject if path matches any non-article pattern
  for (const pattern of NON_ARTICLE_PATTERNS) {
    if (pattern.test(pathname)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Per-host article URL heuristics (§12)
// ---------------------------------------------------------------------------

interface HostPattern {
  /** Pattern that a genuine article URL must match */
  allow: RegExp;
  /** Optional patterns for paths that look like articles but should be rejected */
  deny?: RegExp[];
}

const HOST_PATTERNS: Record<string, HostPattern> = {
  "www.reuters.com": {
    // Reuters article paths: /<section>/YYYY-MM-DD/<slug>-<id>/
    allow: /\/[a-z][a-z0-9-]+\/\d{4}-\d{2}-\d{2}\/[a-z0-9-]+-[a-z0-9]{6,}/i,
  },
  "www.npr.org": {
    // NPR article paths: /YYYY/MM/DD/<digits>/<slug>
    allow: /\/\d{4}\/\d{2}\/\d{2}\/\d{6,}\//i,
  },
  "www.foxnews.com": {
    // Fox article paths: /<section>/YYYY/MM/DD/<slug>
    allow: /\/[a-z][a-z0-9-]+\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9-]+/i,
    deny: [/\/(shows?|games?|live|video|watch)\//i],
  },
  "www.bbc.com": {
    // BBC article paths: /news/<topic>-<8+ digits>  OR  /news/articles/<slug>
    allow: /\/news\/(articles\/[a-z0-9-]+|[a-z][a-z0-9-]+-\d{8,})/i,
    deny: [/\/news\/(sport|live|av|weather|video)(\/|$)/i],
  },
  "www.theguardian.com": {
    // Guardian article paths: /<section>/YYYY/mon/dd/<slug>
    allow:
      /\/[a-z][a-z0-9/-]+\/\d{4}\/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\/\d{2}\/[a-z0-9-]+/i,
  },
};

/**
 * Returns true if a URL looks like a genuine article URL for its source host.
 * Falls back to a generic heuristic (path depth ≥ 3 AND slug ≥ 20 chars).
 * When uncertain, returns false (§12: "use the stricter choice").
 */
export function isLikelyArticleUrl(url: string, sourceHostname: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const pattern = HOST_PATTERNS[sourceHostname];

  if (pattern) {
    // Must match allow pattern
    if (!pattern.allow.test(parsed.pathname)) return false;
    // Must not match any deny pattern
    if (pattern.deny) {
      for (const deny of pattern.deny) {
        if (deny.test(parsed.pathname)) return false;
      }
    }
    return true;
  }

  // Generic fallback: path depth ≥ 3 AND last path segment ≥ 20 chars
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 3) return false;
  const lastSegment = segments[segments.length - 1] ?? "";
  return lastSegment.length >= 20;
}

/**
 * Filters a list of candidate URLs:
 * 1. Normalize each URL (strip fragments, tracking params, trailing slash)
 * 2. Reject via the non-article reject list
 * 3. Reject if not a likely article URL for this source
 *
 * Returns { kept, rejectedCount }.
 */
export function filterCandidates(
  urls: string[],
  source: Source
): { kept: string[]; rejectedCount: number } {
  let sourceHostname: string;
  try {
    sourceHostname = new URL(source.listing_url).hostname;
  } catch {
    return { kept: [], rejectedCount: urls.length };
  }

  const kept: string[] = [];
  let rejectedCount = 0;

  for (const raw of urls) {
    const url = normalizeUrl(raw);

    if (isRejectedUrl(url, source.listing_url)) {
      rejectedCount++;
      continue;
    }

    if (!isLikelyArticleUrl(url, sourceHostname)) {
      rejectedCount++;
      continue;
    }

    kept.push(url);
  }

  return { kept, rejectedCount };
}
