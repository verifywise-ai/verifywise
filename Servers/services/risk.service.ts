/**
 * Risk service — shared business logic for risk creation and update.
 *
 * Extracted from risks.ctrl.ts so the HTTP controller, the AI action executor
 * and the MCP tools share the same in-transaction steps (FAIR validation,
 * write, change-history write). Post-commit side effects (logEvent, portfolio
 * snapshot, risk-owner notification) remain the caller's responsibility.
 */

import { Transaction } from "sequelize";
import { createRiskQuery, updateRiskByIdQuery } from "../utils/risk.utils";
import { RiskModel } from "../domain.layer/models/risks/risk.model";
import { IRisk } from "../domain.layer/interfaces/I.risk";
import {
  recordMultipleFieldChanges,
  recordProjectRiskCreation,
  trackProjectRiskChanges,
} from "../utils/projectRiskChangeHistory.utils";
import { computeDerivedFields } from "../utils/quantitativeRisk.utils";
import { validateQuantitativeRiskFields } from "../utils/validations/quantitativeRiskValidation.utils";
import { ValidationError } from "../utils/validations/validation.utils";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";

export type CreateRiskServiceInput = Partial<RiskModel> & {
  projects?: number[];
  frameworks?: number[];
};

export interface CreateRiskServiceContext {
  userId: number;
  organizationId: number;
}

/**
 * Create a project risk. Runs inside the provided transaction.
 *
 * Steps:
 *  1. Normalize risk_owner (0 → null) — matches the existing controller behavior
 *  2. If FAIR quantitative fields are present: validate + compute derived fields
 *  3. INSERT into risks table (+ projects_risks and frameworks_risks junctions)
 *  4. Record creation in change history
 *
 * Caller is responsible for committing the transaction and running any
 * post-commit side effects (logEvent, portfolio snapshot, notifications).
 */
export async function createRiskService(
  input: CreateRiskServiceInput,
  ctx: CreateRiskServiceContext,
  transaction: Transaction,
): Promise<RiskModel> {
  // 1. Normalize risk_owner (matches original controller behavior: 0 → null).
  //    Must be `null` (not `undefined`) because `createRiskQuery` forwards
  //    this value straight into Sequelize named replacements, and Sequelize
  //    rejects `undefined` with "no entry in the replacement map". RiskModel
  //    types risk_owner as `number | undefined`, so we cast.
  const projectRiskData: CreateRiskServiceInput = {
    ...input,
    risk_owner: (input.risk_owner && Number(input.risk_owner) !== 0
      ? Number(input.risk_owner)
      : null) as unknown as number | undefined,
  };

  // 2. FAIR validation + derived field computation (only if present)
  if (projectRiskData.event_frequency_min != null || projectRiskData.ale_estimate != null) {
    const fairErrors = validateQuantitativeRiskFields(projectRiskData as Record<string, unknown>);
    if (fairErrors.length > 0) {
      throw new ValidationException(
        `Quantitative risk validation failed: ${fairErrors.join("; ")}`,
        "quantitative_risk_fields",
        projectRiskData,
      );
    }
    const derived = computeDerivedFields(projectRiskData);
    Object.assign(projectRiskData, derived);
  }

  // Build a payload where every column `createRiskQuery` reads is present
  // with an explicit value. `createRiskQuery` forwards values straight into
  // Sequelize named replacements, and Sequelize rejects `undefined` with
  // "no entry in the replacement map". The UI path never hits this because
  // the form submits all fields; the AI path does, because the LLM only
  // sends fields it chose to populate.
  const normalized = {
    risk_name: projectRiskData.risk_name,
    risk_owner: projectRiskData.risk_owner ?? null,
    ai_lifecycle_phase: projectRiskData.ai_lifecycle_phase ?? null,
    risk_description: projectRiskData.risk_description ?? null,
    risk_category: projectRiskData.risk_category ?? [],
    impact: projectRiskData.impact ?? null,
    assessment_mapping: projectRiskData.assessment_mapping ?? null,
    controls_mapping: projectRiskData.controls_mapping ?? null,
    likelihood: projectRiskData.likelihood ?? null,
    severity: projectRiskData.severity ?? null,
    risk_level_autocalculated: projectRiskData.risk_level_autocalculated ?? null,
    review_notes: projectRiskData.review_notes ?? null,
    mitigation_status: projectRiskData.mitigation_status ?? null,
    current_risk_level: projectRiskData.current_risk_level ?? null,
    deadline: projectRiskData.deadline ?? null,
    mitigation_plan: projectRiskData.mitigation_plan ?? null,
    implementation_strategy: projectRiskData.implementation_strategy ?? null,
    mitigation_evidence_document: projectRiskData.mitigation_evidence_document ?? null,
    likelihood_mitigation: projectRiskData.likelihood_mitigation ?? null,
    risk_severity: projectRiskData.risk_severity ?? null,
    final_risk_level: projectRiskData.final_risk_level ?? null,
    risk_approval: projectRiskData.risk_approval ?? null,
    approval_status: projectRiskData.approval_status ?? null,
    date_of_assessment: projectRiskData.date_of_assessment ?? null,
    is_demo: projectRiskData.is_demo ?? false,
    // FAIR quantitative fields — createRiskQuery already uses `?? null` on
    // these internally, but we mirror that here for uniformity.
    event_frequency_min: projectRiskData.event_frequency_min ?? null,
    event_frequency_likely: projectRiskData.event_frequency_likely ?? null,
    event_frequency_max: projectRiskData.event_frequency_max ?? null,
    loss_regulatory_min: projectRiskData.loss_regulatory_min ?? null,
    loss_regulatory_likely: projectRiskData.loss_regulatory_likely ?? null,
    loss_regulatory_max: projectRiskData.loss_regulatory_max ?? null,
    loss_operational_min: projectRiskData.loss_operational_min ?? null,
    loss_operational_likely: projectRiskData.loss_operational_likely ?? null,
    loss_operational_max: projectRiskData.loss_operational_max ?? null,
    loss_litigation_min: projectRiskData.loss_litigation_min ?? null,
    loss_litigation_likely: projectRiskData.loss_litigation_likely ?? null,
    loss_litigation_max: projectRiskData.loss_litigation_max ?? null,
    loss_reputational_min: projectRiskData.loss_reputational_min ?? null,
    loss_reputational_likely: projectRiskData.loss_reputational_likely ?? null,
    loss_reputational_max: projectRiskData.loss_reputational_max ?? null,
    total_loss_likely: projectRiskData.total_loss_likely ?? null,
    ale_estimate: projectRiskData.ale_estimate ?? null,
    control_effectiveness: projectRiskData.control_effectiveness ?? null,
    residual_ale: projectRiskData.residual_ale ?? null,
    mitigation_cost_annual: projectRiskData.mitigation_cost_annual ?? null,
    roi_percentage: projectRiskData.roi_percentage ?? null,
    benchmark_id: projectRiskData.benchmark_id ?? null,
    currency: projectRiskData.currency ?? "USD",
    projects: projectRiskData.projects ?? [],
    frameworks: projectRiskData.frameworks ?? [],
  };

  // 3. Insert risk + junctions. The cast matches the original controller:
  //    Sequelize's Partial<RiskModel> doesn't compose cleanly with the extra
  //    projects/frameworks fields due to method type variance.
  const newRisk = await createRiskQuery(
    normalized as unknown as Partial<RiskModel & { projects: number[]; frameworks: number[] }>,
    ctx.organizationId,
    transaction,
  );

  if (!newRisk) {
    throw new Error("createRiskQuery returned null");
  }

  // 4. Change history (in the same transaction)
  await recordProjectRiskCreation(
    newRisk.id!,
    ctx.userId,
    ctx.organizationId,
    projectRiskData,
    transaction,
  );

  return newRisk;
}

/**
 * Thrown when the FAIR quantitative fields do not validate.
 *
 * Carries the individual messages because the controller answers 400 with the
 * whole list, not a single sentence, and the MCP tool reads the same list back
 * to the model so it can correct the call.
 */
export class QuantitativeRiskValidationError extends Error {
  constructor(public readonly errors: ValidationError[]) {
    super("Quantitative risk validation failed");
    this.name = "QuantitativeRiskValidationError";
  }
}

export type UpdateRiskServiceInput = CreateRiskServiceInput;

/**
 * Update a project risk. Runs inside the provided transaction.
 *
 * Steps:
 *  1. Normalize risk_owner (0 → null) — matches the existing controller behavior
 *  2. If FAIR fields are in play: merge them over the stored row, validate the
 *     merged set, then recompute the derived fields
 *  3. Diff the incoming values against the stored row
 *  4. UPDATE the risk (+ projects_risks and frameworks_risks junctions)
 *  5. Record the diff in change history
 *
 * `existingRisk` is the caller's — it already had to load the row to answer
 * "no such risk", so it is passed in rather than read twice.
 *
 * Caller is responsible for committing the transaction and running any
 * post-commit side effects (logEvent, portfolio snapshot, risk-link recompute,
 * risk-owner notification).
 */
export async function updateRiskService(
  riskId: number,
  input: UpdateRiskServiceInput,
  existingRisk: IRisk,
  ctx: CreateRiskServiceContext,
  transaction: Transaction,
): Promise<RiskModel | null> {
  // 1. Convert optional FK fields (0 => NULL), as the controller did.
  const updateData = {
    ...input,
    risk_owner: (input.risk_owner && Number(input.risk_owner) !== 0
      ? Number(input.risk_owner)
      : null) as unknown as number | undefined,
  } as Partial<RiskModel & { projects: number[]; frameworks: number[] }>;

  // 2. Any one of these three arriving means the whole FAIR set is recomputed,
  //    so the stored values are merged in first — validating only the incoming
  //    subset would pass a set that is inconsistent once combined.
  if (
    updateData.event_frequency_min !== undefined ||
    updateData.control_effectiveness !== undefined ||
    updateData.mitigation_cost_annual !== undefined
  ) {
    const mergedFairFields = {
      event_frequency_min: updateData.event_frequency_min ?? existingRisk.event_frequency_min,
      event_frequency_likely:
        updateData.event_frequency_likely ?? existingRisk.event_frequency_likely,
      event_frequency_max: updateData.event_frequency_max ?? existingRisk.event_frequency_max,
      loss_regulatory_min: updateData.loss_regulatory_min ?? existingRisk.loss_regulatory_min,
      loss_regulatory_likely:
        updateData.loss_regulatory_likely ?? existingRisk.loss_regulatory_likely,
      loss_regulatory_max: updateData.loss_regulatory_max ?? existingRisk.loss_regulatory_max,
      loss_operational_min: updateData.loss_operational_min ?? existingRisk.loss_operational_min,
      loss_operational_likely:
        updateData.loss_operational_likely ?? existingRisk.loss_operational_likely,
      loss_operational_max: updateData.loss_operational_max ?? existingRisk.loss_operational_max,
      loss_litigation_min: updateData.loss_litigation_min ?? existingRisk.loss_litigation_min,
      loss_litigation_likely:
        updateData.loss_litigation_likely ?? existingRisk.loss_litigation_likely,
      loss_litigation_max: updateData.loss_litigation_max ?? existingRisk.loss_litigation_max,
      loss_reputational_min: updateData.loss_reputational_min ?? existingRisk.loss_reputational_min,
      loss_reputational_likely:
        updateData.loss_reputational_likely ?? existingRisk.loss_reputational_likely,
      loss_reputational_max: updateData.loss_reputational_max ?? existingRisk.loss_reputational_max,
      control_effectiveness: updateData.control_effectiveness ?? existingRisk.control_effectiveness,
      mitigation_cost_annual:
        updateData.mitigation_cost_annual ?? existingRisk.mitigation_cost_annual,
    };

    const fairErrors = validateQuantitativeRiskFields(mergedFairFields as Record<string, unknown>);
    if (fairErrors.length > 0) {
      throw new QuantitativeRiskValidationError(fairErrors);
    }
    Object.assign(updateData, computeDerivedFields(mergedFairFields));
  }

  // 3. Diff before writing, while the stored row is still the old one.
  const changes = await trackProjectRiskChanges(existingRisk as RiskModel, updateData);

  // 4. Write. An absent projects/frameworks list is sent as empty, as before.
  const updatedRisk = await updateRiskByIdQuery(
    riskId,
    {
      ...updateData,
      projects: input.projects || [],
      frameworks: input.frameworks || [],
    },
    ctx.organizationId,
    transaction,
  );

  // 5. Change history (in the same transaction)
  if (updatedRisk && changes.length > 0) {
    await recordMultipleFieldChanges(riskId, ctx.userId, ctx.organizationId, changes, transaction);
  }

  return updatedRisk;
}
