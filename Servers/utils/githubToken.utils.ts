/**
 * @fileoverview GitHub Token Utilities
 *
 * Database query functions for managing GitHub tokens with encryption.
 * Tokens are encrypted at rest using AES-256-CBC encryption.
 *
 * @module utils/githubToken
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { encrypt, decrypt } from "./encryption.utils";
import {
  IGitHubToken,
  IGitHubTokenStatus,
  IGitHubTokenTestResponse,
} from "../domain.layer/interfaces/i.aiDetection";

// ============================================================================
// Organization ID Validation
// ============================================================================

/**
 * Validates organization ID.
 *
 * @param organizationId - The organization identifier
 * @throws Error if organization ID is invalid
 */
function validateOrganizationId(organizationId: number): void {
  if (!organizationId || !Number.isInteger(organizationId) || organizationId <= 0) {
    throw new Error(`Invalid organization identifier: ${organizationId}`);
  }
}

// ============================================================================
// Database Query Functions
// ============================================================================

/**
 * Ensure the github_tokens table exists
 * Note: In shared-schema multi-tenancy, this table should be created via migrations.
 * This function is kept for backwards compatibility but is a no-op.
 */
async function ensureGitHubTokensTableExists(): Promise<void> {
  // In shared-schema multi-tenancy, tables are created via migrations
  // This function is kept for backwards compatibility
}

/**
 * Get the GitHub token for an organization (returns encrypted)
 *
 * @param organizationId - The organization ID
 * @returns The token record or null if not found
 */
export async function getGitHubTokenQuery(
  organizationId: number
): Promise<IGitHubToken | null> {
  validateOrganizationId(organizationId);
  // Ensure table exists before querying
  await ensureGitHubTokensTableExists();

  const [token] = await sequelize.query<IGitHubToken>(
    `SELECT id, encrypted_token, token_name, created_by, created_at, updated_at, last_used_at
     FROM github_tokens
     WHERE organization_id = :organizationId
     ORDER BY created_at DESC
     LIMIT 1`,
    { type: QueryTypes.SELECT, replacements: { organizationId } }
  );

  return token || null;
}

/**
 * Get the GitHub token status (without returning the actual token)
 *
 * @param organizationId - The organization ID
 * @returns Status info about whether token is configured
 */
export async function getGitHubTokenStatusQuery(
  organizationId: number
): Promise<IGitHubTokenStatus> {
  const token = await getGitHubTokenQuery(organizationId);

  if (!token) {
    return { configured: false };
  }

  return {
    configured: true,
    token_name: token.token_name,
    last_used_at: token.last_used_at?.toISOString(),
    created_at: token.created_at?.toISOString(),
  };
}

/**
 * Save or update the GitHub token for an organization
 *
 * @param plainToken - The plain text token to encrypt and save
 * @param userId - The user saving the token
 * @param organizationId - The organization ID
 * @param tokenName - Optional friendly name for the token
 * @returns The saved token record
 */
export async function saveGitHubTokenQuery(
  plainToken: string,
  userId: number,
  organizationId: number,
  tokenName?: string
): Promise<IGitHubToken> {
  validateOrganizationId(organizationId);
  // Ensure table exists before saving
  await ensureGitHubTokensTableExists();

  // Encrypt the token before storing
  const encryptedToken = encrypt(plainToken);

  // Check if token already exists
  const existing = await getGitHubTokenQuery(organizationId);

  if (existing) {
    // Update existing token
    await sequelize.query(
      `UPDATE github_tokens
       SET encrypted_token = :encryptedToken,
           token_name = :tokenName,
           updated_at = NOW()
       WHERE id = :id AND organization_id = :organizationId`,
      {
        type: QueryTypes.UPDATE,
        replacements: {
          encryptedToken,
          tokenName: tokenName || "GitHub Personal Access Token",
          id: existing.id,
          organizationId,
        },
      }
    );

    return {
      ...existing,
      encrypted_token: encryptedToken,
      token_name: tokenName || existing.token_name,
      updated_at: new Date(),
    };
  }

  // Insert new token
  const result = await sequelize.query<{ id: number }>(
    `INSERT INTO github_tokens (organization_id, encrypted_token, token_name, created_by, created_at, updated_at)
     VALUES (:organizationId, :encryptedToken, :tokenName, :userId, NOW(), NOW())
     RETURNING id`,
    {
      type: QueryTypes.SELECT,
      replacements: {
        organizationId,
        encryptedToken,
        tokenName: tokenName || "GitHub Personal Access Token",
        userId,
      },
    }
  );

  const insertedId = result.length > 0 ? result[0].id : 0;

  return {
    id: insertedId,
    encrypted_token: encryptedToken,
    token_name: tokenName || "GitHub Personal Access Token",
    created_by: userId,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

/**
 * Delete the GitHub token for an organization
 *
 * @param organizationId - The organization ID
 * @returns True if token was deleted, false if no token existed
 */
export async function deleteGitHubTokenQuery(
  organizationId: number
): Promise<boolean> {
  validateOrganizationId(organizationId);
  // Check if token exists first
  const existingToken = await getGitHubTokenQuery(organizationId);
  if (!existingToken) {
    return false;
  }

  await sequelize.query(
    `DELETE FROM github_tokens WHERE organization_id = :organizationId`,
    { type: QueryTypes.DELETE, replacements: { organizationId } }
  );

  return true;
}

/**
 * Get the decrypted GitHub token for use in git operations
 *
 * @param organizationId - The organization ID
 * @returns The decrypted token or null if not found
 */
export async function getDecryptedGitHubToken(
  organizationId: number
): Promise<string | null> {
  const token = await getGitHubTokenQuery(organizationId);

  if (!token) {
    return null;
  }

  try {
    return decrypt(token.encrypted_token);
  } catch (error) {
    console.error("Failed to decrypt GitHub token:", error);
    return null;
  }
}

/**
 * Update the last_used_at timestamp for the token
 *
 * @param organizationId - The organization ID
 */
export async function updateGitHubTokenLastUsed(
  organizationId: number
): Promise<void> {
  validateOrganizationId(organizationId);
  await sequelize.query(
    `UPDATE github_tokens
     SET last_used_at = NOW(), updated_at = NOW()
     WHERE organization_id = :organizationId`,
    { type: QueryTypes.UPDATE, replacements: { organizationId } }
  );
}

// ============================================================================
// Token Validation Functions
// ============================================================================

/**
 * Test a GitHub token by making an API call
 *
 * @param token - The plain text token to test
 * @returns Test result with validity and rate limit info
 */
export async function testGitHubToken(
  token: string
): Promise<IGitHubTokenTestResponse> {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "VerifyWise-AI-Detection",
      },
    });

    if (response.status === 401) {
      return {
        valid: false,
        error: "Invalid or expired token",
      };
    }

    if (response.status === 403) {
      return {
        valid: false,
        error: "Token does not have required permissions",
      };
    }

    if (!response.ok) {
      return {
        valid: false,
        error: `GitHub API error: ${response.status} ${response.statusText}`,
      };
    }

    // Parse rate limit headers
    const rateLimit = response.headers.get("X-RateLimit-Limit");
    const rateRemaining = response.headers.get("X-RateLimit-Remaining");
    const rateReset = response.headers.get("X-RateLimit-Reset");

    // Parse scopes from header
    const scopesHeader = response.headers.get("X-OAuth-Scopes");
    const scopes = scopesHeader
      ? scopesHeader.split(",").map((s) => s.trim())
      : [];

    return {
      valid: true,
      scopes,
      rate_limit: {
        limit: rateLimit ? parseInt(rateLimit, 10) : 5000,
        remaining: rateRemaining ? parseInt(rateRemaining, 10) : 5000,
        reset: rateReset
          ? new Date(parseInt(rateReset, 10) * 1000).toISOString()
          : new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Validate GitHub token format (basic pattern check)
 *
 * GitHub PAT formats:
 * - Classic tokens: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (40 chars)
 * - Fine-grained tokens: github_pat_xxxxxxxxxx (longer)
 *
 * @param token - The token to validate
 * @returns null if valid, error message if invalid
 */
export function validateGitHubTokenFormat(token: string): string | null {
  const trimmed = token.trim();

  if (!trimmed) {
    return "Token cannot be empty";
  }

  // Classic personal access token
  if (trimmed.startsWith("ghp_")) {
    if (trimmed.length < 40) {
      return "Classic personal access token appears to be too short";
    }
    return null;
  }

  // Fine-grained personal access token
  if (trimmed.startsWith("github_pat_")) {
    if (trimmed.length < 30) {
      return "Fine-grained personal access token appears to be too short";
    }
    return null;
  }

  // OAuth token (older format)
  if (/^[a-f0-9]{40}$/i.test(trimmed)) {
    return null;
  }

  return "Token format not recognized. GitHub tokens typically start with 'ghp_' (classic) or 'github_pat_' (fine-grained)";
}
