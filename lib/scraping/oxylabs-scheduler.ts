import "server-only";

// =============================================================================
// Oxylabs Scheduler API client (§18)
// Base URL: https://data.oxylabs.io/v1
//
// IMPORTANT — 64-bit integer safety:
// Oxylabs schedule_id, run_id, and job id values are large 64-bit integers that
// exceed JS Number.MAX_SAFE_INTEGER. We always read them from the raw HTTP
// response text via regex BEFORE any JSON.parse call. Never convert a parsed
// JS number back to a string — precision is already lost at parse time.
// =============================================================================

const OXY_SCHEDULER_BASE = "https://data.oxylabs.io/v1";

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

export interface OxyJob {
  jobId: string;       // 64-bit safe string
  resultStatus: string; // "done" | "pending" | "faulted"
}

export interface OxyRun {
  runId: string;       // 64-bit safe string
  jobs: OxyJob[];
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

function getCredentials(): string {
  const username = process.env.OXY_WSA_USERNAME;
  const password = process.env.OXY_WSA_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "Oxylabs credentials are not configured (OXY_WSA_USERNAME / OXY_WSA_PASSWORD)"
    );
  }

  return Buffer.from(`${username}:${password}`).toString("base64");
}

// ---------------------------------------------------------------------------
// Big-integer extraction helpers (§18 — read IDs from raw text)
// ---------------------------------------------------------------------------

/**
 * Extracts the first large integer value associated with the given JSON key
 * from the raw response text, returning it as a string.
 *
 * Example: extractBigIntId('{"schedule_id": 4134906379157007223, ...}', "schedule_id")
 * → "4134906379157007223"
 */
function extractBigIntId(rawText: string, key: string): string {
  const pattern = new RegExp(`"${key}"\\s*:\\s*(\\d+)`);
  const match = pattern.exec(rawText);
  if (!match || !match[1]) {
    throw new Error(`Could not extract "${key}" from Oxylabs response`);
  }
  return match[1];
}

/**
 * Extracts all integer values from a JSON array in the raw text matched by
 * the given array key, returning each as a string.
 *
 * Example: extractBigIntArray('{"schedules":[123,456,...]}', "schedules")
 * → ["123", "456", ...]
 */
function extractBigIntArray(rawText: string, key: string): string[] {
  const pattern = new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]*)\\]`);
  const match = pattern.exec(rawText);
  if (!match || !match[1]) return [];

  return match[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s));
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function oxyFetch(
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown
): Promise<{ rawText: string; status: number }> {
  const credentials = getCredentials();

  const response = await fetch(`${OXY_SCHEDULER_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const rawText = await response.text();

  if (response.status === 401 || response.status === 403) {
    throw new Error("Oxylabs Scheduler authentication failed");
  }
  if (!response.ok && response.status !== 202) {
    throw new Error(
      `Oxylabs Scheduler HTTP ${response.status} for ${method} ${path}: ${rawText.slice(0, 200)}`
    );
  }

  return { rawText, status: response.status };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a new Oxylabs schedule for the given source homepage URL.
 * Uses cron "0 * * * *" (top of every hour) by default.
 * Returns the new schedule_id as a safe string.
 */
export async function createSchedule(url: string, cron: string): Promise<string> {
  const { rawText } = await oxyFetch("POST", "/schedules", {
    cron,
    items: [{ source: "universal", url, render: "html" }],
    end_time: "2099-01-01 00:00:00",
  });

  return extractBigIntId(rawText, "schedule_id");
}

/**
 * Returns all Oxylabs schedule IDs associated with this account as safe strings.
 */
export async function listAllScheduleIds(): Promise<string[]> {
  const { rawText } = await oxyFetch("GET", "/schedules");
  console.info("[scheduler:client] listAllScheduleIds raw response:", rawText.slice(0, 500));
  return extractBigIntArray(rawText, "schedules");
}

/**
 * Deactivates an Oxylabs schedule so it stops running.
 */
export async function deactivateSchedule(scheduleId: string): Promise<void> {
  await oxyFetch("PUT", `/schedules/${scheduleId}/state`, { active: false });
}

/**
 * Returns all runs for an Oxylabs schedule with per-job result_status.
 * All IDs are returned as 64-bit-safe strings.
 */
export async function getScheduleRuns(scheduleId: string): Promise<OxyRun[]> {
  const { rawText } = await oxyFetch("GET", `/schedules/${scheduleId}/runs`);

  // We need to parse the structure but extract all integer IDs safely.
  // Strategy:
  //  1. Replace all large integer values in the raw text with quoted strings
  //     so JSON.parse doesn't lose precision.
  //  2. Parse the sanitized JSON normally.

  // Replace bare integers (not already inside quotes) with quoted strings.
  // This regex matches any sequence of 10+ digits that is NOT preceded/followed
  // by a quote — i.e. not already a string value.
  const sanitized = rawText.replace(/(?<!")\b(\d{10,})\b(?!")/g, '"$1"');

  let parsed: {
    runs?: Array<{
      run_id: string;
      jobs?: Array<{
        id: string;
        result_status?: string;
      }>;
    }>;
  };

  try {
    parsed = JSON.parse(sanitized) as typeof parsed;
  } catch {
    throw new Error(
      `Failed to parse Oxylabs /runs response: ${rawText.slice(0, 300)}`
    );
  }

  if (!parsed.runs) return [];

  return parsed.runs.map((run) => ({
    runId: String(run.run_id),
    jobs: (run.jobs ?? []).map((job) => ({
      jobId: String(job.id),
      resultStatus: job.result_status ?? "unknown",
    })),
  }));
}

/**
 * Fetches the HTML result of a completed Oxylabs job.
 * Returns the content string (homepage HTML), or null if unavailable.
 */
export async function fetchJobResult(jobId: string): Promise<string | null> {
  let rawText: string;
  try {
    ({ rawText } = await oxyFetch("GET", `/queries/${jobId}/results`));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[scheduler] fetchJobResult failed for job ${jobId}: ${msg}`);
    return null;
  }

  // Same big-int sanitization before parse
  const sanitized = rawText.replace(/(?<!")\b(\d{10,})\b(?!")/g, '"$1"');

  let parsed: { results?: Array<{ content?: string; status_code?: number }> };
  try {
    parsed = JSON.parse(sanitized) as typeof parsed;
  } catch {
    console.warn(`[scheduler] fetchJobResult: invalid JSON for job ${jobId}`);
    return null;
  }

  const first = parsed.results?.[0];
  if (!first?.content || first.content.trim().length === 0) {
    console.warn(`[scheduler] fetchJobResult: empty content for job ${jobId}`);
    return null;
  }

  const statusCode = first.status_code ?? 200;
  if (statusCode >= 400) {
    console.warn(
      `[scheduler] fetchJobResult: target returned HTTP ${statusCode} for job ${jobId}`
    );
    return null;
  }

  return first.content;
}
