// =============================================================================
// Skew News — Supabase hand-written types
// Keep in sync with supabase/schema.sql and AGENTS.md §7
// =============================================================================

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// ---------------------------------------------------------------------------
// Database shape — mirrors the schema exactly
// ---------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      sources: {
        Row: {
          id: string;
          name: string;
          listing_url: string;
          parser_strategy: string | null;
          active: boolean;
          logo_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          listing_url: string;
          parser_strategy?: string | null;
          active?: boolean;
          logo_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          listing_url?: string;
          parser_strategy?: string | null;
          active?: boolean;
          logo_url?: string | null;
          created_at?: string;
        };
      };

      articles: {
        Row: {
          id: string;
          source_id: string;
          url: string;
          canonical_url: string | null;
          title: string;
          image_url: string;
          published_at: string;
          raw_text: string;
          scraped_at: string;
          analyzed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_id: string;
          url: string;
          canonical_url?: string | null;
          title: string;
          image_url: string;
          published_at: string;
          raw_text?: string;
          scraped_at?: string;
          analyzed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          source_id?: string;
          url?: string;
          canonical_url?: string | null;
          title?: string;
          image_url?: string;
          published_at?: string;
          raw_text?: string;
          scraped_at?: string;
          analyzed_at?: string | null;
          created_at?: string;
        };
      };

      article_analyses: {
        Row: {
          id: string;
          article_id: string;
          summary: string;
          sentiment_score: number;
          sentiment_label: SentimentLabel;
          bias_score: number;
          bias_label: BiasLabel;
          left_percentage: number;
          center_percentage: number;
          right_percentage: number;
          confidence: number;
          framing_notes: string | null;
          loaded_terms: string[];
          disclaimer: string | null;
          model: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          article_id: string;
          summary: string;
          sentiment_score: number;
          sentiment_label: SentimentLabel;
          bias_score: number;
          bias_label: BiasLabel;
          left_percentage: number;
          center_percentage: number;
          right_percentage: number;
          confidence: number;
          framing_notes?: string | null;
          loaded_terms?: string[];
          disclaimer?: string | null;
          model: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          article_id?: string;
          summary?: string;
          sentiment_score?: number;
          sentiment_label?: SentimentLabel;
          bias_score?: number;
          bias_label?: BiasLabel;
          left_percentage?: number;
          center_percentage?: number;
          right_percentage?: number;
          confidence?: number;
          framing_notes?: string | null;
          loaded_terms?: string[];
          disclaimer?: string | null;
          model?: string;
          created_at?: string;
        };
      };

      logs: {
        Row: {
          id: string;
          level: LogLevel;
          event: string;
          message: string | null;
          context: Json | null;
          source_id: string | null;
          article_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          level?: LogLevel;
          event: string;
          message?: string | null;
          context?: Json | null;
          source_id?: string | null;
          article_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          level?: LogLevel;
          event?: string;
          message?: string | null;
          context?: Json | null;
          source_id?: string | null;
          article_id?: string | null;
          created_at?: string;
        };
      };

      oxylabs_schedules: {
        Row: {
          id: string;
          schedule_id: string; // stored as text — 64-bit safe (§18)
          source_id: string;
          cron: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          schedule_id: string;
          source_id: string;
          cron: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          schedule_id?: string;
          source_id?: string;
          cron?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };

      oxylabs_schedule_runs: {
        Row: {
          id: string;
          schedule_id: string; // text FK → oxylabs_schedules.schedule_id
          run_id: string;
          job_id: string | null;
          result_status: string | null;
          processed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          schedule_id: string;
          run_id: string;
          job_id?: string | null;
          result_status?: string | null;
          processed?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          schedule_id?: string;
          run_id?: string;
          job_id?: string | null;
          result_status?: string | null;
          processed?: boolean;
          created_at?: string;
        };
      };
    };
  };
}

// ---------------------------------------------------------------------------
// Domain label types
// ---------------------------------------------------------------------------

export type SentimentLabel = "positive" | "neutral" | "negative";
export type BiasLabel = "left" | "center" | "right" | "mixed" | "unclear";
export type LogLevel = "debug" | "info" | "warn" | "error";

// ---------------------------------------------------------------------------
// Convenience row aliases
// ---------------------------------------------------------------------------

export type Source = Database["public"]["Tables"]["sources"]["Row"];
export type Article = Database["public"]["Tables"]["articles"]["Row"];
export type ArticleAnalysis = Database["public"]["Tables"]["article_analyses"]["Row"];
export type Log = Database["public"]["Tables"]["logs"]["Row"];
export type OxylabsSchedule = Database["public"]["Tables"]["oxylabs_schedules"]["Row"];
export type OxylabsScheduleRun = Database["public"]["Tables"]["oxylabs_schedule_runs"]["Row"];

// ---------------------------------------------------------------------------
// Convenience insert aliases
// ---------------------------------------------------------------------------

export type InsertSource = Database["public"]["Tables"]["sources"]["Insert"];
export type InsertArticle = Database["public"]["Tables"]["articles"]["Insert"];
export type InsertArticleAnalysis = Database["public"]["Tables"]["article_analyses"]["Insert"];
export type InsertLog = Database["public"]["Tables"]["logs"]["Insert"];
export type InsertOxylabsSchedule = Database["public"]["Tables"]["oxylabs_schedules"]["Insert"];
export type InsertOxylabsScheduleRun = Database["public"]["Tables"]["oxylabs_schedule_runs"]["Insert"];

// ---------------------------------------------------------------------------
// Joined query result type — used by getHomeArticles / getArticleDetailById
// ---------------------------------------------------------------------------

export interface ArticleWithRelations {
  // article fields
  id: string;
  source_id: string;
  url: string;
  canonical_url: string | null;
  title: string;
  image_url: string;
  published_at: string;
  raw_text: string;
  scraped_at: string;
  analyzed_at: string | null;
  created_at: string;
  // joined source (select name, logo_url)
  sources: {
    name: string;
    logo_url: string | null;
  } | null;
  // joined analysis (inner join → always present for home/detail queries)
  article_analyses: ArticleAnalysis | ArticleAnalysis[] | null;
}
