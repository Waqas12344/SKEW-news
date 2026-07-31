import "server-only";

// =============================================================================
// AI analysis pipeline orchestrator (§19 + §20)
// =============================================================================

import {
  getPendingArticles,
  getPendingEmbeddings,
  saveAnalysis,
  saveEmbedding,
} from "@/lib/supabase/queries/articles";
import { createLog } from "@/lib/supabase/queries/logs";
import { analyzeArticle, generateEmbedding } from "@/lib/ai/analyze-article";
import type { InsertArticleAnalysis, Json } from "@/lib/supabase/types";
import type { AnalyzeOptions, AnalysisSummary } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BATCH_SIZE = 5;

function getBatchSize(): number {
  const env = process.env.ANALYSIS_BATCH_SIZE;
  if (!env) return DEFAULT_BATCH_SIZE;
  const parsed = parseInt(env, 10);
  return isNaN(parsed) || parsed < 1 ? DEFAULT_BATCH_SIZE : parsed;
}

// ---------------------------------------------------------------------------
// Percentage normalization — largest-remainder rounding (§19 decision 7)
// Ensures left + center + right = exactly 100, satisfying the DB CHECK.
// ---------------------------------------------------------------------------

export function normalizePct(
  left: number,
  center: number,
  right: number
): { left: number; center: number; right: number } {
  const total = left + center + right;
  if (total === 0) return { left: 34, center: 33, right: 33 };

  // Scale to 100
  const scaled = [
    { key: "left" as const, raw: (left / total) * 100 },
    { key: "center" as const, raw: (center / total) * 100 },
    { key: "right" as const, raw: (right / total) * 100 },
  ];

  // Floor each value
  const floored = scaled.map((x) => ({ ...x, floor: Math.floor(x.raw) }));
  const remainder = 100 - floored.reduce((s, x) => s + x.floor, 0);

  // Distribute remainder to the items with the largest fractional parts
  const sorted = [...floored].sort(
    (a, b) => b.raw - b.floor - (a.raw - a.floor)
  );
  for (let i = 0; i < remainder; i++) {
    sorted[i]!.floor += 1;
  }

  const result = { left: 0, center: 0, right: 0 };
  for (const item of floored) {
    result[item.key] = item.floor;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * Runs the full AI analysis + embedding pipeline (§19 + §20):
 * 1. Loads all pending articles (LEFT JOIN, no analysis row).
 * 2. Filters/limits per options.
 * 3. Processes in batches — analysis + embedding together per article.
 * 4. Saves analysis row (with embedding) + sets analyzed_at only on success.
 * 5. After the main loop, runs a backfill pass for articles that have an
 *    analysis row but no embedding (e.g. articles analyzed before §20).
 * 6. Logs progress + final summary.
 * Returns AnalysisSummary.
 */
export async function runAnalysis(options: AnalyzeOptions): Promise<AnalysisSummary> {
  const startTime = Date.now();
  const batchSize = getBatchSize();

  const failures: AnalysisSummary["failures"] = [];
  let analyzed = 0;
  let failed = 0;
  let batchCount = 0;
  let embeddingsGenerated = 0;
  let embeddingsFailed = 0;

  // -------------------------------------------------------------------------
  // Step 1 — load pending articles (no analysis row)
  // -------------------------------------------------------------------------
  let pending = await getPendingArticles();

  // Step 2 — apply articleIds filter
  if (options.articleIds && options.articleIds.length > 0) {
    const idSet = new Set(options.articleIds);
    pending = pending.filter((a) => idSet.has(a.id));
  }

  // Step 3 — apply limit
  if (options.limit !== undefined && options.limit > 0) {
    pending = pending.slice(0, options.limit);
  }

  const pendingFound = pending.length;
  console.info(`[analyze] Started — pending: ${pendingFound} articles`);

  if (pendingFound === 0) {
    console.info("[analyze] No new articles to analyze — checking embedding backfill...");
  } else {
    // -----------------------------------------------------------------------
    // Step 4 — process in batches (analysis + embedding together)
    // -----------------------------------------------------------------------
    const totalBatches = Math.ceil(pendingFound / batchSize);

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const batch = pending.slice(batchIdx * batchSize, (batchIdx + 1) * batchSize);
      batchCount++;

      let batchAnalyzed = 0;
      let batchFailed = 0;

      for (const article of batch) {
        console.info(`[analyze] Processing: "${article.title}" (${article.id})`);

        try {
          // -- Analysis (with one retry) -------------------------------------
          let result = await analyzeArticle(article);

          if (!result.success) {
            console.warn(`[analyze] Retrying analysis: "${article.title}" — ${result.error}`);
            result = await analyzeArticle(article);
          }

          if (!result.success) {
            console.warn(`[analyze] Analysis failed: "${article.title}" — ${result.error}`);
            failures.push({ articleId: article.id, title: article.title, error: result.error });
            batchFailed++;
            failed++;
            continue;
          }

          // -- Normalize percentages (§19 decision 7) -----------------------
          const pct = normalizePct(
            result.output.leftPercentage,
            result.output.centerPercentage,
            result.output.rightPercentage
          );

          // -- Derive bias_score (§19 decision 6) ---------------------------
          const biasScore =
            Math.round(((pct.right - pct.left) / 100) * 1000) / 1000;

          // -- Generate embedding (§20) -------------------------------------
          console.info(`[analyze] Embedding: "${article.title}"`);
          let embeddingValue: number[] | null = null;
          const embResult = await generateEmbedding(article);
          if (embResult.success) {
            embeddingValue = embResult.embedding;
            embeddingsGenerated++;
          } else {
            // Embedding failure is non-fatal — analysis still saves; backfill picks it up
            console.warn(`[analyze] Embedding failed (will backfill): "${article.title}" — ${embResult.error}`);
            embeddingsFailed++;
          }

          // -- Build insert row (camelCase → snake_case) --------------------
          const insert: InsertArticleAnalysis = {
            article_id: article.id,
            summary: result.output.summary,
            sentiment_score: result.output.sentimentScore,
            sentiment_label: result.output.sentimentLabel,
            bias_score: biasScore,
            bias_label: result.output.politicalFramingLabel,
            left_percentage: pct.left,
            center_percentage: pct.center,
            right_percentage: pct.right,
            confidence: result.output.confidence,
            framing_notes: result.output.framingNotes,
            loaded_terms: result.output.loadedTerms,
            disclaimer: result.output.disclaimer,
            model: result.model,
            embedding: embeddingValue,
          };

          // -- Save — analyzed_at set only after insert succeeds (§19 / §20) --
          await saveAnalysis(article.id, insert);

          console.info(`[analyze] Saved: "${article.title}"`);
          batchAnalyzed++;
          analyzed++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[analyze] Error on "${article.title}": ${message}`);
          failures.push({ articleId: article.id, title: article.title, error: message });
          batchFailed++;
          failed++;
        }
      }

      console.info(
        `[analyze] Batch ${batchCount}/${totalBatches} complete — ` +
          `analyzed: ${batchAnalyzed}, failed: ${batchFailed}`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Step 5 — embedding backfill (§20)
  // Articles that already have an analysis row but embedding IS NULL
  // -------------------------------------------------------------------------
  const backfillPending = await getPendingEmbeddings();
  const backfillCount = backfillPending.length;

  if (backfillCount > 0) {
    console.info(`[analyze] Backfill: ${backfillCount} articles need embeddings`);

    for (const article of backfillPending) {
      console.info(`[analyze] Backfill embedding: "${article.title}" (${article.id})`);
      try {
        const embResult = await generateEmbedding(article);
        if (!embResult.success) {
          console.warn(`[analyze] Backfill embedding failed: "${article.title}" — ${embResult.error}`);
          embeddingsFailed++;
          continue;
        }
        await saveEmbedding(article.id, embResult.embedding);
        embeddingsGenerated++;
        console.info(`[analyze] Backfill saved: "${article.title}"`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[analyze] Backfill error on "${article.title}": ${message}`);
        embeddingsFailed++;
      }
    }

    console.info(
      `[analyze] Backfill complete — generated: ${embeddingsGenerated}, failed: ${embeddingsFailed}`
    );
  } else {
    console.info("[analyze] Backfill: no embedding gaps found");
  }

  // -------------------------------------------------------------------------
  // Step 6 — summary + log
  // -------------------------------------------------------------------------
  const durationMs = Date.now() - startTime;
  const summary: AnalysisSummary = {
    status: "completed",
    pendingFound,
    analyzed,
    skipped: 0,
    failed,
    durationMs,
    batchCount,
    failures,
    embeddingsGenerated,
    embeddingsFailed,
  };

  console.info(
    `[analyze] Completed in ${(durationMs / 1000).toFixed(1)}s — ` +
      `analyzed: ${analyzed}, failed: ${failed}, ` +
      `embeddings: ${embeddingsGenerated}, embeddingsFailed: ${embeddingsFailed}`
  );
  console.info("[analyze] Summary:", JSON.stringify(summary, null, 2));

  await createLog({
    level: "info",
    event: "analyze.summary",
    message: `Analysis completed: ${analyzed} analyzed, ${embeddingsGenerated} embeddings in ${(durationMs / 1000).toFixed(1)}s`,
    context: summary as unknown as Json,
  });

  return summary;
}
