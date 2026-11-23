jest.setTimeout(60000);

/**
 * The load of the bundled lists of the vendor risk database against the real tables of the test
 * database, from small bundles written in a temporary VRDB_BUNDLE_DIR (nothing is downloaded).
 *
 * The unit tests of vrdb/loadBundled.ts use a store in memory. What they cannot show is what the
 * database does: records and the list's last success dated by the day the bundle was built, a
 * second load of the same bundle that writes no run, a record a new bundle lacks delisted or
 * withdrawn as its list says, and for the CVE records the cursor and the keys of a retired id.
 */

// First, and not to be reordered: ./setup registers the mocks of BullMQ and Redis.
import "./setup";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import type { VrdbSourceId } from "../../domain.layer/interfaces/i.vendorResearch";
import * as vrdbStore from "../../utils/vrdb.utils";
import { BUNDLE_FORMAT, writeBundle } from "../../services/vendorResearch/vrdb/bundle";
import { loadBundledSource } from "../../services/vendorResearch/vrdb/loadBundled";
import { type MirrorSource, vrdbSourceOf } from "../../services/vendorResearch/vrdb/sources";
import type { ParsedRecord } from "../../services/vendorResearch/vrdb/types";

const bundleDirBefore = process.env.VRDB_BUNDLE_DIR;
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "vrdb-load-it-"));
  process.env.VRDB_BUNDLE_DIR = dir;
});

afterEach(async () => {
  fs.rmSync(dir, { recursive: true, force: true });
  await cleanupDatabase();
});

afterAll(async () => {
  if (bundleDirBefore === undefined) delete process.env.VRDB_BUNDLE_DIR;
  else process.env.VRDB_BUNDLE_DIR = bundleDirBefore;
  await sequelize.close();
});

const BUILT_1 = "2026-11-01T06:00:00.000Z";
const BUILT_2 = "2026-11-15T06:00:00.000Z";
const NOW = new Date("2026-11-23T09:00:00.000Z");

const entity = (id: string): ParsedRecord => ({
  sourceRecordId: id,
  recordType: "sanctions_entity",
  title: `Entity ${id}`,
  summary: `Entry ${id}.`,
  url: `https://list.example/?uid=${id}`,
  identifiers: { names: [`Entity ${id}`] },
  matchKeys: [`name:entity${id.toLowerCase()}`],
  publishedAt: null,
  sourceUpdatedAt: null,
});

const vulnerability = (id: string, vendor: string): ParsedRecord => ({
  sourceRecordId: id,
  recordType: "vulnerability",
  title: `${id}: a flaw in ${vendor}`,
  summary: `A flaw in ${vendor}.`,
  url: `https://www.cve.org/CVERecord?id=${id}`,
  identifiers: { cve: id },
  matchKeys: [`cve:${vendor}`],
  publishedAt: "2026-10-20",
  sourceUpdatedAt: null,
});

const bundle = (
  sourceId: VrdbSourceId,
  records: ParsedRecord[],
  builtAt: string,
  cursor: { day: string } | null = null,
) =>
  writeBundle({
    format: BUNDLE_FORMAT,
    sourceId,
    connectorVersion: 1,
    builtAt,
    sourceVersion: sourceId === "cve" ? null : builtAt.slice(0, 10),
    cursor,
    records,
  });

const load = (id: VrdbSourceId) =>
  loadBundledSource(vrdbSourceOf(id) as MirrorSource, { store: vrdbStore, now: () => NOW });

const recordRows = async (id: VrdbSourceId) =>
  (await sequelize.query(
    `SELECT source_record_id, status, status_changed_at, match_keys, retrieved_at
     FROM vrdb_records WHERE source_id = :id ORDER BY source_record_id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  )) as Array<{
    source_record_id: string;
    status: string;
    status_changed_at: Date | null;
    match_keys: string[];
    retrieved_at: Date;
  }>;

const sourceRow = async (id: VrdbSourceId) =>
  (
    (await sequelize.query(
      `SELECT last_outcome, last_error, last_success_at, cursor, source_version, active_records,
              stale_after_hours
       FROM vrdb_sources WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    )) as Array<Record<string, unknown>>
  )[0];

const runRows = async (id: VrdbSourceId) =>
  (await sequelize.query(
    `SELECT outcome, error_code, records_seen, inserted, raw_snapshot_hash
     FROM vrdb_sync_runs WHERE source_id = :id ORDER BY id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  )) as Array<Record<string, unknown>>;

describe("the load of a list taken whole, in the database", () => {
  it("inserts the records dated by the day the bundle was built, and notes that day as the list's last success", async () => {
    const entry = bundle("ofac", [entity("E1"), entity("E2"), entity("E3")], BUILT_1);

    await expect(load("ofac")).resolves.toEqual({
      sourceId: "ofac",
      outcome: "ok",
      counts: { seen: 3, inserted: 3, updated: 0, statusChanged: 0 },
    });

    const rows = await recordRows("ofac");
    expect(rows.map((row) => [row.source_record_id, row.status])).toEqual([
      ["E1", "active"],
      ["E2", "active"],
      ["E3", "active"],
    ]);
    for (const row of rows) expect(row.retrieved_at.toISOString()).toBe(BUILT_1);
    const source = await sourceRow("ofac");
    expect(source).toMatchObject({
      last_outcome: "ok",
      last_error: null,
      source_version: "2026-11-01",
      active_records: 3,
      // A bundled list is out of date 60 days after its bundle was built.
      stale_after_hours: 1440,
    });
    expect((source.last_success_at as Date).toISOString()).toBe(BUILT_1);
    expect(await runRows("ofac")).toEqual([
      {
        outcome: "ok",
        error_code: null,
        records_seen: 3,
        inserted: 3,
        raw_snapshot_hash: entry.sha256,
      },
    ]);
  });

  it("writes nothing new when the same bundle is loaded again: no run, the records as they were", async () => {
    bundle("ofac", [entity("E1"), entity("E2")], BUILT_1);
    await load("ofac");
    const before = await recordRows("ofac");

    await expect(load("ofac")).resolves.toEqual({ sourceId: "ofac", outcome: "unchanged" });

    expect(await runRows("ofac")).toHaveLength(1);
    expect(await recordRows("ofac")).toEqual(before);
    expect(((await sourceRow("ofac")).last_success_at as Date).toISOString()).toBe(BUILT_1);
  });

  it.each([
    ["ofac", "delisted"],
    ["kev", "withdrawn"],
  ] as const)(
    "takes a record a new bundle of %s lacks off the list as %s, dated by the new bundle",
    async (id, missing) => {
      bundle(id, [entity("E1"), entity("E2"), entity("E3")], BUILT_1);
      await load(id);
      bundle(id, [entity("E1"), entity("E2")], BUILT_2);

      await expect(load(id)).resolves.toMatchObject({
        outcome: "ok",
        counts: { seen: 2, statusChanged: 1 },
      });

      const rows = await recordRows(id);
      expect(rows.map((row) => [row.source_record_id, row.status])).toEqual([
        ["E1", "active"],
        ["E2", "active"],
        ["E3", missing],
      ]);
      expect(rows[2].status_changed_at?.toISOString()).toBe(BUILT_2);
      expect(await sourceRow(id)).toMatchObject({ active_records: 2 });
      expect(((await sourceRow(id)).last_success_at as Date).toISOString()).toBe(BUILT_2);
      expect(await runRows(id)).toHaveLength(2);
    },
  );

  it("keeps each list's newest success through the prune, so an old bundle is still known as loaded", async () => {
    bundle("ofac", [entity("E1")], BUILT_1);
    await load("ofac");
    // A failed attempt after it, also older than the cutoff, is forgotten.
    const failedRun = await vrdbStore.startVrdbSyncRunQuery("ofac", NOW);
    await vrdbStore.finishVrdbSyncRunQuery(failedRun, { outcome: "failed", errorCode: "x" }, NOW);

    await vrdbStore.pruneVrdbSyncRunsQuery(new Date(NOW.getTime() + 365 * 24 * 3_600_000));

    expect((await runRows("ofac")).map((row) => row.outcome)).toEqual(["ok"]);
    await expect(load("ofac")).resolves.toEqual({ sourceId: "ofac", outcome: "unchanged" });
  });

  it("notes a list current again when its loaded bundle comes back after a failure", async () => {
    bundle("ofac", [entity("E1")], BUILT_1);
    await load("ofac");
    await vrdbStore.markVrdbSourceQuery("ofac", {
      outcome: "failed",
      at: NOW,
      errorCode: "bundle_missing",
    });

    await expect(load("ofac")).resolves.toEqual({ sourceId: "ofac", outcome: "unchanged" });

    expect(await sourceRow("ofac")).toMatchObject({ last_outcome: "unchanged", last_error: null });
    expect(((await sourceRow("ofac")).last_success_at as Date).toISOString()).toBe(BUILT_1);
  });

  it("marks a list with no bundle as failed and writes no run", async () => {
    await expect(load("ofac")).resolves.toEqual({
      sourceId: "ofac",
      outcome: "failed",
      errorCode: "bundle_missing",
    });

    expect(await sourceRow("ofac")).toMatchObject({
      last_outcome: "failed",
      last_error: "bundle_missing",
      last_success_at: null,
    });
    expect(await runRows("ofac")).toEqual([]);
  });
});

describe("the load of the CVE records, in the database", () => {
  it("sets the cursor of the bundle, and retires an id a later bundle drops: it loses its keys", async () => {
    bundle(
      "cve",
      [vulnerability("CVE-2026-0001", "examplecorp"), vulnerability("CVE-2026-0002", "othercorp")],
      BUILT_1,
      { day: "2026-10-31" },
    );

    await expect(load("cve")).resolves.toMatchObject({ outcome: "ok", counts: { seen: 2 } });

    expect(await sourceRow("cve")).toMatchObject({
      last_outcome: "ok",
      cursor: { day: "2026-10-31" },
      active_records: 2,
    });
    expect(((await sourceRow("cve")).last_success_at as Date).toISOString()).toBe(BUILT_1);
    expect((await recordRows("cve")).map((row) => [row.source_record_id, row.match_keys])).toEqual([
      ["CVE-2026-0001", ["cve:examplecorp"]],
      ["CVE-2026-0002", ["cve:othercorp"]],
    ]);

    bundle("cve", [vulnerability("CVE-2026-0001", "examplecorp")], BUILT_2, { day: "2026-11-14" });

    await expect(load("cve")).resolves.toMatchObject({ outcome: "ok" });

    expect(await sourceRow("cve")).toMatchObject({ cursor: { day: "2026-11-14" } });
    expect(((await sourceRow("cve")).last_success_at as Date).toISOString()).toBe(BUILT_2);
    const rows = await recordRows("cve");
    expect(rows.map((row) => [row.source_record_id, row.match_keys])).toEqual([
      ["CVE-2026-0001", ["cve:examplecorp"]],
      ["CVE-2026-0002", []],
    ]);
    // A retired record is kept, with its content: only its keys go, so no run is offered it.
    expect(rows).toHaveLength(2);
    expect(await runRows("cve")).toHaveLength(2);

    // A third load of the same bundle writes nothing: the retired id has no keys left to take.
    await expect(load("cve")).resolves.toEqual({ sourceId: "cve", outcome: "unchanged" });
    expect(await runRows("cve")).toHaveLength(2);
  });
});
