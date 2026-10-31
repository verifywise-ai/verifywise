jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { cleanupDatabase, seedTwoOrgsAndUsers } from "../helpers";
import { buildTenantContext, seedTwoTenantContexts } from "./tenantIsolation.harness";

/**
 * Sync engine tables (extension_sync_runs, extension_sync_settings) and the
 * generic /api/extensions/:key/runs… and /:key/schedule routes. The CRUD
 * matrix is id-based and these routes are keyed by the extension key, so this
 * file covers them by hand.
 */

async function seedOwnerSync(orgId: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO extension_sync_settings
       (organization_id, extension_key, enabled, interval_hours, consecutive_failures, failing_since)
     VALUES (:orgId, 'jira-assets', TRUE, 6, 2, now() - interval '1 hour');`,
    { replacements: { orgId } },
  );
  await sequelize.query(
    `INSERT INTO extension_sync_runs
       (organization_id, extension_key, kind, status, counts, message, run_token,
        started_at, completed_at)
     VALUES (:orgId, 'jira-assets', 'manual', 'completed', jsonb_build_object('fetched', 3),
             'owner run', 'owner-token', now() - interval '5 minutes', now());`,
    { replacements: { orgId } },
  );
}

async function count(table: string, orgId: number): Promise<number> {
  const [row] = await sequelize.query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM ${table} WHERE organization_id = :orgId`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  );
  return Number(row.n);
}

async function enableJiraAssets(orgId: number, userId: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO extension_enablements (organization_id, extension_id, enabled, enabled_at, enabled_by)
     SELECT :orgId, e.id, TRUE, now(), :userId FROM extensions e WHERE e.key = 'jira-assets'
     ON CONFLICT (organization_id, extension_id) DO UPDATE SET enabled = TRUE, enabled_at = now();`,
    { replacements: { orgId, userId } },
  );
}

describe("extension sync tables tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("does not return org A rows when reading as org B", async () => {
    const { orgA, orgB } = await seedTwoOrgsAndUsers();
    await seedOwnerSync(orgA);

    for (const table of ["extension_sync_settings", "extension_sync_runs"]) {
      expect(await count(table, orgA)).toBe(1);
      expect(await count(table, orgB)).toBe(0);
    }
  });
});

describe("extension sync routes tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("shows org B none of org A's runs, schedule or failure streak", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const [catalog] = await sequelize.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM extensions WHERE key = 'jira-assets'`,
      { type: QueryTypes.SELECT },
    );
    expect(Number(catalog.n)).toBe(1);
    await enableJiraAssets(owner.orgId, owner.userId);
    await enableJiraAssets(attacker.orgId, attacker.userId);
    await seedOwnerSync(owner.orgId);

    const ownerStatus = await owner.request.get("/api/extensions/jira-assets/runs/status");
    expect(ownerStatus.status).toBe(200);
    expect(ownerStatus.body.data.latest_run).toMatchObject({
      kind: "manual",
      status: "completed",
      message: "owner run",
    });
    expect(ownerStatus.body.data.schedule).toMatchObject({
      enabled: true,
      interval_hours: 6,
      consecutive_failures: 2,
    });

    const attackerStatus = await attacker.request.get("/api/extensions/jira-assets/runs/status");
    expect(attackerStatus.status).toBe(200);
    expect(attackerStatus.body.data).toMatchObject({
      schedule: null,
      running: false,
      latest_run: null,
      last_finished_run: null,
    });

    const ownerRuns = await owner.request.get("/api/extensions/jira-assets/runs");
    expect(ownerRuns.body.data).toHaveLength(1);
    expect(ownerRuns.body.data[0]).not.toHaveProperty("run_token");
    const attackerRuns = await attacker.request.get("/api/extensions/jira-assets/runs");
    expect(attackerRuns.status).toBe(200);
    expect(attackerRuns.body.data).toEqual([]);
  });

  it("does not let org B change org A's schedule", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await enableJiraAssets(owner.orgId, owner.userId);
    await enableJiraAssets(attacker.orgId, attacker.userId);
    await seedOwnerSync(owner.orgId);
    await sequelize.query(
      `INSERT INTO jira_assets_config
         (organization_id, jira_base_url, workspace_id, email, api_token_encrypted, api_token_iv)
       VALUES (:orgId, 'https://b.atlassian.net', 'w', 'b@example.com', 'enc', 'iv');`,
      { replacements: { orgId: attacker.orgId } },
    );

    const patch = await attacker.request
      .patch("/api/extensions/jira-assets/schedule")
      .send({ enabled: false, interval_hours: 12 });
    expect(patch.status).toBe(200);
    expect(patch.body.data).toMatchObject({ enabled: false, interval_hours: 12 });

    const rows = await sequelize.query<{
      organization_id: number;
      enabled: boolean;
      interval_hours: number;
    }>(
      `SELECT organization_id, enabled, interval_hours FROM extension_sync_settings
        WHERE extension_key = 'jira-assets' ORDER BY organization_id`,
      { type: QueryTypes.SELECT },
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        { organization_id: owner.orgId, enabled: true, interval_hours: 6 },
        { organization_id: attacker.orgId, enabled: false, interval_hours: 12 },
      ]),
    );
  });

  it("keeps the schedule when an Editor tries to change it", async () => {
    const editor = await buildTenantContext(3);
    await enableJiraAssets(editor.orgId, editor.userId);

    const res = await editor.request
      .patch("/api/extensions/jira-assets/schedule")
      .send({ enabled: true });
    expect(res.status).toBe(403);
    expect(await count("extension_sync_settings", editor.orgId)).toBe(0);
  });
});
