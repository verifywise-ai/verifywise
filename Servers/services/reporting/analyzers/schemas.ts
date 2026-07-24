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

/**
 * Provenance label. It describes the CLAIM, never the SUBJECT: sanitizeProvenance
 * in runAnalyzers.ts still drops any control, vendor or risk name that is not
 * present verbatim in that analyzer's own prompt, whatever basis the model
 * attaches to the row.
 *
 * .nullable(), not required-non-null — the same shape abstain_reason already
 * uses in this file. The key must be present so the model makes an explicit
 * statement; the value may be null so that one omission does not throw the
 * parse, abstain the analyzer and persist "this analysis could not be produced
 * because the AI service call failed" over an analysis that was in fact
 * produced.
 */
const basis = z
  .enum(["observed", "inferred", "absent"])
  .nullable()
  .describe(
    "Declare how this claim relates to the supplied data. Use \"observed\" when the data states the claim directly. Use \"inferred\" when the claim follows from the supplied data by reasoning the data does not itself state — a ratio, a comparison against the reference date, a pattern running across two sections. Use \"absent\" when the claim is that something required is missing from the data. This label describes the claim only: every control, vendor, risk or person you name must still appear verbatim in the supplied data, whichever label you choose. Use null only when none of the three fits, which should be rare.",
  );

const whatWouldCloseThis = z
  .string()
  .min(10)
  .max(300)
  .nullable()
  .describe(
    "The counterfactual: state what would specifically have to become true for this to stop being an issue — a status reaching a named value, an owner recorded, a document attached, a date met. Write it so the next report could check it against the same fields. Do not restate the problem and do not write a generic instruction such as \"review and update\". Use null only when the supplied data gives you no concrete condition to name.",
  );

export const executiveSummarySchema = z
  .object({
    summary: z
      .string()
      .min(40)
      .max(3500)
      .describe(
        // Shape only. The four-part outline that used to live here reached the
        // model as part of the JSON schema and contradicted the system prompt's
        // "do not work through a fixed outline" — structure is the prompt's job.
        "Three to five paragraphs, professional third-person, flowing prose. No markdown, no bullet points, no headers.",
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
              .max(600)
              .describe(
                "One observation grounded in the supplied data. Name the specific values it rests on — the count, ratio, date, identifier or owner — rather than characterising them; there is room for the evidence and the observation in one place.",
              ),
            section: z
              .string()
              .min(2)
              .max(40)
              .describe(
                "The section key this finding came from (e.g. 'compliance', 'projectRisks'). Must be one of the section keys present in the input.",
              ),
            severity,
            basis,
            what_would_close_this: whatWouldCloseThis,
            // Not nullable, unlike its two siblings: an empty array is already
            // the natural "none" answer, so null would add a second way to say
            // the same thing and a null case to every consumer.
            related_sections: z
              .array(z.string())
              .max(6)
              .describe(
                "Other section keys this finding also draws on, written exactly as they appear in the input (e.g. ['policyManager', 'compliance']). Never invent a label. Use an empty array when the finding sits inside a single section.",
              ),
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
              .max(600)
              .describe(
                "A specific, actionable step. Not a restatement of the problem. State the mechanism, what it applies to, and the effect expected once it is done; there is room for all three.",
              ),
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
              .max(600)
              .describe(
                "Tie this action to a specific signal in the input, quoting the value that motivates it. One or two sentences.",
              ),
            basis,
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
            gap: z
              .string()
              .min(10)
              .max(600)
              .describe(
                "What is missing, grounded in the supplied score fields. Name the score or field that shows it.",
              ),
            priority: severity,
            basis,
            what_would_close_this: whatWouldCloseThis,
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
            concern: z
              .string()
              .min(10)
              .max(600)
              .describe(
                "The specific concern, grounded in the input. Name the field that evidences it — review status, contract date, risk level.",
              ),
            severity,
            basis,
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
