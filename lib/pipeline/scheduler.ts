import "server-only";

// =============================================================================
// Oxylabs Scheduler processing pipeline (§18)
//
// syncSchedules()       — creates one Oxylabs schedule per active source,
//                         deactivates orphan schedules on Oxylabs side.
// runSchedulerProcessing() — fetches completed job HTML from Oxylabs, runs
//                            runSourcePipeline() for each, returns ScrapeSummary.
//
// Both functions reuse runSourcePipeline() from lib/pipeline/scrape.ts so
// validation, cleanup, dedupe, and run logging are identical to manual scraping.
// =============================================================================

import {
  createSchedule,
  deactivateSchedule,
  fetchJobResult,
  getScheduleRuns,
  listAllScheduleIds,
} from "@/lib/scraping/oxylabs-scheduler";
import { runSourcePipeline } from "@/lib/pipeline/scrape";
import {
  getSchedules,
  getUnprocessedRuns,
  markRunProcessed,
  updateScheduleStatus,
  upsertSchedule,
  upsertScheduleRun,
} from "@/lib/supabase/queries/schedules";
import { getActiveSources, getSourceById } from "@/lib/supabase/queries/sources";
import { createLog } from "@/lib/supabase/queries/logs";
import type { Json } from "@/lib/supabase/types";
import type {
  RejectionReason,
  ScrapeSummary,
  SourceRunResult,
} from "@/lib/pipeline/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCHEDULER_CRON = "0 8 * * *"; // daily at 08:00 UTC — Vercel Cron fires at 09:00 UTC
const DEFAULT_LIMIT_PER_SOURCE = 5;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function incrementRejection(map: Map<string, number>, reason: string): void {
  map.set(reason, (map.get(reason) ?? 0) + 1);
}

function buildRejectionReasons(map: Map<string, number>): RejectionReason[] {
  return Array.from(map.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// syncSchedules (§18 — one-time setup)
// ---------------------------------------------------------------------------

/**
 * Creates one Oxylabs schedule per active source that has no existing DB row.
 * After creating, lists all Oxylabs schedule IDs and deactivates any not in DB
 * (orphan cleanup — prevents billing leaks from stale schedules).
 */
export async function syncSchedules(): Promise<{
  created: number;
  deactivated: number;
  unchanged: number;
}> {
  const [activeSources, existingSchedules] = await Promise.all([
    getActiveSources(),
    getSchedules(),
  ]);

  // Build a set of source_ids that already have a schedule row
  const scheduledSourceIds = new Set(existingSchedules.map((s) => s.source_id));
  const dbScheduleIds = new Set(existingSchedules.map((s) => s.schedule_id));

  let created = 0;
  let unchanged = 0;

  console.info(
    `[scheduler:sync] Active sources: ${activeSources.length} | Existing schedules: ${existingSchedules.length}`
  );

  // Create schedules for sources that don't have one yet
  for (const source of activeSources) {
    if (scheduledSourceIds.has(source.id)) {
      console.info(`[scheduler:sync] Already scheduled: ${source.name}`);
      unchanged++;
      continue;
    }

    try {
      console.info(
        `[scheduler:sync] Creating schedule for ${source.name} — ${source.listing_url}`
      );
      const scheduleId = await createSchedule(source.listing_url, SCHEDULER_CRON);
      await upsertSchedule({
        schedule_id: scheduleId,
        source_id: source.id,
        cron: SCHEDULER_CRON,
        active: true,
      });
      dbScheduleIds.add(scheduleId);
      console.info(
        `[scheduler:sync] Created schedule ${scheduleId} for ${source.name}`
      );
      created++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scheduler:sync] Failed to create schedule for ${source.name}: ${msg}`);
    }
  }

  // Orphan cleanup — deactivate any Oxylabs schedule not in DB
  let deactivated = 0;
  try {
    const allOxyIds = await listAllScheduleIds();
    console.info(
      `[scheduler:sync] Oxylabs has ${allOxyIds.length} schedule(s) total`
    );

    for (const oxyId of allOxyIds) {
      if (!dbScheduleIds.has(oxyId)) {
        try {
          console.info(`[scheduler:sync] Deactivating orphan schedule: ${oxyId}`);
          await deactivateSchedule(oxyId);
          deactivated++;
          // If there's a DB row for this orphan (e.g. source was deleted),
          // mark it inactive so it won't be processed again.
          await updateScheduleStatus(oxyId, false).catch(() => {
            // Row may not exist in DB — that's fine, ignore
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[scheduler:sync] Failed to deactivate orphan ${oxyId}: ${msg}`);
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[scheduler:sync] Could not list Oxylabs schedules for orphan check: ${msg}`);
  }

  const summary = { created, deactivated, unchanged };
  console.info("[scheduler:sync] Sync complete:", JSON.stringify(summary));

  await createLog({
    level: "info",
    event: "scheduler.sync",
    message: `Sync: ${created} created, ${deactivated} deactivated, ${unchanged} unchanged`,
    context: summary as unknown as Json,
  });

  return summary;
}

// ---------------------------------------------------------------------------
// runSchedulerProcessing (§18 — scheduled result processing)
// ---------------------------------------------------------------------------

/**
 * Fetches completed Oxylabs job results and runs the scrape-to-insert pipeline
 * for each, reusing runSourcePipeline() from lib/pipeline/scrape.ts.
 *
 * Flow per §18:
 * 1. Load active schedule rows from DB.
 * 2. Fetch /runs for each schedule from Oxylabs.
 * 3. Upsert each run+job combo into oxylabs_schedule_runs (idempotent).
 * 4. Load unprocessed DB runs; for each done job fetch HTML and run pipeline.
 * 5. Mark run as processed after all its jobs are handled.
 * 6. Return ScrapeSummary aggregate.
 */
export async function runSchedulerProcessing(): Promise<ScrapeSummary> {
  const startTime = Date.now();
  const rejectionLog = new Map<string, number>();
  const sourceResults: SourceRunResult[] = [];

  let totalCandidatesFound = 0;
  let totalCandidatesRejected = 0;
  let totalDuplicatesSkipped = 0;
  let totalDetailsScraped = 0;
  let totalArticlesInserted = 0;
  let totalArticlesRejected = 0;
  let totalArticlesFailed = 0;

  // Load active schedule rows from DB
  const allSchedules = await getSchedules();
  const activeSchedules = allSchedules.filter((s) => s.active);

  console.info(
    `[scheduler:process] Started — active schedules: ${activeSchedules.length}`
  );

  if (activeSchedules.length === 0) {
    const summary: ScrapeSummary = {
      status: "completed",
      sourcesChecked: 0,
      candidatesFound: 0,
      candidatesRejected: 0,
      duplicatesSkipped: 0,
      detailPagesScraped: 0,
      articlesInserted: 0,
      articlesRejected: 0,
      articlesFailed: 0,
      durationMs: Date.now() - startTime,
      rejectionReasons: [],
      sourceResults: [],
    };
    console.info("[scheduler:process] No active schedules — nothing to process");
    return summary;
  }

  for (const schedule of activeSchedules) {
    console.info(
      `[scheduler:process] Processing schedule ${schedule.schedule_id} (source: ${schedule.source_id})`
    );

    // Load the source for this schedule
    const source = await getSourceById(schedule.source_id).catch(() => null);
    if (!source) {
      console.warn(
        `[scheduler:process] Source not found for schedule ${schedule.schedule_id} — skipping`
      );
      continue;
    }

    console.info(`[scheduler:process] Source: ${source.name}`);

    // Step 1 — fetch runs from Oxylabs
    let oxyRuns: Awaited<ReturnType<typeof getScheduleRuns>>;
    try {
      oxyRuns = await getScheduleRuns(schedule.schedule_id);
      console.info(
        `[scheduler:process:${source.name}] Runs found: ${oxyRuns.length}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[scheduler:process:${source.name}] Failed to fetch runs: ${msg}`
      );
      continue;
    }

    if (oxyRuns.length === 0) {
      console.info(`[scheduler:process:${source.name}] No runs yet`);
      continue;
    }

    // Step 2 — upsert each run+job into DB (idempotent via unique constraint)
    for (const run of oxyRuns) {
      for (const job of run.jobs) {
        try {
          await upsertScheduleRun({
            schedule_id: schedule.schedule_id,
            run_id: run.runId,
            job_id: job.jobId,
            result_status: job.resultStatus,
            processed: false,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `[scheduler:process:${source.name}] upsertScheduleRun failed for job ${job.jobId}: ${msg}`
          );
        }
      }
    }

    // Step 3 — fetch unprocessed DB runs for this schedule
    const unprocessedRuns = await getUnprocessedRuns(schedule.schedule_id);
    console.info(
      `[scheduler:process:${source.name}] Unprocessed runs: ${unprocessedRuns.length}`
    );

    // Group unprocessed DB rows by run_id
    const runMap = new Map<string, typeof unprocessedRuns>();
    for (const row of unprocessedRuns) {
      const existing = runMap.get(row.run_id) ?? [];
      existing.push(row);
      runMap.set(row.run_id, existing);
    }

    // Step 4 — process each unprocessed run
    for (const [runId, jobRows] of runMap.entries()) {
      console.info(
        `[scheduler:process:${source.name}] Run ${runId} — ${jobRows.length} job(s)`
      );

      const doneJobs = jobRows.filter((r) => r.result_status === "done");
      const skippedCount = jobRows.length - doneJobs.length;

      if (skippedCount > 0) {
        console.info(
          `[scheduler:process:${source.name}] Run ${runId} — skipping ${skippedCount} non-done job(s)`
        );
      }

      if (doneJobs.length === 0) {
        console.info(
          `[scheduler:process:${source.name}] Run ${runId} — no done jobs; marking processed`
        );
        await markRunProcessed(runId).catch((err) =>
          console.warn(`[scheduler:process] markRunProcessed(${runId}) failed: ${err}`)
        );
        continue;
      }

      // For each done job, fetch HTML and run the source pipeline
      for (const jobRow of doneJobs) {
        const jobId = jobRow.job_id;
        if (!jobId) continue;

        console.info(
          `[scheduler:process:${source.name}] Fetching result for job ${jobId}`
        );
        const html = await fetchJobResult(jobId);

        if (!html) {
          console.warn(
            `[scheduler:process:${source.name}] No HTML from job ${jobId} — skipping`
          );
          incrementRejection(rejectionLog, "job_result_empty");
          continue;
        }

        console.info(
          `[scheduler:process:${source.name}] Running pipeline for job ${jobId}`
        );

        try {
          const result = await runSourcePipeline(
            html,
            source,
            DEFAULT_LIMIT_PER_SOURCE,
            rejectionLog
          );
          sourceResults.push(result);

          totalCandidatesFound += result.candidatesFound;
          totalCandidatesRejected += result.candidatesRejected;
          totalDuplicatesSkipped += result.duplicatesSkipped;
          totalDetailsScraped += result.detailsScraped;
          totalArticlesInserted += result.articlesInserted;
          totalArticlesRejected += result.articlesRejected;
          totalArticlesFailed += result.articlesFailed;

          console.info(
            `[scheduler:process:${source.name}] Pipeline done — ` +
              `inserted: ${result.articlesInserted}, rejected: ${result.articlesRejected}, failed: ${result.articlesFailed}`
          );

          await createLog({
            level: result.error ? "warn" : "info",
            event: "scheduler.source.completed",
            message: `${source.name}: inserted ${result.articlesInserted} (job ${jobId})`,
            source_id: source.id,
            context: result as unknown as Json,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            `[scheduler:process:${source.name}] Pipeline error for job ${jobId}: ${msg}`
          );
          incrementRejection(rejectionLog, "pipeline_error");

          await createLog({
            level: "error",
            event: "scheduler.source.error",
            message: msg,
            source_id: source.id,
          });
        }
      }

      // Mark run as processed after all its jobs are handled
      await markRunProcessed(runId).catch((err) =>
        console.warn(
          `[scheduler:process] markRunProcessed(${runId}) failed: ${err}`
        )
      );
      console.info(
        `[scheduler:process:${source.name}] Run ${runId} marked as processed`
      );
    }
  }

  const durationMs = Date.now() - startTime;

  const summary: ScrapeSummary = {
    status: "completed",
    sourcesChecked: activeSchedules.length,
    candidatesFound: totalCandidatesFound,
    candidatesRejected: totalCandidatesRejected,
    duplicatesSkipped: totalDuplicatesSkipped,
    detailPagesScraped: totalDetailsScraped,
    articlesInserted: totalArticlesInserted,
    articlesRejected: totalArticlesRejected,
    articlesFailed: totalArticlesFailed,
    durationMs,
    rejectionReasons: buildRejectionReasons(rejectionLog),
    sourceResults,
  };

  console.info(
    `[scheduler:process] Completed in ${(durationMs / 1000).toFixed(1)}s — ` +
      `inserted: ${totalArticlesInserted}, rejected: ${totalArticlesRejected}, failed: ${totalArticlesFailed}`
  );
  console.info("[scheduler:process] Summary:", JSON.stringify(summary, null, 2));

  await createLog({
    level: "info",
    event: "scheduler.process.summary",
    message: `Scheduler processing: ${totalArticlesInserted} inserted in ${(durationMs / 1000).toFixed(1)}s`,
    context: summary as unknown as Json,
  });

  return summary;
}
