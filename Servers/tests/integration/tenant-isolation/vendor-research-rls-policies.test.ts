/**
 * Row-level security on the six vendor research tables of the registry.
 *
 * Every table in tenantIsolation.registry.ts is meant to carry the
 * tenant_isolation policy, and 20260721090000 grants the non-owner runtime role
 * verifywise_app DML on every table, so a registered table without the policy
 * fails OPEN once the app connects as that role. The vendor research tables were
 * registered without it; 20261111223040 installs it.
 *
 * The rest of the isolation pack cannot catch this: it runs as the table owner,
 * and PostgreSQL does not apply RLS to the owner without FORCE ROW LEVEL
 * SECURITY. Like reporting-rls-policies.test.ts, these tests SET LOCAL ROLE to
 * the runtime role so the policy is actually evaluated.
 */

import { sequelize } from "../../../database/db";
import { QueryTypes, Transaction } from "sequelize";
import { cleanupDatabase, createTestOrganization } from "../helpers";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("../../../database/migrations/20261111223040-rls-policies-vendor-research-tables.js");

jest.setTimeout(60_000);

const APP_ROLE = "verifywise_app";

const TABLES = [
  "vendor_research_runs",
  "vendor_research_settings",
  "vendor_research_snapshots",
  "vendor_research_sources",
  "vendor_risk_findings",
  "vendor_vrdb_matches",
];

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

interface PolicyRow {
  table_name: string;
  rls: boolean;
  policy: string | null;
}

async function policyState(): Promise<PolicyRow[]> {
  return (await sequelize.query(
    `SELECT c.relname AS table_name, c.relrowsecurity AS rls, p.polname AS policy
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_policy p ON p.polrelid = c.oid AND p.polname = 'tenant_isolation'
      WHERE n.nspname = 'verifywise' AND c.relname IN (:tables)
      ORDER BY c.relname`,
    { replacements: { tables: TABLES }, type: QueryTypes.SELECT },
  )) as PolicyRow[];
}

const unprotected = (rows: PolicyRow[]): string[] =>
  rows.filter((r) => !r.rls || r.policy === null).map((r) => r.table_name);

async function seedSettings(orgId: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO vendor_research_settings (organization_id, updated_at) VALUES (:orgId, NOW())`,
    { replacements: { orgId } },
  );
}

describe("row-level security on the vendor research tables", () => {
  let orgA: number;
  let orgB: number;

  beforeAll(async () => {
    await cleanupDatabase();
    orgA = await createTestOrganization("Example Ltd RLS A");
    orgB = await createTestOrganization("Example Ltd RLS B");
    await seedSettings(orgA);
    await seedSettings(orgB);
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  it("enables row-level security and a tenant_isolation policy on all six tables", async () => {
    const rows = await policyState();
    expect(rows.map((r) => r.table_name)).toEqual(TABLES);
    expect(unprotected(rows)).toEqual([]);
  });

  it("hides another organization's rows from the non-owner runtime role", async () => {
    const visible = await asAppRole(orgA, async (t) =>
      (
        (await sequelize.query(
          `SELECT organization_id FROM vendor_research_settings ORDER BY organization_id`,
          { type: QueryTypes.SELECT, transaction: t },
        )) as Array<{ organization_id: number }>
      ).map((r) => Number(r.organization_id)),
    );

    expect(visible).toEqual([orgA]);
  });

  it("refuses a write into another organization from the non-owner runtime role", async () => {
    const orgC = await createTestOrganization("Example Ltd RLS C");

    await expect(
      asAppRole(orgA, (t) =>
        sequelize.query(
          `INSERT INTO vendor_research_settings (organization_id, updated_at) VALUES (:orgC, NOW())`,
          { replacements: { orgC }, transaction: t },
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("removes the policies on down and installs them again on up, twice in a row", async () => {
    const queryInterface = sequelize.getQueryInterface();
    try {
      await migration.down(queryInterface);
      const afterDown = await policyState();
      expect(afterDown.filter((r) => r.rls || r.policy !== null)).toEqual([]);
    } finally {
      // Restore the policies even when an assertion above fails, so the suites
      // that run after this one in the same database still see them.
      await migration.up(queryInterface);
    }
    await migration.up(queryInterface);

    expect(unprotected(await policyState())).toEqual([]);
  });
});
