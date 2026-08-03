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
 * Upserts a schedule run record keyed on (schedule_id, run_id, job_id).
 * Safe to call multiple times for the same job — won't create duplicates.
 * On conflict, result_status is updated so a previously-pending job that is
 * now "done" on Oxylabs gets correctly reflected in the DB.
 * processed is only set to false on INSERT (never reset an already-processed row).
 */
export async function upsertScheduleRun(
  runData: InsertOxylabsScheduleRun
): Promise<void> {
  const client = createServiceClient();

  // First try to insert. If the row already exists, update result_status only
  // (do not touch `processed` — we never want to un-process a completed run).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertError } = await (client.from("oxylabs_schedule_runs") as any)
    .insert(runData)
    .select();

  if (!insertError) return; // fresh insert succeeded

  // Row already exists — only update result_status if it changed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (client.from("oxylabs_schedule_runs") as any)
    .update({ result_status: runData.result_status })
    .eq("schedule_id", runData.schedule_id)
    .eq("run_id", runData.run_id)
    .eq("job_id", runData.job_id)
    .eq("processed", false); // only update unprocessed rows — already-processed runs stay intact

  if (updateError) {
    throw new Error(`upsertScheduleRun failed: ${updateError.message}`);
  }
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

/**
 * Reopens runs that were prematurely marked processed while jobs were still
 * pending. After upsertScheduleRun updates a job's result_status to "done",
 * we need to un-process runs that have at least one done-but-unprocessed job.
 *
 * This fixes the case where a run was first seen with pending jobs (and got
 * marked processed immediately because doneJobs.length === 0), but on a later
 * cron tick those jobs are now done.
 */
export async function reopenPrematurelyProcessedRuns(
  scheduleId: string
): Promise<void> {
  const client = createServiceClient();

  // Find processed runs for this schedule that have at least one done job
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.from("oxylabs_schedule_runs") as any)
    .select("run_id")
    .eq("schedule_id", scheduleId)
    .eq("processed", true)
    .eq("result_status", "done");

  if (error) {
    throw new Error(`reopenPrematurelyProcessedRuns select failed: ${error.message}`);
  }

  if (!data || data.length === 0) return;

  const runIds: string[] = [...new Set((data as Array<{ run_id: string }>).map((r) => r.run_id))];

  for (const runId of runIds) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (client.from("oxylabs_schedule_runs") as any)
      .update({ processed: false })
      .eq("run_id", runId)
      .eq("result_status", "done");

    if (updateError) {
      console.warn(`reopenPrematurelyProcessedRuns: failed to reopen run ${runId}: ${updateError.message}`);
    } else {
      console.info(`[scheduler:process] Reopened prematurely-processed run ${runId} (jobs now done)`);
    }
  }
}
