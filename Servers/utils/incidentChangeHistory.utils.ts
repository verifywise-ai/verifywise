/**
 * Incident Change History Utilities
 *
 * @deprecated This file is deprecated and will be removed in a future version.
 * Use the generic change history functions from `changeHistory.base.utils.ts` directly instead.
 *
 * Migration guide:
 * - Replace `recordIncidentChange()` with `recordEntityChange("incident", ...)`
 * - Replace `recordMultipleFieldChanges()` with `recordMultipleFieldChanges("incident", ...)`
 * - Replace `getIncidentChangeHistory()` with `getEntityChangeHistory("incident", ...)`
 * - Replace `trackIncidentChanges()` with `trackEntityChanges("incident", ...)`
 * - Replace `recordIncidentCreation()` with `recordEntityCreation("incident", ...)`
 * - Replace `recordIncidentDeletion()` with `recordEntityDeletion("incident", ...)`
 *
 * These wrapper functions are maintained for backward compatibility only.
 */

import { IAIIncidentManagement } from "../domain.layer/interfaces/i.aiIncidentManagement";
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
 * Record a change in incident
 * @deprecated Use `recordEntityChange("incident", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordIncidentChange = async (
  incidentId: number,
  action: "created" | "updated" | "deleted",
  changedByUserId: number,
  organizationId: number,
  fieldName?: string,
  oldValue?: string,
  newValue?: string,
  transaction?: Transaction
): Promise<void> => {
  return recordEntityChange(
    "incident",
    incidentId,
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
 * Record multiple field changes for an incident
 * @deprecated Use `recordMultipleFieldChanges("incident", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordMultipleFieldChanges = async (
  incidentId: number,
  changedByUserId: number,
  organizationId: number,
  changes: Array<{ fieldName: string; oldValue: string; newValue: string }>,
  transaction?: Transaction
): Promise<void> => {
  return recordMultipleFieldChangesGeneric(
    "incident",
    incidentId,
    changedByUserId,
    organizationId,
    changes,
    transaction
  );
};

/**
 * Get change history for a specific incident with pagination support
 * @deprecated Use `getEntityChangeHistory("incident", ...)` from `changeHistory.base.utils.ts` instead
 */
export const getIncidentChangeHistory = async (
  incidentId: number,
  organizationId: number,
  limit: number = 100,
  offset: number = 0
): Promise<{ data: any[]; hasMore: boolean; total: number }> => {
  return getEntityChangeHistory(
    "incident",
    incidentId,
    organizationId,
    limit,
    offset
  );
};

/**
 * Track changes between old and new incident data
 * @deprecated Use `trackEntityChanges("incident", ...)` from `changeHistory.base.utils.ts` instead
 */
export const trackIncidentChanges = async (
  oldModel: IAIIncidentManagement,
  newModel: Partial<IAIIncidentManagement>
): Promise<Array<{ fieldName: string; oldValue: string; newValue: string }>> => {
  return trackEntityChanges("incident", oldModel, newModel);
};

/**
 * Record creation of an incident
 * @deprecated Use `recordEntityCreation("incident", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordIncidentCreation = async (
  incidentId: number,
  changedByUserId: number,
  organizationId: number,
  incidentData: Partial<IAIIncidentManagement>,
  transaction?: Transaction
): Promise<void> => {
  return recordEntityCreation(
    "incident",
    incidentId,
    changedByUserId,
    organizationId,
    incidentData,
    transaction
  );
};

/**
 * Record deletion of an incident
 * @deprecated Use `recordEntityDeletion("incident", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordIncidentDeletion = async (
  incidentId: number,
  changedByUserId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<void> => {
  return recordEntityDeletion(
    "incident",
    incidentId,
    changedByUserId,
    organizationId,
    transaction
  );
};
