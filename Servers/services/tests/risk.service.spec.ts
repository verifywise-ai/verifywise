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
  updateRiskService,
  CreateRiskServiceInput,
  CreateRiskServiceContext,
} from "../risk.service";
import { createRiskQuery, updateRiskByIdQuery } from "../../utils/risk.utils";
import {
  recordProjectRiskCreation,
  trackProjectRiskChanges,
} from "../../utils/projectRiskChangeHistory.utils";
import { computeDerivedFields } from "../../utils/quantitativeRisk.utils";
import { validateQuantitativeRiskFields } from "../../utils/validations/quantitativeRiskValidation.utils";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

// Cast mocks
const mockUpdateRiskByIdQuery = updateRiskByIdQuery as jest.MockedFunction<
  typeof updateRiskByIdQuery
>;
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

  describe("server-computed risk levels", () => {
    describe("createRiskService", () => {
      it("ignores a client risk_level_autocalculated and stores the computed level", async () => {
        await createRiskService(
          {
            ...baseInput,
            likelihood: "Rare",
            severity: "Negligible",
            risk_level_autocalculated: "Very high risk",
          } as any,
          ctx,
          mockTransaction,
        );
        expect(mockCreateRiskQuery).toHaveBeenCalledWith(
          expect.objectContaining({ risk_level_autocalculated: "No risk" }),
          ctx.organizationId,
          mockTransaction,
        );
      });

      it("stores null when likelihood or severity is missing", async () => {
        await createRiskService(
          { ...baseInput, risk_level_autocalculated: "High risk" } as any,
          ctx,
          mockTransaction,
        );
        expect(mockCreateRiskQuery).toHaveBeenCalledWith(
          expect.objectContaining({ risk_level_autocalculated: null }),
          ctx.organizationId,
          mockTransaction,
        );
      });

      it("computes final_risk_level from likelihood_mitigation and risk_severity (Critical = 5)", async () => {
        await createRiskService(
          {
            ...baseInput,
            likelihood_mitigation: "Almost Certain",
            risk_severity: "Critical",
            final_risk_level: "Low risk",
          } as any,
          ctx,
          mockTransaction,
        );
        expect(mockCreateRiskQuery).toHaveBeenCalledWith(
          expect.objectContaining({ final_risk_level: "Very high risk" }),
          ctx.organizationId,
          mockTransaction,
        );
      });

      it("stores null final_risk_level when the residual inputs are missing", async () => {
        await createRiskService(
          { ...baseInput, final_risk_level: "Low risk" } as any,
          ctx,
          mockTransaction,
        );
        expect(mockCreateRiskQuery).toHaveBeenCalledWith(
          expect.objectContaining({ final_risk_level: null }),
          ctx.organizationId,
          mockTransaction,
        );
      });
    });

    describe("updateRiskService", () => {
      const existing = {
        id: 42,
        likelihood: "Likely",
        severity: "Major",
        risk_level_autocalculated: "Very high risk",
        likelihood_mitigation: "Rare",
        risk_severity: "Negligible",
        final_risk_level: "No risk",
      } as any;

      const writtenArg = (): Record<string, unknown> =>
        mockUpdateRiskByIdQuery.mock.calls[0][1] as Record<string, unknown>;

      beforeEach(() => {
        mockUpdateRiskByIdQuery.mockResolvedValue(mockRisk);
        (trackProjectRiskChanges as jest.Mock).mockResolvedValue([]);
      });

      it("recomputes from sent likelihood and severity, ignoring a client level", async () => {
        await updateRiskService(
          42,
          {
            likelihood: "Rare",
            severity: "Negligible",
            risk_level_autocalculated: "Very high risk",
          } as any,
          existing,
          ctx,
          mockTransaction,
        );
        expect(writtenArg().risk_level_autocalculated).toBe("No risk");
      });

      it("leaves the level alone when neither likelihood nor severity is sent", async () => {
        await updateRiskService(
          42,
          { risk_name: "Renamed", risk_level_autocalculated: "Low risk" } as any,
          existing,
          ctx,
          mockTransaction,
        );
        expect("risk_level_autocalculated" in writtenArg()).toBe(false);
      });

      it("recomputes from the stored likelihood when only severity is sent", async () => {
        await updateRiskService(
          42,
          { severity: "Negligible" } as any,
          existing,
          ctx,
          mockTransaction,
        );
        // Likely (4) + 3 * Negligible (1) = 7
        expect(writtenArg().risk_level_autocalculated).toBe("Low risk");
      });

      it("recomputes from the stored severity when only likelihood is sent", async () => {
        await updateRiskService(42, { likelihood: "Rare" } as any, existing, ctx, mockTransaction);
        // Rare (1) + 3 * Major (4) = 13
        expect(writtenArg().risk_level_autocalculated).toBe("High risk");
      });

      it("clears the level when a merged input is null", async () => {
        await updateRiskService(
          42,
          { severity: "Negligible", risk_level_autocalculated: "High risk" } as any,
          { ...existing, likelihood: null },
          ctx,
          mockTransaction,
        );
        expect(writtenArg().risk_level_autocalculated).toBeNull();
      });

      it("clears the level when likelihood is explicitly sent as null or empty", async () => {
        await updateRiskService(42, { likelihood: null } as any, existing, ctx, mockTransaction);
        expect(writtenArg().risk_level_autocalculated).toBeNull();
        mockUpdateRiskByIdQuery.mockClear();
        await updateRiskService(42, { severity: "" } as any, existing, ctx, mockTransaction);
        expect(writtenArg().risk_level_autocalculated).toBeNull();
      });

      it("clears final_risk_level when a residual input is explicitly cleared", async () => {
        await updateRiskService(
          42,
          { likelihood_mitigation: null } as any,
          existing,
          ctx,
          mockTransaction,
        );
        expect(writtenArg().final_risk_level).toBeNull();
      });

      it("does not write a level for an unrecognised non-null label", async () => {
        await updateRiskService(
          42,
          { likelihood: "Sometimes" } as any,
          existing,
          ctx,
          mockTransaction,
        );
        expect("risk_level_autocalculated" in writtenArg()).toBe(false);
        mockUpdateRiskByIdQuery.mockClear();
        await updateRiskService(
          42,
          { risk_severity: "Huge" } as any,
          existing,
          ctx,
          mockTransaction,
        );
        expect("final_risk_level" in writtenArg()).toBe(false);
      });

      it("recomputes final_risk_level from sent residual severity and stored mitigation likelihood", async () => {
        await updateRiskService(
          42,
          { risk_severity: "Critical" } as any,
          existing,
          ctx,
          mockTransaction,
        );
        // Rare (1) + 3 * 5 = 16
        expect(writtenArg().final_risk_level).toBe("High risk");
      });

      it("ignores a client final_risk_level and leaves it when no residual input is sent", async () => {
        await updateRiskService(
          42,
          { final_risk_level: "Very high risk" } as any,
          existing,
          ctx,
          mockTransaction,
        );
        expect("final_risk_level" in writtenArg()).toBe(false);
      });
    });
  });
});
