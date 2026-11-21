jest.setTimeout(60000);

/**
 * The daily research run cap survives the delete of a vendor (RV10-CB-1).
 *
 * The cap (VENDOR_RESEARCH_DAILY_RUN_CAP) counted rows of vendor_research_runs, which go with their
 * vendor (ON DELETE CASCADE). Deleting a vendor whose run had started took that run out of the
 * count, although it had searched and called a model, so a holder of vendor.edit could start,
 * delete and start again without ever reaching the cap. A run that started is now also written to
 * vendor_research_run_ledger, which holds no vendor data and goes only with the organization, and
 * the count adds the ledger rows whose run no longer exists.
 *
 * BullMQ is mocked by ./setup (loaded by the harness), so no job is run.
 */

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import type { TenantContext } from "./tenant-isolation/tenantIsolation.harness";
import { createTestVendor } from "../factories";
import {
  countRunsSinceQuery,
  createRunQuery,
  markRunRunningQuery,
} from "../../utils/vendorResearch.utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const FAKE_LLM_KEY = "sk-SENTINEL-integration-ledger-3c1e";

const RESEARCH_ENV: Record<string, string> = {
  VENDOR_RESEARCH_AUTO_RUN: "false",
  VENDOR_RESEARCH_MANUAL_COOLDOWN_MINUTES: "10",
  VENDOR_RESEARCH_DAILY_RUN_CAP: "2",
};

const originalEnv: Record<string, string | undefined> = Object.fromEntries(
  Object.keys(RESEARCH_ENV).map((name) => [name, process.env[name]]),
);

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(process.env, RESEARCH_ENV);
});

afterEach(async () => {
  await cleanupDatabase();
});

afterAll(() => {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const rows = async <T = Record<string, unknown>>(
  sql: string,
  replacements: Record<string, unknown> = {},
): Promise<T[]> => (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT })) as T[];

const seedLlmKey = (orgId: number) =>
  sequelize.query(
    `INSERT INTO llm_keys (organization_id, key, name, model) VALUES (:orgId, :key, 'OpenAI', 'gpt-4o')`,
    { replacements: { orgId, key: FAKE_LLM_KEY } },
  );

/** A run of `vendorId` that was queued and, when `start` holds, started by a worker. */
async function runOf(ctx: TenantContext, vendorId: number, start = true): Promise<number> {
  const run = await createRunQuery({
    organizationId: ctx.orgId,
    vendorId,
    triggerType: "manual",
    requestedBy: ctx.userId,
  });
  if (start) expect(await markRunRunningQuery(ctx.orgId, run.id)).toBe(true);
  return run.id;
}

const countToday = (orgId: number) => countRunsSinceQuery(orgId, new Date(Date.now() - DAY_MS));

const deleteVendor = async (ctx: TenantContext, vendorId: number) => {
  const res = await ctx.request.delete(`/api/vendors/${vendorId}`);
  expect(res.status).toBe(202);
  const left = await rows(`SELECT id FROM vendors WHERE id = :vendorId`, { vendorId });
  expect(left).toEqual([]);
};

const ledgerOf = (orgId: number) =>
  rows<{ organization_id: number; run_id: number }>(
    `SELECT organization_id, run_id FROM vendor_research_run_ledger
     WHERE organization_id = :orgId ORDER BY run_id`,
    { orgId },
  );

describe("the daily research run cap and the delete of a vendor", () => {
  it("still counts a started run of a deleted vendor and refuses the next start with daily_cap", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    await seedLlmKey(owner.orgId);
    const gone = await createTestVendor(owner.orgId, { vendor_name: "Gone Corp" });
    const kept = await createTestVendor(owner.orgId, { vendor_name: "Kept Corp" });
    const next = await createTestVendor(owner.orgId, { vendor_name: "Next Corp" });
    const goneRun = await runOf(owner, gone);
    await runOf(owner, kept);

    // Positive control: two started runs fill the cap of two.
    const capped = await owner.request.post(`/api/v1/vendors/${next}/research`);
    expect(capped.status).toBe(429);
    expect(capped.body.data).toEqual({ code: "daily_cap" });
    expect(await countToday(owner.orgId)).toBe(2);

    await deleteVendor(owner, gone);

    // The research data went with the vendor...
    expect(
      await rows(`SELECT id FROM vendor_research_runs WHERE id = :goneRun`, { goneRun }),
    ).toEqual([]);
    // ...but its spend did not.
    expect(await countToday(owner.orgId)).toBe(2);
    const still = await owner.request.post(`/api/v1/vendors/${next}/research`);
    expect(still.status).toBe(429);
    expect(still.body.data).toEqual({ code: "daily_cap" });
  });

  it("does not count a deleted vendor's run that never started", async () => {
    process.env.VENDOR_RESEARCH_DAILY_RUN_CAP = "1";
    const { owner } = await seedTwoTenantContexts(1);
    await seedLlmKey(owner.orgId);
    const failedVendor = await createTestVendor(owner.orgId, { vendor_name: "Failed Corp" });
    const queuedVendor = await createTestVendor(owner.orgId, { vendor_name: "Queued Corp" });
    const next = await createTestVendor(owner.orgId, { vendor_name: "Next Corp" });
    const failedRun = await runOf(owner, failedVendor, false);
    await sequelize.query(
      `UPDATE vendor_research_runs SET status = 'failed', finished_at = NOW() WHERE id = :failedRun`,
      { replacements: { failedRun } },
    );
    await runOf(owner, queuedVendor, false);
    // The queued run counts while it waits (the old rule, unchanged)...
    expect(await countToday(owner.orgId)).toBe(1);

    await deleteVendor(owner, failedVendor);
    await deleteVendor(owner, queuedVendor);

    // ...and neither run spent anything, so neither counts once its vendor is gone.
    expect(await ledgerOf(owner.orgId)).toEqual([]);
    expect(await countToday(owner.orgId)).toBe(0);
    const started = await owner.request.post(`/api/v1/vendors/${next}/research`);
    expect(started.status).toBe(202);
  });

  it("keeps counting runs that exist the way it did (a raw run without a ledger row, an aged run)", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const vendor = await createTestVendor(owner.orgId, { vendor_name: "Acme Corp" });
    const other = await createTestVendor(owner.orgId, { vendor_name: "Other Corp" });
    // A run written by other code (no ledger row) still counts while it exists.
    await sequelize.query(
      `INSERT INTO vendor_research_runs (organization_id, vendor_id, trigger_type, status, started_at)
       VALUES (:orgId, :vendor, 'auto', 'completed', NOW())`,
      { replacements: { orgId: owner.orgId, vendor } },
    );
    // A started run made older than a day stops counting, also through its ledger row.
    const aged = await runOf(owner, other);
    await sequelize.query(
      `UPDATE vendor_research_runs SET created_at = NOW() - INTERVAL '25 hours' WHERE id = :aged`,
      { replacements: { aged } },
    );
    expect(await countToday(owner.orgId)).toBe(1);
  });

  it("does not let a run that exists count twice, through the run and its ledger row", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const vendor = await createTestVendor(owner.orgId, { vendor_name: "Acme Corp" });
    const run = await runOf(owner, vendor);
    expect(await ledgerOf(owner.orgId)).toEqual([{ organization_id: owner.orgId, run_id: run }]);
    expect(await countToday(owner.orgId)).toBe(1);
  });

  it("leaves the other organization's count alone", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    await seedLlmKey(attacker.orgId);
    const a = await createTestVendor(owner.orgId, { vendor_name: "A Corp" });
    const b = await createTestVendor(owner.orgId, { vendor_name: "B Corp" });
    await runOf(owner, a);
    await runOf(owner, b);
    await deleteVendor(owner, a);
    expect(await countToday(owner.orgId)).toBe(2);

    expect(await countToday(attacker.orgId)).toBe(0);
    const theirs = await createTestVendor(attacker.orgId, { vendor_name: "Their Corp" });
    const started = await attacker.request.post(`/api/v1/vendors/${theirs}/research`);
    expect(started.status).toBe(202);
  });

  it("holds no vendor data in the ledger", async () => {
    const columns = await rows<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'verifywise' AND table_name = 'vendor_research_run_ledger'
       ORDER BY ordinal_position`,
    );
    expect(columns.map((c) => c.column_name)).toEqual([
      "id",
      "organization_id",
      "run_id",
      "created_at",
    ]);
    // run_id has no foreign key: the row must outlive the run.
    const keys = await rows<{ conname: string; confrelid: string }>(
      `SELECT conname, confrelid::regclass::text AS confrelid FROM pg_constraint
       WHERE conrelid = 'verifywise.vendor_research_run_ledger'::regclass AND contype = 'f'`,
    );
    expect(keys.map((k) => k.confrelid)).toEqual(["organizations"]);
  });

  it("goes with the organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    const vendor = await createTestVendor(owner.orgId, { vendor_name: "Acme Corp" });
    const theirs = await createTestVendor(attacker.orgId, { vendor_name: "Their Corp" });
    await runOf(owner, vendor);
    await runOf(attacker, theirs);
    expect(await ledgerOf(owner.orgId)).toHaveLength(1);

    const [{ confdeltype }] = await rows<{ confdeltype: string }>(
      `SELECT confdeltype FROM pg_constraint
       WHERE conrelid = 'verifywise.vendor_research_run_ledger'::regclass AND contype = 'f'`,
    );
    expect(confdeltype).toBe("c");
    // Its only member goes with it, as when the app deletes an organization: a user left with no
    // organization is refused at commit.
    await sequelize.transaction(async (transaction) => {
      await sequelize.query(`DELETE FROM organizations WHERE id = :orgId`, {
        replacements: { orgId: owner.orgId },
        transaction,
      });
      await sequelize.query(`DELETE FROM users WHERE id = :userId`, {
        replacements: { userId: owner.userId },
        transaction,
      });
    });
    expect(await ledgerOf(owner.orgId)).toEqual([]);
    expect(await ledgerOf(attacker.orgId)).toHaveLength(1);
  });

  it("drops the organization's ledger rows older than seven days when a run starts, and only those", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    const vendor = await createTestVendor(owner.orgId, { vendor_name: "Acme Corp" });
    await sequelize.query(
      `INSERT INTO vendor_research_run_ledger (organization_id, run_id, created_at) VALUES
         (:owner, -1, NOW() - INTERVAL '8 days'),
         (:owner, -2, NOW() - INTERVAL '6 days'),
         (:attacker, -3, NOW() - INTERVAL '8 days')`,
      { replacements: { owner: owner.orgId, attacker: attacker.orgId } },
    );
    const run = await runOf(owner, vendor);

    expect((await ledgerOf(owner.orgId)).map((r) => r.run_id)).toEqual([-2, run]);
    expect((await ledgerOf(attacker.orgId)).map((r) => r.run_id)).toEqual([-3]);
    // A ledger row of six days does not reach into the window of a day.
    expect(await countToday(owner.orgId)).toBe(1);
  });
});
