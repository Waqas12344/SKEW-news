import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/admin-auth";
import { runAnalysis } from "@/lib/pipeline/analyze";
import type { AnalyzeOptions } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/analyze — AI analysis endpoint (§19)
 * Requires Biasly_Admin_Secret header (§15).
 * Analyzes all pending articles by default; respects limit and articleIds.
 * Returns AnalysisSummary JSON.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const options: AnalyzeOptions = {};
  try {
    const body = await req.json();
    if (typeof body.limit === "number") options.limit = body.limit;
    if (Array.isArray(body.articleIds)) options.articleIds = body.articleIds;
  } catch {
    // Body is optional — default options are fine
  }

  try {
    const summary = await runAnalysis(options);
    return NextResponse.json(summary, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis error";
    console.error("[analyze] Unhandled error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
