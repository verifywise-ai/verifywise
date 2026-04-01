/**
 * Model Inventory Change History Utilities
 *
 * @deprecated This file is deprecated and will be removed in a future version.
 * Use the generic change history functions from `changeHistory.base.utils.ts` directly instead.
 *
 * Migration guide:
 * - Replace `recordModelInventoryChange()` with `recordEntityChange("model_inventory", ...)`
 * - Replace `recordMultipleFieldChanges()` with `recordMultipleFieldChanges("model_inventory", ...)`
 * - Replace `getModelInventoryChangeHistory()` with `getEntityChangeHistory("model_inventory", ...)`
 * - Replace `trackModelInventoryChanges()` with `trackEntityChanges("model_inventory", ...)`
 * - Replace `recordModelInventoryCreation()` with `recordEntityCreation("model_inventory", ...)`
 * - Replace `recordModelInventoryDeletion()` with `recordEntityDeletion("model_inventory", ...)`
 * - Replace `recordEvidenceAddedToModel()` with `recordEvidenceAddedToEntity("model_inventory", ...)`
 * - Replace `recordEvidenceRemovedFromModel()` with `recordEvidenceRemovedFromEntity("model_inventory", ...)`
 * - Replace `recordEvidenceFieldChangeForModel()` with `recordEvidenceFieldChangeForEntity("model_inventory", ...)`
 *
 * These wrapper functions are maintained for backward compatibility only.
 */

import { ModelInventoryModel } from "../domain.layer/models/modelInventory/modelInventory.model";
import { Transaction } from "sequelize";
import {
  recordEntityChange,
  recordMultipleFieldChanges as recordMultipleFieldChangesGeneric,
  getEntityChangeHistory,
  trackEntityChanges,
  recordEntityCreation,
  recordEntityDeletion,
  recordEvidenceAddedToEntity,
  recordEvidenceRemovedFromEntity,
  recordEvidenceFieldChangeForEntity,
} from "./changeHistory.base.utils";

/**
 * Record a change in model inventory
 * @deprecated Use `recordEntityChange("model_inventory", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordModelInventoryChange = async (
  modelInventoryId: number,
  action: "created" | "updated" | "deleted",
  changedByUserId: number,
  organizationId: number,
  fieldName?: string,
  oldValue?: string,
  newValue?: string,
  transaction?: Transaction
): Promise<void> => {
  return recordEntityChange(
    "model_inventory",
    modelInventoryId,
    action,
    changedByUserId,
    organizationId,
    fieldName,
    oldValue,
    newValue,
    transaction
  );
};

/**
 * Record multiple field changes for a model inventory
 * @deprecated Use `recordMultipleFieldChanges("model_inventory", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordMultipleFieldChanges = async (
  modelInventoryId: number,
  changedByUserId: number,
  organizationId: number,
  changes: Array<{ fieldName: string; oldValue: string; newValue: string }>,
  transaction?: Transaction
): Promise<void> => {
  return recordMultipleFieldChangesGeneric(
    "model_inventory",
    modelInventoryId,
    changedByUserId,
    organizationId,
    changes,
    transaction
  );
};

/**
 * Get change history for a specific model inventory with pagination support
 * @deprecated Use `getEntityChangeHistory("model_inventory", ...)` from `changeHistory.base.utils.ts` instead
 */
export const getModelInventoryChangeHistory = async (
  modelInventoryId: number,
  organizationId: number,
  limit: number = 100,
  offset: number = 0
): Promise<{ data: any[]; hasMore: boolean; total: number }> => {
  return getEntityChangeHistory(
    "model_inventory",
    modelInventoryId,
    organizationId,
    limit,
    offset
  );
};

/**
 * Track changes between old and new model inventory data
 * @deprecated Use `trackEntityChanges("model_inventory", ...)` from `changeHistory.base.utils.ts` instead
 */
export const trackModelInventoryChanges = async (
  oldModel: ModelInventoryModel,
  newModel: Partial<ModelInventoryModel>
): Promise<Array<{ fieldName: string; oldValue: string; newValue: string }>> => {
  return trackEntityChanges("model_inventory", oldModel, newModel);
};

/**
 * Record creation of a model inventory
 * @deprecated Use `recordEntityCreation("model_inventory", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordModelInventoryCreation = async (
  modelInventoryId: number,
  changedByUserId: number,
  organizationId: number,
  modelData: Partial<ModelInventoryModel>,
  transaction?: Transaction
): Promise<void> => {
  return recordEntityCreation(
    "model_inventory",
    modelInventoryId,
    changedByUserId,
    organizationId,
    modelData,
    transaction
  );
};

/**
 * Record deletion of a model inventory
 * @deprecated Use `recordEntityDeletion("model_inventory", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordModelInventoryDeletion = async (
  modelInventoryId: number,
  changedByUserId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<void> => {
  return recordEntityDeletion(
    "model_inventory",
    modelInventoryId,
    changedByUserId,
    organizationId,
    transaction
  );
};

/**
 * Record evidence being added to a model
 * @deprecated Use `recordEvidenceAddedToEntity("model_inventory", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordEvidenceAddedToModel = async (
  modelInventoryId: number,
  changedByUserId: number,
  organizationId: number,
  evidenceName: string,
  evidenceType: string,
  transaction?: Transaction
): Promise<void> => {
  return recordEvidenceAddedToEntity(
    "model_inventory",
    modelInventoryId,
    changedByUserId,
    organizationId,
    evidenceName,
    evidenceType,
    transaction
  );
};

/**
 * Record evidence being removed from a model
 * @deprecated Use `recordEvidenceRemovedFromEntity("model_inventory", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordEvidenceRemovedFromModel = async (
  modelInventoryId: number,
  changedByUserId: number,
  organizationId: number,
  evidenceName: string,
  evidenceType: string,
  transaction?: Transaction
): Promise<void> => {
  return recordEvidenceRemovedFromEntity(
    "model_inventory",
    modelInventoryId,
    changedByUserId,
    organizationId,
    evidenceName,
    evidenceType,
    transaction
  );
};

/**
 * Record evidence field changes for a specific model
 * @deprecated Use `recordEvidenceFieldChangeForEntity("model_inventory", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordEvidenceFieldChangeForModel = async (
  modelInventoryId: number,
  changedByUserId: number,
  organizationId: number,
  evidenceName: string,
  fieldName: string,
  oldValue: string,
  newValue: string,
  transaction?: Transaction
): Promise<void> => {
  return recordEvidenceFieldChangeForEntity(
    "model_inventory",
    modelInventoryId,
    changedByUserId,
    organizationId,
    evidenceName,
    fieldName,
    oldValue,
    newValue,
    transaction
  );
};
