/**
 * Model risk writes (audit M-M5, decision 12): create, update and delete with
 * their change history and notices in one place. Shared by the REST
 * controllers and Shadow AI's start governance, and callable by the AI
 * advisor: plain arguments, no req or res. A caller that holds a transaction
 * passes it; the notices then run after it commits.
 *
 * Owner notices follow project risks (`controllers/risks.ctrl.ts`): the owner
 * of a new risk is told, and on update a new owner (any user other than the
 * saved one) is told. The assigner is told too when they pick themself, as
 * for project risks. The notice goes only to a member of the organization
 * (`notifyUserAssigned` checks), with the assignment email.
 *
 * Level (decision 10): likelihood and severity are list labels, and when a
 * save leaves the risk with both, the level comes from the shared formula
 * (`calculateModelRiskLevel`) and a sent `risk_level` is ignored. With either
 * missing, the sent or stored level stays, as before.
 */

import { Transaction } from "sequelize";
import { inTransaction, TransactionContext } from "../utils/transaction.utils";
import { frontendBaseUrl } from "../utils/frontendUrl.utils";
import { ModelRiskModel } from "../domain.layer/models/modelRisk/modelRisk.model";
import { IModelRisk } from "../domain.layer/interfaces/i.modelRisk";
import {
  createNewModelRiskQuery,
  deleteModelRiskByIdQuery,
  getModelRiskByIdQuery,
  updateModelRiskByIdQuery,
} from "../utils/modelRisk.utils";
import {
  getModelInventoryNameQuery,
  getModelInventoryProjectIdsQuery,
} from "../utils/modelInventory.utils";
import {
  recordEntityCreation,
  recordEntityDeletion,
  recordMultipleFieldChanges,
  trackEntityChanges,
  writtenValues,
} from "../utils/changeHistory.base.utils";
import { getUserNameById } from "./riskApproverNotification.service";
import { notifyUserAssigned } from "./inAppNotification.service";
import { notifyModelRiskCandidates } from "./riskLinks/modelCandidates";
import logger from "../utils/logger/fileLogger";
import {
  calculateModelRiskLevel,
  canonicalLikelihood,
  canonicalSeverity,
} from "../utils/riskLevel.utils";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";

export interface ModelRiskWriteContext {
  organizationId: number;
  userId: number;
}

type ModelRiskInput = Partial<IModelRisk> & Record<string, unknown>;

/** For the log of a rollback that fails. */
const txContext = (
  functionName: string,
  eventType: TransactionContext["eventType"],
  ctx: ModelRiskWriteContext,
): TransactionContext => ({
  functionName,
  fileName: "modelRisk.service.ts",
  eventType,
  organizationId: ctx.organizationId,
  userId: ctx.userId,
});

/** The request without is_demo: only the demo seed creates demo risks. */
function withoutDemoFlag(input: ModelRiskInput): ModelRiskInput {
  const { is_demo: _isDemo, ...rest } = input;
  return rest;
}

export const LIKELIHOOD_NOT_VALID =
  "Likelihood must be one of: Rare, Unlikely, Possible, Likely, Almost Certain.";
export const SEVERITY_NOT_VALID =
  "Severity must be one of: Negligible, Minor, Moderate, Major, Catastrophic.";

const isBlank = (value: unknown) =>
  value === null || (typeof value === "string" && value.trim() === "");

/**
 * A sent likelihood or severity as its canonical label: undefined when not
 * sent, null when cleared (null or ""), else a label matched without regard
 * to case. Anything else is a 400 naming the field.
 */
function labelInput(
  value: unknown,
  canonical: (v: unknown) => string | null,
  field: string,
  message: string,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (isBlank(value)) return null;
  const label = canonical(value);
  if (!label) throw new ValidationException(message, field, value);
  return label;
}

/**
 * The write with its likelihood and severity normalized and, when the risk
 * ends up with both (sent, else `stored`), the formula's level in place of
 * any sent one. Exported for the unit tests.
 */
export function applyModelRiskFormula(
  input: ModelRiskInput,
  stored?: Pick<IModelRisk, "likelihood" | "severity"> | null,
): ModelRiskInput {
  const out: ModelRiskInput = { ...input };
  const likelihood = labelInput(
    input.likelihood,
    canonicalLikelihood,
    "likelihood",
    LIKELIHOOD_NOT_VALID,
  );
  const severity = labelInput(input.severity, canonicalSeverity, "severity", SEVERITY_NOT_VALID);
  if (likelihood !== undefined) out.likelihood = likelihood;
  if (severity !== undefined) out.severity = severity;
  const level = calculateModelRiskLevel(
    likelihood !== undefined ? likelihood : stored?.likelihood,
    severity !== undefined ? severity : stored?.severity,
  );
  if (level) out.risk_level = level;
  return out;
}

/**
 * Tell `ownerId` they were made the model risk's owner. Run after commit and
 * do not await it: a failed notice must not fail the save.
 */
export async function notifyModelRiskOwner(
  organizationId: number,
  assignerUserId: number,
  risk: Pick<IModelRisk, "id" | "risk_name" | "description">,
  ownerId: number,
): Promise<void> {
  const baseUrl = frontendBaseUrl();
  const assignerName = await getUserNameById(assignerUserId, organizationId);
  await notifyUserAssigned(
    organizationId,
    ownerId,
    {
      entityType: "model_risk",
      entityId: risk.id!,
      entityName: risk.risk_name || `Model risk #${risk.id}`,
      roleType: "Risk Owner",
      entityUrl: `/model-inventory/model-risks?modelRiskId=${risk.id}`,
    },
    assignerName,
    baseUrl,
    { description: risk.description || undefined },
  );
}

function sendOwnerNotice(ctx: ModelRiskWriteContext, risk: ModelRiskModel): void {
  const ownerId = Number(risk.owner);
  if (!ownerId) return;
  notifyModelRiskOwner(ctx.organizationId, ctx.userId, risk, ownerId).catch((err) =>
    logger.error("Failed to send model risk owner notice:", err),
  );
}

/**
 * F6: a new model risk on a model with use cases is a direct cause of new
 * candidates, restricted to this risk. Fire-and-forget.
 */
function sendCandidateNotice(ctx: ModelRiskWriteContext, modelId: number, riskId: number): void {
  getModelInventoryProjectIdsQuery(modelId, ctx.organizationId)
    .then(async (projectIds) => {
      if (projectIds.length === 0) return;
      const modelName =
        (await getModelInventoryNameQuery(modelId, ctx.organizationId)) ?? `Model #${modelId}`;
      await notifyModelRiskCandidates({
        organizationId: ctx.organizationId,
        modelInventoryId: modelId,
        modelName,
        projectIds,
        modelRiskIds: [riskId],
      });
    })
    .catch((err) => logger.error("Model risk candidate notice failed:", err));
}

/**
 * Create a model risk. Throws a ValidationException for a model or owner
 * outside the organization.
 */
export async function createModelRiskService(
  input: ModelRiskInput,
  ctx: ModelRiskWriteContext,
  transaction?: Transaction,
): Promise<ModelRiskModel> {
  const data = applyModelRiskFormula(withoutDemoFlag(input));
  const log = txContext("createModelRiskService", "Create", ctx);
  return inTransaction(transaction, log, async (tx) => {
    const risk = await createNewModelRiskQuery(
      { ...data, is_demo: false } as Partial<IModelRisk>,
      ctx.organizationId,
      tx,
    );
    await recordEntityCreation("model_risk", risk.id!, ctx.userId, ctx.organizationId, data, tx);
    tx.afterCommit(() => {
      sendOwnerNotice(ctx, risk);
      if (risk.model_id) sendCandidateNotice(ctx, risk.model_id, risk.id!);
    });
    return risk;
  });
}

/**
 * Update a model risk, or null when the organization has no such live risk.
 * The row is locked first, and the history diffs against it.
 */
export async function updateModelRiskService(
  id: number,
  input: ModelRiskInput,
  ctx: ModelRiskWriteContext,
  transaction?: Transaction,
): Promise<ModelRiskModel | null> {
  const sent = withoutDemoFlag(input);
  const log = txContext("updateModelRiskService", "Update", ctx);
  return inTransaction(transaction, log, async (tx) => {
    const existing = await getModelRiskByIdQuery(id, ctx.organizationId, false, {
      transaction: tx,
      forUpdate: true,
    });
    if (!existing) return null;
    const before = existing.get({ plain: true });
    // The level is computed on the merged row: a save that sends only the
    // severity recomputes it from the stored likelihood.
    const data = applyModelRiskFormula(sent, before);

    const risk = await updateModelRiskByIdQuery(
      id,
      data as Partial<IModelRisk>,
      ctx.organizationId,
      tx,
    );
    if (!risk) return null;

    // The values as written (the update casts and normalizes them).
    const changes = await trackEntityChanges("model_risk", before, writtenValues(risk, data), {
      organizationId: ctx.organizationId,
      transaction: tx,
    });
    if (changes.length > 0) {
      await recordMultipleFieldChanges(
        "model_risk",
        id,
        ctx.userId,
        ctx.organizationId,
        changes,
        tx,
      );
    }

    if (risk.owner && Number(risk.owner) !== Number(before.owner)) {
      tx.afterCommit(() => sendOwnerNotice(ctx, risk));
    }
    return risk;
  });
}

/** Archive a model risk. False when the organization has no such live risk. */
export async function deleteModelRiskService(
  id: number,
  ctx: ModelRiskWriteContext,
  transaction?: Transaction,
): Promise<boolean> {
  const log = txContext("deleteModelRiskService", "Delete", ctx);
  return inTransaction(transaction, log, async (tx) => {
    const deleted = await deleteModelRiskByIdQuery(id, ctx.organizationId, tx);
    if (!deleted) return false;
    await recordEntityDeletion("model_risk", id, ctx.userId, ctx.organizationId, tx);
    return true;
  });
}
