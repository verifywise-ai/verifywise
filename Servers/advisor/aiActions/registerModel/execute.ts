/**
 * Post-approval executor for `agent_register_model`.
 *
 * Runs inside the approval transaction, as the requester. The model is
 * created through `createModelInventoryService` and a use case link added
 * through `linkModelToUseCaseService`, so the console's rules apply
 * (model.edit, write access to the use case) and the change history, the
 * "model added" automation and the notices follow (after the approval
 * commits). Throws on any failure so the surrounding transaction rolls back
 * the approval state change.
 */

import { sequelize } from "../../../database/db";
import logger from "../../../utils/logger/fileLogger";
import {
  createModelInventoryService,
  linkModelToUseCaseService,
} from "../../../services/modelInventory.service";
import { ModelInventoryStatus } from "../../../domain.layer/enums/model-inventory-status.enum";
import {
  ForbiddenException,
  ValidationException,
} from "../../../domain.layer/exceptions/custom.exception";
import { isRefusal, modelWriteContextForUser } from "../../functions/modelWriteScope";
import type { AiActionExecuteContext, AiActionExecuteResult } from "../types";
import type { AgentRegisterModelInput } from "./schema";

export async function executeRegisterModel(
  ctx: AiActionExecuteContext<AgentRegisterModelInput>,
): Promise<AiActionExecuteResult> {
  const input = ctx.inputParams;

  logger.info(
    `[executeRegisterModel] START name="${input.name}" provider="${input.model_type ?? ""}" org=${ctx.organizationId} requesterId=${ctx.requesterId}`,
  );

  const writer = await modelWriteContextForUser(ctx.organizationId, ctx.requesterId);
  if (isRefusal(writer)) throw new Error(writer.message);

  // A use case the model cannot be linked to, in words the approver reads.
  // Any other failure (a framework, an approver) keeps its own message.
  const linkError = (error: unknown): Error => {
    if (error instanceof ValidationException && error.metadata.field === "projects") {
      return new Error(
        `Project #${input.project_id} no longer exists in this organization — cannot link the new model.`,
      );
    }
    if (error instanceof ForbiddenException && error.metadata.resource === "project") {
      return new Error(`You do not have access to use case #${input.project_id}.`);
    }
    return error as Error;
  };

  // Idempotency at the data layer: if a model with the same
  // (organization, provider, name, version) already exists in this org,
  // do NOT insert a duplicate row. Return the existing entity_id so the
  // approval completes cleanly and any same-turn agent_suggest_model_risk
  // executions resolve to the right model.
  //
  // This is the durable fix for the duplicate-model bug: even if the
  // upstream filing path produces multiple approval rows (LLM retries,
  // user re-clicks an old approval, race conditions, etc.), the model
  // table will never grow a duplicate row. No other layer needs to be
  // perfect for the data to stay clean.
  const [existingModels] = (await sequelize.query(
    `SELECT id FROM model_inventories
       WHERE organization_id = :organization_id
         AND model    = :model
         AND COALESCE(provider, '') = :provider
         AND COALESCE(version,  '') = :version
       ORDER BY id DESC
       LIMIT 1`,
    {
      replacements: {
        organization_id: ctx.organizationId,
        model: input.name,
        provider: input.model_type ?? "",
        version: input.version ?? "",
      },
      transaction: ctx.transaction,
    },
  )) as [Array<{ id: number }>, unknown];

  const existing = existingModels[0];
  if (existing?.id) {
    logger.info(
      `[executeRegisterModel] reusing existing model_inventories.id=${existing.id} for name="${input.name}" provider="${input.model_type ?? ""}" version="${input.version ?? ""}" org=${ctx.organizationId} (no INSERT)`,
    );

    // Still ensure the project link exists (project_id may have been
    // added on the second registration attempt). A use case that no longer
    // exists is skipped, as before; one the requester may not write to
    // refuses the approval.
    if (input.project_id !== undefined) {
      try {
        await linkModelToUseCaseService(existing.id, input.project_id, writer, ctx.transaction);
      } catch (error) {
        if (!(error instanceof ValidationException)) throw linkError(error);
        logger.warn(
          `[executeRegisterModel] use case ${input.project_id} not linked to model ${existing.id}: ${error.message}`,
        );
      }
    }

    return { entityId: existing.id };
  }

  let created: Awaited<ReturnType<typeof createModelInventoryService>>;
  try {
    created = await createModelInventoryService(
      {
        provider_model: input.model_type ? `${input.model_type} / ${input.name}` : input.name,
        provider: input.model_type ?? "",
        model: input.name,
        version: input.version ?? "",
        capabilities: input.description ?? "",
        status: ModelInventoryStatus.PENDING,
        status_date: new Date(),
        projects: input.project_id !== undefined ? [input.project_id] : [],
      },
      writer,
      ctx.transaction,
    );
  } catch (error) {
    throw input.project_id !== undefined ? linkError(error) : error;
  }

  if (!created?.id) {
    logger.error(`[executeRegisterModel] create returned no id! input=${JSON.stringify(input)}`);
    throw new Error(
      "model_inventories INSERT returned no id — refusing to record an empty execution result.",
    );
  }
  logger.info(
    `[executeRegisterModel] inserted model_inventories.id=${created.id} name="${input.name}" org=${ctx.organizationId}`,
  );

  return { entityId: created.id };
}
