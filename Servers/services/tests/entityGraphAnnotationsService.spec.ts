/**
 * @fileoverview Entity Graph Annotations Service Tests
 *
 * Tests for the EntityGraphAnnotationsService class.
 *
 * @module tests/entityGraphAnnotationsService
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
jest.mock("../../utils/entityGraphAnnotations.utils");
jest.mock("../../domain.layer/models/entityGraphAnnotations/entityGraphAnnotations.model");
jest.mock("../../utils/entityGraphSecurity.utils");
jest.mock("../../utils/logger/logHelper", () => ({
  logFailure: jest.fn(),
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
}));

import { EntityGraphAnnotationsService } from "../entityGraphAnnotationsService";
import {
  getAnnotationsByUserQuery,
  getAnnotationByEntityQuery,
  getAnnotationByIdQuery,
  upsertAnnotationQuery,
  deleteAnnotationByIdQuery,
  deleteAnnotationByEntityQuery,
} from "../../utils/entityGraphAnnotations.utils";
import { EntityGraphAnnotationsModel } from "../../domain.layer/models/entityGraphAnnotations/entityGraphAnnotations.model";
import {
  isValidEntityType,
  isValidEntityId,
  sanitizeAnnotationContent,
} from "../../utils/entityGraphSecurity.utils";
import {
  ValidationException,
  BusinessLogicException,
} from "../../domain.layer/exceptions/custom.exception";

// Cast mocks
const mockGetAnnotationsByUserQuery = getAnnotationsByUserQuery as jest.MockedFunction<
  typeof getAnnotationsByUserQuery
>;
const mockGetAnnotationByEntityQuery = getAnnotationByEntityQuery as jest.MockedFunction<
  typeof getAnnotationByEntityQuery
>;
const mockGetAnnotationByIdQuery = getAnnotationByIdQuery as jest.MockedFunction<
  typeof getAnnotationByIdQuery
>;
const mockUpsertAnnotationQuery = upsertAnnotationQuery as jest.MockedFunction<
  typeof upsertAnnotationQuery
>;
const mockDeleteAnnotationByIdQuery = deleteAnnotationByIdQuery as jest.MockedFunction<
  typeof deleteAnnotationByIdQuery
>;
const mockDeleteAnnotationByEntityQuery = deleteAnnotationByEntityQuery as jest.MockedFunction<
  typeof deleteAnnotationByEntityQuery
>;
const mockIsValidEntityType = isValidEntityType as jest.MockedFunction<
  typeof isValidEntityType
>;
const mockIsValidEntityId = isValidEntityId as jest.MockedFunction<
  typeof isValidEntityId
>;
const mockSanitizeAnnotationContent = sanitizeAnnotationContent as jest.MockedFunction<
  typeof sanitizeAnnotationContent
>;
const mockCreateAnnotation = EntityGraphAnnotationsModel.createAnnotation as jest.MockedFunction<
  typeof EntityGraphAnnotationsModel.createAnnotation
>;

describe("EntityGraphAnnotationsService", () => {
  const validAnnotationData = {
    content: "Test annotation content",
    userId: 1,
    entityType: "model",
    entityId: "model-123",
    organizationId: 1,
  };

  const mockAnnotation = {
    id: 1,
    content: "Test annotation content",
    user_id: 1,
    entity_type: "model",
    entity_id: "model-123",
    organization_id: 1,
    isOwnedBy: jest.fn().mockReturnValue(true),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default successful validations
    mockSanitizeAnnotationContent.mockReturnValue({
      valid: true,
      sanitized: "Test annotation content",
    });
    mockIsValidEntityType.mockReturnValue(true);
    mockIsValidEntityId.mockReturnValue(true);
  });

  describe("saveAnnotation", () => {
    beforeEach(() => {

      mockCreateAnnotation.mockResolvedValue(mockAnnotation);
      mockUpsertAnnotationQuery.mockResolvedValue(mockAnnotation);
    });

    it("should save annotation successfully", async () => {
      const result = await EntityGraphAnnotationsService.saveAnnotation(
        validAnnotationData.content,
        validAnnotationData.userId,
        validAnnotationData.entityType,
        validAnnotationData.entityId,
        validAnnotationData.organizationId
      );

      expect(result).toBe(mockAnnotation);
      expect(mockCreateAnnotation).toHaveBeenCalled();
      expect(mockUpsertAnnotationQuery).toHaveBeenCalled();
    });

    it("should throw ValidationException for invalid content", async () => {
      mockSanitizeAnnotationContent.mockReturnValue({
        valid: false,
        sanitized: "",
        error: "Content too long",
      });

      await expect(
        EntityGraphAnnotationsService.saveAnnotation(
          "x".repeat(3000),
          validAnnotationData.userId,
          validAnnotationData.entityType,
          validAnnotationData.entityId,
          validAnnotationData.organizationId
        )
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid userId", async () => {
      await expect(
        EntityGraphAnnotationsService.saveAnnotation(
          validAnnotationData.content,
          0,
          validAnnotationData.entityType,
          validAnnotationData.entityId,
          validAnnotationData.organizationId
        )
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid entityType", async () => {
      mockIsValidEntityType.mockReturnValue(false);

      await expect(
        EntityGraphAnnotationsService.saveAnnotation(
          validAnnotationData.content,
          validAnnotationData.userId,
          "invalid-type",
          validAnnotationData.entityId,
          validAnnotationData.organizationId
        )
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid entityId", async () => {
      mockIsValidEntityId.mockReturnValue(false);

      await expect(
        EntityGraphAnnotationsService.saveAnnotation(
          validAnnotationData.content,
          validAnnotationData.userId,
          validAnnotationData.entityType,
          "invalid!@#",
          validAnnotationData.organizationId
        )
      ).rejects.toThrow(ValidationException);
    });

    it("should ensure table exists before saving", async () => {
      await EntityGraphAnnotationsService.saveAnnotation(
        validAnnotationData.content,
        validAnnotationData.userId,
        validAnnotationData.entityType,
        validAnnotationData.entityId,
        validAnnotationData.organizationId
      );

      expect(mockUpsertAnnotationQuery).toHaveBeenCalled();
    });
  });

  describe("getAnnotations", () => {
    beforeEach(() => {

      mockGetAnnotationsByUserQuery.mockResolvedValue([mockAnnotation]);
    });

    it("should return annotations for user", async () => {
      const result = await EntityGraphAnnotationsService.getAnnotations(
        validAnnotationData.userId,
        validAnnotationData.organizationId
      );

      expect(result).toEqual([mockAnnotation]);
      expect(mockGetAnnotationsByUserQuery).toHaveBeenCalledWith(
        validAnnotationData.userId,
        validAnnotationData.organizationId
      );
    });

    it("should return empty array when no annotations exist", async () => {
      mockGetAnnotationsByUserQuery.mockResolvedValue([]);

      const result = await EntityGraphAnnotationsService.getAnnotations(
        validAnnotationData.userId,
        validAnnotationData.organizationId
      );

      expect(result).toEqual([]);
    });

    it("should call getAnnotationsByUserQuery", async () => {
      await EntityGraphAnnotationsService.getAnnotations(
        validAnnotationData.userId,
        validAnnotationData.organizationId
      );

      expect(mockGetAnnotationsByUserQuery).toHaveBeenCalledWith(
        validAnnotationData.userId,
        validAnnotationData.organizationId
      );
    });
  });

  describe("getAnnotationByEntity", () => {
    beforeEach(() => {

      mockGetAnnotationByEntityQuery.mockResolvedValue(mockAnnotation);
    });

    it("should return annotation for entity", async () => {
      const result = await EntityGraphAnnotationsService.getAnnotationByEntity(
        validAnnotationData.userId,
        validAnnotationData.entityType,
        validAnnotationData.entityId,
        validAnnotationData.organizationId
      );

      expect(result).toBe(mockAnnotation);
    });

    it("should return null when annotation not found", async () => {
      mockGetAnnotationByEntityQuery.mockResolvedValue(null);

      const result = await EntityGraphAnnotationsService.getAnnotationByEntity(
        validAnnotationData.userId,
        validAnnotationData.entityType,
        "nonexistent-id",
        validAnnotationData.organizationId
      );

      expect(result).toBeNull();
    });

    it("should throw ValidationException for invalid entityType", async () => {
      mockIsValidEntityType.mockReturnValue(false);

      await expect(
        EntityGraphAnnotationsService.getAnnotationByEntity(
          validAnnotationData.userId,
          "invalid",
          validAnnotationData.entityId,
          validAnnotationData.organizationId
        )
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid entityId", async () => {
      mockIsValidEntityId.mockReturnValue(false);

      await expect(
        EntityGraphAnnotationsService.getAnnotationByEntity(
          validAnnotationData.userId,
          validAnnotationData.entityType,
          "invalid!@#",
          validAnnotationData.organizationId
        )
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("deleteAnnotation", () => {
    beforeEach(() => {

      mockGetAnnotationByIdQuery.mockResolvedValue(mockAnnotation);
      mockDeleteAnnotationByIdQuery.mockResolvedValue(1);
      mockAnnotation.isOwnedBy.mockReturnValue(true);
    });

    it("should delete annotation successfully", async () => {
      const result = await EntityGraphAnnotationsService.deleteAnnotation(
        1,
        validAnnotationData.userId,
        validAnnotationData.organizationId
      );

      expect(result).toBe(true);
      expect(mockDeleteAnnotationByIdQuery).toHaveBeenCalledWith(
        1,
        validAnnotationData.organizationId
      );
    });

    it("should throw error when annotation not found", async () => {
      mockGetAnnotationByIdQuery.mockResolvedValue(null);

      await expect(
        EntityGraphAnnotationsService.deleteAnnotation(
          999,
          validAnnotationData.userId,
          validAnnotationData.organizationId
        )
      ).rejects.toThrow("Annotation with ID 999 not found");
    });

    it("should throw BusinessLogicException when user does not own annotation", async () => {
      mockAnnotation.isOwnedBy.mockReturnValue(false);

      await expect(
        EntityGraphAnnotationsService.deleteAnnotation(
          1,
          999,
          validAnnotationData.organizationId
        )
      ).rejects.toThrow(BusinessLogicException);
    });

    it("should throw error when delete fails", async () => {
      mockDeleteAnnotationByIdQuery.mockResolvedValue(0);

      await expect(
        EntityGraphAnnotationsService.deleteAnnotation(
          1,
          validAnnotationData.userId,
          validAnnotationData.organizationId
        )
      ).rejects.toThrow("Failed to delete annotation with ID 1");
    });
  });

  describe("deleteAnnotationByEntity", () => {
    beforeEach(() => {

      mockDeleteAnnotationByEntityQuery.mockResolvedValue(1);
    });

    it("should delete annotation by entity successfully", async () => {
      const result = await EntityGraphAnnotationsService.deleteAnnotationByEntity(
        validAnnotationData.userId,
        validAnnotationData.entityType,
        validAnnotationData.entityId,
        validAnnotationData.organizationId
      );

      expect(result).toBe(true);
      expect(mockDeleteAnnotationByEntityQuery).toHaveBeenCalledWith(
        validAnnotationData.userId,
        validAnnotationData.entityType,
        validAnnotationData.entityId,
        validAnnotationData.organizationId
      );
    });

    it("should throw ValidationException for invalid entityType", async () => {
      mockIsValidEntityType.mockReturnValue(false);

      await expect(
        EntityGraphAnnotationsService.deleteAnnotationByEntity(
          validAnnotationData.userId,
          "invalid",
          validAnnotationData.entityId,
          validAnnotationData.organizationId
        )
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid entityId", async () => {
      mockIsValidEntityId.mockReturnValue(false);

      await expect(
        EntityGraphAnnotationsService.deleteAnnotationByEntity(
          validAnnotationData.userId,
          validAnnotationData.entityType,
          "invalid!@#",
          validAnnotationData.organizationId
        )
      ).rejects.toThrow(ValidationException);
    });
  });
});
