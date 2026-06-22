import { QueryTypes, Transaction } from "sequelize";
import crypto from "crypto";
import { sequelize } from "../database/db";
import { IToken } from "../domain.layer/interfaces/i.tokens";
import { TokenModel } from "../domain.layer/models/tokens/tokens.model";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";

/**
 * Hash an API token (the signed JWT string) for storage and lookup.
 * Only the SHA-256 hash is persisted; the raw token is shown to the creator
 * once and never stored. Mirrors the Shadow AI API key pattern.
 */
export const hashApiToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

export const getNumberOfApiTokensQuery = async (organizationId: number) => {
  // Only active (non-revoked) tokens count toward the per-organization limit.
  // Revoked rows are retained for audit but must not consume a slot, otherwise
  // revoking a token would permanently reduce the org's creation capacity.
  const numberOfTokens = (await sequelize.query(
    `SELECT COUNT(*) FROM api_tokens WHERE organization_id = :organizationId AND revoked = false;`,
    { replacements: { organizationId } },
  )) as [{ count: string }[], number];
  return parseInt(numberOfTokens[0][0].count, 10);
};

export const createApiTokenQuery = async (
  tokenPayload: IToken,
  organizationId: number,
  transaction: Transaction,
) => {
  // Check if an active (non-revoked) token with this name already exists.
  // A revoked token frees up its name for reuse.
  const existingToken = (await sequelize.query(
    `SELECT id FROM api_tokens
       WHERE organization_id = :organizationId AND name = :name AND revoked = false;`,
    {
      replacements: { organizationId, name: tokenPayload.name },
      transaction,
    },
  )) as [{ id: number }[], number];

  if (existingToken[0].length > 0) {
    throw new ValidationException(
      "A token with this name already exists. Please use a different name.",
    );
  }

  // `tokenPayload.token` is the SHA-256 hash of the JWT, not the JWT itself.
  // The raw token is returned to the caller by the controller and never stored.
  // The hash column is intentionally excluded from RETURNING so it never leaves
  // the database.
  const result = (await sequelize.query(
    `INSERT INTO api_tokens (
      organization_id, token, name, expires_at, created_by
    ) VALUES (
      :organizationId, :token, :name, :expires_at, :created_by
    ) RETURNING id, organization_id, name, expires_at, created_by, created_at, revoked;`,
    {
      replacements: {
        organizationId,
        token: tokenPayload.token,
        name: tokenPayload.name,
        expires_at: tokenPayload.expires_at,
        created_by: tokenPayload.created_by,
      },
      transaction,
    },
  )) as [IToken[], number];
  return result[0][0];
};

/**
 * Look up an active API token by the hash of its raw value.
 *
 * Returns the row only when it exists, is not revoked, and has not expired.
 * This is the database-backed check that makes API tokens revocable: the auth
 * middleware calls it for every request that carries a `type: "api_token"` JWT.
 * Scoped by organization to keep the lookup tenant-isolated.
 */
export const getActiveApiTokenByHashQuery = async (
  organizationId: number,
  tokenHash: string,
): Promise<{ id: number; revoked: boolean; expires_at: Date } | null> => {
  const result = (await sequelize.query(
    `SELECT id, revoked, expires_at FROM api_tokens
       WHERE organization_id = :organizationId
         AND token = :tokenHash
         AND revoked = false
         AND expires_at > NOW()
       LIMIT 1;`,
    { replacements: { organizationId, tokenHash } },
  )) as [{ id: number; revoked: boolean; expires_at: Date }[], number];
  return result[0][0] ?? null;
};

/**
 * Record the moment an API token was last used to authenticate.
 * Best-effort: a failure here must not block the request.
 */
export const touchApiTokenLastUsedQuery = async (
  id: number,
  organizationId: number,
): Promise<void> => {
  await sequelize.query(
    `UPDATE api_tokens SET last_used_at = NOW()
       WHERE id = :id AND organization_id = :organizationId;`,
    { replacements: { id, organizationId } },
  );
};

/**
 * Soft-revoke an API token. The row is kept (so it stays visible as revoked in
 * the UI and audit trail) but can no longer authenticate. Returns false when no
 * matching active token exists.
 */
export const revokeApiTokenQuery = async (id: number, organizationId: number): Promise<boolean> => {
  const result = (await sequelize.query(
    `UPDATE api_tokens SET revoked = true
       WHERE id = :id AND organization_id = :organizationId AND revoked = false
       RETURNING id;`,
    { replacements: { id, organizationId } },
  )) as [{ id: number }[], number];
  return result[0].length > 0;
};

export const getApiTokensQuery = async (organizationId: number) => {
  const result = (await sequelize.query(
    `SELECT id, name, expires_at, created_by, created_at, revoked, last_used_at
       FROM api_tokens WHERE organization_id = :organizationId ORDER BY created_at DESC;`,
    { replacements: { organizationId } },
  )) as [TokenModel[], number];
  return result[0];
};

export const deleteApiTokenQuery = async (id: number, organizationId: number) => {
  const result = await sequelize.query(
    `DELETE FROM api_tokens WHERE organization_id = :organizationId AND id = :id RETURNING *;`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: TokenModel,
      type: QueryTypes.DELETE,
    },
  );
  return result.length > 0;
};
