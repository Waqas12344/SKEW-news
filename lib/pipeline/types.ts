// =============================================================================
// Pipeline types — shared by manual scraping (§16) and scheduler (§18)
// =============================================================================

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
  /** Source names or UUIDs to restrict this run. Default: all active sources. */
  sources?: string[];
  /** Max valid articles to insert per source. Default: 5. */
  limitPerSource?: number;
}

// =============================================================================
// Analysis pipeline types (§19)
// =============================================================================

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
  embeddingsGenerated?: number; // §20
  embeddingsFailed?: number;    // §20
}

// =============================================================================
// Scheduler pipeline types (§18)
// =============================================================================

export interface SchedulerSummary {
  status: "completed" | "failed";
  schedulesChecked: number;
  runsFound: number;
  jobsFound: number;
  jobsProcessed: number;
  jobsSkipped: number;    // pending or faulted
  jobsFailed: number;
  scrapeResult: ScrapeSummary | null;
  analyzeResult: AnalysisSummary | null;
  durationMs: number;
  error?: string;
}
