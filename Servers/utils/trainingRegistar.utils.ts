import { TrainingRegistarModel } from "../domain.layer/models/trainingRegistar/trainingRegistar.model";
import { sequelize } from "../database/db";
import { QueryTypes, Transaction } from "sequelize";
import { ITrainingRegister } from "../domain.layer/interfaces/i.trainingRegister";
import { TenantAutomationActionModel } from "../domain.layer/models/tenantAutomationAction/tenantAutomationAction.model";
import { replaceTemplateVariables } from "./automation/automation.utils";
import { enqueueAutomationAction } from "../services/automations/automationProducer";
import {
  buildTrainingReplacements,
  buildTrainingUpdateReplacements,
} from "./automation/training.automation.utils";

/**
 *
 * Create a Training Registar
 */
export const createNewTrainingRegistarQuery = async (
  trainingRegistar: ITrainingRegister,
  organizationId: number,
  transaction: Transaction
) => {
  const result = await sequelize.query(
    `INSERT INTO trainingregistar (
            organization_id, training_name, duration, provider, department, status, people, description, is_demo
        ) VALUES (
            :organization_id, :training_name, :duration, :provider, :department, :status, :people, :description, :is_demo
        ) RETURNING *`,
    {
      replacements: {
        organization_id: organizationId,
        training_name: trainingRegistar.training_name,
        duration: trainingRegistar.duration,
        provider: trainingRegistar.provider,
        department: trainingRegistar.department,
        status: trainingRegistar.status,
        people: trainingRegistar.numberOfPeople,
        description: trainingRegistar.description,
        is_demo: trainingRegistar.is_demo || false,
      },
      mapToModel: true,
      model: TrainingRegistarModel,
      transaction,
    }
  );
  const createdTrainingRegistar = result[0];
  const automations = (await sequelize.query(
    `SELECT
      pat.key AS trigger_key,
      paa.key AS action_key,
      a.id AS automation_id,
      aa.*
    FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'training_added' AND a.is_active ORDER BY aa."order" ASC;`,
    { replacements: { organizationId }, transaction }
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
    if (automation["trigger_key"] === "training_added") {
      const params = automation.params!;

      // Build replacements
      const replacements = buildTrainingReplacements({
        ...createdTrainingRegistar.dataValues,
      });

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
  // Return the created TrainingRegistar instance
  return createdTrainingRegistar;
};

/**
 *
 * @returns All the training registars in the DB
 */

export const getAllTrainingRegistarQuery = async (
  organizationId: number
): Promise<ITrainingRegister[]> => {
  const trainingRegistars = await sequelize.query(
    `SELECT * FROM trainingregistar WHERE organization_id = :organizationId ORDER BY id ASC`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: TrainingRegistarModel,
    }
  );
  // Return all training registars or an empty array if none found
  return Array.isArray(trainingRegistars)
    ? (trainingRegistars as TrainingRegistarModel[])
    : [];
};

/**
 * Return the training registars by ID // for now keeping it might not need it eventually
 */
export const getTrainingRegistarByIdQuery = async (
  id: number,
  organizationId: number
): Promise<ITrainingRegister> => {
  const trainingRegistarsById = await sequelize.query(
    `SELECT * FROM trainingregistar WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: TrainingRegistarModel,
    }
  );
  // Return the first training registar or null if none found
  return Array.isArray(trainingRegistarsById) &&
    trainingRegistarsById.length > 0
    ? (trainingRegistarsById[0] as ITrainingRegister)
    : (null as any);
};

/**
 * Update all the training registars by ID
 */
export const updateTrainingRegistarByIdQuery = async (
  id: number,
  trainingRegistar: Partial<TrainingRegistarModel>,
  organizationId: number,
  transaction: Transaction
): Promise<TrainingRegistarModel> => {
  const existingTrainingRegistar = await getTrainingRegistarByIdQuery(
    id,
    organizationId
  );
  const updateTrainingRegistar: Partial<
    Record<keyof TrainingRegistarModel, any> & { people?: number }
  > & { organizationId?: number } = {};
  const setClause = [
    "training_name",
    "duration",
    "provider",
    "department",
    "status",
    "people",
    "description",
  ]
    .filter((f) => {
      if (
        trainingRegistar[f as keyof TrainingRegistarModel] !== undefined &&
        trainingRegistar[f as keyof TrainingRegistarModel] !== null
      ) {
        updateTrainingRegistar[f as keyof TrainingRegistarModel] =
          trainingRegistar[f as keyof TrainingRegistarModel];
        return true;
      }
      return false;
    })
    .map((f) => `${f} = :${f}`)
    .join(", ");

  const query = `UPDATE trainingregistar SET ${setClause} WHERE organization_id = :organizationId AND id = :id RETURNING *;`;
  updateTrainingRegistar.id = id;
  updateTrainingRegistar.organizationId = organizationId;

  const result = await sequelize.query(query, {
    replacements: updateTrainingRegistar,
    mapToModel: true,
    model: TrainingRegistarModel,
    // type: QueryTypes.UPDATE,
    transaction,
  });
  const updatedTrainingRegistar = result[0];
  const automations = (await sequelize.query(
    `SELECT
      pat.key AS trigger_key,
      paa.key AS action_key,
      a.id AS automation_id,
      aa.*
    FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'training_updated' AND a.is_active ORDER BY aa."order" ASC;`,
    { replacements: { organizationId }, transaction }
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
    if (automation["trigger_key"] === "training_updated") {
      const params = automation.params!;

      // Build replacements
      const replacements = buildTrainingUpdateReplacements(
        existingTrainingRegistar,
        {
          ...updatedTrainingRegistar.dataValues,
        }
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

  // Return the first updated training registar or null if none found
  return Array.isArray(result) && result.length > 0
    ? (updatedTrainingRegistar as TrainingRegistarModel)
    : (null as any);
};

/**
 * Delete training Registar by ID
 */

export const deleteTrainingRegistarByIdQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction
): Promise<Boolean> => {
  const result = await sequelize.query(
    `DELETE FROM trainingregistar WHERE organization_id = :organizationId AND id = :id RETURNING *`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: TrainingRegistarModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  const deletedTrainingRegistar = result[0];
  const automations = (await sequelize.query(
    `SELECT
      pat.key AS trigger_key,
      paa.key AS action_key,
      a.id AS automation_id,
      aa.*
    FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'training_deleted' AND a.is_active ORDER BY aa."order" ASC;`,
    { replacements: { organizationId }, transaction }
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
    if (automation["trigger_key"] === "training_deleted") {
      const params = automation.params!;

      // Build replacements
      const replacements = buildTrainingReplacements(deletedTrainingRegistar);

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

  // Check if any rows were affected
  return Array.isArray(result) && result.length > 0;
};
