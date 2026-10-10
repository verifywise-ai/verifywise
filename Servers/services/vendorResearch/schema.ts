import { z } from "zod";
import {
  FindingConfidence,
  RESEARCH_CATEGORIES,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { VENDOR_RISK_ENUMS } from "../../utils/validations/validation.utils";

/**
 * The values of the three enum fields. Likelihood and severity are the register's own, so an
 * accepted finding is always valid there. The prompt lists the same arrays, so what the model is
 * told and what the schema accepts cannot drift apart.
 */
export const RESEARCH_LIKELIHOODS = VENDOR_RISK_ENUMS.LIKELIHOOD;
export const RESEARCH_SEVERITIES = VENDOR_RISK_ENUMS.RISK_SEVERITY;
export const RESEARCH_CONFIDENCES = [
  "low",
  "medium",
  "high",
] as const satisfies readonly FindingConfidence[];

/**
 * `.strict()` is deliberate, as in the risk direction schema. An extra key means the model made up
 * a field, and `generateObjectWithSelfCorrection` hands it back as a Zod issue so the next attempt
 * drops it. Letting it through silently would hide the drift.
 */
const evidenceItemSchema = z
  .object({
    /** An id from the evidence pack. Whether it exists there is checked after parsing. */
    source_id: z.string(),
    /** Whether the quote is in that source is checked after parsing, too. */
    quote: z.string().max(300),
  })
  .strict();

const findingSchema = z
  .object({
    category: z.enum(RESEARCH_CATEGORIES),
    risk_description: z.string().max(300),
    impact_description: z.string().max(300),
    likelihood: z.enum(RESEARCH_LIKELIHOODS),
    risk_severity: z.enum(RESEARCH_SEVERITIES),
    action_plan: z.string().max(300),
    confidence: z.enum(RESEARCH_CONFIDENCES),
    evidence: z.array(evidenceItemSchema).min(1).max(5),
  })
  .strict();

const categoryNoteSchema = z
  .object({
    category: z.enum(RESEARCH_CATEGORIES),
    /** Feeds the run summary. */
    note: z.string().max(200),
  })
  .strict();

/**
 * The whole answer of the model. An empty `findings` array is valid and expected: it is what the
 * model returns when no evidence shows a risk. The bounds guard against runaway output; the real
 * limits (three per category, eight per run) are applied after validation.
 */
export const researchOutputSchema = z
  .object({
    findings: z.array(findingSchema).max(20),
    category_notes: z.array(categoryNoteSchema).max(4),
  })
  .strict();

export type ResearchOutput = z.infer<typeof researchOutputSchema>;
