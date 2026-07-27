import { createServiceClient } from "../server";
import type {
  InsertOxylabsSchedule,
  InsertOxylabsScheduleRun,
  OxylabsSchedule,
  OxylabsScheduleRun,
} from "../types";

/**
 * Returns all Oxylabs schedule rows stored in the DB.
 */
export async function getSchedules(): Promise<OxylabsSchedule[]> {
  const { data, error } = await createServiceClient()
    .from("oxylabs_schedules")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getSchedules failed: ${error.message}`);
  }

  return (data ?? []) as unknown as OxylabsSchedule[];
}

/**
 * Inserts or updates a schedule row keyed on schedule_id (text).
 */
export async function upsertSchedule(
  scheduleData: InsertOxylabsSchedule
): Promise<OxylabsSchedule> {
  const client = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.from("oxylabs_schedules") as any)
    .upsert(scheduleData, { onConflict: "schedule_id" })
    .select()
    .single();

  if (error) {
    throw new Error(`upsertSchedule failed: ${error.message}`);
  }

  return data as OxylabsSchedule;
}

/**
 * Activates or deactivates a schedule by its Oxylabs schedule_id (text).
 */
export async function updateScheduleStatus(
  scheduleId: string,
  active: boolean
): Promise<void> {
  const client = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client.from("oxylabs_schedules") as any)
    .update({ active, updated_at: new Date().toISOString() })
    .eq("schedule_id", scheduleId);

  if (error) {
    throw new Error(`updateScheduleStatus failed: ${error.message}`);
  }
}

/**
 * Inserts a schedule run record.
 */
export async function insertScheduleRun(
  runData: InsertOxylabsScheduleRun
): Promise<OxylabsScheduleRun> {
  const client = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.from("oxylabs_schedule_runs") as any)
    .insert(runData)
    .select()
    .single();

  if (error) {
    throw new Error(`insertScheduleRun failed: ${error.message}`);
  }

  return data as OxylabsScheduleRun;
}

/**
 * Returns unprocessed runs for a given schedule_id.
 */
export async function getUnprocessedRuns(
  scheduleId: string
): Promise<OxylabsScheduleRun[]> {
  const { data, error } = await createServiceClient()
    .from("oxylabs_schedule_runs")
    .select("*")
    .eq("schedule_id", scheduleId)
    .eq("processed", false)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getUnprocessedRuns failed: ${error.message}`);
  }

  return (data ?? []) as unknown as OxylabsScheduleRun[];
}

/**
 * Marks a run as processed.
 */
export async function markRunProcessed(runId: string): Promise<void> {
  const client = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client.from("oxylabs_schedule_runs") as any)
    .update({ processed: true })
    .eq("run_id", runId);

  if (error) {
    throw new Error(`markRunProcessed failed: ${error.message}`);
  }
}
