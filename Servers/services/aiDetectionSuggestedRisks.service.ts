/**
 * @fileoverview AI Detection suggested risk actions
 *
 * Records what a user did with the LLM-suggested risks of a scan, so the
 * choice survives a reload: added to the risk register (with the created
 * risk's id) or ignored (with the reason). An ignore can be undone.
 *
 * Adding creates the risk and records the link in one transaction, under a
 * lock on the suggestion, so the same suggestion can never be added twice.
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
  ConflictException,
  NotFoundException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";
import { getScanByIdQuery } from "../utils/aiDetection.utils";
import {
  beginOrganizationTransaction,
  deleteIgnoredSuggestedRiskActionQuery,
  getSuggestedRiskActionByIdQuery,
  getSuggestedRiskActionQuery,
  listSuggestedRiskActionsQuery,
  lockSuggestedRiskQuery,
  suggestionKey,
  upsertSuggestedRiskActionQuery,
} from "../utils/aiDetectionDecisions.utils";
import { createRiskService, CreateRiskServiceInput } from "./risk.service";

const IGNORE_REASONS: SuggestedRiskIgnoreReason[] = ["already_added", "not_real_risk"];

/** Message of the 409 answered when a suggestion is already linked to a live risk. */
export const ALREADY_IN_REGISTER = "This suggestion is already in the risk register";

export interface IRecordSuggestedRiskActionInput {
  risk_name?: unknown;
  action?: unknown;
  reason?: unknown;
}

type CreatedRisk = Awaited<ReturnType<typeof createRiskService>>;

async function assertScanExists(scanId: number, ctx: IServiceContext): Promise<void> {
  const scan = await getScanByIdQuery(scanId, ctx.organizationId);
  if (!scan) {
    throw new NotFoundException(`Scan ${scanId} not found`);
  }
}

function requireSuggestionName(value: unknown, field: "risk_name" | "suggestion_name"): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 500) {
    throw new ValidationException(
      field === "risk_name"
        ? "risk_name is required and must be at most 500 characters"
        : "suggestion_name is required and must be at most 500 characters",
    );
  }
  return name;
}

/** 409 for a suggestion already linked to a risk that still exists. */
function assertNotInRegister(existing: ISuggestedRiskAction | null): void {
  if (existing?.action === "added" && !existing.risk_deleted) {
    throw new ConflictException(ALREADY_IN_REGISTER, "risk", "suggestion_key", {
      metadata: { riskId: existing.risk_id },
    });
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
 * Create a risk from a suggestion and link it to the suggestion, in one
 * transaction under the suggestion's lock.
 *
 * The risk goes through the same service as a risk created in the risk
 * register. A suggestion already linked to a risk that still exists is
 * refused with a ConflictException whose metadata carries that risk's id;
 * nothing is created then.
 *
 * @param riskInput - The risk, as for POST /projectRisks
 * @returns The created risk
 */
export async function addSuggestedRiskToRegister(
  scanId: number,
  suggestionName: unknown,
  riskInput: CreateRiskServiceInput,
  ctx: IServiceContext,
): Promise<CreatedRisk> {
  const name = requireSuggestionName(suggestionName, "suggestion_name");
  await assertScanExists(scanId, ctx);

  const key = suggestionKey(name);
  const transaction = await beginOrganizationTransaction(ctx.organizationId);
  try {
    await lockSuggestedRiskQuery(scanId, key, ctx.organizationId, transaction);
    assertNotInRegister(
      await getSuggestedRiskActionQuery(scanId, key, ctx.organizationId, transaction),
    );

    const risk = await createRiskService(
      { ...riskInput, projects: riskInput.projects || [], frameworks: riskInput.frameworks || [] },
      { userId: ctx.userId, organizationId: ctx.organizationId },
      transaction,
    );
    if (!risk?.id) {
      throw new Error("Risk creation returned no risk");
    }

    await upsertSuggestedRiskActionQuery(
      { scanId, riskName: name, action: "added", riskId: risk.id, ignoreReason: null },
      ctx.userId,
      ctx.organizationId,
      transaction,
    );

    await transaction.commit();
    return risk;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Record that a suggestion was ignored, with the reason. Refused when the
 * suggestion is already linked to a risk that still exists. A suggestion is
 * added to the register with `addSuggestedRiskToRegister`.
 */
export async function recordSuggestedRiskAction(
  scanId: number,
  input: IRecordSuggestedRiskActionInput,
  ctx: IServiceContext,
): Promise<ISuggestedRiskAction[]> {
  const riskName = requireSuggestionName(input.risk_name, "risk_name");
  if (input.action !== "ignored") {
    throw new ValidationException("action must be 'ignored'");
  }
  const reason = input.reason as SuggestedRiskIgnoreReason;
  if (!IGNORE_REASONS.includes(reason)) {
    throw new ValidationException("reason must be 'already_added' or 'not_real_risk'");
  }

  await assertScanExists(scanId, ctx);

  const key = suggestionKey(riskName);
  const transaction = await beginOrganizationTransaction(ctx.organizationId);
  try {
    await lockSuggestedRiskQuery(scanId, key, ctx.organizationId, transaction);
    assertNotInRegister(
      await getSuggestedRiskActionQuery(scanId, key, ctx.organizationId, transaction),
    );
    await upsertSuggestedRiskActionQuery(
      { scanId, riskName, action: "ignored", riskId: null, ignoreReason: reason },
      ctx.userId,
      ctx.organizationId,
      transaction,
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
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
  if (!(await deleteIgnoredSuggestedRiskActionQuery(actionId, scanId, ctx.organizationId))) {
    const target = await getSuggestedRiskActionByIdQuery(actionId, scanId, ctx.organizationId);
    if (!target) {
      throw new NotFoundException(`Suggested risk action ${actionId} not found`);
    }
    throw new BusinessLogicException("Only ignored suggestions can be restored");
  }
  return listSuggestedRiskActionsQuery(scanId, ctx.organizationId);
}
