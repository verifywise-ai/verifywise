/**
 * Vendor Change History Utilities
 *
 * @deprecated This file is deprecated and will be removed in a future version.
 * Use the generic change history functions from `changeHistory.base.utils.ts` directly instead.
 *
 * Migration guide:
 * - Replace `recordVendorChange()` with `recordEntityChange("vendor", ...)`
 * - Replace `recordMultipleFieldChanges()` with `recordMultipleFieldChanges("vendor", ...)`
 * - Replace `getVendorChangeHistory()` with `getEntityChangeHistory("vendor", ...)`
 * - Replace `trackVendorChanges()` with `trackEntityChanges("vendor", ...)`
 * - Replace `recordVendorCreation()` with `recordEntityCreation("vendor", ...)`
 * - Replace `recordVendorDeletion()` with `recordEntityDeletion("vendor", ...)`
 *
 * These wrapper functions are maintained for backward compatibility only.
 */

import { VendorModel } from "../domain.layer/models/vendor/vendor.model";
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
 * Record a change in vendor
 * @deprecated Use `recordEntityChange("vendor", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordVendorChange = async (
  vendorId: number,
  action: "created" | "updated" | "deleted",
  changedByUserId: number,
  organizationId: number,
  fieldName?: string,
  oldValue?: string,
  newValue?: string,
  transaction?: Transaction
): Promise<void> => {
  return recordEntityChange(
    "vendor",
    vendorId,
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
 * Record multiple field changes for a vendor
 * @deprecated Use `recordMultipleFieldChanges("vendor", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordMultipleFieldChanges = async (
  vendorId: number,
  changedByUserId: number,
  organizationId: number,
  changes: Array<{ fieldName: string; oldValue: string; newValue: string }>,
  transaction?: Transaction
): Promise<void> => {
  return recordMultipleFieldChangesGeneric(
    "vendor",
    vendorId,
    changedByUserId,
    organizationId,
    changes,
    transaction
  );
};

/**
 * Get change history for a specific vendor with pagination support
 * @deprecated Use `getEntityChangeHistory("vendor", ...)` from `changeHistory.base.utils.ts` instead
 */
export const getVendorChangeHistory = async (
  vendorId: number,
  organizationId: number,
  limit: number = 100,
  offset: number = 0
): Promise<{ data: any[]; hasMore: boolean; total: number }> => {
  return getEntityChangeHistory(
    "vendor",
    vendorId,
    organizationId,
    limit,
    offset
  );
};

/**
 * Track changes between old and new vendor data
 * @deprecated Use `trackEntityChanges("vendor", ...)` from `changeHistory.base.utils.ts` instead
 */
export const trackVendorChanges = async (
  oldVendor: VendorModel,
  newVendor: Partial<VendorModel>
): Promise<Array<{ fieldName: string; oldValue: string; newValue: string }>> => {
  return trackEntityChanges("vendor", oldVendor, newVendor);
};

/**
 * Record creation of a vendor
 * @deprecated Use `recordEntityCreation("vendor", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordVendorCreation = async (
  vendorId: number,
  changedByUserId: number,
  organizationId: number,
  vendorData: Partial<VendorModel>,
  transaction?: Transaction
): Promise<void> => {
  return recordEntityCreation(
    "vendor",
    vendorId,
    changedByUserId,
    organizationId,
    vendorData,
    transaction
  );
};

/**
 * Record deletion of a vendor
 * @deprecated Use `recordEntityDeletion("vendor", ...)` from `changeHistory.base.utils.ts` instead
 */
export const recordVendorDeletion = async (
  vendorId: number,
  changedByUserId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<void> => {
  return recordEntityDeletion(
    "vendor",
    vendorId,
    changedByUserId,
    organizationId,
    transaction
  );
};
