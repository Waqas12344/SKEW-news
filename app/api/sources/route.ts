import { NextResponse } from "next/server";
import { getActiveSources } from "@/lib/supabase/queries/sources";

/**
 * GET /api/sources — returns active sources (§8 inspection)
 * No admin secret required — read-only endpoint.
 */
export async function GET() {
  try {
    const sources = await getActiveSources();
    return NextResponse.json(
      sources.map((s) => ({
        id: s.id,
        name: s.name,
        listing_url: s.listing_url,
      }))
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load sources";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
