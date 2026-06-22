/**
 * Evidence Analyzer — Zod schemas for LLM structured output.
 *
 * The LLM produces ONLY semantic dimensions and qualitative signals.
 * Recency, reliability composition, and the overall score are computed
 * deterministically in code from the LLM output + file metadata.
 *
 * This split keeps scoring reproducible: same document + same metadata
 * → same overall score, even if the LLM rephrases its rationale.
 */

import { z } from "zod";

/**
 * Per-dimension semantic score with explicit rationale.
 * The rationale forces the LLM to ground its score in the rubric anchors.
 */
const dimensionScoreSchema = z
  .object({
    score: z
      .number()
      .min(0)
      .max(100)
      .describe("Score on the 0-100 ladder, anchored to the rubric tiers (0,30,50,70,90,100)."),
    rationale: z
      .string()
      .min(10)
      .max(400)
      .describe(
        "One- or two-sentence justification quoting the rubric tier this evidence matches and citing concrete textual signals.",
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
 * Document character signals — deterministic features the LLM detects.
 * These bump reliability score in code (e.g., signed → +10).
 */
const documentSignalsSchema = z
  .object({
    document_type: z
      .enum([
        "policy",
        "procedure",
        "report",
        "assessment",
        "log",
        "training_record",
        "audit",
        "contract",
        "other",
      ])
      .describe("Best-fit document classification."),
    has_explicit_dates: z
      .boolean()
      .describe("True if the document contains specific dates (created/reviewed/effective)."),
    has_named_owner: z
      .boolean()
      .describe("True if a specific role, team, or individual is named as owner/approver."),
    has_version: z
      .boolean()
      .describe("True if a version identifier (v1.0, rev-2, etc.) is present."),
    has_metrics: z
      .boolean()
      .describe(
        "True if measurable metrics, thresholds, or KPIs are stated (e.g., '<5%', 'within 24h').",
      ),
    is_draft: z
      .boolean()
      .describe("True if the document is marked as draft, work-in-progress, or unsigned."),
    authority_signal: z
      .number()
      .min(0)
      .max(100)
      .describe(
        "Authority level 0-100. Anchors: 100=board-approved+signed; 80=management-approved; 60=internal published policy; 40=internal memo; 20=draft/notes; 0=unknown.",
      ),
  })
  .strict();

/**
 * Full LLM output — semantic dimensions + signals only.
 * Recency, overall, and final reliability are computed deterministically.
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
    semantic_scores: z
      .object({
        relevance: dimensionScoreSchema,
        completeness: dimensionScoreSchema,
        specificity: dimensionScoreSchema,
      })
      .strict()
      .describe("LLM-scored semantic dimensions. Recency and reliability are computed in code."),
    document_signals: documentSignalsSchema,
    abstain_reason: z
      .string()
      .nullable()
      .describe(
        "If the document is too short, garbled, or off-topic to score, set this to a one-sentence reason and assign all dimension scores ≤ 30. Otherwise null.",
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
