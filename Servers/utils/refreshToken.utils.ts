/**
 * @fileoverview Refresh Token Persistence Utilities
 *
 * Database-backed storage for refresh tokens enabling:
 * - Rotation: every refresh issues a new token and revokes the old one
 * - Reuse detection: presenting an already-rotated token revokes the
 *   entire token family (theft signal)
 * - Revocation: logout and password reset invalidate tokens server-side
 *
 * Only SHA-256 hashes of tokens are stored — never the tokens themselves.
 *
 * @module utils/refreshToken
 */

import crypto from "crypto";
import { sequelize } from "../database/db";

export interface StoredRefreshToken {
  id: number;
  user_id: number;
  organization_id: number | null;
  token_hash: string;
  family_id: string;
  expires_at: Date;
  revoked_at: Date | null;
}

/** SHA-256 hash of a refresh token (what we store in the DB). */
export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Persists a newly issued refresh token. */
export async function storeRefreshToken(params: {
  userId: number;
  organizationId: number | null;
  token: string;
  familyId: string;
  expiresAt: Date;
}): Promise<void> {
  await sequelize.query(
    `INSERT INTO refresh_tokens (user_id, organization_id, token_hash, family_id, expires_at)
     VALUES (:userId, :organizationId, :tokenHash, :familyId, :expiresAt)`,
    {
      replacements: {
        userId: params.userId,
        organizationId: params.organizationId,
        tokenHash: hashRefreshToken(params.token),
        familyId: params.familyId,
        expiresAt: params.expiresAt,
      },
    },
  );
}

/** Looks up a stored refresh token by its raw value. */
export async function findRefreshToken(token: string): Promise<StoredRefreshToken | null> {
  const [rows] = (await sequelize.query(
    `SELECT * FROM refresh_tokens WHERE token_hash = :tokenHash`,
    { replacements: { tokenHash: hashRefreshToken(token) } },
  )) as [StoredRefreshToken[], unknown];
  return rows.length > 0 ? rows[0] : null;
}

/** Revokes a single token (used during rotation and logout). */
export async function revokeRefreshTokenByHash(tokenHash: string): Promise<void> {
  await sequelize.query(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE token_hash = :tokenHash AND revoked_at IS NULL`,
    { replacements: { tokenHash } },
  );
}

/**
 * Revokes every token in a rotation family.
 * Called when reuse of an already-rotated token is detected (theft signal).
 */
export async function revokeTokenFamily(familyId: string): Promise<void> {
  await sequelize.query(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE family_id = :familyId AND revoked_at IS NULL`,
    { replacements: { familyId } },
  );
}

/** Revokes all of a user's refresh tokens (password change/reset). */
export async function revokeAllUserTokens(userId: number): Promise<void> {
  await sequelize.query(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE user_id = :userId AND revoked_at IS NULL`,
    { replacements: { userId } },
  );
}
