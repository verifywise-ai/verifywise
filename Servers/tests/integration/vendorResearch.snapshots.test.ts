jest.setTimeout(60000);

/**
 * The snapshots of the pages where a vendor states its terms, against the real tables of the test
 * database.
 *
 * The unit tests of the pipeline mock these queries. What they cannot show is what the database
 * does with them: the upsert that keeps the first sight of a page and moves the last, the time the
 * text last changed, the guard that stops a vendor of another organization, the pruning of pages
 * that are gone, and the cascades.
 */

// First, and not to be reordered: ./setup registers the mocks of BullMQ and Redis.
import "./setup";
import { QueryTypes } from "sequelize";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { sequelize } from "../../database/db";
import { createTestVendor } from "../factories";
import type { SnapshotWrite } from "../../domain.layer/interfaces/i.vendorResearch";
import {
  createRunQuery,
  getSnapshotsQuery,
  saveSnapshotsQuery,
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
  const orgId = await createTestOrganization("Snapshots org");
  const userId = await createTestUser(orgId, 1, `snapshots-${Date.now()}@test.com`, "Password123!");
  const vendorId = await createTestVendor(orgId, { vendor_name: "Acme" });
  return { orgId, userId, vendorId };
}

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

const page = (
  key: string,
  body: string,
  overrides: Partial<SnapshotWrite> = {},
): SnapshotWrite => ({
  pageKey: key,
  url: `https://${key}`,
  kind: "terms",
  title: `Title of ${key}`,
  hash: `hash-of-${body}`.slice(0, 64),
  body,
  ...overrides,
});

const save = (seed: Seed, runId: number, writes: SnapshotWrite[]) =>
  saveSnapshotsQuery({ organizationId: seed.orgId, vendorId: seed.vendorId, runId, writes });

interface SnapshotRow {
  page_key: string;
  url: string;
  kind: string;
  title: string;
  text_hash: string;
  body: string;
  captured_run_id: number | null;
  first_seen_at: Date;
  captured_at: Date;
  last_seen_at: Date;
}

const rowsOf = (seed: Pick<Seed, "orgId" | "vendorId">) =>
  sequelize.query(
    `SELECT page_key, url, kind, title, text_hash, body, captured_run_id,
            first_seen_at, captured_at, last_seen_at
     FROM vendor_research_snapshots
     WHERE organization_id = :orgId AND vendor_id = :vendorId
     ORDER BY page_key`,
    { replacements: seed, type: QueryTypes.SELECT },
  ) as Promise<SnapshotRow[]>;

const countAll = async (): Promise<number> =>
  (
    (await sequelize.query(`SELECT COUNT(*)::int AS count FROM vendor_research_snapshots`, {
      type: QueryTypes.SELECT,
    })) as Array<{ count: number }>
  )[0].count;

/** Puts the times of a page into the past, by `days`. */
const age = (seed: Seed, key: string, days: number) =>
  sequelize.query(
    `UPDATE vendor_research_snapshots
     SET first_seen_at = first_seen_at - (:days * INTERVAL '1 day'),
         captured_at = captured_at - (:days * INTERVAL '1 day'),
         last_seen_at = last_seen_at - (:days * INTERVAL '1 day')
     WHERE organization_id = :orgId AND vendor_id = :vendorId AND page_key = :key`,
    { replacements: { orgId: seed.orgId, vendorId: seed.vendorId, key, days } },
  );

describe("saveSnapshotsQuery", () => {
  it("keeps a page, with the run that captured it", async () => {
    const seed = await seedVendor();
    const runId = await seedRun(seed);

    await save(seed, runId, [page("acme.com/terms", "line one\nline two")]);

    const [row] = await rowsOf(seed);
    expect(row).toMatchObject({
      page_key: "acme.com/terms",
      url: "https://acme.com/terms",
      kind: "terms",
      title: "Title of acme.com/terms",
      body: "line one\nline two",
      captured_run_id: runId,
    });
    expect(row.first_seen_at).toBeInstanceOf(Date);
  });

  it("moves the last sight and keeps the rest when the text is the same", async () => {
    const seed = await seedVendor();
    const first = await seedRun(seed);
    const second = await seedRun(seed);
    const write = page("acme.com/terms", "same text");
    await save(seed, first, [write]);
    await age(seed, "acme.com/terms", 10);
    const [before] = await rowsOf(seed);

    await save(seed, second, [write]);

    const [after] = await rowsOf(seed);
    expect(after.captured_run_id).toBe(first);
    expect(after.captured_at.getTime()).toBe(before.captured_at.getTime());
    expect(after.first_seen_at.getTime()).toBe(before.first_seen_at.getTime());
    expect(after.last_seen_at.getTime()).toBeGreaterThan(before.last_seen_at.getTime());
  });

  it("replaces the text and the run that captured it when the text changed, and moves the time of the change", async () => {
    const seed = await seedVendor();
    const first = await seedRun(seed);
    const second = await seedRun(seed);
    await save(seed, first, [page("acme.com/terms", "old text")]);
    await age(seed, "acme.com/terms", 10);
    const [before] = await rowsOf(seed);

    await save(seed, second, [
      page("acme.com/terms", "new text", { title: "A new title", url: "https://acme.com/terms/" }),
    ]);

    const [after] = await rowsOf(seed);
    expect(after).toMatchObject({
      body: "new text",
      text_hash: "hash-of-new text",
      title: "A new title",
      url: "https://acme.com/terms/",
      captured_run_id: second,
    });
    expect(after.captured_at.getTime()).toBeGreaterThan(before.captured_at.getTime());
    expect(after.first_seen_at.getTime()).toBe(before.first_seen_at.getTime());
  });

  it("keeps several pages of a vendor, one row for each key, and a key twice is one row", async () => {
    const seed = await seedVendor();
    const runId = await seedRun(seed);

    await save(seed, runId, [
      page("acme.com/terms", "terms"),
      page("acme.com/privacy", "privacy", { kind: "privacy" }),
      page("acme.com/terms", "terms again"),
    ]);

    expect((await rowsOf(seed)).map((row) => [row.page_key, row.body])).toEqual([
      ["acme.com/privacy", "privacy"],
      ["acme.com/terms", "terms again"],
    ]);
  });

  it("writes nothing for no page", async () => {
    const seed = await seedVendor();
    await save(seed, await seedRun(seed), []);
    expect(await countAll()).toBe(0);
  });

  it("writes nothing for a vendor of another organization, and does not point at a run of another organization", async () => {
    const owner = await seedVendor();
    const attacker = await seedVendor();
    const ownerRun = await seedRun(owner);

    await saveSnapshotsQuery({
      organizationId: attacker.orgId,
      vendorId: owner.vendorId,
      runId: ownerRun,
      writes: [page("acme.com/terms", "planted")],
    });
    expect(await countAll()).toBe(0);

    // The vendor is the attacker's own, the run is not: the page is kept, the run is not pointed at.
    await saveSnapshotsQuery({
      organizationId: attacker.orgId,
      vendorId: attacker.vendorId,
      runId: ownerRun,
      writes: [page("acme.com/terms", "own page")],
    });
    const [row] = await rowsOf(attacker);
    expect(row.body).toBe("own page");
    expect(row.captured_run_id).toBeNull();
  });

  it("refuses a kind that is not one of the five", async () => {
    const seed = await seedVendor();
    await expect(
      save(seed, await seedRun(seed), [
        page("acme.com/blog", "x", { kind: "blog" as unknown as SnapshotWrite["kind"] }),
      ]),
    ).rejects.toThrow();
    expect(await countAll()).toBe(0);
  });

  it("keeps all the pages or none: a page that fails takes the others of the write with it", async () => {
    const seed = await seedVendor();
    await expect(
      save(seed, await seedRun(seed), [
        page("acme.com/terms", "fine"),
        page("acme.com/blog", "bad", { kind: "blog" as unknown as SnapshotWrite["kind"] }),
      ]),
    ).rejects.toThrow();
    expect(await countAll()).toBe(0);
  });

  it("forgets the pages of this vendor that no run has seen for a year, and no other", async () => {
    const seed = await seedVendor();
    const other = await seedVendor();
    const runId = await seedRun(seed);
    await save(seed, runId, [page("acme.com/old", "old"), page("acme.com/recent", "recent")]);
    await save(other, await seedRun(other), [page("acme.com/old", "other vendor")]);
    await age(seed, "acme.com/old", 400);
    await age(other, "acme.com/old", 400);
    await age(seed, "acme.com/recent", 300);

    await save(seed, runId, [page("acme.com/new", "new")]);

    expect((await rowsOf(seed)).map((row) => row.page_key)).toEqual([
      "acme.com/new",
      "acme.com/recent",
    ]);
    expect((await rowsOf(other)).map((row) => row.page_key)).toEqual(["acme.com/old"]);
  });
});

describe("getSnapshotsQuery", () => {
  it("gives the hash, the lines and the last sight of the pages asked for, by key", async () => {
    const seed = await seedVendor();
    await save(seed, await seedRun(seed), [
      page("acme.com/terms", "terms text"),
      page("acme.com/privacy", "privacy text", { kind: "privacy" }),
      page("acme.com/dpa", "dpa text", { kind: "dpa" }),
    ]);

    const found = await getSnapshotsQuery(seed.orgId, seed.vendorId, [
      "acme.com/terms",
      "acme.com/privacy",
      "acme.com/missing",
    ]);

    expect([...found.keys()].sort()).toEqual(["acme.com/privacy", "acme.com/terms"]);
    expect(found.get("acme.com/terms")).toEqual({
      hash: "hash-of-terms text",
      body: "terms text",
      lastSeenAt: expect.any(Date),
    });
  });

  it("asks for nothing and gets nothing when it is given no key", async () => {
    const seed = await seedVendor();
    await save(seed, await seedRun(seed), [page("acme.com/terms", "terms text")]);

    expect((await getSnapshotsQuery(seed.orgId, seed.vendorId, [])).size).toBe(0);
  });

  it("does not give a page of another vendor, or of another organization", async () => {
    const owner = await seedVendor();
    const attacker = await seedVendor();
    const sibling = await createTestVendor(owner.orgId, { vendor_name: "Sibling" });
    await save(owner, await seedRun(owner), [page("acme.com/terms", "owner text")]);

    // Positive control first, so a broken query cannot pass as "isolated".
    expect((await getSnapshotsQuery(owner.orgId, owner.vendorId, ["acme.com/terms"])).size).toBe(1);
    expect((await getSnapshotsQuery(attacker.orgId, owner.vendorId, ["acme.com/terms"])).size).toBe(
      0,
    );
    expect(
      (await getSnapshotsQuery(attacker.orgId, attacker.vendorId, ["acme.com/terms"])).size,
    ).toBe(0);
    expect((await getSnapshotsQuery(owner.orgId, sibling, ["acme.com/terms"])).size).toBe(0);
  });
});

describe("the cascades", () => {
  it("forgets the pages of a vendor that is deleted, and of an organization that is deleted", async () => {
    const seed = await seedVendor();
    const other = await seedVendor();
    await save(seed, await seedRun(seed), [page("acme.com/terms", "x")]);
    await save(other, await seedRun(other), [page("acme.com/terms", "y")]);

    await sequelize.query(`DELETE FROM vendors WHERE id = :id`, {
      replacements: { id: seed.vendorId },
    });
    expect(await countAll()).toBe(1);

    await sequelize.query(`DELETE FROM organizations WHERE id = :id`, {
      replacements: { id: other.orgId },
    });
    expect(await countAll()).toBe(0);
  });

  it("only forgets which run captured a page when that run is deleted", async () => {
    const seed = await seedVendor();
    const runId = await seedRun(seed);
    await save(seed, runId, [page("acme.com/terms", "x")]);

    await sequelize.query(`DELETE FROM vendor_research_runs WHERE id = :id`, {
      replacements: { id: runId },
    });

    const [row] = await rowsOf(seed);
    expect(row).toMatchObject({ body: "x", captured_run_id: null });
  });
});
