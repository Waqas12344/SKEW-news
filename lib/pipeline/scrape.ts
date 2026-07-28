import "server-only";

import { getActiveSources } from "@/lib/supabase/queries/sources";
import { articleUrlsExist, insertArticle } from "@/lib/supabase/queries/articles";
import { createLog } from "@/lib/supabase/queries/logs";
import { fetchHtml, OxylabsError } from "@/lib/scraping/oxylabs";
import { extractCandidateLinks } from "@/lib/scraping/extract";
import { filterCandidates, normalizeUrl } from "@/lib/scraping/candidate-url";
import { parseArticle } from "@/lib/scraping/article";
import type { Source, Json } from "@/lib/supabase/types";
import type {
  ScrapeOptions,
  ScrapeSummary,
  SourceRunResult,
  RejectionReason,
} from "./types";

// =============================================================================
// Pipeline constants
// =============================================================================

const DEFAULT_LIMIT_PER_SOURCE = 5;

/**
 * Cap on how many detail pages to attempt per source before stopping.
 * Generous enough that rejects don't starve the target limit.
 */
const DEFAULT_CANDIDATE_CAP = 40;

// =============================================================================
// Per-source pipeline — reused by scheduler (§18)
// =============================================================================

/**
 * Runs the shared scrape-to-insert pipeline for one source (§9).
 *
 * Takes pre-fetched homepage HTML so the scheduler (§18) can pass Oxylabs
 * job results directly instead of doing a live fetch.
 *
 * @param homepageHtml  Raw HTML of the source homepage
 * @param source        Active source record from Supabase
 * @param limitPerSource  Max valid articles to insert for this source
 * @param rejectionLog  Shared map to accumulate rejection reasons across sources
 */
export async function runSourcePipeline(
  homepageHtml: string,
  source: Source,
  limitPerSource: number,
  rejectionLog: Map<string, number>
): Promise<SourceRunResult> {
  const result: SourceRunResult = {
    sourceName: source.name,
    candidatesFound: 0,
    candidatesRejected: 0,
    duplicatesSkipped: 0,
    detailsScraped: 0,
    articlesInserted: 0,
    articlesRejected: 0,
    articlesFailed: 0,
  };

  // Step 1 — extract candidate links from homepage HTML (§11)
  const rawCandidates = extractCandidateLinks(homepageHtml, source);
  result.candidatesFound = rawCandidates.length;
  console.info(
    `[scrape:${source.name}] Candidates extracted: ${rawCandidates.length}`
  );

  // Step 2 — filter non-article URLs (§9 / §12)
  const { kept, rejectedCount } = filterCandidates(rawCandidates, source);
  result.candidatesRejected = rejectedCount;
  console.info(
    `[scrape:${source.name}] After URL filtering: ${kept.length} kept, ${rejectedCount} rejected`
  );

  if (kept.length === 0) {
    console.warn(`[scrape:${source.name}] No candidates survived filtering`);
    return result;
  }

  // Step 3 — normalize and dedupe against DB (§9 URL existence check)
  const normalizedKept = kept.map(normalizeUrl);
  const existingSet = await articleUrlsExist(normalizedKept);
  const newCandidates = normalizedKept.filter((u) => !existingSet.has(u));
  result.duplicatesSkipped = normalizedKept.length - newCandidates.length;
  console.info(
    `[scrape:${source.name}] After dedupe: ${newCandidates.length} new, ${result.duplicatesSkipped} skipped`
  );

  if (newCandidates.length === 0) {
    console.info(`[scrape:${source.name}] All candidates already in DB`);
    return result;
  }

  // Step 4 — scrape detail pages up to the candidate cap; stop once limit reached
  const toScrape = newCandidates.slice(0, DEFAULT_CANDIDATE_CAP);

  for (const candidateUrl of toScrape) {
    // Stop once we've inserted enough valid articles for this source
    if (result.articlesInserted >= limitPerSource) break;

    // --- fetch detail page ---
    let html: string;
    try {
      const fetched = await fetchHtml(candidateUrl);
      html = fetched.html;
      result.detailsScraped++;
      console.info(`[scrape:${source.name}] Scraped: ${candidateUrl}`);
    } catch (err) {
      result.articlesFailed++;
      const msg =
        err instanceof OxylabsError
          ? `Oxylabs ${err.code}`
          : err instanceof Error
          ? err.message
          : String(err);
      console.warn(`[scrape:${source.name}] Fetch failed (${msg}): ${candidateUrl}`);
      incrementRejection(rejectionLog, `fetch_failed:${err instanceof OxylabsError ? err.code : "UNKNOWN"}`);
      continue;
    }

    // --- parse + validate ---
    const parseResult = parseArticle(html, candidateUrl, source);

    if (!parseResult.ok) {
      result.articlesRejected++;
      const reason = parseResult.failure.reason;
      console.info(
        `[scrape:${source.name}] Rejected (${reason}): ${candidateUrl}`
      );
      incrementRejection(rejectionLog, reason);
      continue;
    }

    const article = parseResult.article;

    // Also dedupe by canonical URL if different from the original URL
    if (
      article.canonical_url &&
      article.canonical_url !== candidateUrl &&
      existingSet.has(article.canonical_url)
    ) {
      result.duplicatesSkipped++;
      console.info(
        `[scrape:${source.name}] Duplicate via canonical: ${article.canonical_url}`
      );
      continue;
    }

    // --- insert (append-only, §10) ---
    try {
      await insertArticle({
        source_id: article.source_id,
        url: article.url,
        canonical_url: article.canonical_url,
        title: article.title,
        image_url: article.image_url,
        published_at: article.published_at,
        raw_text: article.raw_text,
        scraped_at: new Date().toISOString(),
        analyzed_at: null,
      });
      result.articlesInserted++;
      console.info(
        `[scrape:${source.name}] Inserted: "${article.title}" — ${article.url}`
      );
    } catch (err) {
      // Unique constraint violation = duplicate already in DB — count and continue
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("duplicate") || errMsg.includes("unique")) {
        result.duplicatesSkipped++;
        console.info(`[scrape:${source.name}] Duplicate on insert: ${candidateUrl}`);
      } else {
        result.articlesFailed++;
        console.error(
          `[scrape:${source.name}] Insert failed: ${errMsg} — ${candidateUrl}`
        );
        incrementRejection(rejectionLog, "insert_failed");
      }
    }
  }

  return result;
}

// =============================================================================
// Manual scrape orchestrator (§16)
// =============================================================================

/**
 * Runs the full manual scraping pipeline (§9 + §16):
 * 1. Loads active sources from Supabase (filtered by options.sources if given).
 * 2. Fetches each homepage live through Oxylabs.
 * 3. Runs runSourcePipeline for each source.
 * 4. Aggregates results, logs summary to DB, returns ScrapeSummary.
 */
export async function runManualScrape(options: ScrapeOptions): Promise<ScrapeSummary> {
  const startTime = Date.now();
  const limitPerSource = options.limitPerSource ?? DEFAULT_LIMIT_PER_SOURCE;
  const rejectionLog = new Map<string, number>();
  const sourceResults: SourceRunResult[] = [];

  // Load sources
  let allSources = await getActiveSources();

  // Filter to requested sources if provided (match by name or UUID)
  if (options.sources && options.sources.length > 0) {
    const requested = new Set(options.sources.map((s) => s.toLowerCase()));
    allSources = allSources.filter(
      (s) =>
        requested.has(s.name.toLowerCase()) ||
        requested.has(s.id.toLowerCase())
    );
  }

  if (allSources.length === 0) {
    const summary: ScrapeSummary = {
      status: "failed",
      sourcesChecked: 0,
      candidatesFound: 0,
      candidatesRejected: 0,
      duplicatesSkipped: 0,
      detailPagesScraped: 0,
      articlesInserted: 0,
      articlesRejected: 0,
      articlesFailed: 0,
      durationMs: Date.now() - startTime,
      rejectionReasons: [],
      sourceResults: [],
    };
    console.warn("[scrape] No active sources found — aborting");
    await createLog({
      level: "warn",
      event: "scrape.summary",
      message: "No active sources found",
      context: summary as unknown as Json,
    });
    return summary;
  }

  console.info(
    `[scrape] Started — sources: ${allSources.map((s) => s.name).join(", ")} | limit: ${limitPerSource}/source`
  );

  // Process each source
  for (const source of allSources) {
    console.info(`[scrape:${source.name}] Starting — ${source.listing_url}`);

    try {
      // Fetch homepage live through Oxylabs (§16 — manual scraping always live)
      console.info(`[scrape:${source.name}] Fetching homepage via Oxylabs…`);
      const { html } = await fetchHtml(source.listing_url);
      console.info(`[scrape:${source.name}] Homepage fetched. Running pipeline…`);

      const result = await runSourcePipeline(html, source, limitPerSource, rejectionLog);
      sourceResults.push(result);

      console.info(
        `[scrape:${source.name}] Done — inserted: ${result.articlesInserted}, ` +
          `rejected: ${result.articlesRejected}, failed: ${result.articlesFailed}`
      );

      // Log source result to DB
      await createLog({
        level: result.error ? "warn" : "info",
        event: "scrape.source.completed",
        message: `${source.name}: inserted ${result.articlesInserted}`,
        source_id: source.id,
        context: result as unknown as Json,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[scrape:${source.name}] Source-level error: ${errMsg}`);

      const failedResult: SourceRunResult = {
        sourceName: source.name,
        candidatesFound: 0,
        candidatesRejected: 0,
        duplicatesSkipped: 0,
        detailsScraped: 0,
        articlesInserted: 0,
        articlesRejected: 0,
        articlesFailed: 0,
        error: errMsg,
      };
      sourceResults.push(failedResult);

      await createLog({
        level: "error",
        event: "scrape.source.error",
        message: errMsg,
        source_id: source.id,
      });

      // Continue with remaining sources (§16: resilience)
    }
  }

  // Aggregate totals
  const totals = sourceResults.reduce(
    (acc, r) => ({
      candidatesFound: acc.candidatesFound + r.candidatesFound,
      candidatesRejected: acc.candidatesRejected + r.candidatesRejected,
      duplicatesSkipped: acc.duplicatesSkipped + r.duplicatesSkipped,
      detailPagesScraped: acc.detailPagesScraped + r.detailsScraped,
      articlesInserted: acc.articlesInserted + r.articlesInserted,
      articlesRejected: acc.articlesRejected + r.articlesRejected,
      articlesFailed: acc.articlesFailed + r.articlesFailed,
    }),
    {
      candidatesFound: 0,
      candidatesRejected: 0,
      duplicatesSkipped: 0,
      detailPagesScraped: 0,
      articlesInserted: 0,
      articlesRejected: 0,
      articlesFailed: 0,
    }
  );

  const durationMs = Date.now() - startTime;

  const summary: ScrapeSummary = {
    status: "completed",
    sourcesChecked: allSources.length,
    ...totals,
    durationMs,
    rejectionReasons: buildRejectionReasons(rejectionLog),
    sourceResults,
  };

  const durationSec = (durationMs / 1000).toFixed(1);
  console.info(
    `[scrape] Completed in ${durationSec}s — ` +
      `inserted: ${totals.articlesInserted}, ` +
      `rejected: ${totals.articlesRejected}, ` +
      `failed: ${totals.articlesFailed}, ` +
      `duplicates skipped: ${totals.duplicatesSkipped}`
  );
  console.info("[scrape] Summary:", JSON.stringify(summary, null, 2));

  // Persist summary to logs table
  await createLog({
    level: "info",
    event: "scrape.summary",
    message: `Scrape completed: ${totals.articlesInserted} inserted in ${durationSec}s`,
    context: summary as unknown as Json,
  });

  return summary;
}

// =============================================================================
// Helpers
// =============================================================================

function incrementRejection(log: Map<string, number>, reason: string): void {
  // Normalise reasons to a short key so minor variations don't fragment the log
  const key = reason.length > 80 ? reason.slice(0, 80) : reason;
  log.set(key, (log.get(key) ?? 0) + 1);
}

function buildRejectionReasons(log: Map<string, number>): RejectionReason[] {
  return Array.from(log.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}
