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
