import "server-only";

import * as cheerio from "cheerio";
import type { Source } from "@/lib/supabase/types";

// =============================================================================
// Homepage candidate link extraction (§11)
// Collects visible story-card hrefs from a source homepage HTML string.
// Returns deduplicated absolute URLs on the same host as the source.
// =============================================================================

/**
 * Selectors for visible story/headline containers, ordered by specificity.
 * Nav, menu, footer, aside, and subscription regions are always excluded.
 */
const STORY_CONTAINER_SELECTORS = [
  // Generic semantic containers
  "main",
  "article",
  "#content",
  ".content",
  "#main-content",
  ".main-content",
  "[role='main']",
  // Common news homepage patterns
  ".story",
  ".stories",
  ".article-list",
  ".news-list",
  ".feed",
  ".headlines",
  ".top-stories",
  ".featured",
  ".card",
  ".cards",
  // Data-attribute patterns
  "[data-type='article']",
  "[data-testid*='story']",
  "[data-testid*='article']",
];

/**
 * Elements to remove before collecting links — nav/menu/footer/aside/subscription
 * regions that would otherwise produce non-article candidates.
 */
const EXCLUDED_SELECTORS = [
  "nav",
  "header",
  "footer",
  "aside",
  ".nav",
  ".navigation",
  ".menu",
  ".sidebar",
  ".footer",
  ".header",
  ".skip-link",
  ".breadcrumb",
  ".breadcrumbs",
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  ".newsletter",
  ".subscribe",
  ".subscription",
  ".social",
  ".social-share",
  ".cookie",
  ".cookie-banner",
  "#cookie",
  ".ad",
  ".ads",
  ".advertisement",
  "[class*='newsletter']",
  "[class*='subscribe']",
  "[class*='social-share']",
  "[class*='cookie']",
  "[class*='promo']",
];

/**
 * Extracts candidate article links from a source homepage HTML string.
 *
 * Strategy:
 * 1. Strip excluded regions (nav/footer/aside/subscription).
 * 2. Try each story container selector and collect all <a href> within them.
 * 3. Fall back to all body <a href> if no containers matched.
 * 4. Absolutize relative hrefs against the source listing_url.
 * 5. Keep only same-host, non-empty URLs.
 * 6. Return deduplicated array.
 */
export function extractCandidateLinks(
  html: string,
  source: Source
): string[] {
  const $ = cheerio.load(html);

  // Remove excluded regions so their links are never collected
  $(EXCLUDED_SELECTORS.join(", ")).remove();

  const sourceUrl = new URL(source.listing_url);
  const sourceHost = sourceUrl.hostname; // e.g. "www.reuters.com"

  const seen = new Set<string>();
  const candidates: string[] = [];

  /**
   * Absolutizes a raw href against the source base URL and validates it.
   * Returns the absolute URL string or null if it should be skipped.
   */
  function resolveHref(raw: string): string | null {
    if (!raw || raw.startsWith("javascript:") || raw.startsWith("mailto:")) {
      return null;
    }
    try {
      const absolute = new URL(raw, source.listing_url).href;
      const parsed = new URL(absolute);
      // Keep only same-host links
      if (parsed.hostname !== sourceHost) return null;
      // Strip fragment — fragments point to sections of the same page
      parsed.hash = "";
      return parsed.href;
    } catch {
      return null;
    }
  }

  function collectLinks(selector: string): void {
    $(selector).each((_i, container) => {
      $(container)
        .find("a[href]")
        .each((_j, el) => {
          const raw = $(el).attr("href") ?? "";
          const resolved = resolveHref(raw);
          if (resolved && !seen.has(resolved)) {
            seen.add(resolved);
            candidates.push(resolved);
          }
        });
    });
  }

  // Try focused story-container selectors first
  let collected = false;
  for (const selector of STORY_CONTAINER_SELECTORS) {
    if ($(selector).length > 0) {
      collectLinks(selector);
      collected = true;
    }
  }

  // Last resort: all body links
  if (!collected || candidates.length === 0) {
    $("body")
      .find("a[href]")
      .each((_i, el) => {
        const raw = $(el).attr("href") ?? "";
        const resolved = resolveHref(raw);
        if (resolved && !seen.has(resolved)) {
          seen.add(resolved);
          candidates.push(resolved);
        }
      });
  }

  return candidates;
}
