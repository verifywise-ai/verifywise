/**
 * The load of the bundled lists (loadBundled.ts), against a store in memory and bundles written in
 * a temporary directory. A bundle already loaded writes nothing; a new one is applied as a download
 * was, dated by the day it was built: a list taken whole replaces its copy, and the CVE records are
 * applied as changes in batches, retiring the ids the copy holds that the bundle no longer does.
 */
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { VrdbSourceId } from "../../../../domain.layer/interfaces/i.vendorResearch";
import logger from "../../../../utils/logger/fileLogger";
import { BUNDLE_FORMAT, type VrdbBundle, writeBundle } from "../bundle";
import {
  DELTA_BATCH,
  LOAD_RUNS_KEPT_DAYS,
  type LoadStore,
  loadBundledSource,
  loadBundledSources,
} from "../loadBundled";
import { type MirrorSource, activeMirrors, vrdbSourceOf } from "../sources";
import type {
  ApplyCounts,
  ParsedRecord,
  VrdbDeltaWrite,
  VrdbSnapshotWrite,
  VrdbSourceMark,
  VrdbSyncRunResult,
} from "../types";

const NOW = new Date("2026-11-23T09:00:00.000Z");
const BUILT_AT = "2026-11-20T08:00:00.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;

const record = (id: string, over: Partial<ParsedRecord> = {}): ParsedRecord => ({
  sourceRecordId: id,
  recordType: "vulnerability",
  title: `Record ${id}`,
  summary: `The summary of ${id}.`,
  url: `https://example.com/${id}`,
  identifiers: {},
  matchKeys: [`name:vendor${id}`],
  publishedAt: "2026-10-01",
  sourceUpdatedAt: null,
  ...over,
});

const bundleOf = (
  sourceId: VrdbSourceId,
  records: ParsedRecord[],
  over: Partial<VrdbBundle> = {},
): VrdbBundle => ({
  format: BUNDLE_FORMAT,
  sourceId,
  connectorVersion: 1,
  builtAt: BUILT_AT,
  sourceVersion: "v1",
  cursor: null,
  records,
  ...over,
});

const mirror = (id: VrdbSourceId): MirrorSource => vrdbSourceOf(id) as MirrorSource;

/** The ids `n` records of the CVE list are given, sorted as a bundle stores them. */
const cveIds = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => `CVE-2026-${String(from + i).padStart(5, "0")}`);

/**
 * The queries of the load in memory: the hash of each list's last success, the run rows, the
 * marks, and every apply. A run that ends ok records its hash as the list's last success.
 */
function memoryStore(options: { keyed?: string[]; hashes?: Record<string, string> } = {}) {
  const hashes = new Map<string, string>(Object.entries(options.hashes ?? {}));
  const runs: Array<{
    id: number;
    sourceId: VrdbSourceId;
    startedAt: Date;
    result?: VrdbSyncRunResult;
  }> = [];
  const marks: Array<{ id: VrdbSourceId; mark: VrdbSourceMark }> = [];
  const snapshots: VrdbSnapshotWrite[] = [];
  const deltas: VrdbDeltaWrite[] = [];
  const upserts: Array<{ id: VrdbSourceId; at: Date }> = [];
  const prunes: Date[] = [];
  const countsOf = (records: number, statusChanged = 0): ApplyCounts => ({
    seen: records,
    inserted: records,
    updated: 0,
    statusChanged,
  });

  const store = {
    upsertVrdbSourceQuery: jest.fn(async (definition: MirrorSource, at: Date) => {
      upserts.push({ id: definition.id, at });
    }),
    lastSuccessfulHashQuery: jest.fn(async (id: VrdbSourceId) => hashes.get(id) ?? null),
    startVrdbSyncRunQuery: jest.fn(async (sourceId: VrdbSourceId, startedAt: Date) => {
      runs.push({ id: runs.length + 1, sourceId, startedAt });
      return runs.length;
    }),
    finishVrdbSyncRunQuery: jest.fn(async (runId: number, result: VrdbSyncRunResult) => {
      const run = runs[runId - 1];
      run.result = result;
      if (result.outcome === "ok" && result.rawSnapshotHash) {
        hashes.set(run.sourceId, result.rawSnapshotHash);
      }
    }),
    markVrdbSourceQuery: jest.fn(async (id: VrdbSourceId, mark: VrdbSourceMark) => {
      marks.push({ id, mark });
    }),
    pruneVrdbSyncRunsQuery: jest.fn(async (before: Date) => {
      prunes.push(before);
    }),
    applyVrdbSnapshotQuery: jest.fn(async (input: VrdbSnapshotWrite) => {
      snapshots.push(input);
      return countsOf(input.records.length, 1);
    }),
    applyVrdbDeltaQuery: jest.fn(async (input: VrdbDeltaWrite) => {
      deltas.push(input);
      return countsOf(input.records.length, input.retire?.length ?? 0);
    }),
    listVrdbKeyedRecordIdsQuery: jest.fn(async () => options.keyed ?? []),
  };
  return {
    store: store as unknown as LoadStore & typeof store,
    hashes,
    runs,
    marks,
    snapshots,
    deltas,
    upserts,
    prunes,
  };
}

let dir: string;

beforeEach(() => {
  jest.clearAllMocks();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "vrdb-load-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const load = (id: VrdbSourceId, memory: ReturnType<typeof memoryStore>) =>
  loadBundledSource(mirror(id), { store: memory.store, dir, now: () => NOW });

describe("loadBundledSource, a list taken whole", () => {
  it("applies a new bundle whole, dated by the day it was built, with the missing status of its list", async () => {
    const entry = writeBundle(bundleOf("kev", [record("b"), record("a")]), dir);
    const memory = memoryStore();

    const result = await load("kev", memory);

    expect(result).toEqual({
      sourceId: "kev",
      outcome: "ok",
      counts: { seen: 2, inserted: 2, updated: 0, statusChanged: 1 },
    });
    expect(memory.snapshots).toEqual([
      {
        sourceId: "kev",
        records: [record("a"), record("b")],
        missingStatus: "withdrawn",
        rawSnapshotHash: entry.sha256,
        sourceVersion: "v1",
        etag: null,
        lastModified: null,
        at: new Date(BUILT_AT),
      },
    ]);
    expect(memory.deltas).toEqual([]);
    expect(memory.store.listVrdbKeyedRecordIdsQuery).not.toHaveBeenCalled();
  });

  it("delists what a sanctions list drops: the missing status is the definition's", async () => {
    writeBundle(bundleOf("ofac", [record("1")]), dir);
    const memory = memoryStore();

    await load("ofac", memory);

    expect(mirror("ofac").missingStatus).toBe("delisted");
    expect(memory.snapshots[0].missingStatus).toBe("delisted");
  });

  it("upserts the list's row, then writes one run that ends ok with the counts and the bundle's hash", async () => {
    const entry = writeBundle(bundleOf("kev", [record("a")]), dir);
    const memory = memoryStore();

    await load("kev", memory);

    expect(memory.upserts).toEqual([{ id: "kev", at: NOW }]);
    expect(memory.store.upsertVrdbSourceQuery).toHaveBeenCalledWith(mirror("kev"), NOW);
    expect(memory.runs).toEqual([
      {
        id: 1,
        sourceId: "kev",
        startedAt: NOW,
        result: {
          outcome: "ok",
          counts: { seen: 1, inserted: 1, updated: 0, statusChanged: 1 },
          rawSnapshotHash: entry.sha256,
        },
      },
    ]);
    expect(memory.marks).toEqual([]);
    expect(logger.info).toHaveBeenCalledWith(
      "vendor risk database: kev loaded from its bundle of 2026-11-20 (1 records, 1 new, 0 changed, 1 with a new status)",
    );
  });

  it("prunes the run rows older than the days they are kept", async () => {
    writeBundle(bundleOf("kev", [record("a")]), dir);
    const memory = memoryStore();

    await load("kev", memory);

    expect(LOAD_RUNS_KEPT_DAYS).toBe(90);
    expect(memory.prunes).toEqual([new Date(NOW.getTime() - 90 * DAY_MS)]);
  });

  it("applies nothing when the bundle is the one already loaded, notes the list current as of it, and a second load of it is unchanged", async () => {
    const bundle = bundleOf("kev", [record("a")]);
    const entry = writeBundle(bundle, dir);
    const loaded = memoryStore({ hashes: { kev: entry.sha256 } });

    await expect(load("kev", loaded)).resolves.toEqual({ sourceId: "kev", outcome: "unchanged" });
    expect(loaded.runs).toEqual([]);
    expect(loaded.snapshots).toEqual([]);
    expect(loaded.prunes).toEqual([]);
    // A failure noted since the last load (a release without the bundle) is cleared.
    expect(loaded.marks).toEqual([
      { id: "kev", mark: { outcome: "unchanged", at: new Date(bundle.builtAt) } },
    ]);

    // A restart after a first load: the hash of its run is the list's last success.
    const fresh = memoryStore();
    await expect(load("kev", fresh)).resolves.toMatchObject({ outcome: "ok" });
    await expect(load("kev", fresh)).resolves.toEqual({ sourceId: "kev", outcome: "unchanged" });
    expect(fresh.runs).toHaveLength(1);
    expect(fresh.snapshots).toHaveLength(1);
  });

  it("applies a bundle whose hash differs from the last success", async () => {
    writeBundle(bundleOf("kev", [record("a")]), dir);
    const memory = memoryStore({ hashes: { kev: "f".repeat(64) } });

    await expect(load("kev", memory)).resolves.toMatchObject({ outcome: "ok" });
    expect(memory.snapshots).toHaveLength(1);
  });

  it("marks a list with no bundle as failed (bundle_missing) and keeps its copy: no run, no apply", async () => {
    const memory = memoryStore();

    await expect(load("kev", memory)).resolves.toEqual({
      sourceId: "kev",
      outcome: "failed",
      errorCode: "bundle_missing",
    });
    expect(memory.marks).toEqual([
      { id: "kev", mark: { outcome: "failed", at: NOW, errorCode: "bundle_missing" } },
    ]);
    expect(memory.runs).toEqual([]);
    expect(memory.snapshots).toEqual([]);
    expect(memory.store.lastSuccessfulHashQuery).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "vendor risk database: kev was not loaded (bundle_missing); its copy stays as it was",
    );
  });

  it.each([
    ["not gzip", "bundle_unreadable", () => "not gzip"],
    ["of another list", "bundle_wrong_list", () => null],
  ])("marks a bundle that is %s as failed (%s)", async (_label, code, bytesOf) => {
    const bytes = bytesOf();
    if (bytes === null) {
      writeBundle(bundleOf("ofac", [record("a")]), dir);
      fs.renameSync(path.join(dir, "ofac.json.gz"), path.join(dir, "kev.json.gz"));
    } else {
      fs.writeFileSync(path.join(dir, "kev.json.gz"), bytes);
    }
    const memory = memoryStore();

    await expect(load("kev", memory)).resolves.toEqual({
      sourceId: "kev",
      outcome: "failed",
      errorCode: code,
    });
    expect(memory.marks.map(({ mark }) => mark)).toEqual([
      { outcome: "failed", at: NOW, errorCode: code },
    ]);
    expect(memory.runs).toEqual([]);
  });

  it("finishes the run as failed and marks the list when the apply throws, and logs no message of the error", async () => {
    writeBundle(bundleOf("kev", [record("a")]), dir);
    const memory = memoryStore();
    memory.store.applyVrdbSnapshotQuery.mockRejectedValueOnce(
      new Error("duplicate key value violates unique constraint 10.0.0.5"),
    );

    await expect(load("kev", memory)).resolves.toEqual({
      sourceId: "kev",
      outcome: "failed",
      errorCode: "load_failed",
    });
    expect(memory.runs).toEqual([
      {
        id: 1,
        sourceId: "kev",
        startedAt: NOW,
        result: { outcome: "failed", errorCode: "load_failed" },
      },
    ]);
    expect(memory.marks).toEqual([
      { id: "kev", mark: { outcome: "failed", at: NOW, errorCode: "load_failed" } },
    ]);
    expect(memory.hashes.get("kev")).toBeUndefined();
    expect(memory.prunes).toEqual([]);
    expect(JSON.stringify((logger.warn as jest.Mock).mock.calls)).not.toContain("10.0.0.5");
  });

  it("throws what the store throws before the run starts, for the caller to note", async () => {
    writeBundle(bundleOf("kev", [record("a")]), dir);
    const memory = memoryStore();
    memory.store.lastSuccessfulHashQuery.mockRejectedValueOnce(new Error("connection refused"));

    await expect(load("kev", memory)).rejects.toThrow("connection refused");
    expect(memory.runs).toEqual([]);
  });
});

describe("loadBundledSource, the CVE records", () => {
  it("applies the records and retires the stored ids the bundle lacks, in batches, the cursor only on the last", async () => {
    // 2,500 records and 1,200 ids to retire: three batches of records, two of retired ids.
    const ids = cveIds(2_500);
    const dropped = cveIds(1_200, 10_000);
    const entry = writeBundle(
      bundleOf(
        "cve",
        ids.map((id) => record(id)),
        { cursor: { day: "2026-11-19" }, sourceVersion: null },
      ),
      dir,
    );
    // The copy holds some ids the bundle keeps (not retired) and the dropped ones.
    const memory = memoryStore({ keyed: [...ids.slice(0, 50), ...dropped] });

    const result = await load("cve", memory);

    expect(DELTA_BATCH).toBe(1_000);
    expect(memory.store.listVrdbKeyedRecordIdsQuery).toHaveBeenCalledWith("cve");
    expect(memory.snapshots).toEqual([]);
    expect(memory.deltas).toHaveLength(3);
    expect(memory.deltas.map((delta) => delta.records.length)).toEqual([1_000, 1_000, 500]);
    expect(memory.deltas.map((delta) => delta.retire?.length)).toEqual([1_000, 200, 0]);
    expect(memory.deltas.flatMap((delta) => delta.records.map((r) => r.sourceRecordId))).toEqual(
      ids,
    );
    expect(memory.deltas.flatMap((delta) => delta.retire ?? [])).toEqual(dropped);
    expect(memory.deltas.map((delta) => delta.cursor)).toEqual([null, null, { day: "2026-11-19" }]);
    for (const delta of memory.deltas) {
      expect(delta).toMatchObject({
        sourceId: "cve",
        rawSnapshotHash: entry.sha256,
        at: new Date(BUILT_AT),
      });
    }
    // The counts of the batches add up.
    expect(result).toEqual({
      sourceId: "cve",
      outcome: "ok",
      counts: { seen: 2_500, inserted: 2_500, updated: 0, statusChanged: 1_200 },
    });
    expect(memory.runs).toHaveLength(1);
    expect(memory.runs[0].result).toMatchObject({ outcome: "ok", rawSnapshotHash: entry.sha256 });
  });

  it("takes as many batches as the larger of the records and the retired ids need", async () => {
    writeBundle(
      bundleOf("cve", [record("CVE-2026-00001")], { cursor: { day: "2026-11-19" } }),
      dir,
    );
    const memory = memoryStore({ keyed: cveIds(2_001, 5_000) });

    await load("cve", memory);

    expect(memory.deltas.map((delta) => [delta.records.length, delta.retire?.length])).toEqual([
      [1, 1_000],
      [0, 1_000],
      [0, 1],
    ]);
    expect(memory.deltas.map((delta) => delta.cursor)).toEqual([null, null, { day: "2026-11-19" }]);
  });

  it("applies one batch, with the cursor, when the copy holds nothing to retire", async () => {
    writeBundle(
      bundleOf("cve", [record("CVE-2026-00001"), record("CVE-2026-00002")], {
        cursor: { day: "2026-11-19" },
      }),
      dir,
    );
    const memory = memoryStore({ keyed: ["CVE-2026-00001"] });

    await load("cve", memory);

    expect(memory.deltas).toHaveLength(1);
    expect(memory.deltas[0]).toMatchObject({
      retire: [],
      cursor: { day: "2026-11-19" },
    });
    expect(memory.deltas[0].records).toHaveLength(2);
  });

  it("refuses a CVE bundle with no cursor: the run fails as bundle_wrong_format and nothing is applied", async () => {
    writeBundle(bundleOf("cve", [record("CVE-2026-00001")], { cursor: null }), dir);
    const memory = memoryStore();

    await expect(load("cve", memory)).resolves.toEqual({
      sourceId: "cve",
      outcome: "failed",
      errorCode: "bundle_wrong_format",
    });
    expect(memory.deltas).toEqual([]);
    expect(memory.runs[0].result).toEqual({ outcome: "failed", errorCode: "bundle_wrong_format" });
    expect(memory.marks.map(({ mark }) => mark.outcome)).toEqual(["failed"]);
  });

  it("leaves the list as it was when a batch fails: the run fails and no hash is noted", async () => {
    writeBundle(
      bundleOf(
        "cve",
        cveIds(1_500).map((id) => record(id)),
        { cursor: { day: "2026-11-19" } },
      ),
      dir,
    );
    const memory = memoryStore();
    memory.store.applyVrdbDeltaQuery
      .mockImplementationOnce(async (input: VrdbDeltaWrite) => {
        memory.deltas.push(input);
        return { seen: 1_000, inserted: 1_000, updated: 0, statusChanged: 0 };
      })
      .mockRejectedValueOnce(new Error("deadlock detected"));

    await expect(load("cve", memory)).resolves.toMatchObject({
      outcome: "failed",
      errorCode: "load_failed",
    });
    // Only the first batch, which moved no cursor, was written.
    expect(memory.deltas.map((delta) => delta.cursor)).toEqual([null]);
    expect(memory.hashes.get("cve")).toBeUndefined();
  });
});

describe("loadBundledSources", () => {
  it("loads every active mirror in order, and goes on after a list that throws", async () => {
    writeBundle(bundleOf("kev", [record("a")]), dir);
    writeBundle(bundleOf("csl", [record("b")]), dir);
    const memory = memoryStore();
    // The store fails on the OFAC list, between the two lists that have bundles.
    memory.store.upsertVrdbSourceQuery.mockImplementation(async (definition: MirrorSource) => {
      if (definition.id === "ofac") {
        const error = new Error("connection reset 10.0.0.5");
        error.name = "SequelizeConnectionError";
        throw error;
      }
    });

    const results = await loadBundledSources({ store: memory.store, dir, now: () => NOW });

    expect(results.map((result) => result.sourceId)).toEqual(activeMirrors().map(({ id }) => id));
    const byId = new Map(results.map((result) => [result.sourceId, result]));
    expect(byId.get("kev")).toMatchObject({ outcome: "ok" });
    expect(byId.get("ofac")).toEqual({
      sourceId: "ofac",
      outcome: "failed",
      errorCode: "load_failed",
    });
    expect(byId.get("csl")).toMatchObject({ outcome: "ok" });
    // Every other list has no bundle in this directory.
    expect(byId.get("uk_sanctions")).toMatchObject({ errorCode: "bundle_missing" });
    expect(logger.warn).toHaveBeenCalledWith(
      "vendor risk database: ofac could not be loaded (SequelizeConnectionError)",
    );
    expect(JSON.stringify((logger.warn as jest.Mock).mock.calls)).not.toContain("10.0.0.5");
  });

  it("loads no list behind a closed gate", async () => {
    writeBundle(bundleOf("aiid", [record("a")]), dir);
    writeBundle(bundleOf("un_sanctions", [record("a")]), dir);
    const memory = memoryStore();

    const results = await loadBundledSources({ store: memory.store, dir, now: () => NOW });

    expect(results.map((result) => result.sourceId)).not.toContain("aiid");
    expect(results.map((result) => result.sourceId)).not.toContain("un_sanctions");
    expect(memory.snapshots).toEqual([]);
  });
});
