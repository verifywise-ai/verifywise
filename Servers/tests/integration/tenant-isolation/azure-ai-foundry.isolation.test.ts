jest.setTimeout(60000);
// Enabling Azure AI Foundry encrypts the API key, and tools/createSecureValue
// reads the algorithm when it loads. Every deployment sets it; the
// integration environment does not, so use the same default.
process.env.ENCRYPTION_ALGORITHM ??= "aes-256-cbc";

// No test here may reach the network: every Azure call goes through
// safeFetchWithBase, replaced below by a stub that answers per endpoint.
jest.mock("../../../utils/safeOutboundUrl", () => ({
  ...jest.requireActual("../../../utils/safeOutboundUrl"),
  safeFetch: jest.fn(),
  safeFetchWithBase: jest.fn(),
}));

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { safeFetch, safeFetchWithBase } from "../../../utils/safeOutboundUrl";
import { cleanupDatabase } from "../helpers";
import { seedTwoTenantContexts, TenantContext } from "./tenantIsolation.harness";

/**
 * azure_ai_model_records and the /api/extensions/azure-ai-foundry routes.
 * Each organization syncs and discovers from its own project endpoint with its
 * own API key, both kept in its own extension_enablements row. Another
 * organization's sync, discovery, list and read never use the owner's
 * credentials, return the owner's records or change them.
 */

const OWNER = { endpoint: "https://owner.services.ai.azure.com", key: "owner-key" };
const ATTACKER = { endpoint: "https://attacker.services.ai.azure.com", key: "attacker-key" };

const fetchWithBase = safeFetchWithBase as jest.MockedFunction<typeof safeFetchWithBase>;
const fetchDirect = safeFetch as jest.MockedFunction<typeof safeFetch>;

/** What each project endpoint answers: one "gpt-4o" deployment and one agent. */
const PROJECTS: Record<string, { key: string; publisher: string; agent: string }> = {
  [OWNER.endpoint]: { key: OWNER.key, publisher: "Owner publisher", agent: "Owner agent" },
  [ATTACKER.endpoint]: {
    key: ATTACKER.key,
    publisher: "Attacker publisher",
    agent: "Attacker agent",
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function enableAzure(ctx: TenantContext, project: typeof OWNER): Promise<void> {
  const res = await ctx.request
    .post("/api/extensions/azure-ai-foundry/enable")
    .send({ configuration: { project_endpoint: project.endpoint, api_key: project.key } });
  expect(res.status).toBe(200);
}

async function deploymentRecords(orgId: number) {
  return sequelize.query<Record<string, unknown>>(
    `SELECT * FROM azure_ai_model_records WHERE organization_id = :orgId ORDER BY id`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  );
}

/** The (endpoint, api-key header) of every outbound call so far. */
const outboundCalls = () =>
  fetchWithBase.mock.calls.map(([base, , init]) => ({
    base,
    key: (init?.headers as Record<string, string> | undefined)?.["api-key"],
  }));

/** Both organizations configured; the owner has synced once. */
async function seed() {
  const { owner, attacker } = await seedTwoTenantContexts();
  await enableAzure(owner, OWNER);
  await enableAzure(attacker, ATTACKER);

  const ownerSync = await owner.request.post("/api/extensions/azure-ai-foundry/sync");
  expect(ownerSync.status).toBe(200);
  expect(ownerSync.body.data.modelCount).toBe(1);

  const ownerRecords = await deploymentRecords(owner.orgId);
  expect(ownerRecords).toHaveLength(1);
  expect(ownerRecords[0].model_format).toBe("Owner publisher");
  fetchWithBase.mockClear();

  return { owner, attacker, ownerRecords, ownerDeploymentId: Number(ownerRecords[0].id) };
}

describe("azure ai foundry tenant isolation", () => {
  beforeEach(() => {
    fetchWithBase.mockImplementation(async (base: string, path: string, init?: RequestInit) => {
      const project = PROJECTS[base];
      if (!project) throw new Error(`unexpected Azure endpoint ${base}`);
      // A key from another project is refused, as Azure would.
      if ((init?.headers as Record<string, string>)?.["api-key"] !== project.key) {
        return json({ error: "unauthorized" }, 401);
      }
      if (path.startsWith("/deployments")) {
        return json({
          value: [{ name: "gpt-4o", modelName: "gpt-4o", modelPublisher: project.publisher }],
        });
      }
      if (path.startsWith("/assistants")) {
        return json({ data: [{ id: `asst-${project.agent}`, name: project.agent, tools: [] }] });
      }
      throw new Error(`unexpected Azure path ${path}`);
    });
    fetchDirect.mockRejectedValue(new Error("no direct outbound calls in this suite"));
  });

  afterEach(async () => {
    fetchWithBase.mockReset();
    fetchDirect.mockReset();
    await cleanupDatabase();
  });

  it("syncs another organization from its own endpoint without touching the owner's records", async () => {
    const { owner, attacker, ownerRecords } = await seed();

    const res = await attacker.request.post("/api/extensions/azure-ai-foundry/sync");
    expect(res.status).toBe(200);
    expect(res.body.data.modelCount).toBe(1);

    expect(outboundCalls()).toEqual([{ base: ATTACKER.endpoint, key: ATTACKER.key }]);
    expect(fetchDirect).not.toHaveBeenCalled();

    // Same deployment name: the attacker gets its own row, the owner's row is
    // what it was.
    const attackerRecords = await deploymentRecords(attacker.orgId);
    expect(attackerRecords).toHaveLength(1);
    expect(attackerRecords[0].model_format).toBe("Attacker publisher");
    expect(attackerRecords[0].id).not.toBe(ownerRecords[0].id);
    expect(await deploymentRecords(owner.orgId)).toEqual(ownerRecords);
  });

  it("discovers another organization's agents with its own credentials only", async () => {
    const { owner, attacker, ownerRecords } = await seed();

    const res = await attacker.request.get("/api/extensions/azure-ai-foundry/discover");
    expect(res.status).toBe(200);
    const names = (res.body.data as Array<{ display_name: string }>).map((a) => a.display_name);
    expect(names).toEqual(["Attacker agent"]);

    expect(outboundCalls()).toEqual([{ base: ATTACKER.endpoint, key: ATTACKER.key }]);
    expect(await deploymentRecords(owner.orgId)).toEqual(ownerRecords);
  });

  it("never lists or shows the owner's records to another organization", async () => {
    const { owner, attacker, ownerRecords, ownerDeploymentId } = await seed();

    const emptyList = await attacker.request.get("/api/extensions/azure-ai-foundry/models");
    expect(emptyList.status).toBe(200);
    expect(emptyList.body.data.models).toEqual([]);

    await attacker.request.post("/api/extensions/azure-ai-foundry/sync").expect(200);
    const list = await attacker.request.get("/api/extensions/azure-ai-foundry/models");
    expect(list.status).toBe(200);
    const listed = list.body.data.models as Array<{ id: number; organization_id: number }>;
    expect(listed).toHaveLength(1);
    expect(listed.map((m) => m.id)).not.toContain(ownerDeploymentId);
    expect(listed.every((m) => m.organization_id === attacker.orgId)).toBe(true);
    expect(JSON.stringify(list.body)).not.toContain("Owner publisher");

    const read = await attacker.request.get(
      `/api/extensions/azure-ai-foundry/models/${ownerDeploymentId}`,
    );
    expect(read.status).toBe(404);
    expect(JSON.stringify(read.body)).not.toContain("Owner publisher");

    const ownRead = await owner.request.get(
      `/api/extensions/azure-ai-foundry/models/${ownerDeploymentId}`,
    );
    expect(ownRead.status).toBe(200);
    expect(ownRead.body.data.id).toBe(ownerDeploymentId);
    expect(await deploymentRecords(owner.orgId)).toEqual(ownerRecords);
  });
});
