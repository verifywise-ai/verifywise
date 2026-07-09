/**
 * Evidence Analyzer — Zod schemas for LLM structured output.
 *
 * The LLM produces ALL five quality dimensions as A–F letter grades plus a
 * holistic overall grade. Recency and reliability are judged by the LLM from
 * the file metadata we feed it (upload/expiry date, file type, parse fidelity)
 * — there is no deterministic scoring in code anymore.
 */

import { z } from "zod";

/**
 * QualityGrade — A (Excellent) / B (Good) / C (Adequate) / D (Weak) / F (Insufficient).
 */
export const qualityGradeSchema = z
  .enum(["A", "B", "C", "D", "F"])
  .describe("Letter grade: A Excellent, B Good, C Adequate, D Weak, F Insufficient.");

/**
 * Per-dimension grade with a short rationale grounding the letter in the rubric.
 */
const dimensionGradeSchema = z
  .object({
    grade: qualityGradeSchema,
    rationale: z
      .string()
      .min(10)
      .max(400)
      .describe(
        "One- or two-sentence justification citing the rubric anchor for this letter and concrete signals from the document/metadata.",
      ),
  })
  .strict();

/**
 * Structured key finding with provenance.
 * Each finding must quote the supporting passage so reviewers can verify it.
 */
const keyFindingSchema = z
  .object({
    text: z.string().min(15).max(220).describe("Plain-language summary of the finding."),
    evidence_quote: z
      .string()
      .min(8)
      .max(280)
      .describe(
        "Direct, verbatim quote from the document that supports the finding (no paraphrasing).",
      ),
    relevance: z
      .enum(["primary", "supporting", "tangential"])
      .describe(
        "primary = directly satisfies a control; supporting = strengthens evidence; tangential = weak link.",
      ),
  })
  .strict();

/**
 * Full LLM output — five graded dimensions + holistic overall grade.
 */
export const llmAnalysisSchema = z
  .object({
    summary: z
      .string()
      .min(40)
      .max(600)
      .describe("Two- or three-sentence neutral summary of what the evidence demonstrates."),
    key_findings: z
      .array(keyFindingSchema)
      .min(0)
      .max(7)
      .describe("Up to 7 most important findings. May be empty for stub documents."),
    compliance_areas: z
      .array(z.string().min(2).max(50))
      .min(0)
      .max(10)
      .describe(
        "Normalized compliance area labels (e.g., 'Risk management', 'Data governance'). Use canonical capitalization.",
      ),
    quality_grades: z
      .object({
        relevance: dimensionGradeSchema,
        completeness: dimensionGradeSchema,
        recency: dimensionGradeSchema,
        reliability: dimensionGradeSchema,
        specificity: dimensionGradeSchema,
      })
      .strict()
      .describe("A–F grade + rationale for each of the five quality dimensions."),
    overall_grade: qualityGradeSchema.describe(
      "Holistic overall letter grade for the evidence. Judge the document as a whole — do NOT mechanically average the five dimensions.",
    ),
    overall_rationale: z
      .string()
      .min(10)
      .max(400)
      .describe("One- or two-sentence justification for the holistic overall grade."),
    abstain_reason: z
      .string()
      .nullable()
      .describe(
        "If the document is too short, garbled, or off-topic to grade, set this to a one-sentence reason and grade every dimension and overall as F. Otherwise null.",
      ),
    filename_check: z
      .object({
        mismatch: z
          .boolean()
          .describe("True only if the filename is clearly misleading or generic relative to the content."),
        suggested_filename: z
          .string()
          .min(1)
          .max(120)
          .nullable()
          .describe(
            "A short, descriptive replacement filename (keep the original extension). Null when mismatch is false.",
          ),
        reason: z
          .string()
          .min(10)
          .max(200)
          .nullable()
          .describe("One plain-language sentence explaining the mismatch. Null when mismatch is false."),
      })
      .strict()
      .nullable()
      .describe(
        "Compare the given filename against what the document is actually about. Set to null if the document was too short/garbled to judge (abstain case).",
      ),
  })
  .strict();

export type LLMAnalysisOutput = z.infer<typeof llmAnalysisSchema>;

/**
 * Per-control match with rationale (used by controlMatcher).
 */
const controlMatchSchema = z
  .object({
    control_id: z.number().int().describe("Exact control id provided in the candidate list."),
    match_score: z
      .number()
      .min(0)
      .max(100)
      .describe(
        "Semantic match strength 0-100. 90+=direct evidence; 70-89=strong support; 50-69=partial; <50=skip.",
      ),
    matched_areas: z
      .array(z.string().min(2).max(50))
      .max(6)
      .describe("Compliance areas linking the evidence to this control."),
    rationale: z
      .string()
      .min(15)
      .max(220)
      .describe("One-sentence reason this control matches (or doesn't)."),
  })
  .strict();

export const controlMatchListSchema = z
  .object({
    matches: z
      .array(controlMatchSchema)
      .max(15)
      .describe(
        "Subset of candidate controls that genuinely match. Skip controls scoring <50 — do NOT pad.",
      ),
  })
  .strict();

export type ControlMatchOutput = z.infer<typeof controlMatchListSchema>;
