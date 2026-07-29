import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/admin-auth";
import { runManualScrape } from "@/lib/pipeline/scrape";
import type { ScrapeOptions } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/scrape — manual scraping endpoint (§16)
 * Requires Biasly_Admin_Secret header (§15).
 * Runs the full scrape-to-insert pipeline for selected sources.
 * Returns ScrapeSummary JSON.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const options: ScrapeOptions = {};
  try {
    const body = await req.json();
    if (Array.isArray(body.sources)) options.sources = body.sources;
    if (typeof body.limitPerSource === "number") options.limitPerSource = body.limitPerSource;
  } catch {
    // Body is optional — default options are fine
  }

  try {
    const summary = await runManualScrape(options);
    return NextResponse.json(summary, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline error";
    console.error("[scrape] Unhandled error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
