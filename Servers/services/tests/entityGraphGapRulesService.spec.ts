/**
 * @fileoverview Entity Graph Gap Rules Service Tests
 *
 * Tests for the EntityGraphGapRulesService class.
 *
 * @module tests/entityGraphGapRulesService
 */

// Mock database BEFORE other imports to prevent actual DB connection
jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(),
    getQueryInterface: jest.fn(() => ({
      tableExists: jest.fn().mockResolvedValue(true),
    })),
  },
}));

// Mock dependencies
jest.mock("../../utils/entityGraphGapRules.utils");
jest.mock("../../domain.layer/models/entityGraphGapRules/entityGraphGapRules.model");
jest.mock("../../utils/logger/logHelper", () => ({
  logFailure: jest.fn(),
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
}));

import { EntityGraphGapRulesService } from "../entityGraphGapRulesService";
import {
  getGapRulesByUserQuery,
  getGapRulesByIdQuery,
  upsertGapRulesQuery,
  deleteGapRulesQuery,
  getDefaultGapRules,
} from "../../utils/entityGraphGapRules.utils";
import { EntityGraphGapRulesModel } from "../../domain.layer/models/entityGraphGapRules/entityGraphGapRules.model";
import {
  ValidationException,
  BusinessLogicException,
} from "../../domain.layer/exceptions/custom.exception";

// Cast mocks
const mockGetGapRulesByUserQuery = getGapRulesByUserQuery as jest.MockedFunction<
  typeof getGapRulesByUserQuery
>;
const mockGetGapRulesByIdQuery = getGapRulesByIdQuery as jest.MockedFunction<
  typeof getGapRulesByIdQuery
>;
const mockUpsertGapRulesQuery = upsertGapRulesQuery as jest.MockedFunction<
  typeof upsertGapRulesQuery
>;
const mockDeleteGapRulesQuery = deleteGapRulesQuery as jest.MockedFunction<
  typeof deleteGapRulesQuery
>;
const mockGetDefaultGapRules = getDefaultGapRules as jest.MockedFunction<
  typeof getDefaultGapRules
>;
const mockCreateGapRules = EntityGraphGapRulesModel.createGapRules as jest.MockedFunction<
  typeof EntityGraphGapRulesModel.createGapRules
>;

describe("EntityGraphGapRulesService", () => {
  const validRule = {
    entityType: "model" as const,
    requirement: "has_risk",
    severity: "warning" as const,
    enabled: true,
  };

  const validGapRulesData = {
    rules: [validRule],
    userId: 1,
    organizationId: 1,
  };

  const defaultRules = [
    { entityType: "model" as const, requirement: "has_risk", severity: "warning" as const, enabled: true },
    { entityType: "risk" as const, requirement: "has_control", severity: "critical" as const, enabled: true },
  ];

  const mockGapRules = {
    id: 1,
    user_id: 1,
    organization_id: 1,
    rules: [validRule],
    isOwnedBy: jest.fn().mockReturnValue(true),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDefaultGapRules.mockReturnValue(defaultRules);
  });

  describe("saveGapRules", () => {
    beforeEach(() => {

      mockCreateGapRules.mockResolvedValue(mockGapRules);
      mockUpsertGapRulesQuery.mockResolvedValue(mockGapRules);
    });

    it("should save gap rules successfully", async () => {
      const result = await EntityGraphGapRulesService.saveGapRules(
        validGapRulesData.rules,
        validGapRulesData.userId,
        validGapRulesData.organizationId
      );

      expect(result).toBe(mockGapRules);
      expect(mockCreateGapRules).toHaveBeenCalled();
      expect(mockUpsertGapRulesQuery).toHaveBeenCalled();
    });

    it("should throw ValidationException for non-array rules", async () => {
      await expect(
        EntityGraphGapRulesService.saveGapRules(
          "not-an-array" as any,
          validGapRulesData.userId,
          validGapRulesData.organizationId
        )
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException when rules exceed 50", async () => {
      const tooManyRules = Array(51).fill(validRule);

      await expect(
        EntityGraphGapRulesService.saveGapRules(
          tooManyRules,
          validGapRulesData.userId,
          validGapRulesData.organizationId
        )
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for missing entityType", async () => {
      const invalidRule = { ...validRule, entityType: undefined } as any;

      await expect(
        EntityGraphGapRulesService.saveGapRules(
          [invalidRule],
          validGapRulesData.userId,
          validGapRulesData.organizationId
        )
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid entityType", async () => {
      const invalidRule = { ...validRule, entityType: "invalid" as any };

      await expect(
        EntityGraphGapRulesService.saveGapRules(
          [invalidRule],
          validGapRulesData.userId,
          validGapRulesData.organizationId
        )
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for empty requirement", async () => {
      const invalidRule = { ...validRule, requirement: "" };

      await expect(
        EntityGraphGapRulesService.saveGapRules(
          [invalidRule],
          validGapRulesData.userId,
          validGapRulesData.organizationId
        )
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for missing severity", async () => {
      const invalidRule = { ...validRule, severity: undefined } as any;

      await expect(
        EntityGraphGapRulesService.saveGapRules(
          [invalidRule],
          validGapRulesData.userId,
          validGapRulesData.organizationId
        )
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid severity", async () => {
      const invalidRule = { ...validRule, severity: "invalid" as any };

      await expect(
        EntityGraphGapRulesService.saveGapRules(
          [invalidRule],
          validGapRulesData.userId,
          validGapRulesData.organizationId
        )
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for non-boolean enabled", async () => {
      const invalidRule = { ...validRule, enabled: "true" } as any;

      await expect(
        EntityGraphGapRulesService.saveGapRules(
          [invalidRule],
          validGapRulesData.userId,
          validGapRulesData.organizationId
        )
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid userId", async () => {
      await expect(
        EntityGraphGapRulesService.saveGapRules(
          validGapRulesData.rules,
          0,
          validGapRulesData.organizationId
        )
      ).rejects.toThrow(ValidationException);
    });

    it("should accept empty rules array", async () => {
      await EntityGraphGapRulesService.saveGapRules(
        [],
        validGapRulesData.userId,
        validGapRulesData.organizationId
      );

      expect(mockCreateGapRules).toHaveBeenCalled();
    });

    it("should validate all entity types", async () => {
      const validTypes = ["model", "risk", "control", "vendor", "useCase"];
      const rules = validTypes.map((entityType) => ({
        ...validRule,
        entityType: entityType as any,
      }));

      await EntityGraphGapRulesService.saveGapRules(
        rules,
        validGapRulesData.userId,
        validGapRulesData.organizationId
      );

      expect(mockCreateGapRules).toHaveBeenCalled();
    });

    it("should validate all severity levels", async () => {
      const validSeverities = ["critical", "warning", "info"];
      const rules = validSeverities.map((severity) => ({
        ...validRule,
        severity: severity as any,
      }));

      await EntityGraphGapRulesService.saveGapRules(
        rules,
        validGapRulesData.userId,
        validGapRulesData.organizationId
      );

      expect(mockCreateGapRules).toHaveBeenCalled();
    });
  });

  describe("getGapRules", () => {
    beforeEach(() => {

    });

    it("should return user's custom rules when they exist", async () => {
      mockGetGapRulesByUserQuery.mockResolvedValue(mockGapRules);

      const result = await EntityGraphGapRulesService.getGapRules(
        validGapRulesData.userId,
        validGapRulesData.organizationId
      );

      expect(result).toEqual({
        rules: mockGapRules.rules,
        isDefault: false,
        id: mockGapRules.id,
      });
    });

    it("should return default rules when user has no custom rules", async () => {
      mockGetGapRulesByUserQuery.mockResolvedValue(null);

      const result = await EntityGraphGapRulesService.getGapRules(
        validGapRulesData.userId,
        validGapRulesData.organizationId
      );

      expect(result).toEqual({
        rules: defaultRules,
        isDefault: true,
      });
    });

    it("should ensure table exists before fetching", async () => {
      mockGetGapRulesByUserQuery.mockResolvedValue(mockGapRules);

      await EntityGraphGapRulesService.getGapRules(
        validGapRulesData.userId,
        validGapRulesData.organizationId
      );

    });
  });

  describe("resetToDefaults", () => {
    beforeEach(() => {

      mockDeleteGapRulesQuery.mockResolvedValue(1);
    });

    it("should delete custom rules and return defaults", async () => {
      mockGetGapRulesByUserQuery.mockResolvedValue(mockGapRules);

      const result = await EntityGraphGapRulesService.resetToDefaults(
        validGapRulesData.userId,
        validGapRulesData.organizationId
      );

      expect(mockDeleteGapRulesQuery).toHaveBeenCalledWith(
        mockGapRules.id,
        validGapRulesData.organizationId
      );
      expect(result).toEqual({
        rules: defaultRules,
        isDefault: true,
      });
    });

    it("should return defaults even when no custom rules exist", async () => {
      mockGetGapRulesByUserQuery.mockResolvedValue(null);

      const result = await EntityGraphGapRulesService.resetToDefaults(
        validGapRulesData.userId,
        validGapRulesData.organizationId
      );

      expect(mockDeleteGapRulesQuery).not.toHaveBeenCalled();
      expect(result).toEqual({
        rules: defaultRules,
        isDefault: true,
      });
    });
  });

  describe("deleteGapRules", () => {
    beforeEach(() => {

      mockGetGapRulesByIdQuery.mockResolvedValue(mockGapRules);
      mockDeleteGapRulesQuery.mockResolvedValue(1);
      mockGapRules.isOwnedBy.mockReturnValue(true);
    });

    it("should delete gap rules successfully", async () => {
      const result = await EntityGraphGapRulesService.deleteGapRules(
        1,
        validGapRulesData.userId,
        validGapRulesData.organizationId
      );

      expect(result).toBe(true);
      expect(mockDeleteGapRulesQuery).toHaveBeenCalledWith(
        1,
        validGapRulesData.organizationId
      );
    });

    it("should throw error when gap rules not found", async () => {
      mockGetGapRulesByIdQuery.mockResolvedValue(null);

      await expect(
        EntityGraphGapRulesService.deleteGapRules(
          999,
          validGapRulesData.userId,
          validGapRulesData.organizationId
        )
      ).rejects.toThrow("Gap rules with ID 999 not found");
    });

    it("should throw BusinessLogicException when user does not own gap rules", async () => {
      mockGapRules.isOwnedBy.mockReturnValue(false);

      await expect(
        EntityGraphGapRulesService.deleteGapRules(
          1,
          999,
          validGapRulesData.organizationId
        )
      ).rejects.toThrow(BusinessLogicException);
    });

    it("should throw error when delete fails", async () => {
      mockDeleteGapRulesQuery.mockResolvedValue(0);

      await expect(
        EntityGraphGapRulesService.deleteGapRules(
          1,
          validGapRulesData.userId,
          validGapRulesData.organizationId
        )
      ).rejects.toThrow("Failed to delete gap rules with ID 1");
    });
  });

  describe("getDefaults", () => {
    it("should return default gap rules", () => {
      const result = EntityGraphGapRulesService.getDefaults();

      expect(result).toEqual(defaultRules);
      expect(mockGetDefaultGapRules).toHaveBeenCalled();
    });
  });
});
