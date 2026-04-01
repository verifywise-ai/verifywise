/**
 * Vendor Risk Change History Utilities
 *
 * @deprecated This file is deprecated and will be removed in a future version.
 * Use the generic change history functions from `changeHistory.base.utils.ts` directly instead.
 *
 * Migration guide:
 * - Replace `recordVendorRiskChange()` with `recordEntityChange("vendor_risk", ...)`
 * - Replace `recordMultipleFieldChanges()` with `recordMultipleFieldChanges("vendor_risk", ...)`
 * - Replace `getVendorRiskChangeHistory()` with `getEntityChangeHistory("vendor_risk", ...)`
 * - Replace `trackVendorRiskChanges()` with `trackEntityChanges("vendor_risk", ...)`
 * - Replace `recordVendorRiskCreation()` with `recordEntityCreation("vendor_risk", ...)`
 * - Replace `recordVendorRiskDeletion()` with `recordEntityDeletion("vendor_risk", ...)`
 *
 * These wrapper functions are maintained for backward compatibility only.
 */

import { VendorRiskModel } from "../domain.layer/models/vendorRisk/vendorRisk.model";
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
 * Record a change in vendor risk
 * @deprecated Use `recordEntityChange("vendor_risk", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordVendorRiskChange = async (
  vendorRiskId: number,
  action: "created" | "updated" | "deleted",
  changedByUserId: number,
  organizationId: number,
  fieldName?: string,
  oldValue?: string,
  newValue?: string,
  transaction?: Transaction
): Promise<void> => {
  return recordEntityChange(
    "vendor_risk",
    vendorRiskId,
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
 * Record multiple field changes for a vendor risk
 * @deprecated Use `recordMultipleFieldChanges("vendor_risk", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordMultipleFieldChanges = async (
  vendorRiskId: number,
  changedByUserId: number,
  organizationId: number,
  changes: Array<{ fieldName: string; oldValue: string; newValue: string }>,
  transaction?: Transaction
): Promise<void> => {
  return recordMultipleFieldChangesGeneric(
    "vendor_risk",
    vendorRiskId,
    changedByUserId,
    organizationId,
    changes,
    transaction
  );
};

/**
 * Get change history for a specific vendor risk with pagination support
 * @deprecated Use `getEntityChangeHistory("vendor_risk", ...)` from `changeHistory.base.utils.ts` instead
 */
export const getVendorRiskChangeHistory = async (
  vendorRiskId: number,
  organizationId: number,
  limit: number = 100,
  offset: number = 0
): Promise<{ data: any[]; hasMore: boolean; total: number }> => {
  return getEntityChangeHistory(
    "vendor_risk",
    vendorRiskId,
    organizationId,
    limit,
    offset
  );
};

/**
 * Track changes between old and new vendor risk data
 * @deprecated Use `trackEntityChanges("vendor_risk", ...)` from `changeHistory.base.utils.ts` instead
 */
export const trackVendorRiskChanges = async (
  oldModel: VendorRiskModel,
  newModel: Partial<VendorRiskModel>
): Promise<Array<{ fieldName: string; oldValue: string; newValue: string }>> => {
  return trackEntityChanges("vendor_risk", oldModel, newModel);
};

/**
 * Record creation of a vendor risk
 * @deprecated Use `recordEntityCreation("vendor_risk", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordVendorRiskCreation = async (
  vendorRiskId: number,
  changedByUserId: number,
  organizationId: number,
  riskData: Partial<VendorRiskModel>,
  transaction?: Transaction
): Promise<void> => {
  return recordEntityCreation(
    "vendor_risk",
    vendorRiskId,
    changedByUserId,
    organizationId,
    riskData,
    transaction
  );
};

/**
 * Record deletion of a vendor risk
 * @deprecated Use `recordEntityDeletion("vendor_risk", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordVendorRiskDeletion = async (
  vendorRiskId: number,
  changedByUserId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<void> => {
  return recordEntityDeletion(
    "vendor_risk",
    vendorRiskId,
    changedByUserId,
    organizationId,
    transaction
  );
};
