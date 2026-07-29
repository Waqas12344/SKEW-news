# AI Analysis Pipeline (§19)

## Goal

Implement the AI article analysis pipeline described in AGENTS.md §19. Given
articles already scraped and stored in Supabase, detect articles that are
**pending analysis**, run each through an AI model to produce a neutral summary,
sentiment, and AI-estimated political framing, validate the output with Zod, and
save it append-only to `article_analyses`. Expose the run via
`POST /api/analyze`, protected by the admin secret. Analyzed articles then
surface on the home feed and detail page (both already wired to the `analysis`
relation).

**In scope:** §19 only.

**Out of scope (do not build here):**

- §20 pgvector / embeddings — explicitly "after AI analysis is working". No
  `embedding` column, no `text-embedding-3-small`, no Related Articles.
- §18 Oxylabs Scheduler and `/api/cron/pipeline`. The cron route will later call
  this same analysis layer, so the core logic must be reusable, but building the
  cron/scheduler is separate work.

---

## Skills Read

- `.agents/skills/supabase/SKILL.md` — service-role client for server writes,
  RLS/security checklist, "never trust memory, verify against docs", the
  joined-table filter gotcha (§21), verify work after implementing.
- `.agents/skills/ai-sdk/SKILL.md` — **never write AI SDK code from memory**;
  read the version-matched bundled docs in `node_modules/ai/docs/` and
  `node_modules/@ai-sdk/openai/docs/` after install; use `generateObject` for
  structured, schema-validated output; run the type checker after changes.

---

## Existing Code Inspected

| File | Finding |
|---|---|
| `supabase/schema.sql` | `article_analyses` fully defined — all §19 columns, DB checks (`sentiment_score`/`bias_score` in [-1,1], `confidence` in [0,1], label CHECK constraints, `left+center+right = 100`). **No schema change required.** |
| `lib/supabase/types.ts` | `ArticleAnalysis`, `InsertArticleAnalysis`, `BiasLabel`, `SentimentLabel` already present. No type change required. |
| `lib/supabase/queries/articles.ts` | `getUnanalyzedArticles()` (LEFT JOIN pattern), `updateArticleAnalyzedAt()` already exist. Service-role client pattern and chunk helper established. |
| `lib/supabase/queries/logs.ts` | `createLog()` (never throws) — use for the run summary log row. |
| `lib/pipeline/scrape.ts` + `lib/pipeline/types.ts` | Canonical pipeline shape: typed result/summary objects, neat `console.info` progress logging, final summary object, `logs` row at end. Mirror this style exactly. |
| `app/api/scrape/route.ts` | Inlines the admin secret check with `x-biasly_admin_secret` / `Biasly_Admin_Secret` — **this is stale**. The analyze route must use `x-skew-admin-secret` / `SKEW_ADMIN_SECRET`. Create `lib/api/admin-auth.ts` and also fix the scrape route to use it. |
| `lib/supabase/server.ts` | `createServiceClient()` (server-only). |
| `package.json` | `ai` and `@ai-sdk/openai` are **not installed**. `zod` is present transitively but not a direct dependency. |
| `.env.local` | Has `OPEN_API_KEY` (typo — must be renamed to `OPENAI_API_KEY` before the pipeline can run). |
| `.env.example` | Missing `OPENAI_API_KEY` and `ANALYSIS_BATCH_SIZE` — add both and keep in sync with the §21 env table. |

---

## Decisions and Assumptions

1. **Provider:** OpenAI via the Vercel AI SDK per AGENTS.md §6/§21 (`OPENAI_API_KEY`,
   `@ai-sdk/openai`). Not Claude.
2. **Model:** default to `gpt-4o-mini` (cost-appropriate for classification-style
   analysis). Stored in one centralized constant; saved to `article_analyses.model`.
   Verify the model ID against the AI SDK/OpenAI docs at implement time — do not use
   an ID from memory.
3. **Install exact packages only:** `ai`, `@ai-sdk/openai`, promote `zod` to a direct
   dependency. Pin versions (`--save-exact`). Look up current versions at install time;
   do not invent them.
4. **Structured output:** use `generateObject` with a Zod schema so the model is forced
   into the shape and the SDK validates it. Then run a second explicit Zod `safeParse`
   as the §19 validation gate. Retry once on invalid output; if still invalid, count as
   `failed` and save nothing.
5. **Pending detection (§19.1):** LEFT JOIN semantics — an article is pending when **no
   `article_analyses` row exists** for it. Never rely on `analyzed_at IS NULL` alone.
   Add `getPendingArticles(limit?)` that uses `.select("*, sources(name, logo_url),
   article_analyses(id)")` ordered by `created_at` ascending, then filters in JS to
   rows where `article_analyses` is empty — avoids the §21 joined-column filter gotcha.
6. **`bias_score` is derived, never modeled:** compute
   `(right_percentage − left_percentage) / 100` in code, rounded to 3 decimal places
   to satisfy the `numeric(4,3)` column. The model returns only the three percentages
   and a label.
7. **Percentage normalization:** the model may return percentages that sum to 99 or 101
   due to rounding. Before saving, normalize to integers summing to **exactly 100**
   using largest-remainder rounding. This prevents valid analyses from being rejected by
   the DB `= 100` CHECK. Do not add a `.refine()` strict sum check to the Zod schema —
   normalize first, validate after.
8. **Retry policy (§19):** on invalid output, retry once; if still invalid, count the
   article as `failed` and save nothing (no `analyzed_at`, no partial row).
9. **Default behavior:** process **all** pending valid articles in batches of
   `ANALYSIS_BATCH_SIZE` (env var, default 5), looping until none remain. Respect an
   optional request `limit` and/or explicit `articleIds`. Do not cap at 10.
10. **`analyzed_at`:** set only after the `article_analyses` row is successfully saved
    (§19 rule 6). `saveAnalysis()` does the insert and only then calls
    `updateArticleAnalyzedAt()` — never the other way around.
11. **Article text cap:** pass `raw_text` capped at 8 000 chars to avoid token limits,
    plus `title` and source name as context.
12. **Shared admin auth:** create `lib/api/admin-auth.ts` with an `isAuthorized(req)`
    helper that checks `x-skew-admin-secret` === `SKEW_ADMIN_SECRET`. Both
    `app/api/analyze/route.ts` and `app/api/scrape/route.ts` import and use it — do not
    inline the check in each route. Also fix the stale header names in the scrape route.

---

## Files to Change or Create

| File | Action |
|---|---|
| `package.json` / `package-lock.json` | install `ai`, `@ai-sdk/openai`, `zod` (pinned exact versions) |
| `.env.local` | rename `OPEN_API_KEY` → `OPENAI_API_KEY` (preserve value) |
| `.env.example` | add `OPENAI_API_KEY` (server only) and `ANALYSIS_BATCH_SIZE=5`; keep §21 table in sync |
| `lib/api/admin-auth.ts` | **create** — `isAuthorized(req)` helper checking `x-skew-admin-secret` / `SKEW_ADMIN_SECRET` |
| `app/api/scrape/route.ts` | **fix** — replace stale inline auth check with `isAuthorized(req)` |
| `lib/ai/schema.ts` | **create** — Zod schema + inferred type for AI analysis output |
| `lib/ai/analyze-article.ts` | **create** — server-only; builds prompt, calls `generateObject`, returns validated result or typed failure |
| `lib/supabase/queries/articles.ts` | **update** — add `getPendingArticles(limit?)` and `saveAnalysis(articleId, insert)` |
| `lib/pipeline/types.ts` | **update** — add `AnalyzeOptions` and `AnalysisSummary` |
| `lib/pipeline/analyze.ts` | **create** — orchestrator: load pending, batch, call AI layer, normalize+derive, validate, save, log |
| `app/api/analyze/route.ts` | **create** — thin POST handler |

---

## Implementation Requirements

### 1. Package installation

Fetch the current latest versions from npm, then install with exact pinning:

```bash
npm install --save-exact ai @ai-sdk/openai zod
```

After install, read the bundled docs at `node_modules/ai/docs/` and
`node_modules/@ai-sdk/openai/docs/` to confirm the correct `generateObject` and
`openai()` provider API for the installed version. Do not write AI SDK calls from
memory.

### 2. `.env.local` fix and `.env.example` update

- Rename `OPEN_API_KEY` → `OPENAI_API_KEY` in `.env.local` (preserving the value).
- Add to `.env.example`:
  ```
  # OpenAI API key — server only
  OPENAI_API_KEY=sk-...

  # Optional: articles analyzed per batch (default 5)
  ANALYSIS_BATCH_SIZE=5
  ```

### 3. `lib/api/admin-auth.ts`

```typescript
import "server-only";
import type { NextRequest } from "next/server";

/**
 * Returns true when the request carries a valid x-skew-admin-secret header.
 * Used by all action routes (§15). Secret is server-only — never logged.
 */
export function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get("x-skew-admin-secret");
  return Boolean(secret && secret === process.env.SKEW_ADMIN_SECRET);
}
```

Update `app/api/scrape/route.ts` to import and use `isAuthorized(req)` in place of
the stale inline check.

### 4. `lib/ai/schema.ts`

Define the Zod schema for AI output and export the inferred TypeScript type.
Field names use camelCase (AI output) — mapped to snake_case when building the DB
insert.

```typescript
import { z } from "zod";

export const AnalysisOutputSchema = z.object({
  summary: z.string().min(1),
  sentimentScore: z.number().min(-1).max(1),
  sentimentLabel: z.enum(["positive", "neutral", "negative"]),
  politicalFramingLabel: z.enum(["left", "center", "right", "mixed", "unclear"]),
  leftPercentage: z.number().int().min(0).max(100),
  centerPercentage: z.number().int().min(0).max(100),
  rightPercentage: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  framingNotes: z.string(),
  loadedTerms: z.array(z.string()),
  disclaimer: z.string(),
});

export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;
```

**Do not** add a `.refine()` sum check here — normalization happens in the pipeline
before the final safeParse, so the schema must accept unnormalized output from the
model.

### 5. `lib/ai/analyze-article.ts`

`import "server-only"` at the top.

**`analyzeArticle(article: ArticleWithRelations)`** function:

- Builds a user message:
  ```
  Source: {sourceName}
  Title: {title}

  {raw_text.slice(0, 8000)}
  ```
- System prompt instructs the AI to:
  - Write a neutral, factual 2–3 sentence summary.
  - Score sentiment from -1 (very negative) to 1 (very positive), with a matching label.
  - Estimate political framing as left/center/right/mixed/unclear — **AI-estimated,
    not objective truth**. Use only article text evidence; do not infer from the source
    name alone.
  - Provide left/center/right percentages summing to 100.
  - Rate confidence (0–1). Use `unclear` + low confidence when evidence is weak or
    percentages are close.
  - List specific framing language cues in `framingNotes`.
  - List charged or partisan words in `loadedTerms`.
  - Include a standard `disclaimer` noting this is AI-estimated framing.
- Calls `generateObject({ model, schema: AnalysisOutputSchema, system, prompt })`.
  Read `node_modules/ai/docs/` for the exact API — never write the call from memory.
- Returns `{ success: true, output: AnalysisOutput }` or
  `{ success: false, error: string }`.
- Catches all thrown errors (network, generation, validation) and returns failure.

### 6. `lib/supabase/queries/articles.ts` additions

Add these two functions — do not modify any existing functions:

**`getPendingArticles(limit?: number): Promise<ArticleWithRelations[]>`**
- `.select("*, sources(name, logo_url), article_analyses(id)")` ordered by
  `created_at` ascending.
- Filter in JS (§21 gotcha): keep rows where `article_analyses` array is empty or null.
- Apply `limit` slice in JS after filtering if provided.

**`saveAnalysis(articleId: string, insert: InsertArticleAnalysis): Promise<void>`**
- Inserts the `article_analyses` row using `createServiceClient()`.
- **Only if insert succeeds:** calls `updateArticleAnalyzedAt(articleId)`.
- Throws on any DB error — caller catches and counts as `failed`.
- `analyzed_at` is never set if the insert fails (§19 rule 6).

### 7. `lib/pipeline/types.ts` additions

Add after existing types — do not change existing types:

```typescript
export interface AnalyzeOptions {
  /** Max articles to analyze in this run. Default: all pending. */
  limit?: number;
  /** Analyze only these article IDs. Default: all pending. */
  articleIds?: string[];
}

export interface AnalysisSummary {
  status: "completed" | "failed";
  pendingFound: number;
  analyzed: number;
  skipped: number;
  failed: number;
  durationMs: number;
  batchCount: number;
  failures: Array<{ articleId: string; title: string; error: string }>;
}
```

### 8. `lib/pipeline/analyze.ts`

`import "server-only"` at the top.

**`normalizePct(left, center, right)`** utility:
- Takes three raw numbers.
- Uses largest-remainder rounding to produce three integers summing to exactly 100.
- Returns `{ left: number; center: number; right: number }`.

**`runAnalysis(options: AnalyzeOptions): Promise<AnalysisSummary>`** orchestrator:

1. Record `startTime = Date.now()`.
2. Fetch pending articles via `getPendingArticles()`.
3. Apply `options.articleIds` filter in JS if provided.
4. Apply `options.limit` slice if provided.
5. Log: `[analyze] Started — pending: N articles`.
6. Process in batches of `ANALYSIS_BATCH_SIZE` (env var, default 5).
7. For each article in a batch:
   a. Log: `[analyze] Processing: "{title}" (id)`.
   b. Call `analyzeArticle(article)` — first attempt.
   c. If failure: retry once.
   d. If still failure: log warn, push to `failures[]`, increment `failed`, continue.
   e. If success:
      - `normalizePct(left, center, right)` → normalized percentages.
      - `bias_score = Math.round((right - left) / 100 * 1000) / 1000`.
      - Build `InsertArticleAnalysis` — map camelCase output → snake_case DB columns.
      - Call `saveAnalysis(article.id, insert)`.
      - On save error: push to `failures[]`, increment `failed`, continue.
      - On save success: increment `analyzed`, log `[analyze] Saved: "{title}"`.
8. After each batch: log `[analyze] Batch N/M complete — analyzed: X, failed: Y`.
9. Build `AnalysisSummary`.
10. Log the final summary object with `console.info`.
11. `createLog({ level: "info", event: "analyze.summary", message: ..., context: summary })`.
12. Return summary.

One article's failure must never abort the batch or the run — wrap each article
in try/catch.

### 9. `app/api/analyze/route.ts`

Mirror `app/api/scrape/route.ts` — thin handler only:

```typescript
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/admin-auth";
import { runAnalysis } from "@/lib/pipeline/analyze";
import type { AnalyzeOptions } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const options: AnalyzeOptions = {};
  try {
    const body = await req.json();
    if (typeof body.limit === "number") options.limit = body.limit;
    if (Array.isArray(body.articleIds)) options.articleIds = body.articleIds;
  } catch { /* body is optional */ }

  try {
    const summary = await runAnalysis(options);
    return NextResponse.json(summary, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis error";
    console.error("[analyze] Unhandled error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

---

## Security Requirements

- `OPENAI_API_KEY` is server-only. Never `NEXT_PUBLIC_`. Add to `.env.example`.
- `SKEW_ADMIN_SECRET` is server-only. Route rejects missing/invalid with `401` via
  `isAuthorized()`.
- Do not expose service role, OpenAI key, or admin secret to browser code.
- Admin secret via header only — never query string.
- All new `lib/ai/*` and `lib/pipeline/analyze.ts` files must start with
  `import "server-only"`.
- Do not weaken RLS or add `SECURITY DEFINER`; writes go through the existing
  service-role client.

---

## Acceptance Criteria

1. `npm install` succeeds; `ai`, `@ai-sdk/openai`, `zod` appear as direct dependencies
   in `package.json`.
2. `OPENAI_API_KEY` is set in `.env.local` (renamed from `OPEN_API_KEY`).
3. `POST /api/analyze` with valid `x-skew-admin-secret` header analyzes all pending
   articles by default, batching until none remain; returns `AnalysisSummary` JSON.
4. `POST /api/analyze` without the header returns `401`.
5. Pending detection uses the LEFT-JOIN / no-analysis-row rule — an article with
   `analyzed_at` set but no `article_analyses` row is still picked up.
6. Each saved analysis has: summary, sentiment score+label, bias label, three
   percentages summing to **exactly 100**, derived `bias_score`, confidence, framing
   notes, loaded terms, disclaimer, model name.
7. `analyzed_at` is set only after the `article_analyses` row is saved successfully.
8. Invalid AI output triggers one retry; if still invalid, article counted as `failed`
   with no row saved and no `analyzed_at` set.
9. Console logs show: run started, per-article result, per-batch summary, final summary.
10. Final summary persisted to `logs` table via `createLog`.
11. Re-running immediately after a full run reports `pendingFound: 0, analyzed: 0`
    (idempotent — no duplicate rows).
12. `app/api/scrape/route.ts` uses `isAuthorized(req)` — stale inline check removed.
13. `npm run typecheck` passes with no errors.
14. `npm run lint` passes with no errors.
15. `npm run build` passes.

---

## Checks to Run

```
npm run typecheck
npm run lint
npm run build
```

---

## Manual Test Steps

Start the dev server (`npm run dev`) and ensure at least a few scraped-but-unanalyzed
articles exist (run `POST /api/scrape` first if needed). Watch the **dev server
terminal** for batch progress logs (§17).

**Test 1 — Auth rejection (no header → 401):**
```cmd
curl -s -o NUL -w "%%{http_code}" -X POST http://localhost:3000/api/analyze -H "Content-Type: application/json" -d "{}"
```
Expected: `401`

**Test 2 — Analyze all pending:**
```cmd
curl -s -X POST http://localhost:3000/api/analyze -H "x-skew-admin-secret: YOUR_SECRET" -H "Content-Type: application/json" -d "{}"
```
Expected summary shape:
```json
{
  "status": "completed",
  "pendingFound": N,
  "analyzed": N,
  "skipped": 0,
  "failed": 0,
  "durationMs": ...,
  "batchCount": ...,
  "failures": []
}
```

**Test 3 — Analyze with a limit:**
```cmd
curl -s -X POST http://localhost:3000/api/analyze -H "x-skew-admin-secret: YOUR_SECRET" -H "Content-Type: application/json" -d "{\"limit\":3}"
```

**Test 4 — Analyze specific article IDs:**
```cmd
curl -s -X POST http://localhost:3000/api/analyze -H "x-skew-admin-secret: YOUR_SECRET" -H "Content-Type: application/json" -d "{\"articleIds\":[\"<uuid>\"]}"
```

**Test 5 — Idempotency (re-run returns 0 analyzed):**
Run Test 2 again. Expected: `"pendingFound": 0, "analyzed": 0`.

**Test 6 — Verify in Supabase:**
Dashboard → Table Editor → `article_analyses`. Check all fields populated.
Check `articles.analyzed_at` is set for analyzed rows.

**Test 7 — Home page and detail page:**
Open `http://localhost:3000` — analyzed articles appear with sentiment and framing.
Click an article — full analysis visible: summary, sentiment, framing percentages,
confidence, framing notes, loaded terms, disclaimer.

**PowerShell equivalents:**
```powershell
# Test 1
Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/analyze" -Headers @{ "Content-Type" = "application/json" } -Body "{}"

# Test 2
Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/analyze" -Headers @{ "x-skew-admin-secret" = "YOUR_SECRET"; "Content-Type" = "application/json" } -Body "{}"

# Test 3
Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/analyze" -Headers @{ "x-skew-admin-secret" = "YOUR_SECRET"; "Content-Type" = "application/json" } -Body "{\"limit\":3}"
```
