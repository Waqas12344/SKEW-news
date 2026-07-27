/**
 * Skew News — mapper layer
 * Pure functions: no DB calls, no server-only imports.
 * Converts ArticleWithRelations rows → shapes consumed by the UI.
 */

import type { ArticleWithRelations, ArticleAnalysis, BiasLabel } from "./types";
import type { ArticleCardProps } from "@/components/ui/article-card";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Splits raw article text into readable paragraphs.
 * Strips blank lines and very short fragments (nav/footer debris).
 */
export function splitParagraphs(raw: string): string[] {
  return raw
    .split(/\n{2,}|\r\n\r\n/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter((p) => p.length > 60);
}

/**
 * Derives a human-readable reading time from word count (avg 200 wpm).
 */
export function readTimeFromText(raw: string): string {
  const words = raw.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min read`;
}

/**
 * Formats an ISO timestamp to "MMM D, YYYY" in UTC.
 * e.g. "2026-05-31T00:00:00Z" → "May 31, 2026"
 */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

/**
 * Maps bias_label to a sidebar lean value.
 * left → left, right → right, everything else → center.
 */
export type Lean = "left" | "center" | "right";

export function leanFromLabel(label: string): Lean {
  if (label === "left") return "left";
  if (label === "right") return "right";
  return "center";
}

/**
 * Splits an AI summary string into bullet points.
 * Tries line breaks first; falls back to sentence boundaries.
 */
export function splitSummaryPoints(summary: string): string[] {
  const byLine = summary
    .split(/\n+/)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter((l) => l.length > 20);

  if (byLine.length >= 2) return byLine;

  // Fall back to sentence splitting
  return summary
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}

/**
 * Capitalises the first letter of a string.
 */
function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Extracts the analysis object regardless of whether Supabase returned it
 * as an array (from !inner embed) or a single object (from left join).
 */
function extractAnalysis(row: ArticleWithRelations): ArticleAnalysis | null {
  if (!row.article_analyses) return null;
  if (Array.isArray(row.article_analyses)) {
    return row.article_analyses[0] ?? null;
  }
  return row.article_analyses;
}

// ---------------------------------------------------------------------------
// toArticleCardProps — home feed
// ---------------------------------------------------------------------------

/**
 * Converts an ArticleWithRelations row to the ArticleCardProps shape
 * consumed by <ArticleCard> on the home page.
 */
export function toArticleCardProps(row: ArticleWithRelations): ArticleCardProps {
  const analysis = extractAnalysis(row);

  return {
    title: row.title,
    imageUrl: row.image_url,
    source: row.sources?.name ?? undefined,
    publishedAt: formatDate(row.published_at),
    sentimentLabel: analysis?.sentiment_label ?? undefined,
    biasLabel: (analysis?.bias_label as BiasLabel) ?? undefined,
    leftPct: analysis?.left_percentage ?? 0,
    centerPct: analysis?.center_percentage ?? 0,
    rightPct: analysis?.right_percentage ?? 0,
    confidence: analysis?.confidence ?? undefined,
    href: `/news/${row.id}`,
  };
}

// ---------------------------------------------------------------------------
// DetailData — shape mirroring what app/news/[id]/page.tsx reads
// ---------------------------------------------------------------------------

export interface SourceRef {
  name: string;
  bias: Lean;
}

export interface SourceBreakdown {
  left: number;
  leftPct: number;
  center: number;
  centerPct: number;
  right: number;
  rightPct: number;
}

export interface DetailData {
  id: string;
  title: string;
  category: string;
  region: string;
  author: string;
  publishedAt: string;
  readTime: string;
  imageUrl: string;
  imageCaption: string;
  leftPct: number;
  centerPct: number;
  rightPct: number;
  sourcesCount: number;
  overallBias: BiasLabel;
  overallBiasLabel: string;
  body: string[];
  summaryDate: string;
  summaryReadTime: string;
  summaryPoints: string[];
  analysisNote: string;
  sourceBreakdown: SourceBreakdown;
  topSources: SourceRef[];
}

/**
 * Converts an ArticleWithRelations row (analysis must be present) to the
 * DetailData shape read by app/news/[id]/page.tsx.
 */
export function toDetailData(row: ArticleWithRelations): DetailData {
  const analysis = extractAnalysis(row)!; // caller guarantees analysis exists
  const sourceName = row.sources?.name ?? "Unknown";
  const lean = leanFromLabel(analysis.bias_label);

  const leftPct = analysis.left_percentage;
  const centerPct = analysis.center_percentage;
  const rightPct = analysis.right_percentage;

  // Dominant percentage for the overall label
  const dominant = Math.max(leftPct, centerPct, rightPct);
  const overallBiasLabel = `${capitalise(analysis.bias_label)} ${dominant}%`;

  // Body paragraphs from raw_text; fall back to a single-paragraph placeholder
  const body = splitParagraphs(row.raw_text);
  const safeBody = body.length > 0 ? body : [row.raw_text.trim() || "No article text available."];

  const summaryPoints = splitSummaryPoints(analysis.summary);
  const summaryReadTime = readTimeFromText(analysis.summary);

  return {
    id: row.id,
    title: row.title,
    // category / region have no DB column yet — use source name and empty string
    category: sourceName,
    region: "",
    author: sourceName,
    publishedAt: formatDate(row.published_at),
    readTime: readTimeFromText(row.raw_text),
    imageUrl: row.image_url,
    imageCaption: row.title,
    leftPct,
    centerPct,
    rightPct,
    sourcesCount: 1,
    overallBias: analysis.bias_label as BiasLabel,
    overallBiasLabel,
    body: safeBody,
    summaryDate: row.analyzed_at ? formatDate(row.analyzed_at) : formatDate(row.scraped_at),
    summaryReadTime,
    summaryPoints: summaryPoints.length > 0 ? summaryPoints : [analysis.summary],
    analysisNote:
      analysis.disclaimer ??
      "Analysis is AI-estimated and based on article framing. It does not reflect editorial opinion.",
    sourceBreakdown: {
      left: lean === "left" ? 1 : 0,
      leftPct,
      center: lean === "center" ? 1 : 0,
      centerPct,
      right: lean === "right" ? 1 : 0,
      rightPct,
    },
    topSources: [{ name: sourceName, bias: lean }],
  };
}
