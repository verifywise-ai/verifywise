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

export const ModelRiskCategory = z.enum([
  "Performance",
  "Bias & Fairness",
  "Security",
  "Data Quality",
  "Compliance",
]);

export const ModelRiskLevel = z.enum(["Low", "Medium", "High", "Critical"]);

export const ModelRiskStatus = z.enum(["Open", "In Progress", "Resolved", "Accepted"]);

const isoDateString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), {
    message: "must be a valid ISO date string (e.g. 2026-04-15)",
  });

export const AgentCreateModelRiskSchema = z
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
    likelihood: z.string().max(255).optional(),
  })
  .strict();

export type AgentCreateModelRiskInput = z.infer<typeof AgentCreateModelRiskSchema>;
