/**
 * The status job (spec D5.7 cases 10 and 11, Ruling 12 of the M2 plan): a pending finding that
 * cites a record whose status changed gets the label its sources earn now, and the record shows its
 * status and the day it changed. `relabelFinding` is pure; `relabelSource` reads a store and
 * writes each finding it relabels in its own organization.
 */
jest.mock("../../../../utils/vrdb.utils", () => ({}));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import type {
  CredibilityBasis,
  CredibilitySource,
  FindingSource,
  RecordSourceId,
  RecordStatus,
  StoredCredibilityBasis,
} from "../../../../domain.layer/interfaces/i.vendorResearch";
import { credibilityRationale } from "../../credibilityText";
import {
  type FindingToRelabel,
  type RecordStatusChange,
  type RelabelStore,
  relabelFinding,
  relabelSource,
} from "../relabel";

const OFAC_URL = "https://sanctionssearch.ofac.treas.gov/Details.aspx?id=36001";
const NVD_URL = "https://nvd.nist.gov/vuln/detail/CVE-2026-31337";
const REUTERS = "https://www.reuters.com/world/acme-designated";
const BBC = "https://www.bbc.co.uk/news/acme-designated";
const NEWS_RESULT = "https://localnews.example/acme";

/** A record as the basis describes it: matched, read, from the copy of 20 October. */
const describedRecord = (
  url: string,
  source: RecordSourceId,
  options: {
    match?: "strong" | "weak";
    status?: RecordStatus;
    id?: string;
    stale?: true;
    rejectedBy?: RecordSourceId;
  } = {},
): CredibilitySource => ({
  url,
  category: "official",
  publisher: source,
  entry: null,
  reviewed: true,
  reading: "read",
  record: {
    source,
    match: options.match ?? "strong",
    status: options.status ?? "active",
    source_record_id: options.id ?? "36001",
    as_of: "2026-10-20",
    ...(options.stale ? { stale: true as const } : {}),
    ...(options.rejectedBy === undefined ? {} : { rejected_by: options.rejectedBy }),
  },
});

const describedPress = (url: string, entry: string, name: string): CredibilitySource => ({
  url,
  category: "trusted_press",
  publisher: entry,
  publisher_name: name,
  entry,
  reviewed: true,
  reading: "read",
});

/** A cited source as the finding stores it, with its row in the vendor risk database. */
const citedRecord = (
  url: string,
  source: RecordSourceId,
  recordId: number | null,
  status: RecordStatus = "active",
  match: "strong" | "weak" = "strong",
): FindingSource => ({
  url,
  title: "",
  quote: "q",
  published_at: null,
  category: "official",
  publisher: source,
  record: { source_id: source, record_id: recordId, status, match_strength: match },
});

const citedPage = (url: string, publisher: string): FindingSource => ({
  url,
  title: "",
  quote: "q",
  published_at: null,
  category: "trusted_press",
  publisher,
});

const basisOf = (
  rule: CredibilityBasis["rule"],
  sources: CredibilitySource[],
  nameOnly = false,
): CredibilityBasis => ({ rule, registry_version: "sr-3", name_only: nameOnly, sources });

const statuses = (
  entries: Array<[number, RecordStatusChange]>,
): ReadonlyMap<number, RecordStatusChange> => new Map(entries);

describe("relabelFinding", () => {
  it("a delisted record makes a finding Low, dated the day it left", () => {
    const relabeled = relabelFinding({
      basis: basisOf("official_record", [describedRecord(OFAC_URL, "ofac", { stale: true })]),
      sources: [citedRecord(OFAC_URL, "ofac", 101)],
      statuses: statuses([[101, { status: "delisted", changedOn: "2026-10-31" }]]),
    });

    expect(relabeled).toEqual({
      label: "low",
      basis: basisOf("inactive", [
        {
          ...describedRecord(OFAC_URL, "ofac"),
          record: {
            source: "ofac",
            match: "strong",
            status: "delisted",
            source_record_id: "36001",
            as_of: "2026-10-31",
          },
        },
      ]),
      sources: [citedRecord(OFAC_URL, "ofac", 101, "delisted")],
    });
    // D5.7 case 11: the line names the list and the day the entry left it.
    expect(credibilityRationale(relabeled!.basis)).toBe(
      "Low: OFAC Specially Designated Nationals list removed the record on 31 Oct 2026.",
    );
  });

  it("a rejected CVE does", () => {
    const rejected = relabelFinding({
      basis: basisOf("official_record", [
        describedRecord(NVD_URL, "nvd", { id: "CVE-2026-31337" }),
      ]),
      sources: [citedRecord(NVD_URL, "nvd", 201)],
      statuses: statuses([[201, { status: "rejected", changedOn: "2026-10-31" }]]),
    });

    expect(rejected).toMatchObject({
      label: "low",
      basis: { rule: "inactive" },
      sources: [{ record: { status: "rejected" } }],
    });
    expect(credibilityRationale(rejected!.basis)).toBe(
      "Low: the National Vulnerability Database rejected the record on 31 Oct 2026.",
    );

    // D5.7 case 10, with Ruling 9 of the M2 plan: the CVE Program rejected the CVE of a KEV entry,
    // so the entry is rejected, and the line names who rejected it.
    const kev = relabelFinding({
      basis: basisOf("official_record", [
        describedRecord(NVD_URL, "kev", { id: "CVE-2026-31337" }),
      ]),
      sources: [citedRecord(NVD_URL, "kev", 301)],
      statuses: statuses([
        [301, { status: "rejected", changedOn: "2026-10-31", rejectedBy: "cve" }],
      ]),
    });

    expect(kev?.basis.sources[0].record).toEqual({
      source: "kev",
      match: "strong",
      status: "rejected",
      source_record_id: "CVE-2026-31337",
      as_of: "2026-10-31",
      rejected_by: "cve",
    });
    expect(kev?.sources[0].record).toEqual({
      source_id: "kev",
      record_id: 301,
      status: "rejected",
      match_strength: "strong",
    });
    expect(credibilityRationale(kev!.basis)).toBe(
      "Low: the CVE Program rejected the record on 31 Oct 2026.",
    );
  });

  it("a record back on its list restores the label", () => {
    const restored = relabelFinding({
      basis: basisOf("inactive", [describedRecord(OFAC_URL, "ofac", { status: "delisted" })]),
      sources: [citedRecord(OFAC_URL, "ofac", 101, "delisted")],
      statuses: statuses([[101, { status: "active", changedOn: "2026-11-02" }]]),
    });

    expect(restored).toEqual({
      label: "high",
      basis: basisOf("official_record", [
        {
          ...describedRecord(OFAC_URL, "ofac"),
          record: {
            source: "ofac",
            match: "strong",
            status: "active",
            source_record_id: "36001",
            as_of: "2026-11-02",
          },
        },
      ]),
      sources: [citedRecord(OFAC_URL, "ofac", 101)],
    });

    // A CVE another list no longer rejects is no one's rejection.
    const unrejected = relabelFinding({
      basis: basisOf("inactive", [
        describedRecord(NVD_URL, "kev", { status: "rejected", rejectedBy: "cve" }),
      ]),
      sources: [citedRecord(NVD_URL, "kev", 301, "rejected")],
      statuses: statuses([[301, { status: "active", changedOn: "2026-11-03" }]]),
    });

    expect(unrejected?.label).toBe("high");
    expect(unrejected?.basis.sources[0].record).not.toHaveProperty("rejected_by");
  });

  it("two trusted publishers keep it High", () => {
    const relabeled = relabelFinding({
      basis: basisOf(
        "trusted_press_two",
        [
          describedRecord(OFAC_URL, "ofac", { match: "weak" }),
          describedPress(REUTERS, "reuters", "Reuters"),
          describedPress(BBC, "bbc", "BBC"),
        ],
        true,
      ),
      sources: [
        citedRecord(OFAC_URL, "ofac", 101, "active", "weak"),
        citedPage(REUTERS, "reuters"),
        citedPage(BBC, "bbc"),
      ],
      statuses: statuses([[101, { status: "delisted", changedOn: "2026-10-31" }]]),
    });

    expect(relabeled).toMatchObject({
      label: "high",
      basis: { rule: "trusted_press_two", name_only: true },
      sources: [{ record: { status: "delisted" } }, { url: REUTERS }, { url: BBC }],
    });
    expect(relabeled?.basis.sources[0].record).toMatchObject({
      status: "delisted",
      as_of: "2026-10-31",
    });
  });

  it("a contradicted finding stays Low", () => {
    const relabeled = relabelFinding({
      basis: basisOf("contradicted", [
        describedRecord(NVD_URL, "kev", { id: "CVE-2026-31337" }),
        { ...describedPress(NEWS_RESULT, "localnews.example", "Local"), reading: "contradicted" },
      ]),
      sources: [citedRecord(NVD_URL, "kev", 301), citedPage(NEWS_RESULT, "localnews.example")],
      statuses: statuses([[301, { status: "withdrawn", changedOn: "2026-10-31" }]]),
    });

    expect(relabeled).toMatchObject({
      label: "low",
      basis: { rule: "contradicted" },
      sources: [{ record: { status: "withdrawn" } }, { url: NEWS_RESULT }],
    });

    // The record coming back does not lift it either.
    const back = relabelFinding({
      basis: relabeled!.basis,
      sources: relabeled!.sources,
      statuses: statuses([[301, { status: "active", changedOn: "2026-11-02" }]]),
    });
    expect(back).toMatchObject({ label: "low", basis: { rule: "contradicted" } });
  });

  it("a finding whose records did not change is left alone", () => {
    const basis = basisOf("official_record", [describedRecord(OFAC_URL, "ofac")]);
    const sources = [citedRecord(OFAC_URL, "ofac", 101)];

    // The same status, a status of a record it does not cite, and none at all.
    expect(
      relabelFinding({
        basis,
        sources,
        statuses: statuses([[101, { status: "active", changedOn: "2026-10-31" }]]),
      }),
    ).toBeNull();
    expect(
      relabelFinding({
        basis,
        sources,
        statuses: statuses([[999, { status: "delisted", changedOn: "2026-10-31" }]]),
      }),
    ).toBeNull();
    expect(relabelFinding({ basis, sources, statuses: statuses([]) })).toBeNull();

    // A record looked up on the web has no row, so no status of the copy is its.
    expect(
      relabelFinding({
        basis: basisOf("official_record", [describedRecord(NVD_URL, "nvd")]),
        sources: [citedRecord(NVD_URL, "nvd", null)],
        statuses: statuses([[0, { status: "rejected", changedOn: "2026-10-31" }]]),
      }),
    ).toBeNull();

    // A basis that does not describe the finding's sources is not one the job can recompute.
    expect(
      relabelFinding({
        basis: { ...basis, sources: "none" as unknown as CredibilitySource[] },
        sources,
        statuses: statuses([[101, { status: "delisted", changedOn: "2026-10-31" }]]),
      }),
    ).toBeNull();
  });

  it("changes only the sources the basis describes at the same place", () => {
    const UK_URL = "https://www.gov.uk/government/publications/the-uk-sanctions-list?uid=RUS0001";
    const relabeled = relabelFinding({
      // The basis was written for other sources: its first is another record, at another address.
      basis: basisOf("official_record", [
        describedRecord(UK_URL, "uk_sanctions", { id: "RUS0001" }),
        describedPress(BBC, "bbc", "BBC"),
      ]),
      sources: [citedRecord(OFAC_URL, "ofac", 101), citedPage(BBC, "bbc")],
      statuses: statuses([[101, { status: "delisted", changedOn: "2026-10-31" }]]),
    });

    expect(relabeled).toMatchObject({
      label: "high",
      basis: { rule: "official_record" },
      sources: [{ record: { status: "delisted" } }, { url: BBC }],
    });
    expect(relabeled?.basis.sources[0].record).toMatchObject({
      source: "uk_sanctions",
      status: "active",
      as_of: "2026-10-20",
    });
  });
});

describe("a basis of the backfill (M3 Ruling 8)", () => {
  it("a backfilled or legacy finding is never relabeled", () => {
    // Its sources came from the per-run lookups, with no record of the vendor risk database to
    // follow; even a record the job knows changes nothing.
    const sources = [citedRecord(OFAC_URL, "ofac", 101, "active", "weak")];
    const changed = statuses([[101, { status: "delisted", changedOn: "2026-10-31" }]]);
    const backfilled = {
      ...basisOf("name_only", [describedRecord(OFAC_URL, "ofac", { match: "weak" })], true),
      rule: "backfill_name_only" as const,
    };

    expect(relabelFinding({ basis: backfilled, sources, statuses: changed })).toBeNull();
    expect(
      relabelFinding({ basis: { rule: "legacy_confidence" }, sources, statuses: changed }),
    ).toBeNull();
    // The same finding under the rule itself is relabeled.
    expect(
      relabelFinding({ basis: { ...backfilled, rule: "name_only" }, sources, statuses: changed }),
    ).not.toBeNull();
  });
});

describe("relabelSource", () => {
  const finding = (organizationId: number, id: number): FindingToRelabel => ({
    organization_id: organizationId,
    id,
    credibility_basis: basisOf("official_record", [describedRecord(OFAC_URL, "ofac")]),
    sources: [citedRecord(OFAC_URL, "ofac", 101)],
    statuses: statuses([[101, { status: "delisted", changedOn: "2026-10-31" }]]),
  });

  const storeOf = (
    found: FindingToRelabel[][],
    written: (organizationId: number, findingId: number) => boolean = () => true,
  ) => {
    const reads: string[] = [];
    const writes: Array<[number, number, string, StoredCredibilityBasis]> = [];
    const store: RelabelStore = {
      async findFindingsToRelabel(sourceId) {
        reads.push(sourceId);
        return found[reads.length - 1] ?? [];
      },
      async updateFindingCredibility(organizationId, findingId, update) {
        writes.push([organizationId, findingId, update.label, update.previousBasis]);
        return written(organizationId, findingId);
      },
    };
    return { store, reads, writes };
  };

  it("relabels each finding the store found, in its own organization", async () => {
    const { store, reads, writes } = storeOf([[finding(1, 11), finding(2, 21)]]);

    await expect(relabelSource("ofac", store)).resolves.toEqual({ relabeled: 2 });

    expect(reads).toEqual(["ofac"]);
    expect(writes).toEqual([
      [1, 11, "low", finding(1, 11).credibility_basis],
      [2, 21, "low", finding(2, 21).credibility_basis],
    ]);
  });

  it("writes nothing for a finding whose records did not change", async () => {
    const unchanged = {
      ...finding(1, 11),
      statuses: statuses([[101, { status: "active", changedOn: "2026-10-31" }]]),
    };
    const { store, writes } = storeOf([[unchanged]]);

    await expect(relabelSource("ofac", store)).resolves.toEqual({ relabeled: 0 });
    expect(writes).toEqual([]);
  });

  it("reads the findings again after a write that was skipped, three times at most", async () => {
    // The first write is skipped (a person decided the finding, or another job relabeled it); the
    // second read no longer finds it.
    const once = storeOf([[finding(1, 11)], []], () => false);
    await expect(relabelSource("ofac", once.store)).resolves.toEqual({ relabeled: 0 });
    expect(once.reads).toEqual(["ofac", "ofac"]);

    const always = storeOf(
      [[finding(1, 11)], [finding(1, 11)], [finding(1, 11)], [finding(1, 11)]],
      () => false,
    );
    await expect(relabelSource("ofac", always.store)).resolves.toEqual({ relabeled: 0 });
    expect(always.reads).toHaveLength(3);
  });
});
