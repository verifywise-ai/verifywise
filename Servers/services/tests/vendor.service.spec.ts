/**
 * @fileoverview Vendor Service Tests
 *
 * Tests for vendor creation and update with validation and change tracking.
 *
 * @module tests/vendor.service
 */

// Mock database BEFORE other imports
jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("../../utils/vendor.utils");
jest.mock("../../utils/vendorChangeHistory.utils");
jest.mock("../../domain.layer/models/vendor/vendor.model");

import { createVendor, updateVendor, CreateVendorInput, ServiceContext } from "../vendor.service";
import { VendorModel } from "../../domain.layer/models/vendor/vendor.model";
import {
  createNewVendorQuery,
  getVendorByIdQuery,
  updateVendorByIdQuery,
} from "../../utils/vendor.utils";
import {
  recordVendorCreation,
  trackVendorChanges,
  recordMultipleFieldChanges,
} from "../../utils/vendorChangeHistory.utils";
import { DatabaseException } from "../../domain.layer/exceptions/custom.exception";

// Cast mocks
const mockCreateNewVendorQuery = createNewVendorQuery as jest.MockedFunction<
  typeof createNewVendorQuery
>;
const mockGetVendorByIdQuery = getVendorByIdQuery as jest.MockedFunction<typeof getVendorByIdQuery>;
const mockUpdateVendorByIdQuery = updateVendorByIdQuery as jest.MockedFunction<
  typeof updateVendorByIdQuery
>;
const mockRecordVendorCreation = recordVendorCreation as jest.MockedFunction<
  typeof recordVendorCreation
>;
const mockTrackVendorChanges = trackVendorChanges as jest.MockedFunction<typeof trackVendorChanges>;
const mockRecordMultipleFieldChanges = recordMultipleFieldChanges as jest.MockedFunction<
  typeof recordMultipleFieldChanges
>;
const mockCreateNewVendor = VendorModel.createNewVendor as jest.MockedFunction<
  typeof VendorModel.createNewVendor
>;

describe("vendor.service", () => {
  const ctx: ServiceContext = { userId: 1, role: "Admin", organizationId: 10 };
  const mockTransaction = {} as any;

  const mockVendorModel = {
    id: 5,
    vendor_name: "Test Vendor",
    validateVendorData: jest.fn().mockResolvedValue(undefined),
    canBeModified: jest.fn(),
    updateVendor: jest.fn().mockResolvedValue(undefined),
  } as any;

  const input: CreateVendorInput = {
    vendor_name: "Test Vendor",
    vendor_provides: "AI services",
    website: "https://vendor.example.com",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateNewVendor.mockResolvedValue(mockVendorModel);
    mockCreateNewVendorQuery.mockResolvedValue(mockVendorModel);
    mockRecordVendorCreation.mockResolvedValue(undefined);
  });

  // ==========================================================================
  // createVendor
  // ==========================================================================

  describe("createVendor", () => {
    it("should create a vendor successfully", async () => {
      const result = await createVendor(input, ctx, mockTransaction);

      expect(result).toBe(mockVendorModel);
      expect(mockCreateNewVendor).toHaveBeenCalled();
      expect(mockVendorModel.validateVendorData).toHaveBeenCalled();
      expect(mockVendorModel.canBeModified).toHaveBeenCalled();
      expect(mockCreateNewVendorQuery).toHaveBeenCalledWith(
        mockVendorModel,
        ctx.organizationId,
        mockTransaction,
      );
    });

    it("should record vendor creation in change history", async () => {
      await createVendor(input, ctx, mockTransaction);

      expect(mockRecordVendorCreation).toHaveBeenCalledWith(
        mockVendorModel.id,
        ctx.userId,
        ctx.organizationId,
        input,
        mockTransaction,
      );
    });

    it("should throw DatabaseException when createNewVendorQuery returns null", async () => {
      mockCreateNewVendorQuery.mockResolvedValue(null as any);

      await expect(createVendor(input, ctx, mockTransaction)).rejects.toThrow(DatabaseException);
    });

    it("should throw DatabaseException when created vendor has no id", async () => {
      mockCreateNewVendorQuery.mockResolvedValue({ id: undefined } as any);

      await expect(createVendor(input, ctx, mockTransaction)).rejects.toThrow(DatabaseException);
    });

    it("should default is_demo to false when not provided", async () => {
      await createVendor(input, ctx, mockTransaction);

      expect(mockCreateNewVendor).toHaveBeenCalledWith(
        input.vendor_name,
        input.vendor_provides,
        undefined, // assignee
        input.website,
        undefined, // vendor_contact_person
        undefined, // review_result
        undefined, // review_status
        undefined, // reviewer
        undefined, // review_date
        undefined, // order_no
        false, // is_demo defaults to false
        undefined, // projects
        undefined, // data_sensitivity
        undefined, // business_criticality
        undefined, // past_issues
        undefined, // regulatory_exposure
        undefined, // risk_score
      );
    });
  });

  // ==========================================================================
  // updateVendor
  // ==========================================================================

  describe("updateVendor", () => {
    const existingVendor = { id: 5, vendor_name: "Old Name" } as any;

    beforeEach(() => {
      mockGetVendorByIdQuery.mockResolvedValue(existingVendor);
      mockTrackVendorChanges.mockResolvedValue([
        { field: "vendor_name", old_value: "Old Name", new_value: "New Name" },
      ] as any);
      mockUpdateVendorByIdQuery.mockResolvedValue(mockVendorModel);
      // Mock VendorModel constructor
      (VendorModel as any).mockImplementation(() => mockVendorModel);
    });

    it("should update a vendor successfully", async () => {
      const updateInput = { vendor_name: "New Name" };
      const result = await updateVendor(5, updateInput, ctx, mockTransaction);

      expect(result).toBe(mockVendorModel);
      expect(mockGetVendorByIdQuery).toHaveBeenCalledWith(5, ctx.organizationId);
      expect(mockVendorModel.updateVendor).toHaveBeenCalled();
      expect(mockVendorModel.validateVendorData).toHaveBeenCalled();
    });

    it("should return null when vendor not found", async () => {
      mockGetVendorByIdQuery.mockResolvedValue(null);

      const result = await updateVendor(999, { vendor_name: "X" }, ctx, mockTransaction);
      expect(result).toBeNull();
    });

    it("should record changes in change history when changes exist", async () => {
      const changes = [{ field: "vendor_name", old_value: "Old", new_value: "New" }];
      mockTrackVendorChanges.mockResolvedValue(changes as any);

      await updateVendor(5, { vendor_name: "New" }, ctx, mockTransaction);

      expect(mockRecordMultipleFieldChanges).toHaveBeenCalledWith(
        5,
        ctx.userId,
        ctx.organizationId,
        changes,
        mockTransaction,
      );
    });

    it("should skip change history recording when no changes detected", async () => {
      mockTrackVendorChanges.mockResolvedValue([]);

      await updateVendor(5, { vendor_name: "Same" }, ctx, mockTransaction);

      expect(mockRecordMultipleFieldChanges).not.toHaveBeenCalled();
    });

    it("should return null when updateVendorByIdQuery returns null", async () => {
      mockUpdateVendorByIdQuery.mockResolvedValue(null as any);

      const result = await updateVendor(5, { vendor_name: "X" }, ctx, mockTransaction);
      expect(result).toBeNull();
    });
  });
});
