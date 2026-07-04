jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestMrmMetricKey } from "../../factories";

/**
 * MRM metric-keys tenant isolation.
 *
 * NOTE: MRM has no REST endpoints yet (the database layer only). These tests
 * assert the isolation contract at the query layer — the same
 * `WHERE organization_id = :orgId` scoping every MRM controller/util will use.
 * Add route-level isolation tests here once the MRM routes exist.
 */
describe("MRM metric keys tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("scopes metric-key rows to the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await createTestMrmMetricKey(owner.orgId, { key: "psi" });

    const ownerRows = await sequelize.query(
      `SELECT id FROM mrm_metric_keys WHERE organization_id = :orgId`,
      { replacements: { orgId: owner.orgId }, type: QueryTypes.SELECT },
    );
    expect(ownerRows.length).toBeGreaterThan(0);

    const attackerRows = await sequelize.query(
      `SELECT id FROM mrm_metric_keys WHERE organization_id = :orgId`,
      { replacements: { orgId: attacker.orgId }, type: QueryTypes.SELECT },
    );
    expect(attackerRows.length).toBe(0);
  });

  it("stamps organization_id on the metric-key row", async () => {
    const { owner } = await seedTwoTenantContexts();
    const keyId = await createTestMrmMetricKey(owner.orgId, { key: "auc" });

    const [row] = (await sequelize.query(
      `SELECT organization_id FROM mrm_metric_keys WHERE id = :id`,
      { replacements: { id: keyId }, type: QueryTypes.SELECT },
    )) as [{ organization_id: number }];

    expect(row.organization_id).toBe(owner.orgId);
  });

  it("enforces the unique (organization_id, key) constraint", async () => {
    const { owner } = await seedTwoTenantContexts();
    await createTestMrmMetricKey(owner.orgId, { key: "psi" });

    await expect(createTestMrmMetricKey(owner.orgId, { key: "psi" })).rejects.toThrow();
  });

  it("allows the same key in a different organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await createTestMrmMetricKey(owner.orgId, { key: "psi" });

    // Same key in a different org must NOT collide — uniqueness is per-org.
    await expect(createTestMrmMetricKey(attacker.orgId, { key: "psi" })).resolves.toBeGreaterThan(
      0,
    );
  });
});
