/**
 * Use Case Change History Utilities
 *
 * @deprecated This file is deprecated and will be removed in a future version.
 * Use the generic change history functions from `changeHistory.base.utils.ts` directly instead.
 *
 * Migration guide:
 * - Replace `recordUseCaseChange()` with `recordEntityChange("use_case", ...)`
 * - Replace `recordMultipleFieldChanges()` with `recordMultipleFieldChanges("use_case", ...)`
 * - Replace `getUseCaseChangeHistory()` with `getEntityChangeHistory("use_case", ...)`
 * - Replace `trackUseCaseChanges()` with `trackEntityChanges("use_case", ...)`
 * - Replace `recordUseCaseCreation()` with `recordEntityCreation("use_case", ...)`
 * - Replace `recordUseCaseDeletion()` with `recordEntityDeletion("use_case", ...)`
 *
 * These wrapper functions are maintained for backward compatibility only.
 */

import { IProjectAttributes } from "../domain.layer/interfaces/i.project";
import { Transaction } from "sequelize";
import {
  recordEntityChange,
  recordMultipleFieldChanges as recordMultipleFieldChangesGeneric,
  getEntityChangeHistory,
  trackEntityChanges,
  recordEntityCreation,
  recordEntityDeletion,
} from "./changeHistory.base.utils";

/**
 * Record a change in use case
 * @deprecated Use `recordEntityChange("use_case", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordUseCaseChange = async (
  useCaseId: number,
  action: "created" | "updated" | "deleted",
  changedByUserId: number,
  organizationId: number,
  fieldName?: string,
  oldValue?: string,
  newValue?: string,
  transaction?: Transaction
): Promise<void> => {
  return recordEntityChange(
    "use_case",
    useCaseId,
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
 * Record multiple field changes for a use case
 * @deprecated Use `recordMultipleFieldChanges("use_case", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordMultipleFieldChanges = async (
  useCaseId: number,
  changedByUserId: number,
  organizationId: number,
  changes: Array<{ fieldName: string; oldValue: string; newValue: string }>,
  transaction?: Transaction
): Promise<void> => {
  return recordMultipleFieldChangesGeneric(
    "use_case",
    useCaseId,
    changedByUserId,
    organizationId,
    changes,
    transaction
  );
};

/**
 * Get change history for a specific use case with pagination support
 * @deprecated Use `getEntityChangeHistory("use_case", ...)` from `changeHistory.base.utils.ts` instead
 */
export const getUseCaseChangeHistory = async (
  useCaseId: number,
  organizationId: number,
  limit: number = 100,
  offset: number = 0
): Promise<{ data: any[]; hasMore: boolean; total: number }> => {
  return getEntityChangeHistory(
    "use_case",
    useCaseId,
    organizationId,
    limit,
    offset
  );
};

/**
 * Track changes between old and new use case data
 * @deprecated Use `trackEntityChanges("use_case", ...)` from `changeHistory.base.utils.ts` instead
 */
export const trackUseCaseChanges = async (
  oldModel: IProjectAttributes,
  newModel: Partial<IProjectAttributes>
): Promise<Array<{ fieldName: string; oldValue: string; newValue: string }>> => {
  return trackEntityChanges("use_case", oldModel, newModel);
};

/**
 * Record creation of a use case
 * @deprecated Use `recordEntityCreation("use_case", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordUseCaseCreation = async (
  useCaseId: number,
  changedByUserId: number,
  organizationId: number,
  useCaseData: Partial<IProjectAttributes>,
  transaction?: Transaction
): Promise<void> => {
  return recordEntityCreation(
    "use_case",
    useCaseId,
    changedByUserId,
    organizationId,
    useCaseData,
    transaction
  );
};

/**
 * Record deletion of a use case
 * @deprecated Use `recordEntityDeletion("use_case", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordUseCaseDeletion = async (
  useCaseId: number,
  changedByUserId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<void> => {
  return recordEntityDeletion(
    "use_case",
    useCaseId,
    changedByUserId,
    organizationId,
    transaction
  );
};
