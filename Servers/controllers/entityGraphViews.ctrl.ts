/**
 * @fileoverview Entity Graph Views Controller
 *
 * Handles all HTTP requests related to Entity Graph saved views management.
 * Provides endpoints for creating, retrieving, updating, and deleting views.
 *
 * Endpoints:
 * - POST /api/entity-graph/views - Create new view
 * - GET /api/entity-graph/views - Fetch all user views
 * - GET /api/entity-graph/views/:id - Fetch view by ID
 * - PUT /api/entity-graph/views/:id - Update view
 * - DELETE /api/entity-graph/views/:id - Delete view
 *
 * All endpoints require JWT authentication.
 *
 * @module controllers/entityGraphViews
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { EntityGraphViewsService } from "../services/entityGraphViewsService";
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
 * Create a new saved view
 *
 * POST /api/entity-graph/views
 *
 * Request body:
 * {
 *   name: string (required, max 100 chars)
 *   config: EntityGraphViewConfig (required)
 * }
 *
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<any>} JSON response with created view or error
 */
export async function createView(req: Request, res: Response): Promise<any> {
  const organizationId = req.organizationId!;

  logProcessing({
    description: "Starting createView",
    functionName: "createView",
    fileName: "entityGraphViews.ctrl.ts",
    userId: req.userId!,
    organizationId,
  });

  try {
    const { name, config } = req.body;
    const userId = req.userId!;

    // Validate required fields
    if (!name || name.trim().length === 0) {
      throw new ValidationException("View name is required", "name", name);
    }

    if (!config || typeof config !== "object") {
      throw new ValidationException(
        "Valid config object is required",
        "config",
        config
      );
    }

    const savedView = await EntityGraphViewsService.createView(
      name,
      config,
      userId,
      organizationId
    );

    return res.status(201).json(STATUS_CODE[201](savedView.toJSON()));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "Failed to create view",
      functionName: "createView",
      fileName: "entityGraphViews.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400]((error as Error).message));
    }
    if (error instanceof BusinessLogicException) {
      return res.status(400).json(STATUS_CODE[400]((error as Error).message));
    }
    return res.status(500).json(
      STATUS_CODE[500](
        sanitizeErrorMessage(error as Error, "Failed to create view")
      )
    );
  }
}

/**
 * Get all views for the current user
 *
 * GET /api/entity-graph/views
 *
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<any>} JSON response with views array or error
 */
export async function getViews(req: Request, res: Response): Promise<any> {
  const organizationId = req.organizationId!;

  logProcessing({
    description: "Starting getViews",
    functionName: "getViews",
    fileName: "entityGraphViews.ctrl.ts",
    userId: req.userId!,
    organizationId,
  });

  try {
    const userId = req.userId!;

    const views = await EntityGraphViewsService.getViews(
      userId,
      organizationId
    );

    const responseData = views.map((view) => view.toJSON());
    return res.status(200).json(STATUS_CODE[200](responseData));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve views",
      functionName: "getViews",
      fileName: "entityGraphViews.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(
      STATUS_CODE[500](
        sanitizeErrorMessage(error as Error, "Failed to retrieve views")
      )
    );
  }
}

/**
 * Get a specific view by ID
 *
 * GET /api/entity-graph/views/:id
 *
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<any>} JSON response with view or error
 */
export async function getViewById(req: Request, res: Response): Promise<any> {
  const organizationId = req.organizationId!;
  const viewId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const userId = req.userId!;

  logProcessing({
    description: `Starting getViewById for ID ${viewId}`,
    functionName: "getViewById",
    fileName: "entityGraphViews.ctrl.ts",
    userId: req.userId!,
    organizationId,
  });

  try {
    if (isNaN(viewId) || viewId < 1) {
      throw new ValidationException(
        "Valid view ID is required",
        "id",
        req.params.id
      );
    }

    const view = await EntityGraphViewsService.getViewById(
      viewId,
      userId,
      organizationId
    );

    if (!view) {
      return res.status(404).json(STATUS_CODE[404]("View not found"));
    }

    return res.status(200).json(STATUS_CODE[200](view.toJSON()));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve view ${viewId}`,
      functionName: "getViewById",
      fileName: "entityGraphViews.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400]((error as Error).message));
    }
    return res.status(500).json(
      STATUS_CODE[500](
        sanitizeErrorMessage(error as Error, "Failed to retrieve view")
      )
    );
  }
}

/**
 * Update a view
 *
 * PUT /api/entity-graph/views/:id
 *
 * Request body:
 * {
 *   name?: string (optional, max 100 chars)
 *   config?: EntityGraphViewConfig (optional)
 * }
 *
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<any>} JSON response with updated view or error
 */
export async function updateView(req: Request, res: Response): Promise<any> {
  const organizationId = req.organizationId!;
  const viewId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { name, config } = req.body;
  const userId = req.userId!;

  logProcessing({
    description: `Starting updateView for ID ${viewId}`,
    functionName: "updateView",
    fileName: "entityGraphViews.ctrl.ts",
    userId: req.userId!,
    organizationId,
  });

  try {
    if (isNaN(viewId) || viewId < 1) {
      throw new ValidationException(
        "Valid view ID is required",
        "id",
        req.params.id
      );
    }

    // At least one field should be provided
    if (name === undefined && config === undefined) {
      throw new ValidationException(
        "At least name or config must be provided",
        "body",
        req.body
      );
    }

    const updatedView = await EntityGraphViewsService.updateView(
      viewId,
      name,
      config,
      userId,
      organizationId
    );

    return res.status(200).json(STATUS_CODE[200](updatedView.toJSON()));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: `Failed to update view ${viewId}`,
      functionName: "updateView",
      fileName: "entityGraphViews.ctrl.ts",
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
        sanitizeErrorMessage(error as Error, "Failed to update view")
      )
    );
  }
}

/**
 * Delete a view
 *
 * DELETE /api/entity-graph/views/:id
 *
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<any>} JSON response with success message or error
 */
export async function deleteView(req: Request, res: Response): Promise<any> {
  const organizationId = req.organizationId!;
  const viewId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const userId = req.userId!;

  logProcessing({
    description: `Starting deleteView for ID ${viewId}`,
    functionName: "deleteView",
    fileName: "entityGraphViews.ctrl.ts",
    userId: req.userId!,
    organizationId,
  });

  try {
    if (isNaN(viewId) || viewId < 1) {
      throw new ValidationException(
        "Valid view ID is required",
        "id",
        req.params.id
      );
    }

    await EntityGraphViewsService.deleteView(viewId, userId, organizationId);

    return res.status(200).json(STATUS_CODE[200]("View deleted successfully"));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete view ${viewId}`,
      functionName: "deleteView",
      fileName: "entityGraphViews.ctrl.ts",
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
        sanitizeErrorMessage(error as Error, "Failed to delete view")
      )
    );
  }
}
