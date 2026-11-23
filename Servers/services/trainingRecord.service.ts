/**
 * Creating, updating and deleting training registry records, shared by the
 * console (/api/training) and the Advisor's training record tools, so a write
 * from either is the same write: same queries (and so the same training
 * automations), change history and, on create, the notice to Admins.
 *
 * The caller checks the permission first: training.edit to create or update,
 * training.admin to delete.
 */
import { sequelize } from "../database/db";
import logger from "../utils/logger/fileLogger";
import {
  createNewTrainingRegistarQuery,
  deleteTrainingRegistarByIdQuery,
  getTrainingRegistarByIdQuery,
  updateTrainingRegistarByIdQuery,
} from "../utils/trainingRegistar.utils";
import {
  recordEntityCreation,
  recordEntityDeletion,
  recordMultipleFieldChanges,
  trackEntityChanges,
} from "../utils/changeHistory.base.utils";
import { buildEntityUrl, notifyTrainingAssigned } from "./inAppNotification.service";
import { NotificationEntityType } from "../domain.layer/interfaces/i.notification";
import type { ITrainingRegister } from "../domain.layer/interfaces/i.trainingRegister";
import type { TrainingRegistarModel } from "../domain.layer/models/trainingRegistar/trainingRegistar.model";
import { getAllUsersQuery } from "../utils/user.utils";
import { frontendBaseUrl } from "../utils/frontendUrl.utils";

/** Who makes the change; history is recorded only when the user is known. */
export interface TrainingRecordActor {
  userId?: number;
  organizationId: number;
}

/** A record's fields as the console sends them (numberOfPeople, not people). */
export type TrainingRecordInput = Partial<ITrainingRegister>;

const rowOf = (record: unknown): Record<string, any> =>
  (record as { dataValues?: Record<string, any> })?.dataValues ?? (record as Record<string, any>);

/** The insert names every column, so a field left out is stored as null. */
const withEveryField = (input: TrainingRecordInput): ITrainingRegister =>
  ({
    ...input,
    duration: input.duration ?? null,
    provider: input.provider ?? null,
    department: input.department ?? null,
    status: input.status ?? null,
    numberOfPeople: input.numberOfPeople ?? null,
    description: input.description ?? null,
  }) as unknown as ITrainingRegister;

/** One failed notice never fails the save. */
async function notifyAdminsOfNewTraining(
  actor: TrainingRecordActor,
  trainingId: number,
  input: TrainingRecordInput,
): Promise<void> {
  try {
    const users = await getAllUsersQuery(actor.organizationId);
    const admins = users.filter((user) => user.role_id === 1);
    const creator = users.find((user) => user.id === actor.userId);
    const creatorName = creator ? `${creator.name} ${creator.surname}` : "System";

    for (const admin of admins) {
      await notifyTrainingAssigned(
        actor.organizationId,
        admin.id!,
        {
          id: trainingId,
          name: input.training_name ?? "",
          description: input.description,
          duration: input.duration,
          // These recipients are admins hearing about a new record, not trainees.
          actionPath: buildEntityUrl(NotificationEntityType.TRAINING, trainingId),
        },
        creatorName,
        frontendBaseUrl(),
      );
    }
  } catch (error) {
    logger.error("Failed to send training assigned notification:", error);
  }
}

/** Create a record; null when the insert returned nothing. */
export async function createTrainingRecord(
  input: TrainingRecordInput,
  actor: TrainingRecordActor,
): Promise<TrainingRegistarModel | null> {
  const transaction = await sequelize.transaction();
  let created: TrainingRegistarModel | null;
  try {
    created = await createNewTrainingRegistarQuery(
      withEveryField(input),
      actor.organizationId,
      transaction,
    );
    if (!created) {
      await transaction.rollback();
      return null;
    }
    const trainingId = rowOf(created)?.id;
    if (trainingId && actor.userId) {
      // Normalize numberOfPeople to people (DB column name) for change tracking
      const normalized: Record<string, unknown> = { ...input, people: input.numberOfPeople };
      delete normalized.numberOfPeople;
      await recordEntityCreation(
        "training",
        trainingId,
        actor.userId,
        actor.organizationId,
        normalized,
        transaction,
      );
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  await notifyAdminsOfNewTraining(actor, rowOf(created)?.id || 0, input);
  return created;
}

/** The columns an update can write (as updateTrainingRegistarByIdQuery). */
const WRITABLE_FIELDS = [
  "training_name",
  "duration",
  "provider",
  "department",
  "status",
  "people",
  "description",
] as const;

export type UpdateTrainingRecordResult =
  { ok: true; record: TrainingRegistarModel } | { ok: false; reason: "no_fields" | "not_found" };

/**
 * Update a record. The row is read once, locked, inside the update's
 * transaction, and that read is both the change-history baseline and the
 * automation's "before".
 */
export async function updateTrainingRecord(
  id: number,
  input: TrainingRecordInput,
  actor: TrainingRecordActor,
): Promise<UpdateTrainingRecordResult> {
  // Map numberOfPeople to people for DB
  const updates: Record<string, unknown> = { ...input, people: input.numberOfPeople };
  delete updates.numberOfPeople;
  if (!WRITABLE_FIELDS.some((field) => updates[field] !== undefined && updates[field] !== null)) {
    return { ok: false, reason: "no_fields" };
  }

  const transaction = await sequelize.transaction();
  try {
    const existing = await getTrainingRegistarByIdQuery(id, actor.organizationId, {
      transaction,
      lock: true,
    });
    if (!existing) {
      await transaction.rollback();
      return { ok: false, reason: "not_found" };
    }
    const updated = await updateTrainingRegistarByIdQuery(
      id,
      updates as Partial<TrainingRegistarModel>,
      actor.organizationId,
      transaction,
      existing,
    );
    if (!updated) {
      await transaction.rollback();
      return { ok: false, reason: "not_found" };
    }
    if (actor.userId) {
      const changes = await trackEntityChanges("training", existing, updates);
      if (changes.length > 0) {
        await recordMultipleFieldChanges(
          "training",
          id,
          actor.userId,
          actor.organizationId,
          changes,
          transaction,
        );
      }
    }
    await transaction.commit();
    return { ok: true, record: updated };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/** Delete a record; returns it as it was, or null when it is not in the organization. */
export async function deleteTrainingRecord(
  id: number,
  actor: TrainingRecordActor,
): Promise<ITrainingRegister | null> {
  const transaction = await sequelize.transaction();
  try {
    const existing = await getTrainingRegistarByIdQuery(id, actor.organizationId, {
      transaction,
      lock: true,
    });
    const deleted =
      existing && (await deleteTrainingRegistarByIdQuery(id, actor.organizationId, transaction));
    if (!deleted) {
      await transaction.rollback();
      return null;
    }
    if (actor.userId) {
      await recordEntityDeletion("training", id, actor.userId, actor.organizationId, transaction);
    }
    await transaction.commit();
    return existing;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
