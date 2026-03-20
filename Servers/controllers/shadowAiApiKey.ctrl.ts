/**
 * Shadow AI API Key Controller
 *
 * Manages API keys for Shadow AI event ingestion.
 * Admin-only endpoints for creating, listing, and revoking keys.
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import {
  generateApiKey,
  createApiKeyQuery,
  listApiKeysQuery,
  revokeApiKeyQuery,
  deleteApiKeyQuery,
  clearApiKeyCache,
} from "../utils/shadowAiApiKey.utils";

const FILE_NAME = "shadowAiApiKey.ctrl.ts";

/**
 * POST /api/shadow-ai/api-keys
 * Create a new API key. Admin only.
 */
export async function createApiKey(req: Request, res: Response) {
  const functionName = "createApiKey";
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "creating new Shadow AI API key",
    functionName,
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    // Check admin role
    if (req.role !== "Admin") {
      return res
        .status(403)
        .json(STATUS_CODE[403]("Only admins can manage API keys"));
    }

    const { label } = req.body;
    const { key, keyHash, keyPrefix } = generateApiKey(organizationId);

    const apiKeyRecord = await createApiKeyQuery(
      organizationId,
      keyHash,
      keyPrefix,
      label || null,
      userId
    );

    await logSuccess({
      eventType: "Create",
      description: `Shadow AI API key created: ${keyPrefix}...`,
      functionName,
      fileName: FILE_NAME,
      userId,
      organizationId,
    });

    // Return the full key only on creation
    return res.status(201).json(
      STATUS_CODE[201]({
        ...apiKeyRecord,
        key, // Full key shown only once
      })
    );
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "failed to create Shadow AI API key",
      functionName,
      fileName: FILE_NAME,
      userId,
      organizationId,
      error: error as Error,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /api/shadow-ai/api-keys
 * List all API keys for the organization. Admin only.
 */
export async function listApiKeys(req: Request, res: Response) {
  const functionName = "listApiKeys";
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "listing Shadow AI API keys",
    functionName,
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    if (req.role !== "Admin") {
      return res
        .status(403)
        .json(STATUS_CODE[403]("Only admins can manage API keys"));
    }

    const keys = await listApiKeysQuery(organizationId);

    await logSuccess({
      eventType: "Read",
      description: `listed ${keys.length} Shadow AI API keys`,
      functionName,
      fileName: FILE_NAME,
      userId,
      organizationId,
    });

    return res.status(200).json(STATUS_CODE[200](keys));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to list Shadow AI API keys",
      functionName,
      fileName: FILE_NAME,
      userId,
      organizationId,
      error: error as Error,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * DELETE /api/shadow-ai/api-keys/:id
 * Revoke an API key. Admin only.
 */
export async function revokeApiKey(req: Request, res: Response) {
  const functionName = "revokeApiKey";
  const userId = req.userId!;
  const organizationId = req.organizationId!;
  const keyId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  );

  logProcessing({
    description: `revoking Shadow AI API key: ${keyId}`,
    functionName,
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    if (req.role !== "Admin") {
      return res
        .status(403)
        .json(STATUS_CODE[403]("Only admins can manage API keys"));
    }

    if (isNaN(keyId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid key ID"));
    }

    const revoked = await revokeApiKeyQuery(organizationId, keyId);

    if (!revoked) {
      return res
        .status(404)
        .json(STATUS_CODE[404]("API key not found or already revoked"));
    }

    // Clear the validation cache so revoked keys are immediately rejected
    clearApiKeyCache();

    await logSuccess({
      eventType: "Delete",
      description: `Shadow AI API key revoked: ${keyId}`,
      functionName,
      fileName: FILE_NAME,
      userId,
      organizationId,
    });

    return res
      .status(200)
      .json(STATUS_CODE[200]("API key revoked successfully"));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: "failed to revoke Shadow AI API key",
      functionName,
      fileName: FILE_NAME,
      userId,
      organizationId,
      error: error as Error,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * DELETE /api/shadow-ai/api-keys/:id/permanent
 * Permanently delete a revoked API key. Admin only.
 */
export async function deleteApiKey(req: Request, res: Response) {
  const functionName = "deleteApiKey";
  const userId = req.userId!;
  const organizationId = req.organizationId!;
  const keyId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  );

  logProcessing({
    description: `permanently deleting Shadow AI API key: ${keyId}`,
    functionName,
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    if (req.role !== "Admin") {
      return res
        .status(403)
        .json(STATUS_CODE[403]("Only admins can manage API keys"));
    }

    if (isNaN(keyId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid key ID"));
    }

    const deleted = await deleteApiKeyQuery(organizationId, keyId);

    if (!deleted) {
      return res
        .status(404)
        .json(STATUS_CODE[404]("API key not found or still active. Revoke it first."));
    }

    await logSuccess({
      eventType: "Delete",
      description: `Shadow AI API key permanently deleted: ${keyId}`,
      functionName,
      fileName: FILE_NAME,
      userId,
      organizationId,
    });

    return res
      .status(200)
      .json(STATUS_CODE[200]("API key permanently deleted"));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: "failed to permanently delete Shadow AI API key",
      functionName,
      fileName: FILE_NAME,
      userId,
      organizationId,
      error: error as Error,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
