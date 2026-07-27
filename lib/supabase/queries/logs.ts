import { createServiceClient } from "../server";
import type { InsertLog, Log } from "../types";

/**
 * Inserts a single log entry.
 * Errors are swallowed — logging must never crash the pipeline.
 */
export async function createLog(entry: InsertLog): Promise<void> {
  try {
    const client = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client.from("logs") as any).insert(entry);
  } catch {
    // intentionally silent — log failures must not affect pipeline execution
  }
}

/**
 * Returns recent log entries ordered by created_at descending.
 */
export async function getRecentLogs(limit = 50): Promise<Log[]> {
  const { data, error } = await createServiceClient()
    .from("logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`getRecentLogs failed: ${error.message}`);
  }

  return (data ?? []) as unknown as Log[];
}
