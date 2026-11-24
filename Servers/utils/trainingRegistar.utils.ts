import { TrainingRegistarModel } from "../domain.layer/models/trainingRegistar/trainingRegistar.model";
import { sequelize } from "../database/db";
import { QueryTypes, Transaction } from "sequelize";
import { ITrainingRegister } from "../domain.layer/interfaces/i.trainingRegister";
import { runEventAutomations } from "./automation/automationActions.utils";
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
  transaction: Transaction,
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
    },
  );
  const createdTrainingRegistar = result[0];
  // Every action of every active automation; one flagged legacy keeps only the
  // event's first. Enqueued at once, as before.
  await runEventAutomations(
    organizationId,
    "training_added",
    () => buildTrainingReplacements({ ...createdTrainingRegistar.dataValues }),
    {
      transaction,
      afterCommit: false,
      logContext: `training_added, training ${createdTrainingRegistar.id}`,
    },
  );
  // Return the created TrainingRegistar instance
  return createdTrainingRegistar;
};

/**
 *
 * @returns All the training registars in the DB
 */

export const getAllTrainingRegistarQuery = async (
  organizationId: number,
): Promise<ITrainingRegister[]> => {
  const trainingRegistars = await sequelize.query(
    `SELECT * FROM trainingregistar WHERE organization_id = :organizationId ORDER BY id ASC`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: TrainingRegistarModel,
    },
  );
  // Return all training registars or an empty array if none found
  return Array.isArray(trainingRegistars) ? (trainingRegistars as TrainingRegistarModel[]) : [];
};

/**
 * Return the training registars by ID // for now keeping it might not need it eventually
 */
export const getTrainingRegistarByIdQuery = async (
  id: number,
  organizationId: number,
  options: { transaction?: Transaction; lock?: boolean } = {},
): Promise<ITrainingRegister> => {
  const trainingRegistarsById = await sequelize.query(
    `SELECT * FROM trainingregistar WHERE organization_id = :organizationId AND id = :id${
      options.lock ? " FOR UPDATE" : ""
    }`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: TrainingRegistarModel,
      ...(options.transaction ? { transaction: options.transaction } : {}),
    },
  );
  // Return the first training registar or null if none found
  return Array.isArray(trainingRegistarsById) && trainingRegistarsById.length > 0
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
  transaction: Transaction,
  /** The row as it was, when the caller has already read (and locked) it. */
  existing?: ITrainingRegister,
): Promise<TrainingRegistarModel> => {
  const existingTrainingRegistar =
    existing ?? (await getTrainingRegistarByIdQuery(id, organizationId, { transaction }));
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
  // Not in this organization: nothing was updated, so no automation runs.
  if (!updatedTrainingRegistar) return null as any;
  // Every action of every active automation; one flagged legacy keeps only the
  // event's first. Enqueued at once, as before.
  await runEventAutomations(
    organizationId,
    "training_updated",
    () =>
      buildTrainingUpdateReplacements(existingTrainingRegistar, {
        ...updatedTrainingRegistar.dataValues,
      }),
    {
      transaction,
      afterCommit: false,
      logContext: `training_updated, training ${id}`,
    },
  );

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
  transaction: Transaction,
): Promise<boolean> => {
  const result = await sequelize.query(
    `DELETE FROM trainingregistar WHERE organization_id = :organizationId AND id = :id RETURNING *`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: TrainingRegistarModel,
      type: QueryTypes.DELETE,
      transaction,
    },
  );
  const deletedTrainingRegistar = result[0];
  // Not in this organization: nothing was deleted, so no automation runs.
  if (!deletedTrainingRegistar) return false;
  // Every action of every active automation; one flagged legacy keeps only the
  // event's first. Enqueued at once, as before.
  await runEventAutomations(
    organizationId,
    "training_deleted",
    () => buildTrainingReplacements(deletedTrainingRegistar),
    {
      transaction,
      afterCommit: false,
      logContext: `training_deleted, training ${id}`,
    },
  );

  // Check if any rows were affected
  return Array.isArray(result) && result.length > 0;
};
