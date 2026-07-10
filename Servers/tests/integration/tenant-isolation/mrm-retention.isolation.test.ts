jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import {
  createTestModelInventory,
  createTestMrmMetric,
  createTestMrmMetricEvaluation,
} from "../../factories";
import { runRetentionPrune } from "../../../services/automations/actions/mrmRetentionPrune";
import { getMrmOrgSettings, upsertMrmOrgSettings } from "../../../utils/mrmSettings.utils";

/**
 * MRM metric retention — tenant isolation + audit-trail guard.
 *
 * The prune must (a) stay inside the caller's org, (b) never delete a point
 * with a warn/breach evaluation (the examiner audit trail), (c) not wedge
 * when protected points are older than prunable ones, and (d) settings must
 * be org-scoped with a defaults fallback.
 */

// Old enough to be past any retention window in these tests.
const ANCIENT = "2020-01-15T00:00:00Z";
// Recent enough to always be inside the window.
const RECENT = new Date().toISOString();

const metricIds = async (orgId: number): Promise<number[]> => {
  const rows = (await sequelize.query(
    `SELECT id FROM mrm_metrics WHERE organization_id = :orgId ORDER BY id`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  )) as { id: number }[];
  return rows.map((r) => r.id);
};

const evalCountForMetric = async (metricId: number): Promise<number> => {
  const rows = (await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM mrm_metric_evaluations WHERE metric_id = :metricId`,
    { replacements: { metricId }, type: QueryTypes.SELECT },
  )) as { n: number }[];
  return rows[0].n;
};

describe("MRM retention tenant isolation + audit guard", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("returns defaults when no settings row exists and scopes upserts per org", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    const before = await getMrmOrgSettings(owner.orgId);
    expect(before.retention_months).toBe(25);

    await upsertMrmOrgSettings(owner.orgId, 36);
    const ownerAfter = await getMrmOrgSettings(owner.orgId);
    expect(ownerAfter.retention_months).toBe(36);

    // The other org still sees defaults — settings are org-scoped.
    const attackerView = await getMrmOrgSettings(attacker.orgId);
    expect(attackerView.retention_months).toBe(25);
  });

  it("prunes an aged benign point (and its ok evals) but keeps recent points", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);

    const oldBenign = await createTestMrmMetric(owner.orgId, modelId, { at: ANCIENT });
    await createTestMrmMetricEvaluation(owner.orgId, oldBenign, { status: "ok" });
    const recentBenign = await createTestMrmMetric(owner.orgId, modelId, {
      at: RECENT,
      metric: "auc",
    });
    await createTestMrmMetricEvaluation(owner.orgId, recentBenign, { status: "ok" });

    const summary = await runRetentionPrune(owner.orgId);

    expect(summary.deleted).toBe(1);
    const remaining = await metricIds(owner.orgId);
    expect(remaining).toEqual([recentBenign]);
    // CASCADE removed the pruned point's ok-eval rows.
    expect(await evalCountForMetric(oldBenign)).toBe(0);
  });

  it("NEVER deletes aged points with warn or breach evaluations", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);

    const oldWarn = await createTestMrmMetric(owner.orgId, modelId, { at: ANCIENT });
    await createTestMrmMetricEvaluation(owner.orgId, oldWarn, { status: "warn" });
    const oldBreach = await createTestMrmMetric(owner.orgId, modelId, {
      at: ANCIENT,
      metric: "auc",
    });
    await createTestMrmMetricEvaluation(owner.orgId, oldBreach, { status: "breach" });
    // A point with BOTH an ok and a breach eval is protected too.
    const oldMixed = await createTestMrmMetric(owner.orgId, modelId, {
      at: ANCIENT,
      metric: "gini",
    });
    await createTestMrmMetricEvaluation(owner.orgId, oldMixed, { status: "ok" });
    await createTestMrmMetricEvaluation(owner.orgId, oldMixed, { status: "breach" });

    const summary = await runRetentionPrune(owner.orgId);

    expect(summary.deleted).toBe(0);
    const remaining = await metricIds(owner.orgId);
    expect(remaining).toEqual([oldWarn, oldBreach, oldMixed].sort((a, b) => a - b));
    // Their evaluation audit rows survive intact.
    expect(await evalCountForMetric(oldWarn)).toBe(1);
    expect(await evalCountForMetric(oldBreach)).toBe(1);
    expect(await evalCountForMetric(oldMixed)).toBe(2);
  });

  it("wedge regression: protected points OLDER than benign ones do not block pruning", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);

    // Protected point is the OLDEST row (earliest at, smallest id).
    const protectedOldest = await createTestMrmMetric(owner.orgId, modelId, {
      at: "2019-01-01T00:00:00Z",
    });
    await createTestMrmMetricEvaluation(owner.orgId, protectedOldest, { status: "breach" });
    // Benign point is newer than the protected one but still past cutoff.
    const benignNewer = await createTestMrmMetric(owner.orgId, modelId, {
      at: ANCIENT,
      metric: "auc",
    });
    await createTestMrmMetricEvaluation(owner.orgId, benignNewer, { status: "ok" });

    const summary = await runRetentionPrune(owner.orgId);

    // The benign point is pruned even though a protected point precedes it —
    // the guard lives inside the batch window, so protected rows never clog it.
    expect(summary.deleted).toBe(1);
    expect(await metricIds(owner.orgId)).toEqual([protectedOldest]);
  });

  it("org A's prune never touches org B's data", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerModel = await createTestModelInventory(owner.orgId);
    const attackerModel = await createTestModelInventory(attacker.orgId);

    const ownerOld = await createTestMrmMetric(owner.orgId, ownerModel, { at: ANCIENT });
    await createTestMrmMetricEvaluation(owner.orgId, ownerOld, { status: "ok" });
    const attackerOld = await createTestMrmMetric(attacker.orgId, attackerModel, {
      at: ANCIENT,
    });
    await createTestMrmMetricEvaluation(attacker.orgId, attackerOld, { status: "ok" });

    const summary = await runRetentionPrune(owner.orgId);

    expect(summary.deleted).toBe(1);
    expect(await metricIds(owner.orgId)).toEqual([]);
    // The attacker org's identical aged benign point is untouched.
    expect(await metricIds(attacker.orgId)).toEqual([attackerOld]);
  });
});
