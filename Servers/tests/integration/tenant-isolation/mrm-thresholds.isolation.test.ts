jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestModelInventory, createTestMrmThreshold } from "../../factories";

/**
 * MRM thresholds tenant isolation.
 *
 * NOTE: MRM has no REST endpoints yet (the database layer only). These tests
 * assert the isolation contract at the query layer — the same
 * `WHERE organization_id = :orgId` scoping every MRM controller/util will use.
 */
describe("MRM thresholds tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("scopes threshold rows to the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    await createTestMrmThreshold(owner.orgId, modelId, {
      metric: "psi",
      op: "gt",
      value_num: 0.25,
    });

    const ownerRows = await sequelize.query(
      `SELECT id FROM mrm_thresholds WHERE organization_id = :orgId`,
      { replacements: { orgId: owner.orgId }, type: QueryTypes.SELECT },
    );
    expect(ownerRows.length).toBeGreaterThan(0);

    const attackerRows = await sequelize.query(
      `SELECT id FROM mrm_thresholds WHERE organization_id = :orgId`,
      { replacements: { orgId: attacker.orgId }, type: QueryTypes.SELECT },
    );
    expect(attackerRows.length).toBe(0);
  });

  it("stamps organization_id on the threshold row", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const thresholdId = await createTestMrmThreshold(owner.orgId, modelId, {
      severity: "critical",
    });

    const [row] = (await sequelize.query(
      `SELECT organization_id FROM mrm_thresholds WHERE id = :id`,
      { replacements: { id: thresholdId }, type: QueryTypes.SELECT },
    )) as [{ organization_id: number }];

    expect(row.organization_id).toBe(owner.orgId);
  });

  it("supports the 'outside' band shape (value_lo/value_hi)", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const thresholdId = await createTestMrmThreshold(owner.orgId, modelId, {
      op: "outside",
      value_num: null,
      value_lo: 0.6,
      value_hi: 0.9,
    });

    const [row] = (await sequelize.query(
      `SELECT op, value_lo, value_hi FROM mrm_thresholds WHERE id = :id`,
      { replacements: { id: thresholdId }, type: QueryTypes.SELECT },
    )) as [{ op: string; value_lo: number; value_hi: number }];

    expect(row.op).toBe("outside");
    expect(Number(row.value_lo)).toBe(0.6);
    expect(Number(row.value_hi)).toBe(0.9);
  });

  it("cascades threshold deletion when the model inventory is deleted", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const thresholdId = await createTestMrmThreshold(owner.orgId, modelId);

    await sequelize.query(`DELETE FROM model_inventories WHERE id = :id`, {
      replacements: { id: modelId },
    });

    const rows = await sequelize.query(`SELECT id FROM mrm_thresholds WHERE id = :id`, {
      replacements: { id: thresholdId },
      type: QueryTypes.SELECT,
    });
    expect(rows.length).toBe(0);
  });
});
