jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { cleanupDatabase, seedTwoOrgsAndUsers } from "../helpers";
import { buildTenantContext, seedTwoTenantContexts } from "./tenantIsolation.harness";

/**
 * data retention tables -- tenant isolation at the query layer.
 *
 * Rows written for org A in data_retention_settings, data_retention_runs and
 * audit_ledger_retention_checkpoints must never be returned by the
 * organization_id-scoped reads the retention code uses for org B.
 */
describe("data retention tables tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  async function count(table: string, orgId: number): Promise<number> {
    const [row] = await sequelize.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM ${table} WHERE organization_id = :orgId`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    );
    return Number(row.n);
  }

  it("does not return org A rows when reading as org B", async () => {
    const { orgA, orgB, userA } = await seedTwoOrgsAndUsers();

    await sequelize.query(
      `INSERT INTO data_retention_settings (organization_id, audit_retention_months, updated_by)
       VALUES (:orgA, 24, :userA)`,
      { replacements: { orgA, userA } },
    );
    await sequelize.query(
      `INSERT INTO data_retention_runs (organization_id, record_type, deleted_count, status)
       VALUES (:orgA, 'audit_records', 3, 'success')`,
      { replacements: { orgA } },
    );
    await sequelize.query(
      `INSERT INTO audit_ledger_retention_checkpoints
         (organization_id, pruned_through_id, anchor_hash, cutoff, rows_deleted)
       VALUES (:orgA, 10, :hash, now(), 3)`,
      { replacements: { orgA, hash: "b".repeat(64) } },
    );

    for (const table of [
      "data_retention_settings",
      "data_retention_runs",
      "audit_ledger_retention_checkpoints",
    ]) {
      expect(await count(table, orgA)).toBe(1);
      expect(await count(table, orgB)).toBe(0);
    }
  });
});

describe("data retention routes tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  const auditRow = (res: any) => res.body.data.rows.find((r: any) => r.key === "audit_records");

  it("shows org B neither org A's setting, run history nor ledger checkpoint", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    const put = await owner.request.put("/api/data-retention/audit-records").send({ months: 24 });
    expect(put.status).toBe(200);
    expect(put.body.data).toEqual({ months: 24 });

    await sequelize.query(
      `INSERT INTO data_retention_runs (organization_id, record_type, deleted_count, status)
       VALUES (:orgId, 'audit_records', 3, 'success')`,
      { replacements: { orgId: owner.orgId } },
    );
    await sequelize.query(
      `INSERT INTO audit_ledger_retention_checkpoints
         (organization_id, pruned_through_id, anchor_hash, cutoff, rows_deleted)
       VALUES (:orgId, 10, :hash, now(), 3)`,
      { replacements: { orgId: owner.orgId, hash: "b".repeat(64) } },
    );

    const ownerView = await owner.request.get("/api/data-retention");
    expect(ownerView.status).toBe(200);
    expect(auditRow(ownerView)).toMatchObject({
      period: { unit: "months", value: 24 },
      automaticDeletion: "yes",
      lastCleanup: { deletedCount: 3, status: "success" },
    });
    expect(ownerView.body.data.auditPrunedThrough).not.toBeNull();

    const attackerView = await attacker.request.get("/api/data-retention");
    expect(attackerView.status).toBe(200);
    expect(auditRow(attackerView)).toMatchObject({
      period: null,
      automaticDeletion: "no",
      lastCleanup: null,
    });
    expect(attackerView.body.data.auditPrunedThrough).toBeNull();
  });

  it("rejects an invalid period and previews counts for the caller's org only", async () => {
    const { owner } = await seedTwoTenantContexts();

    expect(
      (await owner.request.put("/api/data-retention/audit-records").send({ months: 7 })).status,
    ).toBe(400);
    expect(
      (await owner.request.get("/api/data-retention/audit-records/preview?months=5")).status,
    ).toBe(400);

    const preview = await owner.request.get("/api/data-retention/audit-records/preview?months=12");
    expect(preview.status).toBe(200);
    expect(preview.body.data).toEqual({ count: 0 });
  });

  it("keeps the period when an Editor tries to change it", async () => {
    const editor = await buildTenantContext(3);

    const res = await editor.request.put("/api/data-retention/audit-records").send({ months: 12 });
    expect(res.status).toBe(403);

    const [row] = await sequelize.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM data_retention_settings WHERE organization_id = :orgId`,
      { replacements: { orgId: editor.orgId }, type: QueryTypes.SELECT },
    );
    expect(Number(row.n)).toBe(0);
  });
});
