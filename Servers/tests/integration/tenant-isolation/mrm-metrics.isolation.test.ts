jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import {
  createTestModelInventory,
  createTestMrmMetric,
  createTestMrmIngestionToken,
} from "../../factories";

/**
 * MRM metrics (ingested time-series) tenant isolation.
 *
 * NOTE: MRM has no REST endpoints yet (the database layer only). These tests
 * assert the isolation contract at the query layer — the same
 * `WHERE organization_id = :orgId` scoping every MRM controller/util will use.
 */
describe("MRM metrics tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("scopes metric rows to the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    await createTestMrmMetric(owner.orgId, modelId, { metric: "psi", value: 0.28 });

    const ownerRows = await sequelize.query(
      `SELECT id FROM mrm_metrics WHERE organization_id = :orgId`,
      { replacements: { orgId: owner.orgId }, type: QueryTypes.SELECT },
    );
    expect(ownerRows.length).toBeGreaterThan(0);

    const attackerRows = await sequelize.query(
      `SELECT id FROM mrm_metrics WHERE organization_id = :orgId`,
      { replacements: { orgId: attacker.orgId }, type: QueryTypes.SELECT },
    );
    expect(attackerRows.length).toBe(0);
  });

  it("stamps organization_id on the metric row", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const metricId = await createTestMrmMetric(owner.orgId, modelId);

    const [row] = (await sequelize.query(`SELECT organization_id FROM mrm_metrics WHERE id = :id`, {
      replacements: { id: metricId },
      type: QueryTypes.SELECT,
    })) as [{ organization_id: number }];

    expect(row.organization_id).toBe(owner.orgId);
  });

  it("enforces the idempotency unique (org, model, metric, segment, window, at_bucket)", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const point = {
      metric: "psi",
      segment: "overall",
      window: "daily",
      at: "2026-07-02T00:00:00Z",
    };
    await createTestMrmMetric(owner.orgId, modelId, point);

    // Re-POST of the same logical point must collide (dedup key).
    await expect(createTestMrmMetric(owner.orgId, modelId, point)).rejects.toThrow();
  });

  it("dedups points that differ only in sub-second precision (at is bucketed to the second)", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const base = { metric: "psi", segment: "overall", window: "daily" };
    await createTestMrmMetric(owner.orgId, modelId, { ...base, at: "2026-07-02T00:00:00.000Z" });

    // Same second, different microseconds — a retry with jittered precision must
    // still collide because the unique is keyed on date_trunc('second', at).
    await expect(
      createTestMrmMetric(owner.orgId, modelId, { ...base, at: "2026-07-02T00:00:00.512Z" }),
    ).rejects.toThrow();
  });

  it("preserves the metric row (ingestion_token_id SET NULL) when the token is deleted", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const tokenId = await createTestMrmIngestionToken(owner.orgId);
    const metricId = await createTestMrmMetric(owner.orgId, modelId, {
      ingestion_token_id: tokenId,
    });

    // Deleting the token must NOT delete the metric point — the audit record
    // remains, token reference is blanked (ON DELETE SET NULL).
    await sequelize.query(`DELETE FROM mrm_ingestion_tokens WHERE id = :id`, {
      replacements: { id: tokenId },
    });

    const [row] = (await sequelize.query(
      `SELECT ingestion_token_id FROM mrm_metrics WHERE id = :id`,
      { replacements: { id: metricId }, type: QueryTypes.SELECT },
    )) as [{ ingestion_token_id: number | null } | undefined];

    expect(row).toBeDefined();
    expect(row?.ingestion_token_id).toBeNull();
  });
});
