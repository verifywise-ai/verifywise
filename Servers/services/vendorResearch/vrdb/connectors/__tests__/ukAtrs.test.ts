/**
 * The UK Algorithmic Transparency Records as a mirrored list of the vendor risk database
 * (connectors/ukAtrs.ts): one search of the GOV.UK Search API, whose results carry the text of each
 * record, read into one record per supplier entity. The answers are synthetic: they copy the shape
 * of the API's (an envelope of `results`, `total`, `start` and the empty aggregates; a result with
 * the fields that are read and the text of a record under numbered headings, the supplier in the
 * section "External supplier" or "Third party" and its number in "Companies House Number"), with
 * every name, title, link and number invented. A field or a part of the text that the connector must
 * leave out holds a token that starts with `ZZ-`, an e-mail address or a telephone number, so that
 * a copy of it anywhere in a snapshot or a record is found. Every character that is hard to type is
 * built with `cp`. Nothing here uses the network: `fakeFetch` and hand-written fetches answer.
 */
import { FetchError } from "../../../../webResearch/guardedFetch";
import type { ParsedRecord } from "../../types";
import type { Sleep } from "../kit/pause";
import { RECORD_SUMMARY_MAX } from "../kit/record";
import { UK_ATRS_RECORD_MARK, createUkAtrsConnector, ukAtrsConnector } from "../ukAtrs";
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

/** One character that the fold (NFKC) makes four units of: the ideographs for a limited company. */
const WIDE = cp(0x337f);
/** One letter of two units (a pair of surrogates) that the fold leaves as it is. */
const ASTRAL = cp(0x20000);

const MARK = UK_ATRS_RECORD_MARK;
const SEARCH_URL =
  "https://www.gov.uk/api/search.json?filter_content_store_document_type=algorithmic_transparency_record&count=1000&start=0&order=-public_timestamp&fields[]=title&fields[]=description&fields[]=link&fields[]=public_timestamp&fields[]=content_store_document_type&fields[]=format&fields[]=first_published_at&fields[]=primary_publishing_organisation&fields[]=algorithmic_transparency_record_organisation&fields[]=algorithmic_transparency_record_organisation_type&fields[]=algorithmic_transparency_record_phase&fields[]=algorithmic_transparency_record_function&fields[]=algorithmic_transparency_record_region&fields[]=algorithmic_transparency_record_atrs_version&fields[]=algorithmic_transparency_record_date_published&fields[]=indexable_content";
const SITE = "https://www.gov.uk";
const JSON_TYPE = "application/json";
const MIB = 1024 * 1024;

/** The sentences of a record that are fixed. */
const FIRST_SENTENCE = `${MARK} (gov.uk), a register or status list.`;
const SECOND_SENTENCE =
  "A record is a UK public body's own description of an algorithmic tool it uses and names who supplied it; it says nothing about the supplier's conduct or about the tool's quality.";
const CLOSING = "Adapted by VerifyWise from GOV.UK under the Open Government Licence v3.0.";

const NBSP = cp(0xa0);
const ZWSP = cp(0x200b);
const LRM = cp(0x200e);
const RLO = cp(0x202e);
const LONE_SURROGATE = cp(0xd800);

/** What the connector must never copy: each of these is planted in a field or a part of the text. */
const LEFT_OUT = {
  description: "ZZ-DESCRIPTION",
  organisationType: "ZZ-ORGANISATION-TYPE",
  region: "ZZ-REGION",
  function: "ZZ-FUNCTION",
  publisher: "ZZ-PUBLISHER",
  firstPublished: "ZZ-FIRST-PUBLISHED",
  owner: "ZZ-OWNER",
  role: "ZZ-ROLE",
  details: "ZZ-DETAILS",
  model: "ZZ-MODEL",
};
const EMAIL = "jo.example@example.test";
const PHONE = "0300 000 0000";
const ADDRESS_IN_TEXT = "https://zz-address.example.test/page";

type Row = Record<string, unknown>;

/** What a record's text holds around the supplier: where the supplier and its number are, and how the headings look. */
interface Layout {
  /** The cell of the supplier section; null: the record has no such section. */
  supplier?: string | null;
  supplierHeading?: string;
  /** The cell of the number section; null: the record has no such section. */
  number?: string | null;
  numberHeading?: string;
  /** False: the layout of ATRS version 1.1, whose headings carry no number. */
  numbered?: boolean;
  /** The separator between a heading's number and its title. */
  dash?: string;
  /** What stands in front of a heading (`## ` of a text that is Markdown). */
  prefix?: string;
}

/** The text of a record as the Search API gives it, in the layout of the real ones (invented words). */
function contentOf(layout: Layout = {}): string {
  const {
    supplier = null,
    supplierHeading = "External supplier",
    number = null,
    numberHeading = "Companies House Number",
    numbered = true,
    dash = "-",
    prefix = "",
  } = layout;
  const heading = (id: string, title: string): string =>
    numbered ? `${prefix}${id} ${dash} ${title}` : `${prefix}${title}`;
  const lines = [
    "Tier 1 - Summary information",
    "",
    heading("1", "Name"),
    "",
    "Example tool",
    "",
    heading("2", "Description"),
    "",
    `${LEFT_OUT.details} describes the tool. Write to ${EMAIL} or call ${PHONE}. See ${ADDRESS_IN_TEXT}.`,
    "",
    "Tier 2 - Owner and responsibility",
    "",
    heading("2.1", "Senior responsible owner"),
    "",
    LEFT_OUT.owner,
    "",
    heading("2.2", "Contact email"),
    "",
    EMAIL,
    "",
    heading("2.3", "External supplier involvement"),
    "",
    supplier === null ? "No" : "Yes",
    "",
  ];
  if (supplier !== null) lines.push(heading("2.3.1", supplierHeading), "", supplier, "");
  if (number !== null) lines.push(heading("2.3.2", numberHeading), "", number, "");
  if (supplier !== null)
    lines.push(heading("2.3.3", "External supplier role"), "", LEFT_OUT.role, "");
  lines.push(heading("3", "Model task"), "", `${LEFT_OUT.model} model text`, "");
  return lines.join("\n");
}

interface ResultOver {
  n?: number;
  link?: string;
  title?: string;
  /** The slug of the deploying body. */
  authority?: string;
  phase?: string;
  published?: string;
  stamp?: string;
  /** The supplier cell, when the text is the default layout. */
  supplier?: string | null;
  number?: string | null;
  /** The whole text, when a test needs a layout of its own. */
  content?: unknown;
}

/** One result of the Search API: the fields that are read, the envelope fields, and the left-out fields planted. */
function resultOf(over: ResultOver = {}): Row {
  const n = over.n ?? 1;
  const link = over.link ?? `/algorithmic-transparency-records/example-tool-${n}`;
  return {
    algorithmic_transparency_record_atrs_version: "v4.0",
    algorithmic_transparency_record_date_published: over.published ?? "2026-03-04",
    algorithmic_transparency_record_function: [LEFT_OUT.function],
    algorithmic_transparency_record_organisation: over.authority ?? "example-borough-council",
    algorithmic_transparency_record_organisation_type: [LEFT_OUT.organisationType],
    algorithmic_transparency_record_phase: over.phase ?? "production",
    algorithmic_transparency_record_region: [LEFT_OUT.region],
    content_store_document_type: "algorithmic_transparency_record",
    description: LEFT_OUT.description,
    first_published_at: LEFT_OUT.firstPublished,
    format: "algorithmic_transparency_record",
    indexable_content:
      "content" in over
        ? over.content
        : contentOf({
            supplier: "supplier" in over ? over.supplier : "Zorbex Analytics Ltd",
            number: over.number ?? null,
          }),
    link,
    primary_publishing_organisation: [LEFT_OUT.publisher],
    public_timestamp: over.stamp ?? "2026-03-05T10:11:12Z",
    title: over.title ?? `Example tool ${n}`,
    index: "govuk",
    es_score: null,
    _id: link,
    elasticsearch_type: "algorithmic_transparency_record",
    document_type: "algorithmic_transparency_record",
  };
}

/** The result of record `n` for a supplier cell: the links and titles differ, so that two results never collide. */
const resultFor = (n: number, supplier: string | null, over: ResultOver = {}): Row =>
  resultOf({ n, supplier, ...over });

/** The text of one answer of the API. */
const pageText = (
  results: readonly unknown[],
  total: number = results.length,
  extra: Record<string, unknown> = {},
): string =>
  JSON.stringify({
    results,
    total,
    start: 0,
    aggregates: {},
    suggested_queries: [],
    suggested_autocomplete: [],
    es_cluster: "A",
    ...extra,
  });

/** A pause that does not wait and keeps its calls. */
const sleeping = () => jest.fn<ReturnType<Sleep>, Parameters<Sleep>>(async () => undefined);

const connectorOf = (sleep: Sleep = sleeping()): Connector => createUkAtrsConnector({ sleep });

const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

/** The files the fake fetch serves for the one search of the list. */
const searchFile = (
  results: readonly unknown[],
  over: Partial<FakeFile> & { total?: number } = {},
): Record<string, FakeFile> => {
  const { total, ...file } = over;
  return {
    [SEARCH_URL]: { body: pageText(results, total), contentType: JSON_TYPE, ...file },
  };
};

async function downloadOf(
  results: readonly unknown[],
  over: Partial<FakeFile> & { total?: number } = {},
  connector: Connector = connectorOf(),
): Promise<Snapshot> {
  const result = await connector.download(fakeFetch(searchFile(results, over)), {});
  if (result === "unchanged") throw new Error("The fake fetch answered 304 to a first request.");
  return result;
}

interface Run {
  snapshot: Snapshot;
  parsed: ParseResult;
  records: ParsedRecord[];
}

/** Downloads the results as the list and parses what was stored. */
async function runOf(
  results: readonly unknown[],
  connector: Connector = connectorOf(),
): Promise<Run> {
  const snapshot = await downloadOf(results, {}, connector);
  const parsed = connector.parse(snapshot);
  return { snapshot, parsed, records: parsed.records };
}

const idsOf = (records: readonly ParsedRecord[]): string[] =>
  records.map((record) => record.sourceRecordId).sort();

const recordOfId = (records: readonly ParsedRecord[], key: string): ParsedRecord => {
  const found = records.find((record) => record.sourceRecordId === `atrs:${key}`);
  if (found === undefined) throw new Error(`No record has the id atrs:${key}.`);
  return found;
};

/** The titles of the records that one supplier cell gives, sorted: the cell as the list's text holds it. */
async function suppliersOf(cell: string, over: ResultOver = {}): Promise<string[]> {
  const { records } = await runOf([resultOf({ ...over, supplier: cell })]);
  return records.map((record) => record.title.replace(/^ATRS supplier: /, "")).sort();
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

describe("ukAtrsConnector", () => {
  describe("the connector", () => {
    it("is the connector of the list, in the snapshot form, with the mark of its records", () => {
      expect(ukAtrsConnector.id).toBe("uk_atrs");
      expect(ukAtrsConnector.version).toBe(1);
      expect(ukAtrsConnector.kind).toBeUndefined();
      expect(MARK).toBe("UK Algorithmic Transparency Records");
    });

    it("is made by a factory that takes the pause, as the lists of one host are", () => {
      expect(typeof createUkAtrsConnector).toBe("function");
      expect(createUkAtrsConnector().id).toBe("uk_atrs");
      expect(createUkAtrsConnector({ sleep: sleeping() }).version).toBe(ukAtrsConnector.version);
    });

    it("asks for the one search, once, within its limits, and never pauses", async () => {
      const sleep = sleeping();
      const fetch = fakeFetch(searchFile([resultOf()]));
      const result = await connectorOf(sleep).download(fetch, {});
      expect(result).not.toBe("unchanged");
      expect(fetch.calls).toHaveLength(1);
      expect(fetch.calls[0].url).toBe(SEARCH_URL);
      expect(fetch.calls[0].limits).toEqual({
        maxBytes: 32 * MIB,
        allowedContentTypes: ["application/json"],
        totalTimeoutMs: 60_000,
      });
      expect(sleep).not.toHaveBeenCalled();
    });

    it("sends no validator, whatever the stored ones are, and downloads in full: the API sends none", async () => {
      const fetch = fakeFetch(searchFile([resultOf()]));
      const result = await ukAtrsConnector.download(fetch, {
        etag: `k${ukAtrsConnector.version}:`,
        lastModified: "Mon, 09 Nov 2026 10:05:44 GMT",
      });
      expect(result).not.toBe("unchanged");
      expect(fetch.calls[0].validators).toEqual({});
      if (result === "unchanged") return;
      expect(result.etag).toBe(`k${ukAtrsConnector.version}:`);
      expect(result.lastModified).toBeNull();
    });

    it("has the whole list as the one body of its snapshot, and the bytes of the answer as its size", async () => {
      const text = pageText([resultOf()]);
      const snapshot = await downloadOf([resultOf()]);
      expect(snapshot.bodies).toHaveLength(1);
      expect(snapshot.bytes).toBe(Buffer.byteLength(text));
    });
  });

  describe("a result in the real shape", () => {
    it("gives one record for a supplier and its Companies House number, with its text word for word", async () => {
      const { parsed } = await runOf([
        resultOf({
          supplier: "Zorbex Analytics Ltd",
          number: "12345678",
          title: "Example tool one",
        }),
      ]);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
      expect(parsed.root).toBe("search.json");
      expect(parsed.records).toHaveLength(1);
      const [record] = parsed.records;
      expect(record.sourceRecordId).toBe("atrs:zorbexanalytics");
      expect(record.recordType).toBe("algorithm_register_supplier");
      expect(record.title).toBe("ATRS supplier: Zorbex Analytics Ltd");
      expect(record.url).toBe(`${SITE}/algorithmic-transparency-records/example-tool-1`);
      expect(record.publishedAt).toBe("2026-03-04");
      expect(record.sourceUpdatedAt).toBeNull();
      expect(record.matchKeys).toEqual([
        "name:zorbexanalyticsltd",
        "name:zorbexanalytics",
        "regno:12345678",
      ]);
      expect(record.identifiers).toEqual({
        supplier: "Zorbex Analytics Ltd",
        records: 1,
        newest: "2026-03-04",
        companiesHouse: ["12345678"],
      });
      expect(record.summary).toBe(
        [
          FIRST_SENTENCE,
          SECOND_SENTENCE,
          "Supplier as written: Zorbex Analytics Ltd.",
          "UK public bodies name this supplier in 1 record (1 in production).",
          "Newest: “Example tool one” by example borough council, in production, published 2026-03-04.",
          "Companies House number given: 12345678.",
          CLOSING,
        ].join(" "),
      );
      expectWellFormedRecords(parsed.records, { sourceId: "uk_atrs", mark: MARK });
    });

    it("leaves out the sentence on the number when the record gives none, and has no number key", async () => {
      const { records } = await runOf([resultOf({ supplier: "Zorbex Analytics Ltd" })]);
      expect(records[0].summary).not.toContain("Companies House");
      expect(records[0].matchKeys.some((key) => key.startsWith("regno:"))).toBe(false);
      expect(records[0].identifiers).not.toHaveProperty("companiesHouse");
    });

    it("begins every summary with the mark, then the sentence that says what a record is not", async () => {
      const { records } = await runOf([resultFor(1, "Zorbex Analytics Ltd; Quillon Data")]);
      expect(records).toHaveLength(2);
      for (const record of records) {
        expect(record.summary.startsWith(MARK)).toBe(true);
        expect(
          record.summary.startsWith(`${FIRST_SENTENCE} ${SECOND_SENTENCE} Supplier as written: `),
        ).toBe(true);
        expect(record.summary.endsWith(CLOSING)).toBe(true);
      }
    });

    it("says that the list holds an entry and nothing of the supplier's conduct, and names no endorsement", async () => {
      const { records } = await runOf([resultOf()]);
      const text = `${records[0].title} ${records[0].summary}`;
      expect(text).toContain("says nothing about the supplier's conduct");
      expect(text).not.toMatch(
        /\b(certif\w*|endors\w*|confirm\w*|guarant\w*|violat\w*|breach\w*)\b/i,
      );
    });

    it("keeps the day of the newest publication as the day of the record, and the newest update as the version of the list", async () => {
      const { parsed } = await runOf([
        resultFor(1, "Zorbex Analytics Ltd", {
          published: "2025-01-02",
          stamp: "2025-06-07T01:02:03Z",
        }),
        resultFor(2, "Quillon Data", { published: "2026-02-03", stamp: "2026-04-05T23:59:59Z" }),
      ]);
      expect(parsed.sourceVersion).toBe("2026-04-05");
      expect(recordOfId(parsed.records, "zorbexanalytics").publishedAt).toBe("2025-01-02");
      expect(recordOfId(parsed.records, "quillondata").publishedAt).toBe("2026-02-03");
    });

    it("reads the update time of a result as the API writes it, and ignores one that is no time", async () => {
      const { parsed } = await runOf([
        resultFor(1, "Zorbex Analytics Ltd", { stamp: "not a time" }),
        resultFor(2, "Quillon Data", { stamp: "2026-13-45T00:00:00Z" }),
        resultFor(3, "Mavro Systems", { stamp: "2026-04-05 23:59:59" }),
        resultFor(4, "Plynth Labs", { stamp: "2026-02-03T01:02:03.000+00:00" }),
      ]);
      expect(parsed.sourceVersion).toBe("2026-02-03");
      const none = await runOf([
        resultFor(1, "Zorbex Analytics Ltd", { stamp: "2026-13-45T00:00:00Z" }),
      ]);
      expect(none.parsed.sourceVersion).toBeNull();
    });

    it.each(["v4.0", "4.0", "v3", "3.0", "v2.1", "v1.1"])(
      "reads a result of version %s of the standard, and one without the function: neither field is read",
      async (version) => {
        const result = resultOf({ supplier: "Zorbex Analytics Ltd" });
        result.algorithmic_transparency_record_atrs_version = version;
        delete result.algorithmic_transparency_record_function;
        const { records } = await runOf([result]);
        expect(idsOf(records)).toEqual(["atrs:zorbexanalytics"]);
      },
    );

    it("reads a result without the fields it does not read at all", async () => {
      const result: Row = {
        link: "/algorithmic-transparency-records/example-tool-1",
        indexable_content: contentOf({ supplier: "Zorbex Analytics Ltd" }),
      };
      const { records, parsed } = await runOf([result]);
      expect(parsed.errors).toBe(0);
      expect(idsOf(records)).toEqual(["atrs:zorbexanalytics"]);
      expect(records[0].publishedAt).toBeNull();
    });

    it("gives records of a different address each, the page of the newest record that names the supplier", async () => {
      const { records } = await runOf([
        resultFor(1, "Zorbex Analytics Ltd"),
        resultFor(2, "Quillon Data"),
        resultFor(3, "Mavro Systems"),
      ]);
      expect(new Set(records.map((record) => record.url)).size).toBe(3);
      for (const record of records) {
        expect(record.url).toMatch(
          /^https:\/\/www\.gov\.uk\/algorithmic-transparency-records\/example-tool-\d$/,
        );
      }
    });

    it("gives one address to the suppliers of one record: the page of the record is all there is to point at", async () => {
      const { records } = await runOf([resultFor(1, "Zorbex Analytics Ltd; Quillon Data")]);
      expect(records.map((record) => record.url)).toEqual([
        `${SITE}/algorithmic-transparency-records/example-tool-1`,
        `${SITE}/algorithmic-transparency-records/example-tool-1`,
      ]);
    });
  });

  describe("the sections of a record's text", () => {
    it.each([
      "External supplier",
      "Third party",
      "Third-party",
      "Supplier",
      "Supplier name",
      "External supplier name :",
      "Third party:",
      "THIRD PARTY",
      "external supplier",
    ])("takes the section titled %s for the supplier", async (title) => {
      const { records } = await runOf([
        resultOf({
          content: contentOf({ supplier: "Zorbex Analytics Ltd", supplierHeading: title }),
        }),
      ]);
      expect(idsOf(records)).toEqual(["atrs:zorbexanalytics"]);
    });

    it.each([
      "External supplier involvement",
      "Third party involvement",
      "Third party role",
      "External supplier role",
      "Supplier details",
      "The third party",
      "Suppliers",
    ])("does not take the section titled %s for the supplier", async (title) => {
      const { records, parsed } = await runOf([
        resultOf({
          content: contentOf({ supplier: "Zorbex Analytics Ltd", supplierHeading: title }),
        }),
      ]);
      expect(records).toEqual([]);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
    });

    it.each([
      "Companies House Number",
      "Company number",
      "Company registration number",
      "External supplier identifier",
      "companies house number (if the supplier has one)",
    ])("takes the section titled %s for the number", async (title) => {
      const { records } = await runOf([
        resultOf({
          content: contentOf({
            supplier: "Zorbex Analytics Ltd",
            number: "12345678",
            numberHeading: title,
          }),
        }),
      ]);
      expect(records[0].matchKeys).toContain("regno:12345678");
    });

    it("does not take another section for the number", async () => {
      const { records } = await runOf([
        resultOf({
          content: contentOf({
            supplier: "Zorbex Analytics Ltd",
            number: "12345678",
            numberHeading: "Registration",
          }),
        }),
      ]);
      expect(records[0].matchKeys.some((key) => key.startsWith("regno:"))).toBe(false);
    });

    it.each([
      ["a Markdown heading", { prefix: "## " }],
      ["an en dash", { dash: "–" }],
      ["an em dash", { dash: "—" }],
    ])("finds the headings of a text with %s", async (_name, layout) => {
      const { records } = await runOf([
        resultOf({
          content: contentOf({ supplier: "Zorbex Analytics Ltd", number: "12345678", ...layout }),
        }),
      ]);
      expect(records[0].matchKeys).toContain("regno:12345678");
    });

    it("finds a heading whose number is followed by the dash with no blank", async () => {
      const content =
        "1.4.1-External supplier\n\nZorbex Analytics Ltd\n\n1.4.2-Companies House Number\n\n12345678\n";
      const { records } = await runOf([resultOf({ content })]);
      expect(idsOf(records)).toEqual(["atrs:zorbexanalytics"]);
      expect(records[0].matchKeys).toContain("regno:12345678");
    });

    it.each([
      ["a number with no dash", "1.4.1 External supplier\n\nZorbex Analytics Ltd\n"],
      ["a title with no number", "External supplier\n\nZorbex Analytics Ltd\n"],
      ["a dash with no title", "1.4.1 -\n\nZorbex Analytics Ltd\n"],
      [
        "more than four parts of a number",
        "1.4.1.2.3 - External supplier\n\nZorbex Analytics Ltd\n",
      ],
      ["a text that is no heading at all", "Third party: Zorbex Analytics Ltd\n"],
    ])("takes %s for no heading, so that the record has no supplier", async (_name, content) => {
      const { records, parsed } = await runOf([resultOf({ content })]);
      expect(records).toEqual([]);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
    });

    it("gives no row, and no unreadable result, for the layout of version 1.1: its headings have no number", async () => {
      const { records, parsed } = await runOf([
        resultOf({
          content: contentOf({
            supplier: "Zorbex Analytics Ltd",
            number: "12345678",
            numbered: false,
          }),
        }),
      ]);
      expect(records).toEqual([]);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
    });

    it("gives no row for a record that names no supplier section, and counts nothing unreadable", async () => {
      const { records, parsed, snapshot } = await runOf([
        resultOf({ supplier: null }),
        resultOf({ n: 2, supplier: null }),
      ]);
      expect(records).toEqual([]);
      expect(parsed.skipped).toBe(0);
      expect(bodyOf(snapshot).unreadable).toBe(0);
    });

    it("ends the section of the supplier at the next heading, and at a line that begins a tier", async () => {
      const content = [
        "1.4.1 - External supplier",
        "",
        "Zorbex Analytics Ltd",
        "Tier 3 - Something else",
        "Quillon Data",
        "",
        "1.4.2 - Companies House Number",
        "",
        "12345678",
        "## Tier 4 - More",
        "87654321",
      ].join("\n");
      const { records } = await runOf([resultOf({ content })]);
      expect(idsOf(records)).toEqual(["atrs:zorbexanalytics"]);
      expect(records[0].matchKeys).toContain("regno:12345678");
      expect(records[0].matchKeys).not.toContain("regno:87654321");
    });

    it.each(["tier 3 - Something else", "TIER 3 - Something else", "  \tTier 3 - Something else"])(
      "ends the section of the supplier at the line %p, a tier in any case and with blanks before it",
      async (tier) => {
        const content = [
          "1.4.1 - External supplier",
          "",
          "Zorbex Analytics Ltd",
          tier,
          "Quillon Data",
        ].join("\n");
        const { records } = await runOf([resultOf({ content })]);
        expect(idsOf(records)).toEqual(["atrs:zorbexanalytics"]);
      },
    );

    it("reads headings and values that have blanks and tabs around them", async () => {
      const content = [
        "  \t1.4.1 - External supplier  ",
        "",
        " \tZorbex Analytics Ltd \t",
        "",
        "\t1.4.2 - Companies House Number",
        "  12345678\t",
      ].join("\n");
      const { records } = await runOf([resultOf({ content })]);
      expect(idsOf(records)).toEqual(["atrs:zorbexanalytics"]);
      expect(records[0].matchKeys).toContain("regno:12345678");
    });

    it("takes a line that its limit cut for a cut cell: the name it may have cut is not kept", async () => {
      // 995 blanks, a separator and a name: the 1,001 characters read end in the middle of the name.
      const { records } = await runOf([resultOf({ supplier: `${" ".repeat(995)}; Quillon Data` })]);
      expect(records).toEqual([]);
      const whole = await runOf([resultOf({ supplier: `${" ".repeat(900)}; Quillon Data` })]);
      expect(idsOf(whole.records)).toEqual(["atrs:quillondata"]);
    });

    it("takes a heading that a limit cut for no title of the supplier: what the cut took off is not known", async () => {
      const supplier = "Zorbex Analytics Ltd";
      const recordsFor = async (supplierHeading: string): Promise<ParsedRecord[]> =>
        (await runOf([resultOf({ content: contentOf({ supplier, supplierHeading }) })])).records;
      // The 300 characters of a title that are read hold the word and blanks: the title goes on.
      expect(await recordsFor(`Supplier${" ".repeat(300)}notes`)).toEqual([]);
      // The 1,001 characters of a line that are read end in blanks, and the line is trimmed to the word.
      expect(await recordsFor(`Supplier${" ".repeat(1_100)}notes`)).toEqual([]);
      // A title of 300 characters is read whole, with its blanks as they are; one of 301 is no title.
      expect(idsOf(await recordsFor(`Supplier${" ".repeat(288)}name`))).toEqual([
        "atrs:zorbexanalytics",
      ]);
      expect(await recordsFor(`Supplier${" ".repeat(289)}name`)).toEqual([]);
    });

    it("ends the section of the supplier at a heading whose title a limit cut, as at any heading", async () => {
      for (const blanks of [300, 1_100]) {
        const content = [
          "1.4.1 - External supplier",
          "",
          "Zorbex Analytics Ltd",
          `1.4.2 - Notes${" ".repeat(blanks)}more`,
          "Quillon Data",
        ].join("\n");
        expect(idsOf((await runOf([resultOf({ content })])).records)).toEqual([
          "atrs:zorbexanalytics",
        ]);
      }
    });

    it("takes a heading that a limit cut for no title of the number either", async () => {
      const keysFor = async (numberHeading: string): Promise<string[]> => {
        const content = contentOf({
          supplier: "Zorbex Analytics Ltd",
          number: "12345678",
          numberHeading,
        });
        return (await runOf([resultOf({ content })])).records[0].matchKeys;
      };
      expect(await keysFor("Companies House Number")).toContain("regno:12345678");
      // The title goes on past the 300 characters that are read, and the line past its 1,001.
      expect(await keysFor(`Companies House Number${" ".repeat(300)}notes`)).not.toContain(
        "regno:12345678",
      );
      expect(await keysFor(`Companies House Number${" ".repeat(1_100)}notes`)).not.toContain(
        "regno:12345678",
      );
    });

    it("reads a cell of several lines, a blank line between them or not, as a cell with several names", async () => {
      expect(await suppliersOf("Zorbex Analytics Ltd\n\n  \nQuillon Data\n")).toEqual([
        "Quillon Data",
        "Zorbex Analytics Ltd",
      ]);
    });

    it("takes the first section that is titled for the supplier, even when it is empty, and ignores the others", async () => {
      const first =
        "1.4.1 - Third party\n\nZorbex Analytics Ltd\n\n1.9.1 - Third party\n\nQuillon Data\n";
      expect(idsOf((await runOf([resultOf({ content: first })])).records)).toEqual([
        "atrs:zorbexanalytics",
      ]);
      const empty =
        "1.4.1 - Third party\n\n1.4.2 - Companies House Number\n\n12345678\n\n1.9.1 - Third party\n\nQuillon Data\n";
      expect((await runOf([resultOf({ content: empty })])).records).toEqual([]);
    });

    it("takes the first section that is titled for the number, and no number from a later one", async () => {
      const content = [
        "1.4.1 - External supplier",
        "",
        "Zorbex Analytics Ltd",
        "",
        "1.4.2 - Companies House Number",
        "",
        "12345678",
        "",
        "1.9.2 - Companies House Number",
        "",
        "87654321",
      ].join("\n");
      const { records } = await runOf([resultOf({ content })]);
      expect(records[0].matchKeys).toContain("regno:12345678");
      expect(records[0].matchKeys).not.toContain("regno:87654321");
    });

    it("reads a text whose lines end with a carriage return and a text with a no-break space in a heading", async () => {
      const crlf = contentOf({ supplier: "Zorbex Analytics Ltd", number: "12345678" })
        .split("\n")
        .join("\r\n");
      expect(idsOf((await runOf([resultOf({ content: crlf })])).records)).toEqual([
        "atrs:zorbexanalytics",
      ]);
      const spaced = `1.4.1${NBSP}-${NBSP}External${NBSP}supplier\n\nZorbex Analytics Ltd\n`;
      expect(idsOf((await runOf([resultOf({ content: spaced })])).records)).toEqual([
        "atrs:zorbexanalytics",
      ]);
    });
  });

  describe("the names in the cell of the supplier", () => {
    it.each<[string, string, string[]]>([
      ["a line break", "Zorbex Analytics\nQuillon Data", ["Quillon Data", "Zorbex Analytics"]],
      ["a semicolon", "Zorbex Analytics; Quillon Data", ["Quillon Data", "Zorbex Analytics"]],
      ["a comma", "Zorbex Analytics, Quillon Data", ["Quillon Data", "Zorbex Analytics"]],
      [
        "a slash with blanks",
        "Zorbex Analytics / Quillon Data",
        ["Quillon Data", "Zorbex Analytics"],
      ],
      [
        "a slash between two words",
        "Zorbex Analytics/Quillon Data",
        ["Quillon Data", "Zorbex Analytics"],
      ],
      [
        "an ampersand with blanks",
        "Zorbex Analytics & Quillon Data",
        ["Quillon Data", "Zorbex Analytics"],
      ],
      [
        "the word and before a capital",
        "Zorbex Analytics and Quillon Data",
        ["Quillon Data", "Zorbex Analytics"],
      ],
      [
        "a plus with blanks",
        "Zorbex Analytics + Quillon Data",
        ["Quillon Data", "Zorbex Analytics"],
      ],
    ])("splits the cell at %s", async (_name, cell, expected) => {
      expect(await suppliersOf(cell)).toEqual(expected);
    });

    it("does not split at the word and before a lower case letter, nor at AND: only a capital after it is a second name", async () => {
      expect(await suppliersOf("Zorbex Analytics and partners")).toEqual([
        "Zorbex Analytics and partners",
      ]);
      expect(await suppliersOf("Zorbex Analytics AND Quillon Data")).toEqual([
        "Zorbex Analytics AND Quillon Data",
      ]);
      expect(await suppliersOf("Zorbex Analytics and Quillon Data")).toEqual([
        "Quillon Data",
        "Zorbex Analytics",
      ]);
    });

    it("does not split an ampersand or a slash that has no word on both sides", async () => {
      expect(await suppliersOf("Zorbex&Quillon Data")).toEqual(["Zorbex&Quillon Data"]);
      expect(await suppliersOf("Zorbex Analytics /Quillon Data")).toEqual([
        "Zorbex Analytics /Quillon Data",
      ]);
    });

    it.each([
      "Inc",
      "Inc.",
      "inc",
      "LLC",
      "Ltd",
      "ltd.",
      "Limited",
      "LIMITED",
      "PLC",
      "plc",
      "Corp",
      "corp.",
    ])(
      "does not split a comma before the legal form %s, in whatever case: the name keeps its form",
      async (form) => {
        // A full stop at the end of a name is not kept: `Inc.` is written `Inc`.
        const written = form.replace(/\.$/, "");
        expect(await suppliersOf(`Quillon Data, ${form}`)).toEqual([`Quillon Data, ${written}`]);
        expect(await suppliersOf(`Quillon Data,${form}; Mavro Systems`)).toEqual([
          `Mavro Systems`,
          `Quillon Data,${written}`,
        ]);
      },
    );

    it("splits a comma before a word that only begins like a legal form", async () => {
      expect(await suppliersOf("Quillon Data, Incredible Works")).toEqual([
        "Incredible Works",
        "Quillon Data",
      ]);
      expect(await suppliersOf("Quillon Data, Corporate Labs")).toEqual([
        "Corporate Labs",
        "Quillon Data",
      ]);
      expect(await suppliersOf("Quillon Data, Ltdx Works")).toEqual(["Ltdx Works", "Quillon Data"]);
    });

    it("reads three names with every kind of separator and a legal form after a comma, and gives no number to any", async () => {
      const cell = "Zorbex Analytics; Plynth Labs, Quillon Data, Inc and Mavro Systems";
      const { records } = await runOf([resultOf({ supplier: cell, number: "12345678" })]);
      expect(records.map((record) => record.title.replace(/^ATRS supplier: /, "")).sort()).toEqual([
        "Mavro Systems",
        "Plynth Labs",
        "Quillon Data, Inc",
        "Zorbex Analytics",
      ]);
      expect(
        records.some((record) => record.matchKeys.some((key) => key.startsWith("regno:"))),
      ).toBe(false);
    });

    it("takes off the blanks, the stops, the colons, the dashes and the tabs at either end of a name", async () => {
      expect(await suppliersOf(`  - Zorbex Analytics .:  `)).toEqual(["Zorbex Analytics"]);
      expect(await suppliersOf(`\tZorbex Analytics\t`)).toEqual(["Zorbex Analytics"]);
      expect(await suppliersOf(`– Zorbex Analytics —`)).toEqual(["Zorbex Analytics"]);
    });

    it("takes the colon off a name before its alias and after it, and a tab off a yes that follows a separator", async () => {
      expect(await suppliersOf("Quillon Data (QD):")).toEqual(["Quillon Data"]);
      expect(await suppliersOf("Quillon Data: (QD)")).toEqual(["Quillon Data"]);
      // `Yes` is no supplier whatever stands before it, so the number still belongs to the one supplier.
      for (const cell of ["Quillon Data;\tYes", "Quillon Data; NA", "Quillon Data;\tn/a"]) {
        const { records } = await runOf([resultOf({ supplier: cell, number: "12345678" })]);
        expect(idsOf(records)).toEqual(["atrs:quillondata"]);
        expect(records[0].matchKeys).toContain("regno:12345678");
      }
    });

    it("takes off a leading yes or no, with what follows it, and only the word", async () => {
      expect(await suppliersOf("Yes, Zorbex Analytics")).toEqual(["Zorbex Analytics"]);
      expect(await suppliersOf("yes: Zorbex Analytics")).toEqual(["Zorbex Analytics"]);
      expect(await suppliersOf("Yes - Zorbex Analytics")).toEqual(["Zorbex Analytics"]);
      expect(await suppliersOf("Nobel Works Ltd")).toEqual(["Nobel Works Ltd"]);
      expect(await suppliersOf("Yesterday Systems")).toEqual(["Yesterday Systems"]);
    });

    it.each([
      "N/A",
      "n/a",
      "NA",
      "None",
      "none",
      "No",
      "Not applicable",
      "TBC",
      "tbc",
      "Unknown",
      "UNKNOWN",
      "-",
      "",
    ])("gives no row for the cell %p: it says there is no supplier", async (cell) => {
      expect(await suppliersOf(cell)).toEqual([]);
    });

    it("drops a bracket alias, and keeps a bracket in the middle of a name", async () => {
      expect(await suppliersOf("Zorbex Analytics (ZA)")).toEqual(["Zorbex Analytics"]);
      expect(await suppliersOf("Zorbex Analytics Ltd (trading as ZA)")).toEqual([
        "Zorbex Analytics Ltd",
      ]);
      expect(await suppliersOf("Zorbex (UK) Analytics Ltd")).toEqual(["Zorbex (UK) Analytics Ltd"]);
      expect(await suppliersOf("Zorbex Analytics (ZA) (UK)")).toEqual(["Zorbex Analytics"]);
    });

    it("gives no row for a name with an unbalanced bracket: half a name is no name", async () => {
      expect(await suppliersOf("Zorbex Analytics (formerly")).toEqual([]);
      expect(await suppliersOf("Quillon Data)")).toEqual([]);
      expect(await suppliersOf("Zorbex) (Analytics")).toEqual([]);
      expect(await suppliersOf("Zorbex Analytics Ltd (trading as ZA; Quillon Data)")).toEqual([]);
      expect(await suppliersOf("Mavro Systems; Zorbex Analytics (formerly")).toEqual([
        "Mavro Systems",
      ]);
    });

    it("keeps the spelling of a name as the cell writes it, and keys both the spelling and the name without its legal form", async () => {
      const { records } = await runOf([resultOf({ supplier: "The Quillon Data Company Limited" })]);
      expect(records[0].title).toBe("ATRS supplier: The Quillon Data Company Limited");
      expect(records[0].sourceRecordId).toBe("atrs:quillondata");
      expect(records[0].matchKeys).toEqual([
        "name:thequilloncompanydatalimited".replace("companydata", "datacompany"),
        "name:quillondata",
      ]);
    });
  });

  describe("the names that are accepted", () => {
    const MAX_NAME = `Zorbex ${"A".repeat(73)}`;

    it("accepts a name of eighty characters and refuses one of eighty-one", async () => {
      expect(MAX_NAME).toHaveLength(80);
      expect(await suppliersOf(MAX_NAME)).toEqual([MAX_NAME]);
      expect(await suppliersOf(`${MAX_NAME}A`)).toEqual([]);
    });

    it("accepts a name of seven words and refuses one of eight", async () => {
      expect(await suppliersOf("Zorbex Quillon Mavro Plynth Brannock Tessaly Varnic")).toHaveLength(
        1,
      );
      expect(
        await suppliersOf("Zorbex Quillon Mavro Plynth Brannock Tessaly Varnic Obelisk"),
      ).toEqual([]);
    });

    it("refuses a name of one character, and a name that begins with a lower case letter or a symbol", async () => {
      expect(await suppliersOf("Z")).toEqual([]);
      expect(await suppliersOf("zorbex Analytics")).toEqual([]);
      expect(await suppliersOf("_Zorbex Analytics")).toEqual([]);
      expect(await suppliersOf("(Zorbex Analytics")).toEqual([]);
      expect(await suppliersOf("Ünal Works")).toEqual([]);
    });

    it("accepts a name that begins with a digit", async () => {
      expect(await suppliersOf("3Dscape Works Ltd")).toEqual(["3Dscape Works Ltd"]);
      expect(await suppliersOf("42 Degrees North")).toEqual(["42 Degrees North"]);
    });

    it.each(["SW1A 1AA", "M1 1AE", "B33 8TH", "EC1A 1BB", "EC1A1BB", "W1A 0AX"])(
      "refuses the postcode %s: it is an address and no name",
      async (postcode) => {
        expect(await suppliersOf(postcode)).toEqual([]);
        expect(await suppliersOf(`Zorbex Analytics; ${postcode}`)).toEqual(["Zorbex Analytics"]);
      },
    );

    it("refuses a name that holds a colon or a quotation mark, straight or curly", async () => {
      expect(await suppliersOf("Supplier: Zorbex Analytics")).toEqual([]);
      expect(await suppliersOf("Zorbex: Analytics Ltd")).toEqual([]);
      expect(await suppliersOf(`"Zorbex" Analytics`)).toEqual([]);
      expect(await suppliersOf("“Zorbex Analytics”")).toEqual([]);
      expect(await suppliersOf("Zorbex “Analytics")).toEqual([]);
      expect(await suppliersOf("Zorbex Analytics”")).toEqual([]);
      expect(await suppliersOf(`Zorbex "Analytics" Ltd`)).toEqual([]);
      expect(await suppliersOf("Zorbex Analytics (ZA's)")).toEqual(["Zorbex Analytics"]);
    });

    it("accepts a quotation mark that is no double quote, and a name with an ampersand, a stop and a hyphen", async () => {
      expect(await suppliersOf("O'Brien Quillon Ltd")).toEqual(["O'Brien Quillon Ltd"]);
      expect(await suppliersOf("Zorbex-Quillon A.B.C. Systems")).toEqual([
        "Zorbex-Quillon A.B.C. Systems",
      ]);
      expect(await suppliersOf("Zorbex&Quillon")).toEqual(["Zorbex&Quillon"]);
    });

    it.each([
      "The algorithmic tool was built by a member of staff",
      "Zorbex Analytics is hosted",
      "Zorbex Analytics supplies the tool",
      "Provided by Zorbex Analytics",
      "Zorbex Analytics provides the service",
      "Zorbex Analytics runs it",
      "Zorbex Analytics which hosts",
      "Zorbex Analytics that we use",
      "Zorbex Analytics will deliver",
      "Zorbex Analytics has built it",
      "Zorbex Analytics Not applicable",
      "In-house development",
      "Various suppliers",
      "Multiple vendors",
      "Internal tool",
      "Developed internally",
      "Built by Zorbex",
      "Hosted by Zorbex Analytics",
      "Managed by Zorbex Analytics",
      "Operated by Zorbex Analytics",
      "Contracted to Zorbex Analytics",
      "Third party supplier",
      "Zorbex Analytics party",
      "Supplier of the tool",
      "Parties to the contract",
      "Department of Examples",
      "Examples authority",
      "Exampleshire Council has built it",
      "Zorbex Analytics team",
    ])("refuses the prose %p: it describes, and names no supplier", async (cell) => {
      expect(await suppliersOf(cell)).toEqual([]);
    });

    it("refuses the prose words in any case, and only as words", async () => {
      expect(await suppliersOf("ZORBEX ANALYTICS IS HOSTED")).toEqual([]);
      expect(await suppliersOf("Wearable Labs")).toEqual(["Wearable Labs"]);
      expect(await suppliersOf("Itinerary Systems")).toEqual(["Itinerary Systems"]);
      expect(await suppliersOf("Isis Works")).toEqual(["Isis Works"]);
      expect(await suppliersOf("Teamwork Software")).toEqual(["Teamwork Software"]);
      expect(await suppliersOf("Ourfield Partners")).toEqual(["Ourfield Partners"]);
      expect(await suppliersOf("Whoever Systems")).toEqual(["Whoever Systems"]);
      expect(
        await suppliersOf("Example Borough Council", { authority: "another-borough-council" }),
      ).toEqual(["Example Borough Council"]);
    });

    it.each([
      "United Kingdom",
      "UK",
      "Great Britain",
      "England",
      "Scotland",
      "Wales",
      "Northern Ireland",
      "United Kingdom Limited",
      "Wales Ltd",
    ])("gives no row for the country %s: it is no supplier", async (country) => {
      expect(await suppliersOf(country)).toEqual([]);
      expect(await suppliersOf(`Zorbex Analytics; ${country}`)).toEqual(["Zorbex Analytics"]);
    });

    it("keeps a name that only contains a country", async () => {
      expect(await suppliersOf("Scotland Works Ltd")).toEqual(["Scotland Works Ltd"]);
      expect(await suppliersOf("Zorbex UK")).toEqual(["Zorbex UK"]);
    });

    it("gives no row for the deploying body itself, and keeps the same name for another body", async () => {
      const cell = "Exampleshire County Council; Zorbex Analytics Ltd";
      expect(await suppliersOf(cell, { authority: "exampleshire-county-council" })).toEqual([
        "Zorbex Analytics Ltd",
      ]);
      expect(await suppliersOf(cell, { authority: "another-borough-council" })).toEqual([
        "Exampleshire County Council",
        "Zorbex Analytics Ltd",
      ]);
      expect(
        await suppliersOf("Exampleshire County Council", {
          authority: "exampleshire-county-council",
        }),
      ).toEqual([]);
      expect(
        await suppliersOf("exampleshire county council", {
          authority: "exampleshire-county-council",
        }),
      ).toEqual([]);
    });

    it.each([
      "Exampleshire County Council",
      "EXAMPLESHIRE  COUNTY-COUNCIL",
      "Exampleshire County Council Ltd",
      "The Exampleshire County Council",
    ])(
      "compares the deploying body as a compact name, with or without its legal form: %s is the body",
      async (written) => {
        expect(await suppliersOf(written, { authority: "exampleshire-county-council" })).toEqual(
          [],
        );
        expect(await suppliersOf(written, { authority: "another-county-council" })).toHaveLength(1);
      },
    );

    it("compares the deploying body as it is written too, when its slug holds a legal form", async () => {
      expect(
        await suppliersOf("Exampleshire Works Ltd", { authority: "exampleshire-works-ltd" }),
      ).toEqual([]);
      expect(
        await suppliersOf("Exampleshire Works Ltd", { authority: "exampleshire-works-limited" }),
      ).toHaveLength(1);
    });

    it("has no rule on the deploying body for a result that names none, and names no body in its summary", async () => {
      const result = resultOf({ supplier: "Exampleshire County Council" });
      delete result.algorithmic_transparency_record_organisation;
      const { records } = await runOf([result]);
      expect(records).toHaveLength(1);
      expect(records[0].summary).toContain(
        "Newest: “Example tool 1”, in production, published 2026-03-04.",
      );
    });

    it("refuses an e-mail address and a telephone number inside the cell of the supplier, and keeps the names beside them", async () => {
      const cell = `Zorbex Analytics Ltd; Jo.Example@example.test; ${PHONE}; 01234 567890; Quillon Data; Contact@Zorbex.example.test`;
      const run = await runOf([resultOf({ supplier: cell })]);
      expect(idsOf(run.records)).toEqual(["atrs:quillondata", "atrs:zorbexanalytics"]);
      const text = textOfRun(run);
      for (const planted of ["@", "example.test", "0300", "000 0000", "01234", "567890"]) {
        expect(text).not.toContain(planted);
      }
    });

    it("refuses a name that has no letter in it: a number is no supplier", async () => {
      expect(await suppliersOf("12345678")).toEqual([]);
      expect(await suppliersOf("2026-03-04")).toEqual([]);
      expect(await suppliersOf("42")).toEqual([]);
    });

    it("gives no row to a name of fewer than four letters and digits once its legal form is off, and counts nothing unreadable", async () => {
      const { records, parsed } = await runOf([
        resultOf({ supplier: "Abc Ltd; Xy; Zorbex Analytics Ltd" }),
      ]);
      expect(idsOf(records)).toEqual(["atrs:zorbexanalytics"]);
      expect(parsed.skipped).toBe(0);
      expect(parsed.errors).toBe(0);
    });

    it("gives a row to a name of exactly four letters and digits", async () => {
      expect(await suppliersOf("Abcd")).toEqual(["Abcd"]);
      expect(await suppliersOf("Ab 12 Ltd")).toEqual(["Ab 12 Ltd"]);
      expect(await suppliersOf("Ab 1 Ltd")).toEqual([]);
    });
  });

  describe("the number of the supplier", () => {
    const cellOf = (number: string, supplier = "Zorbex Analytics Ltd"): Promise<ParsedRecord[]> =>
      runOf([resultOf({ supplier, number })]).then((run) => run.records);

    it.each([
      ["eight digits", "12345678", "12345678"],
      ["seven digits", "1234567", "1234567"],
      ["two letters and six digits", "SC123456", "SC123456"],
      ["a number inside a sentence", "Registered in England, number 12345678 (Zorbex)", "12345678"],
      ["a number with blanks around it", "  12345678\t", "12345678"],
    ])("gives the number key of %s", async (_name, cell, number) => {
      const records = await cellOf(cell);
      expect(records[0].matchKeys).toContain(`regno:${number.toLowerCase()}`);
      expect(records[0].summary).toContain(`Companies House number given: ${number}.`);
    });

    it.each([
      ["nothing", ""],
      ["not applicable", "N/A"],
      ["nine digits", "123456789"],
      ["six digits", "123456"],
      ["a letter inside the number", "1234A678"],
      ["one letter and seven digits", "S1234567X"],
      ["three letters and six digits", "ABC123456"],
    ])("gives no number key for %s", async (_name, cell) => {
      const records = await cellOf(cell);
      expect(records[0].matchKeys.some((key) => key.startsWith("regno:"))).toBe(false);
    });

    it("gives the number to the supplier only when the record has one supplier and one number", async () => {
      expect((await cellOf("12345678"))[0].matchKeys).toContain("regno:12345678");
      // Two suppliers: the number could belong to either, so it is given to neither.
      const two = await cellOf("12345678", "Zorbex Analytics Ltd; Quillon Data");
      expect(two).toHaveLength(2);
      expect(two.some((record) => record.matchKeys.some((key) => key.startsWith("regno:")))).toBe(
        false,
      );
      // Two numbers: there is no telling which is the supplier's.
      const numbers = await cellOf("12345678 and 87654321");
      expect(numbers[0].matchKeys.some((key) => key.startsWith("regno:"))).toBe(false);
    });

    it("counts the same number twice as two numbers, as it was measured, and a name that gives no row as a supplier", async () => {
      expect(
        (await cellOf("12345678 12345678"))[0].matchKeys.some((key) => key.startsWith("regno:")),
      ).toBe(false);
      const withShort = await cellOf("12345678", "Zorbex Analytics Ltd; Abc");
      expect(withShort).toHaveLength(1);
      expect(withShort[0].matchKeys.some((key) => key.startsWith("regno:"))).toBe(false);
    });

    it("counts a name of one character as no supplier, and one of two characters as a supplier, for the number", async () => {
      const one = await cellOf("12345678", "Zorbex Analytics Ltd; Z");
      expect(one[0].matchKeys).toContain("regno:12345678");
      const two = await cellOf("12345678", "Zorbex Analytics Ltd; Zz");
      expect(two[0].matchKeys.some((key) => key.startsWith("regno:"))).toBe(false);
    });

    it("counts a country, a postcode and a name of the prose list as no supplier, so that the number goes to the supplier left", async () => {
      const records = await cellOf(
        "12345678",
        "Zorbex Analytics Ltd; United Kingdom; SW1A 1AA; N/A",
      );
      expect(records).toHaveLength(1);
      expect(records[0].matchKeys).toContain("regno:12345678");
    });

    it("gives no number when the section of the number was cut at its limit: a cut number is no number", async () => {
      // 1,001 characters: the cut leaves the first seven digits of the number, which are no number.
      const cut = await cellOf(`${"x".repeat(992)} 12345678`);
      expect(cut[0].matchKeys.some((key) => key.startsWith("regno:"))).toBe(false);
      // 1,000 characters are not cut: the limit is not the end.
      const whole = await cellOf(`${"x".repeat(992)} 1234567`);
      expect(whole[0].matchKeys).toContain("regno:1234567");
    });

    it("gives no number when the cell of the supplier was cut: a name may have been lost with its sisters", async () => {
      const cell = `Zorbex Analytics Ltd; ${"x".repeat(990)}; Quillon Data`;
      const { records } = await runOf([resultOf({ supplier: cell, number: "12345678" })]);
      expect(idsOf(records)).toEqual(["atrs:zorbexanalytics"]);
      expect(records[0].matchKeys.some((key) => key.startsWith("regno:"))).toBe(false);
    });

    it("gives the numbers of the records of one supplier to its one record, at most three, in a fixed order", async () => {
      const run = await runOf([
        resultFor(1, "Zorbex Analytics Ltd", { number: "33333333" }),
        resultFor(2, "Zorbex Analytics Limited", { number: "11111111" }),
        resultFor(3, "Zorbex Analytics Ltd", { number: "22222222" }),
        resultFor(4, "Zorbex Analytics Ltd", { number: "44444444" }),
      ]);
      expect(run.records).toHaveLength(1);
      const keys = run.records[0].matchKeys.filter((key) => key.startsWith("regno:"));
      expect(keys).toEqual(["regno:11111111", "regno:22222222", "regno:33333333"]);
      expect(run.records[0].summary).toContain(
        "Companies House number given: 11111111, 22222222, 33333333.",
      );
    });
  });

  describe("one record for each supplier", () => {
    it("joins the records that name a supplier with different spellings, and counts both", async () => {
      const { records } = await runOf([
        resultFor(1, "Example Systems Limited", { published: "2026-01-10", phase: "production" }),
        resultFor(2, "Example Systems Ltd", {
          published: "2026-02-20",
          phase: "retired",
          authority: "other-borough-council",
        }),
      ]);
      expect(records).toHaveLength(1);
      const [record] = records;
      expect(record.sourceRecordId).toBe("atrs:examplesystems");
      // The spellings are equally frequent: the one of the newest record is shown.
      expect(record.title).toBe("ATRS supplier: Example Systems Ltd");
      expect(record.matchKeys).toEqual([
        "name:examplesystemsltd",
        "name:examplesystems",
        "name:examplesystemslimited",
      ]);
      expect(record.identifiers).toMatchObject({ supplier: "Example Systems Ltd", records: 2 });
      expect(record.publishedAt).toBe("2026-02-20");
      expect(record.url).toBe(`${SITE}/algorithmic-transparency-records/example-tool-2`);
      expect(record.summary).toContain(
        "UK public bodies name this supplier in 2 records (1 in production, 1 retired).",
      );
      expect(record.summary).toContain(
        "Newest: “Example tool 2” by other borough council, retired, published 2026-02-20; “Example tool 1” by example borough council, in production, published 2026-01-10.",
      );
    });

    it("shows the most frequent spelling of the supplier, and the newest of equally frequent ones", async () => {
      const { records } = await runOf([
        resultFor(1, "Example Systems Ltd", { published: "2026-01-01" }),
        resultFor(2, "Example Systems Limited", { published: "2026-02-01" }),
        resultFor(3, "Example Systems Limited", { published: "2025-12-01" }),
        resultFor(4, "Example Systems Inc", { published: "2026-03-01" }),
      ]);
      expect(records).toHaveLength(1);
      // "Limited" is written twice, the other two spellings once each.
      expect(records[0].title).toBe("ATRS supplier: Example Systems Limited");
    });

    it("shows the dated spelling before an undated one of the same frequency, whatever the order of the results", async () => {
      const dated = resultFor(1, "Example Systems Ltd", { published: "2026-01-01" });
      const undated = resultFor(2, "Example Systems Limited", { published: "not a day" });
      for (const results of [
        [dated, undated],
        [undated, dated],
      ]) {
        const { records } = await runOf(results);
        expect(records[0].title).toBe("ATRS supplier: Example Systems Ltd");
      }
    });

    it("compares spellings of the same frequency by the newest day of all their records", async () => {
      const { records } = await runOf([
        resultFor(1, "Example Systems Ltd", { published: "2020-01-01" }),
        resultFor(2, "Example Systems Ltd", { published: "2026-01-01" }),
        resultFor(3, "Example Systems Limited", { published: "2024-01-01" }),
        resultFor(4, "Example Systems Limited", { published: "2024-01-01" }),
      ]);
      expect(records[0].title).toBe("ATRS supplier: Example Systems Ltd");
    });

    it("writes the body with its rows in the order of their keys, not of the names", async () => {
      const { snapshot } = await runOf([
        resultFor(1, "Abd Works; ABE Works"),
        resultFor(2, "Zorbex Analytics Ltd; Mavro Systems"),
      ]);
      const keys = bodyOf(snapshot).rows.map((row) => row.key);
      expect(keys).toEqual(["abdworks", "abeworks", "mavrosystems", "zorbexanalytics"]);
    });

    it("counts a record once for a supplier that it names twice, and counts its two spellings as one record", async () => {
      const { records } = await runOf([
        resultFor(1, "Example Systems Ltd; Example Systems Limited"),
      ]);
      expect(records).toHaveLength(1);
      expect(records[0].identifiers).toMatchObject({ records: 1 });
      expect(records[0].summary).toContain("in 1 record (1 in production).");
    });

    it("keeps the names of the entity to ten spellings", async () => {
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
      const { records } = await runOf(
        forms.map((form, at) => resultFor(at + 1, `Example Systems ${form}`)),
      );
      expect(records).toHaveLength(1);
      const names = records[0].matchKeys.filter((key) => key.startsWith("name:"));
      // Ten spellings, each with its compact name, and one key that they share: the name without its form.
      expect(names).toHaveLength(11);
      expect(names).toContain("name:examplesystems");
      // All twelve are written once on the same day: the order of the texts decides which ten.
      expect(names).toContain("name:examplesystemsnv");
      expect(names).not.toContain("name:examplesystemsplc");
      expect(names).not.toContain("name:examplesystemssa");
      expect(records[0].identifiers).toMatchObject({ records: 12 });
    });

    it("tells two spellings of a group apart only by their letters and digits: the id is the compact name without its legal form", async () => {
      const { records } = await runOf([
        resultFor(1, "Amazon Web Services"),
        resultFor(2, "Amazon"),
        resultFor(3, "AMAZON WEB SERVICES LIMITED"),
        resultFor(4, "The Amazon Web Services Company"),
      ]);
      expect(idsOf(records)).toEqual(["atrs:amazon", "atrs:amazonwebservices"]);
      expect(recordOfId(records, "amazonwebservices").identifiers).toMatchObject({ records: 3 });
      expect(recordOfId(records, "amazon").identifiers).toMatchObject({ records: 1 });
    });

    it("counts the records of an entity by phase, in the words of the summary", async () => {
      const phases = [
        "production",
        "production",
        "beta-pilot",
        "private-beta",
        "public-beta",
        "pre-deployment",
        "retired",
      ];
      const { records } = await runOf(
        phases.map((phase, at) => resultFor(at + 1, "Zorbex Analytics Ltd", { phase })),
      );
      expect(records[0].summary).toContain(
        "in 7 records (2 in production, 1 beta or pilot, 1 private beta, 1 public beta, 1 before deployment, 1 retired).",
      );
    });

    it("writes a phase that it does not know as unknown", async () => {
      const result = resultFor(1, "Zorbex Analytics Ltd", { phase: "ZZ-NEW-PHASE" });
      const missing = resultFor(2, "Zorbex Analytics Ltd");
      delete missing.algorithmic_transparency_record_phase;
      const { records } = await runOf([result, missing]);
      expect(records[0].summary).toContain("in 2 records (2 phase unknown).");
      expect(records[0].summary).toContain(", phase unknown, published ");
      expect(
        textOfRun({
          snapshot: { bodies: [], etag: null, lastModified: null, bytes: 0 },
          parsed: {} as ParseResult,
          records,
        }),
      ).not.toContain("ZZ-NEW-PHASE");
    });

    it("shows the newest three records of the entity, by day and then by link, and counts them all", async () => {
      const { records } = await runOf([
        resultFor(1, "Zorbex Analytics Ltd", { published: "2026-01-01", title: "First tool" }),
        resultFor(2, "Zorbex Analytics Ltd", { published: "2026-03-01", title: "Second tool" }),
        resultFor(3, "Zorbex Analytics Ltd", { published: "2026-03-01", title: "Third tool" }),
        resultFor(4, "Zorbex Analytics Ltd", { published: "2026-02-01", title: "Fourth tool" }),
        resultFor(5, "Zorbex Analytics Ltd", { published: "2025-12-01", title: "Fifth tool" }),
      ]);
      const [record] = records;
      expect(record.summary).toContain("in 5 records (5 in production).");
      const newest = /Newest: (.*?)\. Adapted/.exec(record.summary)?.[1] ?? "";
      expect(newest.split("; ")).toEqual([
        "“Second tool” by example borough council, in production, published 2026-03-01",
        "“Third tool” by example borough council, in production, published 2026-03-01",
        "“Fourth tool” by example borough council, in production, published 2026-02-01",
      ]);
      // The two newest tie on the day: the link decides, and the address is the first of them.
      expect(record.url).toBe(`${SITE}/algorithmic-transparency-records/example-tool-2`);
      expect(record.publishedAt).toBe("2026-03-01");
    });

    it("puts a record without a readable day after the records that have one, and writes that it has none", async () => {
      const { records } = await runOf([
        resultFor(1, "Zorbex Analytics Ltd", { published: "not a day" }),
        resultFor(2, "Zorbex Analytics Ltd", { published: "2026-01-01" }),
      ]);
      expect(records[0].url).toBe(`${SITE}/algorithmic-transparency-records/example-tool-2`);
      expect(records[0].publishedAt).toBe("2026-01-01");
      expect(records[0].summary).toContain("publication date not stated");
    });

    it("puts a record without a day after the dated ones whatever the order of the results", async () => {
      const dated = resultFor(1, "Zorbex Analytics Ltd", { published: "2026-01-01" });
      const undated = resultFor(2, "Zorbex Analytics Ltd", { published: "not a day" });
      for (const results of [
        [dated, undated],
        [undated, dated],
      ]) {
        const { records } = await runOf(results);
        expect(records[0].summary).toContain(
          "Newest: “Example tool 1” by example borough council, in production, published 2026-01-01; “Example tool 2” by example borough council, in production, publication date not stated.",
        );
      }
    });

    it("gives a record whose only publication day is unreadable no day at all", async () => {
      const { records } = await runOf([
        resultFor(1, "Zorbex Analytics Ltd", { published: "2026-13-45" }),
      ]);
      expect(records[0].publishedAt).toBeNull();
    });

    it("gives the same ids whatever the order of the results, and the same records", async () => {
      const results = [
        resultFor(1, "Zorbex Analytics Ltd; Quillon Data", { published: "2026-01-01" }),
        resultFor(2, "Quillon Data; Mavro Systems", { published: "2026-02-01", phase: "retired" }),
        resultFor(3, "Mavro Systems Limited", { published: "2026-02-01" }),
        resultFor(4, "Zorbex Analytics Limited", { published: "2026-03-01", number: "12345678" }),
      ];
      const forward = await runOf(results);
      const backward = await runOf([...results].reverse());
      expect(backward.snapshot.bodies).toEqual(forward.snapshot.bodies);
      expect(backward.parsed).toEqual(forward.parsed);
      expect(idsOf(forward.records)).toEqual([
        "atrs:mavrosystems",
        "atrs:quillondata",
        "atrs:zorbexanalytics",
      ]);
    });

    it("gives the same body for the same list however the results are ordered, with the kit's contract", async () => {
      const results = [
        resultFor(1, "Zorbex Analytics Ltd"),
        resultFor(2, "Quillon Data; Mavro Systems"),
        resultFor(3, "Plynth Labs"),
        resultFor(4, "Zorbex Analytics Limited"),
      ];
      await expectDeterministic(connectorOf(), (reversed) =>
        fakeFetch(searchFile(reversed ? [...results].reverse() : results)),
      );
    });

    it("keeps the id of a supplier whatever its legal form and its case, and gives each entity one id", async () => {
      const { records } = await runOf([
        resultFor(1, "ZORBEX ANALYTICS LTD"),
        resultFor(2, "zorbex analytics"),
        resultFor(3, "Zorbex Analytics, Inc."),
      ]);
      // The second starts with a lower case letter: it is no name.
      expect(idsOf(records)).toEqual(["atrs:zorbexanalytics"]);
      expect(records[0].identifiers).toMatchObject({ records: 2 });
    });

    it("gives the same body for the same list read on two different days: no clock is read", async () => {
      const results = [resultFor(1, "Zorbex Analytics Ltd", { published: "2026-01-01" })];
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
        const first = await runOf(results);
        jest.setSystemTime(new Date("2029-03-01T12:00:00Z"));
        const second = await runOf(results);
        expect(second.snapshot.bodies).toEqual(first.snapshot.bodies);
        expect(second.parsed).toEqual(first.parsed);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("what a result holds that it must not give", () => {
    it("leaves out every field and every part of the text that it does not read, the contact details above all", async () => {
      const run = await runOf([
        resultOf({
          supplier: "Zorbex Analytics Ltd",
          number: "12345678",
          title: "Example tool one",
        }),
      ]);
      const text = textOfRun(run);
      for (const planted of [
        ...Object.values(LEFT_OUT),
        EMAIL,
        "example.test",
        PHONE,
        "0300",
        ADDRESS_IN_TEXT,
        "zz-address",
        "Write to",
        "describes the tool",
      ]) {
        expect(text).not.toContain(planted);
      }
      // What it did read is there.
      expect(text).toContain("Zorbex Analytics Ltd");
      expect(text).toContain("12345678");
    });

    it("keeps no text of a record that gives no supplier, nor of a result that is not read", async () => {
      const run = await runOf([resultOf({ supplier: null }), resultOf({ n: 2, content: 7 })]);
      expect(run.records).toEqual([]);
      const text = JSON.stringify(run.snapshot.bodies);
      for (const planted of [...Object.values(LEFT_OUT), EMAIL, PHONE])
        expect(text).not.toContain(planted);
    });

    it("keeps no number that the section of the number holds beside the number", async () => {
      const run = await runOf([
        resultOf({
          supplier: "Zorbex Analytics Ltd",
          number: `12345678 ZZ-AFTER-THE-NUMBER ${EMAIL}`,
        }),
      ]);
      expect(textOfRun(run)).not.toContain("ZZ-AFTER-THE-NUMBER");
      expect(textOfRun(run)).not.toContain("example.test");
    });

    it("never keeps the description of the record, however it reads", async () => {
      const result = resultOf({ supplier: "Zorbex Analytics Ltd" });
      result.description = "Supplied by Quillon Data (ZZ-DESCRIPTION-NAME) for Example tool";
      const run = await runOf([result]);
      expect(idsOf(run.records)).toEqual(["atrs:zorbexanalytics"]);
      expect(textOfRun(run)).not.toContain("Quillon");
    });
  });

  describe("hostile cells", () => {
    it("takes the characters nobody sees, the no-break spaces, the tabs and the double spaces out of a name", async () => {
      const cell = `Zorbex${ZWSP}${NBSP}${NBSP}Analytics${LRM}\t Ltd${RLO}`;
      const { records } = await runOf([resultOf({ supplier: cell })]);
      expect(records).toHaveLength(1);
      expect(records[0].title).toBe("ATRS supplier: Zorbex Analytics Ltd");
      expect(records[0].sourceRecordId).toBe("atrs:zorbexanalytics");
      expect(records[0].identifiers).toMatchObject({ supplier: "Zorbex Analytics Ltd" });
      expectWellFormedRecords(records, { sourceId: "uk_atrs", mark: MARK });
    });

    it("gives the same record for a name with a hidden character in the middle of a word and the name without it", async () => {
      const hidden = await runOf([resultOf({ supplier: `Zor${ZWSP}bex Analytics Ltd` })]);
      const plain = await runOf([resultOf({ supplier: "Zorbex Analytics Ltd" })]);
      expect(hidden.records).toEqual(plain.records);
    });

    it("refuses a name that begins with a hidden character, which is no capital: the accept rule sees the cell as it is", async () => {
      expect(await suppliersOf(`${ZWSP}Zorbex Analytics Ltd`)).toEqual([]);
    });

    it("gives no row for a name that holds markup, a full-width angle bracket included, and keeps the names beside it", async () => {
      const cell = [
        "Zorbex <b>Analytics</b> Ltd",
        "<script>alert(1)</script>",
        "Quillon <script>zzmarker</script> Data",
        `Plynth ${cp(0xff1c)}i${cp(0xff1e)} Labs`,
        "Mavro Systems",
      ].join("; ");
      const run = await runOf([resultOf({ supplier: cell })]);
      expect(idsOf(run.records)).toEqual(["atrs:mavrosystems"]);
      const text = textOfRun(run);
      expect(text).not.toMatch(/[<>]/);
      for (const left of ["Zorbex", "alert", "zzmarker", "Quillon", "Plynth"])
        expect(text).not.toContain(left);
      expectWellFormedRecords(run.records, { sourceId: "uk_atrs", mark: MARK });
    });

    it("writes the angle brackets of a title as the angle quotation marks, and none in the summary", async () => {
      const result = resultOf({
        supplier: "Zorbex Analytics Ltd",
        title: "Tool <b>one</b> for <i>all</i>",
      });
      const { records } = await runOf([result]);
      expect(records[0].summary).toContain(
        `${cp(0x201c)}Tool ${cp(0x2039)}b${cp(0x203a)}one${cp(0x2039)}/b${cp(0x203a)}`,
      );
      expect(records[0].summary).not.toMatch(/[<>]/);
      expectWellFormedRecords(records, { sourceId: "uk_atrs", mark: MARK });
    });

    it("replaces a lone surrogate, and keeps none in the body of the snapshot nor in a record", async () => {
      const run = await runOf([resultOf({ supplier: `Zorbex Analytics${LONE_SURROGATE} Ltd` })]);
      expect(run.records).toHaveLength(1);
      const text = textOfRun(run);
      expect(text).not.toMatch(/\\ud[89a-f][0-9a-f]{2}/i);
      for (const record of run.records) {
        expect(record.title).not.toMatch(/[\u{D800}-\u{DFFF}]/u);
        expect(record.summary).not.toMatch(/[\u{D800}-\u{DFFF}]/u);
      }
      expectWellFormedRecords(run.records, { sourceId: "uk_atrs", mark: MARK });
    });

    it("cuts a cell of 100 KB at a thousand characters, and keeps no name that the cut fell in", async () => {
      const cell = `Zorbex Analytics Ltd; ${"Quillon Data; ".repeat(10_000)}`;
      const { records, parsed } = await runOf([resultOf({ supplier: cell })]);
      expect(parsed.errors).toBe(0);
      expect(idsOf(records)).toEqual(["atrs:quillondata", "atrs:zorbexanalytics"]);
      // The cut text is one result's, and each name is counted once for that record.
      expect(recordOfId(records, "quillondata").identifiers).toMatchObject({ records: 1 });
    });

    it("keeps no half of a name when the cut falls in the middle of it", async () => {
      // 995 characters of a name made of letters that no name has, then a name that the cut halves.
      const filler = `${"Mavro Systems; ".repeat(66)}`;
      expect(filler.length).toBeGreaterThanOrEqual(990);
      const cell = `${filler}Zorbex Analytics Ltd ZZ-NEVER-WHOLE`;
      const { records } = await runOf([resultOf({ supplier: cell })]);
      expect(idsOf(records)).toEqual(["atrs:mavrosystems"]);
    });

    it("keeps the last name of a cell of exactly a thousand characters, and not that of one of a thousand and one", async () => {
      const head = "Mavro Systems; ".repeat(62);
      const last = `Zorbex${"A".repeat(64)}`;
      expect(head.length + last.length).toBe(1_000);
      const whole = await runOf([resultOf({ supplier: `${head}${last}` })]);
      expect(idsOf(whole.records)).toEqual(["atrs:mavrosystems", `atrs:zorbex${"a".repeat(64)}`]);
      const cut = await runOf([resultOf({ supplier: `${head}${last}A` })]);
      expect(idsOf(cut.records)).toEqual(["atrs:mavrosystems"]);
    });

    it("refuses a single name of 100 KB: a name that long is none", async () => {
      const { records } = await runOf([resultOf({ supplier: `Zorbex${"x".repeat(100_000)}` })]);
      expect(records).toEqual([]);
    });

    it("reads at most the first 200,000 characters of a text, and keeps no section that the cut falls in", async () => {
      const early = contentOf({ supplier: "Zorbex Analytics Ltd" });
      const late = `${early}${"Filler line of the text\n".repeat(20_000)}`;
      const { records } = await runOf([resultOf({ content: late })]);
      expect(idsOf(records)).toEqual(["atrs:zorbexanalytics"]);
      // A supplier section that the cut ends has no end of its own: its last name is not kept, the others are.
      const heading = "\n1.4.1 - External supplier\n\n";
      const names = "Quillon Data; Mavro Systems";
      const sectionAt = (length: number, tail = ""): string =>
        `${"x".repeat(length - heading.length - names.length)}${heading}${names}${tail}`;
      // The text is exactly 200,000 characters: nothing is cut, and both names are kept.
      const exact = sectionAt(200_000);
      expect(exact).toHaveLength(200_000);
      expect(idsOf((await runOf([resultOf({ content: exact })])).records)).toEqual([
        "atrs:mavrosystems",
        "atrs:quillondata",
      ]);
      // One character more: the text is cut, the section that is open has no known end, and the last name goes.
      const over = sectionAt(200_000, "\n");
      expect(over).toHaveLength(200_001);
      expect(
        (await runOf([resultOf({ content: over })])).records.map((record) => record.title),
      ).toEqual(["ATRS supplier: Quillon Data"]);
      // The cut falls inside the last name: the half of it that is read is no name.
      const inside = `${"x".repeat(199_953)}${heading}${names}`;
      expect(
        (await runOf([resultOf({ content: inside })])).records.map((record) => record.title),
      ).toEqual(["ATRS supplier: Quillon Data"]);
    });

    it("reads a text of 150,000 empty lines without trouble", async () => {
      const content = `${"\n".repeat(150_000)}${contentOf({ supplier: "Zorbex Analytics Ltd" })}`;
      const started = Date.now();
      const { records } = await runOf([resultOf({ content })]);
      expect(Date.now() - started).toBeLessThan(10_000);
      expect(idsOf(records)).toEqual(["atrs:zorbexanalytics"]);
    });
  });

  describe("time", () => {
    const within = async (content: string, limitMs = 2_000): Promise<void> => {
      const started = Date.now();
      await runOf([resultOf({ content })]);
      expect(Date.now() - started).toBeLessThan(limitMs);
    };

    it.each([
      ["blanks in a heading", `1 - x${" ".repeat(100_000)}y`],
      ["blanks before the dash of a heading", `1${" ".repeat(100_000)}x`],
      ["digits in the number of a heading", `1${"0".repeat(100_000)}`],
      ["dots and digits in the number of a heading", `1${".1".repeat(50_000)} - x`],
      ["marks in front of a heading", `${"#".repeat(100_000)} 1 - x`],
      ["dashes in a heading", `1 ${"-".repeat(100_000)}`],
      ["blanks in a tier line", `Tier${" ".repeat(100_000)}x`],
      ["blanks and tabs in a line", `${" \t".repeat(50_000)}x`],
    ])("takes no time for a line of 100 KB made of %s", async (_name, line) => {
      await within(`${line}\n${contentOf({ supplier: "Zorbex Analytics Ltd" })}\n${line}\n`);
    });

    it.each([
      ["blanks", `Zorbex${" ".repeat(900)}x`],
      ["slashes", `Zorbex ${"/ ".repeat(450)}`],
      ["ampersands", `Zorbex ${"& ".repeat(450)}`],
      ["the word and", `Zorbex ${" and ".repeat(200)}`],
      ["commas", `Zorbex${",".repeat(900)}`],
      ["brackets", `Zorbex ${"(".repeat(450)}${")".repeat(450)}`],
      ["stops and dashes", `${". -".repeat(300)}Zorbex`],
    ])("takes no time for a cell of the supplier made of %s", async (_name, cell) => {
      await within(contentOf({ supplier: cell }));
    });

    it("takes no time for a thousand results that each have a supplier", async () => {
      const results = Array.from({ length: 1_000 }, (_, at) =>
        resultFor(at + 1, `Tessaly Works ${String(at).padStart(4, "0")} Ltd; Quillon Data`),
      );
      const started = Date.now();
      const { records } = await runOf(results);
      expect(Date.now() - started).toBeLessThan(10_000);
      expect(records).toHaveLength(1_001);
    });
  });

  describe("results that do not read", () => {
    const goodResults = (count: number): Row[] =>
      Array.from({ length: count }, (_, at) =>
        resultFor(at + 1, `Tessaly Works ${String(at).padStart(4, "0")} Ltd`),
      );

    it.each([
      ["a text that is no string", { indexable_content: 42 }],
      ["a text that is missing", { indexable_content: undefined }],
      ["a text that is null", { indexable_content: null }],
      ["a link outside the directory of the records", { link: "/government/example-tool-1" }],
      [
        "a link that is longer than two hundred characters",
        { link: `/algorithmic-transparency-records/${"a".repeat(170)}` },
      ],
    ])("counts a result with %s as unreadable, and gives it no record", async (_name, over) => {
      const bad = { ...resultFor(500, "Zorbex Analytics Ltd"), ...over };
      const { parsed, snapshot, records } = await runOf([...goodResults(5), bad]);
      expect(idsOf(records)).toHaveLength(5);
      expect(bodyOf(snapshot).unreadable).toBe(1);
      expect(parsed.skipped).toBe(1);
      expect(parsed.errors).toBe(0);
    });

    it("counts a link that is outside the directory of the records only when the result names a supplier", async () => {
      const result = resultFor(500, null, { link: "/government/example-tool-1" });
      const { snapshot } = await runOf([...goodResults(5), result]);
      expect(bodyOf(snapshot).unreadable).toBe(0);
    });

    it("takes a link of exactly two hundred characters", async () => {
      const link = `/algorithmic-transparency-records/${"a".repeat(200 - "/algorithmic-transparency-records/".length)}`;
      expect(link).toHaveLength(200);
      const { records } = await runOf([resultFor(1, "Zorbex Analytics Ltd", { link })]);
      expect(records[0].url).toBe(`${SITE}${link}`);
    });

    it("gives no record for a result without a title, and writes that it has none", async () => {
      const result = resultFor(1, "Zorbex Analytics Ltd");
      delete result.title;
      const { records } = await runOf([result]);
      expect(records[0].summary).toContain("“no title”");
    });

    it("tolerates ten of them in a list of a hundred and fails the sync at eleven", async () => {
      const badOnes = (count: number): Row[] =>
        Array.from({ length: count }, (_, at) => ({
          ...resultFor(900 + at, "Zorbex Analytics Ltd"),
          indexable_content: 7,
        }));
      const tolerated = await runOf([...goodResults(100), ...badOnes(10)]);
      expect(tolerated.parsed.skipped).toBe(10);
      expect(tolerated.parsed.errors).toBe(0);
      const refused = await runOf([...goodResults(100), ...badOnes(11)]);
      expect(refused.parsed.skipped).toBe(0);
      expect(refused.parsed.errors).toBe(11);
    });

    it("does not count the records that give no supplier toward the limit", async () => {
      const results = [
        ...goodResults(20),
        ...Array.from({ length: 40 }, (_, at) => resultFor(700 + at, null)),
      ];
      const { parsed } = await runOf(results);
      expect(parsed.skipped).toBe(0);
      expect(parsed.errors).toBe(0);
      expect(parsed.records).toHaveLength(20);
    });

    it.each([
      ["a blank", "/algorithmic-transparency-records/a b"],
      ["a query", "/algorithmic-transparency-records/a?b=1"],
      ["a fragment", "/algorithmic-transparency-records/a#b"],
      ["an angle bracket", "/algorithmic-transparency-records/a<b>"],
      ["a quotation mark", '/algorithmic-transparency-records/a"b'],
      ["a backslash", "/algorithmic-transparency-records/a\\b"],
      ["no page after the directory", "/algorithmic-transparency-records/"],
      ["an empty step", "/algorithmic-transparency-records//a"],
      ["a slash at its end", "/algorithmic-transparency-records/a/"],
      ["no slash after the directory", "/algorithmic-transparency-records"],
      ["another directory that begins alike", "/algorithmic-transparency-records-old/a"],
      ["a host of its own", "//evil.example/algorithmic-transparency-records/a"],
      ["a directory in capitals", "/Algorithmic-Transparency-Records/a"],
    ])(
      "counts a result whose address holds %s as unreadable, and gives no record for it",
      async (_name, link) => {
        const bad = resultFor(900, "Zorbex Analytics Ltd", { link });
        const { parsed, snapshot } = await runOf([...goodResults(30), bad]);
        expect(bodyOf(snapshot).unreadable).toBe(1);
        expect(parsed.skipped).toBe(1);
        expect(parsed.errors).toBe(0);
        expect(parsed.records).toHaveLength(30);
        expect(textOfRun({ snapshot, parsed, records: parsed.records })).not.toContain("Zorbex");
      },
    );

    it("does not fail when one result names more suppliers than the list has results: the total is at least its entities and unreadable results", async () => {
      const many = resultFor(
        1,
        "Zorbex Analytics Ltd; Quillon Data; Mavro Systems; Plynth Labs; Brannock Cloud",
      );
      const alone = await runOf([many]);
      expect(alone.records).toHaveLength(5);
      expect(bodyOf(alone.snapshot).total).toBe(5);
      expect(alone.parsed.errors).toBe(0);

      // One result more, that does not read: five entities and one unreadable result are six.
      const withBad = await runOf([many, resultOf({ n: 2, content: 7 })]);
      expect(withBad.records).toHaveLength(5);
      expect(bodyOf(withBad.snapshot).unreadable).toBe(1);
      expect(bodyOf(withBad.snapshot).total).toBe(6);
      expect(withBad.parsed.errors).toBe(0);
      expect(withBad.parsed.root).toBe("search.json");
    });

    it("reads 5,000 suppliers, and fails as not the list for 5,001: no list of this kind is so long", async () => {
      const names = (from: number, count: number): string =>
        Array.from({ length: count }, (_, at) => `Qvx ${String(from + at).padStart(5, "0")}`).join(
          "; ",
        );
      const listOf = (last: number): Row[] => {
        const results = Array.from({ length: 62 }, (_, at) =>
          resultFor(at + 1, names(at * 80, 80)),
        );
        results.push(resultFor(63, names(62 * 80, last)));
        return results;
      };
      const exact = await runOf(listOf(40));
      expect(exact.records).toHaveLength(5_000);
      expect(exact.parsed.errors).toBe(0);
      expect(await failureOf(downloadOf(listOf(41)))).toBeInstanceOf(NotTheListError);
    });

    it("gives no row for a name that the fold makes longer than a name may be", async () => {
      // Each of these is four characters once folded (NFKC), so 29 of them and a letter are 117, and 30 are 121.
      const wide = (count: number): string => `Z${cp(0x337f).repeat(count)}`;
      expect(await suppliersOf(wide(29))).toHaveLength(1);
      expect(await suppliersOf(wide(30))).toEqual([]);
    });

    it("keeps a name of 120 units once folded as it is, and gives no row for one of 121", async () => {
      const name = (letters: number): string => `${"Z".repeat(letters)}${WIDE.repeat(29)}`;
      expect(name(4).normalize("NFKC")).toHaveLength(120);
      expect(await suppliersOf(name(4))).toEqual([name(4).normalize("NFKC")]);
      expect(name(5).normalize("NFKC")).toHaveLength(121);
      expect(await suppliersOf(name(5))).toEqual([]);
    });

    it("gives no row for a name that the fold makes too long, wherever a blank falls in it: a cut name is never taken for a whole one", async () => {
      // The blank falls at each place from 81 to 124 once folded. A cut of the line at 109 units
      // loses a blank before it, so a blank at the 109th unit gives a cut line of 120 units with its
      // marker: that line must not pass for a name that fits.
      const kept: string[] = [];
      for (let letters = 1; letters <= 4; letters += 1) {
        for (let before = 20; before <= 30; before += 1) {
          const name = `${"Z".repeat(letters)}${WIDE.repeat(before)} ${WIDE.repeat(10)}`;
          const found = await suppliersOf(name);
          if (found.length > 0) kept.push(`${letters} + ${before} wide: ${found.join(" | ")}`);
        }
      }
      expect(kept).toEqual([]);
      // The same shape is read where it fits: 4 + 104 + 1 + 8 = 117 units.
      const fits = `ZZZZ${WIDE.repeat(26)} ${WIDE.repeat(2)}`;
      expect(await suppliersOf(fits)).toEqual([fits.normalize("NFKC")]);
    });

    it("gives no row for a name that the fold makes too long, wherever a pair of surrogates falls in it", async () => {
      // A letter of two units falls at each place from 81 to 124. A cut at 109 units never splits a
      // pair, so a pair at the 109th unit gives a cut line of 120 units with its marker.
      const kept: string[] = [];
      for (let letters = 1; letters <= 4; letters += 1) {
        for (let before = 20; before <= 30; before += 1) {
          const name = `${"Z".repeat(letters)}${WIDE.repeat(before)}${ASTRAL}${WIDE.repeat(10)}`;
          const found = await suppliersOf(name);
          if (found.length > 0) kept.push(`${letters} + ${before} wide: ${found.join(" | ")}`);
        }
      }
      expect(kept).toEqual([]);
      // The same shape is read where it fits: 4 + 104 + 2 + 8 = 118 units.
      const fits = `ZZZZ${WIDE.repeat(26)}${ASTRAL}${WIDE.repeat(2)}`;
      expect(await suppliersOf(fits)).toEqual([fits.normalize("NFKC")]);
    });

    it("has as its total the results that it read, when they are more than its entities", async () => {
      const { snapshot } = await runOf([
        ...goodResults(3),
        resultFor(50, null),
        resultFor(51, null),
      ]);
      expect(bodyOf(snapshot).total).toBe(5);
    });
  });

  describe("the size of the list", () => {
    it("reads a thousand results, the most that one page of the API holds", async () => {
      const results = Array.from({ length: 1_000 }, (_, at) =>
        resultFor(at + 1, `Tessaly Works ${String(at).padStart(4, "0")} Ltd`),
      );
      const { records } = await runOf(results);
      expect(records).toHaveLength(1_000);
    });

    it("fails the download for a search of 1,001 results as not the list, after one request: the list outgrew its connector", async () => {
      const fetch = fakeFetch(searchFile([resultOf()], { total: 1_001 }));
      const failure = await failureOf(connectorOf().download(fetch, {}));
      expect(failure).toBeInstanceOf(NotTheListError);
      expect(fetch.calls).toHaveLength(1);
    });

    it("fails the download for a total that is no count, and for a missing one", async () => {
      for (const total of [-1, 1.5, "155", null]) {
        const failure = await failureOf(
          downloadOf([resultOf()], { body: pageText([resultOf()], total as number) }),
        );
        expect(failure).toBeInstanceOf(NotTheListError);
      }
      const noTotal = JSON.stringify({ results: [resultOf()], start: 0 });
      expect(await failureOf(downloadOf([], { body: noTotal }))).toBeInstanceOf(NotTheListError);
    });

    it("is too large when the answer was cut at its limit, whatever it holds", async () => {
      expect(await failureOf(downloadOf([resultOf()], { truncated: true }))).toBeInstanceOf(
        BodyTooLargeError,
      );
    });

    it("is too large when the answer is longer than the limit of 32 MiB, and the fetch cuts it there", async () => {
      const big = resultOf({
        content: `${contentOf({ supplier: "Zorbex Analytics Ltd" })}${"x".repeat(33 * MIB)}`,
      });
      expect(await failureOf(downloadOf([big]))).toBeInstanceOf(BodyTooLargeError);
    });

    it("never gives a shorter list: a list of a hundred results with one of them missing at the edge is no list", async () => {
      const results = Array.from({ length: 100 }, (_, at) =>
        resultFor(at + 1, `Tessaly Works ${String(at).padStart(4, "0")} Ltd`),
      );
      const failure = await failureOf(downloadOf(results.slice(0, 99), { total: 100 }));
      expect(failure).toBeInstanceOf(NotTheListError);
    });
  });

  describe("an answer that is not the list", () => {
    it("fails as not the list when the total is not the number of the results, either way", async () => {
      const results = [resultFor(1, "Zorbex Analytics Ltd"), resultFor(2, "Quillon Data")];
      expect(await failureOf(downloadOf(results, { total: 3 }))).toBeInstanceOf(NotTheListError);
      expect(await failureOf(downloadOf(results, { total: 1 }))).toBeInstanceOf(NotTheListError);
    });

    it("fails as not the list for a link that comes twice, the total counting both", async () => {
      const twice = [resultFor(1, "Zorbex Analytics Ltd"), resultFor(1, "Quillon Data")];
      expect(await failureOf(downloadOf(twice))).toBeInstanceOf(NotTheListError);
    });

    it("takes a link that comes twice for one result when the total counts it once", async () => {
      const twice = [resultFor(1, "Zorbex Analytics Ltd"), resultFor(1, "Zorbex Analytics Ltd")];
      const { records } = await runOf(twice.slice(0, 1));
      expect(records).toHaveLength(1);
      expect(await failureOf(downloadOf(twice, { total: 1 }))).toBeUndefined();
    });

    it.each<[string, string]>([
      ["not JSON", "<html><body>Unprocessable</body></html>"],
      ["a JSON text that is no object", "[1, 2, 3]"],
      ["null", "null"],
      ["an object without results", JSON.stringify({ total: 1, start: 0 })],
      ["results that are no list", JSON.stringify({ total: 1, start: 0, results: { link: "/x" } })],
      ["a result that is no object", JSON.stringify({ total: 1, start: 0, results: ["text"] })],
      [
        "a result without a link",
        JSON.stringify({ total: 1, start: 0, results: [{ title: "Example" }] }),
      ],
      [
        "a link that is no path",
        JSON.stringify({ total: 1, start: 0, results: [{ link: "https://example.test/x" }] }),
      ],
      ["a page that begins elsewhere", pageText([resultOf()], 1, { start: 1000 })],
      ["an empty file", ""],
    ])("fails as not the list for %s", async (_name, body) => {
      const failure = await failureOf(downloadOf([], { body }));
      expect(failure).toBeInstanceOf(NotTheListError);
    });

    it("fails as not the list for a text that is nested deeper than any list is", async () => {
      const deep = `{"results":[],"total":0,"deep":${"[".repeat(10_000)}${"]".repeat(10_000)}}`;
      expect(await failureOf(downloadOf([], { body: deep }))).toBeInstanceOf(NotTheListError);
    });

    it("reads a page that begins with a byte order mark, and a page with a charset on its type", async () => {
      const text = pageText([resultFor(1, "Zorbex Analytics Ltd")]);
      const withMark = await runOf([resultFor(1, "Zorbex Analytics Ltd")]);
      const snapshot = await downloadOf([], {
        body: Buffer.from(`${cp(0xfeff)}${text}`, "utf8"),
        contentType: "application/json; charset=utf-8",
      });
      expect(idsOf(ukAtrsConnector.parse(snapshot).records)).toEqual(idsOf(withMark.records));
    });

    it("refuses the error page of the API, which answers 422 with HTML, by its type: it is never parsed", async () => {
      const failure = await failureOf(
        downloadOf([], { body: "<html>422</html>", contentType: "text/html; charset=utf-8" }),
      );
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unsupported_type");
    });

    it("keeps no address, no row and no message in a failure", async () => {
      const failures = [
        await failureOf(downloadOf([], { body: "not json ZZ-ROW-TEXT", contentType: JSON_TYPE })),
        await failureOf(downloadOf([resultOf()], { truncated: true })),
        await failureOf(downloadOf([resultOf()], { total: 7 })),
      ];
      for (const failure of failures) {
        const message = (failure as Error).message;
        for (const part of ["gov.uk", "search.json", "https", "ZZ-", "Zorbex", "algorithmic"]) {
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
        const failure = await failureOf(downloadOf([resultOf()], { url }));
        expect(failure).toBeInstanceOf(FetchError);
        expect((failure as FetchError).reason).toBe("not_allowed");
        for (const part of ["example", "secret", "gov.uk", "search", "https"]) {
          expect((failure as FetchError).message).not.toContain(part);
        }
      },
    );

    it("is read from a redirect that stays under the pin", async () => {
      const { records } = await (async () => {
        const snapshot = await downloadOf([resultFor(1, "Zorbex Analytics Ltd")], {
          url: "https://www.gov.uk/api/search.json?moved=1",
        });
        return ukAtrsConnector.parse(snapshot);
      })();
      expect(idsOf(records)).toEqual(["atrs:zorbexanalytics"]);
    });

    it("fails an answer of unchanged from the pin as unreachable: no validator was sent, so none can be current", async () => {
      const unchanged: ConnectorFetch = async (url) => ({ notModified: true, url });
      const failure = await failureOf(
        ukAtrsConnector.download(unchanged, { etag: "k1:", lastModified: null }),
      );
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unreachable");
    });

    it("fails an answer of unchanged from another address as not allowed", async () => {
      const unchanged: ConnectorFetch = async () => ({
        notModified: true,
        url: "https://www.example.org/api/search.json",
      });
      const failure = await failureOf(ukAtrsConnector.download(unchanged, {}));
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
      expect(await failureOf(ukAtrsConnector.download(throttled, {}))).toBe(error);
    });

    it("fails as not the list for any other failure of the fetch, with nothing of it", async () => {
      const broken: ConnectorFetch = async () => {
        throw new TypeError("https://www.gov.uk/api/search.json?token=ZZ-SECRET failed");
      };
      const failure = await failureOf(ukAtrsConnector.download(broken, {}));
      expect(failure).toBeInstanceOf(NotTheListError);
      expect((failure as Error).message).not.toContain("ZZ-SECRET");
    });
  });

  describe("the contract of the kit", () => {
    it("makes records that hold what the columns and the prompt need", async () => {
      const results = [
        resultFor(1, "Zorbex Analytics Ltd", { number: "12345678" }),
        resultFor(2, "Quillon Data; Mavro Systems", { phase: "retired" }),
        resultFor(3, "Plynth Labs"),
      ];
      const { records } = await runOf(results);
      expect(records).toHaveLength(4);
      expectWellFormedRecords(records, { sourceId: "uk_atrs", mark: MARK });
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
        const parsed = ukAtrsConnector.parse(snapshot(bodies));
        expect(parsed.root).toBeNull();
        expect(parsed.records).toEqual([]);
        expect(parsed.errors).toBeGreaterThan(0);
      }
    });

    it("is a list whose snapshot, parsed, gives the root of the document that the sync expects", async () => {
      const { parsed } = await runOf([resultOf()]);
      expect(parsed.root).toBe("search.json");
    });
  });

  describe("the worst case", () => {
    /** The most that a record can hold: six phases, the longest titles, authorities and names, three numbers. */
    async function worstCase(): Promise<ParsedRecord> {
      const name = `Zorbex ${"A".repeat(73)}`;
      const phases = [
        "production",
        "beta-pilot",
        "private-beta",
        "public-beta",
        "pre-deployment",
        "retired",
        "production",
        "production",
      ];
      const results = phases.map((phase, at) =>
        resultFor(at + 1, name, {
          phase,
          published: `2026-0${(at % 8) + 1}-1${at % 9}`,
          title: `${"Example tool with a very long title ".repeat(4)}${at}`,
          authority: `${"a".repeat(30)}-${"b".repeat(40)}`,
          number: String(11111111 * ((at % 3) + 1)),
        }),
      );
      const { records, parsed } = await runOf(results);
      expect(parsed.errors).toBe(0);
      expect(records).toHaveLength(1);
      return records[0];
    }

    it("is under the limit of a summary, keeps its second sentence and its closing sentence", async () => {
      const record = await worstCase();
      expect(record.summary.length).toBeLessThanOrEqual(RECORD_SUMMARY_MAX);
      expect(record.summary.length).toBeGreaterThan(1_000);
      expect(record.summary.startsWith(`${FIRST_SENTENCE} ${SECOND_SENTENCE} `)).toBe(true);
      expect(record.summary.endsWith(CLOSING)).toBe(true);
      expect(record.title.length).toBeLessThanOrEqual(200);
      expect(record.summary).toContain(
        "Companies House number given: 11111111, 22222222, 33333333.",
      );
    });

    it("cuts the titles that it shows at eighty characters, with the mark of a cut, and the authority at fifty", async () => {
      const record = await worstCase();
      const items = (/Newest: (.*?)\. Companies House/.exec(record.summary)?.[1] ?? "").split("; ");
      expect(items).toHaveLength(3);
      for (const item of items) {
        const title = /^“(.*?)” by /.exec(item)?.[1] ?? "";
        expect(title.length).toBe(80);
        expect(title.endsWith(" [shortened]")).toBe(true);
        const authority = /” by ([^,]*), /.exec(item)?.[1] ?? "";
        expect(authority.length).toBe(50);
        expect(authority.endsWith(" [shortened]")).toBe(true);
      }
    });
  });
});
