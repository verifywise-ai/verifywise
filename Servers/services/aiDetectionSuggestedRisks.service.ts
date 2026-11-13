/**
 * @fileoverview AI Detection suggested risk actions
 *
 * Records what a user did with the LLM-suggested risks of a scan, so the
 * choice survives a reload: added to the risk register (with the created
 * risk's id) or ignored (with the reason). An ignore can be undone.
 *
 * @module services/aiDetectionSuggestedRisks
 */

import {
  IServiceContext,
  ISuggestedRiskAction,
  SuggestedRiskIgnoreReason,
} from "../domain.layer/interfaces/i.aiDetection";
import {
  BusinessLogicException,
  NotFoundException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";
import { getScanByIdQuery } from "../utils/aiDetection.utils";
import {
  deleteSuggestedRiskActionQuery,
  getSuggestedRiskActionQuery,
  listSuggestedRiskActionsQuery,
  riskExistsInOrganizationQuery,
  suggestionKey,
  upsertSuggestedRiskActionQuery,
} from "../utils/aiDetectionDecisions.utils";

const IGNORE_REASONS: SuggestedRiskIgnoreReason[] = ["already_added", "not_real_risk"];

export interface IRecordSuggestedRiskActionInput {
  risk_name?: unknown;
  action?: unknown;
  risk_id?: unknown;
  reason?: unknown;
}

async function assertScanExists(scanId: number, ctx: IServiceContext): Promise<void> {
  const scan = await getScanByIdQuery(scanId, ctx.organizationId);
  if (!scan) {
    throw new NotFoundException(`Scan ${scanId} not found`);
  }
}

/**
 * List the actions taken on the suggested risks of a scan.
 */
export async function listSuggestedRiskActions(
  scanId: number,
  ctx: IServiceContext,
): Promise<ISuggestedRiskAction[]> {
  await assertScanExists(scanId, ctx);
  return listSuggestedRiskActionsQuery(scanId, ctx.organizationId);
}

/**
 * Record that a suggestion was added to the risk register or ignored.
 *
 * Adding is refused when the suggestion is already linked to a risk that
 * still exists, so the same suggestion cannot be added twice.
 */
export async function recordSuggestedRiskAction(
  scanId: number,
  input: IRecordSuggestedRiskActionInput,
  ctx: IServiceContext,
): Promise<ISuggestedRiskAction[]> {
  const riskName = typeof input.risk_name === "string" ? input.risk_name.trim() : "";
  if (!riskName || riskName.length > 500) {
    throw new ValidationException("risk_name is required and must be at most 500 characters");
  }
  if (input.action !== "added" && input.action !== "ignored") {
    throw new ValidationException("action must be 'added' or 'ignored'");
  }

  await assertScanExists(scanId, ctx);

  const existing = await getSuggestedRiskActionQuery(
    scanId,
    suggestionKey(riskName),
    ctx.organizationId,
  );

  if (input.action === "added") {
    const riskId = Number(input.risk_id);
    if (!Number.isInteger(riskId) || riskId <= 0) {
      throw new ValidationException("risk_id must be a positive integer");
    }
    if (existing?.action === "added" && !existing.risk_deleted && existing.risk_id !== riskId) {
      throw new BusinessLogicException("This suggestion is already in the risk register");
    }
    if (!(await riskExistsInOrganizationQuery(riskId, ctx.organizationId))) {
      throw new NotFoundException(`Risk ${riskId} not found`);
    }
    await upsertSuggestedRiskActionQuery(
      { scanId, riskName, action: "added", riskId, ignoreReason: null },
      ctx.userId,
      ctx.organizationId,
    );
  } else {
    const reason = input.reason as SuggestedRiskIgnoreReason;
    if (!IGNORE_REASONS.includes(reason)) {
      throw new ValidationException("reason must be 'already_added' or 'not_real_risk'");
    }
    if (existing?.action === "added" && !existing.risk_deleted) {
      throw new BusinessLogicException("This suggestion is already in the risk register");
    }
    await upsertSuggestedRiskActionQuery(
      { scanId, riskName, action: "ignored", riskId: null, ignoreReason: reason },
      ctx.userId,
      ctx.organizationId,
    );
  }

  return listSuggestedRiskActionsQuery(scanId, ctx.organizationId);
}

/**
 * Undo an ignore. Only ignored suggestions can be restored; a suggestion
 * added to the register is changed from the risk register itself.
 */
export async function deleteSuggestedRiskAction(
  scanId: number,
  actionId: number,
  ctx: IServiceContext,
): Promise<ISuggestedRiskAction[]> {
  await assertScanExists(scanId, ctx);
  const actions = await listSuggestedRiskActionsQuery(scanId, ctx.organizationId);
  const target = actions.find((a) => a.id === actionId);
  if (!target) {
    throw new NotFoundException(`Suggested risk action ${actionId} not found`);
  }
  if (target.action !== "ignored") {
    throw new BusinessLogicException("Only ignored suggestions can be restored");
  }
  await deleteSuggestedRiskActionQuery(actionId, scanId, ctx.organizationId);
  return listSuggestedRiskActionsQuery(scanId, ctx.organizationId);
}
