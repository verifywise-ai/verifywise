import { z } from "zod";
import { RESEARCH_CATEGORIES } from "../../domain.layer/interfaces/i.vendorResearch";
import { VENDOR_RISK_ENUMS } from "../../utils/validations/validation.utils";

/**
 * The values of the three enum fields. Likelihood and severity are the register's own, so an
 * accepted finding is always valid there. The prompt lists the same arrays, so what the model is
 * told and what the schema accepts cannot drift apart.
 */
export const RESEARCH_LIKELIHOODS = VENDOR_RISK_ENUMS.LIKELIHOOD;
export const RESEARCH_SEVERITIES = VENDOR_RISK_ENUMS.RISK_SEVERITY;

// The bounds of the answer. The system prompt states these same numbers, written from the
// constants, so what the model is told and what the schema accepts cannot drift apart.

/** The longest risk description, impact description, action plan and rationale, in characters. */
export const MAX_FINDING_TEXT_CHARS = 300;
/** The longest quote of a citation, in characters. */
export const MAX_QUOTE_CHARS = 300;
/** The longest category note, in characters. */
export const MAX_NOTE_CHARS = 200;
/** The most citations on one finding. A finding needs at least one. */
export const MAX_EVIDENCE_PER_FINDING = 5;
/** The most category notes: one for each category. */
export const MAX_CATEGORY_NOTES = RESEARCH_CATEGORIES.length;
/**
 * The most findings kept for one category. The schema does not enforce this one: the model is
 * told the number, and the pipeline applies it after validation, so an answer over it is cut
 * instead of being sent back for another attempt.
 */
export const MAX_PER_CATEGORY = 3;

/**
 * The objects below are deliberately not `.strict()`: a property that is not in the schema is
 * dropped by the parse. A strict object reports it as the issue `Unrecognized key: "<the key>"`,
 * and `generateObjectWithSelfCorrection` writes the text of every issue, as it is, into the
 * system prompt of the next attempt. The model reads web pages, and a page can steer it into
 * emitting a property named as the page likes, so a strict schema would let a page write into the
 * system prompt, outside the `<evidence>` block. Dropping the property costs nothing: nothing
 * reads it. The provider is still told that no other property is allowed: the SDK adds
 * `additionalProperties: false` to every object of the JSON schema it sends, strict or not.
 */
const evidenceItemSchema = z.object({
  /** An id from the evidence pack. Whether it exists there is checked after parsing. */
  source_id: z.string(),
  /** Whether the quote is in that source is checked after parsing, too. */
  quote: z.string().max(MAX_QUOTE_CHARS),
});

const findingSchema = z.object({
  category: z.enum(RESEARCH_CATEGORIES),
  risk_description: z.string().max(MAX_FINDING_TEXT_CHARS),
  impact_description: z.string().max(MAX_FINDING_TEXT_CHARS),
  likelihood: z.enum(RESEARCH_LIKELIHOODS),
  risk_severity: z.enum(RESEARCH_SEVERITIES),
  action_plan: z.string().max(MAX_FINDING_TEXT_CHARS),
  /** One sentence: why this likelihood and this severity. Shown next to the rating. */
  rationale: z.string().max(MAX_FINDING_TEXT_CHARS),
  evidence: z.array(evidenceItemSchema).min(1).max(MAX_EVIDENCE_PER_FINDING),
});

const categoryNoteSchema = z.object({
  category: z.enum(RESEARCH_CATEGORIES),
  /** Feeds the run summary. */
  note: z.string().max(MAX_NOTE_CHARS),
});

/**
 * The answer the analysis asks the model for. A finding has no confidence: the credibility label
 * is computed by code from the sources (see credibility.ts), and the model is not asked for one
 * (M3 Part B). The objects are not strict either, so a confidence that a model still gives, from
 * an old recording of the evaluation or from a model that remembers the earlier prompt, is dropped
 * by the parse. An empty `findings` array is valid and expected: it is what the model returns when
 * no evidence shows a risk. The bounds guard against runaway output; the real limits
 * (MAX_PER_CATEGORY per category, eight per run) are applied after validation.
 */
export const researchOutputSchema = z.object({
  findings: z.array(findingSchema).max(20),
  category_notes: z.array(categoryNoteSchema).max(MAX_CATEGORY_NOTES),
});

export type ResearchOutput = z.infer<typeof researchOutputSchema>;

/**
 * The same schema and type under the names the analysis, the recordings of the evaluation and the
 * tests use. They were a second schema while the answer could carry a confidence.
 */
export const credibilityOutputSchema = researchOutputSchema;
export type CredibilityOutput = ResearchOutput;
export type AnyResearchOutput = ResearchOutput;
