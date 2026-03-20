/**
 * Shadow AI API Key Utils
 *
 * Database queries for managing Shadow AI API keys.
 * Keys authenticate incoming SIEM/proxy log data.
 */

import { sequelize } from "../database/db";
import { Transaction } from "sequelize";
import crypto from "crypto";
import { IShadowAiApiKey } from "../domain.layer/interfaces/i.shadowAi";

/**
 * Generate a new API key with format: vw_sk_{orgId}_{random}
 * Returns both the full key (shown once) and its SHA-256 hash (stored).
 */
export function generateApiKey(organizationId: number): {
  key: string;
  keyHash: string;
  keyPrefix: string;
} {
  const randomPart = crypto.randomBytes(24).toString("hex");
  const key = `vw_sk_${organizationId}_${randomPart}`;
  const keyHash = crypto.createHash("sha256").update(key).digest("hex");
  const keyPrefix = key.substring(0, 15);

  return { key, keyHash, keyPrefix };
}

/**
 * Hash an API key for comparison.
 */
export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * Extract the organization ID from an API key.
 * Key format: vw_sk_{orgId}_{random}
 */
export function extractOrganizationFromKey(key: string): number | null {
  const parts = key.split("_");
  // vw_sk_{orgId}_{random}
  if (parts.length < 4 || parts[0] !== "vw" || parts[1] !== "sk") {
    return null;
  }
  const orgId = parseInt(parts[2], 10);
  return isNaN(orgId) ? null : orgId;
}

/**
 * @deprecated Use extractOrganizationFromKey instead
 */
export function extractTenantFromKey(key: string): string | null {
  const orgId = extractOrganizationFromKey(key);
  return orgId !== null ? String(orgId) : null;
}

/**
 * Create a new API key for the organization.
 */
export async function createApiKeyQuery(
  organizationId: number,
  keyHash: string,
  keyPrefix: string,
  label: string | null,
  createdBy: number,
  transaction?: Transaction
): Promise<IShadowAiApiKey> {
  const [result] = await sequelize.query(
    `INSERT INTO shadow_ai_api_keys
       (organization_id, key_hash, key_prefix, label, created_by, is_active)
     VALUES
       (:organizationId, :keyHash, :keyPrefix, :label, :createdBy, true)
     RETURNING *`,
    {
      replacements: { organizationId, keyHash, keyPrefix, label, createdBy },
      ...(transaction ? { transaction } : {}),
    }
  );

  return (result as IShadowAiApiKey[])[0];
}

/**
 * List all API keys for the organization (without key_hash for security).
 */
export async function listApiKeysQuery(
  organizationId: number
): Promise<IShadowAiApiKey[]> {
  const [rows] = await sequelize.query(
    `SELECT id, key_prefix, label, created_by, last_used_at, is_active, created_at
     FROM shadow_ai_api_keys
     WHERE organization_id = :organizationId
     ORDER BY created_at DESC`,
    { replacements: { organizationId } }
  );

  return rows as IShadowAiApiKey[];
}

/**
 * Revoke (soft-delete) an API key by setting is_active to false.
 */
export async function revokeApiKeyQuery(
  organizationId: number,
  keyId: number,
  transaction?: Transaction
): Promise<boolean> {
  const [rows] = await sequelize.query(
    `UPDATE shadow_ai_api_keys
     SET is_active = false
     WHERE organization_id = :organizationId AND id = :keyId AND is_active = true
     RETURNING id`,
    {
      replacements: { organizationId, keyId },
      ...(transaction ? { transaction } : {}),
    }
  );

  return (rows as any[]).length > 0;
}

/**
 * Permanently delete a revoked API key.
 * Only allows deletion of keys that have already been revoked (is_active = false).
 */
export async function deleteApiKeyQuery(
  organizationId: number,
  keyId: number,
  transaction?: Transaction
): Promise<boolean> {
  const [rows] = await sequelize.query(
    `DELETE FROM shadow_ai_api_keys
     WHERE organization_id = :organizationId AND id = :keyId AND is_active = false
     RETURNING id`,
    {
      replacements: { organizationId, keyId },
      ...(transaction ? { transaction } : {}),
    }
  );

  return (rows as any[]).length > 0;
}

/**
 * Validate an API key: find the active key record by its hash.
 * Updates last_used_at on successful validation.
 */
export async function validateApiKeyQuery(
  organizationId: number,
  keyHash: string
): Promise<IShadowAiApiKey | null> {
  const [rows] = await sequelize.query(
    `UPDATE shadow_ai_api_keys
     SET last_used_at = NOW()
     WHERE organization_id = :organizationId AND key_hash = :keyHash AND is_active = true
     RETURNING id, key_prefix, label, created_by, last_used_at, is_active, created_at`,
    {
      replacements: { organizationId, keyHash },
    }
  );

  const results = rows as IShadowAiApiKey[];
  return results.length > 0 ? results[0] : null;
}

// ─── In-Memory Key Cache ──────────────────────────────────────────────
// Caches valid key hashes to avoid DB lookups on every ingestion request.

interface CachedKey {
  organizationId: number;
  validatedAt: number;
}

const keyCache = new Map<string, CachedKey>();
const KEY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const KEY_CACHE_MAX_SIZE = 10000;

/**
 * Validate an API key with caching.
 * Returns the organization ID if valid, null otherwise.
 */
export async function validateApiKeyWithCache(
  key: string
): Promise<number | null> {
  // Validate full key format: vw_sk_{orgId}_{48-char-hex}
  if (!/^vw_sk_\d+_[a-f0-9]{48}$/.test(key)) return null;

  const organizationId = extractOrganizationFromKey(key);
  if (!organizationId) return null;

  const hash = hashApiKey(key);
  const cached = keyCache.get(hash);
  const now = Date.now();

  if (cached && now - cached.validatedAt < KEY_CACHE_TTL_MS) {
    return cached.organizationId;
  }

  // Validate against DB
  const apiKey = await validateApiKeyQuery(organizationId, hash);
  if (!apiKey) {
    keyCache.delete(hash);
    return null;
  }

  // Evict oldest entries if cache is full
  if (keyCache.size >= KEY_CACHE_MAX_SIZE) {
    const firstKey = keyCache.keys().next().value;
    if (firstKey) keyCache.delete(firstKey);
  }
  keyCache.set(hash, { organizationId, validatedAt: now });
  return organizationId;
}

/**
 * Clear the key validation cache for a specific organization,
 * or all organizations if no organizationId is specified.
 */
export function clearApiKeyCache(organizationId?: number): void {
  if (!organizationId) {
    keyCache.clear();
    return;
  }
  for (const [hash, cached] of keyCache.entries()) {
    if (cached.organizationId === organizationId) {
      keyCache.delete(hash);
    }
  }
}
