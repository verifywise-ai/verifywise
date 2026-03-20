/**
 * Controller for Evaluation LLM API Keys
 *
 * Handles CRUD operations for LLM provider API keys used in evaluations.
 *
 * Endpoints:
 * - GET /api/evaluation-llm-keys - Get all keys for organization
 * - POST /api/evaluation-llm-keys - Add new API key
 * - DELETE /api/evaluation-llm-keys/:provider - Delete API key
 */

import { Request, Response } from 'express';
import { LLMProvider } from '../domain.layer/models/evaluationLlmApiKey/evaluationLlmApiKey.model';
import { ValidationException } from '../domain.layer/exceptions/custom.exception';
import {
  getAllKeysForOrganizationQuery,
  createKeyQuery,
  getDecryptedKeysForOrganizationQuery,
  deleteKeyQuery,
} from '../utils/evaluationLlmApiKey.utils';
import { sequelize } from '../database/db';
import { logSuccess } from '../utils/logger/logHelper';

/**
 * Get all LLM API keys for the authenticated user's organization
 *
 * Returns masked keys for security
 */
export const getAllKeys = async (req: Request, res: Response) => {
  try {
    const keys = await getAllKeysForOrganizationQuery(req.organizationId!);

    return res.status(200).json({
      success: true,
      data: keys,
    });
  } catch (error: any) {
    console.error('Error fetching LLM API keys:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch API keys',
      error: error.message,
    });
  }
};

/**
 * Add or update an LLM API key
 *
 * Request body:
 * - provider: string (openai, anthropic, google, xai, mistral, huggingface)
 * - apiKey: string (plain text - will be encrypted)
 */
export const addKey = async (req: Request, res: Response) => {
  const transaction = await sequelize.transaction();
  try {
    const { provider, apiKey } = req.body;

    // Validate inputs
    if (!provider) {
      throw new ValidationException('Provider is required', 'provider', provider);
    }

    if (!apiKey) {
      throw new ValidationException('API key is required', 'apiKey', apiKey);
    }

    // Create or update key
    const keyData = await createKeyQuery(
      req.organizationId!,
      provider as LLMProvider,
      apiKey,
      transaction
    );

    await logSuccess({
      eventType: 'Create',
      description: `Added/updated LLM API key for provider: ${provider} by user: ${req.userId}`,
      functionName: 'addKey',
      fileName: 'evaluationLlmApiKey.ctrl.ts',
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    await transaction.commit();
    return res.status(201).json({
      success: true,
      message: 'API key saved successfully',
      data: keyData,
    });
  } catch (error: any) {
    console.error('Error adding/updating LLM API key:', error);
    await transaction.rollback();
    if (error instanceof ValidationException) {
      return res.status(400).json({
        success: false,
        message: error.message,
        field: error.metadata.field,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to save API key',
      error: error.message,
    });
  }
};

/**
 * Get all decrypted LLM API keys for evaluations (internal endpoint)
 *
 * This endpoint returns the actual decrypted API keys for use by the evaluation server.
 * Should only be accessible from internal services (localhost).
 *
 * Query params:
 * - organizationId: number (required)
 */
export const getDecryptedKeys = async (req: Request, res: Response) => {
  try {
    // Get all decrypted keys for the organization
    const decryptedKeys = await getDecryptedKeysForOrganizationQuery(req.organizationId!);

    return res.status(200).json({
      success: true,
      data: decryptedKeys,
    });
  } catch (error: any) {
    console.error('Error fetching decrypted LLM API keys:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch API keys',
      error: error.message,
    });
  }
};

/**
 * Verify an LLM API key by making a test call to the provider
 *
 * This endpoint allows the frontend to verify API keys without CORS issues.
 * The backend makes the request to the provider API on behalf of the client.
 *
 * Request body:
 * - provider: string (openai, anthropic, google, xai, mistral, huggingface, openrouter)
 * - apiKey: string (plain text API key to verify)
 */
export const verifyKey = async (req: Request, res: Response) => {
  try {
    const { provider, apiKey } = req.body;

    if (!provider) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: 'Provider is required',
      });
    }

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: 'API key is required',
      });
    }

    // Provider-specific verification endpoints
    const endpoints: Record<string, { url: string; headers: Record<string, string>; method?: string }> = {
      openai: {
        url: 'https://api.openai.com/v1/models',
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      anthropic: {
        url: 'https://api.anthropic.com/v1/models',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      },
      google: {
        url: `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,
        headers: {},
      },
      xai: {
        url: 'https://api.x.ai/v1/models',
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      mistral: {
        url: 'https://api.mistral.ai/v1/models',
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      huggingface: {
        url: 'https://huggingface.co/api/whoami',
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      openrouter: {
        url: 'https://openrouter.ai/api/v1/auth/key',
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    };

    const config = endpoints[provider];
    if (!config) {
      // Unknown provider, skip verification
      return res.status(200).json({
        success: true,
        valid: true,
        message: 'Provider not configured for verification, assuming valid',
      });
    }

    try {
      const response = await fetch(config.url, {
        method: config.method || 'GET',
        headers: {
          ...config.headers,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        return res.status(200).json({
          success: true,
          valid: true,
          message: 'API key verified successfully',
        });
      } else if (response.status === 401 || response.status === 403) {
        return res.status(200).json({
          success: true,
          valid: false,
          message: 'Invalid API key - authentication failed',
        });
      } else if (response.status === 400) {
        let errorMsg = 'Invalid API key';
        try {
          const data = await response.json();
          errorMsg = data?.error?.message || data?.message || errorMsg;
        } catch {
          // Ignore JSON parse errors
        }
        return res.status(200).json({
          success: true,
          valid: false,
          message: errorMsg,
        });
      } else if (response.status === 429) {
        // Rate limited - key might be valid
        return res.status(200).json({
          success: true,
          valid: true,
          message: 'Rate limited, but key appears valid',
        });
      } else {
        // Other errors - give benefit of doubt
        console.warn('API key verification got status', response.status, 'for provider:', provider);
        return res.status(200).json({
          success: true,
          valid: true,
          message: 'Could not verify key, assuming valid',
        });
      }
    } catch (fetchError: any) {
      console.error('Error verifying API key for provider:', provider, '-', fetchError.message);
      // Network errors - give benefit of doubt
      return res.status(200).json({
        success: true,
        valid: true,
        message: 'Network error during verification, assuming valid',
      });
    }
  } catch (error: any) {
    console.error('Error in verifyKey controller:', error);
    return res.status(500).json({
      success: false,
      valid: false,
      message: 'Failed to verify API key',
      error: error.message,
    });
  }
};

/**
 * Delete an LLM API key
 *
 * URL params:
 * - provider: string (openai, anthropic, google, xai, mistral, huggingface)
 */
export const deleteKey = async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;

    if (!provider) {
      throw new ValidationException('Provider is required', 'provider', provider);
    }

    const deleted = await deleteKeyQuery(
      req.organizationId!,
      provider as LLMProvider
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: `No API key found for provider: ${provider}`,
      });
    }

    logSuccess({
      eventType: 'Delete',
      description: `LLM API key deleted for provider: ${provider} by user: ${req.userId}`,
      functionName: 'deleteKey',
      fileName: 'evaluationLlmApiKey.ctrl.ts',
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json({
      success: true,
      message: 'API key deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting LLM API key:', error);

    if (error instanceof ValidationException) {
      return res.status(400).json({
        success: false,
        message: error.message,
        field: error.metadata.field,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to delete API key',
      error: error.message,
    });
  }
};
