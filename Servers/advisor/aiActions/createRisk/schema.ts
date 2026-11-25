/**
 * Strict Zod schema for the `agent_create_risk` AI write tool.
 *
 * Mirrors the validation rules of the UI's `AddNewRiskForm`
 * (`Clients/src/presentation/components/AddNewRiskForm/index.tsx`):
 * same required fields, same min/max length caps, same enum allowed
 * values. Drift between this schema and the UI form means risks created
 * by the AI advisor would behave differently from risks created by hand,
 * so update both sides together when the form changes.
 *
 * `.strict()` rejects unknown keys — we want loud failures when the LLM
 * hallucinates a field that doesn't exist on the risks table.
 *
 * Enum values must match the Postgres enums defined in
 * `database/migrations/20260226234300-base-enums-and-roles.js`.
 */

import { z } from "zod";
import { RISK_APPROVAL_STATUSES } from "../../../domain.layer/enums/risk-approval-status.enum";

export const RiskSeverity = z.enum(["Negligible", "Minor", "Moderate", "Major", "Catastrophic"]);

export const RiskLikelihood = z.enum(["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"]);

export const RiskMitigationStatus = z.enum([
  "Not Started",
  "In Progress",
  "Completed",
  "On Hold",
  "Deferred",
  "Canceled",
  "Requires review",
]);

/** Pending, Approved, Rejected or Not required (decision 5). */
export const RiskApprovalStatusSchema = z.enum(RISK_APPROVAL_STATUSES);

export const RiskAiLifecyclePhase = z.enum([
  "Problem definition & planning",
  "Data collection & processing",
  "Model development & training",
  "Model validation & testing",
  "Deployment & integration",
  "Monitoring & maintenance",
  "Decommissioning & retirement",
]);

export const RiskCategory = z.enum([
  "Strategic risk",
  "Operational risk",
  "Compliance risk",
  "Financial risk",
  "Cybersecurity risk",
  "Reputational risk",
  "Legal risk",
  "Technological risk",
  "Third-party/vendor risk",
  "Environmental risk",
  "Human resources risk",
  "Geopolitical risk",
  "Fraud risk",
  "Data privacy risk",
  "Health and safety risk",
]);

/**
 * Tab 2's "current risk level" enum. The DB column uses the suffixed
 * "... risk" form (matches the Postgres enum in the risks table) — not
 * the bare "Critical/High/..." labels you might expect from the form
 * dropdown UI text.
 */
export const CurrentRiskLevel = z.enum([
  "Very high risk",
  "High risk",
  "Medium risk",
  "Low risk",
  "Very low risk",
  "Very Low risk", // legacy spelling, normalized before save
]);

/** ISO date string (YYYY-MM-DD or full ISO datetime). The form sends ISO strings. */
const isoDateString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), {
    message: "must be a valid ISO date string (e.g. 2026-04-15)",
  });

/**
 * Mirrors AddNewRiskForm validation. Field-by-field source of truth:
 *
 *   - Tab 1 "Risk":
 *       riskName              → required, 3..255
 *       riskDescription       → required, 1..256
 *       aiLifecyclePhase      → required, enum
 *       riskCategory          → required, ≥1 enum value
 *       potentialImpact       → required, 1..256
 *       severity, likelihood  → optional with defaults in the UI; left
 *                                optional here so the LLM doesn't have to
 *                                fabricate them when the user gives no hint
 *       reviewNotes           → optional, ≤1024
 *       actionOwner           → optional user id (risk_owner)
 *       applicableProjects    → optional int[]
 *       applicableFrameworks  → optional int[]
 *
 *   - Tab 2 "Mitigation": every field is optional, since a risk is often
 *     logged before its mitigation is known. A value that is sent is checked.
 *       mitigationStatus      → optional, enum
 *       mitigationPlan        → optional, 1..1024
 *       currentRiskLevel      → optional, enum
 *       implementationStrategy→ optional, 1..1024
 *       deadline              → optional, ISO date
 *       approver              → optional user id (risk_approval)
 *       approvalStatus        → optional, Pending / Approved / Rejected /
 *                                Not required; the risk service decides the
 *                                stored value and who may set a decision
 *       dateOfAssessment      → optional, ISO date
 */
export const AgentCreateRiskSchema = z
  .object({
    // Tab 1 — Risk
    risk_name: z.string().min(3).max(255),
    risk_description: z.string().min(1).max(256),
    ai_lifecycle_phase: RiskAiLifecyclePhase,
    risk_category: z.array(RiskCategory).min(1).max(15),
    impact: z.string().min(1).max(256),
    severity: RiskSeverity.optional(),
    likelihood: RiskLikelihood.optional(),
    review_notes: z.string().max(1024).optional(),
    risk_owner: z.number().int().positive().optional(),
    project_ids: z.array(z.number().int().positive()).max(50).optional(),
    framework_ids: z.array(z.number().int().positive()).max(50).optional(),

    // Tab 2 — Mitigation
    mitigation_status: RiskMitigationStatus.optional(),
    mitigation_plan: z.string().min(1).max(1024).optional(),
    current_risk_level: CurrentRiskLevel.optional(),
    implementation_strategy: z.string().min(1).max(1024).optional(),
    deadline: isoDateString.optional(),
    approver: z.number().int().positive().optional(),
    approval_status: RiskApprovalStatusSchema.optional(),
    date_of_assessment: isoDateString.optional(),
  })
  .strict();

export type AgentCreateRiskInput = z.infer<typeof AgentCreateRiskSchema>;
