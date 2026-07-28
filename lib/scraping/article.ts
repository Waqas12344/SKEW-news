import "server-only";

import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { Source } from "@/lib/supabase/types";
import { isRejectedUrl } from "./candidate-url";

// =============================================================================
// Article detail page parser + content gate (§13)
// =============================================================================

// Minimum accepted body quality thresholds (§13)
const MIN_PARAGRAPH_COUNT = 3;
const MIN_PARAGRAPH_CHARS = 60; // a "meaningful" paragraph
const MIN_BODY_CHARS = 900;

export interface ParsedArticle {
  url: string;
  canonical_url: string | null;
  title: string;
  image_url: string;
  published_at: string; // ISO string
  raw_text: string;
  source_id: string;
}

export interface ParseFailure {
  url: string;
  reason: string;
}

export type ParseResult =
  | { ok: true; article: ParsedArticle }
  | { ok: false; failure: ParseFailure };

// ---------------------------------------------------------------------------
// DOM removal — elements stripped before text extraction
// ---------------------------------------------------------------------------
const REMOVE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "button",
  "iframe",
  "figure",
  "figcaption",
  "picture > source", // keep <img> inside picture
  "[class*='ad']",
  "[class*='advert']",
  "[class*='sponsor']",
  "[class*='newsletter']",
  "[class*='subscribe']",
  "[class*='related']",
  "[class*='most-viewed']",
  "[class*='load-more']",
  "[class*='social']",
  "[class*='share']",
  "[class*='cookie']",
  "[class*='promo']",
  "[id*='comments']",
  "[id*='comment']",
  "[id*='sidebar']",
  "[id*='footer']",
  "[id*='header']",
  "[class*='caption']",
  "[class*='byline']",
  "[class*='dateline']",
].join(", ");

// ---------------------------------------------------------------------------
// Article body container selectors — ordered from most to least specific
// ---------------------------------------------------------------------------
const BODY_CONTAINER_SELECTORS = [
  "article .article-body",
  "article .story-body",
  "[class*='article__body']",
  "[class*='story__body']",
  "[class*='article-body']",
  "[class*='story-body']",
  "[class*='article__content']",
  "[class*='story__content']",
  "article",
  "[role='article']",
  "main",
];

// ---------------------------------------------------------------------------
// Generic category / section title patterns — titles matching these are rejected
// ---------------------------------------------------------------------------
const GENERIC_TITLE_PATTERNS = [
  /^(breaking news|latest news|top stories|home|news|politics|sports?|technology|entertainment|health|business|world|us news|opinion|lifestyle)$/i,
  /^(video|photos?|gallery|live(?: blog)?|podcast|newsletter)$/i,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMeta($: CheerioAPI, ...names: string[]): string | null {
  for (const name of names) {
    const val =
      $(`meta[property="${name}"]`).attr("content") ??
      $(`meta[name="${name}"]`).attr("content");
    if (val && val.trim()) return val.trim();
  }
  return null;
}

function extractCanonical($: CheerioAPI, fallbackUrl: string): string | null {
  const canonical =
    $('link[rel="canonical"]').attr("href") ??
    getMeta($, "og:url");
  if (!canonical) return null;
  try {
    return new URL(canonical, fallbackUrl).href;
  } catch {
    return null;
  }
}

function extractTitle($: CheerioAPI): string | null {
  const og = getMeta($, "og:title");
  if (og) return og;

  const metaName = getMeta($, "title");
  if (metaName) return metaName;

  const pageTitle = $("title").first().text().trim();
  if (pageTitle) {
    // Strip " | Site Name" or " - Site Name" suffix
    return pageTitle.replace(/\s*[|\-–—]\s*[^|\-–—]+$/, "").trim();
  }

  const h1 = $("h1").first().text().trim();
  return h1 || null;
}

function extractPublishedAt($: CheerioAPI): string | null {
  // 1. article:published_time meta
  const articleTime = getMeta($, "article:published_time");
  if (articleTime && isValidDate(articleTime)) return new Date(articleTime).toISOString();

  // 2. <time datetime="..."> — pick earliest valid ISO date
  const times: string[] = [];
  $("time[datetime]").each((_i, el) => {
    const dt = $(el).attr("datetime") ?? "";
    if (dt && isValidDate(dt)) times.push(new Date(dt).toISOString());
  });
  if (times.length > 0) {
    return times.sort()[0] ?? null; // earliest
  }

  // 3. <meta name="date">
  const metaDate = getMeta($, "date", "article:modified_time", "DC.date");
  if (metaDate && isValidDate(metaDate)) return new Date(metaDate).toISOString();

  // 4. JSON-LD datePublished
  let jsonLdDate: string | null = null;
  $('script[type="application/ld+json"]').each((_i, el) => {
    if (jsonLdDate) return;
    try {
      const raw = $(el).html() ?? "";
      const data = JSON.parse(raw) as unknown;
      const item = Array.isArray(data) ? data[0] : data;
      if (
        item &&
        typeof item === "object" &&
        "datePublished" in item
      ) {
        const dp = (item as Record<string, unknown>).datePublished;
        if (typeof dp === "string" && isValidDate(dp)) {
          jsonLdDate = new Date(dp).toISOString();
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  });
  return jsonLdDate;
}

function extractImageUrl($: CheerioAPI): string | null {
  // 1. og:image
  const og = getMeta($, "og:image");
  if (og && isValidImageUrl(og)) return og;

  // 2. twitter:image
  const tw = getMeta($, "twitter:image");
  if (tw && isValidImageUrl(tw)) return tw;

  // 3. First <img> inside article body containers
  for (const selector of BODY_CONTAINER_SELECTORS) {
    let found: string | null = null;
    $(`${selector} img`).each((_i, el) => {
      if (found) return;
      const src = $(el).attr("src") ?? $(el).attr("data-src") ?? "";
      // Skip data URIs, tracking pixels, and tiny images
      const width = parseInt($(el).attr("width") ?? "0", 10);
      if (src && !src.startsWith("data:") && (width === 0 || width >= 100)) {
        found = src;
      }
    });
    if (found) return found;
  }

  // 4. First <img> in main
  let mainImg: string | null = null;
  $("main img").each((_i, el) => {
    if (mainImg) return;
    const src = $(el).attr("src") ?? $(el).attr("data-src") ?? "";
    if (src && !src.startsWith("data:")) mainImg = src;
  });
  return mainImg;
}

function extractRawText($: CheerioAPI): string {
  // Clone so removal doesn't affect other extraction
  const $$ = cheerio.load($.html() ?? "");

  // Remove noise elements
  $$(REMOVE_SELECTORS).remove();

  // Try focused body containers first
  let paragraphs: string[] = [];
  for (const selector of BODY_CONTAINER_SELECTORS) {
    if ($$(selector).length > 0) {
      $$(selector)
        .find("p")
        .each((_i, el) => {
          const text = $$(el).text().trim();
          if (text.length > 0) paragraphs.push(text);
        });
      if (paragraphs.length > 0) break;
    }
  }

  // Broaden to all article/main/section paragraphs if needed
  if (paragraphs.join("").length < MIN_BODY_CHARS) {
    const broader: string[] = [];
    $$("article p, main p, section p, [role='article'] p").each((_i, el) => {
      const text = $$(el).text().trim();
      if (text.length > 0) broader.push(text);
    });
    if (broader.join("").length > paragraphs.join("").length) {
      paragraphs = broader;
    }
  }

  // Deduplicate consecutive identical paragraphs
  const deduped: string[] = [];
  for (const p of paragraphs) {
    if (deduped[deduped.length - 1] !== p) deduped.push(p);
  }

  // Strip paragraphs that look like nav labels or are too short
  const cleaned = deduped.filter((p) => {
    if (p.length < 20) return false;
    // Looks like a URL dump
    if (/^https?:\/\//.test(p)) return false;
    return true;
  });

  return cleaned.join("\n\n");
}

function isValidDate(value: string): boolean {
  if (!value) return false;
  const d = new Date(value);
  return !isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2100;
}

function isValidImageUrl(url: string): boolean {
  if (!url || url.startsWith("data:")) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function isTitleGeneric(title: string): boolean {
  if (title.length < 15) return true;
  for (const pattern of GENERIC_TITLE_PATTERNS) {
    if (pattern.test(title.trim())) return true;
  }
  return false;
}

function passesBodyQuality(rawText: string): boolean {
  const meaningfulParagraphs = rawText
    .split(/\n{2,}/)
    .filter((p) => p.trim().length >= MIN_PARAGRAPH_CHARS);

  if (meaningfulParagraphs.length >= MIN_PARAGRAPH_COUNT) return true;
  if (rawText.replace(/\s+/g, " ").trim().length >= MIN_BODY_CHARS) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses a scraped article detail page HTML string.
 * Applies the full extraction pipeline + content gate (§13).
 * Returns ParseResult: { ok: true, article } or { ok: false, failure }.
 */
export function parseArticle(
  html: string,
  url: string,
  source: Source
): ParseResult {
  const fail = (reason: string): ParseResult => ({
    ok: false,
    failure: { url, reason },
  });

  // Basic sanity: reject the source homepage / listing pages by URL
  if (isRejectedUrl(url, source.listing_url)) {
    return fail("url matches non-article reject list");
  }

  let $: CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch {
    return fail("failed to parse HTML");
  }

  // --- title ---
  const title = extractTitle($);
  if (!title) return fail("missing title");
  if (isTitleGeneric(title)) return fail(`generic title: "${title}"`);

  // --- canonical URL ---
  const canonicalRaw = extractCanonical($, url);
  // Reject if canonical points at a listing/category/program/product page
  if (canonicalRaw && isRejectedUrl(canonicalRaw, source.listing_url)) {
    return fail(`canonical URL is a non-article page: ${canonicalRaw}`);
  }
  const canonical_url = canonicalRaw;

  // --- published_at (required, §13) ---
  const published_at = extractPublishedAt($);
  if (!published_at) return fail("missing published_at");

  // --- image_url (required, §13) ---
  const image_url = extractImageUrl($);
  if (!image_url) return fail("missing image_url");

  // --- raw_text + content gate ---
  const raw_text = extractRawText($);
  if (!passesBodyQuality(raw_text)) {
    return fail(
      `body quality gate failed: ${raw_text.length} chars, ` +
        `${raw_text.split(/\n{2,}/).filter((p) => p.length >= MIN_PARAGRAPH_CHARS).length} meaningful paragraphs`
    );
  }

  return {
    ok: true,
    article: {
      url,
      canonical_url,
      title,
      image_url,
      published_at,
      raw_text,
      source_id: source.id,
    },
  };
}
