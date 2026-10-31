/**
 * The SEC in the lookup of the vendor risk database once Q4 is open (M2, Rulings 2 and 14 of the M2
 * plan): its filings are offered like a read-through source's records, by the CIK a person stored
 * (strong) or the one found by the vendor's name (weak, Q3), each on the day it was filed and inside
 * the lookback, and the read-through of a run asks it with one connector for the process. Q4 is
 * closed in the code; this file opens it.
 */
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("../../../../utils/vrdb.utils", () => ({}));
jest.mock("../gates", () => ({
  ...jest.requireActual("../gates"),
  SEC_CONTACT: "sec@company.example",
  VRDB_GATES: { Q4: true, Q6: false, Q7: false },
}));

import type { ResearchTarget } from "../../target";
import { offerRecords, runReadThrough } from "../lookup";
import type { ReadThroughOutcome, VrdbRow } from "../types";

const NOW = new Date("2026-10-31T12:00:00Z");
const CIK = "0001262039";
const KEY = `cik:${CIK}`;
const BRISE: ResearchTarget = {
  name: "Brise Networks, Inc.",
  domain: "brisenetworks.example",
  provides: "Network gear",
};

let nextId = 1;
const filing = (accession: string, day: string): VrdbRow => ({
  id: nextId++,
  sourceId: "sec",
  sourceRecordId: accession,
  recordType: "sec_filing",
  status: "active",
  title: `Brise Networks, Inc.: Form 8-K, Item 1.05 (material cybersecurity incident), filed ${day}`,
  summary: `SEC EDGAR (sec.gov). Company: Brise Networks, Inc. Form: 8-K. Filed: ${day}.`,
  url: `https://www.sec.gov/Archives/edgar/data/1262039/${accession.replace(/-/g, "")}/brise.htm`,
  matchKeys: [KEY],
  publishedAt: day,
});

const answered = (weak: boolean): ReadonlyMap<"sec", ReadThroughOutcome> =>
  new Map([["sec", { key: KEY, weak, outcome: "fetched", fetchedAt: NOW }]]);

const offer = (
  rows: VrdbRow[],
  over: { target?: ResearchTarget; weak?: boolean; cutoff?: string } = {},
) =>
  offerRecords({
    rows,
    states: [],
    target: over.target ?? BRISE,
    researchable: ["security_incidents"],
    now: NOW,
    enabled: true,
    verifiedDomains: [],
    readThrough: answered(over.weak ?? true),
    ...(over.cutoff === undefined ? {} : { cutoffs: { security_incidents: over.cutoff } }),
  });

const secOf = (result: ReturnType<typeof offer>) =>
  result.outcome.records.find((entry) => entry.source === "sec");

beforeEach(() => {
  nextId = 1;
});

describe("the SEC in the lookup, once Q4 is open", () => {
  it("offers a filing of a CIK found by name as a weak match, on the day it was filed", () => {
    const result = offer([filing("0001262039-26-000003", "2026-10-05")]);

    expect(secOf(result)?.records.map((record) => [record.publishedAt, record.vrdb])).toEqual([
      [
        "2026-10-05",
        expect.objectContaining({
          sourceId: "sec",
          sourceRecordId: "0001262039-26-000003",
          method: "sec_cik",
          strength: "weak",
          matchedKey: KEY,
          asOf: "2026-10-31",
        }),
      ],
    ]);
    expect(result.outcome.coverage.find((entry) => entry.id === "sec")).toMatchObject({
      mode: "read_through",
      outcome: "found",
      strong: 0,
      weak: 1,
    });
  });

  it("a stored CIK makes the match strong", () => {
    const result = offer([filing("0001262039-26-000003", "2026-10-05")], {
      target: { ...BRISE, identifiers: { secCik: CIK } },
      weak: false,
    });

    expect(secOf(result)?.records[0].vrdb.strength).toBe("strong");
  });

  it("leaves out a filing older than the lookback, and counts it old", () => {
    const result = offer(
      [filing("0001262039-25-000001", "2025-06-01"), filing("0001262039-26-000003", "2026-10-05")],
      { cutoff: "2026-01-01" },
    );

    expect(secOf(result)?.records.map((record) => record.publishedAt)).toEqual(["2026-10-05"]);
    expect(secOf(result)?.omitted).toEqual({ old: 1 });
  });

  it("asks the SEC in the read-through of a run, with one connector for the process", () => {
    const deps = runReadThrough();

    expect(deps.connectors.sec?.id).toBe("sec");
    expect(deps.spacers.sec).toEqual(expect.any(Function));
    // The connector keeps the tickers file in its memory for a day: the runs share it.
    expect(runReadThrough().connectors.sec).toBe(deps.connectors.sec);
  });

  it("asks no SEC without a contact", () => {
    const deps = runReadThrough(null);

    expect(Object.keys(deps.connectors)).toEqual(["nvd"]);
    expect(Object.keys(deps.spacers)).toEqual(["nvd"]);
  });
});
