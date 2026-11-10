/**
 * The UK Competition and Markets Authority cases as a mirrored list of the vendor risk database
 * (connectors/ukCma.ts): the GOV.UK Search API, read in pages of 1,000 results, whose rows are the
 * case pages (a title, a case type, a state, an outcome and two dates), read into one record per
 * party. The answers are synthetic: they copy the shape of the API's (an envelope of `results`,
 * `total`, `start` and the empty aggregates; a row with the fields that are read, the case type and
 * the state as lists of one, the market sector as a list or as a bare text), with every name, title,
 * link and date invented. A field that the connector must leave out holds a token that starts with
 * `ZZ-` (or a date that no case has), so that a copy of it anywhere in a snapshot or a record is
 * found. Every character that is hard to type is built with `cp`. Nothing here uses the network:
 * `fakeFetch` and hand-written fetches answer.
 */
import { FetchError } from "../../../../webResearch/guardedFetch";
import type { ParsedRecord } from "../../types";
import type { Sleep } from "../kit/pause";
import { RECORD_SUMMARY_MAX } from "../kit/record";
import { UK_CMA_RECORD_MARK, createUkCmaConnector, ukCmaConnector } from "../ukCma";
import {
  BodyTooLargeError,
  type Connector,
  type ConnectorFetch,
  NotTheListError,
  type ParseResult,
  type Snapshot,
} from "../types";
import {
  type FakeFile,
  expectDeterministic,
  expectWellFormedRecords,
  fakeFetch,
} from "./helpers/kitContract";

jest.setTimeout(30_000);

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

const MARK = UK_CMA_RECORD_MARK;
const URL_BEFORE_START =
  "https://www.gov.uk/api/search.json?filter_format=cma_case&count=1000&order=-public_timestamp&fields[]=title&fields[]=description&fields[]=link&fields[]=public_timestamp&fields[]=content_store_document_type&fields[]=format&fields[]=case_type&fields[]=case_state&fields[]=outcome_type&fields[]=market_sector&fields[]=opened_date&fields[]=closed_date&start=";
const urlAt = (start: number): string => `${URL_BEFORE_START}${start}`;
const SITE = "https://www.gov.uk";
const JSON_TYPE = "application/json";
const MIB = 1024 * 1024;
/**
 * The wall-clock limit of the tests that guard against a blow-up of the time (a pattern or a reader
 * that goes exponential or quadratic): the work of each takes 1 to 25 ms (measured on three runs),
 * so ten seconds is a margin of four hundred times, and a starved runner does not fail a test with
 * no change of code. The jest timeout of such a test is set above the limit (30 s).
 */
const SLOW_MS = 10_000;

/** The sentences of a record that are fixed. */
const FIRST_SENTENCE = `${MARK} (gov.uk), an enforcement or case list.`;
const SECOND_SENTENCE =
  "A case entry names a party to a merger review or to a competition, consumer protection or digital markets case; it is not a finding against the party unless its outcome says so.";
const CLOSING = "Adapted by VerifyWise from GOV.UK under the Open Government Licence v3.0.";

const NBSP = cp(0xa0);
const ZWSP = cp(0x200b);
const LRM = cp(0x200e);
const RLO = cp(0x202e);
const LONE_SURROGATE = cp(0xd800);
const CURLY = cp(0x2019);

/** What the connector must never copy: planted in a field that it does not read. */
const LEFT_OUT = {
  description: "ZZ-DESCRIPTION",
  sector: "ZZ-SECTOR",
  sectorBare: "ZZ-SECTOR-BARE",
};
/** The republication time of every row: no case has this day, so it is never a case date. */
const STAMP = "2031-01-01T00:00:00.000+00:00";
const STAMP_DAY = "2031-01-01";

type Row = Record<string, unknown>;

/** What a case row holds that a test sets; the rest is the default of a closed merger. */
interface CaseOver {
  n?: number;
  link?: string;
  title?: unknown;
  /** The case type as the list has it: one text, put in a list of one. */
  type?: string;
  state?: string;
  /** The outcome slug, or null for none. Default: a phase 2 prohibition for a merger, none otherwise. */
  outcome?: string | null;
  opened?: string | null;
  /** The closing day, null for a null, `undefined` for the default day; `NO_CLOSED` leaves the key out. */
  closed?: string | null | typeof NO_CLOSED;
  stamp?: string;
  bareSector?: boolean;
  /** Whole values of the fields, as the API would have them. */
  rawType?: unknown;
  rawState?: unknown;
}
const NO_CLOSED = Symbol("no closed_date");

/** One row of the Search API: the fields that are read, the envelope fields, and the left-out fields planted. */
function caseOf(over: CaseOver = {}): Row {
  const n = over.n ?? 1;
  const type = over.type ?? "mergers";
  const link = over.link ?? `/cma-cases/example-case-${n}`;
  const row: Row = {
    case_state: "rawState" in over ? over.rawState : [over.state ?? "closed"],
    case_type: "rawType" in over ? over.rawType : [type],
    content_store_document_type: "cma_case",
    description: LEFT_OUT.description,
    format: "cma_case",
    link,
    market_sector: over.bareSector === true ? LEFT_OUT.sectorBare : [LEFT_OUT.sector],
    opened_date: over.opened === undefined ? "2023-01-02" : over.opened,
    outcome_type:
      "outcome" in over ? over.outcome : type === "mergers" ? "mergers-phase-2-prohibition" : null,
    public_timestamp: over.stamp ?? STAMP,
    title: "title" in over ? over.title : `Alphaco / Betaco ${n} merger inquiry`,
    index: "govuk",
    es_score: null,
    _id: link,
    elasticsearch_type: "cma_case",
    document_type: "cma_case",
  };
  if (over.closed !== NO_CLOSED)
    row.closed_date = over.closed === undefined ? "2024-05-06" : over.closed;
  return row;
}

/** A closed merger of the given title. */
const merger = (title: string, over: CaseOver = {}): Row => caseOf({ title, ...over });

/** A consumer enforcement case of the colon form: `head: consumer protection enforcement case`. */
const consumer = (head: string, over: CaseOver = {}): Row =>
  caseOf({
    type: "consumer-enforcement",
    title: `${head}: consumer protection enforcement case`,
    ...over,
  });

/** Rows that the filter drops (a case type that names no party), with links of their own. */
const fillers = (count: number, from = 1_000): Row[] =>
  Array.from({ length: count }, (_, at) =>
    caseOf({ n: from + at, type: "sau-referral", title: `Filler ${from + at}` }),
  );

/** The text of one answer of the API. */
const pageText = (
  results: readonly unknown[],
  total: unknown = results.length,
  start = 0,
  extra: Record<string, unknown> = {},
): string =>
  JSON.stringify({
    results,
    total,
    start,
    aggregates: {},
    suggested_queries: [],
    suggested_autocomplete: [],
    es_cluster: "A",
    ...extra,
  });

/** A pause that does not wait and keeps its calls. */
const sleeping = () => jest.fn<ReturnType<Sleep>, Parameters<Sleep>>(async () => undefined);

const connectorOf = (sleep: Sleep = sleeping()): Connector => createUkCmaConnector({ sleep });

const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

/** The files that the fake fetch serves for a search: one page of each thousand rows. */
function pagesOf(
  rows: readonly unknown[],
  over: { total?: unknown; file?: Partial<FakeFile> } = {},
): Record<string, FakeFile> {
  const files: Record<string, FakeFile> = {};
  const total = "total" in over ? over.total : rows.length;
  for (let start = 0; start === 0 || start < rows.length; start += 1_000) {
    files[urlAt(start)] = {
      body: pageText(rows.slice(start, start + 1_000), total, start),
      contentType: JSON_TYPE,
      ...over.file,
    };
  }
  return files;
}

async function downloadOf(
  rows: readonly unknown[],
  over: { total?: unknown; file?: Partial<FakeFile> } = {},
  connector: Connector = connectorOf(),
): Promise<Snapshot> {
  const result = await connector.download(fakeFetch(pagesOf(rows, over)), {});
  if (result === "unchanged") throw new Error("The fake fetch answered 304 to a first request.");
  return result;
}

interface Run {
  snapshot: Snapshot;
  parsed: ParseResult;
  records: ParsedRecord[];
}

/** Downloads the rows as the list and parses what was stored. */
async function runOf(rows: readonly unknown[], connector: Connector = connectorOf()): Promise<Run> {
  const snapshot = await downloadOf(rows, {}, connector);
  const parsed = connector.parse(snapshot);
  return { snapshot, parsed, records: parsed.records };
}

const idsOf = (records: readonly ParsedRecord[]): string[] =>
  records.map((record) => record.sourceRecordId).sort();

const recordOfId = (records: readonly ParsedRecord[], key: string): ParsedRecord => {
  const found = records.find((record) => record.sourceRecordId === `cma:${key}`);
  if (found === undefined) throw new Error(`No record has the id cma:${key}.`);
  return found;
};

const PARTY_PREFIX = /^CMA cases: /;

/** The parties that one case of the type gives, as the records write them, sorted. */
async function partiesOf(title: string, type = "mergers", over: CaseOver = {}): Promise<string[]> {
  const { records } = await runOf([caseOf({ title, type, ...over })]);
  return records.map((record) => record.title.replace(PARTY_PREFIX, "")).sort();
}

const textOfRun = (run: Run): string => JSON.stringify([run.snapshot.bodies, run.records]);

/** The body of a snapshot as the factory writes it. */
const bodyOf = (
  snapshot: Snapshot,
): { rows: Array<Record<string, unknown>>; total: number; unreadable: number } =>
  JSON.parse(snapshot.bodies[0]) as {
    rows: Array<Record<string, unknown>>;
    total: number;
    unreadable: number;
  };

const hasKey = (record: ParsedRecord, key: string): boolean => record.matchKeys.includes(key);

describe("ukCmaConnector", () => {
  describe("the connector", () => {
    it("is the connector of the list, in the snapshot form, with the mark of its records", () => {
      expect(ukCmaConnector.id).toBe("uk_cma");
      expect(ukCmaConnector.version).toBe(1);
      expect(ukCmaConnector.kind).toBeUndefined();
      expect(MARK).toBe("UK Competition and Markets Authority cases");
    });

    it("is made by a factory that takes the pause, as the lists of one host are", () => {
      expect(typeof createUkCmaConnector).toBe("function");
      expect(createUkCmaConnector().id).toBe("uk_cma");
      expect(createUkCmaConnector({ sleep: sleeping() }).version).toBe(ukCmaConnector.version);
    });

    it("asks for the one page of a small search once, within its limits, and never pauses", async () => {
      const sleep = sleeping();
      const fetch = fakeFetch(pagesOf([caseOf()]));
      const result = await connectorOf(sleep).download(fetch, {});
      expect(result).not.toBe("unchanged");
      expect(fetch.calls).toHaveLength(1);
      expect(fetch.calls[0].url).toBe(urlAt(0));
      expect(fetch.calls[0].limits).toEqual({
        maxBytes: 8 * MIB,
        allowedContentTypes: ["application/json"],
        totalTimeoutMs: 60_000,
      });
      expect(sleep).not.toHaveBeenCalled();
    });

    it("asks for the three pages of 2,500 rows in order, pausing 400 ms before each page after the first", async () => {
      const rows = [merger("Alphaco / Betaco merger inquiry"), ...fillers(2_499)];
      const sleep = sleeping();
      const fetch = fakeFetch(pagesOf(rows));
      const result = await connectorOf(sleep).download(fetch, {});
      expect(result).not.toBe("unchanged");
      expect(fetch.calls.map((call) => call.url)).toEqual([urlAt(0), urlAt(1_000), urlAt(2_000)]);
      expect(sleep.mock.calls).toEqual([[400], [400]]);
      for (const call of fetch.calls) expect(call.validators).toEqual({});
    });

    it("sends no validator, whatever the stored ones are, and downloads in full: the API sends none", async () => {
      const fetch = fakeFetch(pagesOf([caseOf()]));
      const result = await ukCmaConnector.download(fetch, {
        etag: `k${ukCmaConnector.version}:`,
        lastModified: "Mon, 09 Nov 2026 10:05:44 GMT",
      });
      expect(result).not.toBe("unchanged");
      expect(fetch.calls[0].validators).toEqual({});
      if (result === "unchanged") return;
      expect(result.etag).toBe(`k${ukCmaConnector.version}:`);
      expect(result.lastModified).toBeNull();
    });

    it("has the whole list as the one body of its snapshot, and the bytes of every page as its size", async () => {
      const rows = [merger("Alphaco / Betaco merger inquiry"), ...fillers(1_200)];
      const files = pagesOf(rows);
      const bytes = Object.values(files).reduce(
        (sum, file) => sum + Buffer.byteLength(file.body),
        0,
      );
      const snapshot = await downloadOf(rows);
      expect(snapshot.bodies).toHaveLength(1);
      expect(snapshot.bytes).toBe(bytes);
    });
  });

  describe("a case in the real shape", () => {
    it("gives one record for each party of a merger, with its text word for word", async () => {
      const row = merger(
        "Examplesoft, Inc (now Example Platforms, Inc) / Gifly, Inc merger inquiry",
        {
          opened: "2023-01-02",
          closed: "2024-05-06",
        },
      );
      const { parsed } = await runOf([row]);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
      expect(parsed.root).toBe("search.json");
      expect(idsOf(parsed.records)).toEqual(["cma:examplesoft", "cma:gifly"]);
      const record = recordOfId(parsed.records, "examplesoft");
      expect(record.recordType).toBe("competition_case_summary");
      expect(record.title).toBe("CMA cases: Examplesoft, Inc");
      expect(record.url).toBe(`${SITE}/cma-cases/example-case-1`);
      expect(record.publishedAt).toBe("2024-05-06");
      expect(record.sourceUpdatedAt).toBeNull();
      expect(record.matchKeys).toEqual([
        "name:examplesoftinc",
        "name:examplesoft",
        "name:exampleplatformsinc",
        "name:exampleplatforms",
      ]);
      expect(record.identifiers).toEqual({
        party: "Examplesoft, Inc",
        cases: 1,
        open: 0,
        newest: "2024-05-06",
        aliases: ["Example Platforms, Inc"],
      });
      expect(record.summary).toBe(
        [
          FIRST_SENTENCE,
          SECOND_SENTENCE,
          "Party as written in the case titles: Examplesoft, Inc.",
          "Cases kept: 1 (merger 1), 0 open.",
          `Newest: ${cp(0x201c)}Examplesoft, Inc (now Example Platforms, Inc) / Gifly, Inc merger inquiry${cp(0x201d)} (merger, closed, mergers phase 2 prohibition, 2024-05-06).`,
          CLOSING,
        ].join(" "),
      );
      const other = recordOfId(parsed.records, "gifly");
      expect(other.title).toBe("CMA cases: Gifly, Inc");
      expect(other.matchKeys).toEqual(["name:giflyinc", "name:gifly"]);
      expect(other.identifiers).toEqual({
        party: "Gifly, Inc",
        cases: 1,
        open: 0,
        newest: "2024-05-06",
      });
      expectWellFormedRecords(parsed.records, { sourceId: "uk_cma", mark: MARK });
    });

    it("begins every summary with the mark, then the sentence that says what an entry is not", async () => {
      const { records } = await runOf([merger("Alphaco / Betaco merger inquiry")]);
      expect(records).toHaveLength(2);
      for (const record of records) {
        expect(record.summary.startsWith(MARK)).toBe(true);
        expect(
          record.summary.startsWith(
            `${FIRST_SENTENCE} ${SECOND_SENTENCE} Party as written in the case titles: `,
          ),
        ).toBe(true);
        expect(record.summary.endsWith(CLOSING)).toBe(true);
      }
    });

    it("says nothing of the party's conduct, and names no endorsement or finding", async () => {
      const { records } = await runOf([
        consumer("Acme Gyms Limited", { outcome: "consumer-enforcement-undertakings" }),
      ]);
      const text = `${records[0].title} ${records[0].summary}`;
      expect(text).toContain("it is not a finding against the party unless its outcome says so");
      expect(text).not.toMatch(
        /\b(certif\w*|endors\w*|guarantee\w*|violat\w*|breach\w*|guilty)\b/i,
      );
    });

    it("writes the outcome as the CMA's own words, and none as no outcome recorded", async () => {
      const { records } = await runOf([
        consumer("Acme Gyms Limited", { n: 1, outcome: "consumer-enforcement-undertakings" }),
        consumer("Zorbex Trading Limited", { n: 2, outcome: null }),
      ]);
      expect(recordOfId(records, "acmegyms").summary).toContain(
        "(consumer protection, closed, consumer enforcement undertakings, 2024-05-06)",
      );
      expect(recordOfId(records, "zorbextrading").summary).toContain(
        "(consumer protection, closed, no outcome recorded, 2024-05-06)",
      );
    });

    it("keeps the type of the case as its label in the summary, for each of the five types", async () => {
      const cases = [
        ["mergers", "merger"],
        ["ca98-and-civil-cartels", "competition (CA98 or cartel)"],
        ["consumer-enforcement", "consumer protection"],
        ["criminal-cartels", "criminal cartel"],
        ["digital-markets-unit", "digital markets"],
      ];
      for (const [type, label] of cases) {
        const title =
          type === "mergers"
            ? "Zorbex Systems / Quillon Data merger inquiry"
            : `Zorbex Systems Limited: consumer protection enforcement case`;
        const { records } = await runOf([caseOf({ type, title })]);
        const record = recordOfId(records, "zorbexsystems");
        expect(record.summary).toContain(`Cases kept: 1 (${label} 1), 0 open.`);
      }
    });

    it("reads the type and the state as one text as well as a list, and the first of a longer list", async () => {
      const { records } = await runOf([
        merger("Alphaco / Betaco merger inquiry", { n: 1, rawType: "mergers", rawState: "closed" }),
        merger("Gammaco / Deltaco merger inquiry", {
          n: 2,
          rawType: ["mergers", "markets"],
          rawState: ["closed", "open"],
        }),
      ]);
      expect(idsOf(records)).toEqual(["cma:alphaco", "cma:betaco", "cma:deltaco", "cma:gammaco"]);
      expect(recordOfId(records, "gammaco").summary).toContain("0 open.");
    });

    it("keeps no field that it does not read: the description, the market sector as a list or as a bare text", async () => {
      const run = await runOf([
        merger("Alphaco / Betaco merger inquiry", { n: 1 }),
        merger("Gammaco / Deltaco merger inquiry", { n: 2, bareSector: true }),
      ]);
      expect(run.records).toHaveLength(4);
      const text = textOfRun(run);
      for (const planted of [...Object.values(LEFT_OUT), "ZZ-"])
        expect(text).not.toContain(planted);
    });

    it("never takes the day of republication for a day of a case", async () => {
      const { records } = await runOf([
        merger("Alphaco / Betaco merger inquiry", { n: 1, opened: null, closed: null }),
        merger("Gammaco / Deltaco merger inquiry", { n: 2, opened: "2022-02-03", closed: null }),
      ]);
      for (const record of records) {
        expect(record.publishedAt).not.toBe(STAMP_DAY);
        expect(JSON.stringify(record)).not.toContain(STAMP_DAY);
      }
      expect(recordOfId(records, "alphaco").publishedAt).toBeNull();
      expect(recordOfId(records, "gammaco").publishedAt).toBe("2022-02-03");
    });

    it("gives records of a different address each: the page of the newest case of the party", async () => {
      const { records } = await runOf([
        merger("Alphaco / Betaco merger inquiry", { n: 1 }),
        merger("Gammaco / Deltaco merger inquiry", { n: 2 }),
      ]);
      expect(recordOfId(records, "alphaco").url).toBe(`${SITE}/cma-cases/example-case-1`);
      expect(recordOfId(records, "betaco").url).toBe(`${SITE}/cma-cases/example-case-1`);
      expect(recordOfId(records, "gammaco").url).toBe(`${SITE}/cma-cases/example-case-2`);
    });
  });

  describe("the cases that are kept", () => {
    const DROPPED_OUTCOMES = [
      "ca98-no-grounds-for-action-non-infringement",
      "ca98-administrative-priorities",
      "consumer-enforcement-no-action",
    ];
    const NON_MERGER_TYPES = [
      "consumer-enforcement",
      "ca98-and-civil-cartels",
      "criminal-cartels",
      "digital-markets-unit",
    ];

    /** Whether a case of the type, state and outcome gives a record, by a title that gives a party to any type. */
    async function isKept(type: string, state: string, outcome: string | null): Promise<boolean> {
      const title =
        type === "mergers"
          ? "Zorbex Systems / Quillon Data merger inquiry"
          : "Zorbex Systems Limited: consumer protection enforcement case";
      const { records, parsed } = await runOf([caseOf({ type, state, outcome, title })]);
      expect(parsed.errors).toBe(0);
      return records.length > 0;
    }

    it.each(NON_MERGER_TYPES)(
      "keeps a closed case of type %s with no outcome and with any other outcome",
      async (type) => {
        expect(await isKept(type, "closed", null)).toBe(true);
        expect(await isKept(type, "closed", "ca98-infringement-chapter-i")).toBe(true);
        expect(await isKept(type, "open", null)).toBe(true);
      },
    );

    it.each(NON_MERGER_TYPES)(
      "drops a case of type %s that closed with an outcome of no action, whichever of the three it is",
      async (type) => {
        for (const outcome of DROPPED_OUTCOMES) {
          expect(await isKept(type, "closed", outcome)).toBe(false);
          expect(await isKept(type, "open", outcome)).toBe(false);
        }
      },
    );

    it.each([
      ["open", null],
      ["open", "mergers-phase-1-clearance"],
      ["open", "mergers-phase-2-prohibition"],
      ["closed", "mergers-phase-2-prohibition"],
      ["closed", "mergers-phase-2-clearance-with-remedies"],
      ["closed", "mergers-phase-1-clearance-with-undertakings-in-lieu"],
    ])("keeps a merger that is %s with the outcome %s", async (state, outcome) => {
      expect(await isKept("mergers", state, outcome)).toBe(true);
    });

    it.each([
      ["closed", null],
      ["closed", "mergers-phase-1-clearance"],
      ["closed", "mergers-phase-2-clearance"],
      ["closed", "mergers-found-not-to-qualify"],
      ["closed", "mergers-phase-1-referral"],
      ["closed", "ca98-infringement-chapter-i"],
    ])("drops a merger that is %s with the outcome %s", async (state, outcome) => {
      expect(await isKept("mergers", state, outcome)).toBe(false);
    });

    it.each([
      "sau-referral",
      "markets",
      "regulatory-references-and-appeals",
      "review-of-orders-and-undertakings",
      "competition-disqualification",
      "oim-project",
      "information-and-advice-to-government",
      "a-type-that-is-new",
    ])("drops a case of type %s, open or closed, whatever its title gives", async (type) => {
      expect(await isKept(type, "closed", null)).toBe(false);
      expect(await isKept(type, "open", null)).toBe(false);
      const { records } = await runOf([
        caseOf({
          type,
          state: "open",
          outcome: null,
          title: "Zorbex Systems Limited: consumer protection enforcement case",
        }),
      ]);
      expect(records).toEqual([]);
    });

    it("drops a case without counting it unreadable, and so does a kept case that gives no party", async () => {
      const { records, parsed, snapshot } = await runOf([
        caseOf({ n: 1, type: "sau-referral", title: "Filler" }),
        caseOf({
          n: 2,
          type: "consumer-enforcement",
          outcome: null,
          title: `Children${CURLY}s online games`,
        }),
      ]);
      expect(records).toEqual([]);
      expect(parsed.skipped).toBe(0);
      expect(parsed.errors).toBe(0);
      expect(bodyOf(snapshot).unreadable).toBe(0);
    });

    it("reads a case whose state is another word as a closed one", async () => {
      const { records } = await runOf([
        merger("Alphaco / Betaco merger inquiry", { state: "paused" }),
      ]);
      expect(recordOfId(records, "alphaco").summary).toContain("0 open.");
      expect(recordOfId(records, "alphaco").summary).toContain(", closed, ");
    });

    it("reads the type, the state and the outcome as one folded line: a blank or a no-break space does not change the word", async () => {
      const { records } = await runOf([
        merger("Alphaco / Betaco merger inquiry", {
          rawType: [` mergers${NBSP}`],
          rawState: [`open${NBSP}`],
          outcome: ` mergers-phase-2-prohibition${NBSP}`,
        }),
      ]);
      expect(idsOf(records)).toEqual(["cma:alphaco", "cma:betaco"]);
      const record = recordOfId(records, "alphaco");
      expect(record.identifiers).toMatchObject({ open: 1 });
      expect(record.publishedAt).toBeNull();
      expect(record.summary).toContain("(merger, open, mergers phase 2 prohibition, 2024-05-06)");
    });
  });

  describe("the parties of a merger (rule M)", () => {
    it.each([
      ["a slash between blanks", "Alphaco / Betaco merger inquiry", ["Alphaco", "Betaco"]],
      ["a slash with no blank", "Alphaco/Betaco merger inquiry", ["Alphaco", "Betaco"]],
      ["a slash and more blanks", "Alphaco  /   Betaco merger inquiry", ["Alphaco", "Betaco"]],
      [
        "three parts",
        "Alphaco / Betaco / Gammaco merger inquiry",
        ["Alphaco", "Betaco", "Gammaco"],
      ],
      ["an empty part", "Alphaco / / Betaco merger inquiry", ["Alphaco", "Betaco"]],
      ["commas around a part", "Alphaco, / Betaco, merger inquiry", ["Alphaco", "Betaco"]],
      ["no tail at all", "Alphaco / Betaco", ["Alphaco", "Betaco"]],
    ])("splits a title with %s", async (_name, title, expected) => {
      expect(await partiesOf(title)).toEqual(expected);
    });

    it.each([
      ["(OFT)", "Alphaco / Betaco / Gammaco (OFT)"],
      ["(CC)", "Alphaco / Betaco / Gammaco (CC)"],
      ["(CMA)", "Alphaco / Betaco / Gammaco (CMA)"],
      ["(OFT/CC)", "Alphaco / Betaco / Gammaco (OFT/CC)"],
      ["(OFT) after the merger tail", "Alphaco / Betaco / Gammaco merger inquiry (OFT)"],
      ["(CC) after the merger tail", "Alphaco / Betaco / Gammaco merger inquiries (CC)"],
      ["blanks around (OFT)", "Alphaco / Betaco / Gammaco   (OFT)  "],
    ])("takes the tail %s off the last party", async (_name, title) => {
      expect(await partiesOf(title)).toEqual(["Alphaco", "Betaco", "Gammaco"]);
    });

    it("takes a bracket of another word off no party: only OFT, CC, CMA and OFT/CC at the end", async () => {
      expect(await partiesOf("Alphaco / Betaco / Gammaco (UK)")).toEqual([
        "Alphaco",
        "Betaco",
        "Gammaco (UK)",
      ]);
      expect(await partiesOf("Alphaco (OFT) / Betaco")).toEqual(["Alphaco (OFT)", "Betaco"]);
      expect(await partiesOf("Alphaco / Betaco (oft)")).toEqual(["Alphaco", "Betaco (oft)"]);
    });

    it.each([
      "merger inquiry",
      "merger inquiries",
      "Merger Inquiry",
      "MERGER INQUIRY",
      "partnership merger inquiry",
      "joint venture merger inquiry",
      "partnership joint venture merger inquiry",
      "Joint Venture Merger Inquiry",
    ])("takes the tail %s off the last party, in any case", async (tail) => {
      expect(await partiesOf(`Alphaco / Betaco ${tail}`)).toEqual(["Alphaco", "Betaco"]);
    });

    it("takes a tail off only at the end, and only after a blank", async () => {
      expect(await partiesOf("Alphaco / Betaco merger inquiry of the sector")).toEqual([
        "Alphaco",
        "Betaco merger inquiry of the sector",
      ]);
      expect(await partiesOf("Alphaco / Betacomerger inquiry")).toEqual([
        "Alphaco",
        "Betacomerger inquiry",
      ]);
    });

    it.each([
      ["(now X)", "Examplesoft, Inc (now Example Platforms, Inc) / Gifly, Inc"],
      ["(formerly X)", "Examplesoft, Inc (formerly Example Platforms, Inc) / Gifly, Inc"],
      ["(NOW X) in capitals", "Examplesoft, Inc (NOW Example Platforms, Inc) / Gifly, Inc"],
    ])(
      "makes an alias of %s, which joins the names of its party and is no party",
      async (_name, title) => {
        const { records } = await runOf([merger(`${title} merger inquiry`)]);
        expect(idsOf(records)).toEqual(["cma:examplesoft", "cma:gifly"]);
        const record = recordOfId(records, "examplesoft");
        for (const key of [
          "name:examplesoftinc",
          "name:examplesoft",
          "name:exampleplatformsinc",
          "name:exampleplatforms",
        ]) {
          expect(hasKey(record, key)).toBe(true);
        }
        expect(recordOfId(records, "gifly").matchKeys).toEqual(["name:giflyinc", "name:gifly"]);
        expect(record.identifiers).toMatchObject({ aliases: ["Example Platforms, Inc"] });
        expect(record.title).toBe("CMA cases: Examplesoft, Inc");
      },
    );

    it("takes the alias that begins at the first bracket and ends at the last, and a bracket of another word is no alias", async () => {
      const { records } = await runOf([
        merger("Examplesoft (now Example Platforms (UK)) / Gifly merger inquiry"),
      ]);
      expect(recordOfId(records, "examplesoft").identifiers).toMatchObject({
        aliases: ["Example Platforms (UK)"],
      });
      const nested = await runOf([
        merger("Examplesoft (now Example (formerly Old Name)) / Gifly merger inquiry"),
      ]);
      expect(idsOf(nested.records)).toEqual(["cma:examplesoft", "cma:gifly"]);
      expect(recordOfId(nested.records, "examplesoft").identifiers).toMatchObject({
        aliases: ["Example (formerly Old Name)"],
      });
      expect(await partiesOf("Examplesoft (UK) / Gifly merger inquiry")).toEqual([
        "Examplesoft (UK)",
        "Gifly",
      ]);
      expect(await partiesOf("Examplesoft (nowhere) / Gifly merger inquiry")).toEqual([
        "Examplesoft (nowhere)",
        "Gifly",
      ]);
    });

    it("takes a comma and a blank at the ends of an alias and of a party off", async () => {
      const { records } = await runOf([
        merger("Examplesoft , (now Example Platforms ,) / Gifly merger inquiry"),
      ]);
      expect(idsOf(records)).toEqual(["cma:examplesoft", "cma:gifly"]);
      const record = recordOfId(records, "examplesoft");
      expect(record.title).toBe("CMA cases: Examplesoft");
      expect(record.identifiers).toMatchObject({ aliases: ["Example Platforms"] });
    });

    it.each([
      ["Completed", "Completed acquisition by Alphaco, Inc of Betaco, Inc"],
      ["Anticipated", "Anticipated acquisition by Alphaco, Inc of Betaco, Inc"],
      ["Proposed", "Proposed acquisition by Alphaco, Inc of Betaco, Inc"],
      ["Minority", "Minority acquisition by Alphaco, Inc of Betaco, Inc"],
      ["in capitals", "COMPLETED ACQUISITION BY Alphaco, Inc OF Betaco, Inc"],
      [
        "with the merger tail",
        "Completed acquisition by Alphaco, Inc of Betaco, Inc merger inquiry",
      ],
    ])("reads the buyer and the target of a title that begins %s", async (_name, title) => {
      expect(await partiesOf(title)).toEqual(["Alphaco, Inc", "Betaco, Inc"]);
    });

    it("splits the acquisition title at the first of, and at no other word", async () => {
      expect(await partiesOf("Completed acquisition by Alphaco of Betaco of Europe")).toEqual([
        "Alphaco",
        "Betaco of Europe",
      ]);
      expect(await partiesOf("Completed acquisition by Alphaco")).toEqual([]);
      expect(await partiesOf("Acquisition by Alphaco of Betaco")).toEqual([]);
      expect(await partiesOf("Completed purchase by Alphaco of Betaco")).toEqual([]);
      expect(await partiesOf("Sale: Completed acquisition by Alphaco of Betaco")).toEqual([]);
    });

    it("prefers the slash to the acquisition form, and gives no party to a merger that has neither", async () => {
      expect(await partiesOf("Completed acquisition by Alphaco of Betaco / Gammaco")).toEqual([
        "Completed acquisition by Alphaco of Betaco",
        "Gammaco",
      ]);
      expect(await partiesOf("Alphaco merger inquiry")).toEqual([]);
      expect(await partiesOf("The inquiry into a market")).toEqual([]);
    });

    it("does not read the colon form, the possessive form or the conduct form of a title that a merger has", async () => {
      expect(await partiesOf("Alphaco Limited: consumer protection enforcement case")).toEqual([]);
      expect(await partiesOf(`Investigation into Alphaco${CURLY}s ad tech`)).toEqual([]);
    });

    it("reads the conduct form of a merger title that the merger rule gave no party", async () => {
      expect(await partiesOf("Review of conduct by Examplecorp in the sector")).toEqual([
        "Examplecorp",
      ]);
    });
  });

  describe("the parties of the other cases (rules C, P and B)", () => {
    it.each([
      ["consumer protection case", "Acme Gyms (UK) Limited: consumer protection case"],
      [
        "consumer protection enforcement case",
        "Acme Gyms (UK) Limited: consumer protection enforcement case",
      ],
      [
        "Consumer Protection Enforcement Case",
        "Acme Gyms (UK) Limited: Consumer Protection Enforcement Case",
      ],
      ["alleged", "Acme Gyms (UK) Limited: alleged breach of consumer law"],
      ["investigation", "Acme Gyms (UK) Limited: Investigation into pricing"],
      ["suspected", "Acme Gyms (UK) Limited: suspected anti-competitive conduct"],
      ["competition act", "Acme Gyms (UK) Limited: Competition Act 1998 investigation"],
      ["no blank after the colon", "Acme Gyms (UK) Limited:suspected anti-competitive conduct"],
    ])("reads the party of the colon form with the tail %s", async (_name, title) => {
      expect(await partiesOf(title, "consumer-enforcement", { outcome: null })).toEqual([
        "Acme Gyms (UK) Limited",
      ]);
      expect(await partiesOf(title, "ca98-and-civil-cartels", { outcome: null })).toEqual([
        "Acme Gyms (UK) Limited",
      ]);
    });

    it("keeps the brackets of the head of the colon form in the party, and its key without the legal form", async () => {
      const { records } = await runOf([consumer("Acme Gyms (UK) Limited")]);
      expect(records).toHaveLength(1);
      expect(records[0].sourceRecordId).toBe("cma:acmegymsuk");
      expect(records[0].matchKeys).toEqual(["name:acmegymsuklimited", "name:acmegymsuk"]);
    });

    it.each([
      "Acme Gyms Limited: something else",
      "Acme Gyms Limited: consumer protection",
      "Acme Gyms Limited: allegedly breaking the law",
      "Acme Gyms Limited: Suspectedly",
      "Acme Gyms Limited: a case",
      "Acme Gyms Limited consumer protection enforcement case",
    ])("gives no party to the title %s: the tail is not one of the six", async (title) => {
      expect(await partiesOf(title, "consumer-enforcement", { outcome: null })).toEqual([]);
    });

    it("takes the tail whole: it must match from its first word to the end, and after the first colon", async () => {
      expect(
        await partiesOf("Acme Gyms Limited: suspected: anything", "consumer-enforcement", {
          outcome: null,
        }),
      ).toEqual(["Acme Gyms Limited"]);
      expect(
        await partiesOf("Acme: Gyms Limited: suspected abuse", "consumer-enforcement", {
          outcome: null,
        }),
      ).toEqual([]);
    });

    it("reads a head of two to eighty characters, and no other", async () => {
      const long = `Zorbex${"A".repeat(74)}`;
      expect(long).toHaveLength(80);
      expect(
        await partiesOf(`${long}: suspected abuse`, "consumer-enforcement", { outcome: null }),
      ).toEqual([long]);
      expect(
        await partiesOf(`${long}A: suspected abuse`, "consumer-enforcement", { outcome: null }),
      ).toEqual([]);
      expect(
        await partiesOf("Qvxz: suspected abuse", "consumer-enforcement", { outcome: null }),
      ).toEqual(["Qvxz"]);
      expect(
        await partiesOf("Q: suspected abuse", "consumer-enforcement", { outcome: null }),
      ).toEqual([]);
      // A head of one character is no head: the title falls to the conduct form.
      expect(
        await partiesOf("Q: suspected conduct by Zorbex in markets", "consumer-enforcement", {
          outcome: null,
        }),
      ).toEqual(["Zorbex"]);
    });

    it("falls to the other rules when the head of the colon form holds no name", async () => {
      expect(
        await partiesOf(", : suspected conduct by Zorbex in markets", "consumer-enforcement", {
          outcome: null,
        }),
      ).toEqual(["Zorbex"]);
    });

    it("splits a head at a slash between blanks, and no other", async () => {
      expect(
        await partiesOf(
          "Acme Gyms Limited / Beta Fitness Limited: consumer protection enforcement case",
          "consumer-enforcement",
          { outcome: null },
        ),
      ).toEqual(["Acme Gyms Limited", "Beta Fitness Limited"]);
      expect(
        await partiesOf(
          "Acme/Gyms Limited: consumer protection enforcement case",
          "consumer-enforcement",
          { outcome: null },
        ),
      ).toEqual(["Acme/Gyms Limited"]);
    });

    it("makes an alias of a bracket at the end of a part of the head, as of a merger", async () => {
      const { records } = await runOf([consumer("Acme Gyms Limited (formerly Gymco Limited)")]);
      expect(idsOf(records)).toEqual(["cma:acmegyms"]);
      expect(hasKey(records[0], "name:gymco")).toBe(true);
    });

    const STOP_WORDS = [
      "sector",
      "sectors",
      "product",
      "products",
      "service",
      "services",
      "tablet",
      "tablets",
      "capsule",
      "capsules",
      "goods",
      "review",
      "fraud",
      "scheme",
      "manufacturers",
      "websites",
      "equipment",
      "homes",
      "aids",
      "drugs",
      "instruments",
      "dairy",
      "e-books",
      "contracts",
      "fares",
      "groups",
      "ophthalmology",
      "greenwashing",
      "retailer",
      "provision",
      "prosecution",
      "prosecutions",
      "iphones",
      "remicade",
      "transport",
      "care",
      "musical",
      "leisure",
      "mobility",
      "private",
      "property",
      "pharmaceutical",
      "entertainment",
      "business continuity",
      "loan",
    ];

    it.each(STOP_WORDS)(
      "rejects a head that holds the word %s and has no legal form",
      async (word) => {
        const head = `Zorbex ${word} Quillon`;
        expect(
          await partiesOf(`${head}: suspected anti-competitive conduct`, "consumer-enforcement", {
            outcome: null,
          }),
        ).toEqual([]);
        expect(
          await partiesOf(
            `${head.toUpperCase()}: suspected anti-competitive conduct`,
            "consumer-enforcement",
            { outcome: null },
          ),
        ).toEqual([]);
      },
    );

    it("accepts a head that holds a word of the stoplist only inside another word", async () => {
      expect(
        await partiesOf(
          "Zorbex Servicesco: suspected anti-competitive conduct",
          "consumer-enforcement",
          { outcome: null },
        ),
      ).toEqual(["Zorbex Servicesco"]);
      expect(
        await partiesOf(
          "Zorbex Careless: suspected anti-competitive conduct",
          "consumer-enforcement",
          { outcome: null },
        ),
      ).toEqual(["Zorbex Careless"]);
      expect(
        await partiesOf(
          "Zorbex Homestead: suspected anti-competitive conduct",
          "consumer-enforcement",
          { outcome: null },
        ),
      ).toEqual(["Zorbex Homestead"]);
    });

    it("accepts a head that holds a word of the stoplist only at the end of another word", async () => {
      for (const head of ["Zorbex Skincare", "Zorbex Eloan", "Zorbex Preview", "Zorbex Newgoods"]) {
        expect(
          await partiesOf(`${head}: suspected anti-competitive conduct`, "consumer-enforcement", {
            outcome: null,
          }),
        ).toEqual([head]);
      }
    });

    it.each([
      "Inc",
      "Inc.",
      "LLC",
      "Ltd",
      "Limited",
      "plc",
      "Corp",
      "GmbH",
      "Co.",
      "Corporation",
      "Company",
    ])("accepts a head of the stoplist that has the legal form %s", async (form) => {
      const head = `Zorbex products Quillon ${form}`;
      expect(
        await partiesOf(`${head}: suspected anti-competitive conduct`, "consumer-enforcement", {
          outcome: null,
        }),
      ).toEqual([head]);
    });

    it("takes the article, a group, holdings or a trust for no legal form, so that these heads are still rejected", async () => {
      for (const head of [
        "The Private Care Group",
        "Zorbex Care Holdings",
        "Zorbex Care Trust",
        "Private Care Partners",
        "Private Care The.",
      ]) {
        expect(
          await partiesOf(`${head}: suspected anti-competitive conduct`, "consumer-enforcement", {
            outcome: null,
          }),
        ).toEqual([]);
      }
    });

    it("lets the colon form win over the possessive and the conduct form, in the order of the rules", async () => {
      expect(
        await partiesOf(
          `Investigation into Zorbex${CURLY}s Quillon Limited: suspected abuse`,
          "ca98-and-civil-cartels",
          { outcome: null },
        ),
      ).toEqual([`Investigation into Zorbex${CURLY}s Quillon Limited`]);
      expect(
        await partiesOf(
          "Zorbex Limited: suspected conduct by Quillon in markets",
          "ca98-and-civil-cartels",
          { outcome: null },
        ),
      ).toEqual(["Zorbex Limited"]);
    });

    it("falls to the possessive and the conduct form when the head of the colon form is rejected", async () => {
      expect(
        await partiesOf(
          `Zorbex products: suspected conduct by Quillon in markets`,
          "ca98-and-civil-cartels",
          { outcome: null },
        ),
      ).toEqual(["Quillon"]);
    });

    it.each([
      ["a curly apostrophe", `Examplecorp${CURLY}s mobile platform`],
      ["a straight apostrophe", "Examplecorp's mobile platform"],
    ])("reads the party of a digital markets title with %s", async (_name, title) => {
      expect(await partiesOf(title, "digital-markets-unit", { outcome: null })).toEqual([
        "Examplecorp",
      ]);
    });

    it("reads a hyphen, a dot and an ampersand inside a word of a name of the possessive form and of the conduct form", async () => {
      expect(
        await partiesOf(`Zorbex-Quillon${CURLY}s mobile platform`, "digital-markets-unit", {
          outcome: null,
        }),
      ).toEqual(["Zorbex-Quillon"]);
      expect(
        await partiesOf(`Zorbex.io${CURLY}s mobile platform`, "digital-markets-unit", {
          outcome: null,
        }),
      ).toEqual(["Zorbex.io"]);
      expect(
        await partiesOf(
          "Suspected conduct by Zorbex-Quillon in ad tech",
          "ca98-and-civil-cartels",
          {
            outcome: null,
          },
        ),
      ).toEqual(["Zorbex-Quillon"]);
      expect(
        await partiesOf(
          "Suspected conduct by Zorbex&Quillon in ad tech",
          "ca98-and-civil-cartels",
          {
            outcome: null,
          },
        ),
      ).toEqual(["Zorbex&Quillon"]);
    });

    it("reads a name of up to five words before the possessive, and of no more", async () => {
      expect(
        await partiesOf(`Example Platforms of America${CURLY}s app store`, "digital-markets-unit", {
          outcome: null,
        }),
      ).toEqual(["Example Platforms of America"]);
      expect(
        await partiesOf(
          `Alpha Beta Gamma Delta Epsilon${CURLY}s app store`,
          "digital-markets-unit",
          { outcome: null },
        ),
      ).toEqual(["Alpha Beta Gamma Delta Epsilon"]);
      expect(
        await partiesOf(
          `Alpha Beta Gamma Delta Epsilon Zeta${CURLY}s app store`,
          "digital-markets-unit",
          { outcome: null },
        ),
      ).toEqual([]);
    });

    it("reads of, and, de and & as parts of a name, four of its words after the first at most", async () => {
      const dmu = { outcome: null };
      expect(
        await partiesOf(`Alpha and Beta de Gamma${CURLY}s app store`, "digital-markets-unit", dmu),
      ).toEqual(["Alpha and Beta de Gamma"]);
      expect(
        await partiesOf(`Alpha & Beta${CURLY}s app store`, "digital-markets-unit", dmu),
      ).toEqual(["Alpha & Beta"]);
      expect(
        await partiesOf(
          `Alpha and Beta de Gamma & Delta${CURLY}s app store`,
          "digital-markets-unit",
          dmu,
        ),
      ).toEqual([]);
      expect(
        await partiesOf(`Alpha and the Beta${CURLY}s app store`, "digital-markets-unit", dmu),
      ).toEqual([]);
    });

    it.each([
      ["no possessive", "Examplecorp mobile platform"],
      ["no blank after it", `Examplecorp${CURLY}smobile platform`],
      ["a lower case start", `examplecorp${CURLY}s mobile platform`],
      ["a lower case word before the name", `the Examplecorp${CURLY}s mobile platform`],
      ["no name", `${CURLY}s mobile platform`],
    ])("gives no party to a digital markets title with %s", async (_name, title) => {
      expect(await partiesOf(title, "digital-markets-unit", { outcome: null })).toEqual([]);
    });

    it("gives the party Children to a digital markets title that begins as the possessive form does", async () => {
      expect(
        await partiesOf(`Children${CURLY}s online games`, "digital-markets-unit", {
          outcome: null,
        }),
      ).toEqual(["Children"]);
    });

    it("gives no party to a title of another type that has the possessive but not its prefix", async () => {
      expect(
        await partiesOf(`Examplecorp${CURLY}s mobile platform`, "ca98-and-civil-cartels", {
          outcome: null,
        }),
      ).toEqual([]);
      expect(
        await partiesOf(`Children${CURLY}s online games`, "consumer-enforcement", {
          outcome: null,
        }),
      ).toEqual([]);
    });

    it.each([["Investigation into "], ["Suspected abuse of a dominant position in relation to "]])(
      "reads the possessive after the prefix %p, for any of the four types",
      async (prefix) => {
        for (const type of [
          "consumer-enforcement",
          "ca98-and-civil-cartels",
          "criminal-cartels",
          "digital-markets-unit",
        ]) {
          expect(
            await partiesOf(`${prefix}Examplecorp${CURLY}s search services`, type, {
              outcome: null,
            }),
          ).toEqual(["Examplecorp"]);
        }
      },
    );

    it("takes the prefix as it is written: in that case, and at the start", async () => {
      expect(
        await partiesOf(
          `investigation into Examplecorp${CURLY}s search`,
          "ca98-and-civil-cartels",
          { outcome: null },
        ),
      ).toEqual([]);
      expect(
        await partiesOf(
          `An investigation into Examplecorp${CURLY}s search`,
          "ca98-and-civil-cartels",
          { outcome: null },
        ),
      ).toEqual([]);
    });

    it.each([
      [
        "in",
        "Investigation into suspected anti-competitive conduct by Examplecorp in ad tech",
        "Examplecorp",
      ],
      ["of", "Suspected conduct by Examplecorp of America of the group", "Examplecorp of America"],
      ["on", "Suspected behaviour by Examplecorp on the market for ads", "Examplecorp"],
      ["and", "Alleged conduct by Examplecorp and others", "Examplecorp"],
      ["the end of the title", "Suspected anti-competitive conduct by Examplecorp", "Examplecorp"],
      [
        "behaviour",
        "Suspected anti-competitive behaviour by Examplecorp in ad tech",
        "Examplecorp",
      ],
      [
        "a name of several words",
        "Suspected conduct by Example Platforms of America in ad tech",
        "Example Platforms of America",
      ],
    ])(
      "reads the party of the conduct form that is followed by %s",
      async (_name, title, party) => {
        expect(await partiesOf(title, "ca98-and-civil-cartels", { outcome: null })).toEqual([
          party,
        ]);
      },
    );

    it.each([
      ["a comma after the name", "Suspected conduct by Examplecorp, in ad tech"],
      ["a word that the list lacks", "Suspected conduct by Examplecorp across ad tech"],
      ["a lower case name", "Suspected conduct by examplecorp in ad tech"],
      ["a word before conduct", "Suspected misconduct by Examplecorp in ad tech"],
      ["a word that is no by", "Suspected conduct of Examplecorp in ad tech"],
      ["conduct with a capital letter", "Conduct by Examplecorp in ad tech"],
      ["behaviour with a capital letter", "Behaviour by Examplecorp in ad tech"],
    ])("gives no party to the conduct form with %s", async (_name, title) => {
      expect(await partiesOf(title, "ca98-and-civil-cartels", { outcome: null })).toEqual([]);
    });

    it("reads a name of the conduct form that continues after a legal word", async () => {
      expect(
        await partiesOf(
          "Suspected conduct by Examplecorp and Betaco in ad tech",
          "ca98-and-civil-cartels",
          { outcome: null },
        ),
      ).toEqual(["Examplecorp and Betaco"]);
    });
  });

  describe("the parties that are dropped", () => {
    it.each([
      "Mr Example Trader",
      "Mrs Example Trader",
      "Ms Example Trader",
      "Miss Example Trader",
      "Mr. Example Trader",
      "Mrs. Example Trader",
    ])("drops the party %s, a person, and keeps the case for the others", async (name) => {
      expect(await partiesOf(`${name} / Zorbex Systems merger inquiry`)).toEqual([
        "Zorbex Systems",
      ]);
      expect(
        await partiesOf(`${name}: consumer protection enforcement case`, "consumer-enforcement", {
          outcome: null,
        }),
      ).toEqual([]);
    });

    it("drops a person whichever rule reads the party, and keeps the other parties of the case", async () => {
      const open = { outcome: null };
      expect(
        await partiesOf(
          "Suspected conduct by Mr Example Trader in markets",
          "ca98-and-civil-cartels",
          open,
        ),
      ).toEqual([]);
      expect(
        await partiesOf(`Investigation into Ms Example${CURLY}s shop`, "criminal-cartels", open),
      ).toEqual([]);
      expect(await partiesOf(`Miss Example${CURLY}s app`, "digital-markets-unit", open)).toEqual(
        [],
      );
      expect(await partiesOf("Completed acquisition by Mrs Example of Zorbex Systems")).toEqual([
        "Zorbex Systems",
      ]);
      expect(await partiesOf("Completed acquisition by Zorbex Systems of Mr Example")).toEqual([
        "Zorbex Systems",
      ]);
      expect(
        await partiesOf(
          "Mr Example Trader / Zorbex Systems / Ms Example Seller / Quillon Data merger inquiry",
        ),
      ).toEqual(["Quillon Data", "Zorbex Systems"]);
    });

    it("keeps a party whose former or new name is a person's, without that name, and drops a party that is a person with its names", async () => {
      for (const alias of ["(formerly Mr Example Trader)", "(now Miss Example Trader)"]) {
        const { records } = await runOf([
          merger(`Zorbex Systems ${alias} / Quillon Data merger inquiry`),
        ]);
        expect(idsOf(records)).toEqual(["cma:quillondata", "cma:zorbexsystems"]);
        const record = recordOfId(records, "zorbexsystems");
        expect(record.identifiers).not.toHaveProperty("aliases");
        expect(record.matchKeys).toEqual(["name:zorbexsystems"]);
      }
      expect(
        await partiesOf("Mr Example Trader (now Zorbex Systems) / Quillon Data merger inquiry"),
      ).toEqual(["Quillon Data"]);
    });

    it("keeps a name that begins with the letters of an honorific and is no honorific", async () => {
      expect(await partiesOf("Mrkva Systems / Zorbex Systems merger inquiry")).toEqual([
        "Mrkva Systems",
        "Zorbex Systems",
      ]);
      expect(await partiesOf("Missouri Mills / Zorbex Systems merger inquiry")).toEqual([
        "Missouri Mills",
        "Zorbex Systems",
      ]);
      expect(await partiesOf("Mister Zorbex / Zorbex Systems merger inquiry")).toEqual([
        "Mister Zorbex",
        "Zorbex Systems",
      ]);
      expect(await partiesOf("MR EXAMPLE TRADER / Zorbex Systems merger inquiry")).toEqual([
        "MR EXAMPLE TRADER",
        "Zorbex Systems",
      ]);
    });

    it("keeps a name that has an honorific inside it: only the start of a party is read", async () => {
      expect(await partiesOf("Zorbex Mr Systems / Quillon Data merger inquiry")).toEqual([
        "Quillon Data",
        "Zorbex Mr Systems",
      ]);
      expect(await partiesOf("Alpha & Mrs Beta Ltd / Quillon Data merger inquiry")).toEqual([
        "Alpha & Mrs Beta Ltd",
        "Quillon Data",
      ]);
    });

    it("gives a person no record, key, name or identifier, and counts the case for the other party", async () => {
      // Nothing is asserted about the title of the case: it is the case's own, and the record of the
      // other party shows it as the list gives it.
      const run = await runOf([
        merger("Mr Example Trader / Zorbex Systems merger inquiry", { n: 1 }),
        merger("Zorbex Systems / Quillon Data merger inquiry", { n: 2 }),
        merger("Quillon Data / Mavro Labs merger inquiry", { n: 3 }),
      ]);
      expect(idsOf(run.records)).toEqual(["cma:mavrolabs", "cma:quillondata", "cma:zorbexsystems"]);
      expect(recordOfId(run.records, "zorbexsystems").identifiers).toMatchObject({ cases: 2 });
      expect(run.parsed.skipped).toBe(0);
      expect(bodyOf(run.snapshot).unreadable).toBe(0);
      for (const record of run.records) {
        expect(record.sourceRecordId).not.toContain("trader");
        expect(record.matchKeys.filter((key) => key.includes("trader"))).toEqual([]);
        expect(JSON.stringify(record.identifiers)).not.toContain("Trader");
      }
      for (const row of bodyOf(run.snapshot).rows) {
        expect(JSON.stringify([row.key, row.name, row.spellings, row.aliases])).not.toContain(
          "rader",
        );
      }
    });

    it("drops a party whose compact name has fewer than four letters and digits once its legal form is off", async () => {
      expect(await partiesOf("Abc Ltd / Qvx Systems merger inquiry")).toEqual(["Qvx Systems"]);
      expect(await partiesOf("Abc / Qvxy merger inquiry")).toEqual(["Qvxy"]);
      expect(await partiesOf("Ab 12 Ltd / Ab 1 Ltd merger inquiry")).toEqual(["Ab 12 Ltd"]);
      expect(await partiesOf("A-B-C / Quillon merger inquiry")).toEqual(["Quillon"]);
    });

    it("drops a party that the fold makes longer than a name may be, and keeps one of a hundred and twenty", async () => {
      const wide = (count: number): string => `Z${cp(0x337f).repeat(count)}`;
      expect(await partiesOf(`${wide(29)} / Quillon Data merger inquiry`)).toHaveLength(2);
      expect(await partiesOf(`${wide(30)} / Quillon Data merger inquiry`)).toEqual([
        "Quillon Data",
      ]);
    });
  });

  describe("one record for each party", () => {
    it("joins the cases that name a party with different spellings, and counts all of them", async () => {
      const { records } = await runOf([
        merger("Examplecorp Limited / Betaco merger inquiry", { n: 1, closed: "2023-01-10" }),
        merger("Examplecorp Ltd / Gammaco merger inquiry", { n: 2, closed: "2024-02-20" }),
      ]);
      const record = recordOfId(records, "examplecorp");
      expect(record.identifiers).toMatchObject({ cases: 2 });
      expect(record.title).toBe("CMA cases: Examplecorp Ltd");
      expect(record.matchKeys).toEqual([
        "name:examplecorpltd",
        "name:examplecorp",
        "name:examplecorplimited",
      ]);
      expect(record.publishedAt).toBe("2024-02-20");
      expect(record.url).toBe(`${SITE}/cma-cases/example-case-2`);
      expect(record.summary).toContain("Cases kept: 2 (merger 2), 0 open.");
    });

    it("shows the most frequent spelling of the party, and the newest of equally frequent ones", async () => {
      const { records } = await runOf([
        merger("Examplecorp Ltd / Betaco merger inquiry", { n: 1, closed: "2026-01-01" }),
        merger("Examplecorp Limited / Gammaco merger inquiry", { n: 2, closed: "2026-02-01" }),
        merger("Examplecorp Limited / Deltaco merger inquiry", { n: 3, closed: "2025-12-01" }),
        merger("Examplecorp Inc / Epsilonco merger inquiry", { n: 4, closed: "2026-03-01" }),
      ]);
      expect(recordOfId(records, "examplecorp").title).toBe("CMA cases: Examplecorp Limited");
      const tie = await runOf([
        merger("Examplecorp Ltd / Betaco merger inquiry", { n: 1, closed: "2026-01-01" }),
        merger("Examplecorp Limited / Gammaco merger inquiry", { n: 2, closed: "2026-02-01" }),
      ]);
      expect(recordOfId(tie.records, "examplecorp").title).toBe("CMA cases: Examplecorp Limited");
      const undated = await runOf([
        merger("Examplecorp Ltd / Betaco merger inquiry", { n: 1, closed: "2026-01-01" }),
        merger("Examplecorp Limited / Gammaco merger inquiry", {
          n: 2,
          opened: null,
          closed: null,
        }),
      ]);
      expect(recordOfId(undated.records, "examplecorp").title).toBe("CMA cases: Examplecorp Ltd");
    });

    it("takes for the newest day of a spelling the newest of all the cases that use it, not the first of them", async () => {
      const { records } = await runOf([
        merger("Examplecorp Ltd / Betaco merger inquiry", { n: 1, closed: "2020-01-01" }),
        merger("Examplecorp Limited / Gammaco merger inquiry", { n: 2, closed: "2022-01-01" }),
        merger("Examplecorp Ltd / Deltaco merger inquiry", { n: 3, closed: "2024-01-01" }),
        merger("Examplecorp Limited / Epsilonco merger inquiry", { n: 4, closed: "2021-01-01" }),
      ]);
      expect(recordOfId(records, "examplecorp").title).toBe("CMA cases: Examplecorp Ltd");
    });

    it("puts a spelling whose cases have no day after one that has a day, whichever of them the list names first", async () => {
      const dated = merger("Examplecorp Ltd / Betaco merger inquiry", {
        n: 1,
        closed: "2021-01-01",
      });
      const undated = merger("Examplecorp Limited / Gammaco merger inquiry", {
        n: 2,
        opened: null,
        closed: null,
      });
      for (const rows of [
        [dated, undated],
        [undated, dated],
      ]) {
        const { records } = await runOf(rows);
        expect(recordOfId(records, "examplecorp").title).toBe("CMA cases: Examplecorp Ltd");
      }
    });

    it("counts a case once for a party that it names twice, in two spellings", async () => {
      const { records } = await runOf([
        merger("Examplecorp Ltd / Examplecorp Limited merger inquiry"),
      ]);
      expect(records).toHaveLength(1);
      expect(records[0].identifiers).toMatchObject({ cases: 1 });
      expect(records[0].summary).toContain("Cases kept: 1 (merger 1), 0 open.");
    });

    it("counts the cases of a party by type, in the order of the summary, and the open ones", async () => {
      const { records } = await runOf([
        merger("Zorbex Systems / Quillon Data merger inquiry", {
          n: 1,
          state: "open",
          outcome: null,
          closed: null,
          opened: "2025-01-01",
        }),
        merger("Zorbex Systems / Mavro Labs merger inquiry", { n: 2 }),
        consumer("Zorbex Systems Limited", { n: 3 }),
        caseOf({
          n: 4,
          type: "criminal-cartels",
          outcome: null,
          title: "Zorbex Systems Limited: suspected cartel conduct",
        }),
        caseOf({
          n: 5,
          type: "ca98-and-civil-cartels",
          outcome: null,
          state: "open",
          closed: null,
          title: "Zorbex Systems Limited: suspected abuse",
        }),
        caseOf({
          n: 6,
          type: "digital-markets-unit",
          outcome: null,
          title: `Zorbex Systems${CURLY}s app store`,
        }),
      ]);
      const record = recordOfId(records, "zorbexsystems");
      expect(record.identifiers).toMatchObject({ cases: 6, open: 2 });
      expect(record.summary).toContain(
        "Cases kept: 6 (merger 2, competition (CA98 or cartel) 1, consumer protection 1, criminal cartel 1, digital markets 1), 2 open.",
      );
    });

    it("gives no day to a party that has an open case, and not even when a closed case has one", async () => {
      const open = merger("Zorbex Systems / Quillon Data merger inquiry", {
        n: 1,
        state: "open",
        outcome: null,
        closed: null,
        opened: "2022-05-25",
      });
      const only = await runOf([open]);
      expect(recordOfId(only.records, "zorbexsystems").publishedAt).toBeNull();
      expect(recordOfId(only.records, "zorbexsystems").summary).toContain(
        "0 ".replace("0", "1") + "open.",
      );
      const both = await runOf([
        open,
        merger("Zorbex Systems / Mavro Labs merger inquiry", { n: 2, closed: "2024-05-06" }),
      ]);
      expect(recordOfId(both.records, "zorbexsystems").publishedAt).toBeNull();
      expect(recordOfId(both.records, "zorbexsystems").identifiers).toMatchObject({
        newest: "2024-05-06",
        open: 1,
      });
      expect(recordOfId(both.records, "mavrolabs").publishedAt).toBe("2024-05-06");
    });

    it("gives the party that has only closed cases the day of the newest of them", async () => {
      const { records } = await runOf([
        merger("Zorbex Systems / Quillon Data merger inquiry", { n: 1, closed: "2021-05-25" }),
        merger("Zorbex Systems / Mavro Labs merger inquiry", { n: 2, closed: "2023-04-01" }),
      ]);
      expect(recordOfId(records, "zorbexsystems").publishedAt).toBe("2023-04-01");
    });

    it("dates a case by its closing day, else by its opening day, else by none", async () => {
      const dates = async (over: CaseOver): Promise<string | null> => {
        const { records } = await runOf([
          merger("Zorbex Systems / Quillon Data merger inquiry", over),
        ]);
        return recordOfId(records, "zorbexsystems").publishedAt;
      };
      expect(await dates({ opened: "2023-01-02", closed: "2024-05-06" })).toBe("2024-05-06");
      expect(await dates({ opened: "2023-01-02", closed: null })).toBe("2023-01-02");
      expect(await dates({ opened: "2023-01-02", closed: NO_CLOSED })).toBe("2023-01-02");
      expect(await dates({ opened: null, closed: "2024-05-06" })).toBe("2024-05-06");
      expect(await dates({ opened: null, closed: null })).toBeNull();
      expect(await dates({ opened: null, closed: NO_CLOSED })).toBeNull();
      expect(await dates({ opened: "2023-01-02", closed: "2024-13-45" })).toBe("2023-01-02");
      expect(await dates({ opened: "not a day", closed: "2024-5-6" })).toBeNull();
    });

    it("counts a case that has no day, and never takes it for the newest", async () => {
      const { records } = await runOf([
        merger("Zorbex Systems / Quillon Data merger inquiry", {
          n: 1,
          opened: null,
          closed: null,
        }),
        merger("Zorbex Systems / Mavro Labs merger inquiry", { n: 2, closed: "2021-05-25" }),
      ]);
      const record = recordOfId(records, "zorbexsystems");
      expect(record.identifiers).toMatchObject({ cases: 2 });
      expect(record.publishedAt).toBe("2021-05-25");
      expect(record.url).toBe(`${SITE}/cma-cases/example-case-2`);
      expect(record.summary).toContain("no date)");
    });

    it("shows the newest three cases of a party, by day and then by link, and counts them all", async () => {
      const cases = [
        merger("Zorbex Systems / Qa Qa merger inquiry".replace("Qa Qa", "Quillon"), {
          n: 1,
          closed: "2021-01-01",
          link: "/cma-cases/first",
        }),
        merger("Zorbex Systems / Quillon merger inquiry", {
          n: 2,
          closed: "2023-03-01",
          link: "/cma-cases/second",
        }),
        merger("Zorbex Systems / Quillon merger inquiry", {
          n: 3,
          closed: "2023-03-01",
          link: "/cma-cases/third",
        }),
        merger("Zorbex Systems / Quillon merger inquiry", {
          n: 4,
          closed: "2022-02-01",
          link: "/cma-cases/fourth",
        }),
        merger("Zorbex Systems / Quillon merger inquiry", {
          n: 5,
          closed: "2020-12-01",
          link: "/cma-cases/fifth",
        }),
      ];
      const { records } = await runOf(cases);
      const record = recordOfId(records, "zorbexsystems");
      expect(record.summary).toContain("Cases kept: 5 (merger 5), 0 open.");
      const newest = /Newest: (.*)\. Adapted/.exec(record.summary)?.[1] ?? "";
      const shown = newest
        .split("; ")
        .map((item) => /\(merger, closed, mergers phase 2 prohibition, ([^)]*)\)/.exec(item)?.[1]);
      expect(shown).toEqual(["2023-03-01", "2023-03-01", "2022-02-01"]);
      // The two newest tie on the day: the link decides, and the address is the first of them.
      expect(record.url).toBe(`${SITE}/cma-cases/second`);
    });

    it("puts the cases that have no day after those that have one, whichever of them the list names first", async () => {
      const dated = (n: number, day: string): Row =>
        merger("Zorbex Systems / Quillon merger inquiry", { n, closed: day });
      const undated = (n: number): Row =>
        merger("Zorbex Systems / Quillon merger inquiry", { n, opened: null, closed: null });
      for (const rows of [
        [undated(1), dated(2, "2020-01-01"), dated(3, "2022-01-01")],
        [dated(2, "2020-01-01"), dated(3, "2022-01-01"), undated(1)],
        [dated(3, "2022-01-01"), undated(1), dated(2, "2020-01-01")],
      ]) {
        const { snapshot } = await runOf(rows);
        const row = bodyOf(snapshot).rows.find((found) => found.key === "zorbexsystems");
        const items = (row?.items ?? []) as Array<{ date: string | null }>;
        expect(items.map((item) => item.date)).toEqual(["2022-01-01", "2020-01-01", null]);
      }
    });

    it("keeps the cases that the party has in the order of the day, however the list is ordered", async () => {
      const cases = [
        merger("Zorbex Systems / Quillon merger inquiry", { n: 1, closed: "2021-01-01" }),
        merger("Zorbex Systems / Quillon merger inquiry", { n: 2, closed: "2023-03-01" }),
        merger("Zorbex Systems / Mavro merger inquiry", { n: 3, closed: "2022-02-01" }),
      ];
      const forward = await runOf(cases);
      const backward = await runOf([...cases].reverse());
      expect(backward.snapshot.bodies).toEqual(forward.snapshot.bodies);
      expect(backward.parsed).toEqual(forward.parsed);
    });

    it("gives the same body for the same list however the cases are ordered, with the contract of the kit", async () => {
      const cases = [
        merger("Zorbex Systems / Quillon merger inquiry", { n: 1 }),
        consumer("Acme Gyms Limited", { n: 2 }),
        merger("Mavro Labs / Zorbex Systems merger inquiry", { n: 3, closed: "2022-02-01" }),
        ...fillers(30),
      ];
      await expectDeterministic(connectorOf(), (reversed) =>
        fakeFetch(pagesOf(reversed ? [...cases].reverse() : cases)),
      );
    });

    it("keeps the names of the party to ten spellings and aliases together, the spellings first", async () => {
      const forms = [
        "Ltd",
        "Limited",
        "Inc",
        "LLC",
        "PLC",
        "Corp",
        "Co",
        "GmbH",
        "AG",
        "SA",
        "BV",
        "NV",
      ];
      const cases = forms.map((form, at) =>
        merger(
          `Examplecorp ${form} / Partner${String.fromCharCode(97 + at).repeat(4)} merger inquiry`,
          { n: at + 1 },
        ),
      );
      const { records } = await runOf(cases);
      const record = recordOfId(records, "examplecorp");
      const names = record.matchKeys.filter((key) => key.startsWith("name:"));
      expect(names).toHaveLength(11);
      expect(names).toContain("name:examplecorp");
      expect(names).toContain("name:examplecorpnv");
      expect(names).not.toContain("name:examplecorpplc");
      expect(names).not.toContain("name:examplecorpsa");
      expect(record.identifiers).toMatchObject({ cases: 12 });
    });

    it("puts the aliases after the spellings in the names, in their own order, and keeps ten names in all", async () => {
      // Nine aliases, met from the last letter to the first: the order of the list is not the order of the names.
      const cases = Array.from({ length: 9 }, (_, at) => {
        const letter = String.fromCharCode(97 + 8 - at);
        return merger(
          `Examplecorp (formerly Oldname${letter.repeat(3)}) / Partner${letter.repeat(4)} merger inquiry`,
          { n: at + 1 },
        );
      });
      cases.push(merger("Examplecorp Ltd / Partnerzzzz merger inquiry", { n: 10 }));
      const { records } = await runOf(cases);
      const record = recordOfId(records, "examplecorp");
      // Two spellings, and the first eight of the nine aliases once they are sorted.
      const letters = ["a", "b", "c", "d", "e", "f", "g", "h"];
      expect(record.matchKeys.filter((key) => key.startsWith("name:"))).toEqual([
        "name:examplecorp",
        "name:examplecorpltd",
        ...letters.map((letter) => `name:oldname${letter.repeat(3)}`),
      ]);
      expect(record.identifiers).toMatchObject({
        aliases: letters.map((letter) => `Oldname${letter.repeat(3)}`),
      });
    });

    it("sorts the aliases of an entity, whatever the order of the cases that give them", async () => {
      const { records } = await runOf([
        merger("Examplecorp (now Zeta Works) / Betaco merger inquiry", { n: 1 }),
        merger("Examplecorp (now Alpha Works) / Gammaco merger inquiry", { n: 2 }),
      ]);
      expect(recordOfId(records, "examplecorp").identifiers).toMatchObject({
        aliases: ["Alpha Works", "Zeta Works"],
      });
    });

    it("tells two spellings of a party apart only by their letters and digits", async () => {
      const { records } = await runOf([
        merger("Zorbex Web Services / Quillon Data merger inquiry", { n: 1 }),
        merger("ZORBEX WEB SERVICES LIMITED / Mavro Labs merger inquiry", { n: 2 }),
        merger("The Zorbex Web Services Company / Plynth Works merger inquiry", { n: 3 }),
        merger("Zorbex / Brannock Cloud merger inquiry", { n: 4 }),
      ]);
      expect(recordOfId(records, "zorbexwebservices").identifiers).toMatchObject({ cases: 3 });
      expect(recordOfId(records, "zorbex").identifiers).toMatchObject({ cases: 1 });
    });

    it("gives a party its id from the compact name without the legal form, however long the name is", async () => {
      const long = `Zorbex${"a".repeat(100)}`;
      const { records } = await runOf([merger(`${long} Limited / Quillon Data merger inquiry`)]);
      expect(recordOfId(records, long.toLowerCase()).sourceRecordId).toBe(
        `cma:${long.toLowerCase()}`,
      );
      expect(recordOfId(records, "quillondata")).toBeDefined();
    });

    it("gives the same body for the same list read on two different days: no clock is read", async () => {
      const cases = [
        merger("Zorbex Systems / Quillon merger inquiry", { n: 1, closed: "2024-05-06" }),
      ];
      jest.useFakeTimers({
        doNotFake: [
          "nextTick",
          "queueMicrotask",
          "setImmediate",
          "clearImmediate",
          "setTimeout",
          "clearTimeout",
          "setInterval",
          "clearInterval",
          "performance",
          "hrtime",
        ],
      });
      try {
        jest.setSystemTime(new Date("2026-11-10T00:00:00Z"));
        const first = await runOf(cases);
        jest.setSystemTime(new Date("2029-03-01T12:00:00Z"));
        const second = await runOf(cases);
        expect(second.snapshot.bodies).toEqual(first.snapshot.bodies);
        expect(second.parsed).toEqual(first.parsed);
      } finally {
        jest.useRealTimers();
      }
    });

    it("writes the body with its rows in the order of their keys, not of their names", async () => {
      const { snapshot } = await runOf([
        merger("Abd Works / ABE Works merger inquiry", { n: 1 }),
        merger("Zorbex Systems / Mavro Labs merger inquiry", { n: 2 }),
      ]);
      const keys = bodyOf(snapshot).rows.map((row) => row.key);
      expect(keys).toEqual([...keys].sort());
      expect(keys).toEqual(["abdworks", "abeworks", "mavrolabs", "zorbexsystems"]);
    });
  });

  describe("the number of entities", () => {
    it("has as its total the rows that it saw, or its entities and unreadable rows when they are more: a row can name several parties", async () => {
      // One row, three parties: more entities than rows. The kit refuses a total below the rows it holds.
      const run = await runOf([merger("Alphaco / Betaco / Gammaco merger inquiry")]);
      expect(run.records).toHaveLength(3);
      expect(bodyOf(run.snapshot).total).toBe(3);
      expect(run.parsed.errors).toBe(0);
      expect(run.parsed.root).toBe("search.json");
    });

    it("adds the unreadable rows to the entities when the two are more than the rows", async () => {
      const bad = caseOf({ n: 2, title: 7 });
      const run = await runOf([merger("Alphaco / Betaco / Gammaco merger inquiry"), bad]);
      expect(run.records).toHaveLength(3);
      expect(bodyOf(run.snapshot).unreadable).toBe(1);
      expect(bodyOf(run.snapshot).total).toBe(4);
    });

    it("has as its total the rows that it read when they are more than its entities", async () => {
      const run = await runOf([merger("Alphaco / Betaco merger inquiry"), ...fillers(8)]);
      expect(bodyOf(run.snapshot).total).toBe(9);
      expect(run.records).toHaveLength(2);
    });

    it("reads 5,000 parties, and fails as not the list for 5,001: no list of this kind is so long", async () => {
      // Forty parties of eight letters and digits in a title: 452 characters, under the 500 that are read.
      const party = (at: number): string => `Qvx${String(at).padStart(5, "0")}`;
      const rowsOf = (count: number): Row[] =>
        Array.from({ length: count / 40 }, (_, row) =>
          merger(
            `${Array.from({ length: 40 }, (__, at) => party(row * 40 + at)).join(" / ")} merger inquiry`,
            { n: row + 1 },
          ),
        );
      const exact = await runOf(rowsOf(5_000));
      expect(exact.records).toHaveLength(5_000);
      expect(exact.parsed.errors).toBe(0);
      const one = merger(`${party(5_000)} / ${party(0)} merger inquiry`, { n: 9_999 });
      expect(await failureOf(downloadOf([...rowsOf(5_000), one]))).toBeInstanceOf(NotTheListError);
    });
  });

  describe("what a row holds that it must not give", () => {
    it("leaves out every field that it does not read, and the text of a case that is not kept", async () => {
      const run = await runOf([
        merger("Alphaco / Betaco merger inquiry", { n: 1 }),
        caseOf({ n: 2, type: "sau-referral", title: "ZZ-DROPPED-CASE" }),
        caseOf({
          n: 3,
          type: "mergers",
          outcome: "mergers-phase-1-clearance",
          title: "ZZ-CLEARED / ZZ-MERGER merger inquiry",
        }),
      ]);
      const text = textOfRun(run);
      for (const planted of [
        ...Object.values(LEFT_OUT),
        "ZZ-DROPPED-CASE",
        "ZZ-CLEARED",
        "ZZ-MERGER",
      ]) {
        expect(text).not.toContain(planted);
      }
    });

    it("keeps the title of a kept case that gives no party in no body and no record", async () => {
      const run = await runOf([
        caseOf({
          n: 1,
          type: "consumer-enforcement",
          outcome: null,
          title: "ZZ-NO-PARTY sector review",
        }),
      ]);
      expect(run.records).toEqual([]);
      expect(textOfRun(run)).not.toContain("ZZ-NO-PARTY");
    });

    it("never gives a sector, a description or a date of republication, whatever shape the sector has", async () => {
      const run = await runOf([
        merger("Alphaco / Betaco merger inquiry", { n: 1, bareSector: true }),
        merger("Gammaco / Deltaco merger inquiry", { n: 2 }),
      ]);
      const text = textOfRun(run);
      expect(text).not.toContain("ZZ-");
      expect(text).not.toContain(STAMP_DAY);
    });
  });

  describe("hostile titles", () => {
    it("takes the characters nobody sees, the no-break spaces, the tabs and the double spaces out of a name", async () => {
      const title = `Zorbex${ZWSP}${NBSP}${NBSP}Systems${LRM}\t Ltd${RLO} / Quillon${NBSP} Data merger${NBSP}inquiry`;
      const { records } = await runOf([merger(title)]);
      expect(idsOf(records)).toEqual(["cma:quillondata", "cma:zorbexsystems"]);
      expect(recordOfId(records, "zorbexsystems").title).toBe("CMA cases: Zorbex Systems Ltd");
      expectWellFormedRecords(records, { sourceId: "uk_cma", mark: MARK });
    });

    it("reads a title with blanks and tabs around it and double blanks inside as the same title without them", async () => {
      const spaced = await runOf([
        merger(`  \t Zorbex   Systems  /\tQuillon   Data   merger   inquiry \t `),
      ]);
      const plain = await runOf([merger("Zorbex Systems / Quillon Data merger inquiry")]);
      expect(spaced.records).toEqual(plain.records);
    });

    it("gives the same record for a name with a hidden character in the middle of a word and the name without it", async () => {
      const hidden = await runOf([merger(`Zor${ZWSP}bex Systems / Quillon Data merger inquiry`)]);
      const plain = await runOf([merger("Zorbex Systems / Quillon Data merger inquiry")]);
      expect(hidden.records).toEqual(plain.records);
    });

    it("writes no angle bracket in a record, whatever markup a title holds, and keeps the name that it has", async () => {
      const { records } = await runOf([
        merger(
          `Zorbex <b>Systems</b> / Quillon ${cp(0xff1c)}script${cp(0xff1e)} Data (now Old <Name>) merger inquiry`,
        ),
      ]);
      expect(records.length).toBeGreaterThan(0);
      expect(records.some((record) => "aliases" in record.identifiers)).toBe(true);
      for (const record of records) {
        expect(`${record.title}${record.summary}${JSON.stringify(record.identifiers)}`).not.toMatch(
          /[<>]/,
        );
      }
      expectWellFormedRecords(records, { sourceId: "uk_cma", mark: MARK });
    });

    it("replaces a lone surrogate, and keeps none in the body of the snapshot nor in a record", async () => {
      const run = await runOf([
        merger(`Zorbex Systems${LONE_SURROGATE} Ltd / Quillon Data merger inquiry`),
      ]);
      expect(run.records).toHaveLength(2);
      expect(textOfRun(run)).not.toMatch(/\\ud[89a-f][0-9a-f]{2}/i);
      for (const record of run.records) {
        expect(record.title).not.toMatch(/[\u{D800}-\u{DFFF}]/u);
        expect(record.summary).not.toMatch(/[\u{D800}-\u{DFFF}]/u);
      }
      expectWellFormedRecords(run.records, { sourceId: "uk_cma", mark: MARK });
    });

    /**
     * A merger title of exactly `length` characters. The filler makes the second party longer than a
     * name may be, so that only the first party is kept.
     */
    const titleOf = (length: number): string => {
      const head = "Zorbex Systems / Quillon Data";
      const tail = " merger inquiry";
      const filler = length - head.length - tail.length;
      return `${head}${" x".repeat(Math.floor(filler / 2))}${"x".repeat(filler % 2)}${tail}`;
    };

    it("reads a title of exactly five hundred characters, and counts one of five hundred and one as unreadable", async () => {
      const exact = titleOf(500);
      const over = titleOf(501);
      expect(exact).toHaveLength(500);
      expect(over).toHaveLength(501);
      const read = await runOf([merger(exact)]);
      expect(idsOf(read.records)).toEqual(["cma:zorbexsystems"]);
      expect(bodyOf(read.snapshot).unreadable).toBe(0);
      const unread = await runOf([merger(over)]);
      expect(unread.records).toEqual([]);
      expect(bodyOf(unread.snapshot).unreadable).toBe(1);
    });

    it("counts a title over five hundred characters as unreadable whatever its length is: a cut of the fold that falls after a blank must not bring it under the limit", async () => {
      for (const length of Array.from({ length: 24 }, (_, at) => 501 + at)) {
        const { records, snapshot } = await runOf([merger(titleOf(length))]);
        expect(bodyOf(snapshot).unreadable).toBe(1);
        expect(records).toEqual([]);
      }
    });

    it("drops a party longer than a name may be whatever its shape is, and stores no name with the mark of a cut", async () => {
      // A blank falls at the place where a cut of the fold would end for one prefix and a letter for the other.
      for (const prefix of ["Q", "QQ"]) {
        for (const length of Array.from({ length: 12 }, (_, at) => 121 + at)) {
          const rest = length - prefix.length;
          const name = `${prefix}${" x".repeat(Math.floor(rest / 2))}${"x".repeat(rest % 2)}`;
          expect(name).toHaveLength(length);
          const { records } = await runOf([merger(`Zorbex Systems / ${name} merger inquiry`)]);
          expect(idsOf(records)).toEqual(["cma:zorbexsystems"]);
        }
      }
    });

    it("drops a party longer than a name may be wherever a pair of surrogates falls in it, and stores no name with the mark of a cut", async () => {
      // A letter of two units falls at each place from 99 to 118: a cut of the line at 109 units
      // never splits a pair, so a pair at the 109th unit gives a cut name of 120 units with its marker.
      const astral = cp(0x20000);
      const kept: string[][] = [];
      for (const letters of [1, 2]) {
        for (let before = 98; before <= 116; before += 1) {
          const name = `${"Q".repeat(letters)}${"x".repeat(before)}${astral}${"x".repeat(20)}`;
          const { records } = await runOf([merger(`Zorbex Systems / ${name} merger inquiry`)]);
          if (idsOf(records).length !== 1) kept.push(idsOf(records));
        }
      }
      expect(kept).toEqual([]);
      // The same shape is a name where it fits: 1 + 97 + 2 + 20 = 120 units.
      const fits = `Q${"x".repeat(97)}${astral}${"x".repeat(20)}`;
      const { records } = await runOf([merger(`Zorbex Systems / ${fits} merger inquiry`)]);
      expect(records).toHaveLength(2);
    });

    it("counts a title of 100 KB as unreadable, in no time", async () => {
      const started = Date.now();
      const { records, snapshot } = await runOf([
        merger(`Zorbex Systems / Quillon Data ${"x ".repeat(50_000)}merger inquiry`),
      ]);
      expect(Date.now() - started).toBeLessThan(SLOW_MS);
      expect(records).toEqual([]);
      expect(bodyOf(snapshot).unreadable).toBe(1);
    }, 30_000);

    it("cuts the title that it shows at eighty characters, with the mark of a cut, and the party at the name's own length", async () => {
      const title = `Zorbex Systems / Quillon Data ${"and more words ".repeat(8)}merger inquiry`;
      const { records } = await runOf([merger(title)]);
      const shown =
        new RegExp(`${cp(0x201c)}(.*?)${cp(0x201d)}`).exec(records[0].summary)?.[1] ?? "";
      expect(shown).toHaveLength(80);
      expect(shown.endsWith(" [shortened]")).toBe(true);
    });
  });

  describe("time", () => {
    const within = async (rows: Row[]): Promise<void> => {
      const started = Date.now();
      await runOf(rows);
      expect(Date.now() - started).toBeLessThan(SLOW_MS);
    };

    const SHAPES: Array<[string, (at: number) => string]> = [
      ["alias openers", () => `${"(now x ".repeat(70)} merger inquiry`],
      ["slashes", () => `${"a / ".repeat(120)}merger inquiry`],
      ["blanks", () => `Zorbex${" ".repeat(480)}merger inquiry`],
      ["brackets", () => `Zorbex ${"(".repeat(200)}${")".repeat(200)} (formerly x)`],
      ["capital words", () => `Conduct by ${"A ".repeat(240)}in markets`],
      ["of and de", () => `Conduct by A${" of A and A de A &".repeat(25)} in markets`],
      ["possessives", () => `${"A's ".repeat(120)}app store`],
      ["colons", () => `${"A: ".repeat(160)}suspected abuse`],
      ["acquisitions", () => `Completed acquisition by ${"a of ".repeat(90)}b`],
      ["tails", () => `${"merger inquiry ".repeat(30)}merger inquiry`],
    ];

    it.each(SHAPES)(
      "takes no time for a thousand titles of 500 characters made of %s",
      async (_name, shape) => {
        const types = [
          "mergers",
          "consumer-enforcement",
          "ca98-and-civil-cartels",
          "digital-markets-unit",
        ];
        const rows = Array.from({ length: 1_000 }, (_, at) =>
          caseOf({ n: at + 1, type: types[at % 4], title: shape(at).slice(0, 500) }),
        );
        await within(rows);
      },
      30_000,
    );

    it("takes no time for the three pages of the real size", async () => {
      const rows = [merger("Zorbex Systems / Quillon Data merger inquiry"), ...fillers(2_592)];
      await within(rows);
    }, 30_000);
  });

  describe("rows that do not read", () => {
    const good = (count: number): Row[] =>
      Array.from({ length: count }, (_, at) =>
        merger(
          `Qvx${String(at).padStart(4, "0")} / Zorbex${String(at).padStart(4, "0")} merger inquiry`,
          { n: at + 1 },
        ),
      );

    it.each<[string, CaseOver]>([
      ["a title that is no text", { title: 42 }],
      ["a title that is missing", { title: undefined }],
      ["a title that is null", { title: null }],
      ["a case type that is missing", { rawType: undefined }],
      ["a case type that is an empty list", { rawType: [] }],
      ["a case type that is an empty text", { rawType: "" }],
      ["a case type that is a number", { rawType: 7 }],
      ["a case type that is a list of a number", { rawType: [7] }],
      ["a case type that is null", { rawType: null }],
      ["a case state that is missing", { rawState: undefined }],
      ["a case state that is an empty list", { rawState: [] }],
      ["a case state that is null", { rawState: null }],
      ["a case state that is a number", { rawState: 7 }],
    ])(
      "counts a row with %s as unreadable, and gives it no record, whatever type it has",
      async (_name, over) => {
        const bad = caseOf({
          n: 500,
          title: "Zorbex Systems / Quillon Data merger inquiry",
          ...over,
        });
        const dropped = caseOf({ n: 501, type: "sau-referral", title: "Filler", ...over });
        const { parsed, snapshot, records } = await runOf([...good(5), bad, dropped]);
        expect(records).toHaveLength(10);
        expect(bodyOf(snapshot).unreadable).toBe(2);
        expect(parsed.errors + (parsed.skipped ?? 0)).toBe(2);
      },
    );

    it("counts a kept case that has a party and an address that is no case page as unreadable", async () => {
      const bad = merger("Zorbex Systems / Quillon Data merger inquiry", {
        n: 500,
        link: "/government/example-case",
      });
      const { parsed, snapshot, records } = await runOf([...good(5), bad]);
      expect(records).toHaveLength(10);
      expect(bodyOf(snapshot).unreadable).toBe(1);
      expect(parsed.skipped).toBe(1);
      expect(textOfRun({ snapshot, parsed, records })).not.toContain("Zorbex Systems");
    });

    it("counts a kept case whose title is longer than five hundred characters as unreadable, and leaves the other cases of its parties as they are", async () => {
      const long = `Zorbex Systems / Quillon Data${" x".repeat(238)} merger inquiry`;
      expect(long).toHaveLength(520);
      const { parsed, snapshot, records } = await runOf([
        ...good(5),
        merger("Zorbex Systems / Quillon Data merger inquiry", { n: 500 }),
        merger(long, { n: 501 }),
        // A case that the filter drops is never read, whatever its title: it is not counted.
        caseOf({ n: 502, type: "sau-referral", title: long }),
      ]);
      expect(bodyOf(snapshot).unreadable).toBe(1);
      expect(parsed.skipped).toBe(1);
      expect(parsed.errors).toBe(0);
      expect(records).toHaveLength(12);
      expect(recordOfId(records, "zorbexsystems").identifiers).toMatchObject({ cases: 1 });
      expect(recordOfId(records, "quillondata").identifiers).toMatchObject({ cases: 1 });
    });

    it("counts a kept case whose title is empty once folded as unreadable, as it counts one with no title", async () => {
      const { parsed, snapshot, records } = await runOf([
        ...good(5),
        merger(` ${ZWSP}${NBSP}\t `, { n: 500 }),
        // A case that the filter drops is never read, whatever its title: it is not counted.
        caseOf({ n: 501, type: "sau-referral", title: " " }),
      ]);
      expect(records).toHaveLength(10);
      expect(bodyOf(snapshot).unreadable).toBe(1);
      expect(parsed.skipped).toBe(1);
      expect(parsed.errors).toBe(0);
    });

    it("tolerates ten kept cases with a title that is too long in a list of a hundred entities and fails the sync at eleven", async () => {
      const long = (at: number): Row =>
        merger(`Alphaco${at} / Betaco${at}${" x".repeat(250)} merger inquiry`, { n: 900 + at });
      const bad = (count: number): Row[] => Array.from({ length: count }, (_, at) => long(at));
      const tolerated = await runOf([...good(50), ...bad(10)]);
      expect(tolerated.parsed.skipped).toBe(10);
      expect(tolerated.parsed.errors).toBe(0);
      const refused = await runOf([...good(50), ...bad(11)]);
      expect(refused.parsed.skipped).toBe(0);
      expect(refused.parsed.errors).toBe(11);
    });

    it.each([
      ["a blank", "/cma-cases/a b"],
      ["a query", "/cma-cases/a?b=1"],
      ["a fragment", "/cma-cases/a#b"],
      ["an angle bracket", "/cma-cases/a<b>"],
      ["a quotation mark", '/cma-cases/a"b'],
      ["no page after the directory", "/cma-cases/"],
      ["an empty step", "/cma-cases//a"],
      ["a slash at its end", "/cma-cases/a/"],
      ["no slash after the directory", "/cma-cases"],
      ["another directory that begins alike", "/cma-cases-old/a"],
      ["a host of its own", "//evil.example/cma-cases/a"],
      ["a directory in capitals", "/CMA-Cases/a"],
      ["two hundred and one characters", `/cma-cases/${"a".repeat(190)}`],
      ["more than two hundred characters", `/cma-cases/${"a".repeat(195)}`],
    ])("counts a kept case whose address holds %s as unreadable", async (_name, link) => {
      const bad = merger("Zorbex Systems / Quillon Data merger inquiry", { n: 500, link });
      const { parsed, snapshot, records } = await runOf([...good(30), bad]);
      expect(records).toHaveLength(60);
      expect(bodyOf(snapshot).unreadable).toBe(1);
      expect(parsed.skipped).toBe(1);
      expect(parsed.errors).toBe(0);
    });

    it("takes an address of exactly two hundred characters", async () => {
      const link = `/cma-cases/${"a".repeat(189)}`;
      expect(link).toHaveLength(200);
      const { records } = await runOf([
        merger("Zorbex Systems / Quillon Data merger inquiry", { link }),
      ]);
      expect(records[0].url).toBe(`${SITE}${link}`);
    });

    it("takes an address with a percent escape, as the page of a case may have it", async () => {
      const link = "/cma-cases/example-%C3%A9-case";
      const { parsed, records } = await runOf([
        merger("Zorbex Systems / Quillon Data merger inquiry", { link }),
      ]);
      expect(records.map((record) => record.url)).toEqual([`${SITE}${link}`, `${SITE}${link}`]);
      expect(parsed.skipped).toBe(0);
    });

    it("does not count an address that is no case page when the case is dropped or gives no party", async () => {
      const { snapshot } = await runOf([
        ...good(5),
        caseOf({ n: 500, type: "sau-referral", link: "/government/example-case" }),
        merger("Alphaco merger inquiry", { n: 501, link: "/government/example-case-2" }),
      ]);
      expect(bodyOf(snapshot).unreadable).toBe(0);
    });

    it("tolerates ten of them in a list of a hundred entities and fails the sync at eleven", async () => {
      const bad = (count: number): Row[] =>
        Array.from({ length: count }, (_, at) => caseOf({ n: 900 + at, title: 7 }));
      const tolerated = await runOf([...good(50), ...bad(10)]);
      expect(tolerated.parsed.skipped).toBe(10);
      expect(tolerated.parsed.errors).toBe(0);
      const refused = await runOf([...good(50), ...bad(11)]);
      expect(refused.parsed.skipped).toBe(0);
      expect(refused.parsed.errors).toBe(11);
    });

    it("does not count the dropped cases toward the limit", async () => {
      const { parsed } = await runOf([...good(20), ...fillers(40)]);
      expect(parsed.skipped).toBe(0);
      expect(parsed.errors).toBe(0);
      expect(parsed.records).toHaveLength(40);
    });
  });

  describe("the pages", () => {
    it("reads the three pages of 2,500 rows as one list, and one party across the pages as one record", async () => {
      const rows = [
        merger("Zorbex Systems / Quillon Data merger inquiry", { n: 1, closed: "2021-01-01" }),
        ...fillers(1_200, 10_000),
        merger("Zorbex Systems / Mavro Labs merger inquiry", { n: 2, closed: "2022-02-02" }),
        ...fillers(1_297, 20_000),
        merger("Zorbex Systems / Plynth Works merger inquiry", { n: 3, closed: "2023-03-03" }),
      ];
      expect(rows).toHaveLength(2_500);
      const { records, parsed } = await runOf(rows);
      expect(parsed.errors).toBe(0);
      expect(idsOf(records)).toEqual([
        "cma:mavrolabs",
        "cma:plynthworks",
        "cma:quillondata",
        "cma:zorbexsystems",
      ]);
      expect(recordOfId(records, "zorbexsystems").identifiers).toMatchObject({
        cases: 3,
        newest: "2023-03-03",
      });
    });

    it("fails as not the list when one row is missing across the edge of two pages", async () => {
      const rows = [merger("Zorbex Systems / Quillon Data merger inquiry"), ...fillers(2_499)];
      const files = pagesOf(rows, { total: 2_500 });
      files[urlAt(1_000)] = {
        body: pageText(rows.slice(1_001, 2_000), 2_500, 1_000),
        contentType: JSON_TYPE,
      };
      expect(await failureOf(connectorOf().download(fakeFetch(files), {}))).toBeInstanceOf(
        NotTheListError,
      );
    });

    it("fails as not the list when the pages state different totals", async () => {
      const rows = [merger("Zorbex Systems / Quillon Data merger inquiry"), ...fillers(2_499)];
      const files = pagesOf(rows);
      files[urlAt(2_000)] = {
        body: pageText(rows.slice(2_000), 2_501, 2_000),
        contentType: JSON_TYPE,
      };
      expect(await failureOf(connectorOf().download(fakeFetch(files), {}))).toBeInstanceOf(
        NotTheListError,
      );
    });

    it("fails as not the list when a row comes twice and the total counts both", async () => {
      const row = merger("Zorbex Systems / Quillon Data merger inquiry");
      expect(await failureOf(downloadOf([row, row]))).toBeInstanceOf(NotTheListError);
      expect(await failureOf(downloadOf([row, row], { total: 1 }))).toBeUndefined();
    });

    it("fails as not the list for a total of 5,001: six pages are more than the connector reads, after one request", async () => {
      const fetch = fakeFetch(pagesOf([caseOf()], { total: 5_001 }));
      const failure = await failureOf(connectorOf().download(fetch, {}));
      expect(failure).toBeInstanceOf(NotTheListError);
      expect(fetch.calls).toHaveLength(1);
    });

    it("reads a search of 5,000 rows, the five pages that it allows", async () => {
      const rows = [merger("Zorbex Systems / Quillon Data merger inquiry"), ...fillers(4_999)];
      const sleep = sleeping();
      const fetch = fakeFetch(pagesOf(rows));
      await connectorOf(sleep).download(fetch, {});
      expect(fetch.calls).toHaveLength(5);
      expect(sleep).toHaveBeenCalledTimes(4);
    });

    it("fails the whole download when one page fails, and gives nothing of the pages before it", async () => {
      const rows = [merger("Zorbex Systems / Quillon Data merger inquiry"), ...fillers(2_499)];
      const files = pagesOf(rows);
      delete files[urlAt(2_000)];
      const failure = await failureOf(connectorOf().download(fakeFetch(files), {}));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unreachable");
    });

    it("fails the whole download as too large when a page was cut at its limit", async () => {
      const rows = [merger("Zorbex Systems / Quillon Data merger inquiry"), ...fillers(2_499)];
      const files = pagesOf(rows);
      files[urlAt(1_000)] = { ...files[urlAt(1_000)], truncated: true };
      expect(await failureOf(connectorOf().download(fakeFetch(files), {}))).toBeInstanceOf(
        BodyTooLargeError,
      );
    });

    it("is too large when a page is longer than the limit of 8 MiB, and the fetch cuts it there", async () => {
      const big = caseOf({ n: 1, title: `Alphaco / Betaco ${"x".repeat(9 * MIB)} merger inquiry` });
      expect(await failureOf(downloadOf([big]))).toBeInstanceOf(BodyTooLargeError);
    });

    it.each<[string, unknown]>([
      ["not JSON", "<html><body>Unprocessable</body></html>"],
      ["a JSON text that is no object", "[1, 2, 3]"],
      ["null", "null"],
      ["an object without results", JSON.stringify({ total: 1, start: 0 })],
      ["results that are no list", JSON.stringify({ total: 1, start: 0, results: { link: "/x" } })],
      ["a row that is no object", JSON.stringify({ total: 1, start: 0, results: ["text"] })],
      [
        "a row without a link",
        JSON.stringify({ total: 1, start: 0, results: [{ title: "Example" }] }),
      ],
      ["a page that begins elsewhere", pageText([caseOf()], 1, 1_000)],
      ["a total that is no count", pageText([caseOf()], -1)],
      ["a total that is a text", pageText([caseOf()], "1")],
      ["an empty file", ""],
    ])("fails as not the list for %s", async (_name, body) => {
      const files: Record<string, FakeFile> = {
        [urlAt(0)]: { body: body as string, contentType: JSON_TYPE },
      };
      expect(await failureOf(connectorOf().download(fakeFetch(files), {}))).toBeInstanceOf(
        NotTheListError,
      );
    });

    it("fails as not the list for a text that is nested deeper than any list is", async () => {
      const deep = `{"results":[],"total":0,"deep":${"[".repeat(10_000)}${"]".repeat(10_000)}}`;
      const files: Record<string, FakeFile> = {
        [urlAt(0)]: { body: deep, contentType: JSON_TYPE },
      };
      expect(await failureOf(connectorOf().download(fakeFetch(files), {}))).toBeInstanceOf(
        NotTheListError,
      );
    });

    it("reads a page that begins with a byte order mark, and a page with a charset on its type", async () => {
      const row = merger("Zorbex Systems / Quillon Data merger inquiry");
      const files: Record<string, FakeFile> = {
        [urlAt(0)]: {
          body: Buffer.from(`${cp(0xfeff)}${pageText([row])}`, "utf8"),
          contentType: "application/json; charset=utf-8",
        },
      };
      const snapshot = await connectorOf().download(fakeFetch(files), {});
      if (snapshot === "unchanged") throw new Error("unchanged");
      expect(idsOf(ukCmaConnector.parse(snapshot).records)).toEqual([
        "cma:quillondata",
        "cma:zorbexsystems",
      ]);
    });

    it("refuses the error page of the API, which answers 422 with HTML, by its type: it is never parsed", async () => {
      const files: Record<string, FakeFile> = {
        [urlAt(0)]: { body: "<html>422</html>", contentType: "text/html; charset=utf-8" },
      };
      const failure = await failureOf(connectorOf().download(fakeFetch(files), {}));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unsupported_type");
    });

    it("keeps no address, no row and no message in a failure", async () => {
      const files: Record<string, FakeFile> = {
        [urlAt(0)]: { body: "not json ZZ-ROW-TEXT", contentType: JSON_TYPE },
      };
      const failures = [
        await failureOf(connectorOf().download(fakeFetch(files), {})),
        await failureOf(downloadOf([caseOf()], { file: { truncated: true } })),
        await failureOf(downloadOf([caseOf()], { total: 7 })),
      ];
      for (const failure of failures) {
        const message = (failure as Error).message;
        for (const part of ["gov.uk", "search.json", "https", "ZZ-", "Alphaco", "cma"]) {
          expect(message).not.toContain(part);
        }
      }
    });
  });

  describe("where the answer comes from", () => {
    const OFF_THE_PIN: Array<[string, string]> = [
      ["another host", "https://www.example.org/api/search.json"],
      ["the bare domain", "https://gov.uk/api/search.json"],
      ["a host that only begins like it", "https://www.gov.uk.example.net/api/search.json"],
      ["plain http", "http://www.gov.uk/api/search.json"],
      ["another port", "https://www.gov.uk:8443/api/search.json"],
      ["a user name", "https://user:secret@www.gov.uk/api/search.json"],
      ["the right host, outside /api/", "https://www.gov.uk/government/search.json"],
      ["a climb out of /api/", "https://www.gov.uk/api/../search.json"],
    ];

    it.each(OFF_THE_PIN)(
      "is refused, as not allowed and without a word of the address, when it comes from %s",
      async (_name, url) => {
        const failure = await failureOf(downloadOf([caseOf()], { file: { url } }));
        expect(failure).toBeInstanceOf(FetchError);
        expect((failure as FetchError).reason).toBe("not_allowed");
        for (const part of ["example", "secret", "gov.uk", "search", "https"]) {
          expect((failure as FetchError).message).not.toContain(part);
        }
      },
    );

    it("refuses a page of a later request that comes from off the pin, and gives nothing", async () => {
      const rows = [merger("Zorbex Systems / Quillon Data merger inquiry"), ...fillers(1_499)];
      const files = pagesOf(rows);
      files[urlAt(1_000)] = {
        ...files[urlAt(1_000)],
        url: "https://www.example.org/api/search.json",
      };
      const failure = await failureOf(connectorOf().download(fakeFetch(files), {}));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("not_allowed");
    });

    it("is read from a redirect that stays under the pin", async () => {
      const files = pagesOf([merger("Zorbex Systems / Quillon Data merger inquiry")]);
      files[urlAt(0)] = { ...files[urlAt(0)], url: "https://www.gov.uk/api/search.json?moved=1" };
      const snapshot = await connectorOf().download(fakeFetch(files), {});
      if (snapshot === "unchanged") throw new Error("unchanged");
      expect(idsOf(ukCmaConnector.parse(snapshot).records)).toEqual([
        "cma:quillondata",
        "cma:zorbexsystems",
      ]);
    });

    it("fails an answer of unchanged from the pin as unreachable: no validator was sent, so none can be current", async () => {
      const unchanged: ConnectorFetch = async (url) => ({ notModified: true, url });
      const failure = await failureOf(
        ukCmaConnector.download(unchanged, { etag: "k1:", lastModified: null }),
      );
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unreachable");
    });

    it("fails an answer of unchanged from another address as not allowed", async () => {
      const unchanged: ConnectorFetch = async () => ({
        notModified: true,
        url: "https://www.example.org/api/search.json",
      });
      const failure = await failureOf(ukCmaConnector.download(unchanged, {}));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("not_allowed");
    });

    it("passes on the failure of the fetch as it is, with its status and its wait", async () => {
      const error = new FetchError("blocked_by_site", undefined, {
        status: 429,
        retryAfterMs: 5_000,
      });
      const throttled: ConnectorFetch = async () => {
        throw error;
      };
      expect(await failureOf(ukCmaConnector.download(throttled, {}))).toBe(error);
    });

    it("fails as not the list for any other failure of the fetch, with nothing of it", async () => {
      const broken: ConnectorFetch = async () => {
        throw new TypeError("https://www.gov.uk/api/search.json?token=ZZ-SECRET failed");
      };
      const failure = await failureOf(ukCmaConnector.download(broken, {}));
      expect(failure).toBeInstanceOf(NotTheListError);
      expect((failure as Error).message).not.toContain("ZZ-SECRET");
    });
  });

  describe("the contract of the kit", () => {
    it("makes records that hold what the columns and the prompt need", async () => {
      const { records } = await runOf([
        merger("Examplesoft, Inc (now Example Platforms, Inc) / Gifly, Inc merger inquiry", {
          n: 1,
        }),
        consumer("Acme Gyms (UK) Limited", { n: 2 }),
        caseOf({
          n: 3,
          type: "digital-markets-unit",
          outcome: null,
          title: `Examplecorp${CURLY}s mobile platform`,
        }),
        caseOf({
          n: 4,
          type: "ca98-and-civil-cartels",
          outcome: null,
          title: "Investigation into suspected anti-competitive conduct by Zorbex in ad tech",
        }),
        merger("Open Merger / Pending Merger merger inquiry", {
          n: 5,
          state: "open",
          outcome: null,
          closed: null,
        }),
      ]);
      expect(records).toHaveLength(7);
      expectWellFormedRecords(records, { sourceId: "uk_cma", mark: MARK });
    });

    it("has no root for a body that is not the one its download makes", () => {
      const snapshot = (bodies: string[]): Snapshot => ({
        bodies,
        etag: null,
        lastModified: null,
        bytes: 0,
      });
      for (const bodies of [
        [],
        ["not json"],
        [`{"v":2,"rows":[],"total":0,"unreadable":0}`],
        ["{}", "{}"],
      ]) {
        const parsed = ukCmaConnector.parse(snapshot(bodies));
        expect(parsed.root).toBeNull();
        expect(parsed.records).toEqual([]);
        expect(parsed.errors).toBeGreaterThan(0);
      }
    });
  });

  describe("the worst case", () => {
    const NAME_120 = `Zorbex${"B".repeat(114)}`;
    /** A slug of 89 characters: far above the 60 that the summary shows of an outcome. */
    const LONG_SLUG = `ca98-infringement-chapter-i-${"and-more-words-".repeat(4)}x`;
    /** A title of the conduct form (the colon form reads 80 characters of a party at most): a party of 120. */
    const conduct = `suspected conduct by ${NAME_120} in the markets of ${"x ".repeat(20)}`;

    /** The most that a record can hold: the five types, the longest label three times, the longest name. */
    async function worstCase(): Promise<ParsedRecord> {
      const by = (n: number, type: string, over: CaseOver = {}): Row =>
        caseOf({ n, type, outcome: LONG_SLUG, title: conduct, ...over });
      const rows = [
        caseOf({
          n: 1,
          title: `${NAME_120} / Quillon Data merger inquiry`,
          outcome: "mergers-phase-1-clearance-with-undertakings-in-lieu",
          closed: "2025-05-01",
        }),
        by(2, "ca98-and-civil-cartels", { closed: "2026-03-01" }),
        by(3, "ca98-and-civil-cartels", { closed: "2026-03-02" }),
        by(4, "ca98-and-civil-cartels", { closed: "2026-03-03" }),
        by(5, "consumer-enforcement", { closed: "2025-04-01" }),
        by(6, "criminal-cartels", { closed: "2025-03-01" }),
        by(7, "digital-markets-unit", { state: "open", closed: null, opened: "2025-02-01" }),
      ];
      const { records, parsed } = await runOf(rows);
      expect(parsed.errors).toBe(0);
      return recordOfId(records, NAME_120.toLowerCase());
    }

    it("is under the limit of a summary, keeps its second sentence and its closing sentence", async () => {
      const record = await worstCase();
      // 1,218 characters with the longest name, three cases of the longest type label and outcomes cut at sixty.
      expect(record.summary.length).toBeLessThanOrEqual(RECORD_SUMMARY_MAX);
      expect(record.summary.length).toBeGreaterThan(1_200);
      expect(record.summary.startsWith(`${FIRST_SENTENCE} ${SECOND_SENTENCE} `)).toBe(true);
      expect(record.summary.endsWith(CLOSING)).toBe(true);
      expect(record.title).toBe(`CMA cases: ${NAME_120}`);
      expect(record.summary).toContain(`Party as written in the case titles: ${NAME_120}.`);
      expect(record.summary).toContain(
        "Cases kept: 7 (merger 1, competition (CA98 or cartel) 3, consumer protection 1, criminal cartel 1, digital markets 1), 1 open.",
      );
      expect(record.identifiers).toEqual({
        party: NAME_120,
        cases: 7,
        open: 1,
        newest: "2026-03-03",
      });
    });

    it("shows the three newest cases, each title cut at eighty characters and each outcome at sixty, with the mark of a cut", async () => {
      const record = await worstCase();
      const items = [
        ...record.summary.matchAll(
          new RegExp(
            `${cp(0x201c)}([^${cp(0x201d)}]*)${cp(0x201d)} \\(([^,]*\\)?[^,]*), (open|closed), ([^,]*), ([0-9-]+)\\)`,
            "g",
          ),
        ),
      ];
      expect(items).toHaveLength(3);
      expect(items.map((item) => item[5])).toEqual(["2026-03-03", "2026-03-02", "2026-03-01"]);
      for (const item of items) {
        expect(item[1]).toHaveLength(80);
        expect(item[1].endsWith(" [shortened]")).toBe(true);
        expect(item[2]).toBe("competition (CA98 or cartel)");
        expect(item[3]).toBe("closed");
        expect(item[4]).toHaveLength(60);
        expect(item[4].endsWith(" [shortened]")).toBe(true);
        expect(item[4].startsWith("ca98 infringement chapter i and more")).toBe(true);
      }
    });

    it("shows an outcome of sixty characters whole and cuts one of sixty-one with the mark of a cut", async () => {
      const outcomeOf = async (slug: string): Promise<string> => {
        const { records } = await runOf([consumer("Zorbex Systems Limited", { outcome: slug })]);
        return /closed, ([^,]*), 2024-05-06\)/.exec(records[0].summary)?.[1] ?? "";
      };
      const sixty = `consumer-enforcement-${"a".repeat(37)}-b`;
      expect(sixty.length).toBe(60);
      expect(await outcomeOf(sixty)).toBe(sixty.replace(/-/g, " "));
      const cut = await outcomeOf(`${sixty}c`);
      expect(cut).toHaveLength(60);
      expect(cut.endsWith(" [shortened]")).toBe(true);
    });

    it("shows the two longest outcomes of the real list whole, with no mark of a cut", async () => {
      // 51 characters (mergers) and 57 characters (consumer protection): both were cut when the limit was 50.
      const merged = "mergers-phase-1-clearance-with-undertakings-in-lieu";
      const changed = "consumer-enforcement-changes-to-business-practices-agreed";
      expect(merged).toHaveLength(51);
      expect(changed).toHaveLength(57);
      const first = await runOf([
        merger("Zorbex Systems / Quillon Data merger inquiry", { outcome: merged }),
      ]);
      expect(recordOfId(first.records, "zorbexsystems").summary).toContain(
        "(merger, closed, mergers phase 1 clearance with undertakings in lieu, 2024-05-06)",
      );
      const second = await runOf([consumer("Zorbex Systems Limited", { outcome: changed })]);
      expect(second.records[0].summary).toContain(
        "(consumer protection, closed, consumer enforcement changes to business practices agreed, 2024-05-06)",
      );
      for (const record of [...first.records, ...second.records]) {
        expect(record.summary).not.toContain("[shortened]");
      }
    });

    it("shows an outcome that has nothing but hyphens as none", async () => {
      const { records } = await runOf([consumer("Zorbex Systems Limited", { outcome: "---" })]);
      expect(records[0].summary).toContain(
        "(consumer protection, closed, no outcome recorded, 2024-05-06)",
      );
    });
  });
});
