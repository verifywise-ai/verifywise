/**
 * Project Risk Change History Utilities
 *
 * @deprecated This file is deprecated and will be removed in a future version.
 * Use the generic change history functions from `changeHistory.base.utils.ts` directly instead.
 *
 * Migration guide:
 * - Replace `recordProjectRiskChange()` with `recordEntityChange("risk", ...)`
 * - Replace `recordMultipleFieldChanges()` with `recordMultipleFieldChanges("risk", ...)`
 * - Replace `getProjectRiskChangeHistory()` with `getEntityChangeHistory("risk", ...)`
 * - Replace `trackProjectRiskChanges()` with `trackEntityChanges("risk", ...)`
 * - Replace `recordProjectRiskCreation()` with `recordEntityCreation("risk", ...)`
 * - Replace `recordProjectRiskDeletion()` with `recordEntityDeletion("risk", ...)`
 *
 * These wrapper functions are maintained for backward compatibility only.
 */

import { RiskModel } from "../domain.layer/models/risks/risk.model";
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
 * Record a change in project risk
 * @deprecated Use `recordEntityChange("risk", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordProjectRiskChange = async (
  projectRiskId: number,
  action: "created" | "updated" | "deleted",
  changedByUserId: number,
  organizationId: number,
  fieldName?: string,
  oldValue?: string,
  newValue?: string,
  transaction?: Transaction
): Promise<void> => {
  return recordEntityChange(
    "risk",
    projectRiskId,
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
 * Record multiple field changes for a project risk
 * @deprecated Use `recordMultipleFieldChanges("risk", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordMultipleFieldChanges = async (
  projectRiskId: number,
  changedByUserId: number,
  organizationId: number,
  changes: Array<{ fieldName: string; oldValue: string; newValue: string }>,
  transaction?: Transaction
): Promise<void> => {
  return recordMultipleFieldChangesGeneric(
    "risk",
    projectRiskId,
    changedByUserId,
    organizationId,
    changes,
    transaction
  );
};

/**
 * Get change history for a specific project risk with pagination support
 * @deprecated Use `getEntityChangeHistory("risk", ...)` from `changeHistory.base.utils.ts` instead
 */
export const getProjectRiskChangeHistory = async (
  projectRiskId: number,
  organizationId: number,
  limit: number = 100,
  offset: number = 0
): Promise<{ data: any[]; hasMore: boolean; total: number }> => {
  return getEntityChangeHistory(
    "risk",
    projectRiskId,
    organizationId,
    limit,
    offset
  );
};

/**
 * Track changes between old and new project risk data
 * @deprecated Use `trackEntityChanges("risk", ...)` from `changeHistory.base.utils.ts` instead
 */
export const trackProjectRiskChanges = async (
  oldProjectRisk: RiskModel,
  newProjectRisk: Partial<RiskModel>
): Promise<Array<{ fieldName: string; oldValue: string; newValue: string }>> => {
  return trackEntityChanges("risk", oldProjectRisk, newProjectRisk);
};

/**
 * Record creation of a project risk
 * @deprecated Use `recordEntityCreation("risk", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordProjectRiskCreation = async (
  projectRiskId: number,
  changedByUserId: number,
  organizationId: number,
  projectRiskData: Partial<RiskModel>,
  transaction?: Transaction
): Promise<void> => {
  return recordEntityCreation(
    "risk",
    projectRiskId,
    changedByUserId,
    organizationId,
    projectRiskData,
    transaction
  );
};

/**
 * Record deletion of a project risk
 * @deprecated Use `recordEntityDeletion("risk", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordProjectRiskDeletion = async (
  projectRiskId: number,
  changedByUserId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<void> => {
  return recordEntityDeletion(
    "risk",
    projectRiskId,
    changedByUserId,
    organizationId,
    transaction
  );
};
