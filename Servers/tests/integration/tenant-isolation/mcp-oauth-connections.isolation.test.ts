jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { seedTwoTenantContexts, TenantContext } from "./tenantIsolation.harness";
import { activeGrantForAccessToken } from "../../../mcp/oauth";
import { generateMcpAuthorizationRequestToken } from "../../../utils/jwt.utils";

/**
 * MCP sign-in (mcp/oauth.ts). A connection (oauth_grants) and the code that
 * creates it (oauth_authorization_codes) belong to one user in one
 * organization: the organization of the session that allowed it.
 */

const CONNECTIONS = "/api/v1/oauth/connections";
const DECISION = "/api/v1/oauth/authorization-requests/decision";
const RESOURCE = "http://localhost:5173/api/mcp";

async function seedClient(clientId: string): Promise<void> {
  await sequelize.query(
    `INSERT INTO oauth_clients (client_id, client_info) VALUES (:clientId, :info)
     ON CONFLICT (client_id) DO NOTHING`,
    {
      replacements: {
        clientId,
        info: JSON.stringify({
          client_name: `Client ${clientId}`,
          redirect_uris: ["http://localhost:4567/callback"],
          token_endpoint_auth_method: "none",
        }),
      },
    },
  );
}

async function seedGrant(ctx: TenantContext, clientId: string): Promise<number> {
  await seedClient(clientId);
  const [row]: any[] = await sequelize.query(
    `INSERT INTO oauth_grants (client_id, user_id, organization_id)
     VALUES (:clientId, :userId, :orgId) RETURNING id`,
    {
      replacements: { clientId, userId: ctx.userId, orgId: ctx.orgId },
      type: QueryTypes.SELECT,
    },
  );
  return row.id;
}

async function grantRevokedAt(id: number): Promise<Date | null> {
  const [row]: any[] = await sequelize.query(`SELECT revoked_at FROM oauth_grants WHERE id = :id`, {
    replacements: { id },
    type: QueryTypes.SELECT,
  });
  return row.revoked_at;
}

describe("MCP sign-in tenant isolation", () => {
  const frontendUrl = process.env.FRONTEND_URL;

  beforeAll(() => {
    process.env.FRONTEND_URL = "http://localhost:5173";
  });

  afterAll(() => {
    process.env.FRONTEND_URL = frontendUrl;
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("lists only the caller's own connections", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerGrant = await seedGrant(owner, "client-owner");
    const attackerGrant = await seedGrant(attacker, "client-attacker");

    const res = await attacker.request.get(CONNECTIONS);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((connection: { id: number }) => connection.id);
    expect(ids).toEqual([attackerGrant]);
    expect(ids).not.toContain(ownerGrant);
  });

  it("does not let another organization's user disconnect a connection", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerGrant = await seedGrant(owner, "client-owner");

    const res = await attacker.request.delete(`${CONNECTIONS}/${ownerGrant}`);
    expect(res.status).toBe(404);
    expect(await grantRevokedAt(ownerGrant)).toBeNull();

    const own = await owner.request.delete(`${CONNECTIONS}/${ownerGrant}`);
    expect(own.status).toBe(200);
    expect(await grantRevokedAt(ownerGrant)).not.toBeNull();
  });

  it("stamps the code with the organization of the session that allowed it", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await seedClient("client-shared");
    const request = generateMcpAuthorizationRequestToken({
      clientId: "client-shared",
      redirectUri: "http://localhost:4567/callback",
      codeChallenge: "challenge",
      state: "s",
      resource: RESOURCE,
    });

    for (const ctx of [owner, attacker]) {
      const res = await ctx.request.post(DECISION).send({ request, allow: true });
      expect(res.status).toBe(200);
    }

    const codes: any[] = await sequelize.query(
      `SELECT user_id, organization_id FROM oauth_authorization_codes
        WHERE client_id = 'client-shared' ORDER BY id`,
      { type: QueryTypes.SELECT },
    );
    expect(codes).toEqual([
      { user_id: owner.userId, organization_id: owner.orgId },
      { user_id: attacker.userId, organization_id: attacker.orgId },
    ]);
  });

  it("does not accept an access token whose organization differs from its grant's", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerGrant = await seedGrant(owner, "client-owner");
    const claims = { type: "mcp_access", aud: RESOURCE, grantId: ownerGrant, id: owner.userId };

    expect(await activeGrantForAccessToken({ ...claims, organizationId: owner.orgId })).toEqual(
      expect.objectContaining({ id: ownerGrant, organization_id: owner.orgId }),
    );
    expect(
      await activeGrantForAccessToken({ ...claims, organizationId: attacker.orgId }),
    ).toBeNull();
    expect(
      await activeGrantForAccessToken({
        ...claims,
        id: attacker.userId,
        organizationId: attacker.orgId,
      }),
    ).toBeNull();
  });
});
