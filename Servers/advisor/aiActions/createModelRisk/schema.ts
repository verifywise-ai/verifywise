/**
 * Strict Zod schema for the `agent_create_model_risk` AI write tool —
 * the user-driven path. Mirrors the schema used by the older
 * `agent_suggest_model_risk` (auto-suggest path) intentionally; the two
 * tools share input shape but route their approvals differently:
 *
 *   - agent_create_model_risk  (this tool)         → approval_requests
 *                                                    (Pending Approvals page)
 *   - agent_suggest_model_risk (createWriteToolFn) → ai_action_approvals
 *                                                    (inline chat card)
 *
 * Enum values must match the Postgres enums on `model_risks` columns —
 * see `database/migrations/20260226234300-base-enums-and-roles.js`.
 */

import { z } from "zod";
import {
  canonicalLikelihood,
  canonicalSeverity,
  LIKELIHOOD_SCALE,
  LikelihoodLabel,
  SEVERITY_SCALE,
  SeverityLabel,
} from "../../../utils/riskLevel.utils";

export const ModelRiskCategory = z.enum([
  "Performance",
  "Bias & Fairness",
  "Security",
  "Data Quality",
  "Compliance",
]);

export const ModelRiskLevel = z.enum(["Low", "Medium", "High", "Critical"]);

/** The likelihood and severity lists the level is computed from (decision 10). */
export const ModelRiskLikelihood = z.enum(
  Object.keys(LIKELIHOOD_SCALE) as [LikelihoodLabel, ...LikelihoodLabel[]],
);
export const ModelRiskSeverity = z.enum(
  Object.keys(SEVERITY_SCALE) as [SeverityLabel, ...SeverityLabel[]],
);

/** The wording the likelihood migration uses for text that is not a label. */
export const PREVIOUS_LIKELIHOOD = "Previous likelihood: ";

/** `text` with the "Previous likelihood" line appended after a blank line. */
export const withPreviousLikelihood = (text: string | null | undefined, value: string) =>
  text && text.trim()
    ? `${text}\n\n${PREVIOUS_LIKELIHOOD}${value}`
    : `${PREVIOUS_LIKELIHOOD}${value}`;

/**
 * Approvals filed before the likelihood list (decision 10) hold free-text
 * likelihoods, and the stored input is parsed again when it is approved.
 * A label in any case gets its spelling; any other text leaves `likelihood`
 * and, as the migration does, is kept as a "Previous likelihood" line: in the
 * description (`into: "description"`, for a create) or in
 * `_previous_likelihood` for the executor to append to the stored
 * description (`into: "carry"`, for an update, which may not send one).
 */
export function normalizeStoredLabels(raw: unknown, into: "description" | "carry"): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const out: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  if (typeof out.severity === "string")
    out.severity = canonicalSeverity(out.severity) ?? out.severity;
  if (typeof out.likelihood !== "string") return out;
  const label = canonicalLikelihood(out.likelihood);
  if (label) {
    out.likelihood = label;
    return out;
  }
  const text = out.likelihood.trim();
  delete out.likelihood;
  if (!text) return out;
  if (into === "description") {
    out.description = withPreviousLikelihood(out.description as string | undefined, text);
  } else {
    out._previous_likelihood = text;
  }
  return out;
}

export const ModelRiskStatus = z.enum(["Open", "In Progress", "Resolved", "Accepted"]);

const isoDateString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), {
    message: "must be a valid ISO date string (e.g. 2026-04-15)",
  });

const AgentCreateModelRiskObject = z
  .object({
    model_id: z.number().int().positive().optional(),
    /**
     * Same-turn-as-model-registration id. When the LLM proposes a model
     * and a user-explicit risk in the same turn, the model row doesn't
     * exist yet — so model_id can't be used. Pass the approvalRequestId
     * returned by agent_register_model here instead. The executor
     * resolves it to the eventual model_id once the user approves the
     * model. If the user approves this risk first, the executor throws
     * a transient error so it stays clickable until the model lands.
     */
    pending_model_approval_id: z.number().int().positive().optional(),
    risk_name: z.string().min(3).max(255),
    description: z.string().max(2048).optional(),
    risk_category: ModelRiskCategory.optional(),
    /**
     * No longer offered to the model: the level comes from likelihood and
     * severity. Still parsed so an approval filed before keeps executing;
     * the service ignores it when both are set.
     */
    risk_level: ModelRiskLevel.optional(),
    status: ModelRiskStatus.optional(),
    /**
     * Owner user_id. The LLM tends to fill omitted optional integer
     * fields with 0 (sentinel for "missing"); we coerce 0 → undefined
     * so the positive() check doesn't reject the whole call. Real
     * user ids start at 1, so 0 is unambiguous.
     */
    owner: z.preprocess(
      (v) => (v === 0 || v === null ? undefined : v),
      z.number().int().positive().optional(),
    ),
    target_date: isoDateString.optional(),
    mitigation_plan: z.string().max(2048).optional(),
    impact: z.string().max(2048).optional(),
    likelihood: ModelRiskLikelihood.optional(),
    severity: ModelRiskSeverity.optional(),
  })
  .strict();

/**
 * The input, parsed when filed and again when the approval executes, with
 * the labels normalized.
 */
export const AgentCreateModelRiskSchema = z.preprocess(
  (raw) => normalizeStoredLabels(raw, "description"),
  AgentCreateModelRiskObject,
);

export type AgentCreateModelRiskInput = z.infer<typeof AgentCreateModelRiskObject>;
