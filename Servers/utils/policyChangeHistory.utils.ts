/**
 * Policy Change History Utilities
 *
 * @deprecated This file is deprecated and will be removed in a future version.
 * Use the generic change history functions from `changeHistory.base.utils.ts` directly instead.
 *
 * Migration guide:
 * - Replace `recordPolicyChange()` with `recordEntityChange("policy", ...)`
 * - Replace `recordMultipleFieldChanges()` with `recordMultipleFieldChanges("policy", ...)`
 * - Replace `getPolicyChangeHistory()` with `getEntityChangeHistory("policy", ...)`
 * - Replace `trackPolicyChanges()` with `trackEntityChanges("policy", ...)`
 * - Replace `recordPolicyCreation()` with `recordEntityCreation("policy", ...)`
 * - Replace `recordPolicyDeletion()` with `recordEntityDeletion("policy", ...)`
 *
 * These wrapper functions are maintained for backward compatibility only.
 */

import { IPolicy } from "../domain.layer/interfaces/i.policy";
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
 * Record a change in policy
 * @deprecated Use `recordEntityChange("policy", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordPolicyChange = async (
  policyId: number,
  action: "created" | "updated" | "deleted",
  changedByUserId: number,
  organizationId: number,
  fieldName?: string,
  oldValue?: string,
  newValue?: string,
  transaction?: Transaction
): Promise<void> => {
  return recordEntityChange(
    "policy",
    policyId,
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
 * Record multiple field changes for a policy
 * @deprecated Use `recordMultipleFieldChanges("policy", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordMultipleFieldChanges = async (
  policyId: number,
  changedByUserId: number,
  organizationId: number,
  changes: Array<{ fieldName: string; oldValue: string; newValue: string }>,
  transaction?: Transaction
): Promise<void> => {
  return recordMultipleFieldChangesGeneric(
    "policy",
    policyId,
    changedByUserId,
    organizationId,
    changes,
    transaction
  );
};

/**
 * Get change history for a specific policy with pagination support
 * @deprecated Use `getEntityChangeHistory("policy", ...)` from `changeHistory.base.utils.ts` instead
 */
export const getPolicyChangeHistory = async (
  policyId: number,
  organizationId: number,
  limit: number = 100,
  offset: number = 0
): Promise<{ data: any[]; hasMore: boolean; total: number }> => {
  return getEntityChangeHistory(
    "policy",
    policyId,
    organizationId,
    limit,
    offset
  );
};

/**
 * Track changes between old and new policy data
 * @deprecated Use `trackEntityChanges("policy", ...)` from `changeHistory.base.utils.ts` instead
 */
export const trackPolicyChanges = async (
  oldModel: IPolicy,
  newModel: Partial<IPolicy>
): Promise<Array<{ fieldName: string; oldValue: string; newValue: string }>> => {
  return trackEntityChanges("policy", oldModel, newModel);
};

/**
 * Record creation of a policy
 * @deprecated Use `recordEntityCreation("policy", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordPolicyCreation = async (
  policyId: number,
  changedByUserId: number,
  organizationId: number,
  policyData: Partial<IPolicy>,
  transaction?: Transaction
): Promise<void> => {
  return recordEntityCreation(
    "policy",
    policyId,
    changedByUserId,
    organizationId,
    policyData,
    transaction
  );
};

/**
 * Record deletion of a policy
 * @deprecated Use `recordEntityDeletion("policy", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordPolicyDeletion = async (
  policyId: number,
  changedByUserId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<void> => {
  return recordEntityDeletion(
    "policy",
    policyId,
    changedByUserId,
    organizationId,
    transaction
  );
};
