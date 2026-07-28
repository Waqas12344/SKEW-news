# Oxylabs Scraping Pipeline (manual scrape-to-insert)

## Goal

Implement SKEW's **manual scraping pipeline** — the `POST /api/scrape` action route and
the layered scrape-to-insert engine behind it (AGENTS.md §9 + §16). On demand, it:

1. Loads selected active sources from Supabase (all active by default; §8).
2. Fetches each source's **homepage HTML live through Oxylabs** (`universal` source, Realtime endpoint).
3. Extracts visible story-card links from the homepage only (§11).
4. Rejects non-article URLs via the **non-article reject list** and source-specific URL checks (§9/§11/§12).
5. Normalizes + dedupes candidates, then skips URLs already in Supabase via the **URL existence check** (≤15 per `.in()`; §9).
6. Scrapes each surviving candidate's **article detail page** through Oxylabs.
7. Validates + cleans each detail page against the **article content gate** (§13).
8. Inserts only valid articles, **append-only** (§10) — never a homepage/listing/category page.
9. Emits **run logging** during the run + a final summary object, returned in the API response and written to `logs`.

**In scope:** the manual scraping engine + `POST /api/scrape` + `GET /api/sources` +
supporting parsing/scraping/pipeline modules + Cheerio dependency + `.env.example` additions.

**Out of scope (separate tasks):** Oxylabs Scheduler (§18), AI analysis / `POST /api/analyze`
(§19), pgvector / Related Articles (§20), Vercel Cron (§18).

The pipeline modules are written so the scheduler task (§18) can reuse the exact same
extract → filter → dedupe → detail-scrape → validate → clean → insert → log logic,
differing only in where the homepage HTML comes from.

---

## Skills Read

- `.agents/skills/oxylabs-web-scraper/SKILL.md` + `examples.md` + `sources.md`
- `.agents/skills/supabase/SKILL.md`
- AGENTS.md §5, §7, §8, §9, §10, §11, §12, §13, §14, §15, §16, §17, §21, §22

---

## Existing Code Inspected

| File | Relevant content |
|---|---|
| `lib/supabase/queries/sources.ts` | `getActiveSources()`, `getAllSources()` — reuse for source selection |
| `lib/supabase/queries/articles.ts` | `getExistingUrls()` (15-chunk), `insertArticle()` |
| `lib/supabase/queries/logs.ts` | `createLog()` — silent, never throws |
| `lib/supabase/server.ts` | `createServiceClient()` — service role, server-only |
| `lib/supabase/types.ts` | `Source`, `InsertArticle`, `InsertLog`, `LogLevel` |
| `supabase/schema.sql` | `articles.url UNIQUE`, `image_url NOT NULL`, `published_at NOT NULL` |
| `supabase/seed.sql` | 5 active sources: Reuters, NPR, Fox News, BBC, The Guardian; `parser_strategy` is null for all |
| `package.json` | No `cheerio`, no `zod` — cheerio must be installed; **no zod** (AI validation is §19) |
| `.env.example` | Missing `OXY_WSA_USERNAME`, `OXY_WSA_PASSWORD`, `Biasly_Admin_Secret` |
| `proxy.ts` | Clerk middleware; `/api/scrape` not in `isProtectedRoute` — route guards itself via admin secret |
| `app/` | No `app/api/` directory exists — all routes are greenfield |

---

## Decisions / Assumptions

1. **Oxylabs client** (`lib/scraping/oxylabs.ts`, server-only): one `fetchHtml(url)` helper →
   `POST https://realtime.oxylabs.io/v1/queries` with Basic Auth from `OXY_WSA_USERNAME` /
   `OXY_WSA_PASSWORD`, body `{ source: "universal", url, render: "html" }`.
   `AbortController` timeout ~180 s. Returns `{ html, statusCode, finalUrl }` from
   `results[0]`. Throws a typed `OxylabsError` on non-200 / empty content / auth failure.
   **No credentials ever reach the browser.**

2. **Layer separation (§5):** distinct modules — Oxylabs calls (`lib/scraping/oxylabs.ts`),
   homepage link extraction (`lib/scraping/extract.ts`), candidate URL filtering
   (`lib/scraping/candidate-url.ts` — single home for the non-article reject list),
   article detail parsing + cleanup (`lib/scraping/article.ts`), orchestration + logging
   (`lib/pipeline/scrape.ts`). Route handler stays thin.

3. **Non-article reject list (§9)** lives in exactly one place: `NON_ARTICLE_PATTERNS`
   constant in `lib/scraping/candidate-url.ts`. Referenced, never duplicated.

4. **Candidate URL check (§12):** same-host, not homepage/reject-list, looks like a real
   article (numeric ID, date-based path, or long multi-word slug).
   Per-host heuristics for the 5 seeded sources:

   | Source | Allow pattern |
   |---|---|
   | Reuters (`reuters.com`) | `/<section>/YYYY-MM-DD/<slug>-<id>` |
   | NPR (`npr.org`) | `/YYYY/MM/DD/<digits>/<slug>` |
   | Fox News (`foxnews.com`) | `/<section>/YYYY/MM/DD/<slug>` — reject `/shows|/games|/live|/video` |
   | BBC (`bbc.com`) | `/news/<topic>-<8+ digits>` or `/news/articles/<slug>` — reject `/sport|/live|/weather` |
   | The Guardian (`theguardian.com`) | `/<section>/YYYY/mon/dd/<slug>` |
   | generic | path depth ≥ 3 segments AND last slug ≥ 20 chars |

   When uncertain → reject (§12: "use the stricter choice").

5. **URL existence check (§9):** `articleUrlsExist(urls)` in
   `lib/supabase/queries/articles.ts` chunks input into groups of **≤15** and queries
   `.in('url', chunk)` per chunk, **also** checks `canonical_url`, returning a `Set` of
   all known URLs. Never passes >15 to a single `.in()`.

6. **Article content gate (§13):** after detail-page parse — must have article-specific
   URL + title, `image_url` (og:image / article `<img>`), `published_at`
   (article:published_time / `<time datetime>` / JSON-LD `datePublished`), and body
   passing **either** ≥3 meaningful paragraphs **or** ≥900 cleaned chars. Reject on
   missing image/date, generic/section title, or body that is mostly nav/captions/ads.
   Canonical URL is also rejected if it points at a listing/category/program/product page.

7. **`raw_text` cleanup (§13):** strip `<script>`, `<style>`, ad/newsletter/subscription/
   related/most-viewed/load-more/social-share blocks, repeated nav labels, inline JS
   errors, CSS class dumps; collapse whitespace; join real paragraphs with `\n\n`.

8. **Canonical URL:** read `<link rel="canonical">` / og:url; reject if it points at a
   listing/category page. Store both `url` (original) and `canonical_url`; dedupe on both.

9. **Append-only insert (§10):** insert valid articles one at a time with `analyzed_at`
   null; on unique-violation (`url`), skip as duplicate — never delete/replace/reset.

10. **Source selection (§8/§16):** request body `{ sources?: string[] (names or IDs),
    limitPerSource?: number }`. Default = all active sources, **5 valid articles per
    source**. Cap candidate detail scrapes per source generously above the target so
    rejects don't starve the limit; stop once `limitPerSource` valid inserts succeed.

11. **Admin secret (§15):** `POST /api/scrape` requires header `Biasly_Admin_Secret` ===
    `process.env.Biasly_Admin_Secret`. Missing/invalid → `401`. Secret never in URL/query,
    never in browser code.

12. **HTTP methods (§14):** scrape is `POST`. `GET /api/sources` is read-only (returns
    active source names/IDs for §8 inspection) — no admin secret required.

13. **Run logging (§9):** structured `console.info/warn/error` lines through the run +
    one final summary object; also persist the summary to `logs` via
    `createLog({ level: "info", event: "scrape.summary", context: summary })`.
    Summary returned as the API response body.

14. **Resilience:** a single source failing (Oxylabs error, bad HTML) is logged and
    skipped; the run continues. Per-article failures are counted, never fatal. "Better
    to insert fewer good articles than bad ones" (§16).

15. **Server-only boundary (§21):** every new `lib/scraping/*` and `lib/pipeline/*`
    module starts with `import "server-only"`. Credentials read from `process.env` in
    server code only.

16. **No `zod`** in this task — validation is done with explicit TypeScript checks.
    Zod validation of AI output is §19.

17. **No status/polling route (§16/§17):** manual scrape is synchronous — the summary
    returns in the `POST /api/scrape` response.

18. **Scheduler reuse:** `lib/pipeline/scrape.ts` exports both:
    - `runManualScrape(options)` — loads sources and calls `fetchHtml` live for homepages
    - `runSourcePipeline(html, source, options)` — the reusable per-source pipeline that
      §18 can call by passing pre-fetched Oxylabs job HTML instead of a live fetch

---

## Files Likely to Change / Be Created

### New package to install
- `cheerio` (pinned) — HTML parsing; no `zod` needed here

### New files

| Path | Purpose |
|---|---|
| `lib/pipeline/types.ts` | `ScrapeSummary`, `SourceRunResult`, `RejectionReason`, `ScrapeOptions` |
| `lib/scraping/oxylabs.ts` | Oxylabs Realtime client: `fetchHtml(url)` + `OxylabsError` |
| `lib/scraping/extract.ts` | `extractCandidateLinks(html, source)` — homepage story-card links via Cheerio |
| `lib/scraping/candidate-url.ts` | `NON_ARTICLE_PATTERNS`, `normalizeUrl`, `isRejectedUrl`, `isLikelyArticleUrl` |
| `lib/scraping/article.ts` | `parseArticle(html, url, source)` — detail page extraction + content gate + cleanup |
| `lib/pipeline/scrape.ts` | `runManualScrape(options)` + `runSourcePipeline(html, source, options)` |
| `app/api/scrape/route.ts` | Thin `POST` handler — admin secret → parse body → `runManualScrape` → `Response.json` |
| `app/api/sources/route.ts` | Thin `GET` handler — returns active sources for §8 inspection |

### Modified files

| Path | Change |
|---|---|
| `lib/supabase/queries/articles.ts` | Add `articleUrlsExist(urls)` checking both `url` and `canonical_url` in ≤15 chunks |
| `package.json` / `package-lock.json` | Add `cheerio` pinned |
| `.env.example` | Add `OXY_WSA_USERNAME`, `OXY_WSA_PASSWORD`, `Biasly_Admin_Secret` |

---

## Implementation Requirements

### Constants (centralized in each module)
```ts
const DEFAULT_LIMIT_PER_SOURCE = 5;
const MAX_URLS_PER_IN_QUERY = 15;
const OXYLABS_TIMEOUT_MS = 180_000;
const DEFAULT_CANDIDATE_CAP = 30; // max detail pages to scrape per source before stopping
```

---

### `lib/pipeline/types.ts`
```ts
export interface RejectionReason {
  reason: string;
  count: number;
}

export interface SourceRunResult {
  sourceName: string;
  candidatesFound: number;
  candidatesRejected: number;
  duplicatesSkipped: number;
  detailsScraped: number;
  articlesInserted: number;
  articlesRejected: number;
  articlesFailed: number;
  error?: string;
}

export interface ScrapeSummary {
  status: "completed" | "failed";
  sourcesChecked: number;
  candidatesFound: number;
  candidatesRejected: number;
  duplicatesSkipped: number;
  detailPagesScraped: number;
  articlesInserted: number;
  articlesRejected: number;
  articlesFailed: number;
  durationMs: number;
  rejectionReasons: RejectionReason[];
  sourceResults: SourceRunResult[];
}

export interface ScrapeOptions {
  sources?: string[];        // source names or IDs to restrict run (default: all active)
  limitPerSource?: number;   // max valid articles per source (default: 5)
}
```

---

### `lib/scraping/oxylabs.ts`
- `import "server-only"` at top
- Export `fetchHtml(url: string): Promise<OxylabsResult>` where
  `OxylabsResult = { html: string; statusCode: number; finalUrl: string }`
- POST to `https://realtime.oxylabs.io/v1/queries`
- Header: `Authorization: Basic ${btoa(user + ":" + pass)}` + `Content-Type: application/json`
- Body: `{ source: "universal", url, render: "html" }`
- Wrap with `AbortController`, abort after `OXYLABS_TIMEOUT_MS`
- Read `results[0].content` (HTML), `results[0].status_code`, `results[0].url`
- Throw `OxylabsError` (extends `Error`) with a `code` field on: network error,
  non-200 Oxylabs HTTP response, missing/empty `content`, or `status_code >= 400`
- Never log credentials

---

### `lib/scraping/extract.ts`
- `import "server-only"` at top
- Export `extractCandidateLinks(html: string, source: Source): string[]`
- Load HTML with Cheerio
- Collect `<a href>` from visible story/headline containers — **not** nav/menu/footer/aside/
  subscription regions
- Generic fallback selectors: `main a[href]`, `article a[href]`, `#content a[href]`,
  `.content a[href]`, then `body a[href]` as last resort
- Absolutize relative hrefs against `source.listing_url` using `new URL(href, base).href`
- Keep only same-host links (compare `new URL(href).hostname` to source host)
- Return deduplicated array (via `Set`)

---

### `lib/scraping/candidate-url.ts`
- `import "server-only"` at top
- Define `NON_ARTICLE_PATTERNS: RegExp[]` — canonical single list per §9:
  - Category/section: `/\/(category|categories|section|sections)\//i`
  - Topic/tag: `/\/(topic|topics|tag|tags)\//i`
  - Author/profile: `/\/(author|authors|profile|profiles)\//i`
  - Search: `/\/search(\?|\/|$)/i`
  - Show/program/podcast: `/\/(show|shows|program|programs|podcast|podcasts)\//i`
  - Live: `/\/(live|live-[a-z]|-live\/)/i`
  - Game: `/\/(game|games)\//i`
  - Product/review/shop: `/\/(product|products|review|reviews|shop|shopping)\//i`
  - Corporate/support: `/\/(about|contact|terms|privacy|corporate|support|help|faq)(\/|$)/i`
  - Newsletter/subscribe: `/\/(newsletter|subscribe|subscription)\//i`
  - Navigation depth < 2: path split by `/` with fewer than 2 real segments
- Export `normalizeUrl(url: string): string` — strip fragment, strip known tracking
  query params (`utm_*`, `ref`, `source`, `campaign`), strip trailing slash
- Export `isRejectedUrl(url: string, sourceListingUrl: string): boolean` — true if URL
  equals the homepage OR matches any `NON_ARTICLE_PATTERNS`
- Export `isLikelyArticleUrl(url: string, sourceHostname: string): boolean` — per-host
  heuristics as documented in Decisions §4, plus generic fallback (path depth ≥ 3 AND
  last slug ≥ 20 chars)
- Export `filterCandidates(urls: string[], source: Source): { kept: string[]; rejectedCount: number }`
  — applies normalize → isRejectedUrl → isLikelyArticleUrl

---

### `lib/scraping/article.ts`
- `import "server-only"` at top
- Export:
  ```ts
  export interface ParsedArticle {
    url: string;
    canonical_url: string | null;
    title: string;
    image_url: string;
    published_at: string;   // ISO string
    raw_text: string;
    source_id: string;
  }
  export interface ParseFailure {
    url: string;
    reason: string;
  }
  export type ParseResult = { ok: true; article: ParsedArticle } | { ok: false; failure: ParseFailure };
  ```
- Export `parseArticle(html: string, url: string, source: Source): ParseResult`

**Extraction order:**

`canonical_url`:
1. `<link rel="canonical" href>`
2. `<meta property="og:url" content>`
3. null — keep original `url`
Reject if canonical points at a listing/category/program/product page.

`title`:
1. `<meta property="og:title" content>`
2. `<meta name="title" content>`
3. `<title>` text, strip ` | site` or ` - site` suffix
4. First `h1` text
Reject if title is < 15 chars, all caps section name, or matches known category patterns.

`published_at`:
1. `<meta property="article:published_time" content>`
2. `<time[datetime]>` — pick earliest ISO-8601 value
3. `<meta name="date" content>`
4. JSON-LD `<script type="application/ld+json">` → `datePublished` where `@type` includes `Article`
5. If none found → ParseFailure("missing published_at")

`image_url`:
1. `<meta property="og:image" content>`
2. `<meta name="twitter:image" content>`
3. First `article img[src]` (skip data URIs and < 100px width)
4. First `main img[src]`
5. If none found → ParseFailure("missing image_url")

`raw_text` cleanup (§13):
1. Remove from DOM: `script, style, noscript, nav, header, footer, aside, form, button,
   iframe, [class*="ad"], [class*="advert"], [class*="sponsor"], [class*="newsletter"],
   [class*="subscribe"], [class*="related"], [class*="most-viewed"], [class*="load-more"],
   [class*="social"], [id*="comments"], [class*="cookie"], [class*="promo"]`
2. Collect `p` text from `article, main, .article-body, .story-body,
   [class*="article__body"], [class*="story__body"]` — join with `\n\n`
3. If result < 900 chars, broaden to `article p, main p, section p`
4. Strip lines that are purely nav labels, URLs, or < 20 chars
5. Collapse multiple blank lines to one

**Content gate:**
- Fail if `raw_text` has < 3 meaningful paragraphs (lines > 60 chars) AND < 900 chars total

---

### `lib/supabase/queries/articles.ts` — additions
Add `articleUrlsExist(urls: string[]): Promise<Set<string>>`:
- Chunks into groups of `MAX_URLS_PER_IN_QUERY = 15`
- Per chunk: query `url` column with `.in('url', chunk)` AND separately query
  `canonical_url` column with `.in('canonical_url', chunk)` (two separate queries per chunk)
- Union all results into a single `Set<string>` and return
- On query error, throw with a descriptive message

---

### `lib/pipeline/scrape.ts`
- `import "server-only"` at top
- Export `runSourcePipeline(html: string, source: Source, limitPerSource: number, rejectionLog: Map<string, number>): Promise<SourceRunResult>`
  — the reusable per-source pipeline (§18 reuse). Takes pre-fetched homepage HTML:
  1. `extractCandidateLinks(html, source)` → raw candidates
  2. `filterCandidates(candidates, source)` → `{ kept, rejectedCount }`
  3. `articleUrlsExist(kept)` → `existingSet`
  4. `newCandidates = kept.filter(u => !existingSet.has(u))`.slice up to `DEFAULT_CANDIDATE_CAP`
  5. For each `newCandidate` (stop at `limitPerSource` valid inserts):
     - `fetchHtml(candidateUrl)` → detail HTML
     - `parseArticle(html, url, source)` → `ParseResult`
     - If ok: `insertArticle(...)` — on unique-constraint error, count as duplicate
     - If failure: increment rejected count, record reason in `rejectionLog`
     - On fetch/parse throws: increment failed count
  6. Return `SourceRunResult`

- Export `runManualScrape(options: ScrapeOptions): Promise<ScrapeSummary>`
  1. `getActiveSources()` → filter by `options.sources` (match name or id) if provided
  2. Console: `[scrape] Started — sources: X, Y, Z`
  3. For each source:
     - Console: `[scrape:SourceName] Fetching homepage…`
     - `fetchHtml(source.listing_url)` → homepage HTML
     - Console: `[scrape:SourceName] Homepage fetched. Running pipeline…`
     - `runSourcePipeline(html, source, limitPerSource, rejectionLog)`
     - Console: `[scrape:SourceName] Done — inserted: N, rejected: M, failed: K`
     - On source-level error: console.error + log to DB, continue
  4. Aggregate into `ScrapeSummary`
  5. Console: `[scrape] Completed in Xs — inserted: N, rejected: M, failed: K`
  6. `createLog({ level: "info", event: "scrape.summary", context: summary })`
  7. Return summary

---

### `app/api/scrape/route.ts`
```ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { runManualScrape } from "@/lib/pipeline/scrape";
import type { ScrapeOptions } from "@/lib/pipeline/types";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("Biasly_Admin_Secret");
  if (!secret || secret !== process.env.Biasly_Admin_Secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let options: ScrapeOptions = {};
  try {
    const body = await req.json();
    if (Array.isArray(body.sources)) options.sources = body.sources;
    if (typeof body.limitPerSource === "number") options.limitPerSource = body.limitPerSource;
  } catch {
    // body is optional — default options are fine
  }

  try {
    const summary = await runManualScrape(options);
    return NextResponse.json(summary, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

---

### `app/api/sources/route.ts`
```ts
import { NextResponse } from "next/server";
import { getActiveSources } from "@/lib/supabase/queries/sources";

export async function GET() {
  const sources = await getActiveSources();
  return NextResponse.json(
    sources.map((s) => ({ id: s.id, name: s.name, listing_url: s.listing_url }))
  );
}
```

---

## Security Requirements

- `OXY_WSA_USERNAME`, `OXY_WSA_PASSWORD`, `Biasly_Admin_Secret` are **server-only** — read
  from `process.env` only in server modules; never `NEXT_PUBLIC_`, never in a client
  component, never in a response body.
- All `lib/scraping/*` and `lib/pipeline/*` modules start with `import "server-only"`.
- `POST /api/scrape` rejects missing/invalid `Biasly_Admin_Secret` with `401` before
  doing any work. Secret is a header, never a query param.
- No Oxylabs call, scraping, or insert runs from browser code (§21).
- Error responses never echo credentials, the admin secret, or Oxylabs auth details.
- Scraping writes are append-only; the pipeline never deletes/updates existing article rows.

---

## Acceptance Criteria

1. `POST /api/scrape` with valid `Biasly_Admin_Secret` runs the full pipeline and returns `ScrapeSummary` JSON; dev-server terminal shows structured run log + final summary object.
2. Missing/invalid admin secret → `401`, no scraping performed.
3. Only valid article detail pages are inserted — homepages, listing/category/topic/show/live/product pages never stored as articles.
4. Duplicates (existing `url` or `canonical_url`) are skipped, not re-inserted; existing rows untouched (append-only).
5. Every inserted article has non-empty `title`, real `image_url`, real `published_at`, clean `raw_text`, and `analyzed_at` null.
6. `GET /api/sources` returns active sources (id, name, listing_url) with no secret required.
7. No Oxylabs credentials or admin secret in the client bundle or any response body.
8. `npm run typecheck`, `npm run lint`, `npm run build` all pass.

---

## Checks to Run

```bash
npm run typecheck
npm run lint
npm run build
```

---

## Manual Test Steps

Prereqs: `.env.local` has `Biasly_Admin_Secret`, `OXY_WSA_USERNAME`, `OXY_WSA_PASSWORD`,
and the Supabase vars; schema + seed already applied (5 active sources).
Run `npm run dev` and **watch the dev-server terminal** — scrape progress logs there (§17).

**1. Inspect sources (§8):**
```bash
curl http://localhost:3000/api/sources
```
Expect 5 sources with id, name, listing_url.

**2. Missing secret → 401:**
```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/scrape" `
  -Headers @{ "Content-Type" = "application/json" } -Body '{}'
```
Expect 401, no scraping in terminal.

**3. Scrape specific sources:**
```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/scrape" `
  -Headers @{ "Biasly_Admin_Secret" = "YOUR_SECRET"; "Content-Type" = "application/json" } `
  -Body '{"sources":["Reuters","NPR","BBC"],"limitPerSource":5}'
```
Watch terminal for per-source logs. Response body = `ScrapeSummary`.

**4. Default scrape (all active, 5 each):**
```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/scrape" `
  -Headers @{ "Biasly_Admin_Secret" = "YOUR_SECRET"; "Content-Type" = "application/json" } `
  -Body '{}'
```

**5. Verify in Supabase** — Table Editor → `articles`: rows with non-null `image_url`,
`published_at`, clean `raw_text`, `analyzed_at` null. Check `logs` for `scrape.summary` row.

**6. Idempotency:** re-run step 3 → `articlesInserted` ≈ 0 (all duplicates), existing rows unchanged.

**7. Note:** articles won't appear on the home page yet — that requires AI analysis (§19).
Confirm via DB, not `/`.

**8. Re-run checks:**
```bash
npm run typecheck && npm run lint && npm run build
```
