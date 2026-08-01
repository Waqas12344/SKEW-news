import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/admin-auth";
import { syncSchedules } from "@/lib/pipeline/scheduler";
import { getSchedules } from "@/lib/supabase/queries/schedules";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/oxylabs/schedules — sync schedules (§18)
 * Creates one Oxylabs schedule per active source that has no existing schedule.
 * Deactivates orphan Oxylabs schedules not present in DB.
 * Requires Biasly_Admin_Secret header (§15).
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncSchedules();
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync error";
    console.error("[api/oxylabs/schedules] POST error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/oxylabs/schedules — list stored schedule rows (§18)
 * Returns all schedule rows from the DB.
 * Requires Biasly_Admin_Secret header (§15).
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const schedules = await getSchedules();
    return NextResponse.json({ schedules }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch error";
    console.error("[api/oxylabs/schedules] GET error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
