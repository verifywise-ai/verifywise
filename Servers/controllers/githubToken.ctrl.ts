/**
 * @fileoverview GitHub Token Controller
 *
 * HTTP request handlers for GitHub token management endpoints.
 * Admin-only endpoints for configuring GitHub PAT for private repo access.
 *
 * @module controllers/githubToken
 */

import { Request, Response } from "express";
import { logProcessing, logSuccess, logFailure as logError } from "../utils/logger/logHelper";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  getGitHubTokenStatusQuery,
  saveGitHubTokenQuery,
  deleteGitHubTokenQuery,
  testGitHubToken,
  validateGitHubTokenFormat,
} from "../utils/githubToken.utils";

const FILE_NAME = "githubToken.ctrl.ts";

// ============================================================================
// Controller Functions
// ============================================================================

/**
 * Get GitHub token status (configured or not)
 *
 * GET /api/integrations/github/token
 */
export async function getGitHubTokenStatusController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Getting GitHub token status",
    functionName: "getGitHubTokenStatusController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const status = await getGitHubTokenStatusQuery(req.organizationId!);

    return res.status(200).json(STATUS_CODE[200](status));
  } catch (error) {
    await logError({
      error: error as Error,
      eventType: "Read",
      description: "Failed to get GitHub token status",
      functionName: "getGitHubTokenStatusController",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json(STATUS_CODE[500](errorMessage));
  }
}

/**
 * Save or update GitHub token
 *
 * POST /api/integrations/github/token
 * Body: { token: string, token_name?: string }
 */
export async function saveGitHubTokenController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Saving GitHub token",
    functionName: "saveGitHubTokenController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const { token, token_name } = req.body;

    if (!token) {
      return res.status(400).json(STATUS_CODE[400]("Token is required"));
    }

    // Validate token format
    const formatError = validateGitHubTokenFormat(token);
    if (formatError) {
      return res.status(400).json(STATUS_CODE[400](formatError));
    }

    await saveGitHubTokenQuery(token, req.userId!, req.organizationId!, token_name);

    await logSuccess({
      eventType: "Create",
      description: "Saved GitHub token for organization",
      functionName: "saveGitHubTokenController",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    // Return status (not the token itself)
    const status = await getGitHubTokenStatusQuery(req.organizationId!);
    return res.status(201).json(STATUS_CODE[201](status));
  } catch (error) {
    await logError({
      error: error as Error,
      eventType: "Create",
      description: "Failed to save GitHub token",
      functionName: "saveGitHubTokenController",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json(STATUS_CODE[500](errorMessage));
  }
}

/**
 * Delete GitHub token
 *
 * DELETE /api/integrations/github/token
 */
export async function deleteGitHubTokenController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Deleting GitHub token",
    functionName: "deleteGitHubTokenController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const deleted = await deleteGitHubTokenQuery(req.organizationId!);

    if (!deleted) {
      return res.status(404).json(STATUS_CODE[404]("No GitHub token found"));
    }

    await logSuccess({
      eventType: "Delete",
      description: "Deleted GitHub token for organization",
      functionName: "deleteGitHubTokenController",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200]({ message: "GitHub token deleted successfully" }));
  } catch (error) {
    await logError({
      error: error as Error,
      eventType: "Delete",
      description: "Failed to delete GitHub token",
      functionName: "deleteGitHubTokenController",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json(STATUS_CODE[500](errorMessage));
  }
}

/**
 * Test a GitHub token (before saving)
 *
 * POST /api/integrations/github/token/test
 * Body: { token: string }
 */
export async function testGitHubTokenController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Testing GitHub token",
    functionName: "testGitHubTokenController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json(STATUS_CODE[400]("Token is required"));
    }

    // Validate token format first
    const formatError = validateGitHubTokenFormat(token);
    if (formatError) {
      return res.status(400).json(STATUS_CODE[400](formatError));
    }

    // Test the token against GitHub API
    const result = await testGitHubToken(token);

    if (result.valid) {
      return res.status(200).json(STATUS_CODE[200](result));
    } else {
      return res.status(200).json(STATUS_CODE[200](result));
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json(STATUS_CODE[500](errorMessage));
  }
}
