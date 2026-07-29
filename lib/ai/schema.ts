import { z } from "zod";

// =============================================================================
// Zod schema for AI analysis output (§19)
// Field names are camelCase — mapped to snake_case when building the DB insert.
// Do NOT add a .refine() sum check here — normalization happens in the pipeline
// before the final safeParse, so this schema must accept unnormalized output.
// =============================================================================

export const AnalysisOutputSchema = z.object({
  summary: z.string().min(1),
  sentimentScore: z.number().min(-1).max(1),
  sentimentLabel: z.enum(["positive", "neutral", "negative"]),
  politicalFramingLabel: z.enum(["left", "center", "right", "mixed", "unclear"]),
  leftPercentage: z.number().min(0).max(100),
  centerPercentage: z.number().min(0).max(100),
  rightPercentage: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  framingNotes: z.string(),
  loadedTerms: z.array(z.string()),
  disclaimer: z.string(),
});

export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;
