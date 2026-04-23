/**
 * Strict Zod schema for the `agent_update_risk` AI write tool.
 *
 * Partial counterpart to `createRisk/schema.ts`. The shapes and enums are
 * identical, but everything except `risk_id` is optional — callers set
 * only the fields they're changing. A `.refine()` rule rejects the
 * degenerate case of "risk_id only, nothing to change" so the LLM can't
 * file no-op approvals.
 *
 * Unknown keys rejected via `.strict()`, matching the rest of the
 * aiActions surface.
 */

import { z } from "zod";
import type { IRisk } from "../../../domain.layer/interfaces/I.risk";
import {
  RiskSeverity,
  RiskLikelihood,
  RiskMitigationStatus,
  RiskAiLifecyclePhase,
  RiskCategory,
  CurrentRiskLevel,
} from "../createRisk/schema";

const isoDateString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), {
    message: "must be a valid ISO date string (e.g. 2026-04-15)",
  });

/**
 * List of fields the LLM is allowed to change on an existing risk.
 * Intentionally the same set as `createRisk/schema.ts` minus the
 * required-ness — we want feature parity with create, not with the
 * raw RiskModel (which has many more internal columns the LLM should
 * never touch, like `risk_level_autocalculated` — that gets recomputed
 * server-side when severity/likelihood change).
 *
 * `risk_owner` and `approver` are user ids; the LLM resolves names via
 * `list_users`. `project_ids` / `framework_ids` are ids; the LLM uses
 * `list_projects` / `list_frameworks` (when added) for those.
 */
export const AgentUpdateRiskSchema = z
  .object({
    /** Target risk — required. The LLM must find this via fetch_risks first. */
    risk_id: z.number().int().positive(),

    // All other fields match createRisk/schema.ts but are optional.
    risk_name: z.string().min(3).max(255).optional(),
    risk_description: z.string().min(1).max(256).optional(),
    ai_lifecycle_phase: RiskAiLifecyclePhase.optional(),
    risk_category: z.array(RiskCategory).min(1).max(15).optional(),
    impact: z.string().min(1).max(256).optional(),
    severity: RiskSeverity.optional(),
    likelihood: RiskLikelihood.optional(),
    review_notes: z.string().max(1024).optional(),
    risk_owner: z.number().int().positive().optional(),
    project_ids: z.array(z.number().int().positive()).max(50).optional(),
    framework_ids: z.array(z.number().int().positive()).max(50).optional(),

    mitigation_status: RiskMitigationStatus.optional(),
    mitigation_plan: z.string().min(1).max(1024).optional(),
    current_risk_level: CurrentRiskLevel.optional(),
    implementation_strategy: z.string().min(1).max(1024).optional(),
    deadline: isoDateString.optional(),
    approver: z.number().int().positive().optional(),
    approval_status: RiskMitigationStatus.optional(),
    date_of_assessment: isoDateString.optional(),
  })
  .strict()
  .refine(
    (data) => {
      // At least one updatable field must be present. risk_id alone is
      // a no-op — rejecting here produces a clear validation_failed the
      // LLM can recover from.
      const keys = Object.keys(data).filter((k) => k !== "risk_id");
      return keys.length > 0;
    },
    {
      message:
        "At least one field besides risk_id must be provided — nothing to update",
      path: [],
    },
  );

export type AgentUpdateRiskInput = z.infer<typeof AgentUpdateRiskSchema>;

/**
 * Mapping between LLM-facing input field names and the `IRisk` DB column
 * names they correspond to. The two sides are identical for most fields,
 * but `approver` on the input maps to `risk_approval` on the DB — the
 * diff-preview renderer has to know both keys to read the new value
 * from the LLM input and the current value from the loaded risk row.
 *
 * `as const satisfies readonly { inputKey: keyof AgentUpdateRiskInput;
 * dbKey: keyof IRisk }[]` does two things at once:
 *   - `as const` preserves the narrow literal types of each entry, so
 *     callers can use `inputKey` and `dbKey` directly as keyof X without
 *     casts.
 *   - `satisfies` forces every entry to be a valid key on BOTH the
 *     input type and the IRisk DB interface. If either side drifts
 *     (a field is renamed, a new column is added, etc.), this line
 *     fails to compile — we get a loud error instead of a silent
 *     always-undefined read in the preview loop.
 *
 * Keep this in lockstep with the update executor's own field forwarding
 * in `execute.ts` — any field listed here should also be mapped there,
 * and vice versa.
 */
export const AGENT_UPDATE_RISK_UPDATABLE_FIELDS = [
  { inputKey: "risk_name", dbKey: "risk_name" },
  { inputKey: "risk_description", dbKey: "risk_description" },
  { inputKey: "ai_lifecycle_phase", dbKey: "ai_lifecycle_phase" },
  { inputKey: "risk_category", dbKey: "risk_category" },
  { inputKey: "impact", dbKey: "impact" },
  { inputKey: "severity", dbKey: "severity" },
  { inputKey: "likelihood", dbKey: "likelihood" },
  { inputKey: "review_notes", dbKey: "review_notes" },
  { inputKey: "risk_owner", dbKey: "risk_owner" },
  { inputKey: "mitigation_status", dbKey: "mitigation_status" },
  { inputKey: "mitigation_plan", dbKey: "mitigation_plan" },
  { inputKey: "current_risk_level", dbKey: "current_risk_level" },
  { inputKey: "implementation_strategy", dbKey: "implementation_strategy" },
  { inputKey: "deadline", dbKey: "deadline" },
  { inputKey: "approver", dbKey: "risk_approval" },
  { inputKey: "approval_status", dbKey: "approval_status" },
  { inputKey: "date_of_assessment", dbKey: "date_of_assessment" },
] as const satisfies ReadonlyArray<{
  inputKey: keyof AgentUpdateRiskInput;
  dbKey: keyof IRisk;
}>;
