# pgvector + Related Articles (§20)

## Goal

Enable pgvector in Supabase, add an `embedding vector(1536)` column to `article_analyses`,
update the AI analysis pipeline to generate and save embeddings alongside analysis using
Google's `gemini-embedding-001` model, and add a Related Articles section to the news
details page powered by cosine similarity search.

---

## Skills Read

- `.agents/skills/supabase/SKILL.md`
- `.agents/skills/ai-sdk/SKILL.md`
- `node_modules/ai/docs/03-ai-sdk-core/30-embeddings.mdx`
- `node_modules/@ai-sdk/google/docs/15-google.mdx`

---

## Existing Code Inspected

- `supabase/schema.sql` — `article_analyses` table: no `embedding` column. Has a comment noting §20 adds it.
- `lib/supabase/types.ts` — `ArticleAnalysis` Row/Insert/Update types: no `embedding` field. `InsertArticleAnalysis` used in the pipeline.
- `lib/ai/analyze-article.ts` — `analyzeArticle()` uses `generateText + Output.object`. Returns `{ success, output, model }`. No embedding call.
- `lib/pipeline/analyze.ts` — `runAnalysis()` orchestrator. Calls `analyzeArticle()`, builds `InsertArticleAnalysis`, calls `saveAnalysis()`. No embedding step.
- `lib/supabase/queries/articles.ts` — `saveAnalysis()` inserts the analysis row then calls `updateArticleAnalyzedAt()`. No embedding column. `getPendingArticles()` detects articles with no `article_analyses` row via LEFT JOIN + JS filter. No `getRelatedArticles` function.
- `app/news/[id]/page.tsx` — Related Stories section stub present, gated by `relatedStories.length > 0`. `relatedStories` is hardcoded to `[]`. `RelatedArticleCard` is imported but the stub renders an empty `<div>` per story.
- `components/ui/related-article-card.tsx` — `RelatedArticleCard` and `RelatedArticleCardProps` exist.
- `lib/supabase/mappers.ts` — `toDetailData()` does not reference embeddings. No related-articles mapper.

---

## Decisions and Assumptions

1. **Embedding model**: `gemini-embedding-001` via `google.embedding('gemini-embedding-001')` + `embed()` from the `ai` package. `outputDimensionality: 1536` is passed as a `providerOptions.google` setting to match the `vector(1536)` column.
2. **Embedding text**: Use the same truncated `raw_text` slice (first 8 000 chars) used for analysis, prepended with the article title. This gives the embedding enough semantic signal.
3. **Embedding stored in `article_analyses`**: Per §20, the embedding lives in `article_analyses.embedding`, not `articles`.
4. **Backfill behaviour**: An article whose `article_analyses` row exists but has `embedding IS NULL` is picked up automatically on the next `/api/analyze` run. The existing `getPendingArticles` LEFT JOIN logic only returns rows with no analysis row at all. A separate `getPendingEmbeddings` query is added to detect rows where the analysis exists but embedding is null. The pipeline runs both checks and processes them.
5. **`analyzed_at` gating**: `analyzed_at` is only set (or re-set) after both the analysis insert and the embedding save succeed. If the article already has a complete analysis row but no embedding (backfill path), `analyzed_at` is updated after the embedding save.
6. **`saveAnalysis` signature change**: Accept an optional `embedding: number[] | null` parameter. If provided and non-null, update the analysis row's embedding column right after insert (or upsert via `.update()` if the row already exists, for the backfill path). `analyzed_at` is only touched after both succeed.
7. **`getRelatedArticles`**: Queries `article_analyses` joined to `articles` and `sources`. Filters to rows where `embedding IS NOT NULL` and `article_id != currentArticleId`. Orders by cosine distance (`<=>`) to the current embedding. Limits to 5. Uses the service-role client. Supabase-js does not expose a raw `<=>` operator — use `.rpc('match_articles', { ... })` or use a PostgREST raw ordering query via `.order()` with a custom expression. Because supabase-js v2 does not support vector ordering through the typed client, the query is executed via `createServiceClient().rpc('match_articles', { query_embedding, match_count, exclude_id })` backed by a SQL function defined in the schema.
8. **`match_articles` SQL function**: Added to `supabase/schema.sql`. Returns `article_id`, `title`, `image_url`, `published_at`, `source_name`, cosine distance. Defined as `SECURITY INVOKER` (service-role client bypasses RLS anyway).
9. **IVFFlat index**: Created after the `vector` extension is enabled and after data has been inserted. The index uses `vector_cosine_ops`. `lists = 1` is fine for small datasets; can be tuned later.
10. **No new env variables**: `GOOGLE_GENERATIVE_AI_API_KEY` already covers the embedding model.
11. **Related Articles UI**: Displayed in the existing `relatedStories` stub below the article body. Each card rendered with `RelatedArticleCard`. Section only shown when the current article has an embedding (`article.embedding != null`) and results come back. Uses the existing 2-column grid in the stub.
12. **`ArticleWithRelations` type**: Not changed — it does not expose `embedding` to the UI layer. The embedding is read internally by the pipeline and the `getRelatedArticles` query.

---

## Files Likely to Change

| File | Change |
|------|--------|
| `supabase/schema.sql` | Add `embedding vector(1536)` column to `article_analyses`, IVFFlat index, `match_articles` RPC function |
| `lib/supabase/types.ts` | Add `embedding: number[] \| null` to `article_analyses` Row, Insert, Update |
| `lib/ai/analyze-article.ts` | Add `generateEmbedding()` function using `embed` + `google.embedding('gemini-embedding-001')` |
| `lib/supabase/queries/articles.ts` | Update `saveAnalysis` to accept + store embedding; add `getPendingEmbeddings()`; add `getRelatedArticles()` |
| `lib/pipeline/analyze.ts` | Call `generateEmbedding()` per article; pass embedding to `saveAnalysis`; add backfill loop for embedding-only pass |
| `app/news/[id]/page.tsx` | Call `getRelatedArticles`, populate `relatedStories`, render `RelatedArticleCard` inside the stub |

---

## Implementation Requirements

### 1. SQL to run in Supabase Dashboard → SQL Editor (manual step for user)

```sql
-- Enable pgvector extension
create extension if not exists vector;

-- Add embedding column
alter table public.article_analyses
  add column if not exists embedding vector(1536);

-- IVFFlat cosine index (run after extension is enabled)
create index if not exists article_analyses_embedding_idx
  on public.article_analyses
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 1);

-- match_articles RPC — returns up to match_count similar articles (cosine distance)
create or replace function public.match_articles(
  query_embedding  vector(1536),
  match_count      int,
  exclude_id       uuid
)
returns table (
  article_id   uuid,
  title        text,
  image_url    text,
  published_at timestamptz,
  source_name  text
)
language sql
security invoker
set search_path = public
as $$
  select
    a.id          as article_id,
    a.title,
    a.image_url,
    a.published_at,
    s.name        as source_name
  from article_analyses aa
  join articles a  on a.id = aa.article_id
  join sources  s  on s.id = a.source_id
  where aa.embedding is not null
    and aa.article_id <> exclude_id
    and a.analyzed_at is not null
  order by aa.embedding <=> query_embedding
  limit match_count;
$$;
```

### 2. `supabase/schema.sql`

Append the above SQL (after the `article_analyses` table definition and after the RLS block) as comments indicate the §20 additions.

### 3. `lib/supabase/types.ts`

Add `embedding: number[] | null` to:
- `article_analyses.Row`
- `article_analyses.Insert` (optional, `embedding?: number[] | null`)
- `article_analyses.Update` (optional, `embedding?: number[] | null`)

### 4. `lib/ai/analyze-article.ts`

Add a new exported function `generateEmbedding`:

```ts
export type EmbeddingResult =
  | { success: true; embedding: number[] }
  | { success: false; error: string };

export async function generateEmbedding(
  article: ArticleWithRelations
): Promise<EmbeddingResult> {
  // Build text: title + truncated raw_text (same MAX_TEXT_CHARS as analysis)
  // Call embed() with google.embedding('gemini-embedding-001')
  // providerOptions.google.outputDimensionality = 1536
  // Return { success: true, embedding } or { success: false, error }
  // Never throws — catches all errors
}
```

Import `embed` from `'ai'` and use `google.embedding('gemini-embedding-001')`.

### 5. `lib/supabase/queries/articles.ts`

**`saveAnalysis` update**: Accept an optional `embedding: number[] | null` second parameter (or add it to `InsertArticleAnalysis` — preferred since that type gains the field). Pass `embedding` in the insert. `analyzed_at` is only set after the insert (which now includes embedding) succeeds.

**`getPendingEmbeddings`**: Returns articles that have an `article_analyses` row but the embedding is null.

```ts
export async function getPendingEmbeddings(limit?: number): Promise<ArticleWithRelations[]>
```

Uses LEFT JOIN — selects `article_analyses(id, embedding)`. Filters in JS: keep rows where analysis exists (`analyses.length > 0`) but `analysis.embedding` is null.

**`getRelatedArticles`**: Calls the `match_articles` RPC.

```ts
export interface RelatedArticle {
  article_id: string;
  title: string;
  image_url: string;
  published_at: string;
  source_name: string;
}

export async function getRelatedArticles(
  articleId: string,
  embedding: number[],
  limit = 5
): Promise<RelatedArticle[]>
```

Uses `createServiceClient().rpc('match_articles', { query_embedding: embedding, match_count: limit, exclude_id: articleId })`. Returns `[]` on error (never throws — related articles are non-critical).

### 6. `lib/pipeline/analyze.ts`

**New imports**: `generateEmbedding` from `../ai/analyze-article`; `getPendingEmbeddings` from the queries file.

**Analysis loop change**: After a successful `saveAnalysis`, also call `generateEmbedding` and include the embedding in the `InsertArticleAnalysis`. Because `saveAnalysis` now takes the embedding in the insert, both analysis and embedding are saved atomically in one insert. `analyzed_at` is set only after the insert completes.

**Backfill loop**: After the main analysis loop, call `getPendingEmbeddings()` to find articles that have an analysis row but no embedding (e.g. from before §20). For each, call `generateEmbedding`, then update the `article_analyses` row with the embedding via a new `saveEmbedding(articleId, embedding)` query function. Log progress (backfill started, count, per-article, completed).

**`AnalysisSummary`** (in `lib/pipeline/types.ts` or inline): Add optional `embeddingsGenerated`, `embeddingsFailed` counts to the summary object.

**Important**: The two steps (analysis + embedding generation) run together for new articles. The backfill runs after. If embedding fails for a new article, log the failure but still count the article as analyzed (the analysis row was saved; the embedding will be backfilled next run).

### 7. `app/news/[id]/page.tsx`

- Import `getRelatedArticles` and `RelatedArticle` from `@/lib/supabase/queries/articles`.
- Import `RelatedArticleCard` from `@/components/ui/related-article-card`.
- After fetching `row`, extract the analysis embedding. The analysis is accessed via `extractAnalysis` pattern (array or single object). Cast to `ArticleAnalysis` which now has `embedding: number[] | null`.
- If embedding exists, call `getRelatedArticles(id, embedding, 5)`.
- Map results to `RelatedArticleCardProps` using `formatDate` from mappers.
- Replace the empty `<div>` stub inside the loop with `<RelatedArticleCard {...story} />`.
- The section heading and grid already exist in the stub — only the card render and the data call are missing.

**Do not import `extractAnalysis` from mappers** (it is not exported). Re-implement the inline two-liner:
```ts
const analysis = Array.isArray(row.article_analyses) ? row.article_analyses[0] : row.article_analyses;
const embedding = (analysis as ArticleAnalysis | null)?.embedding ?? null;
```

---

## Security Requirements

- `embedding` values are generated server-side in `lib/pipeline/analyze.ts` and `lib/ai/analyze-article.ts` (both `server-only`).
- `getRelatedArticles` uses the service-role client — server-only query.
- No embedding data reaches browser code.
- `match_articles` is `SECURITY INVOKER` — correct because the service-role client bypasses RLS anyway; no privilege escalation.

---

## Acceptance Criteria

1. Running `POST /api/analyze` on pending articles saves `embedding` in `article_analyses` alongside the existing analysis fields.
2. Re-running `POST /api/analyze` when some articles have analysis but no embedding (backfill) populates the missing embeddings.
3. Navigating to a news detail page for an article with an embedding shows a "Related Stories" section with up to 5 cards.
4. Navigating to a news detail page for an article without an embedding shows no "Related Stories" section.
5. Each related article card shows: thumbnail, title, source name, and published date.
6. `npm run typecheck` passes with no errors.
7. `npm run lint` passes with no errors.

---

## Checks to Run

```
npm run typecheck
npm run lint
npm run build
```

---

## Manual Test Steps

### Step 1 — Run SQL in Supabase Dashboard (one-time)

1. Go to Supabase Dashboard → your project → Database → Extensions.
2. Search for `vector` and enable it.
3. Go to SQL Editor and run the SQL block from section 1 of this prompt (ALTER TABLE, index, match_articles function).

### Step 2 — Generate embeddings

```powershell
curl -s -X POST http://localhost:3000/api/analyze `
  -H "Content-Type: application/json" `
  -H "Biasly_Admin_Secret: <your-secret>" `
  -d "{}" | ConvertFrom-Json | ConvertTo-Json -Depth 5
```

Watch the Next.js dev server terminal for:
- `[analyze] Processing: "<title>" (<id>)`
- `[analyze] Embedding: "<title>"`  
- `[analyze] Saved: "<title>"`
- Backfill section: `[analyze] Backfill: N articles need embeddings`

### Step 3 — Verify embedding saved in Supabase

In SQL Editor:
```sql
select article_id, embedding is not null as has_embedding
from article_analyses
limit 10;
```

### Step 4 — Test Related Articles on the details page

1. Open `npm run dev` if not already running.
2. Go to the home page and click any article that has been analyzed after the embedding run.
3. Scroll below the article body — the "Related Stories" section should appear with up to 5 cards.
4. Each card should show a thumbnail, title, source, and date.

### Step 5 — Test article with no embedding

1. Manually set one `embedding` to null in SQL Editor:
   ```sql
   update article_analyses set embedding = null where article_id = '<some-id>';
   ```
2. Visit that article's detail page — the "Related Stories" section should not appear.
