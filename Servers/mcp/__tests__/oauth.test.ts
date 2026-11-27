process.env.JWT_SECRET = "test-jwt-secret";

const transaction = { commit: jest.fn(), rollback: jest.fn() };
jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn(async () => transaction) },
}));
jest.mock("../../utils/mcpOAuth.utils", () => ({
  consumeAuthorizationCodeQuery: jest.fn(),
  createAuthorizationCodeQuery: jest.fn(),
  createGrantQuery: jest.fn(),
  createOAuthClientQuery: jest.fn(),
  findOAuthRefreshTokenForUpdateQuery: jest.fn(),
  getActiveGrantQuery: jest.fn(),
  getGrantIdForRefreshTokenQuery: jest.fn(),
  getOAuthClientQuery: jest.fn(),
  getUsableAuthorizationCodeQuery: jest.fn(),
  markOAuthRefreshTokenRotatedQuery: jest.fn(),
  revokeGrantQuery: jest.fn(),
  storeOAuthRefreshTokenQuery: jest.fn(),
}));
jest.mock("../../utils/user.utils", () => ({ getUserByIdQuery: jest.fn() }));
jest.mock("../../utils/roleMap", () => ({ getRoleNameById: jest.fn() }));

import type { Response } from "express";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  InvalidGrantError,
  InvalidTargetError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import {
  activeGrantForAccessToken,
  approveAuthorizationRequest,
  authorizationServerMetadata,
  denyAuthorizationRequest,
  mcpOAuthProvider,
  mcpOAuthUrls,
  protectedResourceMetadata,
  readAuthorizationRequest,
} from "../oauth";
import * as store from "../../utils/mcpOAuth.utils";
import { getUserByIdQuery } from "../../utils/user.utils";
import { getRoleNameById } from "../../utils/roleMap";
import { generateMcpAccessToken, getTokenPayload } from "../../utils/jwt.utils";

const BASE = "https://vw.example.com";
const RESOURCE = `${BASE}/api/mcp`;
const client = {
  client_id: "client-1",
  redirect_uris: ["http://localhost:4567/callback"],
} as OAuthClientInformationFull;
const mocked = <T extends (...args: never[]) => unknown>(fn: T) => fn as unknown as jest.Mock;

/** A response that records the redirect authorize() sends. */
function redirectRecorder() {
  const res = { redirect: jest.fn() };
  return res as unknown as Response & { redirect: jest.Mock };
}

/** The request token the consent page receives, from the URL authorize() redirects to. */
async function startAuthorization(state?: string) {
  const res = redirectRecorder();
  await mcpOAuthProvider.authorize(
    client,
    {
      redirectUri: "http://localhost:4567/callback",
      codeChallenge: "challenge",
      state,
      resource: new URL(RESOURCE),
    },
    res,
  );
  const location = new URL(res.redirect.mock.calls[0][1]);
  return { location, requestToken: location.searchParams.get("request")! };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.FRONTEND_URL = BASE;
  mocked(store.getOAuthClientQuery).mockResolvedValue({
    client_id: "client-1",
    client_info: { client_name: "Claude Code", redirect_uris: client.redirect_uris },
    client_secret_encrypted: null,
  });
  mocked(getUserByIdQuery).mockResolvedValue({ id: 7, email: "a@x.io", role_id: 1 });
  mocked(getRoleNameById).mockResolvedValue("Admin");
});

describe("discovery", () => {
  it("is unavailable without FRONTEND_URL", () => {
    delete process.env.FRONTEND_URL;
    expect(mcpOAuthUrls()).toBeNull();
    expect(protectedResourceMetadata()).toBeNull();
    expect(authorizationServerMetadata()).toBeNull();
  });

  /** RFC 9728 names the issuer; RFC 8414 puts every endpoint under it, behind /api like the rest of the API. */
  it("names the issuer under /api/v1/oauth and the MCP server as the resource", () => {
    expect(protectedResourceMetadata()).toMatchObject({
      resource: RESOURCE,
      authorization_servers: [`${BASE}/api/v1/oauth`],
    });
    expect(authorizationServerMetadata()).toMatchObject({
      issuer: `${BASE}/api/v1/oauth`,
      authorization_endpoint: `${BASE}/api/v1/oauth/authorize`,
      token_endpoint: `${BASE}/api/v1/oauth/token`,
      registration_endpoint: `${BASE}/api/v1/oauth/register`,
      code_challenge_methods_supported: ["S256"],
    });
  });
});

describe("authorize and consent", () => {
  it("sends the browser to the consent page with the request signed", async () => {
    const { location, requestToken } = await startAuthorization("xyz");
    expect(`${location.origin}${location.pathname}`).toBe(`${BASE}/mcp/authorize`);
    expect(await readAuthorizationRequest(requestToken)).toEqual({
      clientId: "client-1",
      clientName: "Claude Code",
      redirectUri: "http://localhost:4567/callback",
      codeChallenge: "challenge",
      state: "xyz",
      resource: RESOURCE,
    });
  });

  it("refuses a token for another resource", async () => {
    await expect(
      mcpOAuthProvider.authorize(
        client,
        {
          redirectUri: "http://localhost:4567/callback",
          codeChallenge: "challenge",
          resource: new URL("https://elsewhere.example.com/mcp"),
        },
        redirectRecorder(),
      ),
    ).rejects.toBeInstanceOf(InvalidTargetError);
  });

  it("does not accept a tampered request or a token of another kind", async () => {
    const { requestToken } = await startAuthorization();
    expect(await readAuthorizationRequest(`${requestToken}x`)).toBeNull();
    const accessToken = generateMcpAccessToken({
      id: 7,
      email: "a@x.io",
      roleName: "Admin",
      organizationId: 3,
      grantId: 1,
      aud: RESOURCE,
    })!;
    expect(await readAuthorizationRequest(accessToken)).toBeNull();
  });

  it("issues a code for the session's organization and returns it with the state", async () => {
    const request = (await readAuthorizationRequest(
      (await startAuthorization("s1")).requestToken,
    ))!;
    const redirect = new URL(
      await approveAuthorizationRequest(request, { userId: 7, organizationId: 3 }),
    );
    const code = redirect.searchParams.get("code")!;
    expect(redirect.searchParams.get("state")).toBe("s1");
    expect(store.createAuthorizationCodeQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        code,
        clientId: "client-1",
        userId: 7,
        organizationId: 3,
        redirectUri: "http://localhost:4567/callback",
        codeChallenge: "challenge",
        resource: RESOURCE,
      }),
    );
  });

  it("answers a declined request with access_denied", async () => {
    const request = (await readAuthorizationRequest(
      (await startAuthorization("s2")).requestToken,
    ))!;
    const redirect = new URL(denyAuthorizationRequest(request));
    expect(redirect.searchParams.get("error")).toBe("access_denied");
    expect(redirect.searchParams.get("state")).toBe("s2");
    expect(redirect.searchParams.get("code")).toBeNull();
  });
});

describe("code exchange", () => {
  const code = {
    client_id: "client-1",
    user_id: 7,
    organization_id: 3,
    redirect_uri: "http://localhost:4567/callback",
    code_challenge: "challenge",
    resource: RESOURCE,
  };

  it("creates a grant and issues tokens with the user's current role", async () => {
    mocked(store.consumeAuthorizationCodeQuery).mockResolvedValue(code);
    mocked(store.createGrantQuery).mockResolvedValue({
      id: 11,
      client_id: "client-1",
      user_id: 7,
      organization_id: 3,
    });

    const tokens = await mcpOAuthProvider.exchangeAuthorizationCode(
      client,
      "the-code",
      undefined,
      "http://localhost:4567/callback",
      new URL(RESOURCE),
    );

    expect(store.createGrantQuery).toHaveBeenCalledWith(
      { clientId: "client-1", userId: 7, organizationId: 3 },
      transaction,
    );
    expect(getUserByIdQuery).toHaveBeenCalledWith(7, transaction, 3);
    expect(getTokenPayload(tokens.access_token)).toMatchObject({
      type: "mcp_access",
      id: 7,
      roleName: "Admin",
      organizationId: 3,
      grantId: 11,
      aud: RESOURCE,
    });
    expect(tokens).toMatchObject({ token_type: "Bearer", expires_in: 3600 });
    expect(store.storeOAuthRefreshTokenQuery).toHaveBeenCalledWith(
      expect.objectContaining({ token: tokens.refresh_token, grantId: 11 }),
      transaction,
    );
    expect(transaction.commit).toHaveBeenCalled();
  });

  it("gives a pure super admin's token the SuperAdmin role", async () => {
    mocked(store.consumeAuthorizationCodeQuery).mockResolvedValue({
      ...code,
      organization_id: null,
    });
    mocked(store.createGrantQuery).mockResolvedValue({
      id: 12,
      client_id: "client-1",
      user_id: 7,
      organization_id: null,
    });

    const tokens = await mcpOAuthProvider.exchangeAuthorizationCode(client, "the-code");

    expect(getUserByIdQuery).toHaveBeenCalledWith(7, transaction);
    expect(getRoleNameById).not.toHaveBeenCalled();
    expect(getTokenPayload(tokens.access_token)).toMatchObject({
      roleName: "SuperAdmin",
      organizationId: null,
    });
  });

  it("refuses a used or unknown code", async () => {
    mocked(store.consumeAuthorizationCodeQuery).mockResolvedValue(null);
    await expect(mcpOAuthProvider.exchangeAuthorizationCode(client, "used")).rejects.toBeInstanceOf(
      InvalidGrantError,
    );
    expect(store.createGrantQuery).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it("refuses a redirect URI other than the one the code was issued for", async () => {
    mocked(store.consumeAuthorizationCodeQuery).mockResolvedValue(code);
    await expect(
      mcpOAuthProvider.exchangeAuthorizationCode(client, "c", undefined, "http://localhost:1/evil"),
    ).rejects.toBeInstanceOf(InvalidGrantError);
    expect(store.createGrantQuery).not.toHaveBeenCalled();
  });

  it("returns the stored PKCE challenge for the SDK to verify", async () => {
    mocked(store.getUsableAuthorizationCodeQuery).mockResolvedValue(code);
    await expect(mcpOAuthProvider.challengeForAuthorizationCode(client, "c")).resolves.toBe(
      "challenge",
    );
    mocked(store.getUsableAuthorizationCodeQuery).mockResolvedValue(null);
    await expect(
      mcpOAuthProvider.challengeForAuthorizationCode(client, "c"),
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });
});

describe("refresh", () => {
  const stored = {
    id: 5,
    grant_id: 11,
    expires_at: new Date(Date.now() + 60_000),
    rotated_at: null,
    client_id: "client-1",
    user_id: 7,
    organization_id: 3,
    grant_revoked_at: null,
  };

  it("rotates the refresh token and issues new tokens", async () => {
    mocked(store.findOAuthRefreshTokenForUpdateQuery).mockResolvedValue(stored);
    const tokens = await mcpOAuthProvider.exchangeRefreshToken(client, "r1");
    expect(store.markOAuthRefreshTokenRotatedQuery).toHaveBeenCalledWith(5, transaction);
    expect(getTokenPayload(tokens.access_token)).toMatchObject({ grantId: 11 });
    expect(tokens.refresh_token).not.toBe("r1");
    expect(transaction.commit).toHaveBeenCalled();
  });

  /** Only a copy can present a rotated token, so the whole connection ends. */
  it("revokes the grant when a rotated token comes back", async () => {
    mocked(store.findOAuthRefreshTokenForUpdateQuery).mockResolvedValue({
      ...stored,
      rotated_at: new Date(),
    });
    await expect(mcpOAuthProvider.exchangeRefreshToken(client, "r1")).rejects.toBeInstanceOf(
      InvalidGrantError,
    );
    expect(store.revokeGrantQuery).toHaveBeenCalledWith(11, transaction);
    expect(transaction.commit).toHaveBeenCalled();
    expect(transaction.rollback).not.toHaveBeenCalled();
    expect(store.storeOAuthRefreshTokenQuery).not.toHaveBeenCalled();
  });

  it.each([
    ["another client's token", { client_id: "client-2" }],
    ["a revoked connection", { grant_revoked_at: new Date() }],
    ["an expired token", { expires_at: new Date(Date.now() - 1000) }],
  ])("refuses %s", async (_label, change) => {
    mocked(store.findOAuthRefreshTokenForUpdateQuery).mockResolvedValue({ ...stored, ...change });
    await expect(mcpOAuthProvider.exchangeRefreshToken(client, "r1")).rejects.toBeInstanceOf(
      InvalidGrantError,
    );
    expect(store.storeOAuthRefreshTokenQuery).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });
});

describe("access tokens", () => {
  const claims = { type: "mcp_access", aud: RESOURCE, grantId: 11, id: 7, organizationId: 3 };

  it("finds the grant a token for this server names", async () => {
    mocked(store.getActiveGrantQuery).mockResolvedValue({ id: 11 });
    expect(await activeGrantForAccessToken(claims)).toEqual({ id: 11 });
    expect(store.getActiveGrantQuery).toHaveBeenCalledWith(11, 7, 3);
  });

  it.each([
    ["another audience", { aud: "https://elsewhere.example.com/api/mcp" }],
    ["another token type", { type: "api_token" }],
    ["no grant", { grantId: undefined }],
  ])("rejects %s without a lookup", async (_label, change) => {
    expect(await activeGrantForAccessToken({ ...claims, ...change })).toBeNull();
    expect(store.getActiveGrantQuery).not.toHaveBeenCalled();
  });
});

describe("revocation", () => {
  it("revokes the grant of a refresh token", async () => {
    mocked(store.getGrantIdForRefreshTokenQuery).mockResolvedValue(11);
    await mcpOAuthProvider.revokeToken!(client, { token: "r1" });
    expect(store.revokeGrantQuery).toHaveBeenCalledWith(11);
  });

  it("ignores another client's access token", async () => {
    mocked(store.getGrantIdForRefreshTokenQuery).mockResolvedValue(null);
    mocked(store.getActiveGrantQuery).mockResolvedValue({ id: 11, client_id: "client-2" });
    const token = generateMcpAccessToken({
      id: 7,
      email: "a@x.io",
      roleName: "Admin",
      organizationId: 3,
      grantId: 11,
      aud: RESOURCE,
    })!;
    await mcpOAuthProvider.revokeToken!(client, { token });
    expect(store.revokeGrantQuery).not.toHaveBeenCalled();
  });
});

describe("client registration", () => {
  it("stores a confidential client's secret encrypted and returns it decrypted", async () => {
    await mcpOAuthProvider.clientsStore.registerClient!({
      client_id: "client-3",
      client_secret: "s3cret",
      redirect_uris: ["https://app.example.com/cb"],
    } as OAuthClientInformationFull);
    const saved = mocked(store.createOAuthClientQuery).mock.calls[0][0];
    expect(saved.clientInfo).toEqual({ redirect_uris: ["https://app.example.com/cb"] });
    expect(saved.clientSecretEncrypted).not.toContain("s3cret");

    mocked(store.getOAuthClientQuery).mockResolvedValue({
      client_id: "client-3",
      client_info: saved.clientInfo,
      client_secret_encrypted: saved.clientSecretEncrypted,
    });
    expect(await mcpOAuthProvider.clientsStore.getClient("client-3")).toEqual({
      client_id: "client-3",
      client_secret: "s3cret",
      redirect_uris: ["https://app.example.com/cb"],
    });
  });
});
