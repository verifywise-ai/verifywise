/**
 * Model writes (audit M-M5): create, update, delete and use case link, with
 * everything that goes with them in one place: the approval rule (decision
 * 9), change history, the "model added" automation (in the create query),
 * the deployment step when a model becomes Approved, the approver notice and
 * the model risk candidate notice.
 *
 * Callers pass plain arguments, no req or res: the REST controllers, Shadow
 * AI's start governance and, later, the AI advisor. A caller that already
 * holds a transaction passes it; the notices then run after that
 * transaction commits (`afterCommit`), never before and never on rollback.
 */

import { Transaction } from "sequelize";
import { inTransaction } from "../utils/transaction.utils";
import { ModelInventoryModel } from "../domain.layer/models/modelInventory/modelInventory.model";
import { ModelInventoryStatus } from "../domain.layer/enums/model-inventory-status.enum";
import { IModelInventory } from "../domain.layer/interfaces/i.modelInventory";
import { ConflictException, NotFoundException } from "../domain.layer/exceptions/custom.exception";
import {
  NotificationEntityType,
  NotificationType,
} from "../domain.layer/interfaces/i.notification";
import {
  createNewModelInventoryQuery,
  deleteModelInventoryByIdQuery,
  getModelInventoryByIdQuery,
  getModelInventoryProjectIdsQuery,
  insertModelProjectLinks,
  lockModelInventoryQuery,
  updateModelInventoryByIdQuery,
} from "../utils/modelInventory.utils";
import {
  assertUseCaseWriteAccess,
  resolveModelLinkTargets,
  UseCaseViewer,
} from "../utils/modelReferences.utils";
import {
  recordEntityCreation,
  recordEntityDeletion,
  recordMultipleFieldChanges,
  trackEntityChanges,
} from "../utils/changeHistory.base.utils";
import { assertModelApprovalAllowed, assertModelApprovalInput } from "../utils/modelApproval.utils";
import { modelHasMrmHistoryQuery } from "../utils/mrm.utils";
import { getUserNameById } from "./riskApproverNotification.service";
import { notifyUserAssigned } from "./inAppNotification.service";
import { notifyProactive } from "./proactiveNotify";
import { notifyModelRiskCandidates } from "./riskLinks/modelCandidates";
import { triggerModelDeployment } from "./workflows/triggers";
import logger from "../utils/logger/fileLogger";

export const MODEL_NOT_FOUND = "Model inventory not found";
export const MODEL_HAS_MRM_HISTORY =
  "This model has model risk management validations or findings and cannot be deleted. Decommission it instead to preserve the audit record.";

/** Who writes, in which organization. */
export interface ModelWriteContext {
  organizationId: number;
  userId: number;
  /** An Admin decides any model's approval (organization.admin). */
  callerIsAdmin: boolean;
  /** Set for a REST caller: linking or unlinking a use case needs this caller's access. */
  useCaseViewer?: UseCaseViewer;
}

/** The model fields a caller may send. `is_demo` is accepted but never stored. */
export type ModelInventoryInput = Partial<Omit<IModelInventory, "approver">> & {
  approver?: number | string | null;
  projects?: number[];
  frameworks?: number[];
  deleteProjects?: boolean;
  deleteFrameworks?: boolean;
};

/** The fields stored on the model row: links, flags and is_demo removed. */
function modelFields(input: ModelInventoryInput): Partial<IModelInventory> {
  const {
    projects: _projects,
    frameworks: _frameworks,
    deleteProjects: _deleteProjects,
    deleteFrameworks: _deleteFrameworks,
    // Only the demo seed creates demo models; "Delete demo data" removes them.
    is_demo: _isDemo,
    ...fields
  } = input;
  return fields as Partial<IModelInventory>;
}

const modelDisplayName = (model: ModelInventoryModel, id: number) => model.model || `Model #${id}`;

/** Tell a newly named approver. Never awaited by a save; never throws. */
async function notifyModelApprover(
  ctx: ModelWriteContext,
  model: ModelInventoryModel,
  modelId: number,
): Promise<void> {
  const approverId = model.approver;
  if (!approverId) return;
  const assignerName = await getUserNameById(ctx.userId, ctx.organizationId);
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const modelDetails = [
    model.provider ? `Provider: ${model.provider}` : null,
    model.version ? `Version: ${model.version}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
  await notifyUserAssigned(
    ctx.organizationId,
    approverId,
    {
      entityType: "Model Inventory",
      entityId: modelId,
      entityName: modelDisplayName(model, modelId),
      roleType: "Approver",
      entityUrl: `${baseUrl}/model-inventory?modelId=${modelId}`,
    },
    assignerName,
    baseUrl,
    { description: modelDetails || undefined },
  );
}

/**
 * The deployment step (issues 3811, 3813): the "risk assessment required"
 * notice and the model_deployment workflow. Run when a model becomes
 * Approved, whether created so or moved there. Never throws.
 */
export function runModelDeployedSideEffects(
  ctx: Pick<ModelWriteContext, "organizationId" | "userId">,
  modelId: number,
  modelName: string,
  modelVersion?: string,
): void {
  notifyProactive(ctx.organizationId, {
    title: "Model deployed — risk assessment required",
    body: `"${modelName}" was just deployed. A risk assessment is recommended for the newly deployed model.`,
    notification: {
      user_id: ctx.userId,
      type: NotificationType.SYSTEM,
      title: "Model deployed — risk assessment required",
      message: `"${modelName}" was just deployed. A risk assessment is recommended.`,
      entity_type: NotificationEntityType.MODEL,
      entity_id: modelId,
    },
    channels: {
      inApp: true,
      email: {
        template: "model-deployed-risk-assessment",
        subject: "Model deployed — risk assessment required",
        variables: { modelName, modelId: String(modelId) },
      },
    },
    meta: { modelInventoryId: modelId },
  }).catch((err) => logger.error("Failed to send model deployed risk-assessment notice:", err));

  triggerModelDeployment(ctx.organizationId, modelId, modelName, modelVersion || undefined).catch(
    (err) => logger.error("Failed to trigger model_deployment workflow:", err),
  );
}

function notifyCandidates(
  ctx: ModelWriteContext,
  modelId: number,
  modelName: string,
  projectIds: number[],
): void {
  if (projectIds.length === 0) return;
  notifyModelRiskCandidates({
    organizationId: ctx.organizationId,
    modelInventoryId: modelId,
    modelName,
    projectIds,
  }).catch((err) => logger.error("Model risk candidate notice failed:", err));
}

/**
 * Create a model. Throws ModelApprovalForbiddenError (403), a
 * ValidationException for a reference outside the organization (400), a
 * ForbiddenException for a use case the caller cannot open, or the database's
 * unique violation for a duplicate external key.
 */
export async function createModelInventoryService(
  rawInput: ModelInventoryInput,
  ctx: ModelWriteContext,
  transaction?: Transaction,
): Promise<ModelInventoryModel> {
  const input = assertModelApprovalInput(rawInput, { creating: true });
  const fields = modelFields(input);
  assertModelApprovalAllowed({
    existing: null,
    submitted: { approver: input.approver, status: input.status },
    callerId: ctx.userId,
    callerIsAdmin: ctx.callerIsAdmin,
  });
  const model = ModelInventoryModel.createNewModelInventory({
    ...(fields as Partial<IModelInventory>),
    is_demo: false,
  });

  return inTransaction(transaction, async (tx) => {
    const saved = await createNewModelInventoryQuery(
      model,
      ctx.organizationId,
      input.projects || [],
      input.frameworks || [],
      tx,
      ctx.useCaseViewer,
    );
    const modelId = saved.id!;
    await recordEntityCreation(
      "model_inventory",
      modelId,
      ctx.userId,
      ctx.organizationId,
      model,
      tx,
    );

    tx.afterCommit(() => {
      if (saved.approver) {
        notifyModelApprover(ctx, saved, modelId).catch((err) =>
          logger.error("Failed to send model approver notice:", err),
        );
      }
      // A model created as Approved gets the same deployment step as a
      // model moved to Approved.
      if (saved.status === ModelInventoryStatus.APPROVED) {
        runModelDeployedSideEffects(ctx, modelId, modelDisplayName(saved, modelId), saved.version);
      }
      // A new model normally has no risks yet, so this usually sends nothing.
      notifyCandidates(
        ctx,
        modelId,
        modelDisplayName(saved, modelId),
        ((saved as any).dataValues?.projects as number[] | undefined) ?? [],
      );
    });
    return saved;
  });
}

/**
 * Update a model, or null when the organization has no such model. The row
 * is locked first; the approval rule and the history diff use that row.
 */
export async function updateModelInventoryService(
  id: number,
  rawInput: ModelInventoryInput,
  ctx: ModelWriteContext,
  transaction?: Transaction,
): Promise<ModelInventoryModel | null> {
  const input = assertModelApprovalInput(rawInput, { creating: false });
  const fields = modelFields(input);
  return inTransaction(transaction, async (tx) => {
    const current = await getModelInventoryByIdQuery(id, ctx.organizationId, {
      transaction: tx,
      forUpdate: true,
    });
    if (!current) return null;

    // Read before updateModelInventory, which changes `current` in place.
    const previousStatus = current.status;
    const previousApprover = current.approver ?? null;
    // A copy: without includes, get({ plain: true }) is the live dataValues,
    // which updateModelInventory changes below.
    const before = { ...current.get({ plain: true }) };

    assertModelApprovalAllowed({
      existing: { approver: previousApprover, status: previousStatus },
      submitted: { approver: input.approver, status: input.status },
      callerId: ctx.userId,
      callerIsAdmin: ctx.callerIsAdmin,
    });

    const changes = await trackEntityChanges("model_inventory", before, fields, {
      organizationId: ctx.organizationId,
      transaction: tx,
    });
    const updated = ModelInventoryModel.updateModelInventory(
      current,
      fields as Partial<ModelInventoryModel>,
    );
    const saved = await updateModelInventoryByIdQuery(
      id,
      updated,
      input.projects || [],
      input.frameworks || [],
      input.deleteProjects || false,
      input.deleteFrameworks || false,
      ctx.organizationId,
      tx,
      ctx.useCaseViewer,
      // The locked row, as read before updateModelInventory changed it.
      before,
    );
    if (changes.length > 0) {
      await recordMultipleFieldChanges(
        "model_inventory",
        id,
        ctx.userId,
        ctx.organizationId,
        changes,
        tx,
      );
    }

    tx.afterCommit(() => {
      if (
        saved.status === ModelInventoryStatus.APPROVED &&
        previousStatus !== ModelInventoryStatus.APPROVED
      ) {
        runModelDeployedSideEffects(ctx, id, modelDisplayName(saved, id), saved.version);
      }
      if (saved.approver && Number(saved.approver) !== Number(previousApprover)) {
        notifyModelApprover(ctx, saved, id).catch((err) =>
          logger.error("Failed to send model approver notice:", err),
        );
      }
      // Only use cases this save added: a plain field edit adds none.
      notifyCandidates(ctx, id, modelDisplayName(saved, id), saved.addedProjectIds ?? []);
    });
    return saved;
  });
}

/**
 * Delete a model. Throws NotFoundException (404) when the organization has
 * no such model and ConflictException (409) when it has model risk
 * management history. With `deleteRisks` its risks are archived, otherwise
 * they stay with no model.
 */
export async function deleteModelInventoryService(
  id: number,
  options: { deleteRisks: boolean },
  ctx: Pick<ModelWriteContext, "organizationId" | "userId">,
  transaction?: Transaction,
): Promise<void> {
  await inTransaction(transaction, async (tx) => {
    // Lock the model row first: from here no risk, validation or finding can
    // join the model, so the checks below hold until the delete commits.
    if (!(await lockModelInventoryQuery(id, ctx.organizationId, tx))) {
      throw new NotFoundException(MODEL_NOT_FOUND, "model_inventory", id);
    }
    // MRM protection (§7b): a model with validation or finding history must be
    // decommissioned, not deleted. Read under the lock.
    if (await modelHasMrmHistoryQuery(id, ctx.organizationId, tx)) {
      throw new ConflictException(MODEL_HAS_MRM_HISTORY, "model_inventory");
    }
    await recordEntityDeletion("model_inventory", id, ctx.userId, ctx.organizationId, tx);
    await deleteModelInventoryByIdQuery(
      id,
      options.deleteRisks,
      ctx.organizationId,
      tx,
      ctx.userId,
    );
  });
}

/**
 * Link a model to one use case. Returns whether a link was added (false when
 * it already existed). Throws NotFoundException for a model outside the
 * organization and ValidationException for a use case outside it. Use case
 * links are not tracked fields of the model's change history, as on update.
 */
export async function linkModelToUseCaseService(
  modelId: number,
  projectId: number,
  ctx: ModelWriteContext,
  transaction?: Transaction,
): Promise<boolean> {
  return inTransaction(transaction, async (tx) => {
    if (!(await lockModelInventoryQuery(modelId, ctx.organizationId, tx))) {
      throw new NotFoundException(MODEL_NOT_FOUND, "model_inventory", modelId);
    }
    const {
      projectIds: [checkedProjectId],
    } = await resolveModelLinkTargets([projectId], [], ctx.organizationId, tx);
    if (ctx.useCaseViewer) {
      await assertUseCaseWriteAccess([checkedProjectId], ctx.useCaseViewer, ctx.organizationId, tx);
    }
    const linked = await getModelInventoryProjectIdsQuery(modelId, ctx.organizationId, tx);
    if (linked.includes(checkedProjectId)) return false;
    await insertModelProjectLinks(modelId, [checkedProjectId], ctx.organizationId, tx);

    tx.afterCommit(() => {
      getModelInventoryByIdQuery(modelId, ctx.organizationId)
        .then((model) =>
          notifyCandidates(
            ctx,
            modelId,
            model ? modelDisplayName(model, modelId) : `Model #${modelId}`,
            [checkedProjectId],
          ),
        )
        .catch((err) => logger.error("Model risk candidate notice failed:", err));
    });
    return true;
  });
}
