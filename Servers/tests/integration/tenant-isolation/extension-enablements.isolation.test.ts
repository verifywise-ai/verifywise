jest.setTimeout(60000);
// Enabling Azure AI Foundry encrypts the API key, and tools/createSecureValue
// reads the algorithm when it loads. Every deployment sets it; the
// integration environment does not, so use the same default.
process.env.ENCRYPTION_ALGORITHM ??= "aes-256-cbc";

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { cleanupDatabase } from "../helpers";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";

/**
 * extension_enablements and the catalog routes (/api/extensions/:key/enable,
 * /disable, /configuration and the reads). The routes are keyed by extension
 * key, not by row id: every one acts on the caller's own organization's row.
 * Another organization enabling, configuring or disabling the same extension
 * never changes the owner's row, and its reads never show the owner's state
 * or configuration.
 */

const OWNER_MLFLOW = "https://mlflow-owner.example.com";

async function enablementRow(orgId: number, key: string) {
  const rows = await sequelize.query<Record<string, unknown>>(
    `SELECT ee.* FROM extension_enablements ee
       JOIN extensions e ON e.id = ee.extension_id
      WHERE ee.organization_id = :orgId AND e.key = :key`,
    { replacements: { orgId, key }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

/** The owner has MLflow and Azure AI Foundry enabled and configured. */
async function seed() {
  const { owner, attacker } = await seedTwoTenantContexts();
  await owner.request
    .post("/api/extensions/mlflow/enable")
    .send({ configuration: { tracking_server_url: OWNER_MLFLOW, auth_method: "none" } })
    .expect(200);
  await owner.request
    .post("/api/extensions/azure-ai-foundry/enable")
    .send({
      configuration: {
        project_endpoint: "https://owner.services.ai.azure.com",
        api_key: "owner-key",
      },
    })
    .expect(200);

  const ownerMlflow = await enablementRow(owner.orgId, "mlflow");
  const ownerAzure = await enablementRow(owner.orgId, "azure-ai-foundry");
  expect(ownerMlflow?.enabled).toBe(true);
  expect(ownerAzure?.enabled).toBe(true);
  return { owner, attacker, ownerMlflow, ownerAzure };
}

describe("extension enablements tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("enables, configures and disables another organization's own row only", async () => {
    const { owner, attacker, ownerMlflow, ownerAzure } = await seed();

    const enable = await attacker.request.post("/api/extensions/mlflow/enable").send({
      configuration: {
        tracking_server_url: "https://mlflow-attacker.example.com",
        auth_method: "none",
      },
    });
    expect(enable.status).toBe(200);
    expect(enable.body.data.configuration.tracking_server_url).toBe(
      "https://mlflow-attacker.example.com",
    );
    expect(await enablementRow(owner.orgId, "mlflow")).toEqual(ownerMlflow);

    const configure = await attacker.request.patch("/api/extensions/mlflow/configuration").send({
      configuration: {
        tracking_server_url: "https://mlflow-attacker-2.example.com",
        auth_method: "none",
      },
    });
    expect(configure.status).toBe(200);
    expect(await enablementRow(owner.orgId, "mlflow")).toEqual(ownerMlflow);

    const disable = await attacker.request.post("/api/extensions/mlflow/disable");
    expect(disable.status).toBe(200);
    expect(disable.body.data.enabled).toBe(false);

    const attackerRow = await enablementRow(attacker.orgId, "mlflow");
    expect(attackerRow?.enabled).toBe(false);
    expect(attackerRow?.configuration).toEqual({
      tracking_server_url: "https://mlflow-attacker-2.example.com",
      auth_method: "none",
    });
    expect(await enablementRow(owner.orgId, "mlflow")).toEqual(ownerMlflow);
    expect(await enablementRow(owner.orgId, "azure-ai-foundry")).toEqual(ownerAzure);
  });

  it("answers 404 for an extension only the owner has enabled and changes nothing", async () => {
    const { owner, attacker, ownerAzure } = await seed();

    const configure = await attacker.request
      .patch("/api/extensions/azure-ai-foundry/configuration")
      .send({
        configuration: {
          project_endpoint: "https://attacker.services.ai.azure.com",
          api_key: "attacker-key",
        },
      });
    expect(configure.status).toBe(404);

    const disable = await attacker.request.post("/api/extensions/azure-ai-foundry/disable");
    expect(disable.status).toBe(404);

    expect(await enablementRow(attacker.orgId, "azure-ai-foundry")).toBeNull();
    expect(await enablementRow(owner.orgId, "azure-ai-foundry")).toEqual(ownerAzure);
  });

  it("never shows the owner's enablement or configuration to another organization", async () => {
    const { attacker } = await seed();

    const one = await attacker.request.get("/api/extensions/mlflow");
    expect(one.status).toBe(200);
    expect(one.body.data.enabled).toBe(false);
    expect(one.body.data.enablement).toBeNull();
    expect(one.body.data.configuration).toEqual({});

    const list = await attacker.request.get("/api/extensions");
    expect(list.status).toBe(200);
    const extensions = list.body.data as Array<{ key: string; enabled: boolean }>;
    expect(extensions.length).toBeGreaterThan(0);
    expect(extensions.filter((ext) => ext.enabled)).toEqual([]);
    expect(JSON.stringify(list.body)).not.toContain(OWNER_MLFLOW);
    expect(JSON.stringify(list.body)).not.toContain("owner.services.ai.azure.com");
  });
});
