jest.setTimeout(60000);

/**
 * The run-time lookup of the vendor risk database against the real tables of the test database:
 * records stored by an apply, found by the vendor's keys through the GIN index, offered to the run,
 * and kept as match rows of the vendor's organization.
 */

// First, and not to be reordered: ./setup registers the mocks of BullMQ and Redis.
import "./setup";
import { QueryTypes } from "sequelize";
import { cleanupDatabase, createTestOrganization } from "./helpers";
import { sequelize } from "../../database/db";
import type { VrdbSourceId } from "../../domain.layer/interfaces/i.vendorResearch";
import { createTestVendor } from "../factories";
import type { VendorResearchConfig } from "../../services/vendorResearch/config";
import {
  databaseReadThroughStore,
  sharedVrdbLookup,
} from "../../services/vendorResearch/vrdb/lookup";
import { NAME_ONLY_LOOKUP_NOTE } from "../../services/vendorResearch/records/ofac";
import type { ReadThroughDeps } from "../../services/vendorResearch/vrdb/readThrough";
import { vrdbSourceOf } from "../../services/vendorResearch/vrdb/sources";
import type { ParsedRecord } from "../../services/vendorResearch/vrdb/types";
import { applyVrdbSnapshotQuery, upsertVrdbSourceQuery } from "../../utils/vrdb.utils";

afterEach(async () => {
  await cleanupDatabase();
});

afterAll(async () => {
  await sequelize.close();
});

const SYNCED_AT = new Date("2026-10-30T06:41:00Z");
const NOW = new Date("2026-10-30T12:00:00Z");

const CONFIG: VendorResearchConfig = {
  autoRun: true,
  manualCooldownMinutes: 10,
  dailyRunCap: 50,
  workerConcurrency: 5,
  headless: false,
  records: true,
};

const TARGET = { name: "Acme Analytics", domain: "acme-analytics.example", provides: "" };

/** No read-through source is asked here (vrdb.readThrough.test.ts asks one): no test reaches the NVD. */
const NO_READ_THROUGH: ReadThroughDeps = {
  store: databaseReadThroughStore,
  connectors: {},
  fetchJson: async () => {
    throw new Error("no test reaches the NVD");
  },
  spacers: {},
};

const kevRecord = (cve: string, vendorProject: string, day: string): ParsedRecord => ({
  sourceRecordId: cve,
  recordType: "vulnerability",
  title: `${cve}: ${vendorProject} flaw`,
  summary: `CISA Known Exploited Vulnerabilities Catalog (cisa.gov). CVE: ${cve}. Vendor or project: ${vendorProject}.`,
  url: `https://nvd.nist.gov/vuln/detail/${cve}`,
  identifiers: { cveID: cve, vendorProject, product: "Gateway" },
  matchKeys: [`kev:${vendorProject.toLowerCase().replace(/[^a-z0-9]/g, "")}`],
  publishedAt: day,
  sourceUpdatedAt: null,
});

const sanctionsRecord = (id: string, keys: string[]): ParsedRecord => ({
  sourceRecordId: id,
  recordType: "sanctions_entity",
  title: `Entity ${id}`,
  summary: `UK Sanctions List (gov.uk). Entry: "Entity ${id}" (entity).`,
  url: `https://www.gov.uk/government/publications/the-uk-sanctions-list?uid=${id}`,
  identifiers: { names: [`Entity ${id}`] },
  matchKeys: keys,
  publishedAt: "2024-05-01",
  sourceUpdatedAt: null,
});

/** A record of an AI-specific list: the vendor's name is its only key, whatever the list. */
const aiRecord = (
  recordType: ParsedRecord["recordType"],
  id: string,
  publishedAt: string | null,
): ParsedRecord => ({
  sourceRecordId: id,
  recordType,
  title: `Entry ${id}`,
  summary: `Entry ${id} of a list about AI.`,
  url: `https://lists.example/ai?entry=${id}`,
  identifiers: { names: ["Acme Analytics"] },
  matchKeys: ["name:acmeanalytics"],
  publishedAt,
  sourceUpdatedAt: null,
});

/**
 * An entry of the US Consolidated Screening List: a listing in force, found by a name or a website
 * (the same fictional company as the other lists').
 */
const screeningRecord = (id: string, keys: string[], publishedAt: string | null): ParsedRecord => ({
  sourceRecordId: id,
  recordType: "restricted_party",
  title: `Consolidated Screening List: ${id}`,
  summary: `US Consolidated Screening List (trade.gov). Entry ${id} of a list of export controls.`,
  url: `https://www.trade.gov/consolidated-screening-list?entry=${encodeURIComponent(id)}`,
  identifiers: { names: ["Acme Analytics"] },
  matchKeys: keys,
  publishedAt,
  sourceUpdatedAt: null,
});

/** The copy of a list in the tables, as a sync of 2026-10-30 left it. */
async function seedList(
  sourceId: VrdbSourceId,
  records: ParsedRecord[],
  missingStatus: "withdrawn" | "delisted",
): Promise<void> {
  await upsertVrdbSourceQuery(vrdbSourceOf(sourceId), SYNCED_AT);
  await applyVrdbSnapshotQuery({
    sourceId,
    records,
    missingStatus,
    rawSnapshotHash: "d".repeat(64),
    sourceVersion: "2026-10-30",
    etag: null,
    lastModified: null,
    at: SYNCED_AT,
  });
}

async function seedAiLists(): Promise<void> {
  const lists = [
    ["atlas", aiRecord("ai_case_study", "AML.CS9001", "2026-03-01")],
    ["nhtsa_sgo", aiRecord("crash_report_summary", "acmeanalytics:ads", "2026-08-01")],
    ["fda_ai_devices", aiRecord("ai_device_authorizations", "acmeanalytics", "2026-06-25")],
    ["fda_device_recalls", aiRecord("ai_device_recall", "90001", "2026-08-15")],
    // The AI Incident Database sits behind the closed gate Q29: a copy of it in the tables is
    // never offered and is not in the coverage.
    ["aiid", aiRecord("ai_incident", "1797", "2026-05-11")],
  ] as const;
  for (const [sourceId, record] of lists) {
    await upsertVrdbSourceQuery(vrdbSourceOf(sourceId), SYNCED_AT);
    await applyVrdbSnapshotQuery({
      sourceId,
      records: [record],
      missingStatus: "withdrawn",
      rawSnapshotHash: "c".repeat(64),
      sourceVersion: "2026.10",
      etag: null,
      lastModified: null,
      at: SYNCED_AT,
    });
  }
}

async function seedLists(): Promise<void> {
  await upsertVrdbSourceQuery(vrdbSourceOf("kev"), SYNCED_AT);
  await applyVrdbSnapshotQuery({
    sourceId: "kev",
    records: [
      kevRecord("CVE-2026-0001", "Acme Analytics", "2026-09-01"),
      kevRecord("CVE-2026-0002", "Other Co", "2026-09-02"),
    ],
    missingStatus: "withdrawn",
    rawSnapshotHash: "a".repeat(64),
    sourceVersion: "2026.10.30",
    etag: null,
    lastModified: null,
    at: SYNCED_AT,
  });
  await upsertVrdbSourceQuery(vrdbSourceOf("uk_sanctions"), SYNCED_AT);
  await applyVrdbSnapshotQuery({
    sourceId: "uk_sanctions",
    records: [
      sanctionsRecord("UK1", ["name:acmeanalytics"]),
      sanctionsRecord("UK2", ["name:somebodyelse", "domain:acme-analytics.example"]),
      sanctionsRecord("UK3", ["name:somebodyelse"]),
    ],
    missingStatus: "delisted",
    rawSnapshotHash: "b".repeat(64),
    sourceVersion: "2026-10-29",
    etag: null,
    lastModified: null,
    at: SYNCED_AT,
  });
}

const matchRows = async () =>
  (await sequelize.query(
    `SELECT m.organization_id, m.vendor_id, r.source_record_id, m.match_method, m.match_strength,
            m.matched_key, m.first_matched_at, m.last_matched_at
     FROM vendor_vrdb_matches m JOIN vrdb_records r ON r.id = m.record_id
     ORDER BY r.source_record_id`,
    { type: QueryTypes.SELECT },
  )) as Array<Record<string, unknown>>;

describe("the lookup of a vendor, in the database", () => {
  it("offers the vendor's records and keeps them as matches of its organization", async () => {
    await seedLists();
    const orgId = await createTestOrganization("VRDB org");
    const vendorId = await createTestVendor(orgId, { vendor_name: "Acme Analytics" });
    const lookup = sharedVrdbLookup({ organizationId: orgId, vendorId }, CONFIG, NO_READ_THROUGH);
    if (lookup === undefined) throw new Error("the lookup is on in this test");

    // The website check read the vendor's home page, so its domain is a key (preflight.ts).
    const outcome = await lookup({
      target: TARGET,
      verifiedDomains: [TARGET.domain],
      researchable: ["security_incidents", "legal_regulatory"],
      now: NOW,
    });

    const offered = outcome.records.flatMap((entry) =>
      entry.records.map((record) => [record.vrdb.sourceRecordId, record.vrdb.strength]),
    );
    expect(offered).toEqual([
      ["CVE-2026-0001", "strong"],
      ["UK2", "strong"],
      ["UK1", "weak"],
    ]);
    expect(outcome.records[0].records[0].text).toMatch(/ As of 2026-10-30\.$/);
    // The SEC has no connector here (NO_READ_THROUGH) and the CVE records no copy: no baseline is loaded.
    expect(outcome.coverage.map((entry) => [entry.id, entry.outcome])).toEqual([
      ["kev", "found"],
      ["nvd", "not_researched"],
      ["sec", "not_researched"],
      ["ofac", "failed"],
      ["uk_sanctions", "found"],
      ["eu_fsf", "failed"],
      ["cve", "failed"],
      // The screening list serves legal_regulatory, which this run researches, and no copy of it was
      // made here: failed, like the sanctions lists of this test that no one seeded.
      ["csl", "failed"],
      // The AI lists are asked for the AI-specific category only; this run did not research it.
      ["atlas", "not_researched"],
      ["nhtsa_sgo", "not_researched"],
      ["fda_ai_devices", "not_researched"],
      ["fda_device_recalls", "not_researched"],
    ]);
    expect(await matchRows()).toEqual([
      expect.objectContaining({
        organization_id: orgId,
        vendor_id: vendorId,
        source_record_id: "CVE-2026-0001",
        match_method: "kev_vendor",
        match_strength: "strong",
        matched_key: "kev:acmeanalytics",
      }),
      expect.objectContaining({
        organization_id: orgId,
        source_record_id: "UK1",
        match_method: "name_exact",
        match_strength: "weak",
      }),
      expect.objectContaining({
        organization_id: orgId,
        source_record_id: "UK2",
        match_method: "domain",
        match_strength: "strong",
        matched_key: "domain:acme-analytics.example",
      }),
    ]);
  });

  it("offers the AI-specific records by the vendor's name only, as weak matches, and never the gated list", async () => {
    await seedAiLists();
    const orgId = await createTestOrganization("VRDB org");
    const vendorId = await createTestVendor(orgId, { vendor_name: "Acme Analytics" });
    const lookup = sharedVrdbLookup({ organizationId: orgId, vendorId }, CONFIG, NO_READ_THROUGH);
    if (lookup === undefined) throw new Error("the lookup is on in this test");

    const outcome = await lookup({
      target: TARGET,
      verifiedDomains: [TARGET.domain],
      researchable: ["ai_specific"],
      now: NOW,
    });

    const offered = outcome.records.flatMap((entry) =>
      entry.records.map((record) => [record.vrdb.sourceRecordId, record.vrdb.strength]),
    );
    expect(offered).toHaveLength(4);
    expect(offered).toEqual(
      expect.arrayContaining([
        ["AML.CS9001", "weak"],
        ["acmeanalytics:ads", "weak"],
        ["acmeanalytics", "weak"],
        ["90001", "weak"],
      ]),
    );
    for (const entry of outcome.records) {
      for (const record of entry.records) expect(record.text).toContain(NAME_ONLY_LOOKUP_NOTE);
    }
    expect(
      outcome.coverage
        .filter((entry) =>
          ["atlas", "nhtsa_sgo", "fda_ai_devices", "fda_device_recalls", "aiid"].includes(entry.id),
        )
        .map((entry) => [entry.id, entry.outcome]),
    ).toEqual([
      ["atlas", "found"],
      ["nhtsa_sgo", "found"],
      ["fda_ai_devices", "found"],
      ["fda_device_recalls", "found"],
    ]);
    // Four weak name matches were kept for the organization, and none for the gated list. The
    // rows come back in the collation of the database, so they are compared as a set.
    const rows = await matchRows();
    expect(rows.map((row) => row.source_record_id).sort()).toEqual([
      "90001",
      "AML.CS9001",
      "acmeanalytics",
      "acmeanalytics:ads",
    ]);
    for (const row of rows) {
      expect(row).toMatchObject({
        organization_id: orgId,
        vendor_id: vendorId,
        match_method: "name_exact",
        match_strength: "weak",
        matched_key: "name:acmeanalytics",
      });
    }
  });

  it("offers nothing of the AI-specific lists to a run that did not research that category", async () => {
    await seedAiLists();
    const orgId = await createTestOrganization("VRDB org");
    const vendorId = await createTestVendor(orgId, { vendor_name: "Acme Analytics" });
    const lookup = sharedVrdbLookup({ organizationId: orgId, vendorId }, CONFIG, NO_READ_THROUGH);
    if (lookup === undefined) throw new Error("the lookup is on in this test");

    const outcome = await lookup({
      target: TARGET,
      verifiedDomains: [TARGET.domain],
      researchable: ["security_incidents", "legal_regulatory"],
      now: NOW,
    });

    expect(outcome.records).toEqual([]);
    expect(await matchRows()).toEqual([]);
  });

  it("offers the screening list's entries whatever their age and the recalls of the lookback only, and keeps them as matches", async () => {
    await seedList(
      "csl",
      [
        screeningRecord("el:acmeanalytics", ["name:acmeanalytics"], "2019-05-16"),
        screeningRecord(
          "cmic:otherco",
          ["name:otherco", "domain:acme-analytics.example"],
          "2021-06-03",
        ),
        screeningRecord("ssi:somebodyelse", ["name:somebodyelse"], "2024-01-10"),
      ],
      "delisted",
    );
    await seedList(
      "fda_device_recalls",
      [
        aiRecord("ai_device_recall", "90001", "2026-08-15"),
        aiRecord("ai_device_recall", "90002", "2023-02-01"),
      ],
      "withdrawn",
    );
    const orgId = await createTestOrganization("VRDB org");
    const vendorId = await createTestVendor(orgId, { vendor_name: "Acme Analytics" });
    const lookup = sharedVrdbLookup({ organizationId: orgId, vendorId }, CONFIG, NO_READ_THROUGH);
    if (lookup === undefined) throw new Error("the lookup is on in this test");

    const outcome = await lookup({
      target: TARGET,
      verifiedDomains: [TARGET.domain],
      researchable: ["legal_regulatory", "ai_specific"],
      // The lookback at NOW: 36 months for legal_regulatory and 24 for ai_specific.
      cutoffs: { legal_regulatory: "2023-10-30", ai_specific: "2024-10-30" },
      now: NOW,
    });

    const listed = (id: string) => outcome.records.find((entry) => entry.source === id);
    // A listing in force is a state: the designation of 2019 is offered beside the other, as of the
    // copy, and the website match comes first.
    expect(
      listed("csl")?.records.map((record) => [
        record.vrdb.sourceRecordId,
        record.vrdb.strength,
        record.publishedAt,
      ]),
    ).toEqual([
      ["cmic:otherco", "strong", "2026-10-30"],
      ["el:acmeanalytics", "weak", "2026-10-30"],
    ]);
    expect(listed("csl")?.omitted).toEqual({});
    expect(listed("csl")?.records[0].text).not.toContain(NAME_ONLY_LOOKUP_NOTE);
    expect(listed("csl")?.records[1].text).toContain(NAME_ONLY_LOOKUP_NOTE);
    // A recall is an event: the one of 2023 is left out and counted, the other keeps its day.
    expect(
      listed("fda_device_recalls")?.records.map((record) => [
        record.vrdb.sourceRecordId,
        record.publishedAt,
      ]),
    ).toEqual([["90001", "2026-08-15"]]);
    expect(listed("fda_device_recalls")?.omitted).toEqual({ old: 1 });
    expect(
      outcome.coverage
        .filter((entry) => ["csl", "fda_device_recalls"].includes(entry.id))
        .map((entry) => [entry.id, entry.outcome, entry.strong, entry.weak]),
    ).toEqual([
      ["csl", "found", 1, 1],
      ["fda_device_recalls", "found", 0, 1],
    ]);
    // Three matches were kept for the organization, by methods the table already has. The rows come
    // back in the collation of the database, so they are compared as a set.
    const rows = await matchRows();
    expect(
      rows
        .map((row) => [row.source_record_id, row.match_method, row.match_strength, row.matched_key])
        .sort(),
    ).toEqual([
      ["90001", "name_exact", "weak", "name:acmeanalytics"],
      ["cmic:otherco", "domain", "strong", "domain:acme-analytics.example"],
      ["el:acmeanalytics", "name_exact", "weak", "name:acmeanalytics"],
    ]);
    for (const row of rows)
      expect(row).toMatchObject({ organization_id: orgId, vendor_id: vendorId });
  });

  it("a second lookup moves last_matched_at only", async () => {
    await seedLists();
    const orgId = await createTestOrganization("VRDB org");
    const vendorId = await createTestVendor(orgId, { vendor_name: "Acme Analytics" });
    const lookup = sharedVrdbLookup({ organizationId: orgId, vendorId }, CONFIG, NO_READ_THROUGH);
    if (lookup === undefined) throw new Error("the lookup is on in this test");
    const input = { target: TARGET, researchable: ["security_incidents"] as const };

    await lookup({ ...input, now: NOW });
    const later = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    await lookup({ ...input, now: later });

    expect(await matchRows()).toEqual([
      expect.objectContaining({
        source_record_id: "CVE-2026-0001",
        first_matched_at: NOW,
        last_matched_at: later,
      }),
    ]);
  });
});
