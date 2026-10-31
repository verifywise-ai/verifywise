jest.setTimeout(60000);

/**
 * The status job of the vendor risk database against the real tables of the test database (spec
 * D5.7 cases 10 and 11, Ruling 12 of the M2 plan): a list's copy changes a record's status, and the
 * job relabels the pending findings of every organization whose vendor matched the record, each in
 * its own organization, and leaves every finding a person decided as it was.
 */

// First, and not to be reordered: ./setup registers the mocks of BullMQ and Redis.
import "./setup";
import { QueryTypes } from "sequelize";
import { cleanupDatabase, createTestOrganization } from "./helpers";
import { sequelize } from "../../database/db";
import { createTestVendor } from "../factories";
import type {
  CredibilityBasis,
  FindingSource,
  NewFinding,
} from "../../domain.layer/interfaces/i.vendorResearch";
import {
  type RelabelStore,
  databaseRelabelStore,
  relabelSource,
} from "../../services/vendorResearch/vrdb/relabel";
import { activeReadThroughs, vrdbSourceOf } from "../../services/vendorResearch/vrdb/sources";
import type { ParsedRecord } from "../../services/vendorResearch/vrdb/types";
import { createRunQuery, insertFindingsQuery } from "../../utils/vendorResearch.utils";
import {
  applyVrdbDeltaQuery,
  applyVrdbSnapshotQuery,
  recordVendorVrdbMatchesQuery,
  saveReadThroughAnswerQuery,
  upsertVrdbSourceQuery,
} from "../../utils/vrdb.utils";

afterEach(async () => {
  await cleanupDatabase();
});

afterAll(async () => {
  await sequelize.close();
});

const SYNCED_AT = new Date("2026-10-30T06:41:00Z");
const DELISTED_AT = new Date("2026-10-31T06:41:00Z");
const DOMAIN_KEY = "domain:acme-analytics.example";

const entity = (id: string, keys: string[]): ParsedRecord => ({
  sourceRecordId: id,
  recordType: "sanctions_entity",
  title: `OFAC SDN entity ${id}`,
  summary: `OFAC Specially Designated Nationals list (treasury.gov). Entry: "Entity ${id}" (entity).`,
  url: `https://sanctionssearch.ofac.treas.gov/Details.aspx?id=${id}`,
  identifiers: { uid: id },
  matchKeys: keys,
  publishedAt: null,
  sourceUpdatedAt: null,
});

const vulnerability = (cve: string, keys: string[]): ParsedRecord => ({
  sourceRecordId: cve,
  recordType: "vulnerability",
  title: `${cve}: Acme Gateway flaw`,
  summary: `CISA Known Exploited Vulnerabilities Catalog (cisa.gov). CVE: ${cve}.`,
  url: `https://nvd.nist.gov/vuln/detail/${cve}`,
  identifiers: { cveID: cve },
  matchKeys: keys,
  publishedAt: "2026-09-01",
  sourceUpdatedAt: null,
});

const KEV_AT = new Date("2026-10-29T06:41:00Z");

/** The KEV copy at `at`, holding CVE-2026-0001 unless told otherwise. */
async function seedKev(
  at: Date,
  records: ParsedRecord[] = [vulnerability("CVE-2026-0001", ["kev:acmeanalytics"])],
): Promise<void> {
  await upsertVrdbSourceQuery(vrdbSourceOf("kev"), at);
  await applyVrdbSnapshotQuery({
    sourceId: "kev",
    records,
    missingStatus: "withdrawn",
    rawSnapshotHash: at.getTime().toString(16).padStart(64, "0"),
    sourceVersion: at.toISOString().slice(0, 10),
    etag: null,
    lastModified: null,
    at,
  });
}

const rejectedCve = (cve: string, keys: string[]): ParsedRecord => ({
  ...vulnerability(cve, keys),
  title: `${cve}: rejected`,
  summary: `CVE Program (cve.org). CVE: ${cve}. Rejected: 2026-10-30.`,
});

/** The NVD's answer to the vendor's key `cpe:acme` at `at`: the CVE, with its status. */
function answerNvd(cve: string, status: "active" | "rejected", at: Date) {
  const nvd = activeReadThroughs().find((source) => source.id === "nvd");
  if (nvd === undefined) throw new Error("the NVD is a read-through source");
  return saveReadThroughAnswerQuery({
    definition: nvd,
    key: "cpe:acme",
    records: [{ ...vulnerability(cve, ["cpe:acme"]), status }],
    outcome: "ok",
    at,
    expiresAt: new Date(at.getTime() + 6 * 3_600_000),
  });
}

/** The OFAC copy at `at`, holding the entities given. */
async function syncOfac(records: ParsedRecord[], at: Date): Promise<void> {
  await upsertVrdbSourceQuery(vrdbSourceOf("ofac"), at);
  await applyVrdbSnapshotQuery({
    sourceId: "ofac",
    records,
    missingStatus: "delisted",
    rawSnapshotHash: at.getTime().toString(16).padStart(64, "0"),
    sourceVersion: at.toISOString().slice(0, 10),
    etag: null,
    lastModified: null,
    at,
  });
}

const recordIdOf = async (sourceId: string, sourceRecordId: string): Promise<number> => {
  const rows = (await sequelize.query(
    `SELECT id FROM vrdb_records WHERE source_id = :sourceId AND source_record_id = :sourceRecordId`,
    { replacements: { sourceId, sourceRecordId }, type: QueryTypes.SELECT },
  )) as Array<{ id: string | number }>;
  return Number(rows[0].id);
};

/** A finding that cites one record, labelled High by it, as a run under the VRDB flag stores it. */
function citing(
  source: "ofac" | "kev" | "nvd",
  recordId: number,
  sourceRecordId: string,
): NewFinding {
  const url =
    source === "ofac"
      ? `https://sanctionssearch.ofac.treas.gov/Details.aspx?id=${sourceRecordId}`
      : `https://nvd.nist.gov/vuln/detail/${sourceRecordId}`;
  const basis: CredibilityBasis = {
    rule: "official_record",
    registry_version: "sr-4",
    name_only: false,
    sources: [
      {
        url,
        category: "official",
        publisher: source,
        entry: null,
        reviewed: true,
        reading: "read",
        record: {
          source,
          match: "strong",
          status: "active",
          source_record_id: sourceRecordId,
          as_of: "2026-10-30",
        },
      },
    ],
  };
  const cited: FindingSource = {
    url,
    title: "The record",
    quote: "Entry",
    published_at: null,
    category: "official",
    publisher: source,
    record: { source_id: source, record_id: recordId, status: "active", match_strength: "strong" },
  };
  return {
    category: source === "ofac" ? "legal_regulatory" : "security_incidents",
    risk_description: `The vendor appears in ${source}.`,
    impact_description: "Doing business with the vendor may be restricted.",
    action_plan: "Check the entry with the vendor.",
    likelihood: "Possible",
    risk_severity: "Major",
    risk_level: "High Risk",
    confidence: "high",
    credibility: "high",
    credibility_basis: basis,
    rationale: "The record names the vendor.",
    sources: [cited],
  };
}

/** A vendor of the organization that matched the records, and its run's findings, all pending. */
async function seedVendor(
  organizationName: string,
  matched: Array<{ recordId: number; key: string }>,
  findings: NewFinding[],
): Promise<{ organizationId: number; findingIds: number[] }> {
  const organizationId = await createTestOrganization(organizationName);
  const vendorId = await createTestVendor(organizationId, { vendor_name: "Acme Analytics" });
  await recordVendorVrdbMatchesQuery(
    organizationId,
    vendorId,
    matched.map(({ recordId, key }) => ({
      recordId,
      method: "domain",
      strength: "strong",
      matchedKey: key,
    })),
    SYNCED_AT,
  );
  const run = await createRunQuery({
    organizationId,
    vendorId,
    triggerType: "auto",
    requestedBy: null,
  });
  const inserted = await sequelize.transaction((transaction) =>
    insertFindingsQuery({ organizationId, vendorId, runId: run.id, findings }, transaction),
  );
  return { organizationId, findingIds: inserted.map((finding) => finding.id) };
}

interface StoredFinding {
  organization_id: number;
  id: number;
  status: string;
  credibility: string;
  credibility_basis: CredibilityBasis;
  sources: FindingSource[];
}

const findingsOf = async (): Promise<StoredFinding[]> =>
  (await sequelize.query(
    `SELECT organization_id, id, status, credibility, credibility_basis, sources
     FROM vendor_risk_findings ORDER BY id`,
    { type: QueryTypes.SELECT },
  )) as StoredFinding[];

/** Two organizations whose vendor matched the OFAC entity 36001, and one finding each citing it. */
async function seedDelisting() {
  await syncOfac([entity("36001", [DOMAIN_KEY]), entity("36002", ["name:otherco"])], SYNCED_AT);
  const listed = await recordIdOf("ofac", "36001");
  const other = await recordIdOf("ofac", "36002");
  const first = await seedVendor(
    "Relabel org A",
    [
      { recordId: listed, key: DOMAIN_KEY },
      { recordId: other, key: "name:otherco" },
    ],
    [citing("ofac", listed, "36001"), citing("ofac", other, "36002")],
  );
  const second = await seedVendor(
    "Relabel org B",
    [{ recordId: listed, key: DOMAIN_KEY }],
    [citing("ofac", listed, "36001")],
  );
  // The next day's list no longer holds 36001: it is delisted on that day.
  await syncOfac([entity("36002", ["name:otherco"])], DELISTED_AT);
  return { listed, other, first, second };
}

describe("the status job, in the database", () => {
  it("relabels the pending findings of each organization that cite the record", async () => {
    const { first, second } = await seedDelisting();

    await expect(relabelSource("ofac")).resolves.toEqual({ relabeled: 2 });

    const stored = await findingsOf();
    const relabeled = stored.filter((finding) =>
      [first.findingIds[0], second.findingIds[0]].includes(finding.id),
    );
    expect(relabeled.map((finding) => finding.organization_id)).toEqual([
      first.organizationId,
      second.organizationId,
    ]);
    for (const finding of relabeled) {
      expect(finding.credibility).toBe("low");
      expect(finding.credibility_basis.rule).toBe("inactive");
      expect(finding.credibility_basis.sources[0].record).toEqual({
        source: "ofac",
        match: "strong",
        status: "delisted",
        source_record_id: "36001",
        as_of: "2026-10-31",
      });
      expect(finding.sources[0].record?.status).toBe("delisted");
    }
    // The finding that cites the entity still on the list keeps its label.
    const untouched = stored.find((finding) => finding.id === first.findingIds[1]);
    expect(untouched?.credibility).toBe("high");
    expect(untouched?.sources[0].record?.status).toBe("active");
  });

  it("leaves accepted and dismissed findings, and a finding without a label", async () => {
    const { listed, first } = await seedDelisting();
    const decided = await seedVendor(
      "Relabel org C",
      [{ recordId: listed, key: DOMAIN_KEY }],
      [
        citing("ofac", listed, "36001"),
        citing("ofac", listed, "36001"),
        // A finding of a run without the VRDB flag has no label to decide again.
        { ...citing("ofac", listed, "36001"), credibility: null, credibility_basis: null },
      ],
    );
    await sequelize.query(
      `UPDATE vendor_risk_findings SET status = 'accepted', decided_at = NOW()
       WHERE organization_id = :organizationId AND id = :id`,
      { replacements: { organizationId: decided.organizationId, id: decided.findingIds[0] } },
    );
    await sequelize.query(
      `UPDATE vendor_risk_findings SET status = 'dismissed', dismissed_reason = 'other', decided_at = NOW()
       WHERE organization_id = :organizationId AND id = :id`,
      { replacements: { organizationId: decided.organizationId, id: decided.findingIds[1] } },
    );

    await expect(relabelSource("ofac")).resolves.toEqual({ relabeled: 2 });

    const stored = await findingsOf();
    for (const id of decided.findingIds.slice(0, 2)) {
      const finding = stored.find((row) => row.id === id);
      expect(finding?.credibility).toBe("high");
      expect(finding?.credibility_basis.rule).toBe("official_record");
      expect(finding?.sources[0].record?.status).toBe("active");
    }
    const unlabeled = stored.find((row) => row.id === decided.findingIds[2]);
    expect(unlabeled).toMatchObject({ status: "pending", credibility: null });
    expect(unlabeled?.sources[0].record?.status).toBe("active");
    expect(stored.find((row) => row.id === first.findingIds[0])?.credibility).toBe("low");
    // None of them is a finding the job has left to relabel.
    await expect(databaseRelabelStore.findFindingsToRelabel("ofac")).resolves.toEqual([]);
  });

  it("a write does not undo what another job wrote since its read", async () => {
    const { first } = await seedDelisting();
    const read = await databaseRelabelStore.findFindingsToRelabel("ofac");
    const stale = read.find((finding) => finding.id === first.findingIds[0]);
    if (stale === undefined) throw new Error("the job reads the finding of A");
    await relabelSource("ofac");

    await expect(
      databaseRelabelStore.updateFindingCredibility(first.organizationId, stale.id, {
        label: "high",
        // The job read it, so it is a basis the rule decided (relabel.ts skips any other).
        basis: stale.credibility_basis as CredibilityBasis,
        sources: stale.sources,
        previousBasis: stale.credibility_basis,
      }),
    ).resolves.toBe(false);

    const kept = (await findingsOf()).find((row) => row.id === stale.id);
    expect(kept?.credibility).toBe("low");
    expect(kept?.credibility_basis.rule).toBe("inactive");
  });

  it("a finding decided after the read is not relabeled", async () => {
    const { first, second } = await seedDelisting();
    // A person dismisses the finding of B while the job holds what it read.
    const store: RelabelStore = {
      async findFindingsToRelabel(sourceId) {
        const found = await databaseRelabelStore.findFindingsToRelabel(sourceId);
        await sequelize.query(
          `UPDATE vendor_risk_findings SET status = 'dismissed', dismissed_reason = 'other', decided_at = NOW()
           WHERE organization_id = :organizationId AND id = :id AND status = 'pending'`,
          { replacements: { organizationId: second.organizationId, id: second.findingIds[0] } },
        );
        return found;
      },
      updateFindingCredibility: databaseRelabelStore.updateFindingCredibility,
    };

    await expect(relabelSource("ofac", store)).resolves.toEqual({ relabeled: 1 });

    const stored = await findingsOf();
    const kept = stored.find((row) => row.id === second.findingIds[0]);
    expect(kept).toMatchObject({ status: "dismissed", credibility: "high" });
    expect(kept?.credibility_basis.rule).toBe("official_record");
    expect(stored.find((row) => row.id === first.findingIds[0])?.credibility).toBe("low");
  });

  it("a second run changes nothing", async () => {
    await seedDelisting();
    await relabelSource("ofac");
    const once = await findingsOf();

    await expect(relabelSource("ofac")).resolves.toEqual({ relabeled: 0 });
    await expect(databaseRelabelStore.findFindingsToRelabel("ofac")).resolves.toEqual([]);
    expect(await findingsOf()).toEqual(once);
  });

  it("a record back on its list restores the label, dated the day it came back", async () => {
    const { first } = await seedDelisting();
    await relabelSource("ofac");
    const back = new Date("2026-11-02T06:41:00Z");
    await syncOfac([entity("36001", [DOMAIN_KEY]), entity("36002", ["name:otherco"])], back);

    await expect(relabelSource("ofac")).resolves.toEqual({ relabeled: 2 });

    const restored = (await findingsOf()).find((row) => row.id === first.findingIds[0]);
    expect(restored?.credibility).toBe("high");
    expect(restored?.credibility_basis.rule).toBe("official_record");
    expect(restored?.credibility_basis.sources[0].record).toMatchObject({
      status: "active",
      as_of: "2026-11-02",
    });
  });

  it("a CVE another list rejected makes the cited record of its CVE rejected, by the first list that did (Ruling 9)", async () => {
    await seedKev(KEV_AT);
    const kevRecord = await recordIdOf("kev", "CVE-2026-0001");
    const { organizationId, findingIds } = await seedVendor(
      "Relabel org D",
      [{ recordId: kevRecord, key: "kev:acmeanalytics" }],
      [citing("kev", kevRecord, "CVE-2026-0001")],
    );
    // The CVE Program rejects the CVE on 30 October, and the NVD answers the vendor's key with it
    // rejected on the 31st: records of their own, never matched by the vendor.
    await upsertVrdbSourceQuery(vrdbSourceOf("cve"), SYNCED_AT);
    await applyVrdbDeltaQuery({
      sourceId: "cve",
      records: [{ ...rejectedCve("CVE-2026-0001", []), status: "rejected" }],
      cursor: { day: "2026-10-29" },
      rawSnapshotHash: "d".repeat(64),
      at: SYNCED_AT,
    });
    await expect(answerNvd("CVE-2026-0001", "rejected", DELISTED_AT)).resolves.toEqual({
      statusChanged: 1,
    });

    await expect(relabelSource("nvd")).resolves.toEqual({ relabeled: 1 });

    const [finding] = (await findingsOf()).filter(
      (row) => row.organization_id === organizationId && row.id === findingIds[0],
    );
    expect(finding.credibility).toBe("low");
    expect(finding.credibility_basis.rule).toBe("inactive");
    expect(finding.credibility_basis.sources[0].record).toEqual({
      source: "kev",
      match: "strong",
      status: "rejected",
      source_record_id: "CVE-2026-0001",
      as_of: "2026-10-30",
      rejected_by: "cve",
    });
    expect(finding.sources[0].record).toEqual({
      source_id: "kev",
      record_id: kevRecord,
      status: "rejected",
      match_strength: "strong",
    });
  });

  it("a record its own list rejected is rejected by that list", async () => {
    await expect(answerNvd("CVE-2026-0002", "active", SYNCED_AT)).resolves.toEqual({
      statusChanged: 0,
    });
    const nvdRecord = await recordIdOf("nvd", "CVE-2026-0002");
    const { findingIds } = await seedVendor(
      "Relabel org E",
      [{ recordId: nvdRecord, key: "cpe:acme" }],
      [citing("nvd", nvdRecord, "CVE-2026-0002")],
    );
    await expect(answerNvd("CVE-2026-0002", "rejected", DELISTED_AT)).resolves.toEqual({
      statusChanged: 1,
    });

    await expect(relabelSource("nvd")).resolves.toEqual({ relabeled: 1 });

    const finding = (await findingsOf()).find((row) => row.id === findingIds[0]);
    expect(finding?.credibility_basis.sources[0].record).toEqual({
      source: "nvd",
      match: "strong",
      status: "rejected",
      source_record_id: "CVE-2026-0002",
      as_of: "2026-10-31",
    });
  });

  it("the job of a list also relabels what another list changed for the vendors that matched it", async () => {
    // A's vendor matched an OFAC entity and a KEV entry; both leave their lists, and only the
    // status job of OFAC has run yet.
    await seedKev(KEV_AT);
    await syncOfac([entity("36001", [DOMAIN_KEY])], SYNCED_AT);
    const kevRecord = await recordIdOf("kev", "CVE-2026-0001");
    const listed = await recordIdOf("ofac", "36001");
    const { findingIds } = await seedVendor(
      "Relabel org F",
      [
        { recordId: listed, key: DOMAIN_KEY },
        { recordId: kevRecord, key: "kev:acmeanalytics" },
      ],
      [citing("ofac", listed, "36001"), citing("kev", kevRecord, "CVE-2026-0001")],
    );
    await seedKev(DELISTED_AT, []);
    await syncOfac([], DELISTED_AT);

    await expect(relabelSource("ofac")).resolves.toEqual({ relabeled: 2 });

    const stored = await findingsOf();
    expect(
      stored.find((row) => row.id === findingIds[1])?.credibility_basis.sources[0].record,
    ).toMatchObject({ source: "kev", status: "withdrawn", as_of: "2026-10-31" });
  });
});
