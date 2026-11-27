/**
 * OAuth for the MCP server, so an MCP client such as Claude Code can sign in
 * through the browser instead of being handed an API token.
 *
 * This deployment is both the authorization server and the resource server
 * (/api/mcp), as the MCP authorization spec allows
 * (https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).
 * The SDK's handlers (routes/v1/mcpOAuth.route.ts) do the protocol checks:
 * parameter validation, PKCE verification, client authentication, rate
 * limits. This file is the provider they call, holding what is ours: storage,
 * the consent hand-off, and the tokens.
 *
 * The flow:
 * 1. The client calls /api/mcp without a token and gets a 401 naming the
 *    protected resource metadata, which names this issuer.
 * 2. It registers itself (dynamic client registration) and opens the browser
 *    on /authorize, which validates the request and redirects to the consent
 *    page (/mcp/authorize) with the request signed into a short-lived token.
 * 3. The signed-in user allows it there (controllers/mcpOAuth.ctrl.ts), for
 *    the organization of their session. That issues a single-use code bound
 *    to the PKCE challenge, redirect URI and resource.
 * 4. The client exchanges the code at /token for a one-hour access token and
 *    a refresh token. The exchange creates a grant: the connection the user
 *    sees in the MCP tab and can revoke there.
 *
 * Access tokens are JWTs with `type: "mcp_access"`, `aud` (this MCP server)
 * and the grant id. authenticateJWTForMcp accepts them on /api/mcp only, with the
 * same user, membership and role checks as every other token, and rejects them
 * once their grant is revoked. Refresh tokens are random, stored hashed, and
 * rotated on every use; presenting one that was already rotated revokes the
 * grant, since only a copy could still hold it.
 */

import crypto from "crypto";
import type { Response } from "express";
import type { OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  InvalidGrantError,
  InvalidTargetError,
  InvalidTokenError,
  ServerError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type {
  OAuthClientInformationFull,
  OAuthMetadata,
  OAuthProtectedResourceMetadata,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  generateMcpAccessToken,
  generateMcpAuthorizationRequestToken,
  getTokenPayload,
  ONE_HOUR_MS,
  THIRTY_DAYS_MS,
} from "../utils/jwt.utils";
import { normaliseHttpUrl } from "../utils/publicUrl.utils";
import { decrypt, encrypt } from "../utils/encryption.utils";
import { getUserByIdQuery } from "../utils/user.utils";
import { getRoleNameById } from "../utils/roleMap";
import {
  consumeAuthorizationCodeQuery,
  createAuthorizationCodeQuery,
  createGrantQuery,
  createOAuthClientQuery,
  findOAuthRefreshTokenForUpdateQuery,
  getActiveGrantQuery,
  getGrantIdForRefreshTokenQuery,
  getOAuthClientQuery,
  getUsableAuthorizationCodeQuery,
  markOAuthRefreshTokenRotatedQuery,
  revokeGrantQuery,
  StoredGrant,
  storeOAuthRefreshTokenQuery,
} from "../utils/mcpOAuth.utils";

const AUTHORIZATION_CODE_LIFETIME_MS = 5 * 60 * 1000;

/**
 * Where everything lives, from FRONTEND_URL: deployments serve the API under
 * the app's address (nginx proxies /api/ to the backend), and that is the
 * address the MCP tab tells users to connect to. Null when FRONTEND_URL is not
 * set, in which case sign-in is unavailable and API tokens still work.
 */
export function mcpOAuthUrls(): {
  resource: string;
  issuer: string;
  resourceMetadata: string;
  consentPage: string;
} | null {
  const base = normaliseHttpUrl(process.env.FRONTEND_URL);
  if (!base) return null;
  return {
    resource: `${base}/api/mcp`,
    issuer: `${base}/api/v1/oauth`,
    resourceMetadata: `${base}/.well-known/oauth-protected-resource/api/mcp`,
    consentPage: `${base}/mcp/authorize`,
  };
}

function requireUrls() {
  const urls = mcpOAuthUrls();
  if (!urls) throw new ServerError("Sign-in is not configured on this deployment (FRONTEND_URL)");
  return urls;
}

/** RFC 8707 resource comparison: scheme and host are case-insensitive, a trailing slash is ignored. */
function isSameResource(a: string | URL, b: string): boolean {
  const normalise = (value: string | URL) => {
    const url = new URL(value.toString());
    url.hash = "";
    return url.href.replace(/\/+$/, "");
  };
  try {
    return normalise(a) === normalise(b);
  } catch {
    return false;
  }
}

/** RFC 9728 protected resource metadata for /api/mcp. */
export function protectedResourceMetadata(): OAuthProtectedResourceMetadata | null {
  const urls = mcpOAuthUrls();
  if (!urls) return null;
  return {
    resource: urls.resource,
    authorization_servers: [urls.issuer],
    resource_name: "VerifyWise",
  };
}

/** RFC 8414 authorization server metadata. */
export function authorizationServerMetadata(): OAuthMetadata | null {
  const urls = mcpOAuthUrls();
  if (!urls) return null;
  return {
    issuer: urls.issuer,
    authorization_endpoint: `${urls.issuer}/authorize`,
    token_endpoint: `${urls.issuer}/token`,
    registration_endpoint: `${urls.issuer}/register`,
    revocation_endpoint: `${urls.issuer}/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post"],
  };
}

/**
 * The grant an access token's claims name, when the token is an MCP access
 * token for this server and its grant is still active. Expiry is the caller's
 * to check, as for every other token (authenticateJWT).
 */
export async function activeGrantForAccessToken(decoded: {
  type?: string;
  aud?: string;
  grantId?: number;
  id?: number;
  organizationId?: number | null;
}): Promise<StoredGrant | null> {
  const urls = mcpOAuthUrls();
  if (
    !urls ||
    decoded.type !== "mcp_access" ||
    typeof decoded.aud !== "string" ||
    !isSameResource(decoded.aud, urls.resource) ||
    typeof decoded.grantId !== "number" ||
    typeof decoded.id !== "number"
  ) {
    return null;
  }
  return getActiveGrantQuery(decoded.grantId, decoded.id, decoded.organizationId ?? null);
}

/** Issues an access token and a refresh token for a grant, with the user's current role. */
async function issueTokens(grant: StoredGrant, transaction: Transaction): Promise<OAuthTokens> {
  const urls = requireUrls();
  // Without an organization the user is a pure super admin, whose tokens
  // carry "SuperAdmin" (as loginUser and createApiToken mint them). Otherwise
  // the role is their role in that organization now, which authenticateJWT
  // compares on every request, so a demotion takes effect at once.
  const user =
    grant.organization_id === null
      ? await getUserByIdQuery(grant.user_id, transaction)
      : await getUserByIdQuery(grant.user_id, transaction, grant.organization_id);
  if (!user) throw new InvalidGrantError("The user no longer has access");
  const roleName =
    grant.organization_id === null ? "SuperAdmin" : await getRoleNameById(user.role_id!);
  if (!roleName) throw new InvalidGrantError("The user no longer has access");

  const accessToken = generateMcpAccessToken({
    id: grant.user_id,
    email: user.email!,
    roleName,
    organizationId: grant.organization_id,
    grantId: grant.id,
    aud: urls.resource,
  });
  if (!accessToken) throw new ServerError("Could not issue an access token");

  const refreshToken = crypto.randomBytes(32).toString("base64url");
  await storeOAuthRefreshTokenQuery(
    { token: refreshToken, grantId: grant.id, expiresAt: new Date(Date.now() + THIRTY_DAYS_MS) },
    transaction,
  );

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ONE_HOUR_MS / 1000,
    refresh_token: refreshToken,
  };
}

export const mcpOAuthProvider: OAuthServerProvider = {
  clientsStore: {
    async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
      const row = await getOAuthClientQuery(clientId);
      if (!row) return undefined;
      return {
        ...(row.client_info as Omit<OAuthClientInformationFull, "client_id">),
        client_id: row.client_id,
        client_secret: row.client_secret_encrypted
          ? decrypt(row.client_secret_encrypted)
          : undefined,
      };
    },

    /** The SDK has generated the client id (and, for a confidential client, the secret). */
    async registerClient(client: OAuthClientInformationFull): Promise<OAuthClientInformationFull> {
      const { client_id, client_secret, ...clientInfo } = client;
      await createOAuthClientQuery({
        clientId: client_id,
        clientInfo,
        clientSecretEncrypted: client_secret ? encrypt(client_secret) : null,
      });
      return client;
    },
  },

  /**
   * The SDK has checked the client, the redirect URI, and that PKCE uses S256.
   * The user decides on the consent page; the request travels there signed,
   * so nothing in it can be changed on the way.
   */
  async authorize(client, params, res: Response): Promise<void> {
    const urls = requireUrls();
    if (params.resource && !isSameResource(params.resource, urls.resource)) {
      throw new InvalidTargetError(`This server issues tokens only for ${urls.resource}`);
    }
    const request = generateMcpAuthorizationRequestToken({
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state ?? null,
      resource: urls.resource,
    });
    if (!request) throw new ServerError("Could not start the authorization");
    res.redirect(302, `${urls.consentPage}?request=${encodeURIComponent(request)}`);
  },

  async challengeForAuthorizationCode(client, authorizationCode): Promise<string> {
    const code = await getUsableAuthorizationCodeQuery(authorizationCode, client.client_id);
    if (!code) throw new InvalidGrantError("Invalid or expired authorization code");
    return code.code_challenge;
  },

  async exchangeAuthorizationCode(
    client,
    authorizationCode,
    _codeVerifier,
    redirectUri,
    resource,
  ): Promise<OAuthTokens> {
    const transaction = await sequelize.transaction();
    try {
      const code = await consumeAuthorizationCodeQuery(
        authorizationCode,
        client.client_id,
        transaction,
      );
      if (!code) throw new InvalidGrantError("Invalid or expired authorization code");
      if (redirectUri !== undefined && redirectUri !== code.redirect_uri) {
        throw new InvalidGrantError("redirect_uri does not match the authorization request");
      }
      if (resource && !isSameResource(resource, code.resource)) {
        throw new InvalidTargetError("resource does not match the authorization request");
      }
      const grant = await createGrantQuery(
        { clientId: client.client_id, userId: code.user_id, organizationId: code.organization_id },
        transaction,
      );
      const tokens = await issueTokens(grant, transaction);
      await transaction.commit();
      return tokens;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async exchangeRefreshToken(client, refreshToken, _scopes, resource): Promise<OAuthTokens> {
    const transaction = await sequelize.transaction();
    let committed = false;
    try {
      const stored = await findOAuthRefreshTokenForUpdateQuery(refreshToken, transaction);
      if (!stored || stored.client_id !== client.client_id || stored.grant_revoked_at) {
        throw new InvalidGrantError("Invalid refresh token");
      }
      if (stored.rotated_at) {
        // Rotated tokens are never handed out again, so this is a copy: end
        // the connection for whoever holds it, the legitimate client included.
        await revokeGrantQuery(stored.grant_id, transaction);
        await transaction.commit();
        committed = true;
        throw new InvalidGrantError("Refresh token was already used; the connection is revoked");
      }
      if (new Date(stored.expires_at).getTime() <= Date.now()) {
        throw new InvalidGrantError("Refresh token expired");
      }
      const urls = requireUrls();
      if (resource && !isSameResource(resource, urls.resource)) {
        throw new InvalidTargetError(`This server issues tokens only for ${urls.resource}`);
      }
      await markOAuthRefreshTokenRotatedQuery(stored.id, transaction);
      const tokens = await issueTokens(
        {
          id: stored.grant_id,
          client_id: stored.client_id,
          user_id: stored.user_id,
          organization_id: stored.organization_id,
        },
        transaction,
      );
      await transaction.commit();
      committed = true;
      return tokens;
    } catch (error) {
      if (!committed) await transaction.rollback();
      throw error;
    }
  },

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const decoded = getTokenPayload(token);
    if (!decoded || typeof decoded.expire !== "number" || decoded.expire < Date.now()) {
      throw new InvalidTokenError("Invalid or expired access token");
    }
    const grant = await activeGrantForAccessToken(decoded);
    if (!grant) throw new InvalidTokenError("Invalid or expired access token");
    return {
      token,
      clientId: grant.client_id,
      scopes: [],
      expiresAt: Math.floor(decoded.expire / 1000),
      resource: new URL(decoded.aud),
    };
  },

  /** RFC 7009: revoking either token ends the whole grant. Unknown tokens are ignored. */
  async revokeToken(client, request: OAuthTokenRevocationRequest): Promise<void> {
    const fromRefreshToken = await getGrantIdForRefreshTokenQuery(request.token, client.client_id);
    if (fromRefreshToken !== null) {
      await revokeGrantQuery(fromRefreshToken);
      return;
    }
    const decoded = getTokenPayload(request.token);
    if (!decoded) return;
    const grant = await activeGrantForAccessToken(decoded);
    if (grant && grant.client_id === client.client_id) {
      await revokeGrantQuery(grant.id);
    }
  },
};

export interface McpAuthorizationRequest {
  clientId: string;
  clientName: string | null;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  resource: string;
}

/** The authorization request a consent page was opened with, when it is genuine and unexpired. */
export async function readAuthorizationRequest(
  requestToken: string,
): Promise<McpAuthorizationRequest | null> {
  const decoded = getTokenPayload(requestToken);
  if (
    !decoded ||
    decoded.type !== "mcp_authorization_request" ||
    typeof decoded.expire !== "number" ||
    decoded.expire < Date.now()
  ) {
    return null;
  }
  const client = await getOAuthClientQuery(decoded.clientId);
  if (!client) return null;
  const clientName = client.client_info.client_name;
  return {
    clientId: decoded.clientId,
    clientName: typeof clientName === "string" ? clientName : null,
    redirectUri: decoded.redirectUri,
    codeChallenge: decoded.codeChallenge,
    state: decoded.state ?? null,
    resource: decoded.resource,
  };
}

/** The client's redirect URI with the given parameters added (state included when the request had one). */
function redirectWith(request: McpAuthorizationRequest, params: Record<string, string>): string {
  const url = new URL(request.redirectUri);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (request.state !== null) url.searchParams.set("state", request.state);
  return url.href;
}

/** Issues a code for the user's session organization; returns where to send the browser. */
export async function approveAuthorizationRequest(
  request: McpAuthorizationRequest,
  user: { userId: number; organizationId: number | null },
): Promise<string> {
  const code = crypto.randomBytes(32).toString("base64url");
  await createAuthorizationCodeQuery({
    code,
    clientId: request.clientId,
    userId: user.userId,
    organizationId: user.organizationId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    resource: request.resource,
    expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_LIFETIME_MS),
  });
  return redirectWith(request, { code });
}

/** Where to send the browser when the user declines. */
export function denyAuthorizationRequest(request: McpAuthorizationRequest): string {
  return redirectWith(request, {
    error: "access_denied",
    error_description: "The user declined the request",
  });
}
