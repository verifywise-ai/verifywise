jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import {
  createTestModelInventory,
  createTestMrmMetric,
  createTestMrmThreshold,
  createTestMrmMetricEvaluation,
} from "../../factories";

/**
 * MRM metric-evaluations (immutable evaluation audit) tenant isolation.
 *
 * NOTE: MRM has no REST endpoints yet (the database layer only). These tests
 * assert the isolation contract at the query layer — the same
 * `WHERE organization_id = :orgId` scoping every MRM controller/util will use.
 */
describe("MRM metric evaluations tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("scopes evaluation rows to the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const metricId = await createTestMrmMetric(owner.orgId, modelId);
    await createTestMrmMetricEvaluation(owner.orgId, metricId, { status: "ok" });

    const ownerRows = await sequelize.query(
      `SELECT id FROM mrm_metric_evaluations WHERE organization_id = :orgId`,
      { replacements: { orgId: owner.orgId }, type: QueryTypes.SELECT },
    );
    expect(ownerRows.length).toBeGreaterThan(0);

    const attackerRows = await sequelize.query(
      `SELECT id FROM mrm_metric_evaluations WHERE organization_id = :orgId`,
      { replacements: { orgId: attacker.orgId }, type: QueryTypes.SELECT },
    );
    expect(attackerRows.length).toBe(0);
  });

  it("stamps organization_id on the evaluation row", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const metricId = await createTestMrmMetric(owner.orgId, modelId);
    const evalId = await createTestMrmMetricEvaluation(owner.orgId, metricId, { status: "breach" });

    const [row] = (await sequelize.query(
      `SELECT organization_id FROM mrm_metric_evaluations WHERE id = :id`,
      { replacements: { id: evalId }, type: QueryTypes.SELECT },
    )) as [{ organization_id: number }];

    expect(row.organization_id).toBe(owner.orgId);
  });

  it("cascades evaluation deletion when the parent metric point is deleted", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const metricId = await createTestMrmMetric(owner.orgId, modelId);
    const evalId = await createTestMrmMetricEvaluation(owner.orgId, metricId);

    await sequelize.query(`DELETE FROM mrm_metrics WHERE id = :id`, {
      replacements: { id: metricId },
    });

    const rows = await sequelize.query(`SELECT id FROM mrm_metric_evaluations WHERE id = :id`, {
      replacements: { id: evalId },
      type: QueryTypes.SELECT,
    });
    expect(rows.length).toBe(0);
  });

  it("preserves the evaluation (threshold_id SET NULL, snapshot intact) when the threshold is deleted", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const metricId = await createTestMrmMetric(owner.orgId, modelId);
    const thresholdId = await createTestMrmThreshold(owner.orgId, modelId);
    const evalId = await createTestMrmMetricEvaluation(owner.orgId, metricId, {
      threshold_id: thresholdId,
      status: "breach",
      threshold_snapshot: { op: "gt", value_num: 0.25, severity: "high" },
    });

    // Deleting the threshold must NOT delete the evaluation — the snapshot
    // preserves what was evaluated (ON DELETE SET NULL).
    await sequelize.query(`DELETE FROM mrm_thresholds WHERE id = :id`, {
      replacements: { id: thresholdId },
    });

    const [row] = (await sequelize.query(
      `SELECT threshold_id, threshold_snapshot FROM mrm_metric_evaluations WHERE id = :id`,
      { replacements: { id: evalId }, type: QueryTypes.SELECT },
    )) as [
      { threshold_id: number | null; threshold_snapshot: Record<string, unknown> } | undefined,
    ];

    expect(row).toBeDefined();
    expect(row?.threshold_id).toBeNull();
    expect(row?.threshold_snapshot).toMatchObject({ op: "gt", severity: "high" });
  });
});
