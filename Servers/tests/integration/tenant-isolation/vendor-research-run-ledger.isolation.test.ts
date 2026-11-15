/**
 * vendor_research_run_ledger: the ledger of the daily research run cap (one row per run that
 * started, kept after the run's vendor is deleted). It has no route of its own: the worker writes
 * it when a run starts and the start of a run reads it through countRunsSinceQuery.
 *
 * Checked here: the table carries the tenant_isolation policy of the other vendor research tables
 * (evaluated as the non-owner runtime role, as vendor-research-rls-policies.test.ts does), and an
 * organization's count never reads another organization's ledger rows.
 */

jest.setTimeout(60_000);

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../../database/db";
import { cleanupDatabase, createTestOrganization } from "../helpers";
import { countRunsSinceQuery } from "../../../utils/vendorResearch.utils";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("../../../database/migrations/20261112100828-create-vendor-research-run-ledger.js");

const APP_ROLE = "verifywise_app";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Run `fn` as the runtime role scoped to `orgId`, then roll back. */
async function asAppRole<T>(orgId: number, fn: (t: Transaction) => Promise<T>): Promise<T> {
  const t = await sequelize.transaction();
  try {
    await sequelize.query(`SET LOCAL ROLE ${APP_ROLE}`, { transaction: t });
    await sequelize.query(`SET LOCAL app.current_org = '${orgId}'`, { transaction: t });
    return await fn(t);
  } finally {
    await t.rollback();
  }
}

async function policyState(): Promise<{ rls: boolean; policy: string | null }> {
  const [row] = (await sequelize.query(
    `SELECT c.relrowsecurity AS rls, p.polname AS policy
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_policy p ON p.polrelid = c.oid AND p.polname = 'tenant_isolation'
      WHERE n.nspname = 'verifywise' AND c.relname = 'vendor_research_run_ledger'`,
    { type: QueryTypes.SELECT },
  )) as Array<{ rls: boolean; policy: string | null }>;
  return row;
}

/** A ledger row of a run that no longer exists (negative ids are never a run's). */
const seedLedger = (orgId: number, runId: number) =>
  sequelize.query(
    `INSERT INTO vendor_research_run_ledger (organization_id, run_id) VALUES (:orgId, :runId)`,
    { replacements: { orgId, runId } },
  );

describe("vendor_research_run_ledger tenant isolation", () => {
  let orgA: number;
  let orgB: number;

  beforeAll(async () => {
    await cleanupDatabase();
    orgA = await createTestOrganization("Example Ltd ledger A");
    orgB = await createTestOrganization("Example Ltd ledger B");
    await seedLedger(orgA, -1);
    await seedLedger(orgA, -2);
    await seedLedger(orgB, -3);
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  it("enables row-level security and the tenant_isolation policy", async () => {
    expect(await policyState()).toEqual({ rls: true, policy: "tenant_isolation" });
  });

  it("hides another organization's rows from the non-owner runtime role", async () => {
    const visible = await asAppRole(orgA, async (t) =>
      (
        (await sequelize.query(
          `SELECT organization_id, run_id FROM vendor_research_run_ledger ORDER BY run_id DESC`,
          { type: QueryTypes.SELECT, transaction: t },
        )) as Array<{ organization_id: number; run_id: number }>
      ).map((r) => [Number(r.organization_id), Number(r.run_id)]),
    );

    expect(visible).toEqual([
      [orgA, -1],
      [orgA, -2],
    ]);
  });

  it("refuses a write into another organization from the non-owner runtime role", async () => {
    await expect(
      asAppRole(orgA, (t) =>
        sequelize.query(
          `INSERT INTO vendor_research_run_ledger (organization_id, run_id) VALUES (:orgB, -9)`,
          { replacements: { orgB }, transaction: t },
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("counts only the organization's own ledger rows toward its daily cap", async () => {
    const since = new Date(Date.now() - DAY_MS);
    expect(await countRunsSinceQuery(orgA, since)).toBe(2);
    expect(await countRunsSinceQuery(orgB, since)).toBe(1);
  });

  it("removes the table on down and creates it again on up, twice in a row", async () => {
    const queryInterface = sequelize.getQueryInterface();
    try {
      await migration.down(queryInterface);
      const [{ exists }] = (await sequelize.query(
        `SELECT to_regclass('verifywise.vendor_research_run_ledger') IS NOT NULL AS exists`,
        { type: QueryTypes.SELECT },
      )) as Array<{ exists: boolean }>;
      expect(exists).toBe(false);
    } finally {
      // Restore the table even when an assertion above fails, so the suites that run after this
      // one in the same database still have it.
      await migration.up(queryInterface);
    }
    await migration.up(queryInterface);

    expect(await policyState()).toEqual({ rls: true, policy: "tenant_isolation" });
  });
});
