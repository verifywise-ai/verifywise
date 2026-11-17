import { ModelInventoryModel } from "../domain.layer/models/modelInventory/modelInventory.model";
import { sequelize } from "../database/db";
import { Transaction } from "sequelize";
import { TenantAutomationActionModel } from "../domain.layer/models/tenantAutomationAction/tenantAutomationAction.model";
import { replaceTemplateVariables } from "./automation/automation.utils";
import { enqueueAutomationAction } from "../services/automations/automationProducer";
import {
  buildModelReplacements,
  buildModelUpdateReplacements,
} from "./automation/modelInventory.automation.utils";
import { IModelInventoryProjectFramework } from "../domain.layer/interfaces/i.modelInventoryProjectFramework";
import { recordSnapshotIfChanged } from "./history/modelInventoryHistory.utils";
import { releaseModelRisksOfModelQuery } from "./modelRisk.utils";
import {
  assertOrganizationMember,
  assertUseCaseWriteAccess,
  resolveModelLinkTargets,
  toPositiveId,
  useCasesWithoutAccess,
  UseCaseViewer,
} from "./modelReferences.utils";

export const APPROVER_NOT_IN_ORGANIZATION = "The approver must be a member of this organization.";
import {
  deleteAllCustomFieldValuesForEntityQuery,
  fetchCustomFieldsForEntities,
} from "./customField.utils";

/**
 * Splits a model's link rows into the use cases it is linked to directly and
 * the frameworks it is linked to. A framework link is a row with framework_id
 * set (project_id is NULL since the framework-link migration; older rows that
 * still carried a project id are framework links too, never use case links).
 */
export function splitModelLinks(
  rows: Pick<IModelInventoryProjectFramework, "project_id" | "framework_id">[],
): {
  projects: number[];
  frameworks: number[];
} {
  const projects = new Set<number>();
  const frameworks = new Set<number>();
  for (const row of rows) {
    if (row.framework_id) frameworks.add(row.framework_id);
    else if (row.project_id) projects.add(row.project_id);
  }
  return { projects: [...projects], frameworks: [...frameworks] };
}

function assignModelLinks(
  model: ModelInventoryModel,
  rows: Pick<IModelInventoryProjectFramework, "project_id" | "framework_id">[],
) {
  const { projects, frameworks } = splitModelLinks(rows);
  (model.dataValues as any).projects = projects;
  (model.dataValues as any).frameworks = frameworks;
}

export const getAllModelInventoriesQuery = async (organizationId: number) => {
  const modelInventories = await sequelize.query(
    `SELECT * FROM model_inventories WHERE organization_id = :organizationId ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: ModelInventoryModel,
    },
  );
  const modelIds = (modelInventories as ModelInventoryModel[])
    .map((m) => m.id)
    .filter((id): id is number => typeof id === "number");
  const customFieldsByModel = await fetchCustomFieldsForEntities(
    "model_inventory",
    modelIds,
    organizationId,
  );
  for (const model of modelInventories) {
    (model.dataValues as any).projects = [];
    (model.dataValues as any).frameworks = [];
    const projectFrameworks = (await sequelize.query(
      `SELECT project_id, framework_id FROM model_inventories_projects_frameworks WHERE organization_id = :organizationId AND model_inventory_id = :model_inventory_id`,
      {
        replacements: { organizationId, model_inventory_id: model.id },
      },
    )) as [IModelInventoryProjectFramework[], number];
    assignModelLinks(model, projectFrameworks[0]);
    (model.dataValues as any).custom_fields = customFieldsByModel.get(model.id!) ?? [];
  }
  return modelInventories;
};

export const getModelsByOrganizationIdQuery = async (organizationId: number) => {
  const modelInventory = await sequelize.query(
    `SELECT * FROM model_inventories WHERE organization_id = :organizationId`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: ModelInventoryModel,
    },
  );
  for (const model of modelInventory) {
    (model.dataValues as any).projects = [];
    (model.dataValues as any).frameworks = [];
    const projectFrameworks = (await sequelize.query(
      `SELECT project_id, framework_id FROM model_inventories_projects_frameworks WHERE organization_id = :organizationId AND model_inventory_id = :model_inventory_id`,
      {
        replacements: { organizationId, model_inventory_id: model.id },
      },
    )) as [IModelInventoryProjectFramework[], number];
    assignModelLinks(model, projectFrameworks[0]);
  }
  return modelInventory;
};

export const getModelInventoryByIdQuery = async (id: number, organizationId: number) => {
  const modelInventory = await sequelize.query(
    `SELECT * FROM model_inventories WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: ModelInventoryModel,
    },
  );

  if (!modelInventory.length) return null;
  const model = modelInventory[0];
  (model.dataValues as any).projects = [];
  (model.dataValues as any).frameworks = [];
  const projectFrameworks = (await sequelize.query(
    `SELECT project_id, framework_id FROM model_inventories_projects_frameworks WHERE organization_id = :organizationId AND model_inventory_id = :model_inventory_id`,
    {
      replacements: { organizationId, model_inventory_id: model.id },
    },
  )) as [IModelInventoryProjectFramework[], number];
  assignModelLinks(model, projectFrameworks[0]);

  return model;
};

export const getModelByProjectIdQuery = async (projectId: number, organizationId: number) => {
  const modelInventories = await sequelize.query(
    `SELECT mi.* FROM model_inventories mi
      JOIN model_inventories_projects_frameworks mipf
      ON mi.id = mipf.model_inventory_id AND mi.organization_id = mipf.organization_id
      WHERE mi.organization_id = :organizationId AND mipf.project_id = :project_id AND mipf.framework_id IS NULL`,
    {
      replacements: { organizationId, project_id: projectId },
      mapToModel: true,
      model: ModelInventoryModel,
    },
  );
  return modelInventories;
};

export const getModelByFrameworkIdQuery = async (frameworkId: number, organizationId: number) => {
  const modelInventories = await sequelize.query(
    `SELECT mi.* FROM model_inventories mi
      JOIN model_inventories_projects_frameworks mipf
      ON mi.id = mipf.model_inventory_id AND mi.organization_id = mipf.organization_id
      WHERE mi.organization_id = :organizationId AND mipf.framework_id = :framework_id`,
    {
      replacements: { organizationId, framework_id: frameworkId },
      mapToModel: true,
      model: ModelInventoryModel,
    },
  );
  return modelInventories;
};

/**
 * Direct use case links: project_id set, framework_id NULL. Ids are already
 * checked against the organization. A link that already exists is skipped
 * (the table's unique constraint never fires while framework_id is NULL).
 */
export async function insertModelProjectLinks(
  modelInventoryId: number,
  projectIds: number[],
  organizationId: number,
  transaction: Transaction,
) {
  for (const projectId of projectIds) {
    await sequelize.query(
      `INSERT INTO model_inventories_projects_frameworks (organization_id, model_inventory_id, project_id)
       SELECT :organization_id, :model_inventory_id, :project_id
        WHERE NOT EXISTS (
          SELECT 1 FROM model_inventories_projects_frameworks
           WHERE organization_id = :organization_id AND model_inventory_id = :model_inventory_id
             AND project_id = :project_id AND framework_id IS NULL);`,
      {
        replacements: {
          organization_id: organizationId,
          model_inventory_id: modelInventoryId,
          project_id: projectId,
        },
        transaction,
      },
    );
  }
}

/**
 * Framework links: framework_id set, project_id NULL. A framework link is not
 * tied to a use case. Ids are already checked against the organization; a
 * link that already exists is skipped (partial unique index on
 * (model_inventory_id, framework_id)).
 */
export async function insertModelFrameworkLinks(
  modelInventoryId: number,
  frameworkIds: number[],
  organizationId: number,
  transaction: Transaction,
) {
  for (const frameworkId of frameworkIds) {
    await sequelize.query(
      `INSERT INTO model_inventories_projects_frameworks (organization_id, model_inventory_id, project_id, framework_id)
       VALUES (:organization_id, :model_inventory_id, NULL, :framework_id)
       ON CONFLICT (model_inventory_id, framework_id) WHERE framework_id IS NOT NULL DO NOTHING;`,
      {
        replacements: {
          organization_id: organizationId,
          model_inventory_id: modelInventoryId,
          framework_id: frameworkId,
        },
        transaction,
      },
    );
  }
}

export const createNewModelInventoryQuery = async (
  modelInventory: ModelInventoryModel,
  organizationId: number,
  projects: number[],
  frameworks: number[],
  transaction: Transaction,
  // Set for a REST caller: every linked use case needs the caller's access.
  useCaseViewer?: UseCaseViewer,
) => {
  const created_at = new Date();

  // Checked in the transaction that stores them: the approver must be a
  // member, the use cases and frameworks must be the organization's.
  await assertOrganizationMember(
    modelInventory.approver,
    organizationId,
    "approver",
    APPROVER_NOT_IN_ORGANIZATION,
    transaction,
  );
  const { projectIds, frameworkIds } = await resolveModelLinkTargets(
    projects,
    frameworks,
    organizationId,
    transaction,
  );
  if (useCaseViewer) {
    await assertUseCaseWriteAccess(projectIds, useCaseViewer, organizationId, transaction);
  }

  try {
    const result = await sequelize.query(
      `INSERT INTO model_inventories (organization_id, provider_model, provider, model, version, approver, capabilities, security_assessment, status, status_date, type, reference_link, biases, limitations, hosting_provider, intended_use, security_assessment_data, is_demo, external_key, created_at, updated_at)
      VALUES (:organization_id, :provider_model, :provider, :model, :version, :approver, :capabilities, :security_assessment, :status, :status_date, :type, :reference_link, :biases, :limitations, :hosting_provider, :intended_use, :security_assessment_data, :is_demo, :external_key, :created_at, :updated_at) RETURNING *`,
      {
        replacements: {
          organization_id: organizationId,
          provider_model: modelInventory.provider_model || "",
          provider: modelInventory.provider,
          model: modelInventory.model,
          version: modelInventory.version,
          approver: modelInventory.approver || null,
          capabilities: Array.isArray(modelInventory.capabilities)
            ? modelInventory.capabilities.join(", ")
            : modelInventory.capabilities,
          security_assessment: modelInventory.security_assessment,
          status: modelInventory.status,
          status_date: modelInventory.status_date,
          type: modelInventory.type ?? null,
          reference_link: modelInventory.reference_link,
          biases: modelInventory.biases,
          limitations: modelInventory.limitations,
          hosting_provider: modelInventory.hosting_provider,
          intended_use: modelInventory.intended_use ?? null,
          security_assessment_data: JSON.stringify(modelInventory.security_assessment_data || []),
          is_demo: modelInventory.is_demo,
          external_key: modelInventory.external_key ?? null,
          created_at: created_at,
          updated_at: created_at,
        },
        mapToModel: true,
        model: ModelInventoryModel,
        transaction,
      },
    );

    const createdModel = result[0];
    (createdModel.dataValues as any).projects = [];
    (createdModel.dataValues as any).frameworks = [];

    await insertModelProjectLinks(createdModel.id!, projectIds, organizationId, transaction);
    await insertModelFrameworkLinks(createdModel.id!, frameworkIds, organizationId, transaction);
    (createdModel.dataValues as any).projects = projectIds;
    (createdModel.dataValues as any).frameworks = frameworkIds;

    const automations = (await sequelize.query(
      `SELECT
        pat.key AS trigger_key,
        paa.key AS action_key,
        a.id AS automation_id,
        aa.*
      FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id JOIN automation_actions_data aa ON a.id = aa.automation_id JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE a.organization_id = :organization_id AND pat.key = 'model_added' AND a.is_active ORDER BY aa."order" ASC;`,
      { replacements: { organization_id: organizationId }, transaction },
    )) as [
      (TenantAutomationActionModel & {
        trigger_key: string;
        action_key: string;
        automation_id: number;
      })[],
      number,
    ];
    if (automations[0].length > 0) {
      const automation = automations[0][0];
      if (automation["trigger_key"] === "model_added") {
        const params = automation.params!;

        // Build replacements
        const replacements = buildModelReplacements(createdModel);

        // Replace variables in subject and body
        const processedParams = {
          ...params,
          subject: replaceTemplateVariables(params.subject || "", replacements),
          body: replaceTemplateVariables(params.body || "", replacements),
          automation_id: automation.automation_id,
        };

        // Enqueue with processed params
        await enqueueAutomationAction(automation.action_key, {
          ...processedParams,
          organizationId,
        });
      } else {
        console.warn(`No matching trigger found for key: ${automation["trigger_key"]}`);
      }
    }

    // Record history snapshot for status changes
    try {
      await recordSnapshotIfChanged("status", organizationId, undefined, transaction);
    } catch (historyError) {
      console.error("Error recording history snapshot:", historyError);
      // Don't throw - history recording failure shouldn't block model creation
    }

    return createdModel;
  } catch (error) {
    console.error("Error creating new model inventory:", error);
    throw error;
  }
};

export const updateModelInventoryByIdQuery = async (
  id: number,
  modelInventory: ModelInventoryModel,
  projects: number[],
  frameworks: number[],
  deleteProjects: boolean,
  deleteFrameworks: boolean,
  organizationId: number,
  transaction: Transaction,
  // Set for a REST caller: see the use case link rules below.
  useCaseViewer?: UseCaseViewer,
) => {
  const updated_at = new Date();
  const oldModel = await getModelInventoryByIdQuery(id, organizationId);

  // An unchanged approver is not re-checked, so a model whose approver has
  // since left the organization can still be edited. A new one must be a member.
  const newApprover = modelInventory.approver;
  if (toPositiveId(newApprover) !== toPositiveId(oldModel?.approver)) {
    await assertOrganizationMember(
      newApprover,
      organizationId,
      "approver",
      APPROVER_NOT_IN_ORGANIZATION,
      transaction,
    );
  }
  // Frameworks already linked are accepted unchanged; only added ones are
  // checked. The linked ones are read only when the request sends frameworks.
  const linkedFrameworkIds =
    Array.isArray(frameworks) && frameworks.length > 0
      ? await getModelInventoryFrameworkIdsQuery(id, organizationId, transaction)
      : [];
  const { projectIds, frameworkIds } = await resolveModelLinkTargets(
    projects,
    frameworks,
    organizationId,
    transaction,
    linkedFrameworkIds,
  );

  // Use case links change by difference. With a caller (REST), an added use
  // case needs the caller's access, and a link to a use case the caller cannot
  // open is kept: the form only lists the use cases the caller can see, so
  // its absence from the list is not an unlink.
  const replaceProjects = projectIds.length > 0 || deleteProjects;
  let addedProjectIds: number[] = [];
  let removedProjectIds: number[] = [];
  if (replaceProjects) {
    const beforeIds = await getModelInventoryProjectIdsQuery(id, organizationId, transaction);
    addedProjectIds = projectIds.filter((p) => !beforeIds.includes(p));
    removedProjectIds = beforeIds.filter((p) => !projectIds.includes(p));
    if (useCaseViewer) {
      await assertUseCaseWriteAccess(addedProjectIds, useCaseViewer, organizationId, transaction);
      const hidden = await useCasesWithoutAccess(
        removedProjectIds,
        useCaseViewer,
        organizationId,
        transaction,
      );
      removedProjectIds = removedProjectIds.filter((p) => !hidden.includes(p));
    }
  }

  try {
    // First update the record
    await sequelize.query(
      `UPDATE model_inventories SET provider_model = :provider_model, provider = :provider, model = :model, version = :version, approver = :approver, capabilities = :capabilities, security_assessment = :security_assessment, status = :status, status_date = :status_date, type = :type, reference_link = :reference_link, biases = :biases, limitations = :limitations,  hosting_provider = :hosting_provider, intended_use = :intended_use, security_assessment_data = :security_assessment_data, is_demo = :is_demo, external_key = :external_key, updated_at = :updated_at WHERE organization_id = :organization_id AND id = :id`,
      {
        replacements: {
          organization_id: organizationId,
          id,
          provider_model: modelInventory.provider_model || "",
          provider: modelInventory.provider,
          model: modelInventory.model,
          version: modelInventory.version,
          approver: modelInventory.approver || null,
          capabilities: Array.isArray(modelInventory.capabilities)
            ? modelInventory.capabilities.join(", ")
            : modelInventory.capabilities,
          security_assessment: modelInventory.security_assessment,
          status: modelInventory.status,
          status_date: modelInventory.status_date,
          type: modelInventory.type ?? null,
          reference_link: modelInventory.reference_link,
          biases: modelInventory.biases,
          limitations: modelInventory.limitations,
          hosting_provider: modelInventory.hosting_provider,
          intended_use: modelInventory.intended_use ?? null,
          security_assessment_data: JSON.stringify(modelInventory.security_assessment_data || []),
          is_demo: modelInventory.is_demo,
          external_key: modelInventory.external_key ?? null,
          updated_at,
        },
        transaction,
      },
    );

    // Then fetch the updated record
    const result = await sequelize.query(
      `SELECT * FROM model_inventories WHERE organization_id = :organization_id AND id = :id`,
      {
        replacements: { organization_id: organizationId, id },
        mapToModel: true,
        model: ModelInventoryModel,
        transaction,
      },
    );
    const updatedModel = result[0];

    if (removedProjectIds.length > 0) {
      // Direct use case links only; framework links (framework_id set) stay.
      await sequelize.query(
        `DELETE FROM model_inventories_projects_frameworks WHERE organization_id = :organization_id AND model_inventory_id = :model_inventory_id AND framework_id IS NULL AND project_id IN (:project_ids)`,
        {
          replacements: {
            organization_id: organizationId,
            model_inventory_id: id,
            project_ids: removedProjectIds,
          },
          transaction,
        },
      );
    }
    await insertModelProjectLinks(id, addedProjectIds, organizationId, transaction);

    if (frameworkIds.length > 0 || deleteFrameworks) {
      await sequelize.query(
        `DELETE FROM model_inventories_projects_frameworks WHERE organization_id = :organization_id AND model_inventory_id = :model_inventory_id AND framework_id IS NOT NULL`,
        {
          replacements: { organization_id: organizationId, model_inventory_id: id },
          transaction,
        },
      );
      await insertModelFrameworkLinks(id, frameworkIds, organizationId, transaction);
    }

    const links = (await sequelize.query(
      `SELECT project_id, framework_id FROM model_inventories_projects_frameworks WHERE organization_id = :organization_id AND model_inventory_id = :model_inventory_id`,
      {
        replacements: { organization_id: organizationId, model_inventory_id: id },
        transaction,
      },
    )) as [IModelInventoryProjectFramework[], number];
    assignModelLinks(updatedModel, links[0]);

    const automations = (await sequelize.query(
      `SELECT
        pat.key AS trigger_key,
        paa.key AS action_key,
        a.id AS automation_id,
        aa.*
      FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id JOIN automation_actions_data aa ON a.id = aa.automation_id JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE a.organization_id = :organization_id AND pat.key = 'model_updated' AND a.is_active ORDER BY aa."order" ASC;`,
      { replacements: { organization_id: organizationId }, transaction },
    )) as [
      (TenantAutomationActionModel & {
        trigger_key: string;
        action_key: string;
        automation_id: number;
      })[],
      number,
    ];
    if (automations[0].length > 0) {
      const automation = automations[0][0];
      if (automation["trigger_key"] === "model_updated") {
        const params = automation.params!;

        // Build replacements
        const replacements = buildModelUpdateReplacements(oldModel, updatedModel);

        // Replace variables in subject and body
        const processedParams = {
          ...params,
          subject: replaceTemplateVariables(params.subject || "", replacements),
          body: replaceTemplateVariables(params.body || "", replacements),
          automation_id: automation.automation_id,
        };

        // Enqueue with processed params
        await enqueueAutomationAction(automation.action_key, {
          ...processedParams,
          organizationId,
        });
      } else {
        console.warn(`No matching trigger found for key: ${automation["trigger_key"]}`);
      }
    }

    // Record history snapshot if status changed
    try {
      if (oldModel && oldModel.status !== updatedModel.status) {
        await recordSnapshotIfChanged("status", organizationId, undefined, transaction);
      }
    } catch (historyError) {
      console.error("Error recording history snapshot:", historyError);
      // Don't throw - history recording failure shouldn't block model update
    }

    // The use cases this update linked, for the caller's "added to a use
    // case" notices (not a column: it stays out of the JSON response).
    return Object.assign(updatedModel, { addedProjectIds });
  } catch (error) {
    console.error("Error updating model inventory:", error);
    throw error;
  }
};

/**
 * Deletes a model. Its risks are never deleted with it: with `deleteRisks`
 * they are archived (as a model risk delete does), otherwise they stay, with
 * no model.
 *
 * `changedByUserId` is who the model risks' change history names; null
 * (AI Advisor) records it as the system's.
 */
export const deleteModelInventoryByIdQuery = async (
  id: number,
  deleteRisks: boolean,
  organizationId: number,
  transaction: Transaction,
  changedByUserId: number | null = null,
) => {
  try {
    await releaseModelRisksOfModelQuery(
      id,
      deleteRisks,
      organizationId,
      changedByUserId,
      transaction,
    );

    await deleteAllCustomFieldValuesForEntityQuery(
      "model_inventory",
      id,
      organizationId,
      transaction,
    );

    const result = (await sequelize.query(
      `DELETE FROM model_inventories WHERE organization_id = :organization_id AND id = :id RETURNING *`,
      {
        replacements: { organization_id: organizationId, id },
        transaction,
      },
    )) as [ModelInventoryModel[], number];
    const deletedModel = result[0][0];
    const automations = (await sequelize.query(
      `SELECT
        pat.key AS trigger_key,
        paa.key AS action_key,
        a.id AS automation_id,
        aa.*
      FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id JOIN automation_actions_data aa ON a.id = aa.automation_id JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE a.organization_id = :organization_id AND pat.key = 'model_deleted' AND a.is_active ORDER BY aa."order" ASC;`,
      { replacements: { organization_id: organizationId }, transaction },
    )) as [
      (TenantAutomationActionModel & {
        trigger_key: string;
        action_key: string;
        automation_id: number;
      })[],
      number,
    ];
    if (automations[0].length > 0) {
      const automation = automations[0][0];
      if (automation["trigger_key"] === "model_deleted") {
        const params = automation.params!;

        // Build replacements
        const replacements = buildModelReplacements(deletedModel);

        // Replace variables in subject and body
        const processedParams = {
          ...params,
          subject: replaceTemplateVariables(params.subject || "", replacements),
          body: replaceTemplateVariables(params.body || "", replacements),
          automation_id: automation.automation_id,
        };

        // Enqueue with processed params
        await enqueueAutomationAction(automation.action_key, {
          ...processedParams,
          organizationId,
        });
      } else {
        console.warn(`No matching trigger found for key: ${automation["trigger_key"]}`);
      }
    }

    // Record history snapshot after deletion
    try {
      await recordSnapshotIfChanged("status", organizationId, undefined, transaction);
    } catch (historyError) {
      console.error("Error recording history snapshot:", historyError);
      // Don't throw - history recording failure shouldn't block model deletion
    }

    return deletedModel;
  } catch (error) {
    console.error("Error deleting model inventory:", error);
    throw error;
  }
};

/**
 * Distinct use case ids a model inventory is linked to directly. Used by the
 * update query (link diff) and the new-model-risk trigger's project scope.
 */
export async function getModelInventoryProjectIdsQuery(
  modelInventoryId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<number[]> {
  const rows = (await sequelize.query(
    `SELECT DISTINCT project_id FROM model_inventories_projects_frameworks
      WHERE organization_id = :organizationId
        AND model_inventory_id = :modelInventoryId
        AND project_id IS NOT NULL
        AND framework_id IS NULL`,
    { replacements: { organizationId, modelInventoryId }, transaction },
  )) as [{ project_id: number }[], number];
  return rows[0].map((row) => row.project_id);
}

/** Distinct framework ids a model inventory is linked to. */
export async function getModelInventoryFrameworkIdsQuery(
  modelInventoryId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<number[]> {
  const rows = (await sequelize.query(
    `SELECT DISTINCT framework_id FROM model_inventories_projects_frameworks
      WHERE organization_id = :organizationId
        AND model_inventory_id = :modelInventoryId
        AND framework_id IS NOT NULL`,
    { replacements: { organizationId, modelInventoryId }, transaction },
  )) as [{ framework_id: number }[], number];
  return rows[0].map((row) => row.framework_id);
}

/**
 * Display name of one model inventory, for notification messages. Null when
 * the row is gone — callers fall back to `Model #<id>` so the message never
 * renders a blank name.
 */
export async function getModelInventoryNameQuery(
  modelInventoryId: number,
  organizationId: number,
): Promise<string | null> {
  const rows = (await sequelize.query(
    `SELECT model FROM model_inventories
      WHERE id = :modelInventoryId AND organization_id = :organizationId`,
    { replacements: { modelInventoryId, organizationId } },
  )) as [{ model: string | null }[], number];
  return rows[0][0]?.model ?? null;
}
