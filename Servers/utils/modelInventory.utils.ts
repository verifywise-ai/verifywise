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

export const getAllModelInventoriesQuery = async (organizationId: number) => {
  const modelInventories = await sequelize.query(
    `SELECT * FROM model_inventories WHERE organization_id = :organizationId ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: ModelInventoryModel,
    }
  );
  for (const model of modelInventories) {
    (model.dataValues as any).projects = [];
    (model.dataValues as any).frameworks = [];
    const projectFrameworks = (await sequelize.query(
      `SELECT project_id, framework_id FROM model_inventories_projects_frameworks WHERE organization_id = :organizationId AND model_inventory_id = :model_inventory_id`,
      {
        replacements: { organizationId, model_inventory_id: model.id },
      }
    )) as [IModelInventoryProjectFramework[], number];
    for (const pf of projectFrameworks[0]) {
      if (pf.project_id && pf.framework_id) {
        (model.dataValues as any).frameworks.push(pf.framework_id);
      } else {
        (model.dataValues as any).projects.push(pf.project_id);
      }
    }
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
    }
  );
  for (const model of modelInventory) {
    (model.dataValues as any).projects = [];
    (model.dataValues as any).frameworks = [];
    const projectFrameworks = (await sequelize.query(
      `SELECT project_id, framework_id FROM model_inventories_projects_frameworks WHERE organization_id = :organizationId AND model_inventory_id = :model_inventory_id`,
      {
        replacements: { organizationId, model_inventory_id: model.id },
      }
    )) as [IModelInventoryProjectFramework[], number];
    for (const pf of projectFrameworks[0]) {
      if (pf.project_id && pf.framework_id) {
        (model.dataValues as any).frameworks.push(pf.framework_id);
      } else {
        (model.dataValues as any).projects.push(pf.project_id);
      }
    }
  }
  return modelInventory;
};

export const getModelInventoryByIdQuery = async (
  id: number,
  organizationId: number
) => {
  const modelInventory = await sequelize.query(
    `SELECT * FROM model_inventories WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: ModelInventoryModel,
    }
  );

  if (!modelInventory.length) return null;
  const model = modelInventory[0];
  (model.dataValues as any).projects = [];
  (model.dataValues as any).frameworks = [];
  const projectFrameworks = (await sequelize.query(
    `SELECT project_id, framework_id FROM model_inventories_projects_frameworks WHERE organization_id = :organizationId AND model_inventory_id = :model_inventory_id`,
    {
      replacements: { organizationId, model_inventory_id: model.id },
    }
  )) as [IModelInventoryProjectFramework[], number];
  for (const pf of projectFrameworks[0]) {
    if (pf.project_id && pf.framework_id) {
      (model.dataValues as any).frameworks.push(pf.framework_id);
    } else {
      (model.dataValues as any).projects.push(pf.project_id);
    }
  }

  return model;
};

export const getModelByProjectIdQuery = async (
  projectId: number,
  organizationId: number
) => {
  const modelInventories = await sequelize.query(
    `SELECT mi.* FROM model_inventories mi
      JOIN model_inventories_projects_frameworks mipf
      ON mi.id = mipf.model_inventory_id AND mi.organization_id = mipf.organization_id
      WHERE mi.organization_id = :organizationId AND mipf.project_id = :project_id AND mipf.framework_id IS NULL`,
    {
      replacements: { organizationId, project_id: projectId },
      mapToModel: true,
      model: ModelInventoryModel,
    }
  );
  return modelInventories;
};

export const getModelByFrameworkIdQuery = async (
  frameworkId: number,
  organizationId: number
) => {
  const modelInventories = await sequelize.query(
    `SELECT mi.* FROM model_inventories mi
      JOIN model_inventories_projects_frameworks mipf
      ON mi.id = mipf.model_inventory_id AND mi.organization_id = mipf.organization_id
      WHERE mi.organization_id = :organizationId AND mipf.framework_id = :framework_id`,
    {
      replacements: { organizationId, framework_id: frameworkId },
      mapToModel: true,
      model: ModelInventoryModel,
    }
  );
  return modelInventories;
};

export const createNewModelInventoryQuery = async (
  modelInventory: ModelInventoryModel,
  organizationId: number,
  projects: number[],
  frameworks: number[],
  transaction: Transaction
) => {
  const created_at = new Date();

  try {
    const result = await sequelize.query(
      `INSERT INTO model_inventories (organization_id, provider_model, provider, model, version, approver, capabilities, security_assessment, status, status_date, reference_link, biases, limitations, hosting_provider, security_assessment_data, is_demo, created_at, updated_at)
      VALUES (:organization_id, :provider_model, :provider, :model, :version, :approver, :capabilities, :security_assessment, :status, :status_date, :reference_link, :biases, :limitations, :hosting_provider, :security_assessment_data, :is_demo, :created_at, :updated_at) RETURNING *`,
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
          reference_link: modelInventory.reference_link,
          biases: modelInventory.biases,
          limitations: modelInventory.limitations,
          hosting_provider: modelInventory.hosting_provider,
          security_assessment_data: JSON.stringify(
            modelInventory.security_assessment_data || []
          ),
          is_demo: modelInventory.is_demo,
          created_at: created_at,
          updated_at: created_at,
        },
        mapToModel: true,
        model: ModelInventoryModel,
        transaction,
      }
    );

    const createdModel = result[0];
    (createdModel.dataValues as any).projects = [];
    (createdModel.dataValues as any).frameworks = [];

    for (const projectId of projects) {
      const result = (await sequelize.query(
        `INSERT INTO model_inventories_projects_frameworks (organization_id, model_inventory_id, project_id)
         VALUES (:organization_id, :model_inventory_id, :project_id);`,
        {
          replacements: {
            organization_id: organizationId,
            model_inventory_id: createdModel.id,
            project_id: projectId,
          },
          transaction,
        }
      )) as [IModelInventoryProjectFramework[], number];
      if (result[0].length > 0) {
        (createdModel.dataValues as any).projects.push(projectId);
      }
    }

    for (const frameworkId of frameworks) {
      const [[{ project_id }]] = (await sequelize.query(
        `SELECT project_id FROM projects_frameworks WHERE organization_id = :organization_id AND framework_id = :framework_id LIMIT 1;`,
        {
          replacements: { organization_id: organizationId, framework_id: frameworkId },
          transaction,
        }
      )) as [{ project_id: number }[], number];
      const result = (await sequelize.query(
        `INSERT INTO model_inventories_projects_frameworks (organization_id, model_inventory_id, project_id, framework_id)
         VALUES (:organization_id, :model_inventory_id, :project_id, :framework_id);`,
        {
          replacements: {
            organization_id: organizationId,
            model_inventory_id: createdModel.id,
            project_id: project_id,
            framework_id: frameworkId,
          },
          transaction,
        }
      )) as [IModelInventoryProjectFramework[], number];
      if (result[0].length > 0) {
        (createdModel.dataValues as any).frameworks.push(frameworkId);
      }
    }

    const automations = (await sequelize.query(
      `SELECT
        pat.key AS trigger_key,
        paa.key AS action_key,
        a.id AS automation_id,
        aa.*
      FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id JOIN automation_actions_data aa ON a.id = aa.automation_id JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE a.organization_id = :organization_id AND pat.key = 'model_added' AND a.is_active ORDER BY aa."order" ASC;`,
      { replacements: { organization_id: organizationId }, transaction }
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
        console.warn(
          `No matching trigger found for key: ${automation["trigger_key"]}`
        );
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
  transaction: Transaction
) => {
  const updated_at = new Date();
  const oldModel = await getModelInventoryByIdQuery(id, organizationId);

  try {
    // First update the record
    await sequelize.query(
      `UPDATE model_inventories SET provider_model = :provider_model, provider = :provider, model = :model, version = :version, approver = :approver, capabilities = :capabilities, security_assessment = :security_assessment, status = :status, status_date = :status_date, reference_link = :reference_link, biases = :biases, limitations = :limitations,  hosting_provider = :hosting_provider, security_assessment_data = :security_assessment_data, is_demo = :is_demo, updated_at = :updated_at WHERE organization_id = :organization_id AND id = :id`,
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
          reference_link: modelInventory.reference_link,
          biases: modelInventory.biases,
          limitations: modelInventory.limitations,
          hosting_provider: modelInventory.hosting_provider,
          security_assessment_data: JSON.stringify(
            modelInventory.security_assessment_data || []
          ),
          is_demo: modelInventory.is_demo,
          updated_at,
        },
        transaction,
      }
    );

    // Then fetch the updated record
    const result = await sequelize.query(
      `SELECT * FROM model_inventories WHERE organization_id = :organization_id AND id = :id`,
      {
        replacements: { organization_id: organizationId, id },
        mapToModel: true,
        model: ModelInventoryModel,
        transaction,
      }
    );
    const updatedModel = result[0];
    (updatedModel.dataValues as any).projects = [];
    (updatedModel.dataValues as any).frameworks = [];

    if ((projects && projects.length > 0) || deleteProjects) {
      // First, delete existing associations
      await sequelize.query(
        `DELETE FROM model_inventories_projects_frameworks WHERE organization_id = :organization_id AND model_inventory_id = :model_inventory_id AND project_id IS NOT NULL`,
        {
          replacements: { organization_id: organizationId, model_inventory_id: id },
          transaction,
        }
      );

      // Then, insert new associations
      for (const projectId of projects) {
        const result = (await sequelize.query(
          `INSERT INTO model_inventories_projects_frameworks (organization_id, model_inventory_id, project_id)
            VALUES (:organization_id, :model_inventory_id, :project_id);`,
          {
            replacements: {
              organization_id: organizationId,
              model_inventory_id: id,
              project_id: projectId,
            },
            transaction,
          }
        )) as [IModelInventoryProjectFramework[], number];
        if (result[0].length > 0) {
          (updatedModel.dataValues as any).projects.push(projectId);
        }
      }
    }

    if ((frameworks && frameworks.length > 0) || deleteFrameworks) {
      // First, delete existing associations
      await sequelize.query(
        `DELETE FROM model_inventories_projects_frameworks WHERE organization_id = :organization_id AND model_inventory_id = :model_inventory_id AND framework_id IS NOT NULL`,
        {
          replacements: { organization_id: organizationId, model_inventory_id: id },
          transaction,
        }
      );

      // Then, insert new associations
      for (const frameworkId of frameworks) {
        const [[{ project_id }]] = (await sequelize.query(
          `SELECT project_id FROM projects_frameworks WHERE organization_id = :organization_id AND framework_id = :framework_id LIMIT 1;`,
          {
            replacements: { organization_id: organizationId, framework_id: frameworkId },
            transaction,
          }
        )) as [{ project_id: number }[], number];

        const result = (await sequelize.query(
          `INSERT INTO model_inventories_projects_frameworks (organization_id, model_inventory_id, project_id, framework_id)
            VALUES (:organization_id, :model_inventory_id, :project_id, :framework_id);`,
          {
            replacements: {
              organization_id: organizationId,
              model_inventory_id: id,
              project_id: project_id,
              framework_id: frameworkId,
            },
            transaction,
          }
        )) as [IModelInventoryProjectFramework[], number];
        if (result[0].length > 0) {
          (updatedModel.dataValues as any).frameworks.push(frameworkId);
        }
      }
    }

    const automations = (await sequelize.query(
      `SELECT
        pat.key AS trigger_key,
        paa.key AS action_key,
        a.id AS automation_id,
        aa.*
      FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id JOIN automation_actions_data aa ON a.id = aa.automation_id JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE a.organization_id = :organization_id AND pat.key = 'model_updated' AND a.is_active ORDER BY aa."order" ASC;`,
      { replacements: { organization_id: organizationId }, transaction }
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
        const replacements = buildModelUpdateReplacements(
          oldModel,
          updatedModel
        );

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
        console.warn(
          `No matching trigger found for key: ${automation["trigger_key"]}`
        );
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

    return updatedModel;
  } catch (error) {
    console.error("Error updating model inventory:", error);
    throw error;
  }
};

export const deleteModelInventoryByIdQuery = async (
  id: number,
  deleteRisks: boolean,
  organizationId: number,
  transaction: Transaction
) => {
  try {
    if (deleteRisks) {
      // Delete associated model risks first
      await sequelize.query(
        `DELETE FROM model_risks WHERE organization_id = :organization_id AND model_id = :id`,
        {
          replacements: { organization_id: organizationId, id },
          transaction,
        }
      );
    }

    const result = (await sequelize.query(
      `DELETE FROM model_inventories WHERE organization_id = :organization_id AND id = :id RETURNING *`,
      {
        replacements: { organization_id: organizationId, id },
        transaction,
      }
    )) as [ModelInventoryModel[], number];
    const deletedModel = result[0][0];
    const automations = (await sequelize.query(
      `SELECT
        pat.key AS trigger_key,
        paa.key AS action_key,
        a.id AS automation_id,
        aa.*
      FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id JOIN automation_actions_data aa ON a.id = aa.automation_id JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE a.organization_id = :organization_id AND pat.key = 'model_deleted' AND a.is_active ORDER BY aa."order" ASC;`,
      { replacements: { organization_id: organizationId }, transaction }
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
        console.warn(
          `No matching trigger found for key: ${automation["trigger_key"]}`
        );
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
