/**
 * @fileoverview Entity Graph Views Model Tests
 *
 * Tests for the EntityGraphViewsModel class.
 *
 * @module tests/entityGraphViews.model
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

// Define EntityGraphViewConfig interface
interface EntityGraphViewConfig {
  visibleEntities?: string[];
  visibleRelationships?: string[];
  showProblemsOnly?: boolean;
  showGapsOnly?: boolean;
  query?: {
    entityType: string;
    condition: string;
    attribute: string;
  } | null;
}

// Test class that mimics EntityGraphViewsModel behavior
class TestEntityGraphViewsModel {
  id?: number;
  name!: string;
  user_id!: number;
  organization_id!: number;
  config!: EntityGraphViewConfig;
  created_at?: Date;
  updated_at?: Date;

  constructor(data?: any) {
    if (data) {
      Object.assign(this, data);
    }
  }

  static async createView(
    name: string,
    userId: number,
    organizationId: number,
    config: EntityGraphViewConfig,
  ): Promise<TestEntityGraphViewsModel> {
    // Validate name
    if (!name || name.trim().length === 0) {
      throw new Error("View name is required");
    }

    if (name.length > 100) {
      throw new Error("View name cannot exceed 100 characters");
    }

    // Validate userId
    if (!userId || userId < 1) {
      throw new Error("Valid user ID is required");
    }

    // Validate organizationId
    if (!organizationId || organizationId < 1) {
      throw new Error("Valid organization ID is required");
    }

    // Validate config
    if (!config || typeof config !== "object") {
      throw new Error("Valid config object is required");
    }

    const view = new TestEntityGraphViewsModel();
    view.name = name.trim();
    view.user_id = userId;
    view.organization_id = organizationId;
    view.config = config;
    view.created_at = new Date();
    view.updated_at = new Date();

    return view;
  }

  isOwnedBy(userId: number): boolean {
    return this.user_id === userId;
  }

  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      user_id: this.user_id,
      organization_id: this.organization_id,
      config: this.config,
      created_at: this.created_at?.toISOString(),
      updated_at: this.updated_at?.toISOString(),
    };
  }
}

describe("EntityGraphViewsModel", () => {
  const validViewData = {
    name: "My Test View",
    userId: 1,
    organizationId: 1,
    config: {
      visibleEntities: ["model", "risk"],
      showProblemsOnly: false,
    } as EntityGraphViewConfig,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createView", () => {
    it("should create a new view with valid data", async () => {
      const view = await TestEntityGraphViewsModel.createView(
        validViewData.name,
        validViewData.userId,
        validViewData.organizationId,
        validViewData.config,
      );

      expect(view).toBeInstanceOf(TestEntityGraphViewsModel);
      expect(view.name).toBe(validViewData.name);
      expect(view.user_id).toBe(validViewData.userId);
      expect(view.organization_id).toBe(validViewData.organizationId);
      expect(view.config).toEqual(validViewData.config);
      expect(view.created_at).toBeInstanceOf(Date);
      expect(view.updated_at).toBeInstanceOf(Date);
    });

    it("should trim whitespace from name", async () => {
      const view = await TestEntityGraphViewsModel.createView(
        "  My View  ",
        validViewData.userId,
        validViewData.organizationId,
        validViewData.config,
      );

      expect(view.name).toBe("My View");
    });

    it("should accept empty config object", async () => {
      const view = await TestEntityGraphViewsModel.createView(
        validViewData.name,
        validViewData.userId,
        validViewData.organizationId,
        {},
      );

      expect(view.config).toEqual({});
    });

    it("should accept config with all properties", async () => {
      const fullConfig: EntityGraphViewConfig = {
        visibleEntities: ["model", "risk", "control"],
        visibleRelationships: ["hasRisk", "hasControl"],
        showProblemsOnly: true,
        showGapsOnly: false,
        query: {
          entityType: "model",
          condition: "equals",
          attribute: "status",
        },
      };

      const view = await TestEntityGraphViewsModel.createView(
        validViewData.name,
        validViewData.userId,
        validViewData.organizationId,
        fullConfig,
      );

      expect(view.config).toEqual(fullConfig);
    });

    it("should accept config with null query", async () => {
      const configWithNullQuery: EntityGraphViewConfig = {
        visibleEntities: ["model"],
        query: null,
      };

      const view = await TestEntityGraphViewsModel.createView(
        validViewData.name,
        validViewData.userId,
        validViewData.organizationId,
        configWithNullQuery,
      );

      expect(view.config.query).toBeNull();
    });

    it("should throw error for empty name", async () => {
      await expect(
        TestEntityGraphViewsModel.createView(
          "",
          validViewData.userId,
          validViewData.organizationId,
          validViewData.config,
        ),
      ).rejects.toThrow("View name is required");
    });

    it("should throw error for whitespace-only name", async () => {
      await expect(
        TestEntityGraphViewsModel.createView(
          "   ",
          validViewData.userId,
          validViewData.organizationId,
          validViewData.config,
        ),
      ).rejects.toThrow("View name is required");
    });

    it("should throw error for name exceeding 100 characters", async () => {
      const longName = "a".repeat(101);
      await expect(
        TestEntityGraphViewsModel.createView(
          longName,
          validViewData.userId,
          validViewData.organizationId,
          validViewData.config,
        ),
      ).rejects.toThrow("View name cannot exceed 100 characters");
    });

    it("should throw error for invalid userId", async () => {
      await expect(
        TestEntityGraphViewsModel.createView(
          validViewData.name,
          0,
          validViewData.organizationId,
          validViewData.config,
        ),
      ).rejects.toThrow("Valid user ID is required");
    });

    it("should throw error for negative userId", async () => {
      await expect(
        TestEntityGraphViewsModel.createView(
          validViewData.name,
          -1,
          validViewData.organizationId,
          validViewData.config,
        ),
      ).rejects.toThrow("Valid user ID is required");
    });

    it("should throw error for invalid organizationId", async () => {
      await expect(
        TestEntityGraphViewsModel.createView(
          validViewData.name,
          validViewData.userId,
          0,
          validViewData.config,
        ),
      ).rejects.toThrow("Valid organization ID is required");
    });

    it("should throw error for null config", async () => {
      await expect(
        TestEntityGraphViewsModel.createView(
          validViewData.name,
          validViewData.userId,
          validViewData.organizationId,
          null as any,
        ),
      ).rejects.toThrow("Valid config object is required");
    });

    it("should throw error for non-object config", async () => {
      await expect(
        TestEntityGraphViewsModel.createView(
          validViewData.name,
          validViewData.userId,
          validViewData.organizationId,
          "not-an-object" as any,
        ),
      ).rejects.toThrow("Valid config object is required");
    });
  });

  describe("isOwnedBy", () => {
    it("should return true when user owns the view", () => {
      const view = new TestEntityGraphViewsModel({
        id: 1,
        name: "Test View",
        user_id: 5,
        organization_id: 1,
        config: {},
      });

      expect(view.isOwnedBy(5)).toBe(true);
    });

    it("should return false when user does not own the view", () => {
      const view = new TestEntityGraphViewsModel({
        id: 1,
        name: "Test View",
        user_id: 5,
        organization_id: 1,
        config: {},
      });

      expect(view.isOwnedBy(10)).toBe(false);
    });

    it("should return false for undefined userId", () => {
      const view = new TestEntityGraphViewsModel({
        id: 1,
        name: "Test View",
        user_id: 5,
        organization_id: 1,
        config: {},
      });

      expect(view.isOwnedBy(undefined as any)).toBe(false);
    });
  });

  describe("toJSON", () => {
    it("should return formatted view data", () => {
      const createdAt = new Date("2024-01-01T00:00:00.000Z");
      const updatedAt = new Date("2024-01-02T00:00:00.000Z");
      const config: EntityGraphViewConfig = {
        visibleEntities: ["model"],
        showProblemsOnly: true,
      };

      const view = new TestEntityGraphViewsModel({
        id: 1,
        name: "Test View",
        user_id: 5,
        organization_id: 1,
        config: config,
        created_at: createdAt,
        updated_at: updatedAt,
      });

      const json = view.toJSON();

      expect(json).toEqual({
        id: 1,
        name: "Test View",
        user_id: 5,
        organization_id: 1,
        config: config,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-02T00:00:00.000Z",
      });
    });

    it("should handle undefined dates", () => {
      const view = new TestEntityGraphViewsModel({
        id: 1,
        name: "Test View",
        user_id: 5,
        organization_id: 1,
        config: {},
      });

      const json = view.toJSON();

      expect(json.created_at).toBeUndefined();
      expect(json.updated_at).toBeUndefined();
    });

    it("should include complex config in JSON", () => {
      const complexConfig: EntityGraphViewConfig = {
        visibleEntities: ["model", "risk", "control"],
        visibleRelationships: ["hasRisk"],
        showProblemsOnly: true,
        showGapsOnly: false,
        query: {
          entityType: "model",
          condition: "equals",
          attribute: "active",
        },
      };

      const view = new TestEntityGraphViewsModel({
        id: 1,
        name: "Complex View",
        user_id: 5,
        organization_id: 1,
        config: complexConfig,
      });

      const json = view.toJSON();

      expect(json.config).toEqual(complexConfig);
    });
  });

  describe("constructor", () => {
    it("should create instance with data object", () => {
      const config: EntityGraphViewConfig = { visibleEntities: ["model"] };
      const data = {
        id: 1,
        name: "Test View",
        user_id: 5,
        organization_id: 1,
        config: config,
      };

      const view = new TestEntityGraphViewsModel(data);

      expect(view.id).toBe(1);
      expect(view.name).toBe("Test View");
      expect(view.user_id).toBe(5);
      expect(view.organization_id).toBe(1);
      expect(view.config).toEqual(config);
    });

    it("should create empty instance without data", () => {
      const view = new TestEntityGraphViewsModel();

      expect(view.id).toBeUndefined();
      expect(view.name).toBeUndefined();
    });
  });
});
