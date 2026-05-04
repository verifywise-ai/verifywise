/**
 * Post-approval executor for `agent_update_risk`.
 *
 * Delegates to `updateRiskByIdQuery` which only touches fields that are
 * present (defined + truthy, per its internal filter) in the payload.
 * That's exactly the partial-update semantics we want — callers send
 * only the fields they're changing.
 *
 * Two nuances over create:
 *   - `risk_level_autocalculated` must be RE-computed when severity or
 *     likelihood changes. We load the current row inside the approve
 *     transaction, merge the new values, and call `calculateRiskLevel`
 *     to produce the updated derived value.
 *   - ISO date strings need to be converted to `Date` objects before
 *     hitting Sequelize, same as in the create executor.
 */

import { updateRiskByIdQuery, getRiskByIdQuery } from "../../../utils/risk.utils";
import { calculateRiskLevel } from "../../../utils/validations/riskValidation.utils";
import type { AiActionExecuteContext, AiActionExecuteResult } from "../types";
import type { AgentUpdateRiskInput } from "./schema";

export async function executeUpdateRisk(
  ctx: AiActionExecuteContext<AgentUpdateRiskInput>,
): Promise<AiActionExecuteResult> {
  const input = ctx.inputParams;

  // Load current row so we can merge severity/likelihood for the
  // risk-level recompute and so the mutation fails fast if the row
  // disappeared between file-time and approve-time.
  const current = await getRiskByIdQuery(input.risk_id, ctx.organizationId, false);

  if (!current) {
    throw new Error(`Risk #${input.risk_id} no longer exists — cannot apply update.`);
  }

  // Merge severity + likelihood (input takes priority) so the recompute
  // uses the final values, not just the changed one.
  const effectiveSeverity = input.severity ?? current.severity ?? "Negligible";
  const effectiveLikelihood = input.likelihood ?? current.likelihood ?? "Rare";

  const severityChanged = input.severity !== undefined && input.severity !== current.severity;
  const likelihoodChanged =
    input.likelihood !== undefined && input.likelihood !== current.likelihood;

  // Only recompute if at least one of the two actually changed —
  // otherwise we'd overwrite a potentially human-curated value with
  // a re-derived one that matches.
  const recomputedLevel =
    severityChanged || likelihoodChanged
      ? (calculateRiskLevel(effectiveSeverity, effectiveLikelihood) as
          | "No risk"
          | "Very low risk"
          | "Low risk"
          | "Medium risk"
          | "High risk"
          | "Very high risk")
      : undefined;

  // Build the partial payload for updateRiskByIdQuery. Only set fields
  // the LLM asked to change, plus the recomputed risk_level if we
  // decided to touch it above.
  const partial: Record<string, unknown> = {};

  if (input.risk_name !== undefined) partial.risk_name = input.risk_name;
  if (input.risk_description !== undefined) partial.risk_description = input.risk_description;
  if (input.ai_lifecycle_phase !== undefined) partial.ai_lifecycle_phase = input.ai_lifecycle_phase;
  if (input.risk_category !== undefined) partial.risk_category = input.risk_category;
  if (input.impact !== undefined) partial.impact = input.impact;
  if (input.severity !== undefined) partial.severity = input.severity;
  if (input.likelihood !== undefined) partial.likelihood = input.likelihood;
  if (input.review_notes !== undefined) partial.review_notes = input.review_notes;
  if (input.risk_owner !== undefined) partial.risk_owner = input.risk_owner;
  if (input.mitigation_status !== undefined) partial.mitigation_status = input.mitigation_status;
  if (input.mitigation_plan !== undefined) partial.mitigation_plan = input.mitigation_plan;
  if (input.current_risk_level !== undefined) partial.current_risk_level = input.current_risk_level;
  if (input.implementation_strategy !== undefined)
    partial.implementation_strategy = input.implementation_strategy;
  if (input.deadline !== undefined) partial.deadline = new Date(input.deadline);
  if (input.approver !== undefined) partial.risk_approval = input.approver;
  if (input.approval_status !== undefined) partial.approval_status = input.approval_status;
  if (input.date_of_assessment !== undefined)
    partial.date_of_assessment = new Date(input.date_of_assessment);

  if (recomputedLevel !== undefined) {
    partial.risk_level_autocalculated = recomputedLevel;
  }

  // Projects / frameworks go through the same partial as separate keys.
  // `updateRiskByIdQuery` handles them via its own junction-table logic.
  if (input.project_ids !== undefined) {
    (partial as { projects?: number[] }).projects = input.project_ids;
  }
  if (input.framework_ids !== undefined) {
    (partial as { frameworks?: number[] }).frameworks = input.framework_ids;
  }

  const updated = await updateRiskByIdQuery(
    input.risk_id,
    partial,
    ctx.organizationId,
    ctx.transaction,
  );

  if (!updated || updated.id == null) {
    throw new Error(
      `updateRiskByIdQuery returned no row for risk #${input.risk_id} — refusing to record an empty execution result.`,
    );
  }

  return { entityId: updated.id };
}
