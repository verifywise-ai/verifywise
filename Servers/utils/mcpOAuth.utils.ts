/**
 * @fileoverview Persistence for the MCP server's OAuth flow
 *
 * Clients, authorization codes, grants and refresh tokens. Codes and refresh
 * tokens are stored as SHA-256 hashes, never as the values handed out.
 * Tables are created in 20261126085712-create-mcp-oauth-tables.js.
 *
 * @module utils/mcpOAuth
 */

import crypto from "crypto";
import { Transaction } from "sequelize";
import { sequelize } from "../database/db";

/** SHA-256 hash of an authorization code or refresh token (what is stored). */
export function hashOAuthSecret(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export interface StoredOAuthClient {
  client_id: string;
  client_info: Record<string, unknown>;
  client_secret_encrypted: string | null;
}

export async function getOAuthClientQuery(clientId: string): Promise<StoredOAuthClient | null> {
  const [rows] = (await sequelize.query(
    `SELECT client_id, client_info, client_secret_encrypted
       FROM oauth_clients WHERE client_id = :clientId`,
    { replacements: { clientId } },
  )) as [StoredOAuthClient[], unknown];
  return rows[0] ?? null;
}

export async function createOAuthClientQuery(params: {
  clientId: string;
  clientInfo: Record<string, unknown>;
  clientSecretEncrypted: string | null;
}): Promise<void> {
  await sequelize.query(
    `INSERT INTO oauth_clients (client_id, client_info, client_secret_encrypted)
     VALUES (:clientId, :clientInfo, :clientSecretEncrypted)`,
    {
      replacements: {
        clientId: params.clientId,
        clientInfo: JSON.stringify(params.clientInfo),
        clientSecretEncrypted: params.clientSecretEncrypted,
      },
    },
  );
}

export interface StoredAuthorizationCode {
  client_id: string;
  user_id: number;
  organization_id: number | null;
  redirect_uri: string;
  code_challenge: string;
  resource: string;
}

export async function createAuthorizationCodeQuery(params: {
  code: string;
  clientId: string;
  userId: number;
  organizationId: number | null;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  expiresAt: Date;
}): Promise<void> {
  await sequelize.query(
    `INSERT INTO oauth_authorization_codes
       (code_hash, client_id, user_id, organization_id, redirect_uri, code_challenge, resource, expires_at)
     VALUES
       (:codeHash, :clientId, :userId, :organizationId, :redirectUri, :codeChallenge, :resource, :expiresAt)`,
    {
      replacements: {
        codeHash: hashOAuthSecret(params.code),
        clientId: params.clientId,
        userId: params.userId,
        organizationId: params.organizationId,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        resource: params.resource,
        expiresAt: params.expiresAt,
      },
    },
  );
}

/** An unexpired, unused code issued to this client. Does not consume it. */
export async function getUsableAuthorizationCodeQuery(
  code: string,
  clientId: string,
): Promise<StoredAuthorizationCode | null> {
  const [rows] = (await sequelize.query(
    `SELECT client_id, user_id, organization_id, redirect_uri, code_challenge, resource
       FROM oauth_authorization_codes
      WHERE code_hash = :codeHash AND client_id = :clientId
        AND consumed_at IS NULL AND expires_at > now()`,
    { replacements: { codeHash: hashOAuthSecret(code), clientId } },
  )) as [StoredAuthorizationCode[], unknown];
  return rows[0] ?? null;
}

/**
 * Marks a usable code as used and returns it. The single UPDATE makes the
 * code single-use even when two token requests race: only one gets a row.
 */
export async function consumeAuthorizationCodeQuery(
  code: string,
  clientId: string,
  transaction: Transaction,
): Promise<StoredAuthorizationCode | null> {
  const [rows] = (await sequelize.query(
    `UPDATE oauth_authorization_codes SET consumed_at = now()
      WHERE code_hash = :codeHash AND client_id = :clientId
        AND consumed_at IS NULL AND expires_at > now()
      RETURNING client_id, user_id, organization_id, redirect_uri, code_challenge, resource`,
    { replacements: { codeHash: hashOAuthSecret(code), clientId }, transaction },
  )) as [StoredAuthorizationCode[], unknown];
  return rows[0] ?? null;
}

export interface StoredGrant {
  id: number;
  client_id: string;
  user_id: number;
  organization_id: number | null;
}

export async function createGrantQuery(
  params: { clientId: string; userId: number; organizationId: number | null },
  transaction: Transaction,
): Promise<StoredGrant> {
  const [rows] = (await sequelize.query(
    `INSERT INTO oauth_grants (client_id, user_id, organization_id)
     VALUES (:clientId, :userId, :organizationId)
     RETURNING id, client_id, user_id, organization_id`,
    { replacements: params, transaction },
  )) as [StoredGrant[], unknown];
  return rows[0];
}

/**
 * The grant an access token names, while it is not revoked. The user and
 * organization come from the token too, so a token can only ever match the
 * grant it was issued for.
 */
export async function getActiveGrantQuery(
  grantId: number,
  userId: number,
  organizationId: number | null,
): Promise<StoredGrant | null> {
  const [rows] = (await sequelize.query(
    `SELECT id, client_id, user_id, organization_id FROM oauth_grants
      WHERE id = :grantId AND user_id = :userId
        AND organization_id IS NOT DISTINCT FROM :organizationId
        AND revoked_at IS NULL`,
    { replacements: { grantId, userId, organizationId } },
  )) as [StoredGrant[], unknown];
  return rows[0] ?? null;
}

/** Best-effort usage stamp, like api_tokens.last_used_at. */
export async function touchGrantLastUsedQuery(grantId: number): Promise<void> {
  await sequelize.query(`UPDATE oauth_grants SET last_used_at = now() WHERE id = :grantId`, {
    replacements: { grantId },
  });
}

export async function revokeGrantQuery(grantId: number, transaction?: Transaction): Promise<void> {
  await sequelize.query(
    `UPDATE oauth_grants SET revoked_at = now() WHERE id = :grantId AND revoked_at IS NULL`,
    { replacements: { grantId }, transaction },
  );
}

/** Revokes one of the user's own grants. False when they have no such active grant. */
export async function revokeUserGrantQuery(grantId: number, userId: number): Promise<boolean> {
  const [rows] = (await sequelize.query(
    `UPDATE oauth_grants SET revoked_at = now()
      WHERE id = :grantId AND user_id = :userId AND revoked_at IS NULL
      RETURNING id`,
    { replacements: { grantId, userId } },
  )) as [{ id: number }[], unknown];
  return rows.length > 0;
}

export interface UserGrant {
  id: number;
  client_name: string | null;
  organization_name: string | null;
  created_at: Date;
  last_used_at: Date | null;
}

/** The user's active connections, newest first. */
export async function getUserGrantsQuery(userId: number): Promise<UserGrant[]> {
  const [rows] = (await sequelize.query(
    `SELECT g.id, c.client_info->>'client_name' AS client_name, o.name AS organization_name,
            g.created_at, g.last_used_at
       FROM oauth_grants g
       JOIN oauth_clients c ON c.client_id = g.client_id
       LEFT JOIN organizations o ON o.id = g.organization_id
      WHERE g.user_id = :userId AND g.revoked_at IS NULL
      ORDER BY g.created_at DESC`,
    { replacements: { userId } },
  )) as [UserGrant[], unknown];
  return rows;
}

export async function storeOAuthRefreshTokenQuery(
  params: { token: string; grantId: number; expiresAt: Date },
  transaction: Transaction,
): Promise<void> {
  await sequelize.query(
    `INSERT INTO oauth_refresh_tokens (token_hash, grant_id, expires_at)
     VALUES (:tokenHash, :grantId, :expiresAt)`,
    {
      replacements: {
        tokenHash: hashOAuthSecret(params.token),
        grantId: params.grantId,
        expiresAt: params.expiresAt,
      },
      transaction,
    },
  );
}

export interface StoredOAuthRefreshToken {
  id: number;
  grant_id: number;
  expires_at: Date;
  rotated_at: Date | null;
  client_id: string;
  user_id: number;
  organization_id: number | null;
  grant_revoked_at: Date | null;
}

/** A refresh token with its grant, locked for the rotation that follows. */
export async function findOAuthRefreshTokenForUpdateQuery(
  token: string,
  transaction: Transaction,
): Promise<StoredOAuthRefreshToken | null> {
  const [rows] = (await sequelize.query(
    `SELECT t.id, t.grant_id, t.expires_at, t.rotated_at,
            g.client_id, g.user_id, g.organization_id, g.revoked_at AS grant_revoked_at
       FROM oauth_refresh_tokens t JOIN oauth_grants g ON g.id = t.grant_id
      WHERE t.token_hash = :tokenHash
      FOR UPDATE OF t`,
    { replacements: { tokenHash: hashOAuthSecret(token) }, transaction },
  )) as [StoredOAuthRefreshToken[], unknown];
  return rows[0] ?? null;
}

export async function markOAuthRefreshTokenRotatedQuery(
  id: number,
  transaction: Transaction,
): Promise<void> {
  await sequelize.query(`UPDATE oauth_refresh_tokens SET rotated_at = now() WHERE id = :id`, {
    replacements: { id },
    transaction,
  });
}

/** The grant a refresh token belongs to, for revocation (RFC 7009). */
export async function getGrantIdForRefreshTokenQuery(
  token: string,
  clientId: string,
): Promise<number | null> {
  const [rows] = (await sequelize.query(
    `SELECT t.grant_id FROM oauth_refresh_tokens t JOIN oauth_grants g ON g.id = t.grant_id
      WHERE t.token_hash = :tokenHash AND g.client_id = :clientId`,
    { replacements: { tokenHash: hashOAuthSecret(token), clientId } },
  )) as [{ grant_id: number }[], unknown];
  return rows[0]?.grant_id ?? null;
}
