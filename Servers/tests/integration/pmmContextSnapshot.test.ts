/**
 * The post-market monitoring cycle snapshot runs real SQL against the shared
 * schema. The unit test mocks the database, so a column that does not exist
 * (model_inventories.project_id) failed every cycle submit unnoticed.
 */
jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestProject, createTestVendor } from "../factories";
import { getContextSnapshotQuery } from "../../utils/postMarketMonitoring.utils";

afterEach(async () => {
  await cleanupDatabase();
});

const insertId = async (sql: string, replacements: Record<string, unknown>): Promise<number> => {
  const rows = await sequelize.query<{ id: number }>(`${sql} RETURNING id`, {
    replacements,
    type: QueryTypes.SELECT,
  });
  return rows[0].id;
};

const createModel = (orgId: number, name: string) =>
  insertId(
    `INSERT INTO model_inventories (organization_id, provider, model) VALUES (:orgId, 'p', :name)`,
    { orgId, name },
  );

const linkModel = (orgId: number, modelId: number, projectId: number, frameworkId: number | null) =>
  sequelize.query(
    `INSERT INTO model_inventories_projects_frameworks
       (organization_id, model_inventory_id, project_id, framework_id)
     VALUES (:orgId, :modelId, :projectId, :frameworkId)`,
    { replacements: { orgId, modelId, projectId, frameworkId } },
  );

const createModelRisk = (orgId: number, modelId: number, isDeleted: boolean) =>
  insertId(
    `INSERT INTO model_risks (organization_id, risk_name, model_id, is_deleted)
     VALUES (:orgId, 'r', :modelId, :isDeleted)`,
    { orgId, modelId, isDeleted },
  );

const createVendorRisk = (orgId: number, vendorId: number, isDeleted: boolean) =>
  insertId(
    `INSERT INTO vendorrisks (organization_id, vendor_id, is_deleted)
     VALUES (:orgId, :vendorId, :isDeleted)`,
    { orgId, vendorId, isDeleted },
  );

describe("getContextSnapshotQuery against the database", () => {
  it("counts the use case's models, live model risks and live vendor risks", async () => {
    const { owner } = await seedTwoTenantContexts();
    const orgId = owner.orgId;
    const projectId = await createTestProject(orgId, owner.userId);
    const otherProjectId = await createTestProject(orgId, owner.userId);

    // Two models linked to the use case. The first also has a framework row,
    // which must not count it twice.
    const modelA = await createModel(orgId, "A");
    const modelB = await createModel(orgId, "B");
    await linkModel(orgId, modelA, projectId, null);
    await linkModel(orgId, modelA, projectId, 1);
    await linkModel(orgId, modelB, projectId, null);
    // A framework-only link: framework rows carry an arbitrary use case.
    const modelFrameworkOnly = await createModel(orgId, "F");
    await linkModel(orgId, modelFrameworkOnly, projectId, 1);
    // A model of another use case.
    const modelOther = await createModel(orgId, "O");
    await linkModel(orgId, modelOther, otherProjectId, null);

    await createModelRisk(orgId, modelA, false);
    await createModelRisk(orgId, modelB, false);
    await createModelRisk(orgId, modelB, true);
    await createModelRisk(orgId, modelFrameworkOnly, false);
    await createModelRisk(orgId, modelOther, false);

    const vendorId = await createTestVendor(orgId);
    await sequelize.query(
      `INSERT INTO vendors_projects (organization_id, vendor_id, project_id)
       VALUES (:orgId, :vendorId, :projectId)`,
      { replacements: { orgId, vendorId, projectId } },
    );
    await createVendorRisk(orgId, vendorId, false);
    await createVendorRisk(orgId, vendorId, true);

    const snapshot = await getContextSnapshotQuery(projectId, orgId);

    expect(snapshot.models_count).toBe(2);
    expect(snapshot.model_risks_count).toBe(2);
    expect(snapshot.vendors_count).toBe(1);
    expect(snapshot.vendor_risks_count).toBe(1);
  });

  it("does not count another organization's rows", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);
    const theirModel = await createModel(attacker.orgId, "T");
    await linkModel(attacker.orgId, theirModel, projectId, null);
    await createModelRisk(attacker.orgId, theirModel, false);

    const snapshot = await getContextSnapshotQuery(projectId, owner.orgId);

    expect(snapshot.models_count).toBe(0);
    expect(snapshot.model_risks_count).toBe(0);
  });
});
