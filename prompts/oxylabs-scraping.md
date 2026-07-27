# Oxylabs Scraping Pipeline

## Goal

Implement `POST /api/scrape` — the manual scraping endpoint that runs the full
scrape-to-insert pipeline defined in AGENTS.md §9 and §16.

The route loads active sources from Supabase, fetches each homepage via Oxylabs,
extracts article candidate links, filters non-articles, dedupes against the DB,
scrapes article detail pages, validates each article, and inserts valid rows.

---

## Skills Read

- `.agents/skills/oxylabs-web-scraper/SKILL.md`
- `.agents/skills/supabase/SKILL.md`

---

## Existing Code Inspected

| File | Relevant content |
|---|---|
| `lib/supabase/queries/sources.ts` | `getActiveSources()` — loads active sources |
| `lib/supabase/queries/articles.ts` | `getExistingUrls()` (15-chunk), `insertArticle()` |
| `lib/supabase/queries/logs.ts` | `createLog()` — silent, never throws |
| `lib/supabase/server.ts` | `createServiceClient()` — service role, server-only |
| `lib/supabase/types.ts` | `Source`, `InsertArticle`, `InsertLog`, `LogLevel` |
| `supabase/schema.sql` | `articles.url UNIQUE`, `image_url NOT NULL`, `published_at NOT NULL` |
| `supabase/seed.sql` | 5 active sources: Reuters, NPR, Fox News, BBC, The Guardian |
| `package.json` | cheerio, zod, @types/cheerio — NOT installed; must be added |
| `.env.example` | `OXY_WSA_USERNAME`, `OXY_WSA_PASSWORD`, `BIASLY_ADMIN_SECRET` |
| `app/` | No `app/api/` directory exists — route is greenfield |

---

## Decisions and Assumptions

1. **Oxylabs source**: use `"universal"` for all scraping (news sites are not
   among the 40+ natively parsed sources). No `parse: true`. Raw HTML returned
   in `results[0].content`.

2. **Realtime endpoint**: use `https://realtime.oxylabs.io/v1/queries` for both
   homepage and article-detail fetches (immediate response, no polling needed).

3. **Default per-source limit**: 5 valid articles per source as per §16.
   Request body can override with `sourcesLimit` and `articlesPerSource`.

4. **Source selection**: always load from Supabase `sources` table — never
   hardcoded URLs.

5. **cheerio + zod must be installed** before implementing the parsing and
   validation layers.

6. **Parser strategy**: the `sources.parser_strategy` field is nullable. We
   use a strategy map keyed on the value. If null or unrecognised, fall back to
   the generic homepage link extractor. Known strategies:
   - `reuters` — Reuters-specific card selectors
   - `npr` — NPR-specific card selectors
   - `foxnews` — Fox News-specific card selectors
   - `bbc` — BBC-specific card selectors
   - `guardian` — Guardian-specific card selectors

7. **Article URL regex patterns**: each source has a known article URL pattern
   stored in the parser strategy map. Use these for candidate filtering (§12).

8. **Text extraction**: use Cheerio to strip scripts, styles, nav, footer,
   header, aside, figure, form, button, noscript, and known ad/newsletter
   block classes, then join remaining `p` text nodes with double newlines.
   If that returns < 900 chars, also include `article`, `main`, and `section`
   block text as fallback. Apply the full cleanup list from §13.

9. **Published date**: look in order:
   - `<meta property="article:published_time" content="…">`
   - `<time datetime="…">`
   - `<meta name="date" content="…">`
   - JSON-LD `datePublished`
   If none found, reject the article (§13).

10. **Image URL**: look in order:
    - `<meta property="og:image" content="…">`
    - `<meta name="twitter:image" content="…">`
    - `article img[src]` (first)
    - `main img[src]` (first)
    If none found, reject the article (§13).

11. **Canonical URL**: use `<link rel="canonical" href="…">` if present, else
    keep the scraped URL as canonical.

12. **Title**: use `<meta property="og:title">` → `<meta name="title">` →
    `<title>` → `h1`. Reject if it matches generic/category patterns.

13. **Article validation gate** (§13): accept only if ALL of:
    - image_url present
    - published_at present and parseable as a valid date
    - title is article-specific (not a category/section/homepage name)
    - body passes the quality gate: ≥ 3 meaningful paragraphs (> 60 chars each)
      OR ≥ 900 meaningful chars after cleanup
    - url is article-specific (not a homepage/listing/category URL)

14. **Non-article reject list** (§9): applied at candidate link stage.
    Patterns cover category, tag, author, search, show, podcast, live, game,
    product, corporate, newsletter, and subscription pages.

15. **Logging**: console.log with structured prefixes AND `createLog()` to DB
    for key events. Log events: `scrape:started`, `scrape:source:start`,
    `scrape:homepage:fetched`, `scrape:candidates:found`,
    `scrape:candidates:rejected`, `scrape:duplicates:skipped`,
    `scrape:details:scraped`, `scrape:article:inserted`,
    `scrape:article:rejected`, `scrape:source:error`, `scrape:completed`,
    `scrape:failed`.

16. **Admin secret check**: read `BIASLY_ADMIN_SECRET` from env. Return 401
    if header `x-biasly-admin-secret` is missing or does not match.

17. **Timeout**: Realtime Oxylabs calls can take up to 180 s. Set a 170 s
    `AbortSignal.timeout` on each fetch so the Next.js route does not hang
    indefinitely. The route itself should not exceed Vercel's 60 s limit per
    source; if a source times out, log it, continue to the next source.

18. **Zod validation**: validate the request body shape. Validate the
    article-detail result (image_url, published_at, title present and non-empty)
    before inserting.

---

## Files Likely to Change / Be Created

### New packages to install
- `cheerio` — HTML parsing
- `@types/cheerio` — types (may already be bundled)
- `zod` — validation

### New files
| Path | Purpose |
|---|---|
| `app/api/scrape/route.ts` | POST /api/scrape handler |
| `lib/scraping/oxylabs.ts` | Oxylabs fetch wrapper (homepage + detail) |
| `lib/scraping/parser.ts` | Source-specific homepage link extraction |
| `lib/scraping/candidate-filter.ts` | Non-article URL rejection |
| `lib/scraping/article-extractor.ts` | Detail page text/date/image extraction |
| `lib/scraping/article-validator.ts` | Zod-backed article validation gate |
| `lib/pipeline/scrape.ts` | Orchestrates the full scrape-to-insert pipeline |
| `lib/pipeline/types.ts` | Typed pipeline result / run summary |

### Modified files
| Path | Change |
|---|---|
| `package.json` | Add cheerio, zod |

---

## Implementation Requirements

### 1. Install packages

```bash
npm install cheerio zod
```

### 2. `lib/pipeline/types.ts`

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

export interface ScrapeRunSummary {
  status: "completed" | "failed";
  sourcesChecked: number;
  candidatesFound: number;
  candidatesRejected: number;
  duplicatesSkipped: number;
  detailsScraped: number;
  articlesInserted: number;
  articlesRejected: number;
  articlesFailed: number;
  totalDurationMs: number;
  rejectionReasonsByCount: RejectionReason[];
  sourceResults: SourceRunResult[];
}
```

### 3. `lib/scraping/oxylabs.ts`

- Export `fetchPageHtml(url: string): Promise<string>` — wraps the Oxylabs
  Realtime API call using Basic auth from `OXY_WSA_USERNAME` / `OXY_WSA_PASSWORD`.
- Body: `{ source: "universal", url, user_agent_type: "desktop_chrome" }`.
- Use `fetch` with `Authorization: Basic base64(user:pass)` header.
- Set `signal: AbortSignal.timeout(170_000)`.
- Extract `results[0].content` and return it as a string.
- Throw a typed `OxylabsError` on non-200 HTTP or missing content.
- Never log credentials.

### 4. `lib/scraping/parser.ts`

Export `extractCandidateLinks(html: string, source: Source): string[]`.

Strategy map keyed on `source.parser_strategy ?? "generic"`:

| strategy | Selector(s) to try |
|---|---|
| `reuters` | `a[href]` inside `[class*="story-card"]`, `[class*="media-story-card"]` |
| `npr` | `a[href]` inside `.story-wrap`, `.item` with `h2 a` or `h3 a` |
| `foxnews` | `a[href]` inside `.article-list article`, `.content article` |
| `bbc` | `a[href]` inside `[data-testid="internal-link"]`, `.gs-c-promo-heading a` |
| `guardian` | `a[href]` inside `[data-link-name="article"]`, `.fc-item__container a` |
| `generic` | all `a[href]` inside `main`, `article`, `#content`, `.content`, falling back to `body a[href]` |

After collecting raw hrefs:
- Resolve relative URLs against `source.listing_url` using `new URL(href, base)`.
- Keep only same-host links.
- Return deduplicated array of absolute URL strings.

### 5. `lib/scraping/candidate-filter.ts`

Export `filterCandidates(urls: string[], source: Source): { kept: string[]; rejectedCount: number }`.

Apply two layers:

**Layer 1 — non-article reject list** (§9): reject if the URL path matches any of:
- `/category/`, `/categories/`, `/section/`, `/sections/`, `/topic/`, `/topics/`,
  `/tag/`, `/tags/`, `/author/`, `/authors/`, `/profile/`, `/search`,
  `/show/`, `/shows/`, `/program/`, `/programs/`, `/podcast/`, `/podcasts/`,
  `/live`, `/live-`, `-live/`, `/game/`, `/games/`, `/product/`, `/products/`,
  `/review/`, `/reviews/`, `/shop/`, `/shopping/`, `/about`, `/contact`,
  `/terms`, `/privacy`, `/newsletter`, `/subscribe`, `/subscription`,
  `/corporate`, `/support`, `/help`, `/faq`
- URL is exactly the source homepage (`listing_url`)
- URL ends in `/` with a path depth < 2 (homepage-like)

**Layer 2 — source-specific article URL pattern**: each strategy has an allow
regex. A URL must match to be kept.

| strategy | Allow pattern |
|---|---|
| `reuters` | `/[a-z\-]+/\d{4}-\d{2}-\d{2}/` — date-path articles |
| `npr` | `/\d{4}/\d{2}/\d{2}/\d+/` — NPR story IDs |
| `foxnews` | `/[a-z\-]+/\d{4}/\d{2}/\d{2}/[a-z0-9\-]+` |
| `bbc` | `/news/[a-z\-]+-\d{8,}` OR `/news/articles/[a-z0-9\-]+` |
| `guardian` | `/\d{4}/[a-z]{3}/\d{2}/[a-z0-9\-]+` |
| `generic` | path length > 3 segments and slug length > 20 chars |

Return only URLs that pass both layers.

### 6. `lib/scraping/article-extractor.ts`

Export `extractArticleData(html: string, url: string, sourceId: string): ExtractedArticle | null`.

```ts
export interface ExtractedArticle {
  url: string;
  canonical_url: string | null;
  title: string;
  image_url: string;
  published_at: string; // ISO string
  raw_text: string;
  source_id: string;
}
```

Extraction steps (in order):

**canonical_url**: `<link rel="canonical">` → null.

**title**:
1. `<meta property="og:title">`
2. `<meta name="title">`
3. `<title>` (strip site name suffix after ` | ` or ` - `)
4. First `h1`

**published_at**:
1. `<meta property="article:published_time">`
2. `<time[datetime]>` — pick the earliest if multiple
3. `<meta name="date">`
4. JSON-LD `@type Article` `datePublished`
5. If none found → return null (article will be rejected by validator)

**image_url**:
1. `<meta property="og:image">`
2. `<meta name="twitter:image">`
3. First `article img[src]`
4. First `main img[src]`
5. If none found → return null (article will be rejected)

**raw_text cleanup** (§13):
- Use cheerio to load the HTML.
- Remove: `script`, `style`, `noscript`, `nav`, `header`, `footer`, `aside`,
  `form`, `button`, `figure` (optional if no figcaption with text), `iframe`,
  `[class*="ad"]`, `[class*="advert"]`, `[class*="sponsor"]`,
  `[class*="newsletter"]`, `[class*="subscribe"]`, `[class*="related"]`,
  `[class*="most-viewed"]`, `[class*="load-more"]`, `[class*="social"]`,
  `[id*="comments"]`.
- Collect all `p` text from `article, main, .article-body, .story-body,
  [class*="article"], [class*="story"]`.
- Join with `\n\n`. Strip trailing whitespace per line.
- If result < 900 chars, broaden to `article p, main p, section p`.
- If still < 900 chars, accept only if paragraph count ≥ 3 (quality gate
  passes by count, §13).
- Return the cleaned string.

### 7. `lib/scraping/article-validator.ts`

Export `validateArticle(candidate: Partial<ExtractedArticle>, sourceStrategy: string | null): ValidationResult`.

```ts
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}
```

Reject if:
- `image_url` is null or empty
- `published_at` is null, empty, or not parseable as a valid `Date`
- `title` is null, empty, or a generic/category name (< 15 chars or matches
  known category patterns)
- `raw_text` body fails both quality tests: < 3 paragraphs AND < 900 chars
- `url` matches any non-article pattern from the reject list (§9)

Accept if all checks pass.

Use Zod for the final shape check before returning valid.

### 8. `lib/pipeline/scrape.ts`

Export `runScrapePipeline(options: ScrapeOptions): Promise<ScrapeRunSummary>`.

```ts
export interface ScrapeOptions {
  sourcesLimit?: number;       // max number of sources to process (default: all)
  articlesPerSource?: number;  // max valid articles per source (default: 5)
}
```

Pipeline steps (§9):

```
1. Load active sources from Supabase (getActiveSources), slice to sourcesLimit.
2. Log scrape:started with source names and options.
3. For each source:
   a. Log scrape:source:start.
   b. fetchPageHtml(source.listing_url) via Oxylabs → raw homepage HTML.
   c. Log scrape:homepage:fetched.
   d. extractCandidateLinks(html, source) → candidate URLs.
   e. Log scrape:candidates:found.
   f. filterCandidates(candidates, source) → { kept, rejectedCount }.
   g. Log scrape:candidates:rejected.
   h. getExistingUrls(kept) → existingSet.
   i. newCandidates = kept.filter(u => !existingSet.has(u)).
   j. Log scrape:duplicates:skipped with count.
   k. For each newCandidate (stop when articlesInserted for this source >= articlesPerSource):
      i.   fetchPageHtml(candidateUrl) via Oxylabs → detail HTML.
      ii.  Log scrape:details:scraped.
      iii. extractArticleData(html, url, source.id).
      iv.  validateArticle(extracted, source.parser_strategy).
      v.   If valid: insertArticle → log scrape:article:inserted.
      vi.  If invalid: log scrape:article:rejected with reason.
      vii. If fetch/extract throws: log scrape:article:failed.
   l. Catch source-level error → log scrape:source:error, continue.
4. Build and return ScrapeRunSummary.
5. Log scrape:completed with full summary object.
```

Console logging format:
```
[scrape] Started — sources: Reuters, NPR, Fox News, BBC, The Guardian
[scrape:Reuters] Fetching homepage...
[scrape:Reuters] Homepage fetched. Candidates: 28
[scrape:Reuters] After filtering: 14 kept, 14 rejected
[scrape:Reuters] After deduplication: 11 new candidates
[scrape:Reuters] Scraped detail page: https://...
[scrape:Reuters] Inserted article: "Article Title" (id: uuid)
[scrape:Reuters] Rejected article: no image — https://...
[scrape] Completed in 42.3s — inserted: 8, rejected: 6, failed: 1
```

### 9. `app/api/scrape/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { runScrapePipeline } from "@/lib/pipeline/scrape";

export const maxDuration = 300; // Vercel Pro/Hobby max

export async function POST(req: NextRequest) {
  // 1. Admin secret check (§15)
  const secret = req.headers.get("x-biasly-admin-secret");
  if (!secret || secret !== process.env.BIASLY_ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse optional body
  let sourcesLimit: number | undefined;
  let articlesPerSource = 5;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.sourcesLimit === "number") sourcesLimit = body.sourcesLimit;
    if (typeof body.articlesPerSource === "number") articlesPerSource = body.articlesPerSource;
  } catch {
    // ignore parse errors — body is optional
  }

  // 3. Run pipeline
  const summary = await runScrapePipeline({ sourcesLimit, articlesPerSource });

  return NextResponse.json(summary, {
    status: summary.status === "completed" ? 200 : 500,
  });
}
```

---

## Security Requirements

- `BIASLY_ADMIN_SECRET` read only from `process.env` on the server. Never sent
  to the client or logged.
- `OXY_WSA_USERNAME` / `OXY_WSA_PASSWORD` used only inside `lib/scraping/oxylabs.ts`
  (server-only module). Never logged or returned in API responses.
- `lib/scraping/oxylabs.ts` must import `"server-only"` at the top.
- `lib/pipeline/scrape.ts` must import `"server-only"` at the top.
- All Supabase writes use the service-role client, never the anon key.

---

## Acceptance Criteria

1. `POST /api/scrape` with a valid `x-biasly-admin-secret` header returns 200
   and a `ScrapeRunSummary` JSON object.
2. `POST /api/scrape` without the secret returns 401.
3. Articles already in the DB are skipped (dedupe works — second scrape inserts 0
   duplicates).
4. Articles missing `image_url` or `published_at` are rejected and logged.
5. Non-article candidate URLs (category, tag, author, etc.) are filtered before
   detail scraping.
6. The terminal running the dev server shows structured console log output for
   every meaningful pipeline event.
7. `npm run typecheck` and `npm run lint` pass with no errors.

---

## Checks to Run

```bash
npm run typecheck
npm run lint
```

---

## Manual Test Steps

1. Start the dev server: `npm run dev` (watch this terminal for pipeline logs).
2. Confirm `BIASLY_ADMIN_SECRET`, `OXY_WSA_USERNAME`, `OXY_WSA_PASSWORD` are
   set in `.env.local`.
3. Run a full scrape (all sources, 5 articles each):

```powershell
Invoke-RestMethod -Method POST `
  -Uri "http://localhost:3000/api/scrape" `
  -Headers @{ "x-biasly-admin-secret" = "YOUR_SECRET"; "Content-Type" = "application/json" } `
  -Body '{"articlesPerSource": 5}'
```

Or with curl (if available):
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "x-biasly-admin-secret: YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"articlesPerSource": 5}'
```

4. Check the dev server terminal — you should see per-source progress logs.
5. Check the JSON response — look for `status: "completed"`, `articlesInserted > 0`.
6. Run scrape a second time — `articlesInserted` should be 0 (all duplicates).
7. Check Supabase Dashboard → Table Editor → articles — new rows should appear.
8. Test 401: remove the header → expect `{"error":"Unauthorized"}` with status 401.
9. Limit to 1 source: add `"sourcesLimit": 1` to body — only one source is
   processed.
