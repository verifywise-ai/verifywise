/**
 * @fileoverview Risk Service Tests
 *
 * Tests for createRiskService business logic: normalization,
 * FAIR validation, derived fields, and change history.
 *
 * @module tests/risk.service
 */

// Mock database BEFORE other imports
jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("../../utils/risk.utils");
jest.mock("../../utils/projectRiskChangeHistory.utils");
jest.mock("../../utils/quantitativeRisk.utils");
jest.mock("../../utils/validations/quantitativeRiskValidation.utils");
jest.mock("../../domain.layer/models/risks/risk.model");

import {
  createRiskService,
  CreateRiskServiceInput,
  CreateRiskServiceContext,
} from "../risk.service";
import { createRiskQuery } from "../../utils/risk.utils";
import { recordProjectRiskCreation } from "../../utils/projectRiskChangeHistory.utils";
import { computeDerivedFields } from "../../utils/quantitativeRisk.utils";
import { validateQuantitativeRiskFields } from "../../utils/validations/quantitativeRiskValidation.utils";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

// Cast mocks
const mockCreateRiskQuery = createRiskQuery as jest.MockedFunction<typeof createRiskQuery>;
const mockRecordCreation = recordProjectRiskCreation as jest.MockedFunction<
  typeof recordProjectRiskCreation
>;
const mockComputeDerived = computeDerivedFields as jest.MockedFunction<typeof computeDerivedFields>;
const mockValidateFAIR = validateQuantitativeRiskFields as jest.MockedFunction<
  typeof validateQuantitativeRiskFields
>;

describe("risk.service", () => {
  const ctx: CreateRiskServiceContext = { userId: 1, organizationId: 10 };
  const mockTransaction = {} as any;

  const baseInput: CreateRiskServiceInput = {
    risk_name: "Test Risk",
    risk_description: "A test risk",
    risk_owner: 5,
    projects: [1],
    frameworks: [2],
  };

  const mockRisk = { id: 42, risk_name: "Test Risk" } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateRiskQuery.mockResolvedValue(mockRisk);
    mockRecordCreation.mockResolvedValue(undefined);
    mockValidateFAIR.mockReturnValue([]);
    mockComputeDerived.mockReturnValue({});
  });

  describe("createRiskService", () => {
    it("should create a risk successfully", async () => {
      const result = await createRiskService(baseInput, ctx, mockTransaction);

      expect(result).toBe(mockRisk);
      expect(mockCreateRiskQuery).toHaveBeenCalledWith(
        expect.objectContaining({ risk_name: "Test Risk" }),
        ctx.organizationId,
        mockTransaction,
      );
    });

    it("should record creation in change history", async () => {
      await createRiskService(baseInput, ctx, mockTransaction);

      expect(mockRecordCreation).toHaveBeenCalledWith(
        mockRisk.id,
        ctx.userId,
        ctx.organizationId,
        expect.objectContaining({ risk_name: "Test Risk" }),
        mockTransaction,
      );
    });

    it("should normalize risk_owner 0 to null", async () => {
      const input = { ...baseInput, risk_owner: 0 };
      await createRiskService(input, ctx, mockTransaction);

      expect(mockCreateRiskQuery).toHaveBeenCalledWith(
        expect.objectContaining({ risk_owner: null }),
        ctx.organizationId,
        mockTransaction,
      );
    });

    it("should normalize falsy risk_owner to null", async () => {
      const input = { ...baseInput, risk_owner: undefined };
      await createRiskService(input, ctx, mockTransaction);

      expect(mockCreateRiskQuery).toHaveBeenCalledWith(
        expect.objectContaining({ risk_owner: null }),
        ctx.organizationId,
        mockTransaction,
      );
    });

    it("should keep valid risk_owner as number", async () => {
      await createRiskService(baseInput, ctx, mockTransaction);

      expect(mockCreateRiskQuery).toHaveBeenCalledWith(
        expect.objectContaining({ risk_owner: 5 }),
        ctx.organizationId,
        mockTransaction,
      );
    });

    it("should trigger FAIR validation when event_frequency_min is present", async () => {
      const input = { ...baseInput, event_frequency_min: 1 };
      await createRiskService(input, ctx, mockTransaction);

      expect(mockValidateFAIR).toHaveBeenCalled();
      expect(mockComputeDerived).toHaveBeenCalled();
    });

    it("should trigger FAIR validation when ale_estimate is present", async () => {
      const input = { ...baseInput, ale_estimate: 1000 };
      await createRiskService(input, ctx, mockTransaction);

      expect(mockValidateFAIR).toHaveBeenCalled();
    });

    it("should throw ValidationException on FAIR validation errors", async () => {
      mockValidateFAIR.mockReturnValue([
        { field: "event_frequency_min", message: "min > max", code: "INVALID_RANGE" },
        { field: "loss_regulatory_min", message: "negative value", code: "NEGATIVE_VALUE" },
      ]);
      const input = { ...baseInput, event_frequency_min: 1 };

      await expect(createRiskService(input, ctx, mockTransaction)).rejects.toThrow(
        ValidationException,
      );
    });

    it("should apply computed derived fields", async () => {
      mockComputeDerived.mockReturnValue({ ale_estimate: 5000, total_loss_likely: 2500 });
      const input = { ...baseInput, event_frequency_min: 1 };

      await createRiskService(input, ctx, mockTransaction);

      expect(mockCreateRiskQuery).toHaveBeenCalledWith(
        expect.objectContaining({ ale_estimate: 5000, total_loss_likely: 2500 }),
        ctx.organizationId,
        mockTransaction,
      );
    });

    it("should default null fallbacks for missing optional fields", async () => {
      const minInput: CreateRiskServiceInput = { risk_name: "Minimal" };
      await createRiskService(minInput, ctx, mockTransaction);

      const calledWith = mockCreateRiskQuery.mock.calls[0][0] as any;
      expect(calledWith.risk_description).toBeNull();
      expect(calledWith.risk_owner).toBeNull();
      expect(calledWith.risk_category).toEqual([]);
      expect(calledWith.is_demo).toBe(false);
      expect(calledWith.currency).toBe("USD");
      expect(calledWith.projects).toEqual([]);
      expect(calledWith.frameworks).toEqual([]);
    });

    it("should throw when createRiskQuery returns null", async () => {
      mockCreateRiskQuery.mockResolvedValue(null as any);

      await expect(createRiskService(baseInput, ctx, mockTransaction)).rejects.toThrow(
        "createRiskQuery returned null",
      );
    });

    it("should skip FAIR validation when no quantitative fields present", async () => {
      await createRiskService(baseInput, ctx, mockTransaction);

      expect(mockValidateFAIR).not.toHaveBeenCalled();
      expect(mockComputeDerived).not.toHaveBeenCalled();
    });
  });
});
