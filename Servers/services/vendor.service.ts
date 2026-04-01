/**
 * @fileoverview Vendor Service Layer
 *
 * Business logic for vendor operations, separated from controller layer.
 * Handles validation, change tracking, and orchestrates database operations.
 *
 * @module services/vendor
 */

import { Transaction } from "sequelize";
import { VendorModel } from "../domain.layer/models/vendor/vendor.model";
import { DatabaseException } from "../domain.layer/exceptions/custom.exception";
import {
  createNewVendorQuery,
  getVendorByIdQuery,
  updateVendorByIdQuery,
} from "../utils/vendor.utils";
import {
  recordVendorCreation,
  trackVendorChanges,
  recordMultipleFieldChanges,
} from "../utils/vendorChangeHistory.utils";

// ============================================================================
// Types
// ============================================================================

export interface CreateVendorInput {
  vendor_name: string;
  vendor_provides?: string;
  assignee?: number;
  website?: string;
  vendor_contact_person?: string;
  review_result?: string;
  review_status?: string;
  reviewer?: number;
  review_date?: string;
  order_no?: number;
  is_demo?: boolean;
  projects?: number[];
  data_sensitivity?: string;
  business_criticality?: string;
  past_issues?: string;
  regulatory_exposure?: string;
  risk_score?: number;
}

export interface UpdateVendorInput extends Partial<CreateVendorInput> {}

export interface ServiceContext {
  userId: number;
  role: string;
  organizationId: number;
}

// ============================================================================
// Create Vendor
// ============================================================================

/**
 * Creates a new vendor with validation and change tracking.
 *
 * @param input - The vendor data to create
 * @param ctx - Service context containing userId, role, and organizationId
 * @param transaction - Database transaction for atomicity
 * @returns The created vendor model
 * @throws {DatabaseException} If vendor creation fails
 */
export async function createVendor(
  input: CreateVendorInput,
  ctx: ServiceContext,
  transaction: Transaction
): Promise<VendorModel> {
  // Create vendor model with validation
  const vendorModel = await VendorModel.createNewVendor(
    input.vendor_name,
    input.vendor_provides,
    input.assignee,
    input.website,
    input.vendor_contact_person,
    input.review_result,
    input.review_status,
    input.reviewer,
    input.review_date,
    input.order_no,
    input.is_demo || false,
    input.projects,
    input.data_sensitivity,
    input.business_criticality,
    input.past_issues,
    input.regulatory_exposure,
    input.risk_score
  );

  // Validate vendor data
  await vendorModel.validateVendorData();

  // Check demo restrictions
  vendorModel.canBeModified();

  // Persist to database
  const createdVendor = await createNewVendorQuery(
    vendorModel,
    ctx.organizationId,
    transaction
  );

  if (!createdVendor || createdVendor.id === undefined) {
    throw new DatabaseException("Failed to create vendor");
  }

  // Record creation in change history
  await recordVendorCreation(
    createdVendor.id,
    ctx.userId,
    ctx.organizationId,
    input,
    transaction
  );

  return createdVendor;
}

// ============================================================================
// Update Vendor
// ============================================================================

/**
 * Updates an existing vendor with validation and change tracking.
 *
 * @param vendorId - The ID of the vendor to update
 * @param input - The vendor data to update (partial)
 * @param ctx - Service context containing userId, role, and organizationId
 * @param transaction - Database transaction for atomicity
 * @returns The updated vendor model or null if not found
 */
export async function updateVendor(
  vendorId: number,
  input: UpdateVendorInput,
  ctx: ServiceContext,
  transaction: Transaction
): Promise<VendorModel | null> {
  // Find existing vendor
  const existingVendor = await getVendorByIdQuery(vendorId, ctx.organizationId);

  if (!existingVendor) {
    return null;
  }

  // Create model instance from existing data
  const vendorModel = new VendorModel(existingVendor);

  // Track changes before updating
  const changes = await trackVendorChanges(vendorModel, input);

  // Apply updates
  await vendorModel.updateVendor({
    vendor_name: input.vendor_name,
    vendor_provides: input.vendor_provides,
    assignee: input.assignee,
    website: input.website,
    vendor_contact_person: input.vendor_contact_person,
    review_result: input.review_result,
    review_status: input.review_status,
    reviewer: input.reviewer,
    review_date: input.review_date,
    order_no: input.order_no,
    projects: input.projects,
    data_sensitivity: input.data_sensitivity,
    business_criticality: input.business_criticality,
    past_issues: input.past_issues,
    regulatory_exposure: input.regulatory_exposure,
    risk_score: input.risk_score,
  });

  // Validate updated data
  await vendorModel.validateVendorData();

  // Persist changes
  const updatedVendor = await updateVendorByIdQuery(
    {
      id: vendorId,
      vendor: vendorModel,
      userId: ctx.userId,
      role: ctx.role,
      transaction,
    },
    ctx.organizationId
  );

  if (!updatedVendor) {
    return null;
  }

  // Record changes in change history
  if (changes.length > 0) {
    await recordMultipleFieldChanges(
      vendorId,
      ctx.userId,
      ctx.organizationId,
      changes,
      transaction
    );
  }

  return updatedVendor;
}
