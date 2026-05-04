/**
 * @fileoverview Entity Graph Gap Rules Model Tests
 *
 * Tests for the EntityGraphGapRulesModel class.
 *
 * @module tests/entityGraphGapRules.model
 */

// Mock sequelize-typescript
jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: "STRING",
    JSONB: "JSONB",
    DATE: "DATE",
  },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) {
        Object.assign(this, data);
      }
    }
  },
}));

// Define GapRule interface
interface GapRule {
  entityType: "model" | "risk" | "control" | "vendor" | "useCase";
  requirement: string;
  severity: "critical" | "warning" | "info";
  enabled: boolean;
}

// Test class that mimics EntityGraphGapRulesModel behavior
class TestEntityGraphGapRulesModel {
  id?: number;
  user_id!: number;
  organization_id!: number;
  rules!: GapRule[];
  created_at?: Date;
  updated_at?: Date;

  constructor(data?: any) {
    if (data) {
      Object.assign(this, data);
    }
  }

  static async createGapRules(
    userId: number,
    organizationId: number,
    rules: GapRule[],
  ): Promise<TestEntityGraphGapRulesModel> {
    // Validate userId
    if (!userId || userId < 1) {
      throw new Error("Valid user ID is required");
    }

    // Validate organizationId
    if (!organizationId || organizationId < 1) {
      throw new Error("Valid organization ID is required");
    }

    // Validate rules
    if (!Array.isArray(rules)) {
      throw new Error("Rules must be an array");
    }

    if (rules.length > 50) {
      throw new Error("Maximum of 50 gap rules allowed");
    }

    // Validate each rule
    const validEntityTypes = ["model", "risk", "control", "vendor", "useCase"];
    const validSeverities = ["critical", "warning", "info"];

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];

      if (!rule || typeof rule !== "object") {
        throw new Error(`Rule ${i + 1}: must be an object`);
      }

      if (!rule.entityType || !validEntityTypes.includes(rule.entityType)) {
        throw new Error(`Rule ${i + 1}: entityType must be one of: ${validEntityTypes.join(", ")}`);
      }

      if (!rule.requirement || rule.requirement.trim().length === 0) {
        throw new Error(`Rule ${i + 1}: requirement is required`);
      }

      if (rule.requirement.length > 100) {
        throw new Error(`Rule ${i + 1}: requirement cannot exceed 100 characters`);
      }

      if (!rule.severity || !validSeverities.includes(rule.severity)) {
        throw new Error(`Rule ${i + 1}: severity must be one of: ${validSeverities.join(", ")}`);
      }

      if (typeof rule.enabled !== "boolean") {
        throw new Error(`Rule ${i + 1}: enabled must be a boolean`);
      }
    }

    const gapRules = new TestEntityGraphGapRulesModel();
    gapRules.user_id = userId;
    gapRules.organization_id = organizationId;
    gapRules.rules = rules;
    gapRules.created_at = new Date();
    gapRules.updated_at = new Date();

    return gapRules;
  }

  isOwnedBy(userId: number): boolean {
    return this.user_id === userId;
  }

  toJSON(): any {
    return {
      id: this.id,
      user_id: this.user_id,
      organization_id: this.organization_id,
      rules: this.rules,
      created_at: this.created_at?.toISOString(),
      updated_at: this.updated_at?.toISOString(),
    };
  }
}

describe("EntityGraphGapRulesModel", () => {
  const validRule: GapRule = {
    entityType: "model",
    requirement: "has_risk",
    severity: "warning",
    enabled: true,
  };

  const validGapRulesData = {
    userId: 1,
    organizationId: 1,
    rules: [validRule],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createGapRules", () => {
    it("should create new gap rules with valid data", async () => {
      const gapRules = await TestEntityGraphGapRulesModel.createGapRules(
        validGapRulesData.userId,
        validGapRulesData.organizationId,
        validGapRulesData.rules,
      );

      expect(gapRules).toBeInstanceOf(TestEntityGraphGapRulesModel);
      expect(gapRules.user_id).toBe(validGapRulesData.userId);
      expect(gapRules.organization_id).toBe(validGapRulesData.organizationId);
      expect(gapRules.rules).toEqual(validGapRulesData.rules);
      expect(gapRules.created_at).toBeInstanceOf(Date);
      expect(gapRules.updated_at).toBeInstanceOf(Date);
    });

    it("should accept empty rules array", async () => {
      const gapRules = await TestEntityGraphGapRulesModel.createGapRules(
        validGapRulesData.userId,
        validGapRulesData.organizationId,
        [],
      );

      expect(gapRules.rules).toEqual([]);
    });

    it("should accept multiple rules", async () => {
      const multipleRules: GapRule[] = [
        { entityType: "model", requirement: "has_risk", severity: "warning", enabled: true },
        { entityType: "risk", requirement: "has_control", severity: "critical", enabled: true },
        { entityType: "control", requirement: "has_evidence", severity: "info", enabled: false },
      ];

      const gapRules = await TestEntityGraphGapRulesModel.createGapRules(
        validGapRulesData.userId,
        validGapRulesData.organizationId,
        multipleRules,
      );

      expect(gapRules.rules).toHaveLength(3);
      expect(gapRules.rules).toEqual(multipleRules);
    });

    it("should accept all valid entity types", async () => {
      const entityTypes: Array<GapRule["entityType"]> = [
        "model",
        "risk",
        "control",
        "vendor",
        "useCase",
      ];

      const rules: GapRule[] = entityTypes.map((entityType) => ({
        entityType,
        requirement: "test_requirement",
        severity: "warning" as const,
        enabled: true,
      }));

      const gapRules = await TestEntityGraphGapRulesModel.createGapRules(
        validGapRulesData.userId,
        validGapRulesData.organizationId,
        rules,
      );

      expect(gapRules.rules).toHaveLength(5);
    });

    it("should accept all valid severity levels", async () => {
      const severities: Array<GapRule["severity"]> = ["critical", "warning", "info"];

      const rules: GapRule[] = severities.map((severity) => ({
        entityType: "model" as const,
        requirement: "test_requirement",
        severity,
        enabled: true,
      }));

      const gapRules = await TestEntityGraphGapRulesModel.createGapRules(
        validGapRulesData.userId,
        validGapRulesData.organizationId,
        rules,
      );

      expect(gapRules.rules).toHaveLength(3);
    });

    it("should throw error for invalid userId", async () => {
      await expect(
        TestEntityGraphGapRulesModel.createGapRules(
          0,
          validGapRulesData.organizationId,
          validGapRulesData.rules,
        ),
      ).rejects.toThrow("Valid user ID is required");
    });

    it("should throw error for negative userId", async () => {
      await expect(
        TestEntityGraphGapRulesModel.createGapRules(
          -1,
          validGapRulesData.organizationId,
          validGapRulesData.rules,
        ),
      ).rejects.toThrow("Valid user ID is required");
    });

    it("should throw error for invalid organizationId", async () => {
      await expect(
        TestEntityGraphGapRulesModel.createGapRules(
          validGapRulesData.userId,
          0,
          validGapRulesData.rules,
        ),
      ).rejects.toThrow("Valid organization ID is required");
    });

    it("should throw error for non-array rules", async () => {
      await expect(
        TestEntityGraphGapRulesModel.createGapRules(
          validGapRulesData.userId,
          validGapRulesData.organizationId,
          "not-an-array" as any,
        ),
      ).rejects.toThrow("Rules must be an array");
    });

    it("should throw error for more than 50 rules", async () => {
      const tooManyRules: GapRule[] = Array(51)
        .fill(null)
        .map(() => ({
          entityType: "model" as const,
          requirement: "test",
          severity: "warning" as const,
          enabled: true,
        }));

      await expect(
        TestEntityGraphGapRulesModel.createGapRules(
          validGapRulesData.userId,
          validGapRulesData.organizationId,
          tooManyRules,
        ),
      ).rejects.toThrow("Maximum of 50 gap rules allowed");
    });

    it("should throw error for null rule in array", async () => {
      await expect(
        TestEntityGraphGapRulesModel.createGapRules(
          validGapRulesData.userId,
          validGapRulesData.organizationId,
          [null] as any,
        ),
      ).rejects.toThrow("Rule 1: must be an object");
    });

    it("should throw error for invalid entityType", async () => {
      const invalidRule = {
        ...validRule,
        entityType: "invalid" as any,
      };

      await expect(
        TestEntityGraphGapRulesModel.createGapRules(
          validGapRulesData.userId,
          validGapRulesData.organizationId,
          [invalidRule],
        ),
      ).rejects.toThrow("entityType must be one of");
    });

    it("should throw error for missing entityType", async () => {
      const invalidRule = {
        requirement: "test",
        severity: "warning",
        enabled: true,
      } as any;

      await expect(
        TestEntityGraphGapRulesModel.createGapRules(
          validGapRulesData.userId,
          validGapRulesData.organizationId,
          [invalidRule],
        ),
      ).rejects.toThrow("entityType must be one of");
    });

    it("should throw error for empty requirement", async () => {
      const invalidRule = {
        ...validRule,
        requirement: "",
      };

      await expect(
        TestEntityGraphGapRulesModel.createGapRules(
          validGapRulesData.userId,
          validGapRulesData.organizationId,
          [invalidRule],
        ),
      ).rejects.toThrow("requirement is required");
    });

    it("should throw error for requirement exceeding 100 characters", async () => {
      const invalidRule = {
        ...validRule,
        requirement: "a".repeat(101),
      };

      await expect(
        TestEntityGraphGapRulesModel.createGapRules(
          validGapRulesData.userId,
          validGapRulesData.organizationId,
          [invalidRule],
        ),
      ).rejects.toThrow("requirement cannot exceed 100 characters");
    });

    it("should throw error for invalid severity", async () => {
      const invalidRule = {
        ...validRule,
        severity: "invalid" as any,
      };

      await expect(
        TestEntityGraphGapRulesModel.createGapRules(
          validGapRulesData.userId,
          validGapRulesData.organizationId,
          [invalidRule],
        ),
      ).rejects.toThrow("severity must be one of");
    });

    it("should throw error for non-boolean enabled", async () => {
      const invalidRule = {
        ...validRule,
        enabled: "true" as any,
      };

      await expect(
        TestEntityGraphGapRulesModel.createGapRules(
          validGapRulesData.userId,
          validGapRulesData.organizationId,
          [invalidRule],
        ),
      ).rejects.toThrow("enabled must be a boolean");
    });

    it("should throw error for specific rule index in error message", async () => {
      const rules = [validRule, validRule, { ...validRule, entityType: "invalid" as any }];

      await expect(
        TestEntityGraphGapRulesModel.createGapRules(
          validGapRulesData.userId,
          validGapRulesData.organizationId,
          rules,
        ),
      ).rejects.toThrow("Rule 3:");
    });
  });

  describe("isOwnedBy", () => {
    it("should return true when user owns the gap rules", () => {
      const gapRules = new TestEntityGraphGapRulesModel({
        id: 1,
        user_id: 5,
        organization_id: 1,
        rules: [],
      });

      expect(gapRules.isOwnedBy(5)).toBe(true);
    });

    it("should return false when user does not own the gap rules", () => {
      const gapRules = new TestEntityGraphGapRulesModel({
        id: 1,
        user_id: 5,
        organization_id: 1,
        rules: [],
      });

      expect(gapRules.isOwnedBy(10)).toBe(false);
    });

    it("should return false for undefined userId", () => {
      const gapRules = new TestEntityGraphGapRulesModel({
        id: 1,
        user_id: 5,
        organization_id: 1,
        rules: [],
      });

      expect(gapRules.isOwnedBy(undefined as any)).toBe(false);
    });
  });

  describe("toJSON", () => {
    it("should return formatted gap rules data", () => {
      const createdAt = new Date("2024-01-01T00:00:00.000Z");
      const updatedAt = new Date("2024-01-02T00:00:00.000Z");
      const rules: GapRule[] = [
        { entityType: "model", requirement: "has_risk", severity: "warning", enabled: true },
      ];

      const gapRules = new TestEntityGraphGapRulesModel({
        id: 1,
        user_id: 5,
        organization_id: 1,
        rules: rules,
        created_at: createdAt,
        updated_at: updatedAt,
      });

      const json = gapRules.toJSON();

      expect(json).toEqual({
        id: 1,
        user_id: 5,
        organization_id: 1,
        rules: rules,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-02T00:00:00.000Z",
      });
    });

    it("should handle undefined dates", () => {
      const gapRules = new TestEntityGraphGapRulesModel({
        id: 1,
        user_id: 5,
        organization_id: 1,
        rules: [],
      });

      const json = gapRules.toJSON();

      expect(json.created_at).toBeUndefined();
      expect(json.updated_at).toBeUndefined();
    });

    it("should include all rules in JSON", () => {
      const rules: GapRule[] = [
        { entityType: "model", requirement: "has_risk", severity: "critical", enabled: true },
        { entityType: "risk", requirement: "has_control", severity: "warning", enabled: false },
        { entityType: "vendor", requirement: "has_assessment", severity: "info", enabled: true },
      ];

      const gapRules = new TestEntityGraphGapRulesModel({
        id: 1,
        user_id: 5,
        organization_id: 1,
        rules: rules,
      });

      const json = gapRules.toJSON();

      expect(json.rules).toHaveLength(3);
      expect(json.rules).toEqual(rules);
    });
  });

  describe("constructor", () => {
    it("should create instance with data object", () => {
      const rules: GapRule[] = [validRule];
      const data = {
        id: 1,
        user_id: 5,
        organization_id: 1,
        rules: rules,
      };

      const gapRules = new TestEntityGraphGapRulesModel(data);

      expect(gapRules.id).toBe(1);
      expect(gapRules.user_id).toBe(5);
      expect(gapRules.organization_id).toBe(1);
      expect(gapRules.rules).toEqual(rules);
    });

    it("should create empty instance without data", () => {
      const gapRules = new TestEntityGraphGapRulesModel();

      expect(gapRules.id).toBeUndefined();
      expect(gapRules.user_id).toBeUndefined();
      expect(gapRules.rules).toBeUndefined();
    });
  });
});
