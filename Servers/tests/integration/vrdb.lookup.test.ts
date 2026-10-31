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
import { createTestVendor } from "../factories";
import type { VendorResearchConfig } from "../../services/vendorResearch/config";
import {
  databaseReadThroughStore,
  sharedVrdbLookup,
} from "../../services/vendorResearch/vrdb/lookup";
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
  vrdb: true,
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
    expect(outcome.coverage.map((entry) => [entry.id, entry.outcome])).toEqual([
      ["kev", "found"],
      ["nvd", "not_researched"],
      ["ofac", "failed"],
      ["uk_sanctions", "found"],
      ["eu_fsf", "failed"],
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
