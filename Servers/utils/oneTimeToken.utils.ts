/**
 * @fileoverview One-Time Token Utilities
 *
 * Database-backed single-use tokens for sensitive email links
 * (currently: password reset). A SHA-256 hash of every issued token is
 * stored; the token is atomically consumed on first use so a leaked link
 * cannot be replayed.
 *
 * @module utils/oneTimeToken
 */

import crypto from "crypto";
import { sequelize } from "../database/db";

export type OneTimeTokenPurpose = "password_reset";

export interface StoredOneTimeToken {
  id: number;
  token_hash: string;
  email: string;
  purpose: OneTimeTokenPurpose;
  expires_at: Date;
  consumed_at: Date | null;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Persists a newly issued one-time token (stores only the hash). */
export async function storeOneTimeToken(params: {
  token: string;
  email: string;
  purpose: OneTimeTokenPurpose;
  expiresAt: Date;
}): Promise<void> {
  await sequelize.query(
    `INSERT INTO one_time_tokens (token_hash, email, purpose, expires_at)
     VALUES (:tokenHash, :email, :purpose, :expiresAt)`,
    {
      replacements: {
        tokenHash: hashToken(params.token),
        email: params.email,
        purpose: params.purpose,
        expiresAt: params.expiresAt,
      },
    },
  );
}

/**
 * Atomically consumes a one-time token.
 *
 * Returns the stored row when the token exists, is unconsumed, unexpired
 * and matches the expected purpose — and marks it consumed in the same
 * statement (replay-safe). Returns null otherwise.
 */
export async function consumeOneTimeToken(
  token: string,
  purpose: OneTimeTokenPurpose,
): Promise<StoredOneTimeToken | null> {
  const [rows] = (await sequelize.query(
    `UPDATE one_time_tokens SET consumed_at = now()
     WHERE token_hash = :tokenHash
       AND purpose = :purpose
       AND consumed_at IS NULL
       AND expires_at > now()
     RETURNING *`,
    { replacements: { tokenHash: hashToken(token), purpose } },
  )) as [StoredOneTimeToken[], unknown];
  return rows.length > 0 ? rows[0] : null;
}
