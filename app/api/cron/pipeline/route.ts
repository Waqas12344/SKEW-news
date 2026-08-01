import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { runSchedulerProcessing } from "@/lib/pipeline/scheduler";
import { runAnalysis } from "@/lib/pipeline/analyze";
import type { ScrapeSummary, AnalysisSummary } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/pipeline — Vercel Cron automatic pipeline (§18)
 *
 * Fires at :15 past every hour (configured in vercel.json).
 * Chains step 1 (scheduler processing) → step 2 (AI analysis).
 * If step 1 fails, step 2 still runs — there may be pre-existing
 * unanalyzed articles from previous runs.
 *
 * Auth (§18):
 *   - Production: requires Authorization: Bearer <CRON_SECRET> header.
 *     Vercel injects this automatically on every cron request.
 *   - Non-production (local dev): secret check is skipped so the route
 *     can be tested manually with a plain curl.
 *
 * Do NOT protect with BIASLY_ADMIN_SECRET — this is Vercel Cron only.
 */
export async function GET(req: NextRequest) {
  // Auth check — production only (§18)
  if (process.env.NODE_ENV === "production") {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  console.info("[cron/pipeline] Starting automatic pipeline");

  let scrapeResult: ScrapeSummary | null = null;
  let step1Error: string | undefined;

  // Step 1 — process scheduled results
  try {
    console.info("[cron/pipeline] Step 1: scheduled result processing");
    scrapeResult = await runSchedulerProcessing();
    console.info(
      `[cron/pipeline] Step 1 done — inserted: ${scrapeResult.articlesInserted}`
    );
  } catch (err) {
    step1Error = err instanceof Error ? err.message : String(err);
    console.error("[cron/pipeline] Step 1 failed:", step1Error);
    // Continue to step 2 regardless (§18)
  }

  // Step 2 — AI analysis on all pending articles
  let analyzeResult: AnalysisSummary | null = null;
  try {
    console.info("[cron/pipeline] Step 2: AI analysis");
    analyzeResult = await runAnalysis({});
    console.info(
      `[cron/pipeline] Step 2 done — analyzed: ${analyzeResult.analyzed}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/pipeline] Step 2 failed:", msg);
  }

  console.info("[cron/pipeline] Pipeline complete");

  const body: {
    scrape: ScrapeSummary | null;
    analyze: AnalysisSummary | null;
    step1Error?: string;
  } = { scrape: scrapeResult, analyze: analyzeResult };

  if (step1Error) body.step1Error = step1Error;

  return NextResponse.json(body, { status: 200 });
}
