import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/admin-auth";
import { runSchedulerProcessing } from "@/lib/pipeline/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/oxylabs/scheduled-results/process — manual scheduled result processing (§18)
 * Fetches completed Oxylabs job HTML, runs scrape-to-insert pipeline per source.
 * Returns ScrapeSummary JSON.
 * Requires Biasly_Admin_Secret header (§15).
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runSchedulerProcessing();
    return NextResponse.json(summary, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing error";
    console.error("[api/oxylabs/scheduled-results/process] POST error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
