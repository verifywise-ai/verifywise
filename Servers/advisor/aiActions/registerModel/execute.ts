/**
 * Post-approval executor for `agent_register_model`.
 *
 * Runs inside the approval transaction. Inserts a row into
 * `model_inventories` and (if a project_id was supplied) a row in
 * `model_inventories_projects_frameworks` linking the new model to the
 * project. Throws on any failure so the surrounding transaction rolls
 * back the approval state change.
 */

import { sequelize } from "../../../database/db";
import logger from "../../../utils/logger/fileLogger";
import type { AiActionExecuteContext, AiActionExecuteResult } from "../types";
import type { AgentRegisterModelInput } from "./schema";

export async function executeRegisterModel(
  ctx: AiActionExecuteContext<AgentRegisterModelInput>,
): Promise<AiActionExecuteResult> {
  const input = ctx.inputParams;
  const now = new Date();

  logger.info(
    `[executeRegisterModel] START name="${input.name}" provider="${input.model_type ?? ""}" org=${ctx.organizationId} requesterId=${ctx.requesterId}`,
  );

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
    // added on the second registration attempt).
    if (input.project_id !== undefined) {
      const [projectRows] = (await sequelize.query(
        `SELECT id FROM projects
           WHERE id = :project_id AND organization_id = :organization_id`,
        {
          replacements: {
            project_id: input.project_id,
            organization_id: ctx.organizationId,
          },
          transaction: ctx.transaction,
        },
      )) as [Array<{ id: number }>, unknown];
      if (projectRows && projectRows.length > 0) {
        await sequelize.query(
          `INSERT INTO model_inventories_projects_frameworks
             (organization_id, model_inventory_id, project_id)
           VALUES (:organization_id, :model_inventory_id, :project_id)
           ON CONFLICT DO NOTHING`,
          {
            replacements: {
              organization_id: ctx.organizationId,
              model_inventory_id: existing.id,
              project_id: input.project_id,
            },
            transaction: ctx.transaction,
          },
        );
      }
    }

    return { entityId: existing.id };
  }

  // Re-check the project FK at execute time. Between file-time and
  // execute-time the project could have been deleted.
  if (input.project_id !== undefined) {
    const [projectRows] = (await sequelize.query(
      `SELECT id FROM projects
         WHERE id = :project_id AND organization_id = :organization_id`,
      {
        replacements: {
          project_id: input.project_id,
          organization_id: ctx.organizationId,
        },
        transaction: ctx.transaction,
      },
    )) as [Array<{ id: number }>, unknown];
    if (!projectRows || projectRows.length === 0) {
      throw new Error(
        `Project #${input.project_id} no longer exists in this organization — cannot link the new model.`,
      );
    }
  }

  const [insertRows] = (await sequelize.query(
    `INSERT INTO model_inventories
       (organization_id, provider_model, provider, model, version, capabilities,
        security_assessment, status, status_date, biases, limitations,
        hosting_provider, security_assessment_data, is_demo, created_at, updated_at)
     VALUES
       (:organization_id, :provider_model, :provider, :model, :version, :capabilities,
        false, 'Pending', :status_date, '', '',
        '', '[]', false, :created_at, :updated_at)
     RETURNING id`,
    {
      replacements: {
        organization_id: ctx.organizationId,
        provider_model: input.model_type ? `${input.model_type} / ${input.name}` : input.name,
        provider: input.model_type ?? "",
        model: input.name,
        version: input.version ?? "",
        capabilities: input.description ?? "",
        status_date: now,
        created_at: now,
        updated_at: now,
      },
      transaction: ctx.transaction,
    },
  )) as [Array<{ id: number }>, unknown];

  const created = insertRows[0];
  if (!created?.id) {
    logger.error(`[executeRegisterModel] INSERT returned no id! input=${JSON.stringify(input)}`);
    throw new Error(
      "model_inventories INSERT returned no id — refusing to record an empty execution result.",
    );
  }
  logger.info(
    `[executeRegisterModel] inserted model_inventories.id=${created.id} name="${input.name}" org=${ctx.organizationId}`,
  );

  if (input.project_id !== undefined) {
    await sequelize.query(
      `INSERT INTO model_inventories_projects_frameworks
         (organization_id, model_inventory_id, project_id)
       VALUES (:organization_id, :model_inventory_id, :project_id)`,
      {
        replacements: {
          organization_id: ctx.organizationId,
          model_inventory_id: created.id,
          project_id: input.project_id,
        },
        transaction: ctx.transaction,
      },
    );
  }

  return { entityId: created.id };
}
