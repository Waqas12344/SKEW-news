# Oxylabs Scheduler + Vercel Cron — Implementation Prompt

## Goal

Implement the complete Oxylabs Scheduler + Vercel Cron feature (AGENTS.md §18) so that:

1. Active source homepages are scraped hourly by Oxylabs Scheduler.
2. A Vercel Cron fires at :15 past every hour to process completed job results.
3. The cron automatically runs both scraping (from Oxylabs job HTML) and AI analysis in sequence.
4. Manual control routes allow one-time setup and on-demand processing.

All five deliverables are implemented together (AGENTS.md §18 "When implementing Oxylabs Scheduler, always deliver all parts together"):
- Sync schedules route — `POST /api/oxylabs/schedules`
- List schedules route — `GET /api/oxylabs/schedules`
- Manual process route — `POST /api/oxylabs/scheduled-results/process`
- Vercel Cron config — `vercel.json`
- Cron pipeline route — `GET /api/cron/pipeline`

---

## Skills Read

- `.agents/skills/oxylabs-web-scraper/SKILL.md`
- `.agents/skills/supabase/SKILL.md`

---

## Existing Code Inspected

- `lib/pipeline/scrape.ts` — `runSourcePipeline()` exported and takes pre-fetched HTML; reusable by scheduler
- `lib/pipeline/analyze.ts` — `runAnalysis()` entry point used by cron after scraping
- `lib/pipeline/types.ts` — `ScrapeOptions`, `ScrapeSummary`, `SourceRunResult` types
- `lib/scraping/oxylabs.ts` — `fetchHtml()` Realtime API client; scheduler needs a separate Scheduler API client
- `lib/supabase/queries/schedules.ts` — `getSchedules`, `upsertSchedule`, `updateScheduleStatus`, `insertScheduleRun`, `getUnprocessedRuns`, `markRunProcessed` already implemented
- `lib/supabase/types.ts` — `OxylabsSchedule`, `OxylabsScheduleRun`, `InsertOxylabsSchedule`, `InsertOxylabsScheduleRun` types already defined
- `lib/api/admin-auth.ts` — `isAuthorized()` for `Biasly_Admin_Secret` header
- `app/api/scrape/route.ts` — route handler pattern: `dynamic`, `maxDuration`, auth check, try/catch
- `app/api/analyze/route.ts` — same pattern
- `supabase/schema.sql` — `oxylabs_schedules` and `oxylabs_schedule_runs` tables with `schedule_id TEXT` for 64-bit safety
- `.env.example` — `CRON_SECRET` documented as Vercel-injected, must not be in `.env.local`

---

## Live API Docs Fetched

Fetched `https://developers.oxylabs.io/products/web-scraper-api/features/scheduler`.

Key confirmed facts:
- Create schedule: `POST https://data.oxylabs.io/v1/schedules` — body: `{ cron, items: [{source, url}], end_time }`
- List all schedules: `GET https://data.oxylabs.io/v1/schedules` — returns `{ schedules: [id, ...] }` (integers)
- Get runs: `GET https://data.oxylabs.io/v1/schedules/{id}/runs` — returns `{ runs: [{ run_id, jobs: [{ id, result_status, ... }] }] }`
- Deactivate/reactivate: `PUT https://data.oxylabs.io/v1/schedules/{id}/state` — body: `{ active: boolean }` — returns 202 empty
- `result_status` values: `"done"`, `"pending"`, `"faulted"`
- Job results fetched from: `GET https://data.oxylabs.io/v1/queries/{job_id}/results`
- All IDs (`schedule_id`, `run_id`, `job.id`) are large 64-bit integers — **must be read as strings from raw response text before JSON.parse**

---

## Decisions and Assumptions

1. **Cron expression**: `0 * * * *` (top of every hour). Vercel Cron fires at `15 * * * *` (:15 past each hour) to give Oxylabs time to complete jobs.
2. **Schedule end time**: far future — `2099-01-01 00:00:00` — effectively permanent.
3. **Orphan cleanup**: after syncing, `GET /v1/schedules` is called; any Oxylabs schedule ID not present in the DB is deactivated via `PUT /v1/schedules/{id}/state`. This prevents cost leaks from stale schedules.
4. **64-bit integer safety**: All IDs extracted from raw HTTP response text via regex/string extraction before any `JSON.parse`. Never convert a parsed JS Number back to a string.
5. **Run processing**: Fetch `/runs` for each active DB schedule. For each run, iterate jobs where `result_status === "done"`. Fetch job HTML via `GET https://data.oxylabs.io/v1/queries/{job_id}/results`. Pass HTML to `runSourcePipeline()`. Skip `pending`/`faulted` jobs. After all jobs are processed for a run, mark the run as processed in DB.
6. **Per-source limit**: default 5 valid articles per source (same as manual scraping). Scheduler processing is not configurable by body params — it always uses the default limit (§18 "reuse same validation... as manual scraping").
7. **Cron route auth**: in production, require `Authorization: Bearer <CRON_SECRET>` header (Vercel injects this). In local development (`NODE_ENV !== "production"`), skip the secret check so the route can be tested manually. Do **not** use `BIASLY_ADMIN_SECRET` here.
8. **Cron pipeline sequencing**: process scheduled results first; if it fails, still run analysis (§18 "If step one fails, step two must still run"). Each step's error is caught and logged independently.
9. **Job results endpoint**: `GET https://data.oxylabs.io/v1/queries/{job_id}/results` — returns `{ results: [{ content: string, ... }] }` — use the `content` field as homepage HTML.
10. **Runs that were previously processed**: `processed` flag in `oxylabs_schedule_runs` tracks this. On the process route, fetch all runs from Oxylabs `/runs`, upsert each run+job combination in the DB, then process only unprocessed runs from the DB to avoid reprocessing.
11. **Run recording**: before processing, upsert each run's jobs into `oxylabs_schedule_runs`. This creates the DB record if it doesn't exist yet.
12. **`maxDuration`**: set to 300s on action routes (sync, process). The cron route also sets 300s.
13. **Oxylabs Scheduler client**: extracted to `lib/scraping/oxylabs-scheduler.ts` — handles `schedule_id` precision using raw-text extraction, all CRUD + runs/results fetching. Separate from the Realtime client.
14. **Scheduler processing pipeline**: extracted to `lib/pipeline/scheduler.ts` — `runSchedulerProcessing()` function. Reuses `runSourcePipeline()` from `lib/pipeline/scrape.ts`. Accepts a `ScrapeSummary`-compatible return type.
15. **Vercel Cron**: configured in `vercel.json` at project root with `{ "crons": [{ "path": "/api/cron/pipeline", "schedule": "15 * * * *" }] }`.

---

## Files to Create

```
lib/scraping/oxylabs-scheduler.ts       — Oxylabs Scheduler API client (64-bit safe)
lib/pipeline/scheduler.ts               — runSchedulerProcessing() orchestrator
app/api/oxylabs/schedules/route.ts      — POST (sync) + GET (list)
app/api/oxylabs/scheduled-results/process/route.ts — POST (manual process)
app/api/cron/pipeline/route.ts          — GET (Vercel Cron, protected by CRON_SECRET)
vercel.json                             — Vercel Cron config
```

## Files to Update

```
lib/pipeline/types.ts                   — add SchedulerSummary type
```

---

## Implementation Requirements

### `lib/scraping/oxylabs-scheduler.ts`

This is a server-only module. All functions use Basic Auth with `OXY_WSA_USERNAME` / `OXY_WSA_PASSWORD`.

Base URL: `https://data.oxylabs.io/v1`

**Big-integer extraction helper** — `extractBigIntId(rawText: string, key: string): string`:
- Uses regex to find `"key": <digits>` in raw response text and returns the digit sequence as a string.
- Never JSON.parse before calling this.

**`createSchedule(url: string, cron: string): Promise<string>`**:
- `POST /v1/schedules` with body `{ cron, items: [{ source: "universal", url, render: "html" }], end_time: "2099-01-01 00:00:00" }`.
- Read raw response text first, extract `schedule_id` using big-int extractor. Return as string.

**`listAllScheduleIds(): Promise<string[]>`**:
- `GET /v1/schedules`. Parse response, but extract IDs as strings from raw text using regex `/"schedules"\s*:\s*\[([^\]]*)\]/` then split and trim each number string. Returns `string[]`.

**`deactivateSchedule(scheduleId: string): Promise<void>`**:
- `PUT /v1/schedules/{scheduleId}/state` with body `{ active: false }`. Expects 202.

**`getScheduleRuns(scheduleId: string): Promise<OxyRun[]>`**:
- `GET /v1/schedules/{scheduleId}/runs`.
- Raw text extraction for all integer IDs (`run_id`, `jobs[].id`).
- Returns typed array with `runId: string`, `jobs: Array<{ jobId: string, resultStatus: string }>`.

**`fetchJobResult(jobId: string): Promise<string | null>`**:
- `GET /v1/queries/{jobId}/results`.
- Returns HTML content string from `results[0].content`, or `null` if not available / error.

Define local types `OxyRun` and `OxyJob` in this file.

### `lib/pipeline/types.ts` — add `SchedulerSummary`

```ts
export interface SchedulerSummary {
  status: "completed" | "failed";
  schedulesChecked: number;
  runsFound: number;
  jobsFound: number;
  jobsProcessed: number;
  jobsSkipped: number;         // pending or faulted
  jobsFailed: number;
  scrapeResult: ScrapeSummary | null;
  analyzeResult: AnalysisSummary | null;
  durationMs: number;
  error?: string;
}
```

### `lib/pipeline/scheduler.ts`

Server-only. Implements `runSchedulerProcessing(): Promise<ScrapeSummary>`.

Flow:
1. Load all active schedule rows from DB via `getSchedules()`. Filter to `active === true`.
2. For each schedule row, call `getScheduleRuns(schedule.schedule_id)`.
3. For each run, iterate its jobs. Upsert each job into `oxylabs_schedule_runs` via `insertScheduleRun()` (the DB table has a unique constraint on `(schedule_id, run_id, job_id)` — use `.upsert()` with `onConflict` or catch duplicate errors).
4. After upserting, fetch unprocessed runs for this schedule from DB via `getUnprocessedRuns(schedule.schedule_id)`.
5. For each unprocessed run row, find all its jobs where `result_status === "done"`. For each done job, call `fetchJobResult(job_id)` to get homepage HTML.
6. Find the source matching this schedule row's `source_id`. If not found, log and skip.
7. Call `runSourcePipeline(html, source, DEFAULT_LIMIT_PER_SOURCE, rejectionLog)` with the fetched HTML.
8. Accumulate results into a shared `ScrapeSummary`-compatible aggregate.
9. After all jobs in a run are processed, call `markRunProcessed(run_id)`.
10. Log progress at each step per the **run logging** spec (§9): schedule started, runs found, jobs found, done/skipped/faulted per job, source pipeline results, run marked processed.
11. At the end, log a console summary object.
12. Return a `ScrapeSummary` aggregate (same shape as manual scraping).

Also export `syncSchedules(): Promise<{ created: number; deactivated: number; unchanged: number }>`:
1. Load active sources from DB.
2. Load existing schedule rows from DB.
3. For sources with no existing schedule row: call `createSchedule(source.listing_url, "0 * * * *")`. Upsert into DB via `upsertSchedule()`.
4. For sources that already have an active schedule row: no action (unchanged).
5. Call `listAllScheduleIds()` to get all Oxylabs schedule IDs.
6. Compare against DB schedule_ids. Deactivate any Oxylabs ID not in DB via `deactivateSchedule()`. Update DB row `active = false` via `updateScheduleStatus()`.
7. Log progress and return summary counts.

Import `getActiveSources` from `lib/supabase/queries/sources`.

### `app/api/oxylabs/schedules/route.ts`

```
export const dynamic = "force-dynamic";
export const maxDuration = 300;
```

**POST** — sync schedules:
- Require `Biasly_Admin_Secret` header via `isAuthorized()`.
- Call `syncSchedules()`.
- Return `200` with sync summary JSON.

**GET** — list schedules:
- Require `Biasly_Admin_Secret` header.
- Call `getSchedules()`.
- Return `200` with `{ schedules: [...] }`.

### `app/api/oxylabs/scheduled-results/process/route.ts`

```
export const dynamic = "force-dynamic";
export const maxDuration = 300;
```

**POST** — manual process:
- Require `Biasly_Admin_Secret` header.
- Call `runSchedulerProcessing()`.
- Return `200` with `ScrapeSummary` JSON.

### `app/api/cron/pipeline/route.ts`

```
export const dynamic = "force-dynamic";
export const maxDuration = 300;
```

**GET** — Vercel Cron:
- Auth: in production (`process.env.NODE_ENV === "production"`), check `Authorization` header equals `Bearer ${process.env.CRON_SECRET}`. If missing or wrong, return `401`. In non-production, skip the check.
- Step 1: call `runSchedulerProcessing()`. Catch errors — if step 1 fails, log the error but continue to step 2.
- Step 2: call `runAnalysis({})` (all pending articles).
- Return `200` with `{ scrape: ScrapeSummary | null, analyze: AnalysisSummary | null, step1Error?: string }`.

### `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/pipeline",
      "schedule": "15 * * * *"
    }
  ]
}
```

---

## Security Requirements

- `SUPABASE_SERVICE_ROLE_KEY`, `OXY_WSA_USERNAME`, `OXY_WSA_PASSWORD`, `BIASLY_ADMIN_SECRET` — server-only, never imported in client components.
- All action routes (`POST /api/oxylabs/schedules`, `POST /api/oxylabs/scheduled-results/process`) require `Biasly_Admin_Secret` header.
- Cron route uses `CRON_SECRET` (Vercel-injected), not `BIASLY_ADMIN_SECRET`.
- All Oxylabs Scheduler API calls use Basic Auth from env. Credentials never logged.
- No `any` in scheduler client except where Supabase SDK forces it (document with `// eslint-disable-next-line`).
- `lib/scraping/oxylabs-scheduler.ts` and `lib/pipeline/scheduler.ts` must have `import "server-only"` at the top.

---

## Acceptance Criteria

1. `POST /api/oxylabs/schedules` creates one Oxylabs schedule per active source that has no existing schedule, deactivates orphan Oxylabs schedules, and returns sync summary.
2. `GET /api/oxylabs/schedules` returns all schedule rows from DB.
3. `POST /api/oxylabs/scheduled-results/process` fetches completed Oxylabs job HTML, runs it through `runSourcePipeline()`, returns a `ScrapeSummary`.
4. `GET /api/cron/pipeline` chains process + analyze; rejects with `401` in production when `CRON_SECRET` is wrong or missing; succeeds in local dev without a secret.
5. `vercel.json` exists with cron schedule `"15 * * * *"` pointing to `/api/cron/pipeline`.
6. All 64-bit IDs are stored and used as `string` — no precision loss.
7. `runSchedulerProcessing()` never saves homepage HTML as articles; it extracts candidate links then scrapes article detail pages (same as manual pipeline).
8. Processed runs are marked `processed = true` in `oxylabs_schedule_runs` — they are not reprocessed on subsequent calls.
9. TypeScript compiles with no errors. ESLint passes with no new warnings.

---

## Checks to Run

```
npm run typecheck
npm run lint
npm run build
```

---

## Exact Manual Test Steps

### Step 1 — Sync schedules (one-time setup)

```bash
curl -X POST http://localhost:3000/api/oxylabs/schedules \
  -H "Biasly_Admin_Secret: <your_secret>"
```

Expected: `200` JSON with `{ created: N, deactivated: M, unchanged: K }`.
Check terminal: logs show "schedule created" for each new source, "orphan deactivated" for any stale ones.

### Step 2 — List schedules

```bash
curl http://localhost:3000/api/oxylabs/schedules \
  -H "Biasly_Admin_Secret: <your_secret>"
```

Expected: `200` JSON with array of schedule rows.

### Step 3 — Manual process (waits for Oxylabs jobs to complete — ~1–2 min after sync)

```bash
curl -X POST http://localhost:3000/api/oxylabs/scheduled-results/process \
  -H "Biasly_Admin_Secret: <your_secret>"
```

Expected: `200` JSON `ScrapeSummary`. Watch terminal for per-source logs: "runs found", "jobs done", "candidates extracted", "inserted N articles".

### Step 4 — Manual cron pipeline (local dev, no secret needed)

```bash
curl http://localhost:3000/api/cron/pipeline
```

Expected: `200` JSON with `{ scrape: {...}, analyze: {...} }`. Terminal shows both pipeline steps running in sequence.

### Step 5 — Unauthorized check

```bash
curl -X POST http://localhost:3000/api/oxylabs/schedules
```

Expected: `401 Unauthorized`.

```bash
# In production-like test only:
curl http://localhost:3000/api/cron/pipeline \
  -H "Authorization: Bearer wrongsecret"
```

Expected: `401 Unauthorized`.
