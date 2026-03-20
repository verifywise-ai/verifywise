/**
 * @fileoverview Entity Graph Annotations Service
 *
 * Business logic layer for Entity Graph annotations management.
 * Handles validation, permission checks, and orchestration of annotation operations.
 *
 * Responsibilities:
 * - Validate user permissions (only owner can modify)
 * - Sanitize user input
 * - Coordinate with utilities
 * - Log audit events
 *
 * @module services/entityGraphAnnotationsService
 */

import { EntityGraphAnnotationsModel } from "../domain.layer/models/entityGraphAnnotations/entityGraphAnnotations.model";
import {
  getAnnotationsByUserQuery,
  getAnnotationByEntityQuery,
  getAnnotationByIdQuery,
  upsertAnnotationQuery,
  deleteAnnotationByIdQuery,
  deleteAnnotationByEntityQuery,
} from "../utils/entityGraphAnnotations.utils";
import {
  ValidationException,
  BusinessLogicException,
} from "../domain.layer/exceptions/custom.exception";
import {
  logFailure,
  logProcessing,
  logSuccess,
} from "../utils/logger/logHelper";
import {
  isValidEntityType,
  isValidEntityId,
  sanitizeAnnotationContent,
} from "../utils/entityGraphSecurity.utils";

export class EntityGraphAnnotationsService {
  /**
   * Create or update an annotation for an entity
   *
   * Uses upsert to handle both create and update in one operation.
   *
   * @static
   * @async
   * @param {string} content - Annotation content
   * @param {number} userId - User ID
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID
   * @param {number} organizationId - Organization ID
   * @returns {Promise<EntityGraphAnnotationsModel>} Created/updated annotation
   * @throws {ValidationException} If validation fails
   */
  static async saveAnnotation(
    content: string,
    userId: number,
    entityType: string,
    entityId: string,
    organizationId: number
  ): Promise<EntityGraphAnnotationsModel> {
    logProcessing({
      description: "Starting EntityGraphAnnotationsService.saveAnnotation",
      functionName: "saveAnnotation",
      fileName: "entityGraphAnnotationsService.ts",
      userId: userId,
      organizationId: organizationId,
    });

    try {
      // Validate and sanitize content
      const contentValidation = sanitizeAnnotationContent(content);
      if (!contentValidation.valid) {
        throw new ValidationException(
          contentValidation.error || "Invalid content",
          "content",
          content
        );
      }
      const sanitizedContent = contentValidation.sanitized;

      if (!userId || userId < 1) {
        throw new ValidationException(
          "Valid user ID is required",
          "userId",
          userId
        );
      }

      // Validate entityType against whitelist
      if (!isValidEntityType(entityType)) {
        throw new ValidationException(
          "Invalid entity type. Must be one of: useCase, model, risk, vendor, control, evidence, framework, user",
          "entityType",
          entityType
        );
      }

      // Validate entityId format
      if (!isValidEntityId(entityId)) {
        throw new ValidationException(
          "Invalid entity ID format",
          "entityId",
          entityId
        );
      }

      // Create annotation model
      const annotation = await EntityGraphAnnotationsModel.createAnnotation(
        sanitizedContent,
        userId,
        entityType,
        entityId,
        organizationId
      );

      // Upsert to database
      const savedAnnotation = await upsertAnnotationQuery(annotation, organizationId);

      await logSuccess({
        eventType: "Create",
        description: `Annotation saved for ${entityType}:${entityId}`,
        functionName: "saveAnnotation",
        fileName: "entityGraphAnnotationsService.ts",
        userId: userId,
        organizationId: organizationId,
      });

      return savedAnnotation;
    } catch (error) {
      await logFailure({
        eventType: "Create",
        description: "Failed to save annotation",
        functionName: "saveAnnotation",
        fileName: "entityGraphAnnotationsService.ts",
        error: error as Error,
        userId: userId,
        organizationId: organizationId,
      });
      throw error;
    }
  }

  /**
   * Get all annotations for a user
   *
   * @static
   * @async
   * @param {number} userId - User ID
   * @param {number} organizationId - Organization ID
   * @returns {Promise<EntityGraphAnnotationsModel[]>} Array of annotations
   */
  static async getAnnotations(
    userId: number,
    organizationId: number
  ): Promise<EntityGraphAnnotationsModel[]> {
    logProcessing({
      description: "Starting EntityGraphAnnotationsService.getAnnotations",
      functionName: "getAnnotations",
      fileName: "entityGraphAnnotationsService.ts",
      userId: userId,
      organizationId: organizationId,
    });

    try {
      const annotations = await getAnnotationsByUserQuery(
        userId,
        organizationId
      );

      await logSuccess({
        eventType: "Read",
        description: `Retrieved ${annotations.length} annotations for user ${userId}`,
        functionName: "getAnnotations",
        fileName: "entityGraphAnnotationsService.ts",
        userId: userId,
        organizationId: organizationId,
      });

      return annotations;
    } catch (error) {
      await logFailure({
        eventType: "Read",
        description: "Failed to fetch annotations",
        functionName: "getAnnotations",
        fileName: "entityGraphAnnotationsService.ts",
        error: error as Error,
        userId: userId,
        organizationId: organizationId,
      });
      throw error;
    }
  }

  /**
   * Get annotation for a specific entity
   *
   * @static
   * @async
   * @param {number} userId - User ID
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID
   * @param {number} organizationId - Organization ID
   * @returns {Promise<EntityGraphAnnotationsModel | null>} Annotation or null
   */
  static async getAnnotationByEntity(
    userId: number,
    entityType: string,
    entityId: string,
    organizationId: number
  ): Promise<EntityGraphAnnotationsModel | null> {
    try {
      // Validate entityType against whitelist
      if (!isValidEntityType(entityType)) {
        throw new ValidationException(
          "Invalid entity type",
          "entityType",
          entityType
        );
      }

      // Validate entityId format
      if (!isValidEntityId(entityId)) {
        throw new ValidationException(
          "Invalid entity ID format",
          "entityId",
          entityId
        );
      }

      return await getAnnotationByEntityQuery(
        userId,
        entityType,
        entityId,
        organizationId
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete an annotation
   *
   * @static
   * @async
   * @param {number} annotationId - Annotation ID
   * @param {number} userId - User ID attempting deletion
   * @param {number} organizationId - Organization ID
   * @returns {Promise<boolean>} True if deleted successfully
   * @throws {BusinessLogicException} If user lacks permission
   */
  static async deleteAnnotation(
    annotationId: number,
    userId: number,
    organizationId: number
  ): Promise<boolean> {
    logProcessing({
      description: `Starting EntityGraphAnnotationsService.deleteAnnotation for ID ${annotationId}`,
      functionName: "deleteAnnotation",
      fileName: "entityGraphAnnotationsService.ts",
      userId: userId,
      organizationId: organizationId,
    });

    try {
      // Fetch existing annotation
      const annotation = await getAnnotationByIdQuery(annotationId, organizationId);

      if (!annotation) {
        throw new Error(`Annotation with ID ${annotationId} not found`);
      }

      // Check permissions: only owner can delete
      if (!annotation.isOwnedBy(userId)) {
        throw new BusinessLogicException(
          "Only the annotation owner can delete this annotation",
          "ANNOTATION_DELETE_FORBIDDEN",
          { annotationId, userId }
        );
      }

      // Delete from database
      const deleteCount = await deleteAnnotationByIdQuery(
        annotationId,
        organizationId
      );

      if (deleteCount === 0) {
        throw new Error(`Failed to delete annotation with ID ${annotationId}`);
      }

      await logSuccess({
        eventType: "Delete",
        description: `Annotation ${annotationId} deleted`,
        functionName: "deleteAnnotation",
        fileName: "entityGraphAnnotationsService.ts",
        userId: userId,
        organizationId: organizationId,
      });

      return true;
    } catch (error) {
      await logFailure({
        eventType: "Delete",
        description: `Failed to delete annotation ${annotationId}`,
        functionName: "deleteAnnotation",
        fileName: "entityGraphAnnotationsService.ts",
        error: error as Error,
        userId: userId,
        organizationId: organizationId,
      });
      throw error;
    }
  }

  /**
   * Delete annotation by entity
   *
   * @static
   * @async
   * @param {number} userId - User ID
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID
   * @param {number} organizationId - Organization ID
   * @returns {Promise<boolean>} True if deleted (or didn't exist)
   */
  static async deleteAnnotationByEntity(
    userId: number,
    entityType: string,
    entityId: string,
    organizationId: number
  ): Promise<boolean> {
    logProcessing({
      description: `Starting EntityGraphAnnotationsService.deleteAnnotationByEntity for ${entityType}:${entityId}`,
      functionName: "deleteAnnotationByEntity",
      fileName: "entityGraphAnnotationsService.ts",
      userId: userId,
      organizationId: organizationId,
    });

    try {
      // Validate entityType against whitelist
      if (!isValidEntityType(entityType)) {
        throw new ValidationException(
          "Invalid entity type",
          "entityType",
          entityType
        );
      }

      // Validate entityId format
      if (!isValidEntityId(entityId)) {
        throw new ValidationException(
          "Invalid entity ID format",
          "entityId",
          entityId
        );
      }

      await deleteAnnotationByEntityQuery(userId, entityType, entityId, organizationId);

      await logSuccess({
        eventType: "Delete",
        description: `Annotation for ${entityType}:${entityId} deleted`,
        functionName: "deleteAnnotationByEntity",
        fileName: "entityGraphAnnotationsService.ts",
        userId: userId,
        organizationId: organizationId,
      });

      return true;
    } catch (error) {
      await logFailure({
        eventType: "Delete",
        description: `Failed to delete annotation for ${entityType}:${entityId}`,
        functionName: "deleteAnnotationByEntity",
        fileName: "entityGraphAnnotationsService.ts",
        error: error as Error,
        userId: userId,
        organizationId: organizationId,
      });
      throw error;
    }
  }
}
