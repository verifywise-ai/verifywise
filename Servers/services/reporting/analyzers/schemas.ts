/**
 * Report analyzers — zod schemas for LLM structured output.
 *
 * Every object is .strict() so a hallucinated field fails validation instead of
 * reaching a compliance artifact. Every field carries .describe() — those
 * descriptions are the real prompt. abstain_reason is nullable (not optional):
 * the model must make an explicit statement either way.
 */

import { z } from "zod";

const abstainReason = z
  .string()
  .nullable()
  .describe(
    "If the supplied data is empty, trivial, or insufficient to support a grounded analysis, set this to a one-sentence reason and keep the rest of the output minimal and factual. Otherwise null. NEVER invent findings to fill space.",
  );

const severity = z
  .enum(["low", "medium", "high", "critical"])
  .describe(
    "Severity judged only from the supplied data. The input's risk vocabulary is wider than this enum: map 'Very High' to critical, 'Very Low' to low. Never invent a level for an item whose severity the input does not state.",
  );

export const executiveSummarySchema = z
  .object({
    summary: z
      .string()
      .min(40)
      .max(3500)
      .describe(
        "Three to five paragraphs, professional third-person, flowing prose. No markdown, no bullet points, no headers. Cover: overall compliance and governance posture; critical findings needing immediate attention; top areas needing improvement; recommended next steps.",
      ),
    abstain_reason: abstainReason,
  })
  .strict();

export const keyFindingsSchema = z
  .object({
    findings: z
      .array(
        z
          .object({
            text: z
              .string()
              .min(15)
              .max(300)
              .describe("One concise observation grounded in the supplied data."),
            section: z
              .string()
              .min(2)
              .max(40)
              .describe(
                "The section key this finding came from (e.g. 'compliance', 'projectRisks'). Must be one of the section keys present in the input.",
              ),
            severity,
          })
          .strict(),
      )
      .min(0)
      .max(8)
      .describe("Five to eight findings when the data supports them. May be empty."),
    abstain_reason: abstainReason,
  })
  .strict();

export const recommendedActionsSchema = z
  .object({
    actions: z
      .array(
        z
          .object({
            action: z
              .string()
              .min(15)
              .max(300)
              .describe("A specific, actionable step. Not a restatement of the problem."),
            suggestedOwner: z
              .string()
              .max(120)
              .nullable()
              .describe(
                "The name or role of an owner ONLY if that exact name/role appears in the supplied data. If it does not appear verbatim in the input, this MUST be null. Never infer or invent an owner.",
              ),
            priority: z
              .enum(["low", "medium", "high", "critical"])
              .describe(
                "Priority judged only from the supplied data. The input's risk vocabulary is wider than this enum: map 'Very High' to critical, 'Very Low' to low. Never invent a level for an item whose severity the input does not state.",
              ),
            rationale: z
              .string()
              .min(10)
              .max(300)
              .describe("One sentence tying this action to a specific signal in the input."),
          })
          .strict(),
      )
      .min(0)
      .max(5)
      .describe("Three to five actions when the data supports them. May be empty."),
    abstain_reason: abstainReason,
  })
  .strict();

export const riskAnalysisSchema = z
  .object({
    narrative: z
      .string()
      .min(40)
      .max(2500)
      .describe("Two to four paragraphs on the risk posture across use-case, vendor and model risks. Flowing prose, no markdown."),
    top_risks: z
      .array(
        z
          .object({
            name: z.string().min(2).max(200).describe("Risk name, copied verbatim from the input."),
            level: z.string().min(2).max(40).describe("Risk level, copied verbatim from the input."),
            why: z.string().min(10).max(300).describe("Why this risk ranks among the most material."),
          })
          .strict(),
      )
      .min(0)
      .max(6)
      .describe("Up to six most material risks, drawn ONLY from risks present in the input."),
    abstain_reason: abstainReason,
  })
  .strict();

export const complianceGapSchema = z
  .object({
    narrative: z
      .string()
      .min(40)
      .max(2500)
      .describe(
        "Two to four paragraphs explaining and prioritising the supplied readiness scores. Explain the stored scores; do NOT recompute or re-score them.",
      ),
    gaps: z
      .array(
        z
          .object({
            control: z.string().min(1).max(200).describe("Control identifier or title, copied verbatim from the input."),
            gap: z.string().min(10).max(300).describe("What is missing, grounded in the supplied score fields."),
            priority: severity,
          })
          .strict(),
      )
      .min(0)
      .max(10)
      .describe("Prioritised gaps drawn ONLY from controls present in the input."),
    scores_caveat: z
      .string()
      .max(400)
      .nullable()
      .describe(
        "Set this when the readiness input is missing, stale, or partially zeroed, stating plainly that the absence of scores is NOT evidence of an absence of gaps. Otherwise null.",
      ),
    abstain_reason: abstainReason,
  })
  .strict();

export const vendorRiskSchema = z
  .object({
    narrative: z
      .string()
      .min(40)
      .max(2500)
      .describe("Two to four paragraphs on third-party risk exposure. Flowing prose, no markdown."),
    concerns: z
      .array(
        z
          .object({
            vendor: z.string().min(1).max(200).describe("Vendor name, copied verbatim from the input."),
            concern: z.string().min(10).max(300).describe("The specific concern, grounded in the input."),
            severity,
          })
          .strict(),
      )
      .min(0)
      .max(8)
      .describe("Up to eight concerns, drawn ONLY from vendors present in the input."),
    abstain_reason: abstainReason,
  })
  .strict();

export type ExecutiveSummaryOutput = z.infer<typeof executiveSummarySchema>;
export type KeyFindingsOutput = z.infer<typeof keyFindingsSchema>;
export type RecommendedActionsOutput = z.infer<typeof recommendedActionsSchema>;
export type RiskAnalysisOutput = z.infer<typeof riskAnalysisSchema>;
export type ComplianceGapOutput = z.infer<typeof complianceGapSchema>;
export type VendorRiskOutput = z.infer<typeof vendorRiskSchema>;
