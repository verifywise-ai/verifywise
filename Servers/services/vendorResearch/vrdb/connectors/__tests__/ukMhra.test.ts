/**
 * The UK MHRA field safety notice lists as a mirrored list of the vendor risk database
 * (connectors/ukMhra.ts): the GOV.UK Search API gives the weekly lists of the Medicines and
 * Healthcare products Regulatory Agency, each with its page text (`indexable_content`), and the
 * entries of a list (a heading `Manufacturer: product`, a date, a model line, a description and an
 * `MHRA reference:` line) become one record for each manufacturer. The answers are synthetic: they
 * copy the shape of the API's (an envelope with `results`, `total`, `start`; a result with `title`,
 * `link`, `issued_date`, `public_timestamp`, `indexable_content` and the envelope fields of the
 * index) with every manufacturer, product, reference, link and day invented. A line or a field that
 * the connector must leave out holds a token that starts with `ZZ-`, so that a copy of it anywhere
 * in a snapshot or a record is found. Every character that is hard to type is built with `cp`.
 * Nothing here uses the network: `fakeFetch` and hand-written fetches answer, and the pause between
 * two pages is a mock.
 */
import { FetchError } from "../../../../webResearch/guardedFetch";
import { SHORTENED, lineOf } from "../kit/clean";
import type { Sleep } from "../kit/pause";
import {
  BodyTooLargeError,
  type ConnectorFetch,
  NotTheListError,
  type ParseResult,
  type Snapshot,
} from "../types";
import {
  UK_MHRA_RECORD_MARK,
  createUkMhraConnector,
  mhraEntriesOf,
  mhraListDateOf,
  mhraReferenceOf,
  ukMhraConnector,
} from "../ukMhra";
import {
  type FakeFile,
  expectDeterministic,
  expectWellFormedRecords,
  fakeFetch,
} from "./helpers/kitContract";

/** The connector paces its pages, so a test that runs it may be slow on a starved runner. */
jest.setTimeout(30_000);

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

const MARK = UK_MHRA_RECORD_MARK;
const JSON_TYPE = "application/json";
const MIB = 1024 * 1024;
const NBSP = cp(0xa0);

/**
 * The wall-clock limit of the tests that guard against a blow-up of the time (an exponential or a
 * quadratic pattern): at least ten times the time that the work takes (milliseconds) and never
 * below 10 s, so that a starved runner cannot fail them and only a real blow-up can.
 */
const BLOW_UP_MS = 10_000;

/**
 * What breaks a test of the length that cuts first (`lineOf(text, max + 1)` and a compare with
 * `max`). A cut line is the units that are kept and the marker, which has 12; a cut to `max + 1`
 * keeps `max - 11` units, but a blank at the cut is trimmed and the first half of a pair of
 * surrogates is dropped, so the cut line has `max` units, and the compare takes it for a whole line
 * that ends in the marker. A text that is longer than `max` and has one of these as its unit
 * `max - 12` is such a text. The limit of the length (`lineWithin`) refuses it, as it refuses every
 * text that does not fit.
 */
const AT_THE_CUT = [" ", cp(0x20000)];

/** The request, page by page: the pager asks exactly this and never another. */
const SEARCH_START =
  "https://www.gov.uk/api/search.json?filter_format=medical_safety_alert&filter_alert_type=field-safety-notices&count=1000&start=";
const SEARCH_END =
  "&order=-public_timestamp&fields[]=title&fields[]=link&fields[]=issued_date&fields[]=public_timestamp&fields[]=indexable_content";
const urlOf = (start: number): string => `${SEARCH_START}${start}${SEARCH_END}`;

/** The lines and fields that no record or snapshot may show: each holds a `ZZ-` token. */
const LEFT_OUT = {
  overview: "ZZ-OVERVIEW-TEXT",
  model: "ZZ-MODEL-LINE",
  batch: "ZZ-BATCH-LINE",
  description: "ZZ-DESCRIPTION-LINE",
  field: "ZZ-FIELD-OF-THE-LIST",
};

const S1 = `${MARK} (gov.uk), a product safety list.`;
const S2 =
  "The MHRA's weekly lists name the manufacturers that sent field safety notices about their medical devices; a notice is the manufacturer's own corrective action, not a finding of fault, and counts grow with the number of devices a maker sells.";
const CLOSING =
  "Adapted by VerifyWise from GOV.UK under the Open Government Licence v3.0; the notices themselves are not copied.";

/** A weekly list of the search, before it is written as a result of the API. */
interface ListDoc {
  title: string;
  link: string;
  /** The `issued_date`. */
  issued: string;
  /** The blocks of the text of the list: they are joined by blank lines. */
  blocks: string[];
  /** The text itself, in place of the blocks. */
  text?: string;
  /** Fields of the result that the API does not send, or sends in other shapes. */
  extra?: Record<string, unknown>;
}

type Result = Record<string, unknown>;

/** The result as the API writes it: the fields that were asked for and the envelope of the index. */
function resultOf(doc: ListDoc): Result {
  return {
    title: doc.title,
    link: doc.link,
    issued_date: doc.issued,
    public_timestamp: `${doc.issued}T10:00:00Z`,
    indexable_content: doc.text ?? doc.blocks.join("\n\n"),
    description: LEFT_OUT.field,
    medical_specialism: [LEFT_OUT.field],
    alert_type: [LEFT_OUT.field],
    _id: doc.link,
    index: "govuk",
    es_score: null,
    elasticsearch_type: "edition",
    document_type: "edition",
    ...doc.extra,
  };
}

/** The text of one answer of the API: the envelope of a page. */
const pageText = (results: readonly unknown[], total: number, start: number | undefined): string =>
  JSON.stringify({
    results,
    total,
    ...(start === undefined ? {} : { start }),
    aggregates: {},
    suggested_queries: [],
    es_cluster: "A",
  });

/** The files `fakeFetch` serves for a search of these results: one for each page of 1,000. */
function filesOfResults(
  results: readonly Result[],
  over: Partial<FakeFile> = {},
): Record<string, FakeFile> {
  const files: Record<string, FakeFile> = {};
  for (let start = 0; start < Math.max(results.length, 1); start += 1000) {
    files[urlOf(start)] = {
      body: pageText(results.slice(start, start + 1000), results.length, start),
      contentType: JSON_TYPE,
      ...over,
    };
  }
  return files;
}

const filesOf = (
  lists: readonly ListDoc[],
  over: Partial<FakeFile> = {},
): Record<string, FakeFile> => filesOfResults(lists.map(resultOf), over);

const slug = (name: string): string => `/drug-device-alerts/${name}`;

/** A reference of the slash form, with a number of its own. */
const refOf = (n: number): string => `2026/010/009/601/${String(n).padStart(3, "0")}`;

/** One entry of a list: the manufacturer and the product of its heading, and the reference as written. */
interface Entry {
  maker: string;
  product: string;
  reference: string;
}

/** The blocks of one entry, as a list text has them: heading, date, model, batch, description, reference. */
const entryBlocks = ({ maker, product, reference }: Entry): string[] => [
  `${maker}: ${product}`,
  "5 August 2026",
  `Model: ${LEFT_OUT.model}`,
  `Batch: ${LEFT_OUT.batch}`,
  `${LEFT_OUT.description} of the notice`,
  `MHRA reference: ${reference}`,
];

/** The paragraphs that open a list text: no colon, so that none is taken for a heading. */
const INTRO = ["Overview", `This list holds the notices of the week. ${LEFT_OUT.overview}`];

const joinBlocks = (blocks: readonly string[]): string => blocks.join("\n\n");

function list(
  title: string,
  link: string,
  issued: string,
  entries: readonly Entry[],
  extra: Partial<ListDoc> = {},
): ListDoc {
  return { title, link, issued, blocks: [...INTRO, ...entries.flatMap(entryBlocks)], ...extra };
}

/** The compact form of a name, as the keys write it: lower case, letters and digits only. */
const compact = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const MAKERS = {
  alderwick: "Alderwick Example Medical",
  birchfield: "Birchfield Example Devices Ltd",
  cobaltgate: "Cobaltgate Example Systems Inc",
  dunmere: "Dunmere Example Healthcare GmbH",
  elmstead: "Elmstead Example Surgical",
  fairholt: "Fairholt Example Diagnostics AG",
};

const LIST_2026 = list(
  "Field Safety Notices: 5 January to 9 January 2026",
  slug("fsn-2026-01"),
  "2026-01-12",
  [
    { maker: MAKERS.alderwick, product: "Example Infusion Pump", reference: refOf(1) },
    { maker: MAKERS.birchfield, product: "Example Monitor", reference: refOf(2) },
  ],
);
const LIST_2025 = list(
  "Field Safety Notices: 9 June to 13 June 2025",
  slug("fsn-2025-06"),
  "2025-06-16",
  [
    { maker: MAKERS.alderwick, product: "Example Infusion Pump Set", reference: refOf(3) },
    { maker: MAKERS.cobaltgate, product: "Example Scanner", reference: refOf(4) },
  ],
);
const LIST_2024 = list(
  "Field safety notices - 11 March to 15 March 2024",
  slug("fsn-2024-03"),
  "2024-03-18",
  [
    { maker: MAKERS.alderwick, product: "Example Syringe", reference: refOf(5) },
    { maker: MAKERS.dunmere, product: "Example Catheter", reference: refOf(6) },
    { maker: MAKERS.elmstead, product: "Example Stapler", reference: refOf(7) },
    { maker: MAKERS.fairholt, product: "Example Analyser", reference: refOf(8) },
  ],
);
/** Three weekly lists, six manufacturers, eight notices: Alderwick has three of them. */
const GOOD: ListDoc[] = [LIST_2026, LIST_2025, LIST_2024];

const ALDERWICK_ID = "mhra-fsn:alderwickexamplemedical";

/** A pause that does not wait and keeps its calls. */
const sleeping = () => jest.fn<ReturnType<Sleep>, Parameters<Sleep>>(async () => undefined);

const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

/** The shape of the body of a snapshot, as the factory writes it. */
interface Body {
  v: number;
  rows: Array<{
    key: string;
    displayName: string;
    spellings: string[];
    count: number;
    firstYear: number | null;
    byYear: Array<[number, number]>;
    items: Array<{ product: string; reference: string; listed: string | null; link: string }>;
    newest: string | null;
  }>;
  total: number;
  unreadable: number;
}

const bodyOf = (snapshot: Snapshot): Body => JSON.parse(snapshot.bodies[0]) as Body;

async function downloadOf(
  files: Record<string, FakeFile>,
  connector = ukMhraConnector,
): Promise<Snapshot> {
  const result = await connector.download(fakeFetch(files), {});
  if (result === "unchanged") throw new Error("The fake fetch answered 304 to a first request.");
  return result;
}

async function runOf(lists: readonly ListDoc[], over: Partial<FakeFile> = {}) {
  const snapshot = await downloadOf(filesOf(lists, over));
  return { snapshot, parsed: ukMhraConnector.parse(snapshot) };
}

const idsOf = (parsed: ParseResult): string[] =>
  parsed.records.map((record) => record.sourceRecordId);

function recordOfId(parsed: ParseResult, id: string) {
  const record = parsed.records.find((candidate) => candidate.sourceRecordId === id);
  if (record === undefined) throw new Error(`The parse has no record ${id}.`);
  return record;
}

function rowOfKey(snapshot: Snapshot, key: string): Body["rows"][number] {
  const row = bodyOf(snapshot).rows.find((candidate) => candidate.key === key);
  if (row === undefined) throw new Error(`The body has no row ${key}.`);
  return row;
}

/** A list of one manufacturer's entries (one weekly list), for the tests that look at one record. */
const oneList = (
  entries: readonly Entry[],
  over: Partial<ListDoc> = {},
  issued = "2026-02-02",
): ListDoc =>
  list(
    "Field Safety Notices: 26 January to 30 January 2026",
    slug("example-one"),
    issued,
    entries,
    over,
  );

/** Entries of fourteen manufacturers, so that a list of them has more rows than a few. */
const MANY: Entry[] = Array.from({ length: 14 }, (_, at) => ({
  maker: `Manyfold${String.fromCharCode(97 + at)} Example Devices`,
  product: "Example Product",
  reference: refOf(500 + at),
}));

describe("mhraReferenceOf, the normalised reference of an entry", () => {
  it.each<[string, string, string]>([
    ["a slash form alone", "2026/010/009/601/195", "2026/010/009/601/195"],
    [
      "a number and a slash form with a plain space",
      "41295467 2026/010/009/601/195",
      "2026/010/009/601/195",
    ],
    [
      "a number and a slash form with a no-break space",
      `41295467${NBSP}2026/010/009/601/195`,
      "2026/010/009/601/195",
    ],
    [
      "a number and a slash form with a tab and two blanks",
      "41295467\t  2026/010/009/601/195",
      "2026/010/009/601/195",
    ],
    ["an 8-digit number alone", "41295467", "41295467"],
    ["a 7-digit number alone", "4129546", "4129546"],
    [
      "a slash form followed by words",
      "2026/010/009/601/195 Customer reply form",
      "2026/010/009/601/195",
    ],
    ["a number followed by words", "41295467 Customer reply form", "41295467"],
    ["a number inside words", "see 41295467 for details", "41295467"],
    ["a number of 7 digits inside words", "see 4129546 for details", "4129546"],
    [
      "a slash form with digits before its first group: the form is the first match, whatever stands before it",
      "12026/010/009/601/195",
      "2026/010/009/601/195",
    ],
    [
      "the slash form and not the number when both are there",
      "41295467 and 2026/010/009/601/195",
      "2026/010/009/601/195",
    ],
    ["the first of two numbers", "41295467 and 51295467", "41295467"],
    [
      "the first of two slash forms",
      "2026/010/009/601/195 2026/010/009/601/196",
      "2026/010/009/601/195",
    ],
  ])("is read from %s", (_what, tail, reference) => {
    expect(mhraReferenceOf(tail)).toBe(reference);
  });

  it.each<[string, string, string]>([
    ["words alone, without blanks and in lower case", "Customer Reply Form", "customerreplyform"],
    ["a number of 9 digits, which is none of 7 or 8", "123456789", "123456789"],
    ["a number of 6 digits", "123456", "123456"],
    [
      "a number of 6 digits inside words, which is none of 7 or 8",
      "see 123456 for details",
      "see123456fordetails",
    ],
    [
      "a number of 9 digits inside words, which is none of 7 or 8",
      "see 123456789 for details",
      "see123456789fordetails",
    ],
    [
      "a slash form with groups of other lengths",
      "see 2026/10/9/601/195 for details",
      "see2026/10/9/601/195fordetails",
    ],
    ["a run of digits longer than 8", "1234567890123", "1234567890123"],
    ["a slash form that is not whole", "2026/010/009", "2026/010/009"],
    ["a text of more than 40 characters, whole", "A".repeat(60), "a".repeat(60)],
    ["a text of 300 characters, the longest line", `${"x".repeat(299)}y`, `${"x".repeat(299)}y`],
    [
      "a text of blanks and capitals, as one compact line",
      "Customer  Reply Form Number 17 Of The Week 2026",
      "customerreplyformnumber17oftheweek2026",
    ],
    [
      "a text with hidden characters, which are taken out",
      `ab${cp(0x200b)}c${cp(0xfeff)}d`,
      "abcd",
    ],
    ["a text with control characters, which are taken out", `ab${cp(0x07)}c${cp(0)}d`, "abcd"],
    ["a text with full-width letters, folded", `${cp(0xff21, 0xff22)}cd`, "abcd"],
  ])("is the text of %s", (_what, tail, reference) => {
    expect(mhraReferenceOf(tail)).toBe(reference);
  });

  it("is none for a tail that holds nothing, or is longer than any reference line", () => {
    for (const tail of ["", "   ", "\n", `${NBSP}`, cp(0x200b)])
      expect(mhraReferenceOf(tail)).toBeNull();
    const slash = "2026/010/009/601/195";
    const whole = (length: number): string => `${slash} ${"x".repeat(length - slash.length - 1)}`;
    expect(whole(300)).toHaveLength(300);
    expect(mhraReferenceOf(whole(300))).toBe(slash);
    expect(mhraReferenceOf(whole(301))).toBeNull();
    expect(mhraReferenceOf(`${"x".repeat(100_000)} ${slash}`)).toBeNull();
  });

  it("is none for a tail that ends in the mark of a cut: it was cut by another layer, and is no whole line", () => {
    for (const tail of [
      "2026/010/009/601/195 [shortened]",
      "2026/010/009/601/195[shortened]",
      "[shortened]",
    ]) {
      expect(mhraReferenceOf(tail)).toBeNull();
    }
    // The mark in the middle of a line is text like any other.
    expect(mhraReferenceOf("2026/010/009/601/195 [shortened] x")).toBe("2026/010/009/601/195");
  });

  it("is none for a tail longer than 300 units that a cut would leave at 300 (a blank or a pair of surrogates at the cut)", () => {
    const slash = "2026/010/009/601/195";
    // 288 units, so that unit 288 is the one that a cut to 301 units takes off.
    const filled = `${slash} ${"x".repeat(267)}`;
    expect(filled).toHaveLength(288);
    for (const cutter of AT_THE_CUT) {
      const tail = `${filled}${cutter}${"y".repeat(50)}`;
      // The shape is the one that passes for a line of 300 units that ends in the mark of a cut.
      expect(lineOf(tail, 301)).toHaveLength(300);
      expect(lineOf(tail, 301).endsWith(SHORTENED)).toBe(true);
      expect(mhraReferenceOf(tail)).toBeNull();
    }
  });

  it("is found without a blow-up of the time in a tail that is made to be slow", () => {
    const start = Date.now();
    for (const tail of [
      "1".repeat(300),
      "1/".repeat(150),
      "2026/010/".repeat(33),
      " ".repeat(299) + "x",
    ]) {
      mhraReferenceOf(tail);
    }
    expect(Date.now() - start).toBeLessThan(BLOW_UP_MS);
  });
});

describe("mhraListDateOf, the day of a weekly list", () => {
  it.each<[string, string, string, string | null]>([
    ["a title without a year", "Field Safety Notices: weekly list", "2024-05-06", "2024-05-06"],
    [
      "the year of the title",
      "Field Safety Notices: 7 August to 11 August 2023",
      "2023-08-14",
      "2023-08-14",
    ],
    [
      "one of the years of the title",
      "Field Safety Notices: 29 December 2025 to 2 January 2026",
      "2026-01-05",
      "2026-01-05",
    ],
    [
      "the first of two years of the title",
      "Field Safety Notices: 29 December 2025 to 2 January 2026",
      "2025-12-29",
      "2025-12-29",
    ],
    [
      "a year more than the year of the title: a December week issued in January",
      "Field Safety Notices: 25 December to 29 December 2023",
      "2024-01-02",
      "2024-01-02",
    ],
    [
      "a year that is not in the title and not one more",
      "Field Safety Notices: 7 August to 11 August 2023",
      "2012-08-14",
      null,
    ],
    [
      "a year two more than the title",
      "Field Safety Notices: 7 August to 11 August 2023",
      "2025-01-02",
      null,
    ],
    [
      "a year before the title",
      "Field Safety Notices: 7 August to 11 August 2023",
      "2022-12-30",
      null,
    ],
    [
      "one more than the last of two years of the title",
      "Field Safety Notices: 29 December 2025 to 2 January 2026",
      "2027-01-05",
      "2027-01-05",
    ],
    [
      "a number of four digits that is no year of the 2000s",
      "Field Safety Notices: weekly list 1234",
      "2024-05-06",
      "2024-05-06",
    ],
    [
      "a title whose year is not of the 2000s",
      "Field Safety Notices: 7 August to 11 August 1999",
      "1999-08-14",
      "1999-08-14",
    ],
    [
      "a year that has no boundary in the title",
      "Field Safety Notices: 7 August to 11 August 12023",
      "2012-08-14",
      "2012-08-14",
    ],
    [
      "a year that is a part of a longer number in the title",
      "Field Safety Notices: 20230 and 22023",
      "2012-08-14",
      "2012-08-14",
    ],
    [
      "an ordinal day in the title",
      "Field Safety Notices (FSNs) from 1st to 5th August 2025",
      "2025-08-06",
      "2025-08-06",
    ],
    [
      "a day of the issued date that does not exist",
      "Field Safety Notices: 7 August 2023",
      "2023-02-30",
      null,
    ],
    [
      "a month of the issued date that does not exist",
      "Field Safety Notices: 7 August 2023",
      "2023-13-01",
      null,
    ],
    [
      "an issued date in another writing",
      "Field Safety Notices: 7 August 2023",
      "14/08/2023",
      null,
    ],
    [
      "an issued date with a time",
      "Field Safety Notices: 7 August 2023",
      "2023-08-14T10:00:00Z",
      null,
    ],
    ["an empty issued date", "Field Safety Notices: 7 August 2023", "", null],
    [
      "blanks around the issued date, which a cell may have",
      "Field Safety Notices: 7 August 2023",
      " 2023-08-14 ",
      "2023-08-14",
    ],
  ])("is the issued date for %s", (_what, title, issued, expected) => {
    expect(mhraListDateOf(issued, title)).toBe(expected);
  });

  it("is none for an issued date or a title that is no text", () => {
    for (const issued of [undefined, null, 20230814, {}, ["2023-08-14"]]) {
      expect(mhraListDateOf(issued, "Field Safety Notices: 7 August 2023")).toBeNull();
    }
    for (const title of [undefined, null, 2023, {}, ["2023"]]) {
      expect(mhraListDateOf("2023-08-14", title)).toBeNull();
    }
  });

  it("reads the years of a title in its first 288 characters, the room that 300 leave for the mark of a cut", () => {
    // A year of four characters that ends at `end`, in a title that is longer than the limit.
    const titleWithYearEndingAt = (end: number): string =>
      `${"x".repeat(end - 5)} 2023 ${"y".repeat(50)}`;
    expect(titleWithYearEndingAt(288).indexOf("2023") + 4).toBe(288);
    expect(mhraListDateOf("2012-08-14", titleWithYearEndingAt(288))).toBeNull();
    expect(mhraListDateOf("2012-08-14", titleWithYearEndingAt(289))).toBe("2012-08-14");
    expect(mhraListDateOf("2012-08-14", `Field Safety Notices 2023 ${"y".repeat(500)}`)).toBeNull();
    expect(mhraListDateOf("2012-08-14", `Field Safety Notices ${"y ".repeat(500)}2023`)).toBe(
      "2012-08-14",
    );
  });

  it("reads the years of a title only to a limit, without a blow-up of the time", () => {
    const start = Date.now();
    const title = `Field Safety Notices ${"2023 ".repeat(40_000)}`;
    expect(mhraListDateOf("2023-08-14", title)).toBe("2023-08-14");
    expect(Date.now() - start).toBeLessThan(BLOW_UP_MS);
  });
});

describe("mhraEntriesOf, the entries of a weekly list text", () => {
  const entry = (maker: string, product: string, reference: string): Entry => ({
    maker,
    product,
    reference,
  });
  const textOfEntries = (entries: readonly Entry[]): string =>
    joinBlocks([...INTRO, ...entries.flatMap(entryBlocks)]);

  it("gives an entry for each reference line that has a heading before it: an overview, three entries, a date, a model line", () => {
    const text = textOfEntries([
      entry("Examplemed", "Example Infusion Pump", "2026/010/009/601/195"),
      entry("Examplemed", "Example Infusion Pump", "2026/010/009/601/196"),
      entry("Examplemed", "Example Infusion Pump", "2026/010/009/601/197"),
    ]);
    expect(mhraEntriesOf(text)).toEqual([
      {
        manufacturer: "Examplemed",
        product: "Example Infusion Pump",
        reference: "2026/010/009/601/195",
      },
      {
        manufacturer: "Examplemed",
        product: "Example Infusion Pump",
        reference: "2026/010/009/601/196",
      },
      {
        manufacturer: "Examplemed",
        product: "Example Infusion Pump",
        reference: "2026/010/009/601/197",
      },
    ]);
    expect(JSON.stringify(mhraEntriesOf(text))).not.toContain("ZZ-");
  });

  it("gives nothing for a text with no reference line, or no text at all", () => {
    expect(mhraEntriesOf("")).toEqual([]);
    expect(mhraEntriesOf(joinBlocks(INTRO))).toEqual([]);
    expect(mhraEntriesOf("\n\n  \n\n")).toEqual([]);
  });

  describe("the reference line", () => {
    it("is a block that begins with the words, in any case, with or without a colon", () => {
      for (const anchor of [
        "MHRA reference: 2026/010/009/601/195",
        "mhra reference: 2026/010/009/601/195",
        "MHRA REFERENCE: 2026/010/009/601/195",
        "MHRA reference 2026/010/009/601/195",
        "MHRA reference : 2026/010/009/601/195",
        "MHRA reference:2026/010/009/601/195",
        "MHRA reference:\t2026/010/009/601/195",
        `MHRA reference${NBSP}2026/010/009/601/195`,
        "MHRA reference\t2026/010/009/601/195",
      ]) {
        expect(mhraEntriesOf(joinBlocks(["Examplemed: Example Pump", anchor]))).toEqual([
          {
            manufacturer: "Examplemed",
            product: "Example Pump",
            reference: "2026/010/009/601/195",
          },
        ]);
      }
    });

    it("is not a reference line when the words are inside another line", () => {
      expect(
        mhraEntriesOf(
          joinBlocks([
            "Examplemed: Example Pump",
            "See the MHRA reference: 2026/010/009/601/195 for details",
          ]),
        ),
      ).toEqual([]);
      // A block that begins with the heading is no reference line, whatever its other lines say.
      expect(
        mhraEntriesOf(
          joinBlocks(["Examplemed: Example Pump\nMHRA reference: 2026/010/009/601/195"]),
        ),
      ).toEqual([]);
      expect(mhraEntriesOf(joinBlocks(["Examplemed: Example Pump", "The MHRA reference"]))).toEqual(
        [],
      );
    });

    it("is no reference line when the words begin a longer word or are followed by anything but a colon, a blank or the end of the block", () => {
      // Each of these would give a reference of its own, other than the one of the real line after
      // it, so that a block taken for a reference line shows: it would take the heading and give an entry.
      for (const prose of [
        "MHRA references for this week are listed below",
        "MHRA referenceX: 2222222",
        "MHRA reference2026/010/009/601/194",
        "MHRA reference-2222222",
        "MHRA reference.",
      ]) {
        expect(
          mhraEntriesOf(joinBlocks(["Examplemed: Example Pump", prose, "MHRA reference: 1111111"])),
        ).toEqual([{ manufacturer: "Examplemed", product: "Example Pump", reference: "1111111" }]);
      }
    });

    it("does not count a block that is no reference line among the 1,000 that a list may hold", () => {
      const prose = Array.from({ length: 1_001 }, () => "MHRA references are listed below");
      expect(
        mhraEntriesOf(
          joinBlocks([...prose, "Examplemed: Example Pump", "MHRA reference: 1111111"]),
        ),
      ).toEqual([{ manufacturer: "Examplemed", product: "Example Pump", reference: "1111111" }]);
    });

    it("takes the value from the next block when the line has none, with or without a colon", () => {
      for (const anchor of ["MHRA reference", "MHRA reference:", "MHRA reference :  "]) {
        expect(
          mhraEntriesOf(joinBlocks(["Examplemed: Example Pump", anchor, "2026/010/009/601/195"])),
        ).toEqual([
          {
            manufacturer: "Examplemed",
            product: "Example Pump",
            reference: "2026/010/009/601/195",
          },
        ]);
      }
    });

    it("gives no entry when the line has no value and no block follows", () => {
      expect(mhraEntriesOf(joinBlocks(["Examplemed: Example Pump", "MHRA reference:"]))).toEqual(
        [],
      );
    });

    it("takes the next block for the value only when it holds a reference of a known form: a slash form or a number of 7 or 8 digits", () => {
      for (const [next, reference] of [
        ["2026/010/009/601/195", "2026/010/009/601/195"],
        ["41295467", "41295467"],
        ["4129546", "4129546"],
        ["41295467 Customer reply form", "41295467"],
        [`41295467${NBSP}2026/010/009/601/195`, "2026/010/009/601/195"],
      ]) {
        expect(
          mhraEntriesOf(joinBlocks(["Examplemed: Example Pump", "MHRA reference", next])),
        ).toEqual([{ manufacturer: "Examplemed", product: "Example Pump", reference }]);
      }
    });

    it("gives no entry when the line has no value and the next block is no reference: words, a number of another length, a heading, a reference line", () => {
      // The next entry's heading must not be the value of this one, and the real line after it is its own.
      expect(
        mhraEntriesOf(
          joinBlocks([
            "Examplemed Widgets Ltd: Infusion pump",
            "MHRA reference",
            "Betamed Holdings: Syringe driver model 9",
            "MHRA reference: 2026/010/009/601/195",
          ]),
        ),
      ).toEqual([
        {
          manufacturer: "Betamed Holdings",
          product: "Syringe driver model 9",
          reference: "2026/010/009/601/195",
        },
      ]);
      for (const next of [
        "Customer reply form",
        "123456",
        "123456789",
        "2026/010/009",
        // A heading that holds a number is a heading.
        "Betamed Holdings: Syringe driver 41295467",
        // The next reference line is the value of its own entry (it looks like a heading when it has a
        // colon, and like a reference when it has none).
        "MHRA reference: 2222222",
        "MHRA reference 2222222",
        "MHRA reference",
      ]) {
        expect(
          mhraEntriesOf(joinBlocks(["Examplemed: Example Pump", "MHRA reference", next])),
        ).toEqual([]);
      }
    });

    it("keeps the value of the line when it has one, and does not look at the next block", () => {
      expect(
        mhraEntriesOf(
          joinBlocks([
            "Examplemed: Example Pump",
            "MHRA reference: 4129546",
            "2026/010/009/601/195",
          ]),
        ),
      ).toEqual([{ manufacturer: "Examplemed", product: "Example Pump", reference: "4129546" }]);
    });

    it("keeps the whole text of a reference of no known form, up to the longest line: it tells two notices apart", () => {
      const entriesOf = (text: string) =>
        mhraEntriesOf(joinBlocks(["Examplemed: Example Pump", `MHRA reference: ${text}`]));
      for (const text of [
        `${"r".repeat(40)}one`,
        `${"r".repeat(40)}two`,
        `${"x".repeat(299)}y`,
        "Customer Reply Form Number 17 Of The Week 2026 Part A",
      ]) {
        expect(entriesOf(text)).toEqual([
          {
            manufacturer: "Examplemed",
            product: "Example Pump",
            reference: text.replace(/ /g, "").toLowerCase(),
          },
        ]);
      }
    });

    it("gives no entry when the value is longer than any reference line", () => {
      const long = `2026/010/009/601/195 ${"x".repeat(300)}`;
      expect(
        mhraEntriesOf(joinBlocks(["Examplemed: Example Pump", `MHRA reference: ${long}`])),
      ).toEqual([]);
    });

    it("gives no entry for a value that a cut would leave at 300 units (a blank or a pair of surrogates at the cut)", () => {
      // 288 units, so that unit 288 is the one that a cut to 301 units takes off.
      const filled = `2026/010/009/601/195 ${"x".repeat(267)}`;
      expect(filled).toHaveLength(288);
      for (const cutter of AT_THE_CUT) {
        const value = `${filled}${cutter}${"y".repeat(50)}`;
        expect(lineOf(value, 301)).toHaveLength(300);
        expect(
          mhraEntriesOf(joinBlocks(["Examplemed: Example Pump", `MHRA reference: ${value}`])),
        ).toEqual([]);
        // The same value on the next block is no reference either.
        expect(
          mhraEntriesOf(joinBlocks(["Examplemed: Example Pump", "MHRA reference:", value])),
        ).toEqual([]);
      }
    });
  });

  describe("the heading", () => {
    it("is the first block since the previous reference line that has a colon and a blank after it", () => {
      const text = joinBlocks([
        "Overview",
        "Examplemed: First Pump",
        "Another: Second line",
        "MHRA reference: 1111111",
        "Other: Third line",
        "Thirdmed: Fourth Pump",
        "MHRA reference: 2222222",
      ]);
      expect(mhraEntriesOf(text)).toEqual([
        { manufacturer: "Examplemed", product: "First Pump", reference: "1111111" },
        { manufacturer: "Other", product: "Third line", reference: "2222222" },
      ]);
    });

    it.each<string>([
      "Model: X-100",
      "MODEL: X-100",
      "Model number: X-100",
      "Ref: 12345",
      "Description: a pump",
      "Batch: 123",
      "Batch numbers: 123",
      "Serial: 123",
      "Serial numbers: 123",
      "Lot: 123",
      "Lot numbers: 123",
      "Catalogue: 123",
      "Catalogue number: 123",
      "Part: 123",
      "Part number: 123",
      "Product code: 123",
      "Software: 4.2",
      "Software version: 4.2",
    ])("is not a block that begins with the words of a model line: %s", (line) => {
      expect(mhraEntriesOf(joinBlocks([line, "MHRA reference: 1111111"]))).toEqual([]);
      expect(
        mhraEntriesOf(joinBlocks([line, "Examplemed: Example Pump", "MHRA reference: 1111111"])),
      ).toEqual([{ manufacturer: "Examplemed", product: "Example Pump", reference: "1111111" }]);
    });

    it.each<[string, string]>([
      ["Models Example", "Models Example: Pump"],
      ["Modelton Example", "Modelton Example: Pump"],
      ["Partners Example", "Partners Example: Pump"],
      ["Referral Example", "Referral Example: Pump"],
      ["Lotsby Example", "Lotsby Example: Pump"],
      ["Softwarehouse Example", "Softwarehouse Example: Pump"],
    ])("is a block that only begins with the letters of such a word: %s", (maker, heading) => {
      expect(mhraEntriesOf(joinBlocks([heading, "MHRA reference: 1111111"]))).toEqual([
        { manufacturer: maker, product: "Pump", reference: "1111111" },
      ]);
    });

    it("is not a block with nothing before its colon: the search goes on to the next block", () => {
      expect(
        mhraEntriesOf(
          joinBlocks([": Stray text", "Examplemed: Example Pump", "MHRA reference: 1111111"]),
        ),
      ).toEqual([{ manufacturer: "Examplemed", product: "Example Pump", reference: "1111111" }]);
    });

    it("has a colon within its first 80 characters, and a blank and a character after it", () => {
      const eighty = "M".repeat(80);
      expect(mhraEntriesOf(joinBlocks([`${eighty}: Pump`, "MHRA reference: 1111111"]))).toEqual([
        { manufacturer: eighty, product: "Pump", reference: "1111111" },
      ]);
      expect(mhraEntriesOf(joinBlocks([`${eighty}M: Pump`, "MHRA reference: 1111111"]))).toEqual(
        [],
      );
      for (const heading of [":Pump", ": Pump", "Examplemed:Pump", "Examplemed: ", "Examplemed:"]) {
        expect(mhraEntriesOf(joinBlocks([heading, "MHRA reference: 1111111"]))).toEqual([]);
      }
    });

    it("may have its product on the next line of the block", () => {
      expect(
        mhraEntriesOf(joinBlocks(["Examplemed:\nExample Pump", "MHRA reference: 1111111"])),
      ).toEqual([{ manufacturer: "Examplemed", product: "Example Pump", reference: "1111111" }]);
    });

    it("is split at its first colon: the product is what follows, other colons included", () => {
      expect(
        mhraEntriesOf(joinBlocks(["Examplemed: Example Pump: Model 5", "MHRA reference: 1111111"])),
      ).toEqual([
        { manufacturer: "Examplemed", product: "Example Pump: Model 5", reference: "1111111" },
      ]);
    });

    it("is not looked for before the previous reference line: an entry of no heading is no entry", () => {
      // An attached letter that repeats the reference of the entry before it.
      const text = joinBlocks([
        "Examplemed: Example Pump",
        "MHRA reference: 1111111",
        "Letter A",
        "MHRA reference: 1111111",
      ]);
      expect(mhraEntriesOf(text)).toEqual([
        { manufacturer: "Examplemed", product: "Example Pump", reference: "1111111" },
      ]);
      expect(
        mhraEntriesOf(joinBlocks(["MHRA reference: 1111111", "MHRA reference: 2222222"])),
      ).toEqual([]);
    });

    it("is read from a block with line breaks in it: the product is the line that the colon opens, and no other line of the block", () => {
      const block = [
        "Examplemed: Example Pump (EP)",
        "5 August 2026",
        `Model: ${LEFT_OUT.model}`,
        `Batch: ${LEFT_OUT.batch}`,
      ].join("\n");
      const entries = mhraEntriesOf(joinBlocks([block, "MHRA reference: 1111111"]));
      expect(entries).toEqual([
        { manufacturer: "Examplemed", product: "Example Pump (EP)", reference: "1111111" },
      ]);
      expect(JSON.stringify(entries)).not.toContain("ZZ-");
    });

    it("has its product on the next line when the colon ends its line, and on no line after that", () => {
      const block = ["Examplemed:", "", "Example Pump", `Model: ${LEFT_OUT.model}`].join("\n");
      // The blank line ends the block, so that what follows is a block of its own.
      expect(mhraEntriesOf(joinBlocks([block, "MHRA reference: 1111111"]))).toEqual([]);
      const wrapped = ["Examplemed:", "   Example Pump", `Model: ${LEFT_OUT.model}`].join("\n");
      const entries = mhraEntriesOf(joinBlocks([wrapped, "MHRA reference: 1111111"]));
      expect(entries).toEqual([
        { manufacturer: "Examplemed", product: "Example Pump", reference: "1111111" },
      ]);
      expect(JSON.stringify(entries)).not.toContain("ZZ-");
    });

    it("gives no entry when nothing is left of the product", () => {
      for (const product of [cp(0x200b), `${cp(0x200b)} ${cp(0x2800)}`]) {
        expect(
          mhraEntriesOf(joinBlocks([`Examplemed: ${product}`, "MHRA reference: 1111111"])),
        ).toEqual([]);
      }
    });

    it("gives the manufacturer with its legal form as written, and a product that is only a phrase", () => {
      expect(
        mhraEntriesOf(joinBlocks(["Examplemed Inc: Refer to FSN", "MHRA reference: 1111111"])),
      ).toEqual([
        { manufacturer: "Examplemed Inc", product: "Refer to FSN", reference: "1111111" },
      ]);
    });
  });

  describe("the manufacturer", () => {
    const heading = (maker: string): string[] => [
      `${maker}: Example Pump`,
      "MHRA reference: 1111111",
    ];

    it("is one clean line: blanks collapsed, hidden characters out, full-width letters folded", () => {
      expect(
        mhraEntriesOf(
          joinBlocks(
            heading(`Example${NBSP}${NBSP}med   Inc${cp(0x200b)}${cp(0x202e)}${cp(0xff21)}`),
          ),
        ),
      ).toEqual([
        { manufacturer: "Example med IncA", product: "Example Pump", reference: "1111111" },
      ]);
      expect(
        mhraEntriesOf(
          joinBlocks([`Examplemed${cp(0x07)}${cp(0)} Inc: Pump`, "MHRA reference: 1111111"]),
        ),
      ).toEqual([{ manufacturer: "Examplemed Inc", product: "Pump", reference: "1111111" }]);
    });

    it("gives no entry when nothing is left of it, or when it holds markup", () => {
      for (const maker of [
        cp(0x200b),
        `${cp(0x200b)} ${cp(0x2800)}`,
        "<b>Examplemed</b>",
        "Example>med",
        `Example${cp(0xff1c)}med`,
      ]) {
        expect(mhraEntriesOf(joinBlocks(heading(maker)))).toEqual([]);
      }
    });

    it("is read to 120 characters once it is folded: one more gives no entry", () => {
      // Each of these folds to three letters, so 40 of them are 120 and 41 are 123.
      const ligature = cp(0xfb03);
      const folded = (count: number) => mhraEntriesOf(joinBlocks(heading(ligature.repeat(count))));
      expect(folded(40)).toEqual([
        { manufacturer: "ffi".repeat(40), product: "Example Pump", reference: "1111111" },
      ]);
      expect(folded(41)).toEqual([]);
    });

    it("is not read at 121 characters once it is folded, which three-letter and two-letter ligatures make", () => {
      // 39 x "ffi" and 2 x "fi" are 41 characters as written and 121 once folded.
      const maker = `${cp(0xfb03).repeat(39)}${cp(0xfb01).repeat(2)}`;
      expect(maker.normalize("NFKC")).toHaveLength(121);
      expect(mhraEntriesOf(joinBlocks(heading(maker)))).toEqual([]);
      // 39 x "ffi" and 1 x "fi" are 119 once folded: read.
      const shorter = `${cp(0xfb03).repeat(39)}${cp(0xfb01)}`;
      expect(mhraEntriesOf(joinBlocks(heading(shorter)))).toEqual([
        { manufacturer: shorter.normalize("NFKC"), product: "Example Pump", reference: "1111111" },
      ]);
    });

    it("is not read when it ends in the mark of a cut: it was cut by another layer, and is no whole name", () => {
      for (const maker of ["Examplemed [shortened]", "Examplemed[shortened]"]) {
        expect(mhraEntriesOf(joinBlocks(heading(maker)))).toEqual([]);
      }
      // The mark in the middle of a name is text like any other.
      expect(mhraEntriesOf(joinBlocks(heading("Examplemed [shortened] Inc")))).toEqual([
        {
          manufacturer: "Examplemed [shortened] Inc",
          product: "Example Pump",
          reference: "1111111",
        },
      ]);
    });

    it("is not read when it is longer than 120 characters once folded, whatever a cut of it would leave (a blank or a pair of surrogates at the cut)", () => {
      // 36 x "ffi" are 108 letters, so that letter 108 is the one that a cut to 121 units takes off;
      // the heading is 43 characters as written, well inside the 80 that a heading may have.
      const ligature = cp(0xfb03);
      const filled = ligature.repeat(36);
      for (const cutter of AT_THE_CUT) {
        const maker = `${filled}${cutter}${ligature.repeat(5)}`;
        expect(maker.normalize("NFKC").length).toBeGreaterThan(121);
        // The shape is the one that passes for a name of 120 units that ends in the mark of a cut.
        expect(lineOf(maker, 121)).toHaveLength(120);
        expect(lineOf(maker, 121).endsWith(SHORTENED)).toBe(true);
        expect(mhraEntriesOf(joinBlocks(heading(maker)))).toEqual([]);
      }
    });
  });

  describe("the product", () => {
    it("is one clean line of at most 80 characters, cut with the mark of a cut", () => {
      const [entry80] =
        mhraEntriesOf(joinBlocks([`Examplemed: ${"p".repeat(80)}`, "MHRA reference: 1111111"])) ??
        [];
      expect(entry80.product).toBe("p".repeat(80));
      const [cut] =
        mhraEntriesOf(joinBlocks([`Examplemed: ${"p".repeat(81)}`, "MHRA reference: 1111111"])) ??
        [];
      expect(cut.product).toBe(`${"p".repeat(68)} [shortened]`);
      expect(cut.product).toHaveLength(80);
    });

    it("keeps the words of the heading as they are listed: a phrase, markup and doubled blanks too", () => {
      expect(
        mhraEntriesOf(
          joinBlocks([`Examplemed:   Example  <b>Pump</b>${NBSP}Set`, "MHRA reference: 1111111"]),
        ),
      ).toEqual([
        { manufacturer: "Examplemed", product: "Example <b>Pump</b> Set", reference: "1111111" },
      ]);
    });
  });

  describe("the text", () => {
    it("is read with CR LF line breaks, no-break spaces, doubled blanks and an HTML tag as with plain ones", () => {
      const plain = mhraEntriesOf(
        textOfEntries([entry("Examplemed Inc", "Example Pump", "41295467 2026/010/009/601/195")]),
      );
      const crlf = mhraEntriesOf(
        [
          ...INTRO,
          ...entryBlocks(entry("Examplemed Inc", "Example Pump", "41295467 2026/010/009/601/195")),
        ].join("\r\n\r\n"),
      );
      expect(crlf).toEqual(plain);
      expect(plain).toEqual([
        {
          manufacturer: "Examplemed Inc",
          product: "Example Pump",
          reference: "2026/010/009/601/195",
        },
      ]);
      expect(
        mhraEntriesOf(
          joinBlocks([
            ...INTRO,
            `Examplemed${NBSP}Inc:${NBSP}${NBSP}Example   <i>Pump</i>`,
            `MHRA reference:${NBSP}41295467${NBSP}2026/010/009/601/195`,
          ]),
        ),
      ).toEqual([
        {
          manufacturer: "Examplemed Inc",
          product: "Example <i>Pump</i>",
          reference: "2026/010/009/601/195",
        },
      ]);
    });

    it("takes no block for a reference line when a no-break space stands in the words that it begins with", () => {
      // The words are the label that the lists write, with plain blanks: the rule does not guess others.
      expect(
        mhraEntriesOf(
          joinBlocks(["Examplemed: Example Pump", `MHRA${NBSP}reference: 2026/010/009/601/195`]),
        ),
      ).toEqual([]);
    });

    it("separates its blocks at any blank line, whatever the blanks hold", () => {
      const text = [
        "Examplemed: Example Pump",
        " \t ",
        "MHRA reference: 1111111",
        "",
        "",
        "Other: Pump",
        `${NBSP}`,
        "MHRA reference: 2222222",
      ].join("\n");
      expect(mhraEntriesOf(text)).toEqual([
        { manufacturer: "Examplemed", product: "Example Pump", reference: "1111111" },
        { manufacturer: "Other", product: "Pump", reference: "2222222" },
      ]);
      // Without a blank line there is one block, and it does not begin with the words.
      expect(mhraEntriesOf("Examplemed: Example Pump\nMHRA reference: 1111111")).toEqual([]);
    });

    it("takes its blocks without the blanks at their ends: a reference line and a heading may be indented", () => {
      const maker = "m".repeat(78);
      // Four blanks and 78 letters are 82 characters before the colon, as long as the blanks count.
      const text = [`    ${maker}: Example Pump   `, `  \t MHRA reference: 1111111   `].join(
        "\n\n",
      );
      expect(mhraEntriesOf(text)).toEqual([
        { manufacturer: maker, product: "Example Pump", reference: "1111111" },
      ]);
    });

    it("is no weekly list when it is longer than 100,000 characters: nothing of it is read, and what lies before the limit is not passed for the whole", () => {
      const filler = (length: number): string => "x".repeat(length);
      const first = entryBlocks(entry("Firstmed", "First Pump", "1111111")).join("\n\n");
      const second = entryBlocks(entry("Secondmed", "Second Pump", "2222222")).join("\n\n");
      // The first entry lies before the limit and the second beyond it.
      const text = [filler(99_000), first, filler(2_000), second].join("\n\n");
      expect(text.length).toBeGreaterThan(100_000);
      expect(mhraEntriesOf(text)).toBeNull();
      // A text that holds no entry at all is refused as well: it is not an empty list.
      expect(mhraEntriesOf(filler(100_001))).toBeNull();
      expect(mhraEntriesOf("\n".repeat(100_001))).toBeNull();
    });

    it("reads a text of 99,999 and of 100,000 characters whole, and gives no list for one character more", () => {
      const head = "Cutmed: Cut Pump";
      const reference = "MHRA reference: 3333333";
      // A text of `length` characters that ends in an entry; the filler makes up the rest.
      const textOf = (length: number): string =>
        `${head}\n\n${"x".repeat(length - head.length - reference.length - 4)}\n\n${reference}`;
      for (const length of [99_999, 100_000]) {
        const text = textOf(length);
        expect(text).toHaveLength(length);
        expect(mhraEntriesOf(text)).toEqual([
          { manufacturer: "Cutmed", product: "Cut Pump", reference: "3333333" },
        ]);
      }
      for (const length of [100_001, 100_003, 150_000]) {
        const text = textOf(length);
        expect(text).toHaveLength(length);
        expect(mhraEntriesOf(text)).toBeNull();
      }
    });

    it("counts its length in UTF-16 units, as a string does: a character beyond the plane counts as two", () => {
      const tail = "\n\nExamplemed: Pump\n\nMHRA reference: 1111111";
      const room = 100_000 - tail.length;
      const atLimit = `${"x".repeat(room - 2)}${cp(0x1f600)}${tail}`;
      expect(atLimit).toHaveLength(100_000);
      expect(mhraEntriesOf(atLimit)).toEqual([
        { manufacturer: "Examplemed", product: "Pump", reference: "1111111" },
      ]);
      const over = `${"x".repeat(room - 1)}${cp(0x1f600)}${tail}`;
      expect(over).toHaveLength(100_001);
      expect(mhraEntriesOf(over)).toBeNull();
    });

    it("holds at most 1,000 reference lines: one more is no weekly list, whatever they have", () => {
      const lines = (count: number): string =>
        Array.from({ length: count }, () => "MHRA reference").join("\n\n");
      expect(mhraEntriesOf(lines(1_000))).toEqual([]);
      expect(mhraEntriesOf(lines(1_001))).toBeNull();
      const headed = Array.from(
        { length: 1_001 },
        (_, at) => `Examplemed${at}: Pump\n\nMHRA reference: ${refOf(at)}`,
      );
      expect(mhraEntriesOf(headed.join("\n\n"))).toBeNull();
    });

    it("is read without a blow-up of the time, whatever its shape", () => {
      const start = Date.now();
      for (const text of [
        "\n".repeat(100_000),
        ` ${"\n ".repeat(40_000)}`,
        "\n\n".repeat(50_000),
        `${"a".repeat(80)}:`.repeat(1_200),
        `${"MHRA reference".padEnd(20, " ")}\n\n`.repeat(4_000),
        `${": ".repeat(40_000)}`,
        "Examplemed: ".repeat(8_000),
        `${"x".repeat(99_990)}\n\nMHRA reference`,
      ]) {
        mhraEntriesOf(text);
      }
      expect(Date.now() - start).toBeLessThan(BLOW_UP_MS);
    });
  });
});

describe("the connector of the list", () => {
  describe("what it is", () => {
    it("is the connector of uk_mhra, and exports the mark that its records begin with", () => {
      expect(ukMhraConnector.id).toBe("uk_mhra");
      expect(ukMhraConnector.version).toBe(1);
      expect(MARK).toBe("UK MHRA field safety notice lists");
    });

    it("is made by a factory that takes the pause between two pages, and has a real one by default", () => {
      expect(createUkMhraConnector().id).toBe("uk_mhra");
      expect(createUkMhraConnector({}).id).toBe("uk_mhra");
      expect(createUkMhraConnector({ sleep: sleeping() }).id).toBe("uk_mhra");
    });
  });

  describe("the request", () => {
    it("asks the first page of its address, with no validator and its limits", async () => {
      const fetch = fakeFetch(filesOf(GOOD));
      const sleep = sleeping();
      const snapshot = await createUkMhraConnector({ sleep }).download(fetch, {});
      expect(snapshot).not.toBe("unchanged");
      expect(fetch.calls).toHaveLength(1);
      expect(fetch.calls[0].url).toBe(urlOf(0));
      expect(fetch.calls[0].validators).toEqual({});
      expect(fetch.calls[0].limits).toEqual({
        maxBytes: 16_777_216,
        allowedContentTypes: [JSON_TYPE],
        totalTimeoutMs: 60_000,
      });
      // One page: there is no pause.
      expect(sleep).not.toHaveBeenCalled();
    });

    it("asks a page for each thousand lists, 400 ms after the one before, and at most three", async () => {
      const empty = (n: number): ListDoc => ({
        title: "Field Safety Notices",
        link: slug(`example-empty-${n}`),
        issued: "2026-01-12",
        blocks: [],
      });
      const lists = [...GOOD, ...Array.from({ length: 2_500 - GOOD.length }, (_, at) => empty(at))];
      expect(lists).toHaveLength(2_500);
      const fetch = fakeFetch(filesOf(lists));
      const sleep = sleeping();
      const snapshot = await createUkMhraConnector({ sleep }).download(fetch, {});
      if (snapshot === "unchanged") throw new Error("A first download is never unchanged.");
      expect(fetch.calls.map((call) => call.url)).toEqual([urlOf(0), urlOf(1000), urlOf(2000)]);
      expect(sleep.mock.calls).toEqual([[400], [400]]);
      expect(bodyOf(snapshot).rows).toHaveLength(6);
    });

    it("never asks a fourth page: a search that needs one is not the list the connector was built for", async () => {
      const results = Array.from({ length: 3_001 }, (_, at) =>
        resultOf({
          title: "Field Safety Notices",
          link: slug(`example-many-${at}`),
          issued: "2026-01-12",
          blocks: [],
        }),
      );
      const fetch = fakeFetch(filesOfResults(results));
      const sleep = sleeping();
      const error = await failureOf(createUkMhraConnector({ sleep }).download(fetch, {}));
      expect(error).toBeInstanceOf(NotTheListError);
      expect(fetch.calls).toHaveLength(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it("downloads in full whatever the stored validators say: the API sends none, so nothing is unchanged", async () => {
      const fetch = fakeFetch(filesOf(GOOD));
      const again = await ukMhraConnector.download(fetch, {
        etag: `k${ukMhraConnector.version}:abc`,
        lastModified: "Tue, 10 Nov 2026 00:33:24 GMT",
      });
      expect(again).not.toBe("unchanged");
      expect(fetch.calls[0].validators).toEqual({});
    });

    it("stores the validators of a download as none: no etag of the server, the prefix of the reading alone", async () => {
      const snapshot = await downloadOf(filesOf(GOOD));
      expect(snapshot.etag).toBe(`k${ukMhraConnector.version}:`);
      expect(snapshot.lastModified).toBeNull();
    });
  });

  describe("the records of a list", () => {
    it("are one for each manufacturer of the entries, and none for what is not an entry", async () => {
      const { parsed } = await runOf(GOOD);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
      expect(parsed.root).toBe("search.json");
      expect(idsOf(parsed).sort()).toEqual(
        [
          "mhra-fsn:alderwickexamplemedical",
          "mhra-fsn:birchfieldexampledevices",
          "mhra-fsn:cobaltgateexamplesystems",
          "mhra-fsn:dunmereexamplehealthcare",
          "mhra-fsn:elmsteadexamplesurgical",
          "mhra-fsn:fairholtexamplediagnostics",
        ].sort(),
      );
    });

    it("hold what the lists hold for each manufacturer, written as the record's template writes it", async () => {
      const { parsed } = await runOf(GOOD);
      const record = recordOfId(parsed, ALDERWICK_ID);
      expect(record.recordType).toBe("field_safety_notice_summary");
      expect(record.title).toBe("MHRA field safety notices: Alderwick Example Medical");
      expect(record.url).toBe("https://www.gov.uk/drug-device-alerts/fsn-2026-01");
      expect(record.publishedAt).toBe("2026-01-12");
      expect(record.sourceUpdatedAt).toBeNull();
      expect(record.summary).toBe(
        [
          S1,
          S2,
          "Manufacturer as written: Alderwick Example Medical.",
          "Notices listed: 3 since 2024; by year of listing: 2026: 1, 2025: 1, 2024: 1.",
          "Newest: Example Infusion Pump (listed 2026-01-12, MHRA reference 2026/010/009/601/001); Example Infusion Pump Set (listed 2025-06-16, MHRA reference 2026/010/009/601/003); Example Syringe (listed 2024-03-18, MHRA reference 2026/010/009/601/005).",
          CLOSING,
        ].join(" "),
      );
      expect(record.identifiers).toEqual({
        manufacturer: "Alderwick Example Medical",
        notices: 3,
        firstYear: 2024,
        newest: "2026-01-12",
      });
    });

    it("are matched by the manufacturer's name, as written and without its legal form", async () => {
      const { parsed } = await runOf(GOOD);
      expect(recordOfId(parsed, ALDERWICK_ID).matchKeys).toEqual(["name:alderwickexamplemedical"]);
      expect(recordOfId(parsed, "mhra-fsn:birchfieldexampledevices").matchKeys).toEqual([
        "name:birchfieldexampledevicesltd",
        "name:birchfieldexampledevices",
      ]);
      expect(recordOfId(parsed, "mhra-fsn:fairholtexamplediagnostics").matchKeys).toEqual([
        "name:fairholtexamplediagnosticsag",
        "name:fairholtexamplediagnostics",
      ]);
      for (const record of parsed.records) {
        expect(record.matchKeys.every((key) => key.startsWith("name:"))).toBe(true);
      }
    });

    it("are well formed, begin with the mark and say which list they come from", async () => {
      const { parsed } = await runOf(GOOD);
      expectWellFormedRecords(parsed.records, { sourceId: "uk_mhra", mark: MARK });
      for (const record of parsed.records) {
        expect(record.summary.startsWith(`${MARK} (gov.uk), a product safety list. `)).toBe(true);
        expect(record.summary).toContain("not a finding of fault");
        expect(record.summary.endsWith(CLOSING)).toBe(true);
      }
    });

    it("never say that the manufacturer did something wrong, or that a notice is a finding", async () => {
      const { parsed } = await runOf(GOOD);
      for (const record of parsed.records) {
        expect(record.summary).not.toMatch(
          /\b(?:guilty|violat|breached|convicted|banned|unsafe|defective)\b/i,
        );
      }
    });

    it("have the version of the lists: the newest day of their lists", async () => {
      const { parsed } = await runOf(GOOD);
      expect(parsed.sourceVersion).toBe("2026-01-12");
    });

    it("give the same records whatever day the lists are read on: no read of the clock", async () => {
      jest.useFakeTimers({ now: new Date("2027-05-05T12:00:00Z") });
      try {
        const first = await runOf(GOOD);
        jest.setSystemTime(new Date("2031-11-30T23:59:59Z"));
        const second = await runOf(GOOD);
        expect(second.snapshot.bodies).toEqual(first.snapshot.bodies);
        expect(second.parsed).toEqual(first.parsed);
      } finally {
        jest.useRealTimers();
      }
    });

    it("have ids that differ and addresses that differ when their newest lists differ, and share the address of a list that names them together", async () => {
      const { parsed } = await runOf(GOOD);
      const ids = idsOf(parsed);
      expect(new Set(ids).size).toBe(ids.length);
      expect(recordOfId(parsed, ALDERWICK_ID).url).not.toBe(
        recordOfId(parsed, "mhra-fsn:cobaltgateexamplesystems").url,
      );
      // Dunmere, Elmstead and Fairholt are named by the same list: one address, the list's own.
      const shared = [
        "mhra-fsn:dunmereexamplehealthcare",
        "mhra-fsn:elmsteadexamplesurgical",
        "mhra-fsn:fairholtexamplediagnostics",
      ].map((id) => recordOfId(parsed, id).url);
      expect(new Set(shared)).toEqual(
        new Set(["https://www.gov.uk/drug-device-alerts/fsn-2024-03"]),
      );
      for (const record of parsed.records) {
        expect(record.url.startsWith("https://www.gov.uk/drug-device-alerts/")).toBe(true);
      }
    });
  });

  describe("the entries of the lists", () => {
    it("are three notices for three entries of one manufacturer in a list with an overview, dates and model lines", async () => {
      const entries = [195, 196, 197].map((n) => ({
        maker: "Examplemed",
        product: "Example Infusion Pump",
        reference: `2026/010/009/601/${n}`,
      }));
      const { parsed, snapshot } = await runOf([oneList(entries), ...GOOD]);
      const record = recordOfId(parsed, "mhra-fsn:examplemed");
      expect(record.identifiers).toMatchObject({ notices: 3 });
      expect(JSON.stringify(snapshot.bodies)).not.toContain("ZZ-");
    });

    it("count the reference once whatever its form: a slash form, a number and a slash form with a plain space or a no-break space", async () => {
      const entries: Entry[] = [
        { maker: "Examplemed", product: "A", reference: "2026/010/009/601/195" },
        { maker: "Examplemed", product: "B", reference: "41295467 2026/010/009/601/195" },
        { maker: "Examplemed", product: "C", reference: `41295467${NBSP}2026/010/009/601/195` },
        {
          maker: "Examplemed",
          product: "D",
          reference: "2026/010/009/601/195 Customer reply form",
        },
      ];
      const { snapshot } = await runOf([oneList(entries), ...GOOD]);
      const row = rowOfKey(snapshot, "examplemed");
      expect(row.count).toBe(1);
      expect(row.items).toHaveLength(1);
      expect(row.items[0].reference).toBe("2026/010/009/601/195");
    });

    it("count a bare 8-digit number, a bare 7-digit number and a slash form as three notices", async () => {
      const entries: Entry[] = [
        { maker: "Examplemed", product: "A", reference: "41295467" },
        { maker: "Examplemed", product: "B", reference: "4129546" },
        { maker: "Examplemed", product: "C", reference: "2026/010/009/601/195" },
      ];
      const { snapshot } = await runOf([oneList(entries), ...GOOD]);
      expect(
        rowOfKey(snapshot, "examplemed")
          .items.map((item) => item.reference)
          .sort(),
      ).toEqual(["2026/010/009/601/195", "4129546", "41295467"]);
    });

    it("give no row for an entry that has no heading: an attached letter that repeats the reference of an entry", async () => {
      const blocks = [
        ...INTRO,
        ...entryBlocks({ maker: "Examplemed", product: "Example Pump", reference: refOf(10) }),
        "Letter A",
        `MHRA reference: ${refOf(10)}`,
        "Letter B",
        "MHRA reference: 41295467",
      ];
      const { snapshot } = await runOf([
        {
          title: "Field Safety Notices: 26 January to 30 January 2026",
          link: slug("example-letters"),
          issued: "2026-02-02",
          blocks,
        },
        ...GOOD,
      ]);
      const row = rowOfKey(snapshot, "examplemed");
      expect(row.count).toBe(1);
      expect(bodyOf(snapshot).unreadable).toBe(0);
      expect(JSON.stringify(snapshot.bodies)).not.toContain("41295467");
    });

    it("count a reference once when two entries of one manufacturer have it in one list, and once when a later list has it again", async () => {
      const twice: Entry[] = [
        { maker: "Examplemed", product: "First Pump", reference: refOf(20) },
        { maker: "Examplemed", product: "Second Pump", reference: refOf(20) },
        { maker: "Examplemed", product: "Third Pump", reference: refOf(21) },
      ];
      const later = list(
        "Field Safety Notices: 16 February to 20 February 2026",
        slug("example-later"),
        "2026-02-23",
        [{ maker: "Examplemed", product: "Relisted Pump", reference: refOf(20) }],
      );
      const { snapshot } = await runOf([oneList(twice), later, ...GOOD]);
      const row = rowOfKey(snapshot, "examplemed");
      expect(row.count).toBe(2);
      // The newest listing of a reference is the one that is kept, and the first of two in one list.
      expect(row.items.map((item) => [item.product, item.reference, item.listed])).toEqual([
        ["Relisted Pump", refOf(20), "2026-02-23"],
        ["Third Pump", refOf(21), "2026-02-02"],
      ]);
    });

    it("keep the first entry of a reference that one list has twice, whatever the products say", async () => {
      const { snapshot } = await runOf([
        oneList([
          { maker: "Examplemed", product: "First Pump", reference: refOf(22) },
          { maker: "Examplemed Ltd", product: "Second Pump", reference: refOf(22) },
        ]),
        ...GOOD,
      ]);
      const row = rowOfKey(snapshot, "examplemed");
      expect(row.items.map((item) => item.product)).toEqual(["First Pump"]);
      expect(row.spellings).toEqual(["Examplemed"]);
    });

    it("order the notices of one list by their references, whatever the order of the entries", async () => {
      for (const references of [
        [refOf(24), refOf(23)],
        [refOf(23), refOf(24)],
      ]) {
        const { snapshot } = await runOf([
          oneList(
            references.map((reference) => ({ maker: "Examplemed", product: "Pump", reference })),
          ),
          ...GOOD,
        ]);
        expect(rowOfKey(snapshot, "examplemed").items.map((item) => item.reference)).toEqual([
          refOf(23),
          refOf(24),
        ]);
      }
    });

    it("count the same reference of two manufacturers as two notices", async () => {
      const shared = refOf(30);
      const { snapshot } = await runOf([
        oneList([
          { maker: "Examplemed", product: "Pump", reference: shared },
          { maker: "Othermed", product: "Pump", reference: shared },
        ]),
        ...GOOD,
      ]);
      expect(rowOfKey(snapshot, "examplemed").count).toBe(1);
      expect(rowOfKey(snapshot, "othermed").count).toBe(1);
    });

    it("do not take a heading that begins with Model or Batch for a manufacturer", async () => {
      const blocks = [
        ...INTRO,
        "Model: ZZ-MODEL-ALONE",
        `MHRA reference: ${refOf(40)}`,
        "Batch: ZZ-BATCH-ALONE",
        "Examplemed: Example Pump",
        `MHRA reference: ${refOf(41)}`,
      ];
      const { snapshot } = await runOf([
        {
          title: "Field Safety Notices: 26 January to 30 January 2026",
          link: slug("example-skip"),
          issued: "2026-02-02",
          blocks,
        },
        ...GOOD,
      ]);
      expect(rowOfKey(snapshot, "examplemed").count).toBe(1);
      expect(snapshot.bodies[0]).not.toContain("ZZ-");
      expect(bodyOf(snapshot).rows.map((row) => row.key)).not.toContain("model");
      expect(bodyOf(snapshot).rows.map((row) => row.key)).not.toContain("batch");
    });

    it("read the lists whatever the prefix of their titles, with ordinal days or none, because only the years of a title are read", async () => {
      const titles = [
        "Field Safety Notices: 1st to 5th August 2025",
        "Field safety notices - 8th to 12th September 2025",
        "Field Safety Notices (FSNs) from 15th to 19th September 2025",
        "FSNs: 22 September to 26 September 2025",
      ];
      const lists = titles.map((title, at) =>
        list(title, slug(`example-title-${at}`), `2025-0${8 + Math.floor(at / 2)}-1${at + 1}`, [
          { maker: "Examplemed", product: `Pump ${at}`, reference: refOf(50 + at) },
        ]),
      );
      const { snapshot } = await runOf([...lists, ...GOOD]);
      const row = rowOfKey(snapshot, "examplemed");
      expect(row.count).toBe(4);
      expect(row.byYear).toEqual([[2025, 4]]);
    });

    it("keep a manufacturer whose name has four letters and digits, with or without a legal form", async () => {
      const { parsed } = await runOf([
        oneList([
          { maker: "Abcd", product: "Pump", reference: refOf(63) },
          { maker: "W1x2 Ltd", product: "Pump", reference: refOf(64) },
        ]),
        ...GOOD,
      ]);
      expect(idsOf(parsed)).toEqual(expect.arrayContaining(["mhra-fsn:abcd", "mhra-fsn:w1x2"]));
    });

    it("give a manufacturer whose name has fewer than four letters and digits no row, and a name with a legal form its product as listed", async () => {
      const { parsed, snapshot } = await runOf([
        oneList([
          { maker: "XQ", product: "Refer to FSN", reference: refOf(60) },
          { maker: "Examplemed Inc", product: "Refer to FSN", reference: refOf(61) },
          { maker: "ABC Ltd", product: "Refer to FSN", reference: refOf(62) },
        ]),
        ...GOOD,
      ]);
      const keys = bodyOf(snapshot).rows.map((row) => row.key);
      expect(keys).toContain("examplemed");
      expect(keys).not.toContain("xq");
      expect(keys).not.toContain("abc");
      expect(recordOfId(parsed, "mhra-fsn:examplemed").summary).toContain(
        "Newest: Refer to FSN (listed 2026-02-02, MHRA reference",
      );
    });
  });

  describe("a manufacturer that several lists name", () => {
    it("is one record: its notices counted, the newest three shown, newest first, with the years of their lists", async () => {
      const lists = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].map((year, at) =>
        list(
          `Field Safety Notices: 5 March to 9 March ${year}`,
          slug(`example-year-${year}`),
          `${year}-03-12`,
          [
            { maker: "Examplemed", product: `Pump ${year}`, reference: refOf(70 + at) },
            ...(year === 2024
              ? [{ maker: "Examplemed", product: "Pump 2024 B", reference: refOf(90) }]
              : []),
          ],
        ),
      );
      const { parsed, snapshot } = await runOf([...lists, ...GOOD]);
      const row = rowOfKey(snapshot, "examplemed");
      expect(row.count).toBe(9);
      // The five newest years that have notices; the first year is the oldest of all.
      expect(row.byYear).toEqual([
        [2025, 1],
        [2024, 2],
        [2023, 1],
        [2022, 1],
        [2021, 1],
      ]);
      expect(row.firstYear).toBe(2018);
      expect(row.items.map((item) => item.listed)).toEqual([
        "2025-03-12",
        "2024-03-12",
        "2024-03-12",
      ]);
      expect(row.newest).toBe("2025-03-12");
      const record = recordOfId(parsed, "mhra-fsn:examplemed");
      expect(record.summary).toContain(
        "Notices listed: 9 since 2018; by year of listing: 2025: 1, 2024: 2, 2023: 1, 2022: 1, 2021: 1.",
      );
      expect(record.publishedAt).toBe("2025-03-12");
      expect(record.url).toBe("https://www.gov.uk/drug-device-alerts/example-year-2025");
    });

    it("has a tie of two notices on one day settled by the order of the lists' links, whatever the order of the results", async () => {
      const a = list(
        "Field Safety Notices: 5 March to 9 March 2025",
        slug("example-a"),
        "2025-03-12",
        [{ maker: "Examplemed", product: "Pump A", reference: refOf(80) }],
      );
      const b = list(
        "Field Safety Notices: 5 March to 9 March 2025",
        slug("example-b"),
        "2025-03-12",
        [{ maker: "Examplemed", product: "Pump B", reference: refOf(81) }],
      );
      for (const lists of [
        [a, b],
        [b, a],
      ]) {
        const { snapshot } = await runOf([...lists, ...GOOD]);
        expect(rowOfKey(snapshot, "examplemed").items.map((item) => item.product)).toEqual([
          "Pump A",
          "Pump B",
        ]);
      }
    });

    it("is named by its most frequent spelling, with the others after it, most frequent first and then in the order of the texts", async () => {
      const spellings = [
        ...Array<string>(3).fill("Examplemed Inc"),
        ...Array<string>(2).fill("Examplemed Ltd"),
        "Examplemed",
      ];
      const entries = spellings.map((maker, at) => ({
        maker,
        product: "Pump",
        reference: refOf(100 + at),
      }));
      const { parsed, snapshot } = await runOf([oneList(entries), ...GOOD]);
      const row = rowOfKey(snapshot, "examplemed");
      expect(row.displayName).toBe("Examplemed Inc");
      expect(row.spellings).toEqual(["Examplemed Inc", "Examplemed Ltd", "Examplemed"]);
      expect(recordOfId(parsed, "mhra-fsn:examplemed").summary).toContain(
        "Manufacturer as written: Examplemed Inc.",
      );
      expect(recordOfId(parsed, "mhra-fsn:examplemed").matchKeys).toEqual([
        "name:examplemedinc",
        "name:examplemed",
        "name:examplemedltd",
      ]);
    });

    it("has a tie of spellings settled by the order of the texts, and at most ten spellings", async () => {
      const spellings = [
        "Examplemed",
        "EXAMPLEMED",
        "Examplemed Inc",
        "Examplemed Inc.",
        "Examplemed Ltd",
        "Examplemed Ltd.",
        "Examplemed Limited",
        "Examplemed GmbH",
        "Examplemed AG",
        "Examplemed PLC",
        "Examplemed LLC",
        "Examplemed Corp",
      ];
      const entries = spellings.map((maker, at) => ({
        maker,
        product: "Pump",
        reference: refOf(120 + at),
      }));
      const { snapshot } = await runOf([oneList(entries), ...GOOD]);
      const row = rowOfKey(snapshot, "examplemed");
      expect(row.count).toBe(12);
      expect(row.spellings).toEqual([...spellings].sort().slice(0, 10));
      expect(row.displayName).toBe([...spellings].sort()[0]);
    });

    it("counts the spelling of the newest listing of a reference, when two lists name it with two spellings", async () => {
      const older = list(
        "Field Safety Notices: 5 March to 9 March 2024",
        slug("example-older"),
        "2024-03-12",
        [{ maker: "Examplemed Ltd", product: "Old Pump", reference: refOf(130) }],
      );
      const newer = list(
        "Field Safety Notices: 5 March to 9 March 2025",
        slug("example-newer"),
        "2025-03-12",
        [{ maker: "Examplemed Inc", product: "New Pump", reference: refOf(130) }],
      );
      const { snapshot } = await runOf([older, newer, ...GOOD]);
      const row = rowOfKey(snapshot, "examplemed");
      expect(row.spellings).toEqual(["Examplemed Inc"]);
      expect(row.items).toEqual([
        {
          product: "New Pump",
          reference: refOf(130),
          listed: "2025-03-12",
          link: slug("example-newer"),
        },
      ]);
    });

    describe("a reference of no known form", () => {
      // The text of the line, without blanks and in lower case, is the notice: a record shows its first 40 characters.
      const SHARED = "r".repeat(40);
      const TEXT = "Customer Reply Form Number 17 Of The Week 2026 Part A";

      it("tells two notices apart when their references share the first 40 characters and differ after them", async () => {
        const { parsed, snapshot } = await runOf([
          oneList([
            { maker: "Examplemed", product: "Pump A", reference: `${SHARED}one` },
            { maker: "Examplemed", product: "Pump B", reference: `${SHARED}two` },
          ]),
          ...GOOD,
        ]);
        const row = rowOfKey(snapshot, "examplemed");
        expect(row.count).toBe(2);
        expect(row.items.map((item) => item.product)).toEqual(["Pump A", "Pump B"]);
        // The 40 characters are shown, as they always were, with no mark of a cut.
        expect(row.items.map((item) => item.reference)).toEqual([SHARED, SHARED]);
        const summary = recordOfId(parsed, "mhra-fsn:examplemed").summary;
        expect(summary).toContain("Notices listed: 2 since 2026");
        expect(summary.match(new RegExp(`MHRA reference ${SHARED}\\)`, "g"))).toHaveLength(2);
        expect(summary).not.toContain(`${SHARED}one`);
      });

      it("tells two notices of two lists apart in the same way, and tells two of the longest line apart at the last character", async () => {
        const older = list(
          "Field Safety Notices: 5 March to 9 March 2024",
          slug("example-older"),
          "2024-03-12",
          [
            { maker: "Examplemed", product: "Old Pump", reference: `${SHARED}one` },
            { maker: "Examplemed", product: "Old Longest", reference: `${"q".repeat(299)}a` },
          ],
        );
        const newer = list(
          "Field Safety Notices: 5 March to 9 March 2025",
          slug("example-newer"),
          "2025-03-12",
          [
            { maker: "Examplemed", product: "New Pump", reference: `${SHARED}two` },
            { maker: "Examplemed", product: "New Longest", reference: `${"q".repeat(299)}b` },
          ],
        );
        const { snapshot } = await runOf([older, newer, ...GOOD]);
        const row = rowOfKey(snapshot, "examplemed");
        expect(row.count).toBe(4);
        expect(row.byYear).toEqual([
          [2025, 2],
          [2024, 2],
        ]);
      });

      it("joins the notice that two lists name with one such reference, whatever its blanks and case, and keeps the newer listing", async () => {
        const older = list(
          "Field Safety Notices: 5 March to 9 March 2024",
          slug("example-older"),
          "2024-03-12",
          [{ maker: "Examplemed", product: "Old Pump", reference: TEXT }],
        );
        const newer = list(
          "Field Safety Notices: 5 March to 9 March 2025",
          slug("example-newer"),
          "2025-03-12",
          [
            {
              maker: "Examplemed",
              product: "New Pump",
              reference: TEXT.toLowerCase().replace(/ /g, "  "),
            },
          ],
        );
        for (const lists of [
          [older, newer],
          [newer, older],
        ]) {
          const { snapshot } = await runOf([...lists, ...GOOD]);
          const row = rowOfKey(snapshot, "examplemed");
          expect(row.count).toBe(1);
          expect(row.items).toEqual([
            {
              product: "New Pump",
              reference: TEXT.toLowerCase().replace(/ /g, "").slice(0, 40),
              listed: "2025-03-12",
              link: slug("example-newer"),
            },
          ]);
        }
      });

      it("gives the same body whatever the order of the entries that differ after the 40th character", async () => {
        const entries = ["one", "two", "three"].map((tail, at) => ({
          maker: "Examplemed",
          product: `Pump ${at}`,
          reference: `${SHARED}${tail}`,
        }));
        const forward = await runOf([oneList(entries), ...GOOD]);
        const reversed = await runOf([oneList([...entries].reverse()), ...GOOD]);
        expect(rowOfKey(forward.snapshot, "examplemed").count).toBe(3);
        // The tie of one list and one day is settled by the whole reference: one, three, two.
        expect(rowOfKey(forward.snapshot, "examplemed").items.map((item) => item.product)).toEqual([
          "Pump 0",
          "Pump 2",
          "Pump 1",
        ]);
        expect(reversed.snapshot.bodies[0]).toBe(forward.snapshot.bodies[0]);
      });

      it("is shown in at most 40 units and in whole characters: a pair of surrogates that would not fit is left out", async () => {
        const { snapshot } = await runOf([
          oneList([
            {
              maker: "Examplemed",
              product: "Pump",
              reference: `${"x".repeat(39)}${cp(0x20000)}yz`,
            },
          ]),
          ...GOOD,
        ]);
        expect(rowOfKey(snapshot, "examplemed").items[0].reference).toBe("x".repeat(39));
        expect(snapshot.bodies[0]).not.toMatch(/[\ud800-\udfff]/u);
      });

      it("keeps a reference of a known form as it is: the slash form and the number are not cut", async () => {
        const { snapshot } = await runOf([
          oneList([
            { maker: "Examplemed", product: "Pump A", reference: refOf(171) },
            { maker: "Examplemed", product: "Pump B", reference: "see 41295467 for details" },
          ]),
          ...GOOD,
        ]);
        expect(rowOfKey(snapshot, "examplemed").items.map((item) => item.reference)).toEqual([
          refOf(171),
          "41295467",
        ]);
      });
    });

    it("is the same manufacturer whatever its legal form, article, case and punctuation say", async () => {
      const { parsed } = await runOf([
        oneList([
          {
            maker: "The Winterbourne-Example Company Limited",
            product: "A",
            reference: refOf(140),
          },
          { maker: "WINTERBOURNE EXAMPLE Co", product: "B", reference: refOf(141) },
        ]),
        ...GOOD,
      ]);
      expect(idsOf(parsed).filter((id) => id.startsWith("mhra-fsn:winterbourne"))).toEqual([
        "mhra-fsn:winterbourneexample",
      ]);
    });

    it("keeps the id that a manufacturer has, whatever the order of the lists and the lists that come with it", async () => {
      const first = await runOf(GOOD);
      const second = await runOf([...GOOD].reverse());
      const third = await runOf([
        ...GOOD,
        oneList([{ maker: "Another Example Devices", product: "Pump", reference: refOf(150) }]),
      ]);
      expect(idsOf(second.parsed)).toEqual(idsOf(first.parsed));
      for (const id of idsOf(first.parsed)) expect(idsOf(third.parsed)).toContain(id);
    });

    it("has the compact name whole for its id, up to the 120 letters that the longest name has once folded", async () => {
      // A heading holds 80 characters before its colon, and a ligature folds to three letters.
      const maker = cp(0xfb03).repeat(40);
      const { parsed } = await runOf([
        oneList([{ maker, product: "Pump", reference: refOf(160) }]),
        ...GOOD,
      ]);
      const id = `mhra-fsn:${"ffi".repeat(40)}`;
      expect(id).toHaveLength("mhra-fsn:".length + 120);
      expect(idsOf(parsed)).toContain(id);
      expect(recordOfId(parsed, id).matchKeys).toEqual([`name:${"ffi".repeat(40)}`]);
      expect(recordOfId(parsed, id).title).toBe(`MHRA field safety notices: ${"ffi".repeat(40)}`);
      expect(recordOfId(parsed, id).summary).toContain(
        `Manufacturer as written: ${"ffi".repeat(40)}.`,
      );
      expectWellFormedRecords(parsed.records, { sourceId: "uk_mhra", mark: MARK });
    });

    it("tells two long names apart by their letters, and joins the same name written in two ways", async () => {
      const long = (tail: string): string => `${"Winterbourne".repeat(5)}${tail}`;
      const { parsed } = await runOf([
        oneList([
          { maker: `${long("Alpha")} Inc`, product: "A", reference: refOf(161) },
          { maker: `${long("Alpha")} Ltd`, product: "B", reference: refOf(162) },
          { maker: `${long("Bravo")} Ltd`, product: "C", reference: refOf(163) },
        ]),
        ...GOOD,
      ]);
      expect(idsOf(parsed).filter((id) => id.includes("winterbourne"))).toEqual([
        `mhra-fsn:${compact(long("Alpha"))}`,
        `mhra-fsn:${compact(long("Bravo"))}`,
      ]);
    });
  });

  describe("the dates of the lists", () => {
    it("are the issued date of a list whose title has no year or the year of the issued date", async () => {
      const { snapshot } = await runOf([
        list("Field Safety Notices: weekly", slug("example-no-year"), "2025-04-07", [
          { maker: "Examplemed", product: "A", reference: refOf(170) },
        ]),
        ...GOOD,
      ]);
      expect(rowOfKey(snapshot, "examplemed").items[0].listed).toBe("2025-04-07");
    });

    it("are none for a list titled 7 August to 11 August 2023 and issued 2012-08-14: its entries count, and are in no year", async () => {
      const undated = list(
        "Field Safety Notices: 7 August to 11 August 2023",
        slug("example-undated"),
        "2012-08-14",
        [
          { maker: "Examplemed", product: "Undated Pump", reference: refOf(180) },
          { maker: "Undatedmed", product: "Undated Pump", reference: refOf(181) },
        ],
      );
      const dated = list(
        "Field Safety Notices: 5 March to 9 March 2025",
        slug("example-dated"),
        "2025-03-12",
        [{ maker: "Examplemed", product: "Dated Pump", reference: refOf(182) }],
      );
      const { parsed, snapshot } = await runOf([undated, dated, ...GOOD]);

      const mixed = rowOfKey(snapshot, "examplemed");
      expect(mixed.count).toBe(2);
      expect(mixed.byYear).toEqual([[2025, 1]]);
      expect(mixed.firstYear).toBe(2025);
      expect(mixed.newest).toBe("2025-03-12");
      // An undated notice is shown after the dated ones, as listed with no date.
      expect(mixed.items.map((item) => [item.product, item.listed])).toEqual([
        ["Dated Pump", "2025-03-12"],
        ["Undated Pump", null],
      ]);
      expect(recordOfId(parsed, "mhra-fsn:examplemed").summary).toContain(
        "Newest: Dated Pump (listed 2025-03-12, MHRA reference 2026/010/009/601/182); Undated Pump (listed date unclear, MHRA reference 2026/010/009/601/180).",
      );

      const only = rowOfKey(snapshot, "undatedmed");
      expect(only).toMatchObject({ count: 1, firstYear: null, byYear: [], newest: null });
      const record = recordOfId(parsed, "mhra-fsn:undatedmed");
      expect(record.publishedAt).toBeNull();
      expect(record.url).toBe("https://www.gov.uk/drug-device-alerts/example-undated");
      expect(record.summary).toContain(
        "Notices listed: 1. Newest: Undated Pump (listed date unclear, MHRA reference 2026/010/009/601/181).",
      );
      expect(record.identifiers).toEqual({
        manufacturer: "Undatedmed",
        notices: 1,
        firstYear: null,
        newest: null,
      });
      expectWellFormedRecords(parsed.records, { sourceId: "uk_mhra", mark: MARK });
    });

    it("keep a December week issued in January", async () => {
      const { snapshot } = await runOf([
        list(
          "Field Safety Notices: 29 December 2025 to 2 January 2026",
          slug("example-december"),
          "2026-01-05",
          [{ maker: "Examplemed", product: "December Pump", reference: refOf(190) }],
        ),
        ...GOOD,
      ]);
      expect(rowOfKey(snapshot, "examplemed")).toMatchObject({
        newest: "2026-01-05",
        byYear: [[2026, 1]],
      });
    });

    it("rank the notice of a dated list over the notice of an undated one, even when the undated list's link is first", async () => {
      const undated = list(
        "Field Safety Notices: 7 August to 11 August 2023",
        slug("example-a-undated"),
        "2012-08-14",
        [{ maker: "Examplemed", product: "Undated Pump", reference: refOf(195) }],
      );
      const dated = list(
        "Field Safety Notices: 5 March to 9 March 2020",
        slug("example-z-dated"),
        "2020-03-12",
        [{ maker: "Examplemed", product: "Dated Pump", reference: refOf(196) }],
      );
      const { snapshot } = await runOf([undated, dated, ...GOOD]);
      expect(rowOfKey(snapshot, "examplemed").items.map((item) => item.product)).toEqual([
        "Dated Pump",
        "Undated Pump",
      ]);
    });

    it("keep the dated listing of a reference that an undated list has as well", async () => {
      const undated = list(
        "Field Safety Notices: 7 August to 11 August 2023",
        slug("example-undated"),
        "2012-08-14",
        [{ maker: "Examplemed", product: "Undated Pump", reference: refOf(197) }],
      );
      const dated = list(
        "Field Safety Notices: 5 March to 9 March 2020",
        slug("example-dated"),
        "2020-03-12",
        [{ maker: "Examplemed", product: "Dated Pump", reference: refOf(197) }],
      );
      for (const lists of [
        [undated, dated],
        [dated, undated],
      ]) {
        const { snapshot } = await runOf([...lists, ...GOOD]);
        const row = rowOfKey(snapshot, "examplemed");
        expect(row.count).toBe(1);
        expect(row.items).toEqual([
          {
            product: "Dated Pump",
            reference: refOf(197),
            listed: "2020-03-12",
            link: slug("example-dated"),
          },
        ]);
      }
    });
  });

  describe("the rows and the total", () => {
    it("count in total the lists that were read, when there are more lists than manufacturers", async () => {
      const lists = Array.from({ length: 10 }, (_, at) =>
        list(
          `Field Safety Notices: 5 March to 9 March 2025`,
          slug(`example-ten-${at}`),
          "2025-03-12",
          [
            { maker: "Examplemed", product: "Pump", reference: refOf(200 + at) },
            { maker: "Othermed", product: "Pump", reference: refOf(300 + at) },
          ],
        ),
      );
      const { snapshot } = await runOf(lists);
      const body = bodyOf(snapshot);
      expect(body.rows).toHaveLength(2);
      expect(body.total).toBe(10);
      expect(body.unreadable).toBe(0);
    });

    it("count the rows in total when there are more manufacturers than lists: a list names many, and the kit refuses a total below the rows", async () => {
      // Two lists of the weekly kind, and fourteen manufacturers between them: more rows than raw rows.
      const lists = [
        oneList(MANY.slice(0, 7)),
        list(
          "Field Safety Notices: 2 February to 6 February 2026",
          slug("example-second"),
          "2026-02-09",
          MANY.slice(7),
        ),
      ];
      const snapshot = await downloadOf(filesOf(lists));
      const body = bodyOf(snapshot);
      expect(body.rows).toHaveLength(14);
      expect(body.total).toBe(14);
      expect(body.total).toBeGreaterThanOrEqual(body.rows.length + body.unreadable);
      expect(ukMhraConnector.parse(snapshot)).toMatchObject({ errors: 0, skipped: 0 });
      expect(ukMhraConnector.parse(snapshot).records).toHaveLength(14);
    });

    it("count the lists that could not be read as well, so that the total is never below rows and unreadable together", async () => {
      const bad = [1, 2].map((at) => ({
        ...resultOf(oneList([])),
        link: slug(`example-bad-${at}`),
        indexable_content: undefined,
      }));
      const results = [
        ...[
          oneList(MANY.slice(0, 7)),
          list(
            "Field Safety Notices: 2 February to 6 February 2026",
            slug("example-second"),
            "2026-02-09",
            MANY.slice(7),
          ),
        ].map(resultOf),
        ...bad,
      ];
      const snapshot = await downloadOf(filesOfResults(results));
      const body = bodyOf(snapshot);
      expect(body.unreadable).toBe(2);
      expect(body.total).toBe(16);
    });

    it("count every list in total: the ones with no entry and the ones of no date too", async () => {
      const { snapshot } = await runOf([
        ...GOOD,
        {
          title: "Field Safety Notices: weekly",
          link: slug("example-nothing"),
          issued: "2026-03-01",
          blocks: INTRO,
        },
        {
          title: "Field Safety Notices: weekly",
          link: slug("example-empty"),
          issued: "2026-03-02",
          blocks: [],
        },
      ]);
      expect(bodyOf(snapshot).total).toBe(6);
    });
  });

  describe("the list is not the list", () => {
    const failure = async (files: Record<string, FakeFile>) =>
      failureOf(ukMhraConnector.download(fakeFetch(files), {}));

    it("is no list when a search states a total that its distinct links do not add up to: 624 stated and 623 distinct", async () => {
      const lists = Array.from({ length: 623 }, (_, at) =>
        resultOf({
          title: "Field Safety Notices",
          link: slug(`example-${at}`),
          issued: "2026-01-12",
          blocks: [],
        }),
      );
      const results = [...lists, { ...lists[0] }];
      expect(results).toHaveLength(624);
      expect(await failure(filesOfResults(results))).toBeInstanceOf(NotTheListError);

      const short = filesOfResults(lists);
      short[urlOf(0)] = { ...short[urlOf(0)], body: pageText(lists, 624, 0) };
      expect(await failure(short)).toBeInstanceOf(NotTheListError);
    });

    it.each<[string, string]>([
      ["a page of HTML", "<!DOCTYPE html><html><head><title>Just a moment</title></head></html>"],
      ["an empty answer", ""],
      ["text that is no JSON", "not json at all"],
      ["a JSON list", "[]"],
      ["null", "null"],
      ["an object with no results", '{"total": 3, "start": 0}'],
      ["results that are no list", '{"total": 1, "start": 0, "results": {"link": "/a"}}'],
      ["a total that is no count", '{"total": "3", "start": 0, "results": []}'],
      ["a negative total", '{"total": -1, "start": 0, "results": []}'],
    ])("for %s sent as JSON", async (_what, body) => {
      expect(await failure({ [urlOf(0)]: { body, contentType: JSON_TYPE } })).toBeInstanceOf(
        NotTheListError,
      );
    });

    it("for results that are no objects or have no link of the site", async () => {
      const good = GOOD.map(resultOf);
      for (const results of [
        [...good, "a string"],
        [...good, null],
        [...good, { title: "no link" }],
        [...good, { title: "x", link: 7 }],
        [...good, { title: "x", link: "no-slash" }],
      ]) {
        const files = {
          [urlOf(0)]: { body: pageText(results, results.length, 0), contentType: JSON_TYPE },
        };
        expect(await failure(files)).toBeInstanceOf(NotTheListError);
      }
    });

    it("for a page that says it begins elsewhere than at 0", async () => {
      const results = GOOD.map(resultOf);
      const files = {
        [urlOf(0)]: { body: pageText(results, results.length, 5), contentType: JSON_TYPE },
      };
      expect(await failure(files)).toBeInstanceOf(NotTheListError);
    });

    it("gives an empty list, not a failure, when the lists hold no entry: the sync's own guards tell an empty copy", async () => {
      const snapshot = await downloadOf(
        filesOf([
          {
            title: "Field Safety Notices",
            link: slug("example-none"),
            issued: "2026-01-12",
            blocks: INTRO,
          },
        ]),
      );
      expect(bodyOf(snapshot).rows).toEqual([]);
      expect(ukMhraConnector.parse(snapshot)).toMatchObject({
        records: [],
        errors: 0,
        root: "search.json",
      });
    });

    it("when it holds more than 20,000 manufacturers, and is read at 20,000", async () => {
      // A list of `count` manufacturers of a name of their own, each with a number of its own.
      const bigList = (at: number, count: number): ListDoc => ({
        title: "Field Safety Notices: weekly",
        link: slug(`example-big-${at}`),
        issued: "2026-01-12",
        blocks: Array.from({ length: count }, (_, index) => [
          `Bigmaker${at}x${index}: P`,
          `MHRA reference: ${1_000_000 + at * 500 + index}`,
        ]).flat(),
      });
      const full = Array.from({ length: 40 }, (_, at) => bigList(at, 500));
      const snapshot = await downloadOf(filesOf(full));
      expect(bodyOf(snapshot).rows).toHaveLength(20_000);
      expect(await failure(filesOf([...full, bigList(40, 1)]))).toBeInstanceOf(NotTheListError);
    });

    it("when it holds more than 50,000 notices, and is read at 50,000", async () => {
      const entriesOf = (count: number, offset: number): Entry[] =>
        Array.from({ length: count }, (_, index) => ({
          maker: "Examplemed",
          product: "P",
          reference: `${1000000 + offset + index}`,
        }));
      const compactList = (at: number, count: number): ListDoc => ({
        title: "Field Safety Notices: weekly",
        link: slug(`example-notices-${at}`),
        issued: "2026-01-12",
        blocks: entriesOf(count, at * 1000).flatMap((entry) => [
          `${entry.maker}: ${entry.product}`,
          `MHRA reference: ${entry.reference}`,
        ]),
      });
      const fifty = Array.from({ length: 50 }, (_, at) => compactList(at, 1_000));
      const snapshot = await downloadOf(filesOf(fifty));
      expect(rowOfKey(snapshot, "examplemed").count).toBe(50_000);
      expect(await failure(filesOf([...fifty, compactList(50, 1)]))).toBeInstanceOf(
        NotTheListError,
      );
    });
  });

  describe("a download that fails", () => {
    const failure = async (files: Record<string, FakeFile>) =>
      failureOf(ukMhraConnector.download(fakeFetch(files), {}));

    it("is too large when the page was cut at its limit, whatever it holds", async () => {
      expect(await failure(filesOf(GOOD, { truncated: true }))).toBeInstanceOf(BodyTooLargeError);
      const text = pageText(GOOD.map(resultOf), GOOD.length, 0);
      const filler = Buffer.alloc(16 * MIB + 1 - Buffer.byteLength(text), 0x20);
      const over = { body: Buffer.concat([Buffer.from(text), filler]), contentType: JSON_TYPE };
      expect(await failure({ [urlOf(0)]: over })).toBeInstanceOf(BodyTooLargeError);
    });

    it("is not allowed when the answer comes from another host, another path, or by plain http", async () => {
      const answers = [
        "https://evil.example.org/api/search.json",
        "https://gov.uk/api/search.json",
        "https://www.gov.uk.evil.example/api/search.json",
        "https://www.gov.uk/other/search.json",
        "https://www.gov.uk/apix/search.json",
        "http://www.gov.uk/api/search.json",
        "https://user:pass@www.gov.uk/api/search.json",
        "https://www.gov.uk:8443/api/search.json",
      ];
      for (const url of answers) {
        const error = await failure(filesOf(GOOD, { url }));
        expect(error).toBeInstanceOf(FetchError);
        expect((error as FetchError).reason).toBe("not_allowed");
        expect((error as FetchError).message).not.toContain("evil");
        expect((error as FetchError).message).not.toContain("pass");
      }
    });

    it("is read from a redirect that stays under the pin", async () => {
      const snapshot = await downloadOf(
        filesOf(GOOD, { url: "https://www.gov.uk/api/search.json?other=1" }),
      );
      expect(bodyOf(snapshot).rows).toHaveLength(6);
    });

    it("is refused for a type that is not JSON, without a word of what it holds", async () => {
      const error = await failure(filesOf(GOOD, { contentType: "text/html" }));
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).reason).toBe("unsupported_type");
    });

    it("fails as a 304 from the pin does: nothing was sent that a 304 could answer", async () => {
      const notModified: ConnectorFetch = async () => ({ notModified: true, url: urlOf(0) });
      const error = await failureOf(
        ukMhraConnector.download(notModified, {
          etag: `k${ukMhraConnector.version}:`,
          lastModified: null,
        }),
      );
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).reason).toBe("unreachable");
    });

    it("fails as not allowed for a 304 from another host", async () => {
      const notModified: ConnectorFetch = async () => ({
        notModified: true,
        url: "https://evil.example.org/api/search.json",
      });
      const error = await failureOf(ukMhraConnector.download(notModified, {}));
      expect((error as FetchError).reason).toBe("not_allowed");
    });

    const twoPages = (): ListDoc[] => [
      ...GOOD,
      ...Array.from({ length: 1_000 }, (_, at) => ({
        title: "Field Safety Notices",
        link: slug(`example-more-${at}`),
        issued: "2026-01-12",
        blocks: [] as string[],
      })),
    ];

    it("gives no list when the second page fails, however the first one was: never a shorter list", async () => {
      const inner = fakeFetch(filesOf(twoPages()));
      const asked: string[] = [];
      const failing: ConnectorFetch = async (url, validators, limits) => {
        asked.push(url);
        if (url === urlOf(1000))
          throw new FetchError("blocked_by_site", undefined, { status: 429 });
        return inner(url, validators, limits);
      };
      const error = await failureOf(
        createUkMhraConnector({ sleep: sleeping() }).download(failing, {}),
      );
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).status).toBe(429);
      expect(asked).toEqual([urlOf(0), urlOf(1000)]);
    });

    it("gives no list when the second page is missing", async () => {
      const files = filesOf(twoPages());
      delete files[urlOf(1000)];
      const error = await failureOf(
        createUkMhraConnector({ sleep: sleeping() }).download(fakeFetch(files), {}),
      );
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).reason).toBe("unreachable");
    });

    it("gives no list when the second page is cut at its limit", async () => {
      const files = filesOf(twoPages());
      files[urlOf(1000)] = { ...files[urlOf(1000)], truncated: true };
      const error = await failureOf(
        createUkMhraConnector({ sleep: sleeping() }).download(fakeFetch(files), {}),
      );
      expect(error).toBeInstanceOf(BodyTooLargeError);
    });

    it("gives no list when the second page is not the one that was asked: a search that moved", async () => {
      const docs = twoPages();
      const files = filesOf(docs);
      files[urlOf(1000)] = {
        body: pageText(docs.slice(1000).map(resultOf), docs.length, 0),
        contentType: JSON_TYPE,
      };
      const error = await failureOf(
        createUkMhraConnector({ sleep: sleeping() }).download(fakeFetch(files), {}),
      );
      expect(error).toBeInstanceOf(NotTheListError);
    });

    it("writes nothing to the console", async () => {
      const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
        jest.spyOn(console, method).mockImplementation(() => undefined),
      );
      try {
        await failure(filesOf(GOOD, { url: "https://evil.example.org/api/search.json" }));
        await runOf(GOOD);
        for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
    });
  });

  describe("a list that does not hold its own copy", () => {
    it("gives the same body whatever the order of the lists, so that the hash of the sync tells that nothing changed", async () => {
      await expectDeterministic(ukMhraConnector, (reversed) =>
        fakeFetch(filesOf(reversed ? [...GOOD].reverse() : GOOD)),
      );
    });

    it("gives the same body for the lists of a manufacturer that name a reference on the same day, in any order", async () => {
      const make = (name: string, product: string) =>
        list("Field Safety Notices: 5 March to 9 March 2025", slug(name), "2025-03-12", [
          { maker: "Examplemed Inc", product, reference: refOf(210) },
          { maker: "Examplemed Ltd", product: `${product} B`, reference: refOf(211) },
        ]);
      const lists = [
        make("example-b", "Pump B"),
        make("example-a", "Pump A"),
        make("example-c", "Pump C"),
      ];
      await expectDeterministic(ukMhraConnector, (reversed) =>
        fakeFetch(filesOf(reversed ? [...lists].reverse() : lists)),
      );
    });

    it("gives the same body for the same lists, again", async () => {
      const first = await runOf(GOOD);
      const second = await runOf(GOOD);
      expect(second.snapshot.bodies).toEqual(first.snapshot.bodies);
      expect(second.snapshot.bytes).toBe(first.snapshot.bytes);
    });

    it("counts the bytes of the pages that it downloaded", async () => {
      const files = filesOf(GOOD);
      const snapshot = await downloadOf(files);
      expect(snapshot.bytes).toBe(Buffer.byteLength(files[urlOf(0)].body as string));
    });
  });

  describe("what never reaches a snapshot or a record", () => {
    it("leaves out the model, batch and description lines, the overview, the lines that are not entries and every field of the result but the four that are read", async () => {
      const { parsed, snapshot } = await runOf([
        ...GOOD,
        oneList(
          [
            {
              maker: "Examplemed",
              product: "Example Pump",
              reference: "41295467 2026/010/009/601/195",
            },
          ],
          {
            extra: {
              description: LEFT_OUT.field,
              format: LEFT_OUT.field,
              content_store_document_type: LEFT_OUT.field,
            },
          },
        ),
      ]);
      const everything = `${snapshot.bodies.join("")}${JSON.stringify(parsed)}`;
      expect(everything).not.toContain("ZZ-");
      expect(everything).toContain("Examplemed");
      expect(everything).toContain("Example Pump");
      expect(everything).not.toContain("41295467");
    });

    it("writes into the body the manufacturers only, and their notices' products, references, days and links", async () => {
      const { snapshot } = await runOf(GOOD);
      const [row] = bodyOf(snapshot).rows;
      expect(Object.keys(row).sort()).toEqual([
        "byYear",
        "count",
        "displayName",
        "firstYear",
        "items",
        "key",
        "newest",
        "spellings",
      ]);
      expect(Object.keys(row.items[0]).sort()).toEqual(["link", "listed", "product", "reference"]);
    });
  });

  describe("a list that cannot be read", () => {
    const withNoText = (link: string) => ({
      ...resultOf(oneList([])),
      link,
      indexable_content: undefined,
    });

    it("is counted, and the lists are read without it while the count is within what a list may lose", async () => {
      const results = [
        ...[
          oneList(MANY.slice(0, 7)),
          list(
            "Field Safety Notices: 2 February to 6 February 2026",
            slug("example-second"),
            "2026-02-09",
            MANY.slice(7),
          ),
        ].map(resultOf),
        withNoText(slug("example-bad-1")),
        withNoText(slug("example-bad-2")),
      ];
      const { parsed, snapshot } = await (async () => {
        const made = await downloadOf(filesOfResults(results));
        return { snapshot: made, parsed: ukMhraConnector.parse(made) };
      })();
      expect(bodyOf(snapshot).unreadable).toBe(2);
      expect(parsed.skipped).toBe(2);
      expect(parsed.errors).toBe(0);
      expect(parsed.records).toHaveLength(14);
    });

    it("fails the sync when more are lost than a list may lose: the shape of the lists has changed", async () => {
      const results = [
        ...[
          oneList(MANY.slice(0, 7)),
          list(
            "Field Safety Notices: 2 February to 6 February 2026",
            slug("example-second"),
            "2026-02-09",
            MANY.slice(7),
          ),
        ].map(resultOf),
        ...[1, 2, 3, 4].map((at) => withNoText(slug(`example-bad-${at}`))),
      ];
      const made = await downloadOf(filesOfResults(results));
      const parsed = ukMhraConnector.parse(made);
      expect(parsed.errors).toBe(4);
      expect(parsed.skipped).toBe(0);
    });

    it.each<[string, unknown]>([
      ["no text", undefined],
      ["null", null],
      ["a number", 7],
      ["an object", { text: "x" }],
      ["a list of text", ["x"]],
    ])("is a list whose page text is %s", async (_what, content) => {
      const results = [
        ...GOOD.map(resultOf),
        {
          ...resultOf(oneList([{ maker: "Examplemed", product: "P", reference: refOf(1) }])),
          link: slug("example-content"),
          indexable_content: content,
        },
      ];
      const snapshot = await downloadOf(filesOfResults(results));
      expect(bodyOf(snapshot).unreadable).toBe(1);
      expect(bodyOf(snapshot).rows.map((row) => row.key)).not.toContain("examplemed");
    });

    it("is a list whose link is not a page of the drug and device alerts, is too long, or is not clean: its entries are not read", async () => {
      const entries = [{ maker: "Examplemed", product: "P", reference: refOf(1) }];
      for (const link of [
        "/government/news/example-list",
        "/drug-device-alerts",
        "/drug-device-alerts/",
        slug("a".repeat(300)),
        // One more than the longest link that is read.
        slug("a".repeat(301 - slug("").length)),
        slug("example bad"),
        slug(`example${cp(0x07)}bad`),
        slug(`example${cp(0x200b)}bad`),
        slug(`example${cp(0xd800)}bad`),
      ]) {
        const snapshot = await downloadOf(
          filesOfResults([...GOOD.map(resultOf), resultOf(oneList(entries, { link }))]),
        );
        expect(bodyOf(snapshot).unreadable).toBe(1);
        expect(bodyOf(snapshot).rows.map((row) => row.key)).not.toContain("examplemed");
      }
      // A link of 300 characters is the longest that is read.
      const longest = `${"/drug-device-alerts/"}${"a".repeat(300 - "/drug-device-alerts/".length)}`;
      expect(longest).toHaveLength(300);
      const snapshot = await downloadOf(
        filesOfResults([...GOOD.map(resultOf), resultOf(oneList(entries, { link: longest }))]),
      );
      expect(bodyOf(snapshot).unreadable).toBe(0);
      expect(rowOfKey(snapshot, "examplemed").items[0].link).toBe(longest);
    });

    it("is a list that holds more than 1,000 reference lines: it is no weekly list, and none of its entries is read", async () => {
      const blocks = Array.from({ length: 1_001 }, (_, at) => [
        `Overmed${at}: Pump`,
        `MHRA reference: ${refOf(at)}`,
      ]).flat();
      const snapshot = await downloadOf(
        filesOf([
          ...GOOD,
          {
            title: "Field Safety Notices",
            link: slug("example-over"),
            issued: "2026-01-12",
            blocks,
          },
        ]),
      );
      expect(bodyOf(snapshot).unreadable).toBe(1);
      expect(
        bodyOf(snapshot)
          .rows.map((row) => row.key)
          .filter((key) => key.startsWith("overmed")),
      ).toEqual([]);
    });

    it("is a list whose text is longer than 100,000 characters: it is no weekly list, none of its entries is read, and it is counted", async () => {
      const textOf = (length: number): string => {
        const head = "Overmed: Over Pump";
        const reference = `MHRA reference: ${refOf(1)}`;
        return `${head}\n\n${"x".repeat(length - head.length - reference.length - 4)}\n\n${reference}`;
      };
      const doc = (length: number): ListDoc => ({
        title: "Field Safety Notices",
        link: slug("example-over"),
        issued: "2026-01-12",
        blocks: [],
        text: textOf(length),
      });
      // At the limit it is read, whole.
      const atLimit = await downloadOf(filesOf([...GOOD, doc(100_000)]));
      expect(bodyOf(atLimit).unreadable).toBe(0);
      expect(bodyOf(atLimit).rows.map((row) => row.key)).toContain("overmed");
      // One character more, and nothing of it is read: not the entry before the limit either.
      const over = await downloadOf(filesOf([...GOOD, doc(100_001)]));
      expect(bodyOf(over).unreadable).toBe(1);
      expect(bodyOf(over).rows.map((row) => row.key)).not.toContain("overmed");
      expect(bodyOf(over).rows).toHaveLength(6);
    });

    it("leaves what a list may lose to the kit's allowance when lists are over the text limit: a few are lost, many fail the sync", async () => {
      const lists = [
        oneList(MANY.slice(0, 7)),
        list(
          "Field Safety Notices: 2 February to 6 February 2026",
          slug("example-second"),
          "2026-02-09",
          MANY.slice(7),
        ),
      ];
      const overs = (count: number): ListDoc[] =>
        Array.from({ length: count }, (_, at) => ({
          title: "Field Safety Notices",
          link: slug(`example-over-${at}`),
          issued: "2026-01-12",
          blocks: [],
          text: "x".repeat(100_001),
        }));
      const few = ukMhraConnector.parse(await downloadOf(filesOf([...lists, ...overs(1)])));
      expect(few.skipped).toBe(1);
      expect(few.errors).toBe(0);
      expect(few.records).toHaveLength(14);
      const many = ukMhraConnector.parse(await downloadOf(filesOf([...lists, ...overs(4)])));
      expect(many.errors).toBe(4);
      expect(many.skipped).toBe(0);
    });

    it("is not counted when it holds no entry, or entries without a heading: that is a list as any other", async () => {
      const { snapshot } = await runOf([
        ...GOOD,
        {
          title: "Field Safety Notices",
          link: slug("example-none"),
          issued: "2026-01-12",
          blocks: INTRO,
        },
        {
          title: "Field Safety Notices",
          link: slug("example-letters"),
          issued: "2026-01-12",
          blocks: ["Letter A", `MHRA reference: ${refOf(1)}`],
        },
      ]);
      expect(bodyOf(snapshot).unreadable).toBe(0);
    });
  });

  describe("an entry of the list that the record builder refuses", () => {
    // A quote is clean to the reader of the list and no character of an address that the builder stores.
    const bad = (count: number): ListDoc[] =>
      Array.from({ length: count }, (_, at) =>
        list(
          "Field Safety Notices: 5 March to 9 March 2025",
          `/drug-device-alerts/example"bad-${at}`,
          "2025-03-12",
          [
            {
              maker: `Winterbourne${"I".repeat(at + 1)} Example`,
              product: "P",
              reference: refOf(900 + at),
            },
          ],
        ),
      );

    it("is counted as skipped while the count is within the allowance, and as an error beyond it", async () => {
      const lists = [
        oneList(MANY.slice(0, 7)),
        list(
          "Field Safety Notices: 2 February to 6 February 2026",
          slug("example-second"),
          "2026-02-09",
          MANY.slice(7),
        ),
      ];
      const some = await runOf([...lists, ...bad(2)]);
      expect(bodyOf(some.snapshot).unreadable).toBe(0);
      expect(bodyOf(some.snapshot).rows).toHaveLength(16);
      expect(some.parsed.skipped).toBe(2);
      expect(some.parsed.errors).toBe(0);
      expect(some.parsed.records).toHaveLength(14);

      const many = await runOf([...lists, ...bad(4)]);
      expect(many.parsed.errors).toBe(4);
      expect(many.parsed.skipped).toBe(0);
    });

    it("is counted for a row of the body that holds no notice, which no download makes", () => {
      const row = (key: string) => ({
        key,
        displayName: `Example ${key}`,
        spellings: [`Example ${key}`],
        count: 1,
        firstYear: 2025,
        byYear: [[2025, 1]],
        items: [{ product: "P", reference: "1111111", listed: "2025-03-12", link: slug(key) }],
        newest: "2025-03-12",
      });
      const rows = Array.from({ length: 20 }, (_, at) => row(`manufacturernumber${at}`));
      const make = (list: unknown[]) =>
        ukMhraConnector.parse({
          bodies: [JSON.stringify({ v: 1, rows: list, total: list.length, unreadable: 0 })],
          etag: null,
          lastModified: null,
          bytes: 0,
        });
      expect(make(rows)).toMatchObject({ errors: 0, skipped: 0 });
      expect(make(rows).records).toHaveLength(20);
      const empty = make([...rows, { ...row("manufacturerwithnonotice"), items: [], count: 0 }]);
      expect(empty.records).toHaveLength(20);
      expect(empty.skipped).toBe(1);
      expect(empty.errors).toBe(0);
    });
  });

  describe("a text that is hostile", () => {
    const hostile = async (maker: string, product = "Example Pump") =>
      runOf([oneList([{ maker, product, reference: refOf(950) }]), ...GOOD]);

    it("loses its control characters, the characters nobody sees and the direction marks", async () => {
      const { parsed, snapshot } = await hostile(
        `Winterbourne${cp(0x07)} Example${cp(0)} ${cp(0x202e)}Devices${cp(0x200b, 0xfeff)}`,
        `Pump${cp(0x07)}${cp(0x202e)} Set${cp(0x200b)}`,
      );
      const record = recordOfId(parsed, "mhra-fsn:winterbourneexampledevices");
      expect(record.summary).toContain("Manufacturer as written: Winterbourne Example Devices.");
      expect(record.summary).toContain("Newest: Pump Set (listed");
      expect(record.title).toBe("MHRA field safety notices: Winterbourne Example Devices");
      expectWellFormedRecords(parsed.records, { sourceId: "uk_mhra", mark: MARK });
      // JSON writes a control character as an escape, but a hidden character of any kind would show as it is.
      expect(snapshot.bodies[0]).not.toMatch(/[\p{Cc}\p{Cf}]/u);
    });

    it("is no manufacturer when it holds markup: no record names the script", async () => {
      const { parsed, snapshot } = await hostile("<script>alert(1)</script> Winterbourne");
      expect(JSON.stringify(parsed.records)).not.toContain("script");
      expect(snapshot.bodies[0]).not.toContain("script");
      expect(bodyOf(snapshot).rows).toHaveLength(6);
      expectWellFormedRecords(parsed.records, { sourceId: "uk_mhra", mark: MARK });
    });

    it("is a product that holds markup: the record shows it with the quotation marks that look like angle brackets", async () => {
      const { parsed } = await hostile("Winterbourne Example", "<script>alert(1)</script> Pump");
      const record = recordOfId(parsed, "mhra-fsn:winterbourneexample");
      expect(record.summary).not.toMatch(/[<>]/);
      expect(record.summary).toContain(
        `${cp(0x2039)}script${cp(0x203a)}alert(1)${cp(0x2039)}/script${cp(0x203a)} Pump`,
      );
      expectWellFormedRecords(parsed.records, { sourceId: "uk_mhra", mark: MARK });
    });

    it("is a manufacturer whose markup is written in the full-width forms that a fold makes angle brackets: no manufacturer", async () => {
      const { snapshot } = await hostile(`${cp(0xff1c)}script${cp(0xff1e)} Winterbourne`);
      expect(bodyOf(snapshot).rows).toHaveLength(6);
    });

    it("is replaced where a half of a surrogate pair stands alone", async () => {
      const { parsed, snapshot } = await hostile(
        `Winterbourne ${cp(0xd800)} Example`,
        `Pump ${cp(0xdc00)} Set`,
      );
      expect(parsed.records.length).toBeGreaterThan(6);
      expectWellFormedRecords(parsed.records, { sourceId: "uk_mhra", mark: MARK });
      expect(snapshot.bodies[0]).not.toMatch(/[\ud800-\udfff]/u);
    });

    it("is no heading when its manufacturer is 50 KB long, and the entry has no row", async () => {
      const { snapshot } = await hostile("W".repeat(50_000));
      expect(bodyOf(snapshot).rows).toHaveLength(6);
      expect(bodyOf(snapshot).unreadable).toBe(0);
      expect(snapshot.bytes).toBeGreaterThan(50_000);
      expect(snapshot.bodies[0].length).toBeLessThan(20_000);
    });

    it("is a product of 90 KB: it is cut to 80 characters, with the mark of a cut", async () => {
      const { snapshot } = await hostile("Winterbourne Example", "p".repeat(90_000));
      const [item] = rowOfKey(snapshot, "winterbourneexample").items;
      expect(item.product).toBe(`${"p".repeat(68)} [shortened]`);
      expect(snapshot.bodies[0].length).toBeLessThan(20_000);
    });

    it("is an unreadable list when the heading is so long that the text is over the limit", async () => {
      const { snapshot } = await hostile("Winterbourne Example", "p".repeat(100_000));
      expect(bodyOf(snapshot).rows.map((row) => row.key)).not.toContain("winterbourneexample");
      expect(bodyOf(snapshot).unreadable).toBe(1);
    });

    it("is a manufacturer of only blanks and hidden characters: no row", async () => {
      const { snapshot } = await hostile(`${cp(0x200b)}   ${cp(0x2800)}`);
      expect(bodyOf(snapshot).rows).toHaveLength(6);
    });

    it("keeps the full-width letters as the letters they fold to", async () => {
      const { parsed } = await hostile(`${cp(0xff37, 0xff49, 0xff4e)}terbourne Example`);
      expect(idsOf(parsed)).toContain("mhra-fsn:winterbourneexample");
    });

    it("cannot make the overview, a description or a model line a manufacturer: only the heading before a reference line is read", async () => {
      const blocks = [
        "Overview",
        "Not a heading, because it has no colon",
        `Model: ${LEFT_OUT.model}`,
        `Batch: ${LEFT_OUT.batch}`,
        `Description of the notice, with a colon after more than eighty characters: ${"x".repeat(90)}: ${LEFT_OUT.description}`,
      ];
      const { snapshot } = await runOf([
        {
          title: "Field Safety Notices",
          link: slug("example-lines"),
          issued: "2026-01-12",
          blocks,
        },
        ...GOOD,
      ]);
      expect(bodyOf(snapshot).rows).toHaveLength(6);
      expect(snapshot.bodies[0]).not.toContain("ZZ-");
    });
  });

  describe("the worst case of a record", () => {
    // A manufacturer of the longest name that a heading can hold (80 characters), a product of 80, and notices in many years.
    const WORST_MAKER = `${"W".repeat(76)} Inc`;
    const worstEntries = (): ListDoc[] =>
      [2026, 2025, 2024, 2023, 2022, 2021].map((year, at) =>
        list(
          `Field Safety Notices: 5 March to 9 March ${year}`,
          slug(`example-worst-${year}`),
          `${year}-03-12`,
          [
            {
              maker: WORST_MAKER,
              product: "P".repeat(90),
              reference: `${"r".repeat(30)}${at}${"9".repeat(9)} words`,
            },
          ],
        ),
      );

    it("is within the limit of a summary, whole in its manufacturer and its closing sentence", async () => {
      expect(WORST_MAKER).toHaveLength(80);
      const { parsed } = await runOf([...worstEntries(), ...GOOD]);
      expectWellFormedRecords(parsed.records, { sourceId: "uk_mhra", mark: MARK });
      const record = recordOfId(parsed, `mhra-fsn:${"w".repeat(76)}`);
      expect(record.summary.length).toBeLessThanOrEqual(1_300);
      // The three newest notices are shown whole, which no cap below the column's would allow.
      expect(record.summary.length).toBeGreaterThan(1_000);
      expect(record.summary).toContain("(listed 2024-03-12, MHRA reference ");
      expect(record.summary).toContain(`Manufacturer as written: ${WORST_MAKER}.`);
      expect(record.summary).toContain(S2);
      expect(record.summary.endsWith(CLOSING)).toBe(true);
      expect(record.title).toBe(`MHRA field safety notices: ${WORST_MAKER}`);
      expect(record.summary.match(/ \[shortened\]/g)).toHaveLength(3);
      expect(record.summary).toContain(
        "Notices listed: 6 since 2021; by year of listing: 2026: 1, 2025: 1, 2024: 1, 2023: 1, 2022: 1.",
      );
    });

    it("keeps every record of a list within the limits of the columns", async () => {
      const { parsed } = await runOf([...worstEntries(), ...GOOD]);
      for (const record of parsed.records) {
        expect(record.summary.length).toBeLessThanOrEqual(1_300);
        expect(record.summary.endsWith(CLOSING)).toBe(true);
        expect(record.title.length).toBeLessThanOrEqual(200);
        expect(record.sourceRecordId.length).toBeLessThanOrEqual(200);
      }
    });

    it("writes the sentences in this order: what the list is, what a notice is, the manufacturer, the counts, the newest, the credit", async () => {
      const { parsed } = await runOf(GOOD);
      for (const record of parsed.records) {
        const at = (text: string): number => record.summary.indexOf(text);
        expect(at(S1)).toBe(0);
        expect(at(S2)).toBeGreaterThan(at(S1));
        expect(at("Manufacturer as written:")).toBeGreaterThan(at(S2));
        expect(at("Notices listed:")).toBeGreaterThan(at("Manufacturer as written:"));
        expect(at("Newest:")).toBeGreaterThan(at("Notices listed:"));
        expect(at(CLOSING)).toBeGreaterThan(at("Newest:"));
      }
    });
  });

  describe("the size of the lists", () => {
    it("is read at the size of the real lists without a blow-up of the time", async () => {
      // 624 weekly lists of about 3 KB: 13 entries each, in the layout of the real text.
      const lists = Array.from({ length: 624 }, (_, at) =>
        list(
          `Field Safety Notices: weekly ${2012 + (at % 14)}`,
          slug(`example-real-${at}`),
          `${2012 + (at % 14)}-03-12`,
          Array.from({ length: 13 }, (_, index) => ({
            maker: `Realmaker${(at * 13 + index) % 2300} Example`,
            product: "Example Product Name",
            reference: refOf(at * 13 + index),
          })),
        ),
      );
      const files = filesOf(lists);
      const start = Date.now();
      const snapshot = await downloadOf(files);
      expect(Date.now() - start).toBeLessThan(BLOW_UP_MS);
      expect(bodyOf(snapshot).rows.length).toBeGreaterThan(2_000);
    }, 30_000);
  });

  describe("the bodies that a snapshot may hold", () => {
    it("writes the record of a stored row as clean text, whatever the row holds", () => {
      const row = {
        key: "hostilemaker",
        displayName: `Hostile${cp(0x07)} ${cp(0x202e)}Maker <b>${"x".repeat(200)}`,
        spellings: ["Hostile Maker"],
        count: 1,
        firstYear: 2025,
        byYear: [[2025, 1]],
        items: [
          {
            product: `Pump${cp(0x07)} <script>${"p".repeat(200)}`,
            reference: `ref${cp(0x200b)}${"r".repeat(100)}`,
            listed: "2025-03-12",
            link: slug("example-hostile"),
          },
        ],
        newest: "2025-03-12",
      };
      const body = JSON.stringify({ v: 1, rows: [row], total: 1, unreadable: 0 });
      const parsed = ukMhraConnector.parse({
        bodies: [body],
        etag: null,
        lastModified: null,
        bytes: 0,
      });
      expect(parsed.errors).toBe(0);
      expect(parsed.records).toHaveLength(1);
      expectWellFormedRecords(parsed.records, { sourceId: "uk_mhra", mark: MARK });
      const [record] = parsed.records;
      const open = cp(0x2039);
      const close = cp(0x203a);
      // The name is cut at 120 characters and the product at 80, each with the mark of a cut.
      expect(record.summary).toContain(
        `Manufacturer as written: Hostile Maker ${open}b${close}${"x".repeat(91)} [shortened].`,
      );
      expect(record.summary).toContain(
        `Pump ${open}script${close}${"p".repeat(55)} [shortened] (listed 2025-03-12, MHRA reference ref${"r".repeat(25)} [shortened])`,
      );
    });

    it("is no list when the body is not the one that a download made", () => {
      for (const body of ["not json", "{}", '{"v":2,"rows":[],"total":0,"unreadable":0}', "[]"]) {
        const parsed = ukMhraConnector.parse({
          bodies: [body],
          etag: null,
          lastModified: null,
          bytes: 0,
        });
        expect(parsed.root).toBeNull();
        expect(parsed.errors).toBe(1);
      }
      expect(
        ukMhraConnector.parse({ bodies: [], etag: null, lastModified: null, bytes: 0 }).root,
      ).toBeNull();
    });
  });
});
