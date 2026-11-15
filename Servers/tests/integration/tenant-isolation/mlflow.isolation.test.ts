jest.setTimeout(60000);

// No test here may reach the network: every MLflow call goes through
// safeFetchWithBase, replaced below by a stub that answers per tracking server.
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
 * mlflow_model_records, mlflow_integrations and the /api/extensions/mlflow
 * routes. Each organization syncs from its own tracking server, configured in
 * its own extension_enablements row. Another organization's sync, list and
 * read never return or change the owner's records.
 *
 * mlflow_integrations is the pre-extension configuration table: no route
 * reads or writes it any more (the configuration lives in
 * extension_enablements.configuration), so the check here is that nothing the
 * other organization does touches the owner's row.
 */

const OWNER_SERVER = "https://mlflow-owner.example.com";
const ATTACKER_SERVER = "https://mlflow-attacker.example.com";

const fetchWithBase = safeFetchWithBase as jest.MockedFunction<typeof safeFetchWithBase>;
const fetchDirect = safeFetch as jest.MockedFunction<typeof safeFetch>;

/** One run named "fraud-model", version 1, described as `description`. */
function trackingServer(description: string) {
  return {
    experiments: [{ experiment_id: "1", name: "Fraud", artifact_location: "s3://runs" }],
    runs: [
      {
        info: {
          run_id: `run-${description}`,
          experiment_id: "1",
          status: "FINISHED",
          start_time: Date.UTC(2026, 10, 1),
          end_time: Date.UTC(2026, 10, 2),
        },
        data: {
          tags: [
            { key: "mlflow.runName", value: "fraud-model" },
            { key: "version", value: "1" },
            { key: "mlflow.note.content", value: description },
          ],
          metrics: [{ key: "auc", value: 0.9 }],
          params: [],
        },
      },
    ],
  };
}

const SERVERS: Record<string, ReturnType<typeof trackingServer>> = {
  [OWNER_SERVER]: trackingServer("owner model"),
  [ATTACKER_SERVER]: trackingServer("attacker model"),
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function enableMlflow(ctx: TenantContext, trackingUrl: string): Promise<void> {
  const res = await ctx.request
    .post("/api/extensions/mlflow/enable")
    .send({ configuration: { tracking_server_url: trackingUrl, auth_method: "none" } });
  expect(res.status).toBe(200);
}

async function modelRecords(orgId: number) {
  return sequelize.query<Record<string, unknown>>(
    `SELECT * FROM mlflow_model_records WHERE organization_id = :orgId ORDER BY id`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  );
}

async function integrations(orgId: number) {
  return sequelize.query<Record<string, unknown>>(
    `SELECT * FROM mlflow_integrations WHERE organization_id = :orgId ORDER BY id`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  );
}

async function insertLegacyIntegration(orgId: number, userId: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO mlflow_integrations (organization_id, tracking_server_url, auth_method, updated_by)
     VALUES (:orgId, :url, 'none', :userId)`,
    { replacements: { orgId, url: OWNER_SERVER, userId } },
  );
}

/** Both organizations configured; the owner has synced once. */
async function seed() {
  const { owner, attacker } = await seedTwoTenantContexts();
  await enableMlflow(owner, OWNER_SERVER);
  await enableMlflow(attacker, ATTACKER_SERVER);
  await insertLegacyIntegration(owner.orgId, owner.userId);

  const ownerSync = await owner.request.post("/api/extensions/mlflow/sync");
  expect(ownerSync.status).toBe(200);
  expect(ownerSync.body.data.modelCount).toBe(1);

  const ownerRecords = await modelRecords(owner.orgId);
  expect(ownerRecords).toHaveLength(1);
  expect(ownerRecords[0].description).toBe("owner model");
  fetchWithBase.mockClear();

  return {
    owner,
    attacker,
    ownerModelId: Number(ownerRecords[0].id),
    ownerRecords,
    ownerIntegrations: await integrations(owner.orgId),
  };
}

describe("mlflow tenant isolation", () => {
  beforeEach(() => {
    fetchWithBase.mockImplementation(async (base: string, path: string) => {
      const server = SERVERS[base];
      if (!server) throw new Error(`unexpected MLflow server ${base}`);
      if (path.startsWith("/api/2.0/mlflow/experiments/search")) {
        return json({ experiments: server.experiments });
      }
      if (path.startsWith("/api/2.0/mlflow/runs/search")) return json({ runs: server.runs });
      throw new Error(`unexpected MLflow path ${path}`);
    });
    fetchDirect.mockRejectedValue(new Error("no direct outbound calls in this suite"));
  });

  afterEach(async () => {
    fetchWithBase.mockReset();
    fetchDirect.mockReset();
    await cleanupDatabase();
  });

  it("syncs another organization from its own server without touching the owner's records", async () => {
    const { owner, attacker, ownerRecords, ownerIntegrations } = await seed();

    const res = await attacker.request.post("/api/extensions/mlflow/sync");
    expect(res.status).toBe(200);
    expect(res.body.data.modelCount).toBe(1);

    // Only the attacker's own tracking server was called.
    const bases = fetchWithBase.mock.calls.map(([base]) => base);
    expect(bases.length).toBeGreaterThan(0);
    expect(new Set(bases)).toEqual(new Set([ATTACKER_SERVER]));
    expect(fetchDirect).not.toHaveBeenCalled();

    // Same model name and version: the attacker gets its own row, the owner's
    // row is byte-for-byte what it was.
    const attackerRecords = await modelRecords(attacker.orgId);
    expect(attackerRecords).toHaveLength(1);
    expect(attackerRecords[0].description).toBe("attacker model");
    expect(attackerRecords[0].id).not.toBe(ownerRecords[0].id);
    expect(await modelRecords(owner.orgId)).toEqual(ownerRecords);
    expect(await integrations(owner.orgId)).toEqual(ownerIntegrations);
    expect(await integrations(attacker.orgId)).toEqual([]);
  });

  it("never lists or shows the owner's records to another organization", async () => {
    const { owner, attacker, ownerModelId, ownerRecords } = await seed();

    const emptyList = await attacker.request.get("/api/extensions/mlflow/models");
    expect(emptyList.status).toBe(200);
    expect(emptyList.body.data.models).toEqual([]);

    await attacker.request.post("/api/extensions/mlflow/sync").expect(200);
    const list = await attacker.request.get("/api/extensions/mlflow/models");
    expect(list.status).toBe(200);
    const listed = list.body.data.models as Array<{ id: number; organization_id: number }>;
    expect(listed).toHaveLength(1);
    expect(listed.map((m) => m.id)).not.toContain(ownerModelId);
    expect(listed.every((m) => m.organization_id === attacker.orgId)).toBe(true);
    expect(JSON.stringify(list.body)).not.toContain("owner model");

    const read = await attacker.request.get(`/api/extensions/mlflow/models/${ownerModelId}`);
    expect(read.status).toBe(404);
    expect(JSON.stringify(read.body)).not.toContain("owner model");

    // The owner still reads it.
    const ownRead = await owner.request.get(`/api/extensions/mlflow/models/${ownerModelId}`);
    expect(ownRead.status).toBe(200);
    expect(ownRead.body.data.id).toBe(ownerModelId);
    expect(await modelRecords(owner.orgId)).toEqual(ownerRecords);
  });
});
