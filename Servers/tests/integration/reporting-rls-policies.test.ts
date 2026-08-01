/**
 * RLS Phase 2 readiness for the reporting tables.
 *
 * 20260720100200 installs the tenant_isolation policy from a hardcoded table
 * list that predates the four reporting tables this branch registered, so they
 * had no policy while 20260721090000 grants verifywise_app DML on every table
 * in the schema. Under Phase 2 the covered tables fail closed and these four
 * would have failed open.
 *
 * The rest of the isolation suite cannot catch this: it runs as the table
 * owner, and PostgreSQL does not apply RLS to the owner without FORCE ROW LEVEL
 * SECURITY. These tests SET LOCAL ROLE to the non-owner runtime role so the
 * policies are actually evaluated.
 *
 * The report_templates case is the one worth pinning: its organization_id is
 * nullable because system templates are shared across tenants, so the standard
 * predicate would evaluate to NULL and hide the entire system template library.
 */

import { sequelize } from "../../database/db";
import { QueryTypes, Transaction } from "sequelize";
import { createTestOrganization, cleanupDatabase } from "./helpers";

const APP_ROLE = "verifywise_app";

/** Run `fn` inside a transaction acting as the non-owner runtime role. */
async function asAppRole<T>(orgId: number | null, fn: (t: Transaction) => Promise<T>): Promise<T> {
  const t = await sequelize.transaction();
  try {
    await sequelize.query(`SET LOCAL ROLE ${APP_ROLE}`, { transaction: t });
    // orgId === null leaves the GUC untouched. Every set here is SET LOCAL, so
    // it is discarded at transaction end and a later transaction on the same
    // pooled connection genuinely starts with it unset — which is exactly what
    // a connection that skipped the tenant-context hook looks like. Setting it
    // to '' instead would raise on the ::int cast: also fail-closed, but a
    // different code path from the NULL predicate being pinned here.
    if (orgId !== null) {
      await sequelize.query(`SET LOCAL app.current_org = '${orgId}'`, { transaction: t });
    }
    const out = await fn(t);
    await t.rollback();
    return out;
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

async function seedTemplate(orgId: number | null, name: string): Promise<number> {
  const rows = (await sequelize.query(
    `INSERT INTO report_templates
       (organization_id, name, slug, category, default_scope, is_system_template, created_at, updated_at)
     VALUES (:orgId, :name, :slug, 'governance', 'organization', :isSystem, NOW(), NOW())
     RETURNING id`,
    {
      replacements: {
        orgId,
        name,
        slug: `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
        isSystem: orgId === null,
      },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ id: number }>;
  return rows[0].id;
}

async function seedRun(orgId: number): Promise<number> {
  const rows = (await sequelize.query(
    `INSERT INTO report_runs (organization_id, triggered_by, status, created_at)
     VALUES (:orgId, 'manual', 'success', NOW())
     RETURNING id`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  )) as Array<{ id: number }>;
  return rows[0].id;
}

describe("row-level security on the reporting tables", () => {
  let orgA: number;
  let orgB: number;

  beforeAll(async () => {
    await cleanupDatabase();
    orgA = await createTestOrganization("RLS org A");
    orgB = await createTestOrganization("RLS org B");
  });

  afterAll(async () => {
    await cleanupDatabase();
    await sequelize.close();
  });

  it("enables row-level security and a tenant_isolation policy on all four tables", async () => {
    const rows = (await sequelize.query(
      `SELECT c.relname AS table_name, c.relrowsecurity AS rls, p.polname AS policy
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_policy p ON p.polrelid = c.oid AND p.polname = 'tenant_isolation'
        WHERE n.nspname = 'verifywise'
          AND c.relname IN ('report_templates','report_runs','report_run_analyses','scheduled_reports')
        ORDER BY c.relname`,
      { type: QueryTypes.SELECT },
    )) as Array<{ table_name: string; rls: boolean; policy: string | null }>;

    expect(rows).toHaveLength(4);
    expect(rows.filter((r) => !r.rls).map((r) => r.table_name)).toEqual([]);
    expect(rows.filter((r) => r.policy === null).map((r) => r.table_name)).toEqual([]);
  });

  it("hides another organization's report runs from the non-owner runtime role", async () => {
    const mine = await seedRun(orgA);
    const theirs = await seedRun(orgB);

    const visible = await asAppRole(orgA, async (t) => {
      return (await sequelize.query(`SELECT id FROM report_runs ORDER BY id`, {
        type: QueryTypes.SELECT,
        transaction: t,
      })) as Array<{ id: number }>;
    });

    const ids = visible.map((r) => Number(r.id));
    expect(ids).toContain(mine);
    expect(ids).not.toContain(theirs);
  });

  it("keeps shared system templates visible while hiding another tenant's templates", async () => {
    // The trap: report_templates.organization_id is nullable for system
    // templates. A strict `organization_id = current_setting(...)` predicate
    // evaluates to NULL for those rows, which under RLS means no match — the
    // whole shared library would vanish for every organization.
    const systemTemplate = await seedTemplate(null, "System Pulse");
    const mine = await seedTemplate(orgA, "Org A template");
    const theirs = await seedTemplate(orgB, "Org B template");

    const visible = await asAppRole(orgA, async (t) => {
      return (await sequelize.query(`SELECT id FROM report_templates ORDER BY id`, {
        type: QueryTypes.SELECT,
        transaction: t,
      })) as Array<{ id: number }>;
    });

    const ids = visible.map((r) => Number(r.id));
    expect(ids).toContain(systemTemplate);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(theirs);
  });

  it("refuses to write a row into another organization", async () => {
    await expect(
      asAppRole(orgA, async (t) => {
        await sequelize.query(
          `INSERT INTO report_runs (organization_id, triggered_by, status, created_at)
           VALUES (:orgId, 'manual', 'success', NOW())`,
          { replacements: { orgId: orgB }, type: QueryTypes.INSERT, transaction: t },
        );
      }),
    ).rejects.toThrow();
  });

  it("refuses to write a shared system template from a tenant session", async () => {
    // WITH CHECK stays strict even though USING admits NULL rows, so a tenant
    // cannot mint a template that every other tenant would then see.
    await expect(
      asAppRole(orgA, async (t) => {
        await sequelize.query(
          `INSERT INTO report_templates
             (organization_id, name, slug, category, default_scope, is_system_template, created_at, updated_at)
           VALUES (NULL, 'Smuggled', :slug, 'governance', 'organization', true, NOW(), NOW())`,
          {
            replacements: { slug: `smuggled-${Date.now()}` },
            type: QueryTypes.INSERT,
            transaction: t,
          },
        );
      }),
    ).rejects.toThrow();
  });

  it("exposes no rows when app.current_org is not set for the transaction", async () => {
    await seedRun(orgA);

    // Two fail-closed shapes are possible and both are acceptable; what must
    // never happen is rows coming back. Postgres keeps a custom GUC "defined"
    // once it has been SET anywhere in the session, resetting it to '' rather
    // than to NULL, so depending on connection history the predicate either
    // evaluates to NULL (no rows match) or raises on ''::int. Asserting only
    // one of the two would make this test depend on pool scheduling.
    let rows: Array<{ id: number }> | null = null;
    try {
      rows = await asAppRole(null, async (t) => {
        return (await sequelize.query(`SELECT id FROM report_runs`, {
          type: QueryTypes.SELECT,
          transaction: t,
        })) as Array<{ id: number }>;
      });
    } catch {
      rows = null; // rejected outright — also fail-closed
    }

    expect(rows === null || rows.length === 0).toBe(true);
  });
});
