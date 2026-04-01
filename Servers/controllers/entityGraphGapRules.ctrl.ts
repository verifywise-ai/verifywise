/**
 * @fileoverview Entity Graph Gap Rules Controller
 *
 * Handles all HTTP requests related to Entity Graph gap detection rules management.
 * Provides endpoints for saving, retrieving, and resetting gap rules.
 *
 * Endpoints:
 * - POST /api/entity-graph/gap-rules - Save gap rules (create/update)
 * - GET /api/entity-graph/gap-rules - Fetch user's gap rules (or defaults)
 * - DELETE /api/entity-graph/gap-rules - Reset to defaults
 * - GET /api/entity-graph/gap-rules/defaults - Get default rules
 *
 * All endpoints require JWT authentication.
 *
 * @module controllers/entityGraphGapRules
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { EntityGraphGapRulesService } from "../services/entityGraphGapRulesService";
import {
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";
import {
  logFailure,
  logProcessing,
} from "../utils/logger/logHelper";
import { sanitizeErrorMessage } from "../utils/entityGraphSecurity.utils";

/**
 * Save gap rules (create or update)
 *
 * POST /api/entity-graph/gap-rules
 *
 * Request body:
 * {
 *   rules: GapRule[] (required)
 * }
 *
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<any>} JSON response with saved rules or error
 */
export async function saveGapRules(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "Starting saveGapRules",
    functionName: "saveGapRules",
    fileName: "entityGraphGapRules.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const { rules } = req.body;
    const userId = req.userId!;
    const organizationId = req.organizationId!;

    // Validate required fields
    if (!rules || !Array.isArray(rules)) {
      throw new ValidationException(
        "Rules array is required",
        "rules",
        rules
      );
    }

    const savedRules = await EntityGraphGapRulesService.saveGapRules(
      rules,
      userId,
      organizationId
    );

    return res.status(201).json(
      STATUS_CODE[201]({
        ...savedRules.toJSON(),
        isDefault: false,
      })
    );
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "Failed to save gap rules",
      functionName: "saveGapRules",
      fileName: "entityGraphGapRules.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400]((error as Error).message));
    }
    return res.status(500).json(
      STATUS_CODE[500](
        sanitizeErrorMessage(error as Error, "Failed to save gap rules")
      )
    );
  }
}

/**
 * Get gap rules for the current user
 *
 * GET /api/entity-graph/gap-rules
 *
 * Returns user's custom rules or default rules if none exist.
 *
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<any>} JSON response with rules and isDefault flag
 */
export async function getGapRules(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "Starting getGapRules",
    functionName: "getGapRules",
    fileName: "entityGraphGapRules.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const userId = req.userId!;
    const organizationId = req.organizationId!;

    const result = await EntityGraphGapRulesService.getGapRules(
      userId,
      organizationId
    );

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve gap rules",
      functionName: "getGapRules",
      fileName: "entityGraphGapRules.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(
      STATUS_CODE[500](
        sanitizeErrorMessage(error as Error, "Failed to retrieve gap rules")
      )
    );
  }
}

/**
 * Reset gap rules to defaults
 *
 * DELETE /api/entity-graph/gap-rules
 *
 * Deletes user's custom rules and returns defaults.
 *
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<any>} JSON response with default rules
 */
export async function resetGapRules(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "Starting resetGapRules",
    functionName: "resetGapRules",
    fileName: "entityGraphGapRules.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const userId = req.userId!;
    const organizationId = req.organizationId!;

    const result = await EntityGraphGapRulesService.resetToDefaults(
      userId,
      organizationId
    );

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: "Failed to reset gap rules",
      functionName: "resetGapRules",
      fileName: "entityGraphGapRules.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(
      STATUS_CODE[500](
        sanitizeErrorMessage(error as Error, "Failed to reset gap rules")
      )
    );
  }
}

/**
 * Get default gap rules
 *
 * GET /api/entity-graph/gap-rules/defaults
 *
 * Returns the default gap detection rules without requiring authentication.
 * This endpoint can be used to show users what the defaults are.
 *
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<any>} JSON response with default rules
 */
export async function getDefaultGapRules(
  _req: Request,
  res: Response
): Promise<any> {
  logProcessing({
    description: "Starting getDefaultGapRules",
    functionName: "getDefaultGapRules",
    fileName: "entityGraphGapRules.ctrl.ts",
    userId: _req.userId!,
    organizationId: _req.organizationId!,
  });

  try {
    const defaults = EntityGraphGapRulesService.getDefaults();

    return res.status(200).json(
      STATUS_CODE[200]({
        rules: defaults,
        isDefault: true,
      })
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to get default gap rules",
      functionName: "getDefaultGapRules",
      fileName: "entityGraphGapRules.ctrl.ts",
      error: error as Error,
      userId: _req.userId!,
      organizationId: _req.organizationId!,
    });

    return res.status(500).json(
      STATUS_CODE[500](
        sanitizeErrorMessage(error as Error, "Failed to get default gap rules")
      )
    );
  }
}
