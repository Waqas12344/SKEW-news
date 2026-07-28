import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { runManualScrape } from "@/lib/pipeline/scrape";
import type { ScrapeOptions } from "@/lib/pipeline/types";

export const maxDuration = 300;

/**
 * POST /api/scrape — manual scraping endpoint (§16)
 * Requires x-skew-admin-secret header (§15).
 * Runs the full scrape-to-insert pipeline for selected sources.
 * Returns ScrapeSummary JSON.
 */
export async function POST(req: NextRequest) {
  // Admin secret check (§15)
  const secret = req.headers.get("x-skew-admin-secret");
  if (!secret || secret !== process.env.SKEW_ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse optional request body
  const options: ScrapeOptions = {};
  try {
    const body = await req.json();
    if (Array.isArray(body.sources)) {
      options.sources = body.sources;
    }
    if (typeof body.limitPerSource === "number") {
      options.limitPerSource = body.limitPerSource;
    }
  } catch {
    // Body is optional — default options are fine
  }

  // Run pipeline
  try {
    const summary = await runManualScrape(options);
    return NextResponse.json(summary, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline error";
    console.error("[scrape] Unhandled error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
