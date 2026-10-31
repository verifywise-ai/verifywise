jest.setTimeout(60000);

/**
 * The memory of the sources a vendor's runs have shown to the model, and the queries of the
 * scheduled scan, against the real tables of the test database.
 *
 * The unit tests of the pipeline and of the scan mock these queries. What they cannot show is what
 * the database does with them: the upsert that keeps the first run, the guard that stops a vendor
 * of another organization, the cascades, and which vendors are due and in which order.
 */

// First, and not to be reordered: ./setup registers the mocks of BullMQ and Redis.
import "./setup";
import { QueryTypes, Transaction } from "sequelize";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { sequelize } from "../../database/db";
import { createTestVendor } from "../factories";
import {
  createRunQuery,
  getKnownSourceKeysQuery,
  listDueVendorsQuery,
  listScanOrganizationsQuery,
  rememberSourcesQuery,
  saveVendorResearchSettingsQuery,
} from "../../utils/vendorResearch.utils";

afterEach(async () => {
  await cleanupDatabase();
});

interface Seed {
  orgId: number;
  userId: number;
  vendorId: number;
}

async function seedVendor(): Promise<Seed> {
  const orgId = await createTestOrganization("Sources org");
  const userId = await createTestUser(orgId, 1, `sources-${Date.now()}@test.com`, "Password123!");
  const vendorId = await createTestVendor(orgId, { vendor_name: "Acme" });
  return { orgId, userId, vendorId };
}

/** A run that has ended, for the vendor, with an id to point at. */
async function seedRun(seed: Seed): Promise<number> {
  const queued = await createRunQuery({
    organizationId: seed.orgId,
    vendorId: seed.vendorId,
    triggerType: "manual",
    requestedBy: seed.userId,
  });
  await sequelize.query(`UPDATE vendor_research_runs SET status = 'completed' WHERE id = :id`, {
    replacements: { id: queued.id },
  });
  return queued.id;
}

/** Remembers keys for the vendor of the seed, as the run says. */
const remember = (
  seed: Pick<Seed, "orgId" | "vendorId">,
  runId: number,
  keys: readonly string[],
  transaction?: Transaction,
) =>
  rememberSourcesQuery(
    { organizationId: seed.orgId, vendorId: seed.vendorId, runId, keys },
    transaction,
  );

interface SourceRow {
  source_key: string;
  first_seen_run_id: number | null;
  first_seen_at: Date;
  last_seen_at: Date;
}

const sourceRows = (seed: Pick<Seed, "orgId" | "vendorId">) =>
  sequelize.query(
    `SELECT source_key, first_seen_run_id, first_seen_at, last_seen_at
     FROM vendor_research_sources
     WHERE organization_id = :orgId AND vendor_id = :vendorId
     ORDER BY source_key`,
    { replacements: seed, type: QueryTypes.SELECT },
  ) as Promise<SourceRow[]>;

const countAllSources = async (): Promise<number> =>
  (
    (await sequelize.query(`SELECT COUNT(*)::int AS count FROM vendor_research_sources`, {
      type: QueryTypes.SELECT,
    })) as Array<{ count: number }>
  )[0].count;

describe("rememberSourcesQuery and getKnownSourceKeysQuery", () => {
  it("remember the keys of a run, and give them back as a set", async () => {
    const seed = await seedVendor();
    const runId = await seedRun(seed);

    await remember(seed, runId, ["a.example.com/x", "b.example.com/y?id=2"]);

    const known = await getKnownSourceKeysQuery(seed.orgId, seed.vendorId);
    expect(known).toBeInstanceOf(Set);
    expect([...known].sort()).toEqual(["a.example.com/x", "b.example.com/y?id=2"]);
    expect(await sourceRows(seed)).toMatchObject([
      { source_key: "a.example.com/x", first_seen_run_id: runId },
      { source_key: "b.example.com/y?id=2", first_seen_run_id: runId },
    ]);
  });

  it("know nothing of a vendor that has no run", async () => {
    const seed = await seedVendor();

    expect(await getKnownSourceKeysQuery(seed.orgId, seed.vendorId)).toEqual(new Set());
  });

  it("remember a key once: the first run stays, and the time it was last seen moves", async () => {
    const seed = await seedVendor();
    const first = await seedRun(seed);
    await remember(seed, first, ["a.example.com/x"]);
    await sequelize.query(
      `UPDATE vendor_research_sources
       SET first_seen_at = NOW() - INTERVAL '10 days', last_seen_at = NOW() - INTERVAL '10 days'`,
    );
    const [before] = await sourceRows(seed);

    const second = await seedRun(seed);
    await remember(seed, second, ["a.example.com/x", "c.example.com/z"]);

    const rows = await sourceRows(seed);
    expect(rows.map((row) => row.source_key)).toEqual(["a.example.com/x", "c.example.com/z"]);
    const [seenAgain, added] = rows;
    expect(seenAgain.first_seen_run_id).toBe(first);
    expect(seenAgain.first_seen_at.getTime()).toBe(before.first_seen_at.getTime());
    expect(seenAgain.last_seen_at.getTime()).toBeGreaterThan(before.last_seen_at.getTime());
    expect(added.first_seen_run_id).toBe(second);
  });

  it("take the same key twice in one call", async () => {
    const seed = await seedVendor();
    const runId = await seedRun(seed);

    await remember(seed, runId, ["a.example.com/x", "a.example.com/x"]);

    expect(await sourceRows(seed)).toHaveLength(1);
  });

  it("do nothing for an empty list", async () => {
    const seed = await seedVendor();
    const runId = await seedRun(seed);

    await remember(seed, runId, []);

    expect(await countAllSources()).toBe(0);
  });

  it("take many keys at once, and keys that hold quotes and commas as they are", async () => {
    const seed = await seedVendor();
    const runId = await seedRun(seed);
    const keys = [
      ...Array.from({ length: 400 }, (_, index) => `news.example.com/story-${index}`),
      `example.com/it's,a"quote{}?q=a,b`,
    ];

    await remember(seed, runId, keys);

    expect(await getKnownSourceKeysQuery(seed.orgId, seed.vendorId)).toEqual(new Set(keys));
  });

  it("keep the keys of one vendor away from another vendor of the same organization", async () => {
    const seed = await seedVendor();
    const otherVendorId = await createTestVendor(seed.orgId, { vendor_name: "Globex" });
    const runId = await seedRun(seed);

    await remember(seed, runId, ["a.example.com/x"]);

    expect(await getKnownSourceKeysQuery(seed.orgId, otherVendorId)).toEqual(new Set());
    await rememberSourcesQuery({
      organizationId: seed.orgId,
      vendorId: otherVendorId,
      runId,
      keys: ["a.example.com/x"],
    });
    expect(await countAllSources()).toBe(2);
  });

  it("write nothing for a vendor that is not in the organization", async () => {
    const seed = await seedVendor();
    const runId = await seedRun(seed);
    const strangerOrg = await createTestOrganization("Stranger org");

    await rememberSourcesQuery({
      organizationId: strangerOrg,
      vendorId: seed.vendorId,
      runId,
      keys: ["a.example.com/x"],
    });

    expect(await countAllSources()).toBe(0);
  });

  it("take part in the transaction they are given", async () => {
    const seed = await seedVendor();
    const runId = await seedRun(seed);

    await expect(
      sequelize.transaction(async (transaction) => {
        await remember(seed, runId, ["a.example.com/x"], transaction);
        throw new Error("rolled back");
      }),
    ).rejects.toThrow("rolled back");

    expect(await countAllSources()).toBe(0);
  });

  it("go with the vendor, and forget only which run saw a source first when the run goes", async () => {
    const seed = await seedVendor();
    const runId = await seedRun(seed);
    await remember(seed, runId, ["a.example.com/x"]);

    await sequelize.query(`DELETE FROM vendor_research_runs WHERE id = :runId`, {
      replacements: { runId },
    });
    expect(await sourceRows(seed)).toMatchObject([
      { source_key: "a.example.com/x", first_seen_run_id: null },
    ]);

    await sequelize.query(`DELETE FROM vendors WHERE id = :vendorId`, {
      replacements: { vendorId: seed.vendorId },
    });
    expect(await countAllSources()).toBe(0);
  });
});

describe("listScanOrganizationsQuery", () => {
  it("lists the organizations that chose an interval, with the interval, and no other", async () => {
    const weekly = await seedVendor();
    const monthly = await seedVendor();
    const off = await seedVendor();
    // An organization that never opened the setting has no row at all.
    await seedVendor();
    const save = (seed: Seed, scanIntervalDays: number | null) =>
      sequelize.transaction((transaction) =>
        saveVendorResearchSettingsQuery(
          {
            organizationId: seed.orgId,
            userId: seed.userId,
            researchKeyId: null,
            analysisKeyId: null,
            scanIntervalDays,
          },
          transaction,
        ),
      );
    await save(weekly, 7);
    await save(monthly, 30);
    await save(off, null);

    const listed = await listScanOrganizationsQuery();

    expect(listed.sort((a, b) => a.organizationId - b.organizationId)).toEqual([
      { organizationId: weekly.orgId, intervalDays: 7 },
      { organizationId: monthly.orgId, intervalDays: 30 },
    ]);
  });

  it("lists nothing when no organization chose", async () => {
    await seedVendor();

    expect(await listScanOrganizationsQuery()).toEqual([]);
  });
});

describe("saveVendorResearchSettingsQuery and the scan interval", () => {
  const save = (seed: Seed, scanIntervalDays?: number | null) =>
    sequelize.transaction((transaction) =>
      saveVendorResearchSettingsQuery(
        {
          organizationId: seed.orgId,
          userId: seed.userId,
          researchKeyId: null,
          analysisKeyId: null,
          scanIntervalDays,
        },
        transaction,
      ),
    );

  it("store a number, keep it when none is given, and clear it for null", async () => {
    const seed = await seedVendor();

    expect((await save(seed)).scanIntervalDays).toBeNull();
    expect((await save(seed, 14)).scanIntervalDays).toBe(14);
    expect((await save(seed)).scanIntervalDays).toBe(14);
    expect((await save(seed, null)).scanIntervalDays).toBeNull();
  });
});

describe("listDueVendorsQuery", () => {
  /** A run of the vendor that was created `daysAgo` days ago and ended the way `how` says. */
  async function seedRunAt(
    seed: Pick<Seed, "orgId">,
    vendorId: number,
    daysAgo: number,
    how: "completed" | "failed" | "failed before it started" | "scheduled",
  ): Promise<void> {
    const started =
      how === "failed before it started" ? "NULL" : "NOW() - (:days * INTERVAL '1 day')";
    await sequelize.query(
      `INSERT INTO vendor_research_runs
         (organization_id, vendor_id, trigger_type, status, created_at, started_at)
       VALUES
         (:orgId, :vendorId, :trigger, :status, NOW() - (:days * INTERVAL '1 day'), ${started})`,
      {
        replacements: {
          orgId: seed.orgId,
          vendorId,
          days: daysAgo,
          trigger: how === "scheduled" ? "scheduled" : "manual",
          status: how === "completed" || how === "scheduled" ? "completed" : "failed",
        },
      },
    );
  }

  /** An organization with the vendors of a register that is partly researched. */
  async function seedRegister() {
    const seed = await seedVendor(); // the vendor that was never researched
    const orgId = seed.orgId;
    const named = (vendor_name: string) => createTestVendor(orgId, { vendor_name });
    const stale = await named("Researched eight days ago");
    const recent = await named("Researched two days ago");
    const oldest = await named("Researched ten days ago, and it failed");
    const neverStarted = await named("Failed before it started");
    const scanned = await named("Scanned nine days ago");
    const demo = await named("Demo vendor");
    await sequelize.query(`UPDATE vendors SET is_demo = true WHERE id = :demo`, {
      replacements: { demo },
    });
    await seedRunAt(seed, stale, 8, "completed");
    await seedRunAt(seed, recent, 2, "completed");
    await seedRunAt(seed, oldest, 10, "failed");
    await seedRunAt(seed, neverStarted, 30, "failed before it started");
    await seedRunAt(seed, scanned, 9, "scheduled");
    return {
      orgId,
      never: seed.vendorId,
      stale,
      recent,
      oldest,
      neverStarted,
      scanned,
      demo,
    };
  }

  it("lists the vendors that were never researched first, then the one researched longest ago", async () => {
    const register = await seedRegister();

    const due = await listDueVendorsQuery({
      organizationId: register.orgId,
      intervalDays: 7,
      limit: 50,
    });

    expect(due).toEqual([
      register.never,
      register.neverStarted,
      register.oldest,
      register.scanned,
      register.stale,
    ]);
  });

  it("leaves out a vendor that was researched within the interval, and a demo vendor", async () => {
    const register = await seedRegister();

    const due = await listDueVendorsQuery({
      organizationId: register.orgId,
      intervalDays: 7,
      limit: 50,
    });

    expect(due).not.toContain(register.recent);
    expect(due).not.toContain(register.demo);
  });

  it("counts a run of any trigger, so that a scan is not repeated for a vendor a person just researched", async () => {
    const register = await seedRegister();

    const due = await listDueVendorsQuery({
      organizationId: register.orgId,
      intervalDays: 14,
      limit: 50,
    });

    // Eight, nine and ten days are inside a fortnight; the vendors with no run that counts are not.
    expect(due).toEqual([register.never, register.neverStarted]);
  });

  it("counts a run that is queued now, whatever the interval", async () => {
    const register = await seedRegister();
    await createRunQuery({
      organizationId: register.orgId,
      vendorId: register.never,
      triggerType: "scheduled",
      requestedBy: null,
    });

    const due = await listDueVendorsQuery({
      organizationId: register.orgId,
      intervalDays: 7,
      limit: 50,
    });

    expect(due).not.toContain(register.never);
  });

  it("stops at the limit, keeping the order", async () => {
    const register = await seedRegister();

    expect(
      await listDueVendorsQuery({ organizationId: register.orgId, intervalDays: 7, limit: 2 }),
    ).toEqual([register.never, register.neverStarted]);
    expect(
      await listDueVendorsQuery({ organizationId: register.orgId, intervalDays: 7, limit: 0 }),
    ).toEqual([]);
  });

  it("lists the vendors of the organization it is asked about only", async () => {
    const register = await seedRegister();
    const other = await seedVendor();

    const due = await listDueVendorsQuery({
      organizationId: other.orgId,
      intervalDays: 7,
      limit: 50,
    });

    expect(due).toEqual([other.vendorId]);
    expect(
      await listDueVendorsQuery({ organizationId: register.orgId, intervalDays: 7, limit: 50 }),
    ).not.toContain(other.vendorId);
  });
});
