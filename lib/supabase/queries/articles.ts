import { createServiceClient } from "../server";
import type { ArticleWithRelations, InsertArticle, InsertArticleAnalysis } from "../types";

/**
 * Returns analyzed articles for the home feed, newest first.
 * Uses article_analyses!inner to ensure only articles with an analysis row
 * are returned — avoids the joined-column filter gotcha (AGENTS.md §21).
 */
export async function getHomeArticles(limit = 24): Promise<ArticleWithRelations[]> {
  const { data, error } = await createServiceClient()
    .from("articles")
    .select("*, sources(name, logo_url), article_analyses!inner(*)")
    .not("analyzed_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`getHomeArticles failed: ${error.message}`);
  }

  return (data ?? []) as unknown as ArticleWithRelations[];
}

/**
 * Returns a single article with its analysis and source, or null if not found.
 * Returns null when the article has no analysis row (unanalyzed articles are
 * not shown on the detail page).
 */
export async function getArticleDetailById(
  id: string
): Promise<ArticleWithRelations | null> {
  const { data, error } = await createServiceClient()
    .from("articles")
    .select("*, sources(name, logo_url), article_analyses(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`getArticleDetailById failed: ${error.message}`);
  }

  if (!data) return null;

  const row = data as unknown as ArticleWithRelations;
  const analysis = Array.isArray(row.article_analyses)
    ? row.article_analyses[0]
    : row.article_analyses;
  if (!analysis) return null;

  return row;
}

/**
 * Returns articles that have no analysis row yet (pending analysis).
 * Uses LEFT JOIN + JS filter per §19 — never relies on analyzed_at IS NULL alone.
 */
export async function getUnanalyzedArticles(): Promise<ArticleWithRelations[]> {
  const { data, error } = await createServiceClient()
    .from("articles")
    .select("*, sources(name, logo_url), article_analyses(*)")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getUnanalyzedArticles failed: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as ArticleWithRelations[];

  return rows.filter((row) => {
    const analysis = Array.isArray(row.article_analyses)
      ? row.article_analyses[0]
      : row.article_analyses;
    return !analysis;
  });
}

/**
 * Inserts a single article row. Used by the scraping pipeline.
 */
export async function insertArticle(articleData: InsertArticle) {
  const client = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.from("articles") as any)
    .insert(articleData)
    .select()
    .single();

  if (error) {
    throw new Error(`insertArticle failed: ${error.message}`);
  }

  return data;
}

/**
 * Sets analyzed_at to now for a given article.
 * Called after a valid analysis row has been saved (§19).
 */
export async function updateArticleAnalyzedAt(articleId: string): Promise<void> {
  const client = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client.from("articles") as any)
    .update({ analyzed_at: new Date().toISOString() })
    .eq("id", articleId);

  if (error) {
    throw new Error(`updateArticleAnalyzedAt failed: ${error.message}`);
  }
}

/**
 * Checks which URLs from a candidate list already exist in the DB.
 * Queries in chunks of 15 to avoid large .in() filters (§9).
 */
export async function getExistingUrls(urls: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  const CHUNK = 15;

  for (let i = 0; i < urls.length; i += CHUNK) {
    const chunk = urls.slice(i, i + CHUNK);
    const { data, error } = await createServiceClient()
      .from("articles")
      .select("url")
      .in("url", chunk);

    if (error) {
      throw new Error(`getExistingUrls failed: ${error.message}`);
    }

    for (const row of (data ?? []) as Array<{ url: string }>) {
      existing.add(row.url);
    }
  }

  return existing;
}

const MAX_URLS_PER_IN_QUERY = 15;

/**
 * Checks whether any of the given URLs already exist in the DB,
 * testing both the `url` column and the `canonical_url` column.
 * Queries in chunks of ≤15 per .in() call (§9 URL existence check).
 * Returns a Set of all known URL strings from either column.
 */
export async function articleUrlsExist(urls: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  if (urls.length === 0) return existing;

  const client = createServiceClient();

  for (let i = 0; i < urls.length; i += MAX_URLS_PER_IN_QUERY) {
    const chunk = urls.slice(i, i + MAX_URLS_PER_IN_QUERY);

    // Check the `url` column
    const { data: byUrl, error: errUrl } = await client
      .from("articles")
      .select("url")
      .in("url", chunk);

    if (errUrl) {
      throw new Error(`articleUrlsExist (url) failed: ${errUrl.message}`);
    }
    for (const row of (byUrl ?? []) as Array<{ url: string }>) {
      existing.add(row.url);
    }

    // Check the `canonical_url` column (separate query — avoids joined-table filter gotcha §21)
    const { data: byCanonical, error: errCanonical } = await client
      .from("articles")
      .select("canonical_url")
      .in("canonical_url", chunk);

    if (errCanonical) {
      throw new Error(`articleUrlsExist (canonical_url) failed: ${errCanonical.message}`);
    }
    for (const row of (byCanonical ?? []) as Array<{ canonical_url: string | null }>) {
      if (row.canonical_url) existing.add(row.canonical_url);
    }
  }

  return existing;
}

/**
 * Returns articles that have no article_analyses row yet (pending analysis).
 * Uses LEFT JOIN + JS filter per §19 pending-analysis check.
 * Only selects article_analyses(id) — lightweight, avoids full row fetch.
 * Never relies on analyzed_at IS NULL alone.
 */
export async function getPendingArticles(limit?: number): Promise<ArticleWithRelations[]> {
  const { data, error } = await createServiceClient()
    .from("articles")
    .select("*, sources(name, logo_url), article_analyses(id)")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getPendingArticles failed: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as ArticleWithRelations[];

  // Keep only rows with no analysis row (§19 pending-analysis check)
  const pending = rows.filter((row) => {
    const analyses = Array.isArray(row.article_analyses)
      ? row.article_analyses
      : row.article_analyses
      ? [row.article_analyses]
      : [];
    return analyses.length === 0;
  });

  return limit !== undefined ? pending.slice(0, limit) : pending;
}

/**
 * Saves an article analysis row and sets analyzed_at on the article.
 * analyzed_at is set ONLY after a successful insert (§19 rule 6).
 * Throws on any DB error — caller catches and counts as failed.
 */
export async function saveAnalysis(
  articleId: string,
  insert: InsertArticleAnalysis
): Promise<void> {
  const client = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertError } = await (client.from("article_analyses") as any)
    .insert(insert);

  if (insertError) {
    throw new Error(`saveAnalysis insert failed: ${insertError.message}`);
  }

  // Only set analyzed_at after the analysis row is confirmed saved
  await updateArticleAnalyzedAt(articleId);
}

// =============================================================================
// §20 — pgvector: embedding backfill, similarity search
// =============================================================================

/**
 * Returns articles that have an article_analyses row but embedding IS NULL.
 * Used by the backfill loop in the analysis pipeline (§20).
 * Selects article_analyses(id, embedding) — lightweight.
 */
export async function getPendingEmbeddings(limit?: number): Promise<ArticleWithRelations[]> {
  const { data, error } = await createServiceClient()
    .from("articles")
    .select("*, sources(name, logo_url), article_analyses(id, embedding)")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getPendingEmbeddings failed: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as ArticleWithRelations[];

  // Keep rows where an analysis row exists but embedding is null
  const pending = rows.filter((row) => {
    const analyses = Array.isArray(row.article_analyses)
      ? row.article_analyses
      : row.article_analyses
      ? [row.article_analyses]
      : [];
    if (analyses.length === 0) return false;
    const analysis = analyses[0];
    return analysis && (analysis as { embedding?: number[] | null }).embedding == null;
  });

  return limit !== undefined ? pending.slice(0, limit) : pending;
}

/**
 * Updates the embedding column on an existing article_analyses row.
 * Used by the backfill loop — only called when analysis already exists (§20).
 * Also refreshes analyzed_at so the article is re-surfaced as fully processed.
 * Throws on DB error — caller catches and counts as failed.
 */
export async function saveEmbedding(
  articleId: string,
  embedding: number[]
): Promise<void> {
  const client = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client.from("article_analyses") as any)
    .update({ embedding })
    .eq("article_id", articleId);

  if (error) {
    throw new Error(`saveEmbedding failed: ${error.message}`);
  }

  // Re-stamp analyzed_at so the article is fully up to date
  await updateArticleAnalyzedAt(articleId);
}

/**
 * Shape returned by getRelatedArticles — maps directly to RelatedArticleCardProps.
 */
export interface RelatedArticle {
  article_id: string;
  title: string;
  image_url: string;
  published_at: string;
  source_name: string;
}

/**
 * Returns up to `limit` articles similar to the given embedding via cosine distance.
 * Uses the match_articles RPC backed by the IVFFlat index (§20).
 * Returns [] on any error — related articles are non-critical; never throws.
 */
export async function getRelatedArticles(
  articleId: string,
  embedding: number[],
  limit = 5
): Promise<RelatedArticle[]> {
  try {
    const client = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client.rpc as any)("match_articles", {
      query_embedding: embedding,
      match_count: limit,
      exclude_id: articleId,
    });

    if (error) {
      console.warn(`[getRelatedArticles] RPC error: ${error.message}`);
      return [];
    }

    return (data ?? []) as RelatedArticle[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[getRelatedArticles] Unexpected error: ${message}`);
    return [];
  }
}
