/**
 * The mirror job of one list (spec D4.7), with a store in memory and fake connectors: what it
 * writes, when it answers unchanged, and how a cut, wrong or shrunk download fails and leaves the
 * copy as it was.
 */
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { createHash } from "crypto";
import logger from "../../../../utils/logger/fileLogger";
import type {
  RecordStatus,
  VrdbSourceId,
} from "../../../../domain.layer/interfaces/i.vendorResearch";
import { FetchError } from "../../../webResearch/guardedFetch";
import { kevConnector } from "../connectors/kev";
import {
  BodyTooLargeError,
  type Connector,
  type ConnectorFetch,
  FeedWithoutFileError,
  type IncrementalConnector,
  NotTheListError,
  type ParseResult,
  type Snapshot,
} from "../connectors/types";
import { ukConnector } from "../connectors/uk";
import type { VrdbSourceDefinition } from "../sources";
import { SHRINK_LIMIT, SYNC_RUNS_KEPT_DAYS, type SyncStore, syncSource } from "../sync";
import type {
  ApplyCounts,
  ParsedRecord,
  VrdbDeltaWrite,
  VrdbSnapshotWrite,
  VrdbSourceMark,
  VrdbSourceState,
  VrdbSyncRunResult,
} from "../types";
import { ZipError } from "../zip";

const T0 = new Date("2026-10-30T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;

const recordOf = (id: string, summary = `Entry ${id}.`): ParsedRecord => ({
  sourceRecordId: id,
  recordType: "sanctions_entity",
  title: `Entity ${id}`,
  summary,
  url: `https://list.example/?uid=${id}`,
  identifiers: { names: [`Entity ${id}`] },
  matchKeys: [`name:entity${id.toLowerCase()}`],
  publishedAt: "2026-10-01",
  sourceUpdatedAt: null,
});
const idsUpTo = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `E${index + 1}`);

interface StoredRun {
  id: number;
  sourceId: VrdbSourceId;
  startedAt: Date;
  finishedAt?: Date;
  result?: VrdbSyncRunResult;
}

/**
 * The store of vrdb.utils.ts in memory, with the same rules: a changed record takes its new
 * content, one that returns is active again, one the list no longer holds takes the missing
 * status, and a success notes its version, validators and number of active records. The changes
 * of a list read by its changes are upserted with their status, never delisting, a record that
 * comes without keys keeps its own, and the success notes the cursor.
 */
function memoryStore() {
  const sources = new Map<VrdbSourceId, VrdbSourceState & { lastError: string | null }>();
  const records = new Map<string, { record: ParsedRecord; status: RecordStatus }>();
  const runs: StoredRun[] = [];
  const pruned: Date[] = [];
  const snapshots: VrdbSnapshotWrite[] = [];
  const deltas: VrdbDeltaWrite[] = [];
  const keyOf = (sourceId: string, id: string) => `${sourceId}/${id}`;
  const recordsOf = (sourceId: VrdbSourceId) =>
    [...records.entries()]
      .filter(([key]) => key.startsWith(`${sourceId}/`))
      .map(([, value]) => value);

  const store: SyncStore & { failApply?: Error } = {
    async upsertVrdbSourceQuery(definition: VrdbSourceDefinition) {
      if (!sources.has(definition.id)) {
        sources.set(definition.id, {
          id: definition.id,
          lastSuccessAt: null,
          lastOutcome: "never",
          sourceVersion: null,
          etag: null,
          lastModified: null,
          activeRecords: 0,
          cursor: null,
          lastError: null,
        });
      }
    },
    async getVrdbSourceStatesQuery(ids) {
      return ids.flatMap((id) => {
        const state = sources.get(id);
        return state ? [{ ...state }] : [];
      });
    },
    async lastSuccessfulHashQuery(id) {
      const success = [...runs]
        .reverse()
        .find(
          (run) =>
            run.sourceId === id &&
            (run.result?.outcome === "ok" || run.result?.outcome === "unchanged") &&
            run.result.rawSnapshotHash !== undefined,
        );
      return success?.result?.rawSnapshotHash ?? null;
    },
    async startVrdbSyncRunQuery(id, at) {
      runs.push({ id: runs.length + 1, sourceId: id, startedAt: at });
      return runs.length;
    },
    async finishVrdbSyncRunQuery(runId, result, at) {
      const run = runs[runId - 1];
      run.finishedAt = at;
      run.result = result;
    },
    async applyVrdbSnapshotQuery(input: VrdbSnapshotWrite): Promise<ApplyCounts> {
      if (store.failApply) throw store.failApply;
      snapshots.push(input);
      const listed = new Map<string, ParsedRecord>();
      for (const record of input.records) {
        if (!listed.has(record.sourceRecordId)) listed.set(record.sourceRecordId, record);
      }
      const counts = { seen: listed.size, inserted: 0, updated: 0, statusChanged: 0 };
      for (const record of listed.values()) {
        const key = keyOf(input.sourceId, record.sourceRecordId);
        const before = records.get(key);
        if (!before) counts.inserted += 1;
        else {
          if (JSON.stringify(before.record) !== JSON.stringify(record)) counts.updated += 1;
          if (before.status !== "active") counts.statusChanged += 1;
        }
        records.set(key, { record, status: "active" });
      }
      for (const [key, value] of records) {
        if (!key.startsWith(`${input.sourceId}/`) || value.status !== "active") continue;
        if (listed.has(value.record.sourceRecordId)) continue;
        records.set(key, { ...value, status: input.missingStatus });
        counts.statusChanged += 1;
      }
      const state = sources.get(input.sourceId);
      if (!state) throw new Error("no source row");
      Object.assign(state, {
        lastSuccessAt: input.at,
        lastOutcome: "ok",
        lastError: null,
        sourceVersion: input.sourceVersion,
        etag: input.etag,
        lastModified: input.lastModified,
        activeRecords: listed.size,
      });
      return counts;
    },
    async applyVrdbDeltaQuery(input: VrdbDeltaWrite): Promise<ApplyCounts> {
      if (store.failApply) throw store.failApply;
      deltas.push(input);
      const listed = new Map<string, ParsedRecord>();
      for (const record of input.records) {
        if (!listed.has(record.sourceRecordId)) listed.set(record.sourceRecordId, record);
      }
      const counts = { seen: listed.size, inserted: 0, updated: 0, statusChanged: 0 };
      for (const record of listed.values()) {
        const key = keyOf(input.sourceId, record.sourceRecordId);
        const before = records.get(key);
        const status = record.status ?? "active";
        const kept =
          before !== undefined && record.matchKeys.length === 0
            ? { ...record, matchKeys: before.record.matchKeys }
            : record;
        if (!before) {
          counts.inserted += 1;
          if (status !== "active") counts.statusChanged += 1;
        } else {
          if (JSON.stringify(before.record) !== JSON.stringify(kept)) counts.updated += 1;
          if (before.status !== status) counts.statusChanged += 1;
        }
        records.set(key, { record: kept, status });
      }
      const state = sources.get(input.sourceId);
      if (!state) throw new Error("no source row");
      Object.assign(state, {
        lastSuccessAt: input.at,
        lastOutcome: "ok",
        lastError: null,
        ...(input.cursor === null ? {} : { cursor: input.cursor, sourceVersion: input.cursor.day }),
        activeRecords: recordsOf(input.sourceId).filter((value) => value.status === "active")
          .length,
      });
      return counts;
    },
    async markVrdbSourceQuery(id, mark: VrdbSourceMark) {
      const state = sources.get(id);
      if (!state) throw new Error("no source row");
      if (mark.outcome === "failed") {
        Object.assign(state, { lastOutcome: "failed", lastError: mark.errorCode });
        return;
      }
      Object.assign(state, { lastOutcome: "unchanged", lastError: null, lastSuccessAt: mark.at });
      if (mark.validators) Object.assign(state, mark.validators);
    },
    async pruneVrdbSyncRunsQuery(before) {
      pruned.push(before);
    },
  };
  return { store, sources, records, runs, pruned, snapshots, deltas, recordsOf };
}

/** A body the fake connector parses: what its parse gives, as JSON. */
const bodyOf = (result: Partial<ParseResult>): string =>
  JSON.stringify({ records: [], errors: 0, sourceVersion: null, root: "list", ...result });

type Download = Snapshot | "unchanged" | Error;

/**
 * A connector of a version that hands out the downloads it is given, one per sync, and parses
 * bodyOf's JSON, each record through `reading` when it is given.
 */
function fakeConnector(
  id: VrdbSourceId,
  downloads: Download[],
  version = 1,
  reading?: (record: ParsedRecord) => ParsedRecord,
) {
  const seenValidators: Array<{ etag?: string | null; lastModified?: string | null }> = [];
  const connector: Connector = {
    id,
    version,
    async download(_fetch, validators) {
      seenValidators.push({ ...validators });
      const next = downloads.shift();
      if (next === undefined) throw new Error("no download left");
      if (next instanceof Error) throw next;
      return next;
    },
    parse(snapshot) {
      const result = JSON.parse(snapshot.bodies[0]) as ParseResult;
      return reading === undefined ? result : { ...result, records: result.records.map(reading) };
    },
  };
  return { connector, seenValidators };
}

const snapshotOf = (
  result: Partial<ParseResult>,
  validators: { etag?: string | null; lastModified?: string | null } = {},
): Snapshot => {
  const body = bodyOf(result);
  return {
    bodies: [body],
    etag: validators.etag ?? null,
    lastModified: validators.lastModified ?? null,
    bytes: Buffer.byteLength(body),
  };
};

const unusedFetch: ConnectorFetch = async () => {
  throw new Error("the fake connector does not fetch");
};

function clockFrom(start: Date) {
  let now = start.getTime();
  return {
    now: () => new Date(now),
    advance: (ms: number) => {
      now += ms;
    },
  };
}

async function sync(
  id: VrdbSourceId,
  memory: ReturnType<typeof memoryStore>,
  connector: Connector | IncrementalConnector,
  now: () => Date = () => T0,
  fetch: ConnectorFetch = unusedFetch,
) {
  return syncSource(id, { store: memory.store, connector, fetch, now });
}

const activeIds = (memory: ReturnType<typeof memoryStore>, id: VrdbSourceId) =>
  memory
    .recordsOf(id)
    .filter((value) => value.status === "active")
    .map((value) => value.record.sourceRecordId)
    .sort();

beforeEach(() => jest.clearAllMocks());

describe("syncSource", () => {
  it("does not take a whole copy of a list read by its changes", async () => {
    const memory = memoryStore();
    const { connector } = fakeConnector("cve", [snapshotOf({ records: [recordOf("CVE-1")] })]);

    await expect(sync("cve", memory, connector)).rejects.toThrow(
      "The copy of cve is not taken as a whole",
    );
    expect(memory.recordsOf("cve")).toEqual([]);
  });

  it("inserts the records of a first sync", async () => {
    const memory = memoryStore();
    const { connector } = fakeConnector("uk_sanctions", [
      snapshotOf(
        { records: [recordOf("A"), recordOf("B")], sourceVersion: "2026-10-29" },
        { etag: '"v1"' },
      ),
    ]);

    const result = await sync("uk_sanctions", memory, connector);

    expect(result).toEqual({
      outcome: "ok",
      counts: { seen: 2, inserted: 2, updated: 0, statusChanged: 0 },
    });
    expect(activeIds(memory, "uk_sanctions")).toEqual(["A", "B"]);
    expect(memory.sources.get("uk_sanctions")).toMatchObject({
      lastOutcome: "ok",
      lastSuccessAt: T0,
      sourceVersion: "2026-10-29",
      etag: '"v1"',
      activeRecords: 2,
    });
  });

  it("updates a record whose content changed", async () => {
    const memory = memoryStore();
    const { connector } = fakeConnector("uk_sanctions", [
      snapshotOf({ records: [recordOf("A"), recordOf("B")] }),
      snapshotOf({ records: [recordOf("A", "Entry A, now with a new regime."), recordOf("B")] }),
    ]);

    await sync("uk_sanctions", memory, connector);
    const second = await sync("uk_sanctions", memory, connector);

    expect(second.counts).toEqual({ seen: 2, inserted: 0, updated: 1, statusChanged: 0 });
    expect(memory.recordsOf("uk_sanctions")[0].record.summary).toBe(
      "Entry A, now with a new regime.",
    );
  });

  it("answers unchanged on 304, and on the hash of the last success", async () => {
    const memory = memoryStore();
    const same = snapshotOf({ records: [recordOf("A")] }, { etag: '"v1"' });
    const { connector, seenValidators } = fakeConnector("uk_sanctions", [
      same,
      "unchanged",
      { ...same, etag: '"v2"' },
    ]);
    const clock = clockFrom(T0);

    await sync("uk_sanctions", memory, connector, clock.now);
    clock.advance(HOUR_MS);
    const notModified = await sync("uk_sanctions", memory, connector, clock.now);
    clock.advance(HOUR_MS);
    const sameBody = await sync("uk_sanctions", memory, connector, clock.now);

    expect(notModified).toEqual({ outcome: "unchanged" });
    expect(sameBody).toEqual({ outcome: "unchanged" });
    // The stored validators go with each download.
    expect(seenValidators[1]).toEqual({ etag: '"v1"', lastModified: null });
    // Nothing was parsed or written again, and the new validators were kept.
    expect(memory.runs.map((run) => run.result?.outcome)).toEqual(["ok", "unchanged", "unchanged"]);
    expect(memory.sources.get("uk_sanctions")).toMatchObject({
      lastOutcome: "unchanged",
      lastSuccessAt: new Date(T0.getTime() + 2 * HOUR_MS),
      etag: '"v2"',
    });
    // The connector's version goes first, then each body with its length.
    const expectedHash = createHash("sha256")
      .update("v1\n")
      .update(`${same.bodies[0].length}:${same.bodies[0]}`)
      .digest("hex");
    expect(memory.runs[0].result?.rawSnapshotHash).toBe(expectedHash);
    expect(memory.runs[2].result?.rawSnapshotHash).toBe(expectedHash);
    expect(memory.runs[1].result?.rawSnapshotHash).toBeUndefined();
  });

  it("a new connector version re-parses an unchanged body", async () => {
    const memory = memoryStore();
    const body = snapshotOf({ records: [recordOf("A")] });
    const before = fakeConnector("uk_sanctions", [body, body]);
    await sync("uk_sanctions", memory, before.connector);
    expect(await sync("uk_sanctions", memory, before.connector)).toEqual({ outcome: "unchanged" });

    // Version 2 reads a key from the same body that version 1 did not.
    const after = fakeConnector("uk_sanctions", [body], 2, (record) => ({
      ...record,
      matchKeys: [...record.matchKeys, "regno:123456"],
    }));
    const result = await sync("uk_sanctions", memory, after.connector);

    expect(result).toEqual({
      outcome: "ok",
      counts: { seen: 1, inserted: 0, updated: 1, statusChanged: 0 },
    });
    expect(memory.recordsOf("uk_sanctions")[0].record.matchKeys).toContain("regno:123456");
  });

  it("marks records missing from a sanctions list delisted, and from KEV withdrawn", async () => {
    const memory = memoryStore();
    // Ten records, one of which leaves: a tenth, under the shrink guard's fifth.
    const ten = idsUpTo(10).map((id) => recordOf(id));
    const sanctions = fakeConnector("ofac", [
      snapshotOf({ records: ten }),
      snapshotOf({ records: ten.slice(0, 9) }),
    ]);
    const kev = fakeConnector("kev", [
      snapshotOf({ records: ten }),
      snapshotOf({ records: ten.slice(0, 9) }),
    ]);

    await sync("ofac", memory, sanctions.connector);
    const ofacResult = await sync("ofac", memory, sanctions.connector);
    await sync("kev", memory, kev.connector);
    await sync("kev", memory, kev.connector);

    expect(ofacResult.counts).toEqual({ seen: 9, inserted: 0, updated: 0, statusChanged: 1 });
    const statusOf = (sourceId: VrdbSourceId, id: string) =>
      memory.recordsOf(sourceId).find((value) => value.record.sourceRecordId === id)?.status;
    expect(statusOf("ofac", "E10")).toBe("delisted");
    expect(statusOf("kev", "E10")).toBe("withdrawn");
    expect(memory.sources.get("ofac")?.activeRecords).toBe(9);
  });

  it("makes a delisted record that returns active again", async () => {
    const memory = memoryStore();
    const ten = idsUpTo(10).map((id) => recordOf(id));
    const { connector } = fakeConnector("eu_fsf", [
      snapshotOf({ records: ten }),
      snapshotOf({ records: ten.slice(0, 9) }),
      snapshotOf({ records: ten }),
    ]);

    await sync("eu_fsf", memory, connector);
    await sync("eu_fsf", memory, connector);
    const back = await sync("eu_fsf", memory, connector);

    expect(back.counts).toEqual({ seen: 10, inserted: 0, updated: 0, statusChanged: 1 });
    expect(activeIds(memory, "eu_fsf")).toHaveLength(10);
  });

  it("the shrink guard: 100 to 79 fails as shrank, 100 to 80 passes", async () => {
    expect(SHRINK_LIMIT).toBe(0.2);
    const records = (count: number) => idsUpTo(count).map((id) => recordOf(id));

    const shrunk = memoryStore();
    const tooFew = fakeConnector("ofac", [
      snapshotOf({ records: records(100) }),
      snapshotOf({ records: records(79) }),
    ]);
    await sync("ofac", shrunk, tooFew.connector);
    const failed = await sync("ofac", shrunk, tooFew.connector);

    const kept = memoryStore();
    const enough = fakeConnector("ofac", [
      snapshotOf({ records: records(100) }),
      snapshotOf({ records: records(80) }),
    ]);
    await sync("ofac", kept, enough.connector);
    const passed = await sync("ofac", kept, enough.connector);

    expect(failed).toEqual({ outcome: "failed", errorCode: "shrank" });
    expect(activeIds(shrunk, "ofac")).toHaveLength(100);
    expect(shrunk.sources.get("ofac")).toMatchObject({ activeRecords: 100, lastError: "shrank" });
    expect(passed.outcome).toBe("ok");
    expect(activeIds(kept, "ofac")).toHaveLength(80);
  });

  it("a body cut at the size limit fails as too_large and keeps the mirror", async () => {
    const memory = memoryStore();
    const catalog = (ids: string[]) =>
      JSON.stringify({
        catalogVersion: "2026.10.30",
        vulnerabilities: ids.map((cveID) => ({
          cveID,
          vendorProject: "Acme",
          product: "Gateway",
          vulnerabilityName: "Acme Gateway flaw",
          dateAdded: "2026-10-01",
          shortDescription: "A flaw.",
          requiredAction: "Apply the update.",
          dueDate: "2026-10-22",
          knownRansomwareCampaignUse: "Unknown",
        })),
      });
    const answers = [
      { body: catalog(["CVE-2026-0001", "CVE-2026-0002"]), truncated: false },
      { body: catalog(["CVE-2026-0001"]).slice(0, 40), truncated: true },
    ];
    const fetch: ConnectorFetch = async (url) => {
      const answer = answers.shift();
      if (answer === undefined) throw new Error("no answer left");
      return {
        notModified: false,
        url,
        status: 200,
        contentType: "application/json",
        body: Buffer.from(answer.body),
        truncated: answer.truncated,
        etag: null,
        lastModified: null,
      };
    };

    await sync("kev", memory, kevConnector, () => T0, fetch);
    const cut = await sync("kev", memory, kevConnector, () => T0, fetch);

    expect(cut).toEqual({ outcome: "failed", errorCode: "too_large" });
    expect(activeIds(memory, "kev")).toEqual(["CVE-2026-0001", "CVE-2026-0002"]);
  });

  it("an HTML page where the XML should be fails as parse_errors", async () => {
    const memory = memoryStore();
    const fetch: ConnectorFetch = async (url) => ({
      notModified: false,
      url,
      status: 200,
      contentType: "application/xml",
      body: Buffer.from(
        "<!DOCTYPE html><html><head><title>Service unavailable</title></head><body><p>Try again later.</p></body></html>",
      ),
      truncated: false,
      etag: null,
      lastModified: null,
    });

    const result = await sync("uk_sanctions", memory, ukConnector, () => T0, fetch);

    expect(result).toEqual({ outcome: "failed", errorCode: "parse_errors" });
    expect(memory.recordsOf("uk_sanctions")).toEqual([]);
  });

  it("a list that parsed with errors fails and keeps the mirror", async () => {
    const memory = memoryStore();
    const { connector } = fakeConnector("uk_sanctions", [
      snapshotOf({ records: [recordOf("A"), recordOf("B")] }),
      snapshotOf({ records: [recordOf("A")], errors: 1 }),
      snapshotOf({ records: [], root: null, errors: 1 }),
      snapshotOf({ records: [] }),
    ]);

    await sync("uk_sanctions", memory, connector);
    const withErrors = await sync("uk_sanctions", memory, connector);
    const notTheList = await sync("uk_sanctions", memory, connector);
    const empty = await sync("uk_sanctions", memory, connector);

    expect(withErrors).toEqual({ outcome: "failed", errorCode: "parse_errors" });
    expect(notTheList).toEqual({ outcome: "failed", errorCode: "wrong_root" });
    expect(empty).toEqual({ outcome: "failed", errorCode: "empty" });
    expect(activeIds(memory, "uk_sanctions")).toEqual(["A", "B"]);
    expect(memory.sources.get("uk_sanctions")).toMatchObject({
      lastOutcome: "failed",
      lastSuccessAt: T0,
      activeRecords: 2,
    });
  });

  it("writes a sync run row for every attempt", async () => {
    const memory = memoryStore();
    const first = snapshotOf({ records: [recordOf("A")] });
    const { connector } = fakeConnector("uk_sanctions", [
      first,
      "unchanged",
      new FetchError("unreachable"),
    ]);
    const clock = clockFrom(T0);
    const ticking = () => {
      const at = clock.now();
      clock.advance(1000);
      return at;
    };

    await sync("uk_sanctions", memory, connector, ticking);
    await sync("uk_sanctions", memory, connector, ticking);
    await sync("uk_sanctions", memory, connector, ticking);

    expect(memory.runs).toHaveLength(3);
    expect(memory.runs.map((run) => [run.sourceId, run.result?.outcome])).toEqual([
      ["uk_sanctions", "ok"],
      ["uk_sanctions", "unchanged"],
      ["uk_sanctions", "failed"],
    ]);
    expect(memory.runs[0].result).toMatchObject({
      bytes: first.bytes,
      counts: { seen: 1, inserted: 1, updated: 0, statusChanged: 0 },
    });
    for (const run of memory.runs) {
      expect(run.finishedAt?.getTime()).toBeGreaterThan(run.startedAt.getTime());
    }
  });

  it("a failure stores a code, not a message", async () => {
    const memory = memoryStore();
    const secret = "https://files.example/list.xml?token=do-not-keep";
    const { connector } = fakeConnector("eu_fsf", [
      new FetchError("unreachable", `The page could not be reached: ${secret}`),
      new Error(`Unexpected answer from ${secret}`),
    ]);

    const fetchFailed = await sync("eu_fsf", memory, connector);
    const unexpected = await sync("eu_fsf", memory, connector);

    expect(fetchFailed).toEqual({ outcome: "failed", errorCode: "fetch_failed" });
    expect(unexpected).toEqual({ outcome: "failed", errorCode: "unexpected" });
    expect(memory.runs.map((run) => run.result)).toEqual([
      { outcome: "failed", errorCode: "fetch_failed" },
      { outcome: "failed", errorCode: "unexpected" },
    ]);
    expect(memory.sources.get("eu_fsf")?.lastError).toBe("unexpected");
    const logged = JSON.stringify((logger.warn as jest.Mock).mock.calls);
    expect(logged).toContain("eu_fsf");
    expect(logged).toContain("fetch_failed");
    expect(logged).not.toContain("token");
    expect(logged).not.toContain("files.example");
  });

  it("a download the server asked to wait for gives that wait beside its code", async () => {
    const memory = memoryStore();
    const { connector } = fakeConnector("ofac", [
      new FetchError("blocked_by_site", undefined, { status: 429, retryAfterMs: 120_000 }),
      new FetchError("unreachable"),
    ]);

    expect(await sync("ofac", memory, connector)).toEqual({
      outcome: "failed",
      errorCode: "fetch_failed",
      retryAfterMs: 120_000,
    });
    // An answer that asked for no wait gives none.
    expect(await sync("ofac", memory, connector)).toEqual({
      outcome: "failed",
      errorCode: "fetch_failed",
    });
    // The run rows keep the code only.
    expect(memory.runs.map((run) => run.result)).toEqual([
      { outcome: "failed", errorCode: "fetch_failed" },
      { outcome: "failed", errorCode: "fetch_failed" },
    ]);
  });

  it("an unchanged sync counts as a success", async () => {
    const memory = memoryStore();
    const { connector } = fakeConnector("kev", [
      snapshotOf({ records: [recordOf("K1")] }),
      "unchanged",
    ]);
    const clock = clockFrom(T0);

    await sync("kev", memory, connector, clock.now);
    clock.advance(50 * HOUR_MS);
    const result = await sync("kev", memory, connector, clock.now);

    expect(result).toEqual({ outcome: "unchanged" });
    expect(memory.sources.get("kev")).toMatchObject({
      lastOutcome: "unchanged",
      lastSuccessAt: new Date(T0.getTime() + 50 * HOUR_MS),
      lastError: null,
    });
  });

  it("prunes runs older than 90 days", async () => {
    expect(SYNC_RUNS_KEPT_DAYS).toBe(90);
    const memory = memoryStore();
    const { connector } = fakeConnector("kev", [
      snapshotOf({ records: [recordOf("K1")] }),
      new FetchError("unreachable"),
    ]);

    await sync("kev", memory, connector);
    await sync("kev", memory, connector);

    const ninetyDaysBefore = new Date(T0.getTime() - 90 * 24 * HOUR_MS);
    expect(memory.pruned).toEqual([ninetyDaysBefore, ninetyDaysBefore]);
  });

  it("a store that throws gives unexpected, and the copy stays as it was", async () => {
    const memory = memoryStore();
    const { connector } = fakeConnector("uk_sanctions", [
      snapshotOf({ records: [recordOf("A")] }),
      snapshotOf({ records: [recordOf("A"), recordOf("B")] }),
    ]);
    await sync("uk_sanctions", memory, connector);
    memory.store.failApply = new Error("connection reset");

    const result = await sync("uk_sanctions", memory, connector);

    expect(result).toEqual({ outcome: "failed", errorCode: "unexpected" });
    expect(activeIds(memory, "uk_sanctions")).toEqual(["A"]);
    expect(memory.runs[1].result).toEqual({
      outcome: "failed",
      errorCode: "unexpected",
      bytes: expect.any(Number),
      rawSnapshotHash: expect.any(String),
    });
  });
});

type Days = Array<{ day: string; result: Partial<ParseResult> }>;

/**
 * A connector of a list read by its changes that hands out the days it is given, one list of days
 * per sync, and parses bodyOf's JSON; it notes the cursor of each sync.
 */
function fakeChanges(downloads: Array<Days | "unchanged" | Error>, id: VrdbSourceId = "cve") {
  const cursors: Array<{ day: string } | null> = [];
  const connector: IncrementalConnector = {
    kind: "incremental",
    id,
    version: 1,
    async download(_fetch, cursor) {
      cursors.push(cursor);
      const next = downloads.shift();
      if (next === undefined) throw new Error("no download left");
      if (next instanceof Error) throw next;
      if (next === "unchanged") return next;
      return next.map(({ day, result }) => ({ day, snapshot: snapshotOf(result) }));
    },
    parse(snapshot) {
      return JSON.parse(snapshot.bodies[0]) as ParseResult;
    },
  };
  return { connector, cursors };
}

const cveOf = (id: string, status?: "rejected"): ParsedRecord => ({
  sourceRecordId: id,
  recordType: "vulnerability",
  title: `${id}: critical vulnerability (CVSS 9.8)`,
  summary: `CVE Program (cve.org). CVE: ${id}.`,
  url: `https://www.cve.org/CVERecord?id=${id}`,
  identifiers: { cveID: id, state: status === "rejected" ? "REJECTED" : "PUBLISHED" },
  matchKeys: status === "rejected" ? [] : [`cve:vendor${id.slice(-1)}`],
  publishedAt: "2026-10-29",
  sourceUpdatedAt: null,
  ...(status === undefined ? {} : { status }),
});

/** The CVE list's row, as a sync that applied up to `day` left it. */
function withCursor(memory: ReturnType<typeof memoryStore>, day: string) {
  memory.sources.set("cve", {
    id: "cve",
    lastSuccessAt: new Date(T0.getTime() - 24 * HOUR_MS),
    lastOutcome: "ok",
    sourceVersion: day,
    etag: null,
    lastModified: null,
    activeRecords: 0,
    cursor: { day },
    lastError: null,
  });
}

describe("syncSource, a list read by its changes", () => {
  it("applies each day after the stored cursor in order, each moving the cursor", async () => {
    const memory = memoryStore();
    withCursor(memory, "2026-10-27");
    const { connector, cursors } = fakeChanges([
      [
        { day: "2026-10-28", result: { records: [cveOf("CVE-2026-0001")] } },
        { day: "2026-10-29", result: { records: [cveOf("CVE-2026-0002")] } },
      ],
    ]);

    const result = await sync("cve", memory, connector);

    expect(cursors).toEqual([{ day: "2026-10-27" }]);
    expect(memory.deltas.map((delta) => delta.cursor)).toEqual([
      { day: "2026-10-28" },
      { day: "2026-10-29" },
    ]);
    expect(
      memory.deltas.map((delta) => delta.records.map((record) => record.sourceRecordId)),
    ).toEqual([["CVE-2026-0001"], ["CVE-2026-0002"]]);
    const [first, second] = memory.deltas.map((delta) => delta.rawSnapshotHash);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(second);
    expect(result).toEqual({
      outcome: "ok",
      counts: { seen: 2, inserted: 2, updated: 0, statusChanged: 0 },
    });
    expect(memory.sources.get("cve")).toMatchObject({
      lastOutcome: "ok",
      cursor: { day: "2026-10-29" },
      activeRecords: 2,
    });
    expect(memory.runs[0].result).toEqual({
      outcome: "ok",
      counts: { seen: 2, inserted: 2, updated: 0, statusChanged: 0 },
      bytes: expect.any(Number),
      rawSnapshotHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("a sync without a cursor is refused as no_baseline: the lookback comes from a baseline", async () => {
    const memory = memoryStore();
    const { connector, cursors } = fakeChanges([
      [{ day: "2026-10-29", result: { records: [cveOf("CVE-2026-0001")] } }],
    ]);

    expect(await sync("cve", memory, connector)).toEqual({
      outcome: "failed",
      errorCode: "no_baseline",
    });

    // The connector is never asked: a copy of yesterday's changes alone would read as checked.
    expect(cursors).toEqual([]);
    expect(memory.deltas).toEqual([]);
    expect(memory.sources.get("cve")).toMatchObject({
      cursor: null,
      lastSuccessAt: null,
      lastError: "no_baseline",
    });
    expect(memory.runs.map((run) => run.result)).toEqual([
      { outcome: "failed", errorCode: "no_baseline" },
    ]);
  });

  it("a delta that does not parse keeps the cursor", async () => {
    const memory = memoryStore();
    withCursor(memory, "2026-10-27");
    const { connector } = fakeChanges([
      [
        { day: "2026-10-28", result: { records: [cveOf("CVE-2026-0001")] } },
        { day: "2026-10-29", result: { records: [cveOf("CVE-2026-0002")], errors: 1 } },
        { day: "2026-10-30", result: { records: [cveOf("CVE-2026-0003")] } },
      ],
      [{ day: "2026-10-29", result: { records: [], root: null } }],
    ]);

    const result = await sync("cve", memory, connector);

    expect(result).toEqual({
      outcome: "failed",
      errorCode: "parse_errors",
      counts: { seen: 1, inserted: 1, updated: 0, statusChanged: 0 },
    });
    expect(memory.sources.get("cve")).toMatchObject({
      cursor: { day: "2026-10-28" },
      lastOutcome: "failed",
      lastError: "parse_errors",
    });
    expect(activeIds(memory, "cve")).toEqual(["CVE-2026-0001"]);
    expect(memory.runs[0].result).toMatchObject({
      outcome: "failed",
      errorCode: "parse_errors",
      counts: { seen: 1, inserted: 1, updated: 0, statusChanged: 0 },
    });

    // A first day that is not the list moves nothing.
    expect(await sync("cve", memory, connector)).toEqual({
      outcome: "failed",
      errorCode: "wrong_root",
    });
    expect(memory.sources.get("cve")?.cursor).toEqual({ day: "2026-10-28" });
    expect(memory.deltas).toHaveLength(1);
  });

  it("a delta never delists", async () => {
    const memory = memoryStore();
    withCursor(memory, "2026-10-27");
    const { connector } = fakeChanges([
      [
        {
          day: "2026-10-28",
          result: { records: [cveOf("CVE-2026-0001"), cveOf("CVE-2026-0002")] },
        },
      ],
      [{ day: "2026-10-29", result: { records: [cveOf("CVE-2026-0003")] } }],
      [{ day: "2026-10-30", result: { records: [] } }],
    ]);

    await sync("cve", memory, connector);
    await sync("cve", memory, connector);
    const empty = await sync("cve", memory, connector);

    expect(activeIds(memory, "cve")).toEqual(["CVE-2026-0001", "CVE-2026-0002", "CVE-2026-0003"]);
    expect(empty).toEqual({
      outcome: "ok",
      counts: { seen: 0, inserted: 0, updated: 0, statusChanged: 0 },
    });
    expect(memory.sources.get("cve")?.cursor).toEqual({ day: "2026-10-30" });
    expect(memory.snapshots).toEqual([]);
  });

  it("answers unchanged when there is no new day, and keeps the cursor", async () => {
    const memory = memoryStore();
    withCursor(memory, "2026-10-30");
    const { connector } = fakeChanges(["unchanged", []]);

    const unchanged = await sync("cve", memory, connector);
    const none = await sync("cve", memory, connector);

    expect(unchanged).toEqual({ outcome: "unchanged" });
    expect(none).toEqual({ outcome: "unchanged" });
    expect(memory.sources.get("cve")).toMatchObject({
      lastOutcome: "unchanged",
      lastSuccessAt: T0,
      cursor: { day: "2026-10-30" },
    });
    expect(memory.deltas).toEqual([]);
    expect(memory.runs.map((run) => run.result)).toEqual([
      { outcome: "unchanged" },
      { outcome: "unchanged" },
    ]);
  });

  it("a download that fails gives the code of what is wrong, and keeps the cursor", async () => {
    const memory = memoryStore();
    withCursor(memory, "2026-10-27");
    const failures: Array<[Error, string]> = [
      [new ZipError("too_large"), "too_large"],
      [new ZipError("not_zip"), "wrong_root"],
      [new ZipError("corrupt"), "parse_errors"],
      [new ZipError("unsupported"), "parse_errors"],
      [new ZipError("too_deep"), "parse_errors"],
      [new NotTheListError(), "wrong_root"],
      [new FeedWithoutFileError(), "feed_without_file"],
      [new BodyTooLargeError(), "too_large"],
      [new FetchError("not_found"), "fetch_failed"],
    ];
    const { connector } = fakeChanges(failures.map(([error]) => error));

    const codes = [];
    for (let index = 0; index < failures.length; index += 1) {
      codes.push((await sync("cve", memory, connector)).errorCode);
    }

    expect(codes).toEqual(failures.map(([, code]) => code));
    expect(memory.sources.get("cve")?.cursor).toEqual({ day: "2026-10-27" });
    expect(memory.deltas).toEqual([]);
  });

  it("a day the server asked to wait for gives that wait beside its code, and keeps the cursor", async () => {
    const memory = memoryStore();
    withCursor(memory, "2026-10-27");
    const { connector } = fakeChanges([
      new FetchError("blocked_by_site", undefined, { status: 503, retryAfterMs: 30_000 }),
    ]);

    expect(await sync("cve", memory, connector)).toEqual({
      outcome: "failed",
      errorCode: "fetch_failed",
      retryAfterMs: 30_000,
    });
    expect(memory.sources.get("cve")?.cursor).toEqual({ day: "2026-10-27" });
  });

  it("does not read by its changes a list taken as a whole", async () => {
    const memory = memoryStore();
    const { connector } = fakeChanges([[]], "kev");

    await expect(sync("kev", memory, connector)).rejects.toThrow("kev is not read by its changes");
    expect(memory.runs).toEqual([]);
  });
});
