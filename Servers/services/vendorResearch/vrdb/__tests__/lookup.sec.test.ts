/**
 * The SEC in the lookup of the vendor risk database now that Q4 is open (M2, Rulings 2 and 14 of the
 * M2 plan): its filings are offered like a read-through source's records, by the CIK a person stored
 * (strong) or the one found by the vendor's name (weak, Q3), each on the day it was filed and inside
 * the lookback, and the read-through of a run asks it with one connector for the process, whose
 * requests name the contact of Q4 (gates.ts). The gates are the real ones, not a mock: this file
 * fails if Q4 is closed again.
 */
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("../../../../utils/vrdb.utils", () => ({}));
// The turns of the SEC are taken in the application's Redis: this one grants every turn at once.
const mockRedis = { status: "ready", eval: jest.fn(async (): Promise<unknown> => 0) };
jest.mock("../../../../database/redis", () => ({ __esModule: true, default: mockRedis }));

import { SEC_TICKERS_URL } from "../../records/sec";
import type { FetchJson } from "../../records/types";
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

  it("asks the SEC with the contact of Q4 by default, and takes its turns in Redis", async () => {
    const asked: Array<{ url: string; userAgent?: string }> = [];
    const fetchJson: FetchJson = async (url, { userAgent }) => {
      asked.push({ url, userAgent });
      return { "0": { cik_str: 1262039, ticker: "BRSE", title: "Brise Networks, Inc." } };
    };

    // No contact given: the one of gates.ts, which is VerifyWise's Technical Support address.
    const found = await runReadThrough().connectors.sec?.keyOf(BRISE, {
      signal: new AbortController().signal,
      fetchJson,
    });

    expect(found).toEqual({ key: KEY, weak: true });
    expect(asked).toEqual([{ url: SEC_TICKERS_URL, userAgent: "VerifyWise tech@verifywise.ai" }]);
    expect(mockRedis.eval).toHaveBeenCalledTimes(1);
    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.any(String),
      2,
      "vrdb:spacer:sec",
      "vrdb:spacer:sec:seq",
      5,
      1000,
      2000,
    );
  });

  it("asks no SEC without a contact", () => {
    const deps = runReadThrough(null);

    expect(Object.keys(deps.connectors)).toEqual(["nvd"]);
    expect(Object.keys(deps.spacers)).toEqual(["nvd"]);
  });
});
