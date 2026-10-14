import { z } from "zod";

/**
 * One catalog match the model proposes. Only the identity (`source` + `id`)
 * and the model-authored `reason` are taken from the answer — every catalog
 * field is rehydrated server-side from structures/risk-catalogs, so a
 * hallucinated summary or description can never reach the client.
 *
 * `.strict()` mirrors direction/schema.ts: an extra key means the model
 * invented a field, and the self-correction loop feeds that back as a Zod
 * issue rather than letting the drift through silently.
 */
export const catalogMatchSchema = z
  .object({
    source: z.enum(["mit", "ibm"]),
    id: z.number().int(),
    reason: z.string().max(300),
    ai_lifecycle_phase: z.string().optional(),
  })
  .strict();

export type CatalogMatch = z.infer<typeof catalogMatchSchema>;

/**
 * One free-form risk the model proposes. Likelihood/severity are the 1-5
 * integer scales used by the AI-detection suggestions; mapping onto the
 * string enums happens where the suggestion is accepted.
 */
export const suggestedRiskSchema = z
  .object({
    risk_name: z.string().min(1).max(200),
    risk_description: z.string().max(1000),
    risk_category: z.array(z.string()).max(5),
    ai_lifecycle_phase: z.string(),
    likelihood: z.number().int().min(1).max(5),
    severity: z.number().int().min(1).max(5),
    impact: z.string().max(1000),
    mitigation_plan: z.string().max(1000),
  })
  .strict();

export type SuggestedRiskOutput = z.infer<typeof suggestedRiskSchema>;

/**
 * The whole answer for one use case. The `max(10)` bounds are hallucination
 * and cost guards, not calibrated expectations — a longer list of lower-
 * quality suggestions is a worse answer, not a bigger one.
 */
export const riskSuggestionOutputSchema = z
  .object({
    matched: z.array(catalogMatchSchema).max(10),
    suggested: z.array(suggestedRiskSchema).max(10),
  })
  .strict();

export type RiskSuggestionOutput = z.infer<typeof riskSuggestionOutputSchema>;
