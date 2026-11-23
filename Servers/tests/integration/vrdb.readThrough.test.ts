jest.setTimeout(60000);

/**
 * The read-through sources of the vendor risk database on the real tables (M2 Task 5): an answer is
 * stored as records of its source, with the keys of every answer that held them, a status that
 * changed is counted and dated, a failed answer leaves the records, and a CVE that one list rejected
 * is offered by none. No test asks the NVD: the connector's answers are given.
 */

// First, and not to be reordered: ./setup registers the mocks of BullMQ and Redis.
import "./setup";
import { QueryTypes } from "sequelize";
import { cleanupDatabase, createTestOrganization } from "./helpers";
import { sequelize } from "../../database/db";
import { createTestVendor } from "../factories";
import type { ReadThroughConnector } from "../../services/vendorResearch/vrdb/connectors/types";
import {
  createVrdbLookup,
  databaseLookupStore,
  databaseReadThroughStore,
} from "../../services/vendorResearch/vrdb/lookup";
import { RETRY_AFTER_FAILURE_MS } from "../../services/vendorResearch/vrdb/readThrough";
import { type ReadThroughSource, vrdbSourceOf } from "../../services/vendorResearch/vrdb/sources";
import type { ParsedRecord } from "../../services/vendorResearch/vrdb/types";
import {
  applyVrdbSnapshotQuery,
  findVrdbRecordsByKeysQuery,
  getVrdbLookupQuery,
  saveReadThroughAnswerQuery,
  upsertVrdbSourceQuery,
} from "../../utils/vrdb.utils";

afterEach(async () => {
  await cleanupDatabase();
});

afterAll(async () => {
  await sequelize.close();
});

const NVD = vrdbSourceOf("nvd") as ReadThroughSource;
const HOUR_MS = 3_600_000;
const T1 = new Date("2026-10-31T06:00:00Z");
const T2 = new Date("2026-10-31T13:00:00Z");
const later = (at: Date, ms: number) => new Date(at.getTime() + ms);
const KEY = "cpe:brisenetworks";

const nvdRecord = (cve: string, keys: string[], status?: "rejected"): ParsedRecord => ({
  sourceRecordId: cve,
  recordType: "vulnerability",
  title: `${cve}: critical vulnerability (CVSS 9.8)`,
  summary: `National Vulnerability Database (nvd.nist.gov). CVE: ${cve}.`,
  url: `https://nvd.nist.gov/vuln/detail/${cve}`,
  identifiers: { cveID: cve, cpeVendor: keys[0].slice("cpe:".length) },
  matchKeys: keys,
  publishedAt: "2026-10-01",
  sourceUpdatedAt: null,
  ...(status === undefined ? {} : { status }),
});

const answer = (
  key: string,
  records: ParsedRecord[],
  at: Date,
  outcome: "ok" | "empty" | "failed" = records.length > 0 ? "ok" : "empty",
) =>
  saveReadThroughAnswerQuery({
    definition: NVD,
    key,
    records,
    outcome,
    at,
    expiresAt: later(at, outcome === "failed" ? RETRY_AFTER_FAILURE_MS : 6 * HOUR_MS),
  });

const storedRows = async () =>
  (await sequelize.query(
    `SELECT source_record_id, status, status_changed_at, match_keys, retrieved_at
     FROM vrdb_records WHERE source_id = 'nvd' ORDER BY source_record_id`,
    { type: QueryTypes.SELECT },
  )) as Array<Record<string, unknown>>;

describe("the answers of a read-through source, in the database", () => {
  it("an answer adds its key to a stored record and keeps the other keys", async () => {
    await answer(KEY, [nvdRecord("CVE-2026-5001", [KEY])], T1);
    await answer(
      "cpe:brise",
      [nvdRecord("CVE-2026-5001", ["cpe:brise"]), nvdRecord("CVE-2026-5002", ["cpe:brise"])],
      T2,
    );

    expect(await storedRows()).toEqual([
      expect.objectContaining({
        source_record_id: "CVE-2026-5001",
        status: "active",
        match_keys: [KEY, "cpe:brise"],
        retrieved_at: T2,
      }),
      expect.objectContaining({ source_record_id: "CVE-2026-5002", match_keys: ["cpe:brise"] }),
    ]);
    expect(await getVrdbLookupQuery("nvd", KEY)).toEqual({
      fetchedAt: T1,
      expiresAt: later(T1, 6 * HOUR_MS),
      outcome: "ok",
    });
    const [lookups] = (await sequelize.query(
      `SELECT lookup_key, record_count FROM vrdb_lookups ORDER BY lookup_key`,
    )) as [Array<{ lookup_key: string; record_count: number }>, unknown];
    expect(lookups).toEqual([
      { lookup_key: "cpe:brise", record_count: 2 },
      { lookup_key: KEY, record_count: 1 },
    ]);
  });

  it("a status change is counted and dated", async () => {
    const first = await answer(
      KEY,
      [nvdRecord("CVE-2026-5001", [KEY]), nvdRecord("CVE-2026-5002", [KEY])],
      T1,
    );
    const second = await answer(
      KEY,
      [nvdRecord("CVE-2026-5001", [KEY], "rejected"), nvdRecord("CVE-2026-5002", [KEY])],
      T2,
    );
    const third = await answer(
      KEY,
      [nvdRecord("CVE-2026-5001", [KEY], "rejected")],
      later(T2, HOUR_MS),
    );

    expect([first, second, third]).toEqual([
      { statusChanged: 0 },
      { statusChanged: 1 },
      { statusChanged: 0 },
    ]);
    expect(await storedRows()).toEqual([
      expect.objectContaining({
        source_record_id: "CVE-2026-5001",
        status: "rejected",
        status_changed_at: T2,
      }),
      expect.objectContaining({
        source_record_id: "CVE-2026-5002",
        status: "active",
        status_changed_at: null,
      }),
    ]);
  });

  it("a record that is rejected when it is first stored is a change of status too", async () => {
    // It rejects the same CVE on the other lists (Ruling 9 of the M2 plan).
    const saved = await answer(KEY, [nvdRecord("CVE-2026-5009", [KEY], "rejected")], T1);

    expect(saved).toEqual({ statusChanged: 1 });
    expect(await storedRows()).toEqual([
      expect.objectContaining({ status: "rejected", status_changed_at: T1 }),
    ]);
  });

  it("a failed answer leaves the records, and the time of the last answer", async () => {
    await answer(KEY, [nvdRecord("CVE-2026-5001", [KEY])], T1);
    const failed = await answer(KEY, [], T2, "failed");

    expect(failed).toEqual({ statusChanged: 0 });
    expect(await storedRows()).toEqual([
      expect.objectContaining({
        source_record_id: "CVE-2026-5001",
        status: "active",
        retrieved_at: T1,
      }),
    ]);
    expect(await getVrdbLookupQuery("nvd", KEY)).toEqual({
      fetchedAt: T1,
      expiresAt: later(T2, RETRY_AFTER_FAILURE_MS),
      outcome: "failed",
    });
  });

  it("a key whose first answer failed is kept without a time of success", async () => {
    await answer(KEY, [], T1, "failed");

    expect(await getVrdbLookupQuery("nvd", KEY)).toEqual({
      fetchedAt: null,
      expiresAt: later(T1, RETRY_AFTER_FAILURE_MS),
      outcome: "failed",
    });
    expect(await getVrdbLookupQuery("nvd", "cpe:other")).toBeNull();
    expect(await storedRows()).toEqual([]);
  });
});

describe("a record that leaves the source's answer (M2 final review, Important 1)", () => {
  // An answer of the NVD covers the critical CVEs of the key published in the 119 days it asks
  // for. One that holds all of them (its total fits its page) says that a stored CVE of the key
  // published in that window and missing from it was rejected, re-scored or moved off the vendor.
  const published = (record: ParsedRecord, day: string): ParsedRecord => ({
    ...record,
    publishedAt: day,
  });
  const offered = async () =>
    (await findVrdbRecordsByKeysQuery([KEY], ["nvd"])).map((row) => row.sourceRecordId).sort();
  const answerCovering = (records: ParsedRecord[], at: Date, coversSince: string | null) =>
    saveReadThroughAnswerQuery({
      definition: NVD,
      key: KEY,
      records,
      outcome: records.length > 0 ? "ok" : "empty",
      at,
      expiresAt: later(at, 6 * HOUR_MS),
      coversSince,
    });

  it("a CVE missing from a complete answer inside the window is no longer offered", async () => {
    await answerCovering(
      [
        published(nvdRecord("CVE-2026-5001", [KEY]), "2026-10-01"),
        published(nvdRecord("CVE-2026-5002", [KEY, "cpe:other"]), "2026-10-02"),
      ],
      T1,
      "2026-07-04",
    );

    await answerCovering(
      [published(nvdRecord("CVE-2026-5001", [KEY]), "2026-10-01")],
      T2,
      "2026-07-04",
    );

    expect(await offered()).toEqual(["CVE-2026-5001"]);
    // The record keeps the keys of the other answers that hold it, and its status.
    const rows = await storedRows();
    expect(rows.find((row) => row.source_record_id === "CVE-2026-5002")).toMatchObject({
      status: "active",
      match_keys: ["cpe:other"],
    });
  });

  it("a CVE that aged out of the window is still offered, dated by its last answer", async () => {
    await answerCovering(
      [published(nvdRecord("CVE-2026-4001", [KEY]), "2026-06-20")],
      T1,
      "2026-07-03",
    );

    await answerCovering([], later(T1, 24 * HOUR_MS), "2026-07-04");

    expect(await offered()).toEqual(["CVE-2026-4001"]);
    const [row] = await findVrdbRecordsByKeysQuery([KEY], ["nvd"]);
    expect(row.retrievedAt).toBe("2026-10-31");
  });

  it("an incomplete answer retires nothing", async () => {
    await answerCovering(
      [
        published(nvdRecord("CVE-2026-5001", [KEY]), "2026-10-01"),
        published(nvdRecord("CVE-2026-5002", [KEY]), "2026-10-02"),
      ],
      T1,
      "2026-07-04",
    );

    await answerCovering([published(nvdRecord("CVE-2026-5001", [KEY]), "2026-10-01")], T2, null);

    expect(await offered()).toEqual(["CVE-2026-5001", "CVE-2026-5002"]);
  });
});

describe("the lookup of a vendor with a read-through source, in the database", () => {
  const TARGET = { name: "Brise Networks", domain: "brisenetworks.example", provides: "" };
  const NOW = new Date("2026-10-31T12:00:00Z");

  it("a CVE rejected on one list is offered by none", async () => {
    await upsertVrdbSourceQuery(vrdbSourceOf("kev"), T1);
    await applyVrdbSnapshotQuery({
      sourceId: "kev",
      records: ["CVE-2026-5001", "CVE-2026-5003"].map((cve) => ({
        sourceRecordId: cve,
        recordType: "vulnerability" as const,
        title: `${cve}: Brise flaw`,
        summary: `CISA Known Exploited Vulnerabilities Catalog (cisa.gov). CVE: ${cve}.`,
        url: `https://nvd.nist.gov/vuln/detail/${cve}`,
        identifiers: { cveID: cve, vendorProject: "Brise Networks", product: "BriseOS" },
        matchKeys: ["kev:brisenetworks"],
        publishedAt: "2026-10-02",
        sourceUpdatedAt: null,
      })),
      missingStatus: "withdrawn",
      rawSnapshotHash: "a".repeat(64),
      sourceVersion: null,
      etag: null,
      lastModified: null,
      at: T1,
    });
    const connector: ReadThroughConnector = {
      id: "nvd",
      keyOf: async () => ({ key: KEY, weak: false }),
      fetch: async () => ({
        records: [nvdRecord("CVE-2026-5001", [KEY], "rejected"), nvdRecord("CVE-2026-5002", [KEY])],
        coversSince: null,
      }),
    };
    const orgId = await createTestOrganization("VRDB org");
    const vendorId = await createTestVendor(orgId, { vendor_name: "Brise Networks" });
    const lookup = createVrdbLookup({
      store: databaseLookupStore,
      organizationId: orgId,
      vendorId,
      enabled: true,
      readThrough: {
        store: databaseReadThroughStore,
        connectors: { nvd: connector },
        fetchJson: async () => {
          throw new Error("the connector of the test asks itself");
        },
        spacers: {},
      },
    });

    const outcome = await lookup({
      target: TARGET,
      researchable: ["security_incidents"],
      now: NOW,
      verifiedDomains: [TARGET.domain],
    });

    expect(
      outcome.records.map((entry) => [
        entry.source,
        entry.records.map((record) => record.vrdb.sourceRecordId),
      ]),
    ).toEqual([
      ["kev", ["CVE-2026-5003"]],
      ["nvd", ["CVE-2026-5002"]],
    ]);
    expect(outcome.coverage.find((entry) => entry.id === "nvd")).toMatchObject({
      mode: "read_through",
      outcome: "found",
      last_success_at: NOW.toISOString(),
    });
    expect(await getVrdbLookupQuery("nvd", KEY)).toMatchObject({ fetchedAt: NOW, outcome: "ok" });
  });
});
