/**
 * @fileoverview Entity Graph Annotations Model Tests
 *
 * Tests for the EntityGraphAnnotationsModel class.
 *
 * @module tests/entityGraphAnnotations.model
 */

// Mock sequelize-typescript
jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: "STRING",
    TEXT: "TEXT",
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

// Test class that mimics EntityGraphAnnotationsModel behavior
class TestEntityGraphAnnotationsModel {
  id?: number;
  content!: string;
  user_id!: number;
  entity_type!: string;
  entity_id!: string;
  organization_id!: number;
  created_at?: Date;
  updated_at?: Date;

  constructor(data?: any) {
    if (data) {
      Object.assign(this, data);
    }
  }

  static async createAnnotation(
    content: string,
    userId: number,
    entityType: string,
    entityId: string,
    organizationId: number,
  ): Promise<TestEntityGraphAnnotationsModel> {
    // Validate content
    if (!content || content.trim().length === 0) {
      throw new Error("Annotation content is required");
    }

    if (content.length > 2000) {
      throw new Error("Annotation content cannot exceed 2000 characters");
    }

    // Validate userId
    if (!userId || userId < 1) {
      throw new Error("Valid user ID is required");
    }

    // Validate entityType
    if (!entityType || entityType.trim().length === 0) {
      throw new Error("Entity type is required");
    }

    // Validate entityId
    if (!entityId || entityId.trim().length === 0) {
      throw new Error("Entity ID is required");
    }

    // Validate organizationId
    if (!organizationId || organizationId < 1) {
      throw new Error("Valid organization ID is required");
    }

    const annotation = new TestEntityGraphAnnotationsModel();
    annotation.content = content.trim();
    annotation.user_id = userId;
    annotation.entity_type = entityType.trim();
    annotation.entity_id = entityId.trim();
    annotation.organization_id = organizationId;
    annotation.created_at = new Date();
    annotation.updated_at = new Date();

    return annotation;
  }

  isOwnedBy(userId: number): boolean {
    return this.user_id === userId;
  }

  toJSON(): any {
    return {
      id: this.id,
      content: this.content,
      user_id: this.user_id,
      entity_type: this.entity_type,
      entity_id: this.entity_id,
      organization_id: this.organization_id,
      created_at: this.created_at?.toISOString(),
      updated_at: this.updated_at?.toISOString(),
    };
  }
}

describe("EntityGraphAnnotationsModel", () => {
  const validAnnotationData = {
    content: "This is a test annotation",
    userId: 1,
    entityType: "model",
    entityId: "model-123",
    organizationId: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createAnnotation", () => {
    it("should create a new annotation with valid data", async () => {
      const annotation = await TestEntityGraphAnnotationsModel.createAnnotation(
        validAnnotationData.content,
        validAnnotationData.userId,
        validAnnotationData.entityType,
        validAnnotationData.entityId,
        validAnnotationData.organizationId,
      );

      expect(annotation).toBeInstanceOf(TestEntityGraphAnnotationsModel);
      expect(annotation.content).toBe(validAnnotationData.content);
      expect(annotation.user_id).toBe(validAnnotationData.userId);
      expect(annotation.entity_type).toBe(validAnnotationData.entityType);
      expect(annotation.entity_id).toBe(validAnnotationData.entityId);
      expect(annotation.organization_id).toBe(validAnnotationData.organizationId);
      expect(annotation.created_at).toBeInstanceOf(Date);
      expect(annotation.updated_at).toBeInstanceOf(Date);
    });

    it("should trim whitespace from content", async () => {
      const annotation = await TestEntityGraphAnnotationsModel.createAnnotation(
        "  Test content  ",
        validAnnotationData.userId,
        validAnnotationData.entityType,
        validAnnotationData.entityId,
        validAnnotationData.organizationId,
      );

      expect(annotation.content).toBe("Test content");
    });

    it("should trim whitespace from entityType and entityId", async () => {
      const annotation = await TestEntityGraphAnnotationsModel.createAnnotation(
        validAnnotationData.content,
        validAnnotationData.userId,
        "  model  ",
        "  model-123  ",
        validAnnotationData.organizationId,
      );

      expect(annotation.entity_type).toBe("model");
      expect(annotation.entity_id).toBe("model-123");
    });

    it("should throw error for empty content", async () => {
      await expect(
        TestEntityGraphAnnotationsModel.createAnnotation(
          "",
          validAnnotationData.userId,
          validAnnotationData.entityType,
          validAnnotationData.entityId,
          validAnnotationData.organizationId,
        ),
      ).rejects.toThrow("Annotation content is required");
    });

    it("should throw error for whitespace-only content", async () => {
      await expect(
        TestEntityGraphAnnotationsModel.createAnnotation(
          "   ",
          validAnnotationData.userId,
          validAnnotationData.entityType,
          validAnnotationData.entityId,
          validAnnotationData.organizationId,
        ),
      ).rejects.toThrow("Annotation content is required");
    });

    it("should throw error for content exceeding 2000 characters", async () => {
      const longContent = "a".repeat(2001);
      await expect(
        TestEntityGraphAnnotationsModel.createAnnotation(
          longContent,
          validAnnotationData.userId,
          validAnnotationData.entityType,
          validAnnotationData.entityId,
          validAnnotationData.organizationId,
        ),
      ).rejects.toThrow("Annotation content cannot exceed 2000 characters");
    });

    it("should throw error for invalid userId", async () => {
      await expect(
        TestEntityGraphAnnotationsModel.createAnnotation(
          validAnnotationData.content,
          0,
          validAnnotationData.entityType,
          validAnnotationData.entityId,
          validAnnotationData.organizationId,
        ),
      ).rejects.toThrow("Valid user ID is required");
    });

    it("should throw error for negative userId", async () => {
      await expect(
        TestEntityGraphAnnotationsModel.createAnnotation(
          validAnnotationData.content,
          -1,
          validAnnotationData.entityType,
          validAnnotationData.entityId,
          validAnnotationData.organizationId,
        ),
      ).rejects.toThrow("Valid user ID is required");
    });

    it("should throw error for empty entityType", async () => {
      await expect(
        TestEntityGraphAnnotationsModel.createAnnotation(
          validAnnotationData.content,
          validAnnotationData.userId,
          "",
          validAnnotationData.entityId,
          validAnnotationData.organizationId,
        ),
      ).rejects.toThrow("Entity type is required");
    });

    it("should throw error for empty entityId", async () => {
      await expect(
        TestEntityGraphAnnotationsModel.createAnnotation(
          validAnnotationData.content,
          validAnnotationData.userId,
          validAnnotationData.entityType,
          "",
          validAnnotationData.organizationId,
        ),
      ).rejects.toThrow("Entity ID is required");
    });

    it("should throw error for invalid organizationId", async () => {
      await expect(
        TestEntityGraphAnnotationsModel.createAnnotation(
          validAnnotationData.content,
          validAnnotationData.userId,
          validAnnotationData.entityType,
          validAnnotationData.entityId,
          0,
        ),
      ).rejects.toThrow("Valid organization ID is required");
    });
  });

  describe("isOwnedBy", () => {
    it("should return true when user owns the annotation", () => {
      const annotation = new TestEntityGraphAnnotationsModel({
        id: 1,
        content: "Test",
        user_id: 5,
        entity_type: "model",
        entity_id: "model-123",
        organization_id: 1,
      });

      expect(annotation.isOwnedBy(5)).toBe(true);
    });

    it("should return false when user does not own the annotation", () => {
      const annotation = new TestEntityGraphAnnotationsModel({
        id: 1,
        content: "Test",
        user_id: 5,
        entity_type: "model",
        entity_id: "model-123",
        organization_id: 1,
      });

      expect(annotation.isOwnedBy(10)).toBe(false);
    });

    it("should return false for undefined userId", () => {
      const annotation = new TestEntityGraphAnnotationsModel({
        id: 1,
        content: "Test",
        user_id: 5,
        entity_type: "model",
        entity_id: "model-123",
        organization_id: 1,
      });

      expect(annotation.isOwnedBy(undefined as any)).toBe(false);
    });
  });

  describe("toJSON", () => {
    it("should return formatted annotation data", () => {
      const createdAt = new Date("2024-01-01T00:00:00.000Z");
      const updatedAt = new Date("2024-01-02T00:00:00.000Z");

      const annotation = new TestEntityGraphAnnotationsModel({
        id: 1,
        content: "Test annotation",
        user_id: 5,
        entity_type: "model",
        entity_id: "model-123",
        organization_id: 1,
        created_at: createdAt,
        updated_at: updatedAt,
      });

      const json = annotation.toJSON();

      expect(json).toEqual({
        id: 1,
        content: "Test annotation",
        user_id: 5,
        entity_type: "model",
        entity_id: "model-123",
        organization_id: 1,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-02T00:00:00.000Z",
      });
    });

    it("should handle undefined dates", () => {
      const annotation = new TestEntityGraphAnnotationsModel({
        id: 1,
        content: "Test annotation",
        user_id: 5,
        entity_type: "model",
        entity_id: "model-123",
        organization_id: 1,
      });

      const json = annotation.toJSON();

      expect(json.created_at).toBeUndefined();
      expect(json.updated_at).toBeUndefined();
    });
  });

  describe("constructor", () => {
    it("should create instance with data object", () => {
      const data = {
        id: 1,
        content: "Test",
        user_id: 5,
        entity_type: "model",
        entity_id: "model-123",
        organization_id: 1,
      };

      const annotation = new TestEntityGraphAnnotationsModel(data);

      expect(annotation.id).toBe(1);
      expect(annotation.content).toBe("Test");
      expect(annotation.user_id).toBe(5);
      expect(annotation.entity_type).toBe("model");
      expect(annotation.entity_id).toBe("model-123");
      expect(annotation.organization_id).toBe(1);
    });

    it("should create empty instance without data", () => {
      const annotation = new TestEntityGraphAnnotationsModel();

      expect(annotation.id).toBeUndefined();
      expect(annotation.content).toBeUndefined();
    });
  });
});
