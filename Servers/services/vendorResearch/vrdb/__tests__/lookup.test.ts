/**
 * The run-time lookup of the vendor risk database (spec D4.8): which stored records a run is
 * offered, in which order and with which text, the coverage of every list, and the match rows it
 * keeps for the vendor. `offerRecords` is pure; `createVrdbLookup` reads a store and never throws.
 */
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
const mockSaveAnswer = jest.fn();
const mockEnqueueRelabel = jest.fn();
// The queries of the lookup of the database (`databaseLookupStore`): a test of `sharedVrdbLookup`
// sees whether the lookup read the stored lists or was off.
const mockSourceStates = jest.fn();
const mockFindRecords = jest.fn();
const mockRecordMatches = jest.fn();
jest.mock("../../../../utils/vrdb.utils", () => ({
  saveReadThroughAnswerQuery: (...args: unknown[]) => mockSaveAnswer(...args),
  getVrdbSourceStatesQuery: (...args: unknown[]) => mockSourceStates(...args),
  findVrdbRecordsByKeysQuery: (...args: unknown[]) => mockFindRecords(...args),
  recordVendorVrdbMatchesQuery: (...args: unknown[]) => mockRecordMatches(...args),
}));
jest.mock("../queue", () => ({
  enqueueRelabel: (...args: unknown[]) => mockEnqueueRelabel(...args),
}));

import type { ResearchCategory } from "../../../../domain.layer/interfaces/i.vendorResearch";
import type { VendorResearchConfig } from "../../config";
import { NAME_ONLY_LOOKUP_NOTE } from "../../records/ofac";
import type { ResearchTarget } from "../../target";
import type { ReadThroughConnector } from "../connectors/types";
import logger from "../../../../utils/logger/fileLogger";
import {
  type LookupStore,
  createVrdbLookup,
  databaseReadThroughStore,
  offerRecords,
  sharedVrdbLookup,
} from "../lookup";
import type { ReadThroughDeps } from "../readThrough";
import { type ReadThroughSource, activeReadThroughs } from "../sources";
import type { ReadThroughAnswer, ReadThroughOutcome, VrdbRow, VrdbSourceState } from "../types";

const NOW = new Date("2026-10-30T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * HOUR_MS);

const ACME: ResearchTarget = {
  name: "Acme Analytics",
  domain: "acme-analytics.example",
  provides: "Analytics software",
};
const BOTH: readonly ResearchCategory[] = ["security_incidents", "legal_regulatory"];

let nextId = 1;
const row = (overrides: Partial<VrdbRow> & Pick<VrdbRow, "sourceId">): VrdbRow => {
  const id = nextId++;
  return {
    id,
    sourceRecordId: `R${id}`,
    recordType: overrides.sourceId === "kev" ? "vulnerability" : "sanctions_entity",
    status: "active",
    title: `Record ${id}`,
    summary: `The text of record ${id}.`,
    url: `https://list.example/?uid=R${id}`,
    matchKeys: overrides.sourceId === "kev" ? ["kev:acmeanalytics"] : ["name:acmeanalytics"],
    publishedAt: "2026-10-01",
    ...overrides,
  };
};
const kevRow = (cve: string, day: string, overrides: Partial<VrdbRow> = {}) =>
  row({ sourceId: "kev", sourceRecordId: cve, publishedAt: day, ...overrides });

const state = (
  id: VrdbSourceState["id"],
  lastSuccessAt: Date | null,
  overrides: Partial<VrdbSourceState> = {},
): VrdbSourceState => ({
  id,
  lastSuccessAt,
  lastOutcome: lastSuccessAt === null ? "never" : "ok",
  sourceVersion: null,
  etag: null,
  lastModified: null,
  activeRecords: 10,
  ...overrides,
});
const ALL_SYNCED = [
  state("kev", hoursAgo(1)),
  state("ofac", hoursAgo(3)),
  state("uk_sanctions", hoursAgo(2)),
  state("eu_fsf", hoursAgo(4)),
];

const offer = (rows: VrdbRow[], overrides: Partial<Parameters<typeof offerRecords>[0]> = {}) =>
  offerRecords({
    rows,
    states: ALL_SYNCED,
    target: ACME,
    researchable: BOTH,
    now: NOW,
    enabled: true,
    // The website check read the vendor's home page and found its name there.
    verifiedDomains: [ACME.domain as string],
    readThrough: new Map(),
    ...overrides,
  });

const recordsOf = (result: ReturnType<typeof offer>, source: string) =>
  result.outcome.records.find((entry) => entry.source === source)?.records ?? [];
const coverageOf = (result: ReturnType<typeof offer>, source: string) =>
  result.outcome.coverage.find((entry) => entry.id === source);

beforeEach(() => {
  nextId = 1;
});

describe("offerRecords", () => {
  it("offers active records that match, strong before weak, newest first", () => {
    const rows = [
      kevRow("CVE-2026-0001", "2026-03-01"),
      kevRow("CVE-2026-0003", "2026-09-01"),
      kevRow("CVE-2026-0002", "2026-09-01"),
      kevRow("CVE-2026-0009", "2026-10-01", { matchKeys: ["kev:otherco"] }),
      kevRow("CVE-2026-0010", "2026-10-02", { status: "withdrawn" }),
      row({ sourceId: "uk_sanctions", sourceRecordId: "UK2", publishedAt: "2026-09-01" }),
      row({
        sourceId: "uk_sanctions",
        sourceRecordId: "UK1",
        publishedAt: "2015-01-01",
        matchKeys: ["name:acmeanalytics", "domain:acme-analytics.example"],
      }),
    ];

    const result = offer(rows);

    expect(recordsOf(result, "kev").map((record) => record.vrdb.sourceRecordId)).toEqual([
      "CVE-2026-0003",
      "CVE-2026-0002",
      "CVE-2026-0001",
    ]);
    expect(
      recordsOf(result, "uk_sanctions").map((record) => [
        record.vrdb.sourceRecordId,
        record.vrdb.strength,
        record.vrdb.method,
        record.vrdb.matchedKey,
      ]),
    ).toEqual([
      ["UK1", "strong", "domain", "domain:acme-analytics.example"],
      ["UK2", "weak", "name_exact", "name:acmeanalytics"],
    ]);
  });

  it("a sanctions name match carries the lookup note, a KEV match does not", () => {
    const result = offer([
      kevRow("CVE-2026-0001", "2026-09-01"),
      row({ sourceId: "ofac", sourceRecordId: "1001" }),
      row({
        sourceId: "uk_sanctions",
        sourceRecordId: "UK1",
        matchKeys: ["domain:acme-analytics.example"],
      }),
    ]);

    expect(recordsOf(result, "ofac")[0].text).toContain(NAME_ONLY_LOOKUP_NOTE);
    expect(recordsOf(result, "kev")[0].text).not.toContain("Lookup note");
    expect(recordsOf(result, "uk_sanctions")[0].text).not.toContain("Lookup note");
  });

  it("an identifier match is strong and carries no name-only note", () => {
    const identified = { ...ACME, identifiers: { registrationNumber: "HRB 12345 B" } };
    const result = offer(
      [
        row({
          sourceId: "uk_sanctions",
          sourceRecordId: "UK9",
          matchKeys: ["name:acmeanalytics", "regno:hrb12345b"],
        }),
      ],
      { target: identified },
    );

    const [record] = recordsOf(result, "uk_sanctions");
    expect(record.vrdb).toMatchObject({
      strength: "strong",
      method: "identifier",
      matchedKey: "regno:hrb12345b",
    });
    expect(record.text).not.toContain(NAME_ONLY_LOOKUP_NOTE);
    expect(coverageOf(result, "uk_sanctions")).toMatchObject({ strong: 1, weak: 0 });
  });

  it("matches an entry by the vendor's website only when the website check verified it", () => {
    const rows = [
      row({
        sourceId: "uk_sanctions",
        sourceRecordId: "UK1",
        matchKeys: ["name:acmeanalytics", "domain:acme-analytics.example"],
      }),
      row({
        sourceId: "uk_sanctions",
        sourceRecordId: "UK2",
        matchKeys: ["name:otherco", "domain:acme-analytics.example"],
      }),
    ];

    const result = offer(rows, { verifiedDomains: [] });

    // The entry of the vendor's name is offered as a match by name, with the note; the entry of
    // another name, which only the unverified website ties to the vendor, is not offered.
    expect(
      recordsOf(result, "uk_sanctions").map((record) => [
        record.vrdb.sourceRecordId,
        record.vrdb.strength,
        record.vrdb.method,
      ]),
    ).toEqual([["UK1", "weak", "name_exact"]]);
    expect(recordsOf(result, "uk_sanctions")[0].text).toContain(NAME_ONLY_LOOKUP_NOTE);
  });

  it("matches no entry by a website on a host where many have pages", () => {
    const linkedIn = { ...ACME, domain: "linkedin.com" };
    const result = offer(
      [
        row({
          sourceId: "uk_sanctions",
          sourceRecordId: "UK1",
          matchKeys: ["name:otherco", "domain:linkedin.com"],
        }),
      ],
      { target: linkedIn, verifiedDomains: ["linkedin.com"] },
    );

    expect(recordsOf(result, "uk_sanctions")).toEqual([]);
    expect(result.outcome.coverage.find((source) => source.id === "uk_sanctions")).toMatchObject({
      checked: true,
      outcome: "none",
    });
  });

  it("every record's text ends with 'As of <date>.', the day of the list's last success", () => {
    const result = offer(
      [
        kevRow("CVE-2026-0001", "2026-09-01"),
        row({ sourceId: "ofac", sourceRecordId: "1001" }),
        row({ sourceId: "eu_fsf", sourceRecordId: "EU-1" }),
      ],
      {
        states: [
          state("kev", new Date("2026-10-30T11:23:00Z")),
          state("ofac", new Date("2026-10-29T23:41:00Z")),
          state("eu_fsf", new Date("2026-10-28T18:53:00Z")),
        ],
      },
    );

    expect(recordsOf(result, "kev")[0].text).toMatch(/ As of 2026-10-30\.$/);
    expect(recordsOf(result, "ofac")[0].text).toMatch(/ As of 2026-10-29\.$/);
    expect(recordsOf(result, "eu_fsf")[0].text).toMatch(/ As of 2026-10-28\.$/);
    expect(recordsOf(result, "kev")[0].text.startsWith("The text of record 1.")).toBe(true);
    expect(recordsOf(result, "ofac")[0].vrdb.asOf).toBe("2026-10-29");
    // A KEV record keeps the day CISA added it; a sanctions entry is on the list as of the copy.
    expect(recordsOf(result, "kev")[0].publishedAt).toBe("2026-09-01");
    expect(recordsOf(result, "ofac")[0].publishedAt).toBe("2026-10-29");
  });

  it("caps each source at MAX_RECORDS and counts the rest as more", () => {
    const kev = Array.from({ length: 7 }, (_, index) =>
      kevRow(`CVE-2026-000${index + 1}`, `2026-09-0${index + 1}`),
    );
    const uk = Array.from({ length: 3 }, (_, index) =>
      row({ sourceId: "uk_sanctions", sourceRecordId: `UK${index + 1}` }),
    );

    const result = offer([...kev, ...uk]);

    expect(recordsOf(result, "kev")).toHaveLength(5);
    expect(result.outcome.records.find((entry) => entry.source === "kev")?.omitted).toEqual({
      more: 2,
    });
    expect(recordsOf(result, "uk_sanctions")).toHaveLength(2);
    expect(
      result.outcome.records.find((entry) => entry.source === "uk_sanctions")?.omitted,
    ).toEqual({ more: 1 });
  });

  it("leaves out KEV records before the category's cutoff and counts them as old", () => {
    const result = offer(
      [
        kevRow("CVE-2025-0001", "2025-06-01"),
        kevRow("CVE-2025-0002", "2025-12-31"),
        kevRow("CVE-2026-0001", "2026-01-01"),
        row({ sourceId: "uk_sanctions", sourceRecordId: "UK1", publishedAt: "2015-01-01" }),
      ],
      { cutoffs: { security_incidents: "2026-01-01", legal_regulatory: "2026-01-01" } },
    );

    expect(recordsOf(result, "kev").map((record) => record.vrdb.sourceRecordId)).toEqual([
      "CVE-2026-0001",
    ]);
    expect(result.outcome.records.find((entry) => entry.source === "kev")?.omitted).toEqual({
      old: 2,
    });
    // A designation is a state, not an event: an old one is still in force.
    expect(recordsOf(result, "uk_sanctions")).toHaveLength(1);
  });

  it("coverage: found, none, not_researched, and failed for a source that never synced", () => {
    const states = [
      state("kev", hoursAgo(1)),
      state("ofac", hoursAgo(3)),
      state("uk_sanctions", hoursAgo(2)),
      state("eu_fsf", null),
    ];
    const rows = [
      kevRow("CVE-2026-0001", "2026-09-01"),
      row({ sourceId: "uk_sanctions", sourceRecordId: "UK1" }),
    ];

    const both = offer(rows, { states });
    const securityOnly = offer(rows, { states, researchable: ["security_incidents"] });

    expect(both.outcome.coverage).toEqual([
      {
        id: "kev",
        name: "CISA Known Exploited Vulnerabilities",
        attribution: "CISA Known Exploited Vulnerabilities catalog (CC0 1.0)",
        mode: "mirror",
        checked: true,
        outcome: "found",
        strong: 1,
        weak: 0,
        last_success_at: hoursAgo(1).toISOString(),
        stale: false,
      },
      // No read-through answer: the run had no key to ask the NVD or the SEC by.
      expect.objectContaining({
        id: "nvd",
        mode: "read_through",
        checked: false,
        outcome: "not_researched",
        last_success_at: null,
      }),
      expect.objectContaining({
        id: "sec",
        mode: "read_through",
        checked: false,
        outcome: "not_researched",
        last_success_at: null,
      }),
      expect.objectContaining({ id: "ofac", checked: true, outcome: "none", strong: 0, weak: 0 }),
      expect.objectContaining({
        id: "uk_sanctions",
        checked: true,
        outcome: "found",
        strong: 0,
        weak: 1,
      }),
      expect.objectContaining({
        id: "eu_fsf",
        checked: false,
        outcome: "failed",
        last_success_at: null,
        stale: false,
      }),
      // The CVE records were never copied (no baseline is loaded): failed, like a list that never synced.
      expect.objectContaining({
        id: "cve",
        mode: "mirror",
        checked: false,
        outcome: "failed",
        last_success_at: null,
        stale: false,
      }),
    ]);
    expect(both.outcome.records.map((entry) => entry.source)).toEqual([
      "kev",
      "ofac",
      "uk_sanctions",
    ]);
    expect(securityOnly.outcome.coverage.map((entry) => [entry.id, entry.outcome])).toEqual([
      ["kev", "found"],
      ["nvd", "not_researched"],
      ["sec", "not_researched"],
      ["ofac", "not_researched"],
      ["uk_sanctions", "not_researched"],
      ["eu_fsf", "not_researched"],
      ["cve", "failed"],
    ]);
    expect(securityOnly.outcome.records.map((entry) => entry.source)).toEqual(["kev"]);
  });

  it("coverage marks a source stale after 48 hours", () => {
    const result = offer([row({ sourceId: "ofac", sourceRecordId: "1001" })], {
      states: [
        state("kev", hoursAgo(47)),
        state("ofac", hoursAgo(49)),
        state("uk_sanctions", hoursAgo(2)),
        state("eu_fsf", hoursAgo(2)),
      ],
    });

    expect(coverageOf(result, "kev")).toMatchObject({ outcome: "none", stale: false });
    expect(coverageOf(result, "ofac")).toMatchObject({ outcome: "found", stale: true });
    expect(recordsOf(result, "ofac")[0].vrdb.stale).toBe(true);
  });

  it("covers no list behind a closed gate (the UN list), and offers the CVE records now that Q7 is open", () => {
    const result = offer(
      [
        row({ sourceId: "un_sanctions", sourceRecordId: "QDe.001" }),
        row({
          sourceId: "cve",
          sourceRecordId: "CVE-2026-0002",
          recordType: "vulnerability",
          matchKeys: ["cve:acmeanalytics"],
        }),
      ],
      { states: [...ALL_SYNCED, state("cve", hoursAgo(1)), state("un_sanctions", hoursAgo(1))] },
    );

    // The UN list has a copy and a match, and is not covered; the CVE records are, after the EU list.
    expect(result.outcome.coverage.map((entry) => entry.id)).toEqual([
      "kev",
      "nvd",
      "sec",
      "ofac",
      "uk_sanctions",
      "eu_fsf",
      "cve",
    ]);
    expect(result.outcome.records.map((entry) => entry.source)).toEqual([
      "kev",
      "ofac",
      "uk_sanctions",
      "eu_fsf",
      "cve",
    ]);
    expect(recordsOf(result, "cve").map((record) => record.vrdb.sourceRecordId)).toEqual([
      "CVE-2026-0002",
    ]);
    // The only match is the CVE record's: a vendor of an affected product, a strong key.
    expect(result.matches).toEqual([
      {
        recordId: 2,
        method: "cve_affected_vendor",
        strength: "strong",
        matchedKey: "cve:acmeanalytics",
      },
    ]);
  });

  it("the off switch gives off for every source and no records", () => {
    const result = offer([kevRow("CVE-2026-0001", "2026-09-01")], {
      enabled: false,
      researchable: ["security_incidents"],
    });

    expect(
      result.outcome.coverage.map((entry) => [entry.id, entry.outcome, entry.checked]),
    ).toEqual([
      ["kev", "off", false],
      ["nvd", "off", false],
      ["sec", "off", false],
      ["ofac", "off", false],
      ["uk_sanctions", "off", false],
      ["eu_fsf", "off", false],
      ["cve", "off", false],
    ]);
    expect(result.outcome.records).toEqual([]);
    expect(result.matches).toEqual([]);
  });

  describe("a read-through source", () => {
    const nvdRow = (cve: string, day: string, overrides: Partial<VrdbRow> = {}) =>
      row({
        sourceId: "nvd",
        sourceRecordId: cve,
        recordType: "vulnerability",
        matchKeys: ["cpe:acmeanalytics"],
        publishedAt: day,
        ...overrides,
      });
    const answered = (
      outcome: ReadThroughOutcome["outcome"],
      fetchedAt: Date | null,
      key: string | null = "cpe:acmeanalytics",
      weak = false,
    ) => new Map([["nvd" as const, { key, weak, outcome, fetchedAt }]]);

    it("the NVD is covered as read_through with the day of its answer", () => {
      const result = offer([nvdRow("CVE-2026-0101", "2026-10-01")], {
        researchable: ["security_incidents"],
        readThrough: answered("fetched", new Date("2026-10-30T09:15:00Z")),
      });

      expect(coverageOf(result, "nvd")).toEqual({
        id: "nvd",
        name: "National Vulnerability Database",
        attribution:
          "This product uses data from the NVD API but is not endorsed or certified by the NVD.",
        mode: "read_through",
        checked: true,
        outcome: "found",
        strong: 1,
        weak: 0,
        last_success_at: "2026-10-30T09:15:00.000Z",
        stale: false,
      });
      const [record] = recordsOf(result, "nvd");
      expect(record.text).toMatch(/ As of 2026-10-30\.$/);
      expect(record.publishedAt).toBe("2026-10-01");
      expect(record.vrdb).toMatchObject({
        sourceId: "nvd",
        method: "nvd_cpe_vendor",
        strength: "strong",
        matchedKey: "cpe:acmeanalytics",
        asOf: "2026-10-30",
      });
    });

    it("a record is dated by the last answer that held it, not by the key's last answer", () => {
      // A record that aged out of the window is kept, though later answers lack it (M2 final
      // review, Important 1): its "As of" is the day an answer last held it.
      const result = offer([nvdRow("CVE-2026-0101", "2026-06-20", { retrievedAt: "2026-10-12" })], {
        researchable: ["security_incidents"],
        readThrough: answered("fetched", new Date("2026-10-30T09:15:00Z")),
      });

      const [record] = recordsOf(result, "nvd");
      expect(record.text).toMatch(/ As of 2026-10-12\.$/);
      expect(record.vrdb.asOf).toBe("2026-10-12");
      expect(coverageOf(result, "nvd")?.last_success_at).toBe("2026-10-30T09:15:00.000Z");
    });

    it("an answer kept from before is fresh, and an old one stale", () => {
      const fresh = offer([nvdRow("CVE-2026-0101", "2026-10-01")], {
        readThrough: answered("fresh", hoursAgo(5)),
      });
      const stale = offer([nvdRow("CVE-2026-0101", "2026-10-01")], {
        readThrough: answered("failed", hoursAgo(49)),
      });

      expect(coverageOf(fresh, "nvd")).toMatchObject({ outcome: "found", stale: false });
      expect(coverageOf(stale, "nvd")).toMatchObject({ outcome: "failed", stale: true });
    });

    it("a failed refresh offers the stored records and says failed", () => {
      const result = offer([nvdRow("CVE-2026-0101", "2026-10-01")], {
        readThrough: answered("failed", hoursAgo(7)),
      });

      expect(recordsOf(result, "nvd").map((record) => record.vrdb.sourceRecordId)).toEqual([
        "CVE-2026-0101",
      ]);
      expect(coverageOf(result, "nvd")).toMatchObject({
        checked: false,
        outcome: "failed",
        last_success_at: hoursAgo(7).toISOString(),
      });
    });

    it("a key that never had an answer is failed, with no records", () => {
      const result = offer([nvdRow("CVE-2026-0101", "2026-10-01")], {
        readThrough: answered("failed", null),
      });

      expect(recordsOf(result, "nvd")).toEqual([]);
      expect(coverageOf(result, "nvd")).toMatchObject({ outcome: "failed", last_success_at: null });
    });

    it("a vendor with no key for it is not researched there", () => {
      const result = offer([nvdRow("CVE-2026-0101", "2026-10-01")], {
        readThrough: answered("no_key", null, null),
      });

      expect(recordsOf(result, "nvd")).toEqual([]);
      expect(coverageOf(result, "nvd")).toMatchObject({ outcome: "not_researched" });
    });

    it("a CVE that KEV and the NVD both have is offered once, as KEV's", () => {
      const result = offer(
        [
          kevRow("CVE-2026-0101", "2026-10-02"),
          nvdRow("CVE-2026-0101", "2026-10-01"),
          nvdRow("CVE-2026-0102", "2026-10-01"),
        ],
        { readThrough: answered("fresh", hoursAgo(1)) },
      );

      expect(recordsOf(result, "kev").map((record) => record.vrdb.sourceRecordId)).toEqual([
        "CVE-2026-0101",
      ]);
      expect(recordsOf(result, "nvd").map((record) => record.vrdb.sourceRecordId)).toEqual([
        "CVE-2026-0102",
      ]);
      expect(result.matches.map((match) => match.recordId)).toEqual([1, 3]);
    });

    it("a CVE that KEV matched but left out is not offered by the NVD either", () => {
      const kev = Array.from({ length: 6 }, (_, index) =>
        kevRow(`CVE-2026-010${index + 1}`, `2026-09-0${index + 1}`),
      );
      // The oldest of KEV's six is past its five; the NVD has the same CVE.
      const result = offer([...kev, nvdRow("CVE-2026-0101", "2026-08-30")], {
        readThrough: answered("fresh", hoursAgo(1)),
      });

      expect(result.outcome.records.find((entry) => entry.source === "kev")?.omitted).toEqual({
        more: 1,
      });
      expect(recordsOf(result, "nvd")).toEqual([]);
      expect(result.outcome.records.find((entry) => entry.source === "nvd")?.omitted).toEqual({});
    });

    it("a key the read-through found by the name alone matches weakly", () => {
      const result = offer(
        [nvdRow("CVE-2026-0101", "2026-10-01", { matchKeys: ["cpe:acmeanalyticsgroup"] })],
        { readThrough: answered("fetched", hoursAgo(0), "cpe:acmeanalyticsgroup", true) },
      );

      expect(recordsOf(result, "nvd")[0].vrdb).toMatchObject({
        strength: "weak",
        method: "nvd_cpe_vendor",
        matchedKey: "cpe:acmeanalyticsgroup",
      });
      expect(coverageOf(result, "nvd")).toMatchObject({ strong: 0, weak: 1 });
    });
  });

  it("gives one match per offered record, with its method, strength and key", () => {
    const kev = Array.from({ length: 6 }, (_, index) =>
      kevRow(`CVE-2026-000${index + 1}`, `2026-09-0${index + 1}`),
    );
    const result = offer([...kev, row({ sourceId: "ofac", sourceRecordId: "1001" })]);

    expect(result.matches).toHaveLength(6);
    expect(result.matches).toContainEqual({
      recordId: 6,
      method: "kev_vendor",
      strength: "strong",
      matchedKey: "kev:acmeanalytics",
    });
    expect(result.matches).toContainEqual({
      recordId: 7,
      method: "name_exact",
      strength: "weak",
      matchedKey: "name:acmeanalytics",
    });
    // The oldest KEV record was not offered, so it is no match of the vendor.
    expect(result.matches.map((match) => match.recordId)).not.toContain(1);
  });
});

/** A store in memory that answers with the given rows and states, and keeps what it was asked. */
function fakeStore(rows: VrdbRow[] = [], states: VrdbSourceState[] = ALL_SYNCED) {
  const store: jest.Mocked<LookupStore> = {
    sourceStates: jest.fn(async (ids) => states.filter((entry) => ids.includes(entry.id))),
    findRecords: jest.fn(async (_keys, sources) =>
      rows.filter((entry) => sources.includes(entry.sourceId)),
    ),
    recordMatches: jest
      .fn<Promise<void>, Parameters<LookupStore["recordMatches"]>>()
      .mockResolvedValue(undefined),
  };
  return store;
}

const lookupInput = (target: ResearchTarget = ACME) => ({
  target,
  researchable: BOTH,
  now: NOW,
  verifiedDomains: target.domain === null ? [] : [target.domain],
});

describe("createVrdbLookup", () => {
  it("reads the states and records of the researched lists only", async () => {
    const store = fakeStore();
    const lookup = createVrdbLookup({ store, organizationId: 1, vendorId: 2, enabled: true });

    await lookup({ ...lookupInput(), researchable: ["security_incidents"] });

    // The records of the NVD and the SEC are stored too; their state is the answer of their key, not
    // a sync.
    expect(store.sourceStates).toHaveBeenCalledWith(["kev", "cve"]);
    expect(store.findRecords).toHaveBeenCalledWith(expect.any(Array), ["kev", "nvd", "sec", "cve"]);
  });

  it("a vendor without a domain is looked up by its names", async () => {
    const store = fakeStore([row({ sourceId: "ofac", sourceRecordId: "1001" })]);
    const lookup = createVrdbLookup({ store, organizationId: 1, vendorId: 2, enabled: true });

    const outcome = await lookup(lookupInput({ ...ACME, domain: null }));

    const keys = store.findRecords.mock.calls[0][0];
    expect(keys).toEqual(expect.arrayContaining(["kev:acmeanalytics", "name:acmeanalytics"]));
    expect(keys.some((key) => key.startsWith("domain:"))).toBe(false);
    expect(outcome.records.find((entry) => entry.source === "ofac")?.records).toHaveLength(1);
  });

  it("asks for the vendor's domain only when the website check verified it", async () => {
    const store = fakeStore();
    const lookup = createVrdbLookup({ store, organizationId: 1, vendorId: 2, enabled: true });

    await lookup({ ...lookupInput(), verifiedDomains: [] });
    await lookup(lookupInput());

    const [unverified, verified] = store.findRecords.mock.calls.map(([keys]) =>
      keys.filter((key) => key.startsWith("domain:")),
    );
    expect(unverified).toEqual([]);
    expect(verified).toEqual(["domain:acme-analytics.example"]);
  });

  it("writes one match row per offered record, with its method, strength and key", async () => {
    const store = fakeStore([
      kevRow("CVE-2026-0001", "2026-09-01"),
      row({ sourceId: "ofac", sourceRecordId: "1001" }),
    ]);
    const lookup = createVrdbLookup({ store, organizationId: 7, vendorId: 9, enabled: true });

    await lookup(lookupInput());

    expect(store.recordMatches).toHaveBeenCalledTimes(1);
    expect(store.recordMatches).toHaveBeenCalledWith(
      7,
      9,
      [
        { recordId: 1, method: "kev_vendor", strength: "strong", matchedKey: "kev:acmeanalytics" },
        { recordId: 2, method: "name_exact", strength: "weak", matchedKey: "name:acmeanalytics" },
      ],
      NOW,
    );
  });

  it("writes no match row when nothing matched", async () => {
    const store = fakeStore([]);
    const lookup = createVrdbLookup({ store, organizationId: 7, vendorId: 9, enabled: true });

    await lookup(lookupInput());

    expect(store.recordMatches).not.toHaveBeenCalled();
  });

  it("a store that throws gives failed coverage and no records", async () => {
    const store = fakeStore();
    store.findRecords.mockRejectedValue(new Error("connection reset"));
    const lookup = createVrdbLookup({ store, organizationId: 1, vendorId: 2, enabled: true });

    const outcome = await lookup({ ...lookupInput(), researchable: ["legal_regulatory"] });

    expect(outcome.records).toEqual([]);
    expect(outcome.coverage.map((entry) => [entry.id, entry.outcome])).toEqual([
      ["kev", "not_researched"],
      ["nvd", "not_researched"],
      ["sec", "not_researched"],
      ["ofac", "failed"],
      ["uk_sanctions", "failed"],
      ["eu_fsf", "failed"],
      ["cve", "not_researched"],
    ]);
    expect(store.recordMatches).not.toHaveBeenCalled();
  });

  it("keeps the records when the match rows cannot be written", async () => {
    const store = fakeStore([kevRow("CVE-2026-0001", "2026-09-01")]);
    store.recordMatches.mockRejectedValue(new Error("deadlock"));
    const lookup = createVrdbLookup({ store, organizationId: 1, vendorId: 2, enabled: true });

    const outcome = await lookup(lookupInput());

    expect(outcome.records.find((entry) => entry.source === "kev")?.records).toHaveLength(1);
  });

  it("asks the read-through first, and looks its records up by its key", async () => {
    const store = fakeStore([
      row({
        sourceId: "nvd",
        sourceRecordId: "CVE-2026-0101",
        recordType: "vulnerability",
        matchKeys: ["cpe:acmebrand"],
      }),
    ]);
    const connector: ReadThroughConnector = {
      id: "nvd",
      keyOf: jest.fn(async () => ({ key: "cpe:acmebrand", weak: false })),
      fetch: jest.fn(async () => ({ records: [], coversSince: null })),
    };
    const readThrough: ReadThroughDeps = {
      store: {
        lookupOf: jest.fn(async () => null),
        saveAnswer: jest.fn(async () => ({ statusChanged: 0 })),
      },
      connectors: { nvd: connector },
      fetchJson: async () => {
        throw new Error("the connector of the test asks itself");
      },
      spacers: {},
    };
    const lookup = createVrdbLookup({
      store,
      organizationId: 1,
      vendorId: 2,
      enabled: true,
      readThrough,
    });

    const outcome = await lookup({ ...lookupInput(), researchable: ["security_incidents"] });

    expect(connector.fetch).toHaveBeenCalledTimes(1);
    expect(readThrough.store.saveAnswer).toHaveBeenCalledTimes(1);
    expect(store.findRecords.mock.calls[0][0]).toContain("cpe:acmebrand");
    expect(outcome.coverage.find((entry) => entry.id === "nvd")).toMatchObject({
      outcome: "found",
      last_success_at: NOW.toISOString(),
    });
  });

  it("a store that throws fails a read-through source that had a key, too", async () => {
    const store = fakeStore();
    store.findRecords.mockRejectedValue(new Error("connection reset"));
    const readThrough: ReadThroughDeps = {
      store: {
        lookupOf: jest.fn(async () => ({
          fetchedAt: NOW,
          expiresAt: new Date(NOW.getTime() + HOUR_MS),
          outcome: "ok",
        })),
        saveAnswer: jest.fn(async () => ({ statusChanged: 0 })),
      },
      connectors: {
        nvd: {
          id: "nvd",
          keyOf: async () => ({ key: "cpe:acmeanalytics", weak: false }),
          fetch: async () => ({ records: [], coversSince: null }),
        },
      },
      fetchJson: async () => [],
      spacers: {},
    };
    const lookup = createVrdbLookup({
      store,
      organizationId: 1,
      vendorId: 2,
      enabled: true,
      readThrough,
    });

    const outcome = await lookup({ ...lookupInput(), researchable: ["security_incidents"] });

    // The SEC has no connector in this test: it had no key to ask by, so it is not researched.
    expect(outcome.coverage.map((entry) => [entry.id, entry.outcome])).toEqual([
      ["kev", "failed"],
      ["nvd", "failed"],
      ["sec", "not_researched"],
      ["ofac", "not_researched"],
      ["uk_sanctions", "not_researched"],
      ["eu_fsf", "not_researched"],
      ["cve", "failed"],
    ]);
  });

  it("asks nothing while the records are off", async () => {
    const store = fakeStore();
    const lookup = createVrdbLookup({ store, organizationId: 1, vendorId: 2, enabled: false });

    const outcome = await lookup(lookupInput());

    expect(outcome.coverage.every((entry) => entry.outcome === "off")).toBe(true);
    expect(store.sourceStates).not.toHaveBeenCalled();
    expect(store.findRecords).not.toHaveBeenCalled();
  });
});

describe("sharedVrdbLookup", () => {
  const IDS = { organizationId: 1, vendorId: 2 };
  const config = (overrides: Partial<VendorResearchConfig> = {}): VendorResearchConfig => ({
    autoRun: true,
    manualCooldownMinutes: 10,
    dailyRunCap: 50,
    workerConcurrency: 5,
    headless: false,
    records: true,
    ...overrides,
  });
  /** No read-through source is asked here: no test reaches the NVD or the SEC. */
  const NO_READ_THROUGH: ReadThroughDeps = {
    store: databaseReadThroughStore,
    connectors: {},
    fetchJson: async () => {
      throw new Error("no test reaches the NVD");
    },
    spacers: {},
  };

  beforeEach(() => {
    mockSourceStates.mockReset().mockResolvedValue(ALL_SYNCED);
    mockFindRecords.mockReset().mockResolvedValue([]);
    mockRecordMatches.mockReset().mockResolvedValue(undefined);
  });

  it("is a lookup of the stored lists with no flag set: the database is on", async () => {
    const lookup = sharedVrdbLookup(IDS, config(), NO_READ_THROUGH);

    expect(lookup).toEqual(expect.any(Function));
    const outcome = await lookup({ ...lookupInput(), researchable: ["legal_regulatory"] });

    expect(mockSourceStates).toHaveBeenCalledTimes(1);
    expect(mockFindRecords).toHaveBeenCalledTimes(1);
    expect(outcome.coverage.map((entry) => entry.outcome)).toContain("none");
    expect(outcome.coverage.every((entry) => entry.outcome !== "off")).toBe(true);
  });

  it("is off when the records are off: every list says so and nothing is read", async () => {
    const lookup = sharedVrdbLookup(IDS, config({ records: false }), NO_READ_THROUGH);

    const outcome = await lookup(lookupInput());

    expect(outcome.coverage.length).toBeGreaterThan(0);
    expect(outcome.coverage.every((entry) => entry.outcome === "off")).toBe(true);
    expect(outcome.records).toEqual([]);
    expect(mockSourceStates).not.toHaveBeenCalled();
    expect(mockFindRecords).not.toHaveBeenCalled();
    expect(mockRecordMatches).not.toHaveBeenCalled();
  });

  describe("reading the environment when it is given no settings", () => {
    const realEnv = process.env;

    afterEach(() => {
      jest.restoreAllMocks();
      // A boolean, so that a failure cannot print the real environment.
      expect(process.env === realEnv).toBe(true);
    });

    it.each([
      ["nothing set", {}, true],
      ["the variable of the earlier flag set to false", { VENDOR_RESEARCH_VRDB: "false" }, true],
      ["the records turned off", { VENDOR_RESEARCH_RECORDS: "false" }, false],
      [
        "the records turned off beside the earlier flag",
        { VENDOR_RESEARCH_RECORDS: "false", VENDOR_RESEARCH_VRDB: "true" },
        false,
      ],
    ])("with %s", async (_label, env, reads) => {
      jest.replaceProperty(process, "env", env);

      const lookup = sharedVrdbLookup(IDS, undefined, NO_READ_THROUGH);
      const outcome = await lookup({ ...lookupInput(), researchable: ["legal_regulatory"] });

      expect(mockFindRecords).toHaveBeenCalledTimes(reads ? 1 : 0);
      expect(outcome.coverage.every((entry) => entry.outcome === "off")).toBe(!reads);
    });
  });
});

describe("databaseReadThroughStore", () => {
  /** The status job is added in the background: lets it run before the test looks. */
  const settled = () => new Promise((resolve) => setImmediate(resolve));
  const nvd = activeReadThroughs().find((source) => source.id === "nvd") as ReadThroughSource;
  const answer: ReadThroughAnswer = {
    definition: nvd,
    key: "cpe:acme",
    records: [],
    outcome: "empty",
    at: NOW,
    expiresAt: hoursAgo(-6),
  };

  beforeEach(() => {
    mockSaveAnswer.mockReset();
    mockEnqueueRelabel.mockReset().mockResolvedValue(undefined);
    (logger.warn as jest.Mock).mockClear();
  });

  it("an answer that changed a status adds the status job of its source (Ruling 12)", async () => {
    mockSaveAnswer.mockResolvedValue({ statusChanged: 2 });

    await expect(databaseReadThroughStore.saveAnswer(answer)).resolves.toEqual({
      statusChanged: 2,
    });
    await settled();
    expect(mockSaveAnswer).toHaveBeenCalledWith(answer);
    expect(mockEnqueueRelabel).toHaveBeenCalledWith("nvd");
  });

  it("an answer that changed no status adds none", async () => {
    mockSaveAnswer.mockResolvedValue({ statusChanged: 0 });

    await expect(databaseReadThroughStore.saveAnswer(answer)).resolves.toEqual({
      statusChanged: 0,
    });
    expect(mockEnqueueRelabel).not.toHaveBeenCalled();
  });

  it("a status job that cannot be added leaves the answer stored, and says so in the log", async () => {
    mockSaveAnswer.mockResolvedValue({ statusChanged: 1 });
    mockEnqueueRelabel.mockRejectedValue(new Error("Connection is closed."));

    await expect(databaseReadThroughStore.saveAnswer(answer)).resolves.toEqual({
      statusChanged: 1,
    });
    await settled();
    expect(logger.warn).toHaveBeenCalledWith(
      "vendor research: the status job of nvd could not be added (error Error)",
    );
  });

  it("does not wait for the status job: a Redis that stalls does not hold the vendor's run", async () => {
    mockSaveAnswer.mockResolvedValue({ statusChanged: 1 });
    mockEnqueueRelabel.mockReturnValue(new Promise(() => undefined));

    const saved = databaseReadThroughStore.saveAnswer(answer);
    const stalled = new Promise((resolve) => setTimeout(() => resolve("stalled"), 50));

    await expect(Promise.race([saved, stalled])).resolves.toEqual({ statusChanged: 1 });
    await settled();
    expect(mockEnqueueRelabel).toHaveBeenCalledWith("nvd");
  });
});
