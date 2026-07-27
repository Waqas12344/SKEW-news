import { createServiceClient } from "../server";
import type { Source } from "../types";

/**
 * Returns all active sources ordered by name.
 * Used by the scraping pipeline to load sources for a run (§8).
 */
export async function getActiveSources(): Promise<Source[]> {
  const { data, error } = await createServiceClient()
    .from("sources")
    .select("*")
    .eq("active", true)
    .order("name");

  if (error) {
    throw new Error(`getActiveSources failed: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Returns all sources (active and inactive).
 */
export async function getAllSources(): Promise<Source[]> {
  const { data, error } = await createServiceClient()
    .from("sources")
    .select("*")
    .order("name");

  if (error) {
    throw new Error(`getAllSources failed: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Returns a single source by ID, or null if not found.
 */
export async function getSourceById(id: string): Promise<Source | null> {
  const { data, error } = await createServiceClient()
    .from("sources")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`getSourceById failed: ${error.message}`);
  }

  return data ?? null;
}
