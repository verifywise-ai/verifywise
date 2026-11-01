jest.setTimeout(60000);

/**
 * The sync of the vendor risk database against the real tables of the test database, with a fake
 * connector, or the CVE connector over a fake GitHub (no list is downloaded).
 *
 * The unit tests of vrdb/sync.ts use a store in memory. What they cannot show is what the database
 * does: the upsert of the records, the change of a record's content and status, the run rows, the
 * answer `unchanged`, an apply that fails leaving the copy exactly as it was, and for the CVE
 * records the cursor, a rejection dated, and the keys a rejected record keeps.
 */

// First, and not to be reordered: ./setup registers the mocks of BullMQ and Redis.
import "./setup";
import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import * as vrdbStore from "../../utils/vrdb.utils";
import { writeZip } from "../../services/vendorResearch/vrdb/__tests__/helpers/zipWriter";
import {
  CVE_REFS_API,
  CVE_RELEASE_API,
  cveConnector,
} from "../../services/vendorResearch/vrdb/connectors/cve";
import type {
  Connector,
  ConnectorFetch,
  ParseResult,
  Snapshot,
} from "../../services/vendorResearch/vrdb/connectors/types";
import { FetchError } from "../../services/webResearch/guardedFetch";
import { CVE_TERMS_LICENCE, vrdbSourceOf } from "../../services/vendorResearch/vrdb/sources";
import { syncSource } from "../../services/vendorResearch/vrdb/sync";
import type { ParsedRecord } from "../../services/vendorResearch/vrdb/types";

afterEach(async () => {
  await cleanupDatabase();
});

afterAll(async () => {
  await sequelize.close();
});

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
  publishedAt: null,
  sourceUpdatedAt: null,
});
const TEN = Array.from({ length: 10 }, (_, index) => recordOf(`E${index + 1}`));

const snapshotOf = (result: Partial<ParseResult>, etag: string | null = null): Snapshot => {
  const body = JSON.stringify({ errors: 0, sourceVersion: "2026-10-30", root: "list", ...result });
  return { bodies: [body], etag, lastModified: null, bytes: Buffer.byteLength(body) };
};

/** A connector that hands out the downloads it is given, one per sync. */
const fakeConnector = (downloads: Array<Snapshot | "unchanged">): Connector => ({
  id: "ofac",
  version: 1,
  async download() {
    const next = downloads.shift();
    if (next === undefined) throw new Error("no download left");
    return next;
  },
  parse(snapshot) {
    return JSON.parse(snapshot.bodies[0]) as ParseResult;
  },
});

const sync = (connector: Connector, at: Date) =>
  syncSource("ofac", {
    store: vrdbStore,
    connector,
    fetch: async () => {
      throw new Error("the fake connector does not fetch");
    },
    now: () => at,
  });

const recordRows = async () =>
  (await sequelize.query(
    `SELECT source_record_id, status, status_changed_at, summary, retrieved_at
     FROM vrdb_records WHERE source_id = 'ofac' ORDER BY id`,
    { type: QueryTypes.SELECT },
  )) as Array<{
    source_record_id: string;
    status: string;
    status_changed_at: Date | null;
    summary: string;
    retrieved_at: Date;
  }>;

const sourceRow = async () =>
  (
    (await sequelize.query(
      `SELECT last_outcome, last_error, last_success_at, last_attempt_at, etag, source_version,
              active_records, licence, attribution
       FROM vrdb_sources WHERE id = 'ofac'`,
      { type: QueryTypes.SELECT },
    )) as Array<Record<string, unknown>>
  )[0];

const runRows = async () =>
  (await sequelize.query(
    `SELECT outcome, error_code, records_seen, inserted, updated, status_changed, bytes,
            raw_snapshot_hash, finished_at, duration_ms
     FROM vrdb_sync_runs WHERE source_id = 'ofac' ORDER BY id`,
    { type: QueryTypes.SELECT },
  )) as Array<Record<string, unknown>>;

describe("the sync of a list, in the database", () => {
  it("inserts, updates, delists, answers unchanged and brings a record back", async () => {
    const changed = [recordOf("E1", "Entry E1, now under a new regime."), ...TEN.slice(1, 9)];
    const connector = fakeConnector([
      snapshotOf({ records: TEN }, '"v1"'),
      snapshotOf({ records: changed }, '"v2"'),
      "unchanged",
      snapshotOf({ records: changed }, '"v3"'),
      snapshotOf({ records: [...changed, TEN[9]] }, '"v4"'),
    ]);

    const first = await sync(connector, T0);
    expect(first).toEqual({
      outcome: "ok",
      counts: { seen: 10, inserted: 10, updated: 0, statusChanged: 0 },
    });
    expect(await sourceRow()).toMatchObject({
      last_outcome: "ok",
      last_error: null,
      etag: '"v1"',
      source_version: "2026-10-30",
      active_records: 10,
      licence: vrdbSourceOf("ofac").licence,
      attribution: vrdbSourceOf("ofac").attribution,
    });

    const second = await sync(connector, new Date(T0.getTime() + 6 * HOUR_MS));
    expect(second.counts).toEqual({ seen: 9, inserted: 0, updated: 1, statusChanged: 1 });
    const afterSecond = await recordRows();
    expect(afterSecond.find((row) => row.source_record_id === "E1")?.summary).toBe(
      "Entry E1, now under a new regime.",
    );
    expect(afterSecond.find((row) => row.source_record_id === "E10")).toMatchObject({
      status: "delisted",
      status_changed_at: new Date(T0.getTime() + 6 * HOUR_MS),
    });
    // An unchanged record is not written again.
    expect(afterSecond.find((row) => row.source_record_id === "E2")?.retrieved_at).toEqual(T0);

    expect(await sync(connector, new Date(T0.getTime() + 12 * HOUR_MS))).toEqual({
      outcome: "unchanged",
    });
    expect(await sync(connector, new Date(T0.getTime() + 18 * HOUR_MS))).toEqual({
      outcome: "unchanged",
    });
    expect(await sourceRow()).toMatchObject({
      last_outcome: "unchanged",
      last_success_at: new Date(T0.getTime() + 18 * HOUR_MS),
      etag: '"v3"',
      active_records: 9,
    });

    const back = await sync(connector, new Date(T0.getTime() + 24 * HOUR_MS));
    expect(back.counts).toEqual({ seen: 10, inserted: 0, updated: 0, statusChanged: 1 });
    expect((await recordRows()).every((row) => row.status === "active")).toBe(true);

    const runs = await runRows();
    expect(runs.map((run) => run.outcome)).toEqual(["ok", "ok", "unchanged", "unchanged", "ok"]);
    expect(runs[0]).toMatchObject({
      records_seen: 10,
      inserted: 10,
      updated: 0,
      status_changed: 0,
    });
    expect(runs[2]).toMatchObject({ raw_snapshot_hash: null, bytes: null });
    expect(runs[3].raw_snapshot_hash).toBe(runs[1].raw_snapshot_hash);
    for (const run of runs) {
      expect(run.finished_at).not.toBeNull();
      expect(Number(run.duration_ms)).toBeGreaterThanOrEqual(0);
    }
  });

  it("a failed apply leaves the old records", async () => {
    await sync(fakeConnector([snapshotOf({ records: TEN })]), T0);
    const before = await recordRows();

    // Thrown inside the transaction, after every write of the apply.
    await expect(
      sequelize.transaction(async (transaction) => {
        await vrdbStore.applyVrdbSnapshotQuery(
          {
            sourceId: "ofac",
            records: [recordOf("E1", "Changed."), recordOf("E11")],
            missingStatus: "delisted",
            rawSnapshotHash: "b".repeat(64),
            sourceVersion: "2026-10-31",
            etag: null,
            lastModified: null,
            at: new Date(T0.getTime() + HOUR_MS),
          },
          transaction,
        );
        throw new Error("fails after the apply");
      }),
    ).rejects.toThrow("fails after the apply");

    // A record the database refuses (an id longer than its column) fails the whole apply.
    const refused = await sync(
      fakeConnector([snapshotOf({ records: [...TEN.slice(1), recordOf("X".repeat(201))] })]),
      new Date(T0.getTime() + 2 * HOUR_MS),
    );

    expect(refused).toEqual({ outcome: "failed", errorCode: "unexpected" });
    expect(await recordRows()).toEqual(before);
    expect(await sourceRow()).toMatchObject({
      last_outcome: "failed",
      last_error: "unexpected",
      last_success_at: T0,
      source_version: "2026-10-30",
      active_records: 10,
    });
  });
});

// ---------------------------------------------------------------------------
// The CVE records, read by their changes
// ---------------------------------------------------------------------------

const ORG = "00000000-0000-4000-8000-000000000001";

/** A PUBLISHED critical record, or a REJECTED one, of the CVE record format 5.1. */
/** The day the CVE Program rejected the records of `cveRecord` (their `dateRejected`). */
const REJECTED_AT = new Date("2026-10-30T10:00:00.000Z");

function cveRecord(
  id: string,
  state: "PUBLISHED" | "REJECTED" = "PUBLISHED",
  vendor = "Example Corp",
  baseScore = 9.8,
) {
  return state === "PUBLISHED"
    ? {
        dataType: "CVE_RECORD",
        dataVersion: "5.1",
        cveMetadata: {
          cveId: id,
          assignerOrgId: ORG,
          state,
          datePublished: "2026-10-29T14:00:00.000Z",
          dateUpdated: "2026-10-29T14:00:00.000Z",
        },
        containers: {
          cna: {
            providerMetadata: { orgId: ORG },
            descriptions: [{ lang: "en", value: `A remote code execution flaw, ${id}.` }],
            affected: [
              { vendor, product: "Gateway", versions: [{ version: "1.0", status: "affected" }] },
            ],
            metrics: [
              {
                cvssV3_1: {
                  version: "3.1",
                  baseScore,
                  baseSeverity: baseScore >= 9 ? "CRITICAL" : "HIGH",
                },
              },
            ],
          },
        },
      }
    : {
        dataType: "CVE_RECORD",
        dataVersion: "5.1",
        cveMetadata: {
          cveId: id,
          assignerOrgId: ORG,
          state,
          dateRejected: "2026-10-30T10:00:00.000Z",
          dateUpdated: "2026-10-30T10:00:00.000Z",
        },
        containers: {
          cna: {
            providerMetadata: { orgId: ORG },
            rejectedReasons: [{ lang: "en", value: "Not a vulnerability." }],
          },
        },
      };
}

const downloadOf = (day: string) =>
  `https://github.com/CVEProject/cvelistV5/releases/download/cve_${day}_at_end_of_day/${day}_delta_CVEs_at_end_of_day.zip`;

const hourlyDownloadOf = (day: string, hour: string) =>
  `https://github.com/CVEProject/cvelistV5/releases/download/cve_${day}_${hour}00Z/${day}_delta_CVEs_at_${hour}00Z.zip`;

/** A day that has no end-of-day release: the hours of its hourly releases, and the changes of the last. */
interface HourlyDay {
  hours: string[];
  changes: unknown[];
}

/**
 * The GitHub API and the downloads of the end-of-day releases of the days it is given. A day of
 * `hourly` has no end-of-day release (the API answers 404), the list of its tags is its hours, and
 * only the release of its last hour can be read.
 */
function github(
  days: Record<string, unknown[]>,
  hourly: Record<string, HourlyDay> = {},
): ConnectorFetch {
  return async (url) => {
    const respond = (body: Buffer, contentType: string) => ({
      notModified: false as const,
      url,
      status: 200 as const,
      contentType,
      body,
      truncated: false,
      etag: null,
      lastModified: null,
    });
    const zipOf = (records: unknown[]) =>
      writeZip(
        records.map((record) => ({
          name: `deltaCves/${(record as { cveMetadata: { cveId: string } }).cveMetadata.cveId}.json`,
          data: JSON.stringify(record),
        })),
      );

    const gap = Object.keys(hourly).find(
      (key) => url === `${CVE_RELEASE_API}cve_${key}_at_end_of_day`,
    );
    if (gap !== undefined) throw new FetchError("not_found");
    const tagged = Object.keys(hourly).find((key) => url === `${CVE_REFS_API}cve_${key}_`);
    if (tagged !== undefined) {
      const refs = hourly[tagged].hours.map((hour) => ({
        ref: `refs/tags/cve_${tagged}_${hour}00Z`,
      }));
      return respond(Buffer.from(JSON.stringify(refs)), "application/json");
    }
    for (const [key, { hours, changes }] of Object.entries(hourly)) {
      const last = [...hours].sort()[hours.length - 1];
      if (url === `${CVE_RELEASE_API}cve_${key}_${last}00Z`) {
        const release = {
          assets: [
            {
              name: `${key}_delta_CVEs_at_${last}00Z.zip`,
              browser_download_url: hourlyDownloadOf(key, last),
            },
          ],
        };
        return respond(Buffer.from(JSON.stringify(release)), "application/json");
      }
      if (url === hourlyDownloadOf(key, last)) {
        return respond(zipOf(changes), "application/octet-stream");
      }
    }

    const day = Object.keys(days).find(
      (key) => url === `${CVE_RELEASE_API}cve_${key}_at_end_of_day` || url === downloadOf(key),
    );
    if (day === undefined) throw new Error(`no release at ${url}`);
    if (url.startsWith(CVE_RELEASE_API)) {
      const release = {
        assets: [
          { name: `${day}_delta_CVEs_at_end_of_day.zip`, browser_download_url: downloadOf(day) },
        ],
      };
      return respond(Buffer.from(JSON.stringify(release)), "application/json");
    }
    return respond(zipOf(days[day]), "application/octet-stream");
  };
}

const cveRows = async () =>
  (await sequelize.query(
    `SELECT source_record_id, status, status_changed_at, match_keys, title, summary, content_hash,
            updated_at
     FROM vrdb_records WHERE source_id = 'cve' ORDER BY source_record_id`,
    { type: QueryTypes.SELECT },
  )) as Array<{
    source_record_id: string;
    status: string;
    status_changed_at: Date | null;
    match_keys: string[];
    title: string;
    summary: string;
    content_hash: string;
    updated_at: Date;
  }>;

/** The content hash of a record the copy retired: one that no content has. */
const NO_CONTENT_HASH = "0".repeat(64);

/** The records the CVE connector keeps of these records of the CVE record format. */
const parsedCve = (...records: unknown[]): ParsedRecord[] =>
  cveConnector.parse({
    bodies: records.map((record) => JSON.stringify(record)),
    etag: null,
    lastModified: null,
    bytes: 0,
  }).records;

const cveSource = async () =>
  (
    (await sequelize.query(
      `SELECT cursor, last_outcome, source_version, active_records, last_success_at
       FROM vrdb_sources WHERE id = 'cve'`,
      { type: QueryTypes.SELECT },
    )) as Array<Record<string, unknown>>
  )[0];

describe("the sync of the CVE records, in the database", () => {
  it("two days applied in order move the cursor and date a rejection by the CVE Program's day", async () => {
    await vrdbStore.upsertVrdbSourceQuery(vrdbSourceOf("cve"), T0);
    await sequelize.query(
      `UPDATE vrdb_sources SET cursor = '{"day": "2026-10-28"}'::jsonb WHERE id = 'cve'`,
    );
    const at = new Date("2026-10-31T03:00:00Z");

    const result = await syncSource("cve", {
      store: vrdbStore,
      connector: cveConnector,
      fetch: github({
        "2026-10-29": [
          cveRecord("CVE-2026-1001"),
          cveRecord("CVE-2026-1002", "PUBLISHED", "Other"),
        ],
        "2026-10-30": [cveRecord("CVE-2026-1001", "REJECTED")],
      }),
      now: () => at,
    });

    expect(result).toEqual({
      outcome: "ok",
      counts: { seen: 3, inserted: 2, updated: 1, statusChanged: 1 },
    });
    const [rejected, active] = await cveRows();
    expect(rejected).toMatchObject({
      source_record_id: "CVE-2026-1001",
      status: "rejected",
      // The record's dateRejected, not the day of the sync that copied it.
      status_changed_at: REJECTED_AT,
      match_keys: ["cve:examplecorp", "cve:example"],
      title: "CVE-2026-1001: rejected",
    });
    // A delta never delists: the other record of the first day is still on the list.
    expect(active).toMatchObject({
      source_record_id: "CVE-2026-1002",
      status: "active",
      status_changed_at: null,
      match_keys: ["cve:other"],
    });
    expect(await cveSource()).toMatchObject({
      cursor: { day: "2026-10-30" },
      last_outcome: "ok",
      source_version: "2026-10-30",
      active_records: 1,
      last_success_at: at,
    });
  });

  it("a rejected record keeps its stored keys, and one new to the copy is dated", async () => {
    await vrdbStore.upsertVrdbSourceQuery(vrdbSourceOf("cve"), T0);
    const first = cveConnector.parse({
      bodies: [
        JSON.stringify(cveRecord("CVE-2026-2001")),
        JSON.stringify(cveRecord("CVE-2026-2003")),
      ],
      etag: null,
      lastModified: null,
      bytes: 0,
    }).records;
    const later = cveConnector.parse({
      bodies: [
        JSON.stringify(cveRecord("CVE-2026-2001", "REJECTED")),
        JSON.stringify(cveRecord("CVE-2026-2002", "REJECTED")),
        // The CNA corrected the vendor: the record is matched by the new one only.
        JSON.stringify(cveRecord("CVE-2026-2003", "PUBLISHED", "Other")),
      ],
      etag: null,
      lastModified: null,
      bytes: 0,
    }).records;
    const at = new Date(T0.getTime() + HOUR_MS);

    await vrdbStore.applyVrdbDeltaQuery({
      sourceId: "cve",
      records: first,
      cursor: { day: "2026-10-29" },
      rawSnapshotHash: "a".repeat(64),
      at: T0,
    });
    const counts = await vrdbStore.applyVrdbDeltaQuery({
      sourceId: "cve",
      records: later,
      cursor: null,
      rawSnapshotHash: "b".repeat(64),
      at,
    });

    expect(counts).toEqual({ seen: 3, inserted: 1, updated: 2, statusChanged: 2 });
    expect(await cveRows()).toEqual([
      expect.objectContaining({
        source_record_id: "CVE-2026-2001",
        status: "rejected",
        status_changed_at: REJECTED_AT,
        match_keys: ["cve:examplecorp", "cve:example"],
      }),
      expect.objectContaining({
        source_record_id: "CVE-2026-2002",
        status: "rejected",
        status_changed_at: REJECTED_AT,
        match_keys: [],
      }),
      expect.objectContaining({
        source_record_id: "CVE-2026-2003",
        status: "active",
        status_changed_at: null,
        match_keys: ["cve:other"],
      }),
    ]);
    // No cursor keeps the stored one.
    expect(await cveSource()).toMatchObject({ cursor: { day: "2026-10-29" }, active_records: 1 });
  });

  it("a baseline's batches before its last leave the list's outcome and last success alone", async () => {
    await vrdbStore.upsertVrdbSourceQuery(vrdbSourceOf("cve"), T0);
    const records = cveConnector.parse({
      bodies: [JSON.stringify(cveRecord("CVE-2026-3001"))],
      etag: null,
      lastModified: null,
      bytes: 0,
    }).records;

    await vrdbStore.applyVrdbDeltaQuery({
      sourceId: "cve",
      records,
      cursor: null,
      rawSnapshotHash: "c".repeat(64),
      at: T0,
    });

    // A load that stops here (the script exits 1) leaves a list that was never copied.
    expect(await cveSource()).toMatchObject({
      cursor: null,
      last_outcome: "never",
      last_success_at: null,
      active_records: 1,
    });

    const at = new Date(T0.getTime() + HOUR_MS);
    await vrdbStore.applyVrdbDeltaQuery({
      sourceId: "cve",
      records: [],
      cursor: { day: "2026-10-29" },
      rawSnapshotHash: "c".repeat(64),
      at,
    });

    expect(await cveSource()).toMatchObject({
      cursor: { day: "2026-10-29" },
      last_outcome: "ok",
      last_success_at: at,
    });
  });

  it("a record re-scored below 9.0 loses its keys and is no longer found; it returns when it is critical again", async () => {
    await vrdbStore.upsertVrdbSourceQuery(vrdbSourceOf("cve"), T0);
    await sequelize.query(
      `UPDATE vrdb_sources SET cursor = '{"day": "2026-10-28"}'::jsonb WHERE id = 'cve'`,
    );
    const syncDay = (days: Record<string, unknown[]>, at: Date) =>
      syncSource("cve", {
        store: vrdbStore,
        connector: cveConnector,
        fetch: github(days),
        now: () => at,
      });
    const found = async () =>
      (await vrdbStore.findVrdbRecordsByKeysQuery(["cve:examplecorp"], ["cve"])).map(
        (row) => row.sourceRecordId,
      );

    // The copy holds the record as critical, and a run is offered it.
    await syncDay({ "2026-10-29": [cveRecord("CVE-2026-4001")] }, new Date("2026-10-30T03:00:00Z"));
    const [critical] = await cveRows();
    expect(critical).toMatchObject({
      status: "active",
      match_keys: ["cve:examplecorp", "cve:example"],
    });
    expect(critical.content_hash).not.toBe(NO_CONTENT_HASH);
    expect(await found()).toEqual(["CVE-2026-4001"]);

    // The CVE Program re-scores it to 7.5, which the copy's filter leaves out.
    const rescored = await syncDay(
      { "2026-10-30": [cveRecord("CVE-2026-4001", "PUBLISHED", "Example Corp", 7.5)] },
      new Date("2026-10-31T03:00:00Z"),
    );

    expect(rescored).toEqual({
      outcome: "ok",
      counts: { seen: 0, inserted: 0, updated: 1, statusChanged: 0 },
    });
    // It loses its keys and takes a hash that no content has; its content and status stay.
    expect(await cveRows()).toEqual([
      expect.objectContaining({
        source_record_id: "CVE-2026-4001",
        status: "active",
        status_changed_at: null,
        match_keys: [],
        content_hash: NO_CONTENT_HASH,
        title: critical.title,
        summary: critical.summary,
      }),
    ]);
    expect(await found()).toEqual([]);

    // Critical again with the content it had: the hash of no content differs, so it is written
    // again and gets its keys back.
    const again = await syncDay(
      { "2026-10-31": [cveRecord("CVE-2026-4001")] },
      new Date("2026-11-01T03:00:00Z"),
    );

    expect(again).toEqual({
      outcome: "ok",
      counts: { seen: 1, inserted: 0, updated: 1, statusChanged: 0 },
    });
    expect(await cveRows()).toEqual([
      expect.objectContaining({
        match_keys: critical.match_keys,
        content_hash: critical.content_hash,
      }),
    ]);
    expect(await found()).toEqual(["CVE-2026-4001"]);
  });

  it("a stored rejection that the list publishes again below 9.0 becomes active, dated by the sync", async () => {
    await vrdbStore.upsertVrdbSourceQuery(vrdbSourceOf("cve"), T0);
    await vrdbStore.upsertVrdbSourceQuery(vrdbSourceOf("kev"), T0);
    const apply = (
      records: ParsedRecord[],
      at: Date,
      options: { retire?: string[]; cursor?: { day: string } } = {},
    ) =>
      vrdbStore.applyVrdbDeltaQuery({
        sourceId: "cve",
        records,
        retire: options.retire ?? [],
        cursor: options.cursor ?? null,
        rawSnapshotHash: "a".repeat(64),
        at,
      });
    // The copy held the record as critical, then the program rejected it: it keeps the keys it had.
    await apply(parsedCve(cveRecord("CVE-2026-5001")), T0, { cursor: { day: "2026-10-29" } });
    await apply(
      parsedCve(cveRecord("CVE-2026-5001", "REJECTED")),
      new Date(T0.getTime() + HOUR_MS),
    );
    // A rejected CVE is rejected on every list (Ruling 9): the KEV entry for it is hidden.
    await vrdbStore.applyVrdbDeltaQuery({
      sourceId: "kev",
      records: [
        {
          sourceRecordId: "CVE-2026-5001",
          recordType: "vulnerability",
          title: "CVE-2026-5001: Example Corp Gateway",
          summary: "Known to be exploited.",
          url: "https://list.example/kev/CVE-2026-5001",
          identifiers: { cveID: "CVE-2026-5001" },
          matchKeys: ["kev:examplecorp"],
          publishedAt: "2026-10-29",
          sourceUpdatedAt: null,
        },
      ],
      cursor: null,
      rawSnapshotHash: "d".repeat(64),
      at: T0,
    });
    const kevFound = async () =>
      (await vrdbStore.findVrdbRecordsByKeysQuery(["kev:examplecorp"], ["kev"])).map(
        (row) => row.sourceRecordId,
      );
    const [rejected] = await cveRows();
    expect(rejected).toMatchObject({
      status: "rejected",
      status_changed_at: REJECTED_AT,
      match_keys: ["cve:examplecorp", "cve:example"],
    });
    expect(await kevFound()).toEqual([]);
    expect(await cveSource()).toMatchObject({ active_records: 0 });

    // The program publishes the record again, re-scored below the cut.
    const at = new Date(T0.getTime() + 2 * HOUR_MS);
    const counts = await apply([], at, { retire: ["CVE-2026-5001"] });

    expect(counts).toEqual({ seen: 0, inserted: 0, updated: 1, statusChanged: 1 });
    expect(await cveRows()).toEqual([
      expect.objectContaining({
        source_record_id: "CVE-2026-5001",
        status: "active",
        // The sync dates it: the list says nothing of when the rejection ended.
        status_changed_at: at,
        match_keys: [],
        content_hash: NO_CONTENT_HASH,
        title: rejected.title,
        summary: rejected.summary,
      }),
    ]);
    // The stale rejection no longer hides the CVE on the other lists.
    expect(await kevFound()).toEqual(["CVE-2026-5001"]);
    expect(await cveSource()).toMatchObject({ active_records: 1 });
  });

  it("an id the copy does not hold, or one the same day keeps, is not retired; a retired record is not counted twice", async () => {
    await vrdbStore.upsertVrdbSourceQuery(vrdbSourceOf("cve"), T0);
    const held = parsedCve(
      cveRecord("CVE-2026-6001"),
      cveRecord("CVE-2026-6002", "PUBLISHED", "Other"),
      cveRecord("CVE-2026-6003", "PUBLISHED", "Third"),
    );
    await vrdbStore.applyVrdbDeltaQuery({
      sourceId: "cve",
      records: held,
      cursor: { day: "2026-10-29" },
      rawSnapshotHash: "a".repeat(64),
      at: T0,
    });
    // The next day writes the first with the keys of another vendor, and repeats the third as it
    // was. It names all three among the records it leaves out, with the second twice, and an id
    // that the copy never held.
    const rewritten = parsedCve(cveRecord("CVE-2026-6001", "PUBLISHED", "Changed"));
    const at = new Date(T0.getTime() + HOUR_MS);

    const counts = await vrdbStore.applyVrdbDeltaQuery({
      sourceId: "cve",
      records: [...rewritten, held[2]],
      retire: ["CVE-2026-6001", "CVE-2026-6002", "CVE-2026-6003", "CVE-2026-6002", "CVE-2026-6009"],
      cursor: null,
      rawSnapshotHash: "b".repeat(64),
      at,
    });

    // The first is written, and the second retired: two changes, and the others none.
    expect(counts).toEqual({ seen: 2, inserted: 0, updated: 2, statusChanged: 0 });
    const rows = await cveRows();
    // The id the copy never held is not created.
    expect(rows.map((row) => row.source_record_id)).toEqual([
      "CVE-2026-6001",
      "CVE-2026-6002",
      "CVE-2026-6003",
    ]);
    const [written, retired, repeated] = rows;
    // A record the day writes wins over the same id among those it retires, whether the write
    // changes it or not.
    expect(written.match_keys).toEqual(rewritten[0].matchKeys);
    expect(written.content_hash).not.toBe(NO_CONTENT_HASH);
    expect(repeated.match_keys).toEqual(held[2].matchKeys);
    expect(repeated.content_hash).not.toBe(NO_CONTENT_HASH);
    expect(retired).toMatchObject({
      status: "active",
      match_keys: [],
      content_hash: NO_CONTENT_HASH,
      updated_at: at,
    });

    // Retired again, it has nothing left to lose: it is not counted, and its row is not written.
    const again = await vrdbStore.applyVrdbDeltaQuery({
      sourceId: "cve",
      records: [],
      retire: ["CVE-2026-6002"],
      cursor: null,
      rawSnapshotHash: "c".repeat(64),
      at: new Date(at.getTime() + HOUR_MS),
    });

    expect(again).toEqual({ seen: 0, inserted: 0, updated: 0, statusChanged: 0 });
    expect((await cveRows())[1].updated_at).toEqual(at);
  });

  it("a day without an end-of-day release is applied from its last hourly release, and the cursor moves past it", async () => {
    await vrdbStore.upsertVrdbSourceQuery(vrdbSourceOf("cve"), T0);
    await sequelize.query(
      `UPDATE vrdb_sources SET cursor = '{"day": "2026-10-28"}'::jsonb WHERE id = 'cve'`,
    );
    const at = new Date("2026-10-31T03:00:00Z");
    const fetch = github(
      { "2026-10-30": [cveRecord("CVE-2026-7002")] },
      // The hours come out of order: the day is read up to the greatest, whatever the list's order.
      { "2026-10-29": { hours: ["09", "21", "00", "13"], changes: [cveRecord("CVE-2026-7001")] } },
    );

    const result = await syncSource("cve", {
      store: vrdbStore,
      connector: cveConnector,
      fetch,
      now: () => at,
    });

    // The record of the hourly day and the record of the day after it, both written.
    expect(result).toEqual({
      outcome: "ok",
      counts: { seen: 2, inserted: 2, updated: 0, statusChanged: 0 },
    });
    expect((await cveRows()).map((row) => row.source_record_id)).toEqual([
      "CVE-2026-7001",
      "CVE-2026-7002",
    ]);
    expect(await cveSource()).toMatchObject({ cursor: { day: "2026-10-30" }, last_outcome: "ok" });
    // The cursor is past the hourly day: the next sync has no day left to read.
    expect(
      await syncSource("cve", { store: vrdbStore, connector: cveConnector, fetch, now: () => at }),
    ).toEqual({
      outcome: "unchanged",
    });
  });

  it("the row of the CVE records carries MITRE's copyright designation and the licence, whole", async () => {
    const at = new Date("2026-12-31T23:30:00Z");
    // The attribution is read when it is used, so it is read once here: the year does not change
    // between the write and the comparison.
    const definition = { ...vrdbSourceOf("cve") };

    await vrdbStore.upsertVrdbSourceQuery(definition, at);

    const [row] = (await sequelize.query(
      `SELECT licence, attribution, length(licence) AS licence_length
       FROM vrdb_sources WHERE id = 'cve'`,
      { type: QueryTypes.SELECT },
    )) as Array<{ licence: string; attribution: string; licence_length: number }>;
    // The licence paragraph is reproduced as the Terms print it, with CVE™ and the symbol ©, which
    // the database must keep as the characters they are.
    expect(row.licence).toBe(definition.licence);
    expect(row.licence).toContain(CVE_TERMS_LICENCE);
    expect(row.licence).toContain("CVE™");
    expect(row.licence_length).toBe(row.licence.length);
    expect(row.attribution).toBe(definition.attribution);
    expect(row.attribution).toMatch(/Copyright © 1999-\d{4}, The MITRE Corporation/);
  });
});
