import "server-only";

// =============================================================================
// AI article analysis — wraps generateText + Output.object (ai@7 API)
// Uses google('gemini-2.5-flash') which reads GOOGLE_GENERATIVE_AI_API_KEY
// from env automatically.
// Embedding generation uses google.embedding('gemini-embedding-001') (§20).
// =============================================================================

import { generateText, Output, embed } from "ai";
import { google } from "@ai-sdk/google";
import { AnalysisOutputSchema, type AnalysisOutput } from "./schema";
import type { ArticleWithRelations } from "@/lib/supabase/types";

// Centralized model constant — stored in article_analyses.model
const ANALYSIS_MODEL = "gemini-2.5-flash";

// Embedding model constant (§20)
const EMBEDDING_MODEL = "gemini-embedding-001";

// Max chars of raw_text passed to the model — keeps token usage bounded
const MAX_TEXT_CHARS = 8_000;

const SYSTEM_PROMPT = `You are a professional news media analyst. Your task is to analyze a news article and return a structured, objective assessment.

Instructions:
1. Write a neutral, factual 2-3 sentence summary of the article's main point.
2. Score the overall sentiment from -1.0 (very negative) to 1.0 (very positive), with 0.0 being neutral. Provide a matching sentimentLabel: "positive", "neutral", or "negative".
3. Estimate the political framing of the article as AI-estimated, not objective truth. Use ONLY evidence from the article text — do NOT infer framing from the source name alone.
4. Provide three integer percentages (leftPercentage, centerPercentage, rightPercentage) that sum to 100, reflecting the balance of political framing cues found in the text.
5. Choose a politicalFramingLabel: "left", "center", "right", "mixed", or "unclear". The label should match the dominant percentage. Use "unclear" when evidence is weak, ambiguous, or percentages are close (within 10 points of each other), and set confidence low.
6. Rate your confidence (0.0 to 1.0) in the framing estimate. Low confidence = weak or ambiguous evidence.
7. In framingNotes, list specific language cues, word choices, or framing techniques that informed your assessment.
8. In loadedTerms, list any charged, partisan, or emotionally loaded words or phrases found in the article.
9. Include a standard disclaimer noting this is AI-estimated framing analysis and not an objective measurement.

Be precise and evidence-based. Do not speculate beyond what the article text supports.`;

export type AnalyzeResult =
  | { success: true; output: AnalysisOutput; model: string }
  | { success: false; error: string };

/**
 * Analyzes a single article using the Google Gemini model via the AI SDK.
 * Uses generateText + Output.object (ai@7 API — no generateObject).
 * Returns a typed result — never throws.
 */
export async function analyzeArticle(
  article: ArticleWithRelations
): Promise<AnalyzeResult> {
  const sourceName =
    (Array.isArray(article.sources)
      ? article.sources[0]?.name
      : article.sources?.name) ?? "Unknown";

  const prompt = `Source: ${sourceName}
Title: ${article.title}

${article.raw_text.slice(0, MAX_TEXT_CHARS)}`;

  try {
    const result = await generateText({
      model: google(ANALYSIS_MODEL),
      output: Output.object({ schema: AnalysisOutputSchema }),
      instructions: SYSTEM_PROMPT,
      prompt,
      maxRetries: 0, // pipeline handles retry logic itself
    });

    const output = result.output;
    if (!output) {
      return { success: false, error: "Model returned no output" };
    }

    // Second explicit safeParse as the §19 validation gate
    const parsed = AnalysisOutputSchema.safeParse(output);
    if (!parsed.success) {
      return {
        success: false,
        error: `Output validation failed: ${parsed.error.message}`,
      };
    }

    return { success: true, output: parsed.data, model: ANALYSIS_MODEL };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// =============================================================================
// Embedding generation (§20)
// =============================================================================

export type EmbeddingResult =
  | { success: true; embedding: number[] }
  | { success: false; error: string };

/**
 * Generates a 1536-dimension embedding for an article using gemini-embedding-001.
 * Embeds: article title + first MAX_TEXT_CHARS of raw_text.
 * Returns a typed result — never throws.
 */
export async function generateEmbedding(
  article: ArticleWithRelations
): Promise<EmbeddingResult> {
  const text = `${article.title}\n\n${article.raw_text.slice(0, MAX_TEXT_CHARS)}`;

  try {
    const { embedding } = await embed({
      model: google.embedding(EMBEDDING_MODEL),
      value: text,
      providerOptions: {
        google: {
          outputDimensionality: 1536,
          taskType: "SEMANTIC_SIMILARITY",
        },
      },
      maxRetries: 0, // pipeline handles retry logic
    });

    return { success: true, embedding };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
