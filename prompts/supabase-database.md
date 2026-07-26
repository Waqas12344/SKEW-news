# Supabase Database & Data Access Layer

## Goal

Stand up Skew's Supabase data layer and wire the UI to it:

1. **Schema** — six core tables (`sources`, `articles`, `article_analyses`, `logs`,
   `oxylabs_schedules`, `oxylabs_schedule_runs`) in `supabase/schema.sql`, without the
   `embedding` column (deferred to §20).
2. **Seed** — `supabase/seed.sql` inserting the five §11 example sources as active rows.
3. **Types** — hand-written `Database` type + row/insert convenience types in
   `lib/supabase/types.ts`.
4. **Client** — server-only service-role Supabase client factory.
5. **Queries** — typed read functions for home feed and detail page, plus a log writer.
6. **Mapper** — pure functions converting query rows to the existing `ArticleCardProps`
   shape (home) and to the inline data shape used by `app/news/[id]/page.tsx` (detail).
7. **Wire pages** — replace mock data in both pages with live Supabase reads; empty /
   not-found states; `force-dynamic`.

Scraping, scheduler, AI analysis, and pgvector/embedding are **out of scope here**.


## Skills read

- `.agents/skills/supabase/SKILL.md` — verify against changelog before implementing;
  enable RLS on every table; never expose service-role key to browser; joined-table
  filter gotcha (§21); pin package versions + commit lockfile.
- AGENTS.md §7 (schema fields), §8–§13 (scraper-populated fields), §19 (analysis fields +
  card/detail display), §20 (pgvector deferral), §21 (env vars, server/client boundary).

## Existing code inspected

| File | Key finding |
|------|-------------|
| `package.json` | Next.js 16.2.11, React 19, Tailwind v4. **No Supabase package installed.** |
| `.env.local` | Contains `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` already. |
| `.env.example` | Only Clerk vars — must add Supabase placeholders. |
| `app/page.tsx` | Uses `ArticleCardProps[]` mock inline; renders `<ArticleCard>` grid. No shared type file. |
| `app/news/[id]/page.tsx` | Uses `MOCK_ARTICLE` inline (no shared module). Inline `BiasLabel`/`SourceRow` types. Related stories hard-coded as `RELATED_STORIES`. |
| `components/ui/article-card.tsx` | Exports `ArticleCardProps` interface — the UI contract the home page consumes. |
| `components/ui/related-article-card.tsx` | Exports `RelatedArticleCardProps` — used in detail page related stories grid. |
| `next.config.ts` | `remotePatterns` only allows `placehold.co` — must broaden for real article images. |
| No `lib/` directory | Does not exist yet — greenfield. |
| No `supabase/` directory | Does not exist yet — greenfield. |

**Important**: there is no `lib/types.ts`, `lib/mock/news.ts`, `components/ui/news-card.tsx`,
or `app/design-system/` route. The new prompt's references to those files are incorrect for
this project. The real presentational contract is `ArticleCardProps` in `article-card.tsx`.


## Key modeling decisions

**Single-article schema vs multi-source cluster mock**
The mock treats each card as a cluster (multiple sources, aggregate L/C/R). The real DB has
one article = one source; all L/C/R/sentiment/confidence values come from `article_analyses`
for that single article. We map honestly to the existing UI without redesigning it:

- Home card: `source` = source name, `publishedAt` = formatted `published_at`, `sentimentLabel`,
  `biasLabel`, `leftPct`/`centerPct`/`rightPct`, `confidence` all flow through `ArticleCardProps`
  (these fields are already optional on the interface). `category` and `region` are omitted
  (no DB column for them yet) — they render nothing since the component guards on them.

- Detail page: mapper fills `title`, `imageUrl`, `author` ← source name, `publishedAt`,
  `readTime` ← derived from `raw_text` word count, `imageCaption` ← title,
  `body[]` ← `raw_text` split to paragraphs, `summaryPoints[]` ← `summary` split by
  sentence, `leftPct`/`centerPct`/`rightPct`, `sourcesCount` ← 1, `overallBias` ← `bias_label`,
  `analysisNote` ← `disclaimer` (or fallback), `topSources` ← `[{ name: source, bias: lean }]`.
  `RELATED_STORIES` → empty array (§20 deferred; Related Stories section only renders when
  the array is non-empty — already guarded in the existing component tree).

**Package**: `@supabase/supabase-js` v2 only. **Not** `@supabase/ssr` — auth is Clerk and all
DB access is server-side/service-role; cookie-based SSR clients are not needed.

**Single client**: `lib/supabase/server.ts` with `createServiceClient()`, `import "server-only"`,
`auth: { persistSession: false, autoRefreshToken: false }`. No browser client created.

**RLS**: enabled on all six tables with **no** anon/authenticated policies. The Data API
exposes nothing; every read/write goes through the service-role client.

**Large-int safety (§18)**: `oxylabs_schedules.schedule_id` and `oxylabs_schedule_runs.run_id`/
`job_id` stored as `text` — never parsed as JS numbers.

**Joined-filter gotcha (§21)**: never `.eq('foreignTable.col', v)`. Requiring an analysis row
uses `article_analyses!inner(*)` embed hint, not a foreign-column filter.

**Schema application**: no CLI/MCP available → deliver SQL files for the user to run in
Dashboard → SQL Editor.


## Files to add / change

### Add
| Path | Purpose |
|------|---------|
| `supabase/schema.sql` | Six tables, constraints, indexes, RLS on each |
| `supabase/seed.sql` | Five active sources (idempotent) |
| `lib/supabase/types.ts` | `Database` type + row/insert types for all six tables |
| `lib/supabase/server.ts` | `createServiceClient()` — server-only, service-role |
| `lib/supabase/queries/articles.ts` | `getHomeArticles()`, `getArticleDetailById(id)`, `getUnanalyzedArticles()`, `insertArticle()`, `updateArticleAnalyzedAt()` |
| `lib/supabase/queries/sources.ts` | `getActiveSources()`, `getAllSources()` |
| `lib/supabase/queries/logs.ts` | `createLog()`, optional `getRecentLogs()` |
| `lib/supabase/queries/schedules.ts` | `getSchedules()`, `upsertSchedule()`, `updateScheduleStatus()` |
| `lib/supabase/mappers.ts` | `toArticleCardProps()`, `toDetailData()` + helpers |

### Change
| Path | What changes |
|------|-------------|
| `package.json` | Add `@supabase/supabase-js@^2` |
| `.env.example` | Add three Supabase env var placeholders |
| `next.config.ts` | Broaden `remotePatterns` for external article images |
| `app/page.tsx` | `async`; `force-dynamic`; call `getHomeArticles()` → `toArticleCardProps()`; empty state |
| `app/news/[id]/page.tsx` | `force-dynamic`; call `getArticleDetailById(id)` → map inline fields; `notFound()` when null; `RELATED_STORIES = []` |


## Implementation requirements

### `supabase/schema.sql`

```sql
-- extensions
create extension if not exists pgcrypto; -- gen_random_uuid()

-- sources
create table if not exists public.sources (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  listing_url     text not null unique,
  parser_strategy text,
  active          boolean not null default true,
  logo_url        text,
  created_at      timestamptz not null default now()
);

-- articles (append-only; §10)
create table if not exists public.articles (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references public.sources(id) on delete cascade,
  url          text not null unique,
  canonical_url text,
  title        text not null,
  image_url    text not null,
  published_at timestamptz not null,
  raw_text     text not null default '',
  scraped_at   timestamptz not null default now(),
  analyzed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists articles_source_id_idx   on public.articles(source_id);
create index if not exists articles_published_at_idx on public.articles(published_at desc);
create index if not exists articles_analyzed_at_idx  on public.articles(analyzed_at);

-- article_analyses (one per article; §19) — no embedding column yet (§20)
create table if not exists public.article_analyses (
  id                uuid primary key default gen_random_uuid(),
  article_id        uuid not null unique references public.articles(id) on delete cascade,
  summary           text not null,
  sentiment_score   numeric(4,3) not null check (sentiment_score between -1 and 1),
  sentiment_label   text not null check (sentiment_label in ('positive','neutral','negative')),
  bias_score        numeric(4,3) not null check (bias_score between -1 and 1),
  bias_label        text not null check (bias_label in ('left','center','right','mixed','unclear')),
  left_percentage   int not null check (left_percentage between 0 and 100),
  center_percentage int not null check (center_percentage between 0 and 100),
  right_percentage  int not null check (right_percentage between 0 and 100),
  confidence        numeric(4,3) not null check (confidence between 0 and 1),
  framing_notes     text,
  loaded_terms      text[] not null default '{}',
  disclaimer        text,
  model             text not null,
  created_at        timestamptz not null default now(),
  constraint article_analyses_pct_sum check (
    left_percentage + center_percentage + right_percentage = 100
  )
);

-- logs (§7)
create table if not exists public.logs (
  id         uuid primary key default gen_random_uuid(),
  level      text not null default 'info'
               check (level in ('debug','info','warn','error')),
  event      text not null,
  message    text,
  context    jsonb,
  source_id  uuid references public.sources(id) on delete set null,
  article_id uuid references public.articles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists logs_created_at_idx on public.logs(created_at desc);

-- oxylabs_schedules (§18; ids stored as text for 64-bit precision)
create table if not exists public.oxylabs_schedules (
  id          uuid primary key default gen_random_uuid(),
  schedule_id text not null unique,
  source_id   uuid not null references public.sources(id) on delete cascade,
  cron        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- oxylabs_schedule_runs (§18; run/job ids as text)
create table if not exists public.oxylabs_schedule_runs (
  id             uuid primary key default gen_random_uuid(),
  schedule_id    text not null
                   references public.oxylabs_schedules(schedule_id) on delete cascade,
  run_id         text not null,
  job_id         text,
  result_status  text,
  processed      boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (schedule_id, run_id, job_id)
);
create index if not exists oxylabs_runs_schedule_idx
  on public.oxylabs_schedule_runs(schedule_id);

-- RLS: enable on every table; no anon/authenticated policies.
-- All access is via the server service-role client (bypasses RLS).
alter table public.sources               enable row level security;
alter table public.articles              enable row level security;
alter table public.article_analyses      enable row level security;
alter table public.logs                  enable row level security;
alter table public.oxylabs_schedules     enable row level security;
alter table public.oxylabs_schedule_runs enable row level security;
```


### `supabase/seed.sql`

```sql
insert into public.sources (name, listing_url, active) values
  ('Reuters',      'https://www.reuters.com/',       true),
  ('NPR',          'https://www.npr.org/',           true),
  ('Fox News',     'https://www.foxnews.com/',       true),
  ('BBC',          'https://www.bbc.com/news',       true),
  ('The Guardian', 'https://www.theguardian.com/us', true)
on conflict (listing_url) do nothing;
```

### `lib/supabase/server.ts`

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(
    "Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
  );
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

### `lib/supabase/types.ts`

Hand-write a `Database` interface with `public.Tables.<table>.{ Row, Insert, Update }`
matching the schema exactly. Export convenience aliases:
`Source`, `Article`, `ArticleAnalysis`, `Log`, `OxylabsSchedule`, `OxylabsScheduleRun`
for Row types, and `InsertArticle`, `InsertLog`, etc. for Insert types.
`loaded_terms` → `string[]`, `context` → `Record<string, unknown> | null`.

Also export a joined type used by query results:
```ts
export type ArticleRow = Database["public"]["Tables"]["articles"]["Row"];
export type ArticleAnalysisRow = Database["public"]["Tables"]["article_analyses"]["Row"];
export type SourceRow = Database["public"]["Tables"]["sources"]["Row"];

export interface ArticleWithRelations {
  article: ArticleRow;
  analysis: ArticleAnalysisRow;
  source: Pick<SourceRow, "name" | "logo_url">;
}
```

### `lib/supabase/queries/articles.ts`

All queries use `createServiceClient()`.

**`getHomeArticles(limit = 24)`**
```ts
const { data, error } = await createServiceClient()
  .from("articles")
  .select("*, sources(name, logo_url), article_analyses!inner(*)")
  .not("analyzed_at", "is", null)
  .order("published_at", { ascending: false })
  .limit(limit);
```
`article_analyses!inner(*)` ensures only articles with an analysis row are returned
(avoids the joined-column filter gotcha). Throw on `error`. Return typed rows.

**`getArticleDetailById(id: string)`**
Same select without `.limit()`, plus `.eq("id", id).maybeSingle()`. Return `null` when
not found or when `article_analyses` is absent/empty.

**`getUnanalyzedArticles()`**
LEFT JOIN check (§19): articles with no `article_analyses` row. Use:
```ts
.from("articles")
.select("*, article_analyses(*)")
```
Then filter in JS: `data.filter(a => !a.article_analyses || a.article_analyses.length === 0)`.
Never rely on `analyzed_at IS NULL` alone.

**`insertArticle(data: InsertArticle)`** — `.insert(data).select().single()`

**`updateArticleAnalyzedAt(articleId: string)`** — `.update({ analyzed_at: new Date().toISOString() }).eq("id", articleId)`

### `lib/supabase/queries/sources.ts`

`getActiveSources()` — `.from("sources").select("*").eq("active", true).order("name")`
`getAllSources()` — same without the `.eq` filter.
`getSourceById(id: string)` — `.maybeSingle()`.

### `lib/supabase/queries/logs.ts`

`createLog(entry: InsertLog)` — insert one row. Swallow errors (logging must never crash the pipeline).
`getRecentLogs(limit = 50)` — ordered by `created_at desc`.

### `lib/supabase/queries/schedules.ts`

`getSchedules()` — select all schedule rows.
`upsertSchedule(data)` — `.upsert(data, { onConflict: "schedule_id" })`.
`updateScheduleStatus(scheduleId: string, active: boolean)` — `.update({ active, updated_at: now }).eq("schedule_id", scheduleId)`.


### `lib/supabase/mappers.ts`

Pure functions — no DB calls, no imports from `server.ts`.

**Helpers**
```ts
// Split raw_text into readable paragraphs
function splitParagraphs(raw: string): string[]

// Derive reading time from word count (avg 200 wpm)
function readTimeFromText(raw: string): string  // e.g. "5 min read"

// Format a date string to "MMM D, YYYY" in UTC
function formatDate(iso: string): string  // e.g. "Jun 1, 2026"

// Map bias_label to a sidebar "lean" — left stays left, right stays right, rest = center
type Lean = "left" | "center" | "right";
function leanFromLabel(label: string): Lean

// Split summary into bullet points (split on ". " with sentence boundary)
function splitSummaryPoints(summary: string): string[]
```

**`toArticleCardProps(row)`** — takes a Supabase row with joined `sources` and
`article_analyses`, returns an object matching `ArticleCardProps` from
`components/ui/article-card.tsx`:
```ts
{
  title: row.title,
  imageUrl: row.image_url,
  source: row.sources.name,
  publishedAt: formatDate(row.published_at),
  sentimentLabel: row.article_analyses.sentiment_label,
  biasLabel: row.article_analyses.bias_label,
  leftPct: row.article_analyses.left_percentage,
  centerPct: row.article_analyses.center_percentage,
  rightPct: row.article_analyses.right_percentage,
  confidence: row.article_analyses.confidence,
  href: `/news/${row.id}`,
}
```
`category` and `region` are omitted — no DB column for them in this schema.
The card component already guards `(category || region)` before rendering that line.

**`toDetailData(row)`** — takes the same row shape (analysis must be present), returns
a plain object with every field that `app/news/[id]/page.tsx` reads from `article`:
```ts
{
  id, title, imageUrl, imageCaption (= title),
  author (= sources.name), publishedAt (formatted), readTime (derived),
  leftPct, centerPct, rightPct,
  sourcesCount: 1,
  overallBias: bias_label,
  overallBiasLabel: `${capitalize(bias_label)} ${dominant_pct}%`,
  body: splitParagraphs(raw_text),
  summaryDate: formatDate(analyzed_at), summaryReadTime: derived from summary,
  summaryPoints: splitSummaryPoints(summary),
  analysisNote: disclaimer ?? "Analysis is AI-estimated and based on article framing.",
  sourceBreakdown: { left: 1, leftPct, center: 0, centerPct, right: 0, rightPct },
  topSources: [{ name: sources.name, bias: leanFromLabel(bias_label) }],
}
```
`sourceBreakdown.left/center/right` counts are always 1/0/0 (one article = one source);
only the percentages from AI analysis vary. This preserves the existing sidebar layout
without redesigning the multi-source display.

### `next.config.ts`

Replace the `placehold.co`-only pattern with a wildcard that also allows real article images:
```ts
remotePatterns: [
  { protocol: "https", hostname: "**" },
],
```

### `app/page.tsx`

```ts
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const rows = await getHomeArticles();
  const articles = rows.map(toArticleCardProps);

  // ... existing shell JSX unchanged ...
  // Replace MOCK_ARTICLES grid with:
  {articles.length === 0 ? (
    <p className="text-[#8B7280] text-[14px] py-16 text-center col-span-full">
      No analyzed articles yet — run the pipeline to populate the feed.
    </p>
  ) : (
    articles.map((article) => (
      <ArticleCard key={article.href} {...article} />
    ))
  )}
}
```
Remove the `MOCK_ARTICLES` constant and the `const index` key.

### `app/news/[id]/page.tsx`

```ts
export const dynamic = "force-dynamic";

export default async function NewsDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getArticleDetailById(id);
  if (!row) notFound();
  const article = toDetailData(row);

  // Replace `const article = MOCK_ARTICLE` and `RELATED_STORIES` usage:
  // - all article.* references continue to work because toDetailData returns
  //   the same field shape the JSX already reads
  // - replace RELATED_STORIES with const relatedStories: RelatedArticleCardProps[] = []
  //   and guard: {relatedStories.length > 0 && ( <related section JSX> )}
}
```
Remove `MOCK_ARTICLE`, `RELATED_STORIES`, and `generateStaticParams`.
Import `notFound` from `"next/navigation"`.


## Security requirements

- `lib/supabase/server.ts` starts with `import "server-only"` — never imported by client components.
- `SUPABASE_SERVICE_ROLE_KEY` referenced only in `server.ts`. Never in any `NEXT_PUBLIC_*` var.
- RLS enabled on all six tables with no anon or authenticated policies. Data API exposes nothing.
- `.env.example` holds placeholders only; real keys stay in `.env.local` (gitignored).
- No Supabase calls in any component file or client-side code.

## Acceptance criteria

- `supabase/schema.sql` runs cleanly in Dashboard SQL Editor — all six tables, constraints,
  indexes, and RLS enabled on each. No errors.
- `supabase/seed.sql` runs cleanly — five active source rows inserted (idempotent re-run safe).
- `npm run typecheck` passes with zero errors.
- `npm run lint` passes with zero errors.
- `npm run build` succeeds.
- Home page renders the empty state ("No analyzed articles yet") when DB has no analyzed
  articles; once a smoke-test article + analysis are inserted, the card appears with source,
  date, framing meter, sentiment/bias labels, and confidence.
- `/news/<uuid>` renders full analysis for a real analyzed article. Not-found renders the
  Next.js 404 page for unknown or unanalyzed IDs.
- Related Stories section is absent when `relatedStories` array is empty (§20 deferred).
- No service-role key in the client bundle (`npm run build` bundle analysis optional but
  `server-only` import enforces this at build time).

## Checks to run

```
npm run typecheck
npm run lint
npm run build
```

## Manual test steps

1. **Apply schema**: Dashboard → SQL Editor → paste `supabase/schema.sql` → Run. Confirm
   six tables under Table Editor with RLS "Enabled" shown on each.
2. **Seed sources**: run `supabase/seed.sql` → confirm five rows in `sources`, all `active = true`.
3. Confirm `.env.local` has the three Supabase vars.
4. `npm run dev`.
5. Visit `http://localhost:3000/` → see **empty state** message. No console errors.
6. Insert a smoke-test set in SQL Editor:
   ```sql
   -- get source id first
   select id from public.sources where name = 'Reuters';

   insert into public.articles
     (source_id, url, title, image_url, published_at, analyzed_at)
   values
     ('<source-id>', 'https://reuters.com/test/article-1',
      'Test Article: Reuters Smoke Test',
      'https://placehold.co/800x450/1a1a2a/ffffff?text=Test',
      now(), now());

   insert into public.article_analyses
     (article_id, summary, sentiment_score, sentiment_label,
      bias_score, bias_label, left_percentage, center_percentage,
      right_percentage, confidence, model)
   select a.id, 'This is a test summary sentence. It was generated for QA.',
     0.1, 'positive', 0.0, 'center', 20, 60, 20, 0.85, 'gpt-4o'
   from public.articles a where a.url = 'https://reuters.com/test/article-1';
   ```
7. Reload `http://localhost:3000/` → card appears with "Reuters", date, bias meter, labels.
8. Click card → `/news/<uuid>` renders full analysis. Sidebar shows summary points, framing
   percentages, source breakdown with Reuters. Related Stories section is not shown.
9. Visit `/news/00000000-0000-0000-0000-000000000000` → Next.js 404 page.
10. Delete smoke-test rows if desired; re-run `npm run typecheck && npm run lint && npm run build` — all pass.
