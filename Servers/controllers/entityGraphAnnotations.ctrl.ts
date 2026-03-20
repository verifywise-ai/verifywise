/**
 * @fileoverview Entity Graph Annotations Controller
 *
 * Handles all HTTP requests related to Entity Graph annotations management.
 * Provides endpoints for creating, retrieving, updating, and deleting annotations.
 *
 * Endpoints:
 * - POST /api/entity-graph/annotations - Create/update annotation
 * - GET /api/entity-graph/annotations - Fetch all user annotations
 * - GET /api/entity-graph/annotations/:entityType/:entityId - Fetch annotation for entity
 * - DELETE /api/entity-graph/annotations/:id - Delete annotation by ID
 * - DELETE /api/entity-graph/annotations/:entityType/:entityId - Delete annotation by entity
 *
 * All endpoints require JWT authentication.
 *
 * @module controllers/entityGraphAnnotations
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { EntityGraphAnnotationsService } from "../services/entityGraphAnnotationsService";
import {
  ValidationException,
  BusinessLogicException,
} from "../domain.layer/exceptions/custom.exception";
import {
  logFailure,
  logProcessing,
} from "../utils/logger/logHelper";
import { sanitizeErrorMessage } from "../utils/entityGraphSecurity.utils";

/**
 * Create or update an annotation
 *
 * POST /api/entity-graph/annotations
 *
 * Request body:
 * {
 *   content: string (required, max 2000 chars)
 *   entity_type: string (required)
 *   entity_id: string (required)
 * }
 *
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<any>} JSON response with created/updated annotation or error
 */
export async function saveAnnotation(req: Request, res: Response): Promise<any> {
  const organizationId = req.organizationId!;

  logProcessing({
    description: "Starting saveAnnotation",
    functionName: "saveAnnotation",
    fileName: "entityGraphAnnotations.ctrl.ts",
    userId: req.userId!,
    organizationId,
  });

  try {
    const { content, entity_type, entity_id } = req.body;
    const userId = req.userId!;

    // Validate required fields
    if (!content || content.trim().length === 0) {
      throw new ValidationException(
        "Annotation content is required",
        "content",
        content
      );
    }

    if (!entity_type) {
      throw new ValidationException(
        "entity_type is required",
        "entity_type",
        entity_type
      );
    }

    if (!entity_id) {
      throw new ValidationException(
        "entity_id is required",
        "entity_id",
        entity_id
      );
    }

    const savedAnnotation = await EntityGraphAnnotationsService.saveAnnotation(
      content,
      userId,
      entity_type,
      entity_id,
      organizationId
    );

    return res.status(201).json(STATUS_CODE[201](savedAnnotation.toJSON()));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "Failed to save annotation",
      functionName: "saveAnnotation",
      fileName: "entityGraphAnnotations.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId,
    });

    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400]((error as Error).message));
    }
    return res.status(500).json(
      STATUS_CODE[500](
        sanitizeErrorMessage(error as Error, "Failed to save annotation")
      )
    );
  }
}

/**
 * Get all annotations for the current user
 *
 * GET /api/entity-graph/annotations
 *
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<any>} JSON response with annotations array or error
 */
export async function getAnnotations(req: Request, res: Response): Promise<any> {
  const organizationId = req.organizationId!;

  logProcessing({
    description: "Starting getAnnotations",
    functionName: "getAnnotations",
    fileName: "entityGraphAnnotations.ctrl.ts",
    userId: req.userId!,
    organizationId,
  });

  try {
    const userId = req.userId!;

    const annotations = await EntityGraphAnnotationsService.getAnnotations(
      userId,
      organizationId
    );

    const responseData = annotations.map((annotation) => annotation.toJSON());
    return res.status(200).json(STATUS_CODE[200](responseData));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve annotations",
      functionName: "getAnnotations",
      fileName: "entityGraphAnnotations.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(
      STATUS_CODE[500](
        sanitizeErrorMessage(error as Error, "Failed to retrieve annotations")
      )
    );
  }
}

/**
 * Get annotation for a specific entity
 *
 * GET /api/entity-graph/annotations/:entityType/:entityId
 *
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<any>} JSON response with annotation or null
 */
export async function getAnnotationByEntity(
  req: Request,
  res: Response
): Promise<any> {
  logProcessing({
    description: "Starting getAnnotationByEntity",
    functionName: "getAnnotationByEntity",
    fileName: "entityGraphAnnotations.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const entityType = Array.isArray(req.params.entityType) ? req.params.entityType[0] : req.params.entityType;
    const entityId = Array.isArray(req.params.entityId) ? req.params.entityId[0] : req.params.entityId;
    const userId = req.userId!;
    const organizationId = req.organizationId!;

    if (!entityType || !entityId) {
      throw new ValidationException(
        "entityType and entityId are required",
        "params",
        { entityType, entityId }
      );
    }

    const annotation = await EntityGraphAnnotationsService.getAnnotationByEntity(
      userId,
      entityType,
      entityId,
      organizationId
    );

    return res.status(200).json(STATUS_CODE[200](annotation?.toJSON() || null));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve annotation",
      functionName: "getAnnotationByEntity",
      fileName: "entityGraphAnnotations.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400]((error as Error).message));
    }
    return res.status(500).json(
      STATUS_CODE[500](
        sanitizeErrorMessage(error as Error, "Failed to retrieve annotation")
      )
    );
  }
}

/**
 * Delete an annotation by ID
 *
 * DELETE /api/entity-graph/annotations/:id
 *
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<any>} JSON response with success message or error
 */
export async function deleteAnnotation(req: Request, res: Response): Promise<any> {
  const annotationId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: `Starting deleteAnnotation for ID ${annotationId}`,
    functionName: "deleteAnnotation",
    fileName: "entityGraphAnnotations.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    if (isNaN(annotationId) || annotationId < 1) {
      throw new ValidationException(
        "Valid annotation ID is required",
        "id",
        req.params.id
      );
    }

    await EntityGraphAnnotationsService.deleteAnnotation(
      annotationId,
      userId,
      organizationId
    );

    return res.status(200).json(STATUS_CODE[200]("Annotation deleted successfully"));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete annotation ${annotationId}`,
      functionName: "deleteAnnotation",
      fileName: "entityGraphAnnotations.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    if (error instanceof BusinessLogicException) {
      return res.status(403).json(STATUS_CODE[403]((error as Error).message));
    }
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400]((error as Error).message));
    }
    return res.status(500).json(
      STATUS_CODE[500](
        sanitizeErrorMessage(error as Error, "Failed to delete annotation")
      )
    );
  }
}

/**
 * Delete an annotation by entity
 *
 * DELETE /api/entity-graph/annotations/entity/:entityType/:entityId
 *
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<any>} JSON response with success message or error
 */
export async function deleteAnnotationByEntity(
  req: Request,
  res: Response
): Promise<any> {
  const { entityType, entityId } = req.params;
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: `Starting deleteAnnotationByEntity for ${entityType}:${entityId}`,
    functionName: "deleteAnnotationByEntity",
    fileName: "entityGraphAnnotations.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    if (!entityType || !entityId) {
      throw new ValidationException(
        "entityType and entityId are required",
        "params",
        { entityType, entityId }
      );
    }

    await EntityGraphAnnotationsService.deleteAnnotationByEntity(
      userId,
      Array.isArray(entityType) ? entityType[0] : entityType,
      Array.isArray(entityId) ? entityId[0] : entityId,
      organizationId
    );

    return res.status(200).json(STATUS_CODE[200]("Annotation deleted successfully"));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete annotation for ${entityType}:${entityId}`,
      functionName: "deleteAnnotationByEntity",
      fileName: "entityGraphAnnotations.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400]((error as Error).message));
    }
    return res.status(500).json(
      STATUS_CODE[500](
        sanitizeErrorMessage(error as Error, "Failed to delete annotation")
      )
    );
  }
}
