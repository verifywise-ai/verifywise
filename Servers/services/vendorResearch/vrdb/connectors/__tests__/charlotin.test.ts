/**
 * The AI Hallucination Cases database as a mirrored list of the vendor risk database
 * (connectors/charlotin.ts): one CSV export of court decisions, read into one record per AI tool
 * that the decisions name. The files are synthetic: they copy the shape of the real export (the 19
 * columns in order, CRLF line ends, quoted cells that hold line breaks, commas and doubled quotes,
 * the placeholders of the tool column) with every case, court, name, tool and date invented. A
 * field that the connector must leave out holds a token that starts with `ZZ-`, so that a copy of
 * it anywhere in a snapshot or a record is found. Every character that is hard to type is built
 * with `cp`. Nothing here uses the network: `fakeFetch` answers from the files.
 */
import { FetchError } from "../../../../webResearch/guardedFetch";
import type { ParsedRecord } from "../../types";
import { CHARLOTIN_RECORD_MARK, charlotinConnector } from "../charlotin";
import { LINE_INPUT_MAX, SHORTENED, lineOf } from "../kit/clean";
import { RECORD_SUMMARY_MAX } from "../kit/record";
import { BodyTooLargeError, NotTheListError, type ParseResult, type Snapshot } from "../types";
import {
  type FakeFile,
  expectDeterministic,
  expectWellFormedRecords,
  fakeFetch,
} from "./helpers/kitContract";

jest.setTimeout(30_000);

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

const MARK = CHARLOTIN_RECORD_MARK;
const FILE_URL = "https://www.damiencharlotin.com/hallucinations/hallucinations/download.csv";
const RECORD_URL = "https://www.damiencharlotin.com/hallucinations/?tool=";
const MIB = 1024 * 1024;

/**
 * Cells that are too long for a cap of 200 units, and that `lineOf(cell, 201)` cuts to a line of
 * 200 units that ends in the marker, so that a length test on that line passes them as whole. The
 * first has a blank at its 189th unit (the cut takes it off); the second a pair of surrogates at
 * its 189th and 190th (the cut never splits a pair).
 */
const BLANK_AT_THE_CUT = `abcd${" abc".repeat(60)}`;
const PAIR_AT_THE_CUT = `abcd${" abc".repeat(46)}${cp(0x1f600)}${" abc".repeat(15)}`;

/**
 * Explanations of a dispute that are too long for a cap of 300 units, and that `lineOf(text, 301)` cuts
 * to a line of 300 units that ends in the marker, so that a length test on that line passes them as
 * whole. Both name the tool in their first words. The first has a blank at its 289th unit (the cut
 * takes it off); the second a pair of surrogates at its 289th and 290th (the cut never splits a pair).
 */
const BLANK_AT_THE_300_CUT = `Zorbbot ${"a".repeat(280)} ${"a".repeat(100)}`;
const PAIR_AT_THE_300_CUT = `Zorbbot ${"a".repeat(280)}${cp(0x1f600)}${"a".repeat(100)}`;

const COLUMNS = [
  "case_id",
  "Case Name",
  "Court",
  "State(s)",
  "Date",
  "Party(ies)",
  "AI Tool",
  "Hallucination Items",
  "Outcome",
  "Monetary Penalty",
  "Professional Sanction",
  "Alleged",
  "Vendor Disputed",
  "Vendor Disputed Explanation",
  "Pointer",
  "Source",
  "Details",
  "Legal Field Primary",
  "Legal Field Secondary",
] as const;

type Column = (typeof COLUMNS)[number];

/** The columns that the connector reads: a file without one of them is not the list. */
const USED: readonly Column[] = [
  "State(s)",
  "Date",
  "Party(ies)",
  "AI Tool",
  "Alleged",
  "Vendor Disputed",
  "Vendor Disputed Explanation",
];

/** The columns that no record may show: each holds a `ZZ-` token in every row. */
const LEFT_OUT = {
  caseId: "ZZ-CASE-ID",
  caseName: "ZZ-CASE-NAME",
  court: "ZZ-COURT",
  items: "ZZ-ITEMS",
  outcome: "ZZ-OUTCOME",
  penalty: "ZZ-PENALTY",
  pointer: "ZZ-POINTER",
  source: "ZZ-SOURCE",
  details: "ZZ-DETAILS",
  fieldOne: "ZZ-FIELD-ONE",
  fieldTwo: "ZZ-FIELD-TWO",
};

/** A row of the export: the cells by the name of their column; the rest is what a row holds by default. */
function rowOf(over: Partial<Record<Column, string>> = {}): string[] {
  const cells: Record<Column, string> = {
    case_id: LEFT_OUT.caseId,
    "Case Name": LEFT_OUT.caseName,
    Court: LEFT_OUT.court,
    "State(s)": "Freedonia",
    Date: "2025-03-04",
    "Party(ies)": "Lawyer",
    "AI Tool": "Implied",
    "Hallucination Items": LEFT_OUT.items,
    Outcome: LEFT_OUT.outcome,
    "Monetary Penalty": LEFT_OUT.penalty,
    "Professional Sanction": "No",
    Alleged: "No",
    "Vendor Disputed": "No",
    "Vendor Disputed Explanation": "",
    Pointer: LEFT_OUT.pointer,
    Source: LEFT_OUT.source,
    Details: LEFT_OUT.details,
    "Legal Field Primary": LEFT_OUT.fieldOne,
    "Legal Field Secondary": LEFT_OUT.fieldTwo,
  };
  return COLUMNS.map((column) => over[column] ?? cells[column]);
}

const quote = (cell: string): string =>
  /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;

/** The export as a text: the header, the rows, a line end after each, quoted as a CSV writer quotes. */
const csvOf = (
  rows: ReadonlyArray<readonly string[]>,
  header: readonly string[] = COLUMNS,
  eol = "\r\n",
): string => `${[header, ...rows].map((row) => row.map(quote).join(",")).join(eol)}${eol}`;

/** The day `offset` days after the first of January 2025, wrapping at a year: no row of the filler is later. */
const dayAt = (offset: number): string =>
  new Date(Date.UTC(2025, 0, 1 + (offset % 365))).toISOString().slice(0, 10);

/** Rows that name no tool: the file is as long as the real one is, and its newest day is in 2025. */
const fillerRows = (count: number): string[][] =>
  Array.from({ length: count }, (_, at) => rowOf({ Date: dayAt(at) }));

/** The floor of the list is 1,500 rows. */
const FILLER = fillerRows(1_600);

const downloadOf = async (
  body: string | Buffer,
  over: Partial<FakeFile> = {},
): Promise<Snapshot> => {
  const fetch = fakeFetch({ [FILE_URL]: { body, contentType: "text/csv", ...over } });
  const result = await charlotinConnector.download(fetch, {});
  if (result === "unchanged") throw new Error("The fake fetch answered 304 to a first request.");
  return result;
};

/** The failure of a promise, or undefined when it did not fail. */
const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

interface Run {
  snapshot: Snapshot;
  parsed: ParseResult;
}

/** The rows, behind the filler, through the whole path: download, then parse. */
async function runOf(
  rows: ReadonlyArray<readonly string[]>,
  options: { eol?: string; header?: readonly string[] } = {},
): Promise<Run> {
  const snapshot = await downloadOf(csvOf([...rows, ...FILLER], options.header, options.eol));
  return { snapshot, parsed: charlotinConnector.parse(snapshot) };
}

const idsOf = (parsed: ParseResult): string[] =>
  parsed.records.map((record) => record.sourceRecordId).sort();

const recordOfId = (parsed: ParseResult, id: string): ParsedRecord => {
  const record = parsed.records.find((candidate) => candidate.sourceRecordId === id);
  if (record === undefined) throw new Error(`No record has the id ${id}.`);
  return record;
};

/** The tool keys that the AI Tool cell gives, through the whole path. */
const keysOfCell = async (cell: string): Promise<string[]> =>
  idsOf((await runOf([rowOf({ "AI Tool": cell })])).parsed);

interface BodyRow {
  id: string;
  display: string;
  names: string[];
  decisions: number;
  first: string;
  last: string;
  anchorYear: number;
  byYear: number[];
  roles: { lawyers: number; selfRepresented: number; others: number };
  countries: Array<[string, number]>;
  disputed: number;
}

const bodyRowsOf = (snapshot: Snapshot): BodyRow[] =>
  (JSON.parse(snapshot.bodies[0]) as { rows: BodyRow[] }).rows;

/** The tools of a list of many entities: an allowance of ten rows that do not parse needs about a hundred rows. */
const manyTools = (count: number): string[][] =>
  Array.from({ length: count }, (_, at) =>
    rowOf({ "AI Tool": `Bot${String(at).padStart(4, "0")}`, Date: dayAt(at) }),
  );

const SENTENCE_TWO =
  "Each entry is a court decision that addressed false or fabricated content in a filing and names the AI tool used; the database notes that naming a tool does not show that the tool caused the error, and an entry is not a finding about the tool's maker.";
const CLOSING =
  "A decision that names several tools counts for each. Counted by VerifyWise from the published CSV; AI Hallucination Cases Database, Damien Charlotin, CC BY 4.0.";

describe("charlotinConnector", () => {
  describe("the connector", () => {
    it("is the connector of the list, in the snapshot form, with the mark of its records", () => {
      expect(charlotinConnector.id).toBe("charlotin");
      expect(charlotinConnector.kind).toBeUndefined();
      expect(Number.isInteger(charlotinConnector.version)).toBe(true);
      expect(charlotinConnector.version).toBeGreaterThanOrEqual(1);
      expect(MARK).toBe("AI Hallucination Cases database");
    });

    it("asks for the one export, as a CSV, within the limits of the list", async () => {
      const fetch = fakeFetch({
        [FILE_URL]: { body: csvOf([...FILLER]), contentType: "text/csv" },
      });
      await charlotinConnector.download(fetch, {});
      expect(fetch.calls).toHaveLength(1);
      expect(fetch.calls[0].url).toBe(FILE_URL);
      expect(fetch.calls[0].limits).toEqual({
        maxBytes: 16 * MIB,
        allowedContentTypes: ["text/csv"],
        totalTimeoutMs: 120_000,
      });
    });
  });

  describe("a file in the real shape", () => {
    it("is read into one record per tool, with the 19 columns in order, CRLF and quoted cells", async () => {
      const rows = [
        rowOf({
          "AI Tool": '"Alpha1" and Beta22',
          "State(s)": "Freedonia;\r\nAtlantis",
          Date: "2026-02-03",
          "Case Name": `${LEFT_OUT.caseName}, "quoted"\r\nand broken`,
          Details: `${LEFT_OUT.details} with a comma, a "quote" and\r\na line break`,
        }),
        rowOf({ "AI Tool": "Alpha1", Date: "2026-04-05", "Party(ies)": "Pro Se Litigant" }),
      ];
      const { snapshot, parsed } = await runOf(rows);

      expect(parsed.root).not.toBeNull();
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
      expect(idsOf(parsed)).toEqual(["alpha1", "beta22"]);
      expect(recordOfId(parsed, "alpha1").identifiers).toMatchObject({
        tool: "Alpha1",
        decisions: 2,
        first: "2026-02-03",
        last: "2026-04-05",
      });
      expect(recordOfId(parsed, "beta22").identifiers).toMatchObject({ decisions: 1 });
      expect(snapshot.etag).not.toBeNull();
      expectWellFormedRecords(parsed.records, { sourceId: "charlotin", mark: MARK });
    });

    it("reads the same file with LF line ends, a missing last line break and a byte order mark", async () => {
      const rows = [rowOf({ "AI Tool": "Alpha1" })];
      const crlf = await runOf(rows);
      const lf = await runOf(rows, { eol: "\n" });
      expect(lf.snapshot.bodies).toEqual(crlf.snapshot.bodies);

      const text = csvOf([...rows, ...FILLER]);
      const unterminated = await downloadOf(text.slice(0, -2));
      expect(unterminated.bodies).toEqual(crlf.snapshot.bodies);

      const withMark = await downloadOf(
        Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]),
      );
      expect(withMark.bodies).toEqual(crlf.snapshot.bodies);
    });

    it("accepts a Content-Type with parameters", async () => {
      const snapshot = await downloadOf(csvOf([rowOf({ "AI Tool": "Alpha1" }), ...FILLER]), {
        contentType: "text/csv; charset=utf-8",
      });
      expect(charlotinConnector.parse(snapshot).records).toHaveLength(1);
    });

    it("has a summary that begins with the mark, names the operator and is no finding", async () => {
      const { parsed } = await runOf([rowOf({ "AI Tool": "Alpha1" })]);
      const [record] = parsed.records;
      expect(record.summary.startsWith(MARK)).toBe(true);
      expect(record.summary.startsWith(`${MARK} (damiencharlotin.com), an AI incident list.`)).toBe(
        true,
      );
      expect(record.summary).toContain(SENTENCE_TWO);
      expect(record.summary).toContain("Damien Charlotin, CC BY 4.0");
      expect(record.summary.endsWith(CLOSING)).toBe(true);
      expect(record.recordType).toBe("hallucination_cases");
    });
  });

  describe("the tool cell", () => {
    it.each([
      ["Implied"],
      ["implied"],
      ["IMPLIED"],
      ["  Implied  "],
      ["Implied use of Alpha1"],
      ["Unidentified"],
      ["Unidentified AI tool"],
      ["Unknown"],
      ["unknown (Alpha1)"],
      [""],
      ["   "],
      ["(a note)"],
      ["..."],
      ["-"],
    ])("names no tool when it is %j", async (cell) => {
      expect(await keysOfCell(cell)).toEqual([]);
    });

    it.each<[string, string[]]>([
      ["Alpha1", ["alpha1"]],
      ["AcmeChat, Beta AI and Gamma", ["acmechat", "betaai", "gamma"]],
      ["Gamma or Delta", ["delta", "gamma"]],
      ["Alpha1 AND Beta22", ["alpha1", "beta22"]],
      [
        "Alpha1; Beta22 / Gamma3 + Delta4 & Epsilon5",
        ["alpha1", "beta22", "delta4", "epsilon5", "gamma3"],
      ],
      ["Sandbox Orchard", ["sandboxorchard"]],
      ["Android", ["android"]],
    ])("splits %j into its tools", async (cell, keys) => {
      expect(await keysOfCell(cell)).toEqual(keys);
    });

    it.each<[string, string[]]>([
      ["Acmelaw's AI tools", ["acmelawaitools"]],
      [`Acmelaw${cp(0x2019)}s AI tools`, ["acmelawaitools"]],
      ["Acmelaw's", ["acmelaw"]],
      ["Alpha1 (allegedly)", ["alpha1"]],
      ["Alpha1 (allegedly", ["alpha1"]],
      ["(draft) Alpha1", ["alpha1"]],
      ["Acme(Chat)Bot", ["acmebot"]],
      ["Alpha1 (by Foo, Inc.)", ["alpha1"]],
      ["Internal tool (AcmeChat)", ["internaltool"]],
      ['"Alpha1"', ["alpha1"]],
      ['Acme"Chat', ["acmechat"]],
      [`${cp(0x201c)}Alpha1${cp(0x201d)}`, ["alpha1"]],
      ["with Alpha1", ["alpha1"]],
      ["Alpha1, and Beta22", ["alpha1", "beta22"]],
      ["or Gamma", ["gamma"]],
      ["Andrew, Without, Orbit", ["andrew", "orbit", "without"]],
      ["..Alpha1..", ["alpha1"]],
    ])("cleans a token as the rule says: %j", async (cell, keys) => {
      expect(await keysOfCell(cell)).toEqual(keys);
    });

    it.each([
      ["Lex"],
      ["AI"],
      ["xAI"],
      ["EVE"],
      ["Foo Inc"],
      ["Gen AI"],
      ["Internet searches"],
      ["Google Search"],
      ["GOOGLE SEARCH"],
      ["Other generative AI platforms"],
      ["Other generative AI tools"],
      ["Premium Westlaw subscription"],
    ])("gives no key for %j: too short, or a generic phrase", async (cell) => {
      expect(await keysOfCell(cell)).toEqual([]);
    });

    it("gives a key for a name of four characters, and drops the generic phrase beside a tool", async () => {
      expect(await keysOfCell("Lexi")).toEqual(["lexi"]);
      expect(await keysOfCell("Google Search, Alpha1")).toEqual(["alpha1"]);
    });

    it("keys a name without its legal form, and with it", async () => {
      const { parsed } = await runOf([
        rowOf({ "AI Tool": "AcmeChat Inc." }),
        rowOf({ "AI Tool": "The Zetabot" }),
      ]);
      expect(idsOf(parsed)).toEqual(["acmechat", "zetabot"]);
      expect(recordOfId(parsed, "acmechat").matchKeys.sort()).toEqual([
        "name:acmechat",
        "name:acmechatinc",
      ]);
      expect(recordOfId(parsed, "zetabot").matchKeys.sort()).toEqual([
        "name:thezetabot",
        "name:zetabot",
      ]);
    });

    it("counts a row once for a tool that it names twice, in any spelling", async () => {
      const { parsed } = await runOf([rowOf({ "AI Tool": "AcmeChat, acmechat, ACMECHAT" })]);
      expect(idsOf(parsed)).toEqual(["acmechat"]);
      expect(recordOfId(parsed, "acmechat").identifiers).toMatchObject({ decisions: 1 });
    });

    it("counts a row for each of the tools that it names", async () => {
      const { parsed } = await runOf([
        rowOf({ "AI Tool": "Alpha1, Beta22" }),
        rowOf({ "AI Tool": "Beta22" }),
      ]);
      expect(recordOfId(parsed, "alpha1").identifiers).toMatchObject({ decisions: 1 });
      expect(recordOfId(parsed, "beta22").identifiers).toMatchObject({ decisions: 2 });
    });

    it("folds the compatibility forms and drops the characters nobody sees", async () => {
      expect(await keysOfCell(`${cp(0xff21, 0xff43, 0xff4d, 0xff45)}Chat`)).toEqual(["acmechat"]);
      expect(await keysOfCell(`Acme${cp(0x200b)}Chat`)).toEqual(["acmechat"]);
      expect(await keysOfCell(`Acme${cp(0x07)}Chat`)).toEqual(["acmechat"]);
      expect(await keysOfCell(`Acme${cp(0x202e)}Chat`)).toEqual(["acmechat"]);
      expect(await keysOfCell("Acme\r\nChat")).toEqual(["acmechat"]);
    });

    it("keeps the most frequent spelling as the one shown, ties by the order of the texts", async () => {
      const { parsed } = await runOf([
        rowOf({ "AI Tool": "Acme Chat" }),
        rowOf({ "AI Tool": "AcmeChat" }),
        rowOf({ "AI Tool": "AcmeChat" }),
        rowOf({ "AI Tool": "Zeta Bot" }),
        rowOf({ "AI Tool": "ZetaBot" }),
      ]);
      expect(recordOfId(parsed, "acmechat").identifiers).toMatchObject({ tool: "AcmeChat" });
      // "Zeta Bot" comes before "ZetaBot" in the order of the texts.
      expect(recordOfId(parsed, "zetabot").identifiers).toMatchObject({ tool: "Zeta Bot" });
    });

    it("keeps at most five spellings of a tool for the names of its record", async () => {
      const spellings = [
        "Acmebot",
        "ACMEBOT",
        "Acme-Bot",
        "Acme Bot",
        "acme bot",
        "Acme.bot",
        "AcmeBot",
      ];
      const { snapshot } = await runOf(spellings.map((tool) => rowOf({ "AI Tool": tool })));
      const [row] = bodyRowsOf(snapshot);
      expect(row.names).toHaveLength(5);
      expect(new Set(row.names).size).toBe(5);
    });

    it("refuses a key of more than 160 characters, and keeps one of 160", async () => {
      const keep = "k".repeat(160);
      const { parsed } = await runOf([
        ...manyTools(120),
        rowOf({ "AI Tool": keep }),
        rowOf({ "AI Tool": "j".repeat(161) }),
      ]);
      expect(parsed.records.some((record) => record.sourceRecordId === keep)).toBe(true);
      expect(parsed.records.some((record) => record.sourceRecordId.startsWith("j"))).toBe(false);
      expect(parsed.skipped).toBe(1);
      expect(parsed.errors).toBe(0);
    });

    it("counts a cell too long to be a list of tools as a row that does not read", async () => {
      const { parsed } = await runOf([
        ...manyTools(120),
        rowOf({ "AI Tool": `Alpha1, ${"x".repeat(250)}` }),
      ]);
      expect(parsed.skipped).toBe(1);
      expect(parsed.records.some((record) => record.sourceRecordId === "alpha1")).toBe(false);
    });

    it("has too-long cells that a cut with one unit more would pass as whole: the premise of the next test", () => {
      for (const cell of [BLANK_AT_THE_CUT, PAIR_AT_THE_CUT]) {
        const naive = lineOf(cell, 201);
        expect(cell.length).toBeGreaterThan(201);
        expect(naive.length).toBeLessThanOrEqual(200);
        expect(naive.endsWith(SHORTENED)).toBe(true);
      }
    });

    it.each([
      ["a blank", BLANK_AT_THE_CUT],
      ["a pair of surrogates", PAIR_AT_THE_CUT],
    ])(
      "counts a cell of more than 200 units with %s at the cut as a row that does not read, never as a cut name",
      async (_where, cell) => {
        const { parsed } = await runOf([...manyTools(120), rowOf({ "AI Tool": cell })]);
        expect(parsed.records).toHaveLength(120);
        expect(parsed.skipped).toBe(1);
        expect(parsed.errors).toBe(0);
      },
    );

    it("reads a tool cell of 200 units and not one of 201, however short its key is", async () => {
      // Words of three letters: a cell of 200 units has a key of 151 letters, under the cap of keys.
      const cell = (length: number): string =>
        `abcd${" abc".repeat(49)}${"d".repeat(length - 200)}`;
      expect(cell(200)).toHaveLength(200);
      expect(cell(201)).toHaveLength(201);
      const { parsed } = await runOf([
        ...manyTools(120),
        rowOf({ "AI Tool": cell(200) }),
        rowOf({ "AI Tool": cell(201) }),
      ]);
      expect(parsed.records).toHaveLength(121);
      expect(parsed.skipped).toBe(1);
      expect(parsed.errors).toBe(0);
    });

    it.each([
      ["empty", ""],
      ["blanks", "   "],
      ["only hidden characters", `${cp(0x200b)}${cp(0x200d)}${cp(0xfeff)}`],
    ])(
      "reads a cell that is %s as a row that names no tool, not as one that does not read",
      async (_what, cell) => {
        const { parsed } = await runOf([...manyTools(120), rowOf({ "AI Tool": cell })]);
        expect(parsed.records).toHaveLength(120);
        expect(parsed.skipped).toBe(0);
        expect(parsed.errors).toBe(0);
      },
    );

    it("counts a cell of more than 200 units that starts with a pair of surrogates as a row that does not read, not as an empty one", async () => {
      // A cut to one unit cannot keep a pair, so it would give an empty line for this cell.
      const cell = `${cp(0x1f600)}${" abc".repeat(80)}`;
      expect(cell.length).toBeGreaterThan(200);
      const { parsed } = await runOf([...manyTools(120), rowOf({ "AI Tool": cell })]);
      expect(parsed.records).toHaveLength(120);
      expect(parsed.skipped).toBe(1);
      expect(parsed.errors).toBe(0);
    });

    describe("a cell of more than LINE_INPUT_MAX units", () => {
      /** `blanks` blanks and then a tool: the tool lies beyond the first megabyte when the blanks are enough. */
      const cellAfter = (blanks: number): string => `${" ".repeat(blanks)}Zorb`;

      it("has a cell whose first megabyte is blank that the empty test of a cut to two units reads as empty: the premise of the next tests", () => {
        const cell = cellAfter(LINE_INPUT_MAX);
        expect(cell.length).toBeGreaterThan(LINE_INPUT_MAX);
        // `lineOf` reads only the first LINE_INPUT_MAX units, which are blank, and says nothing of the rest.
        expect(lineOf(cell, 2)).toBe("");
      });

      it("counts a cell of more than LINE_INPUT_MAX units whose first megabyte is blank as a row that does not read, never as one that names no tool", async () => {
        const { snapshot, parsed } = await runOf([
          ...manyTools(120),
          rowOf({ "AI Tool": cellAfter(LINE_INPUT_MAX), Date: "2031-01-01" }),
        ]);
        expect(parsed.records).toHaveLength(120);
        expect(parsed.records.some((record) => record.sourceRecordId === "zorb")).toBe(false);
        expect(parsed.skipped).toBe(1);
        expect(parsed.errors).toBe(0);
        expect((JSON.parse(snapshot.bodies[0]) as { unreadable: number }).unreadable).toBe(1);
        // A row that does not read sets no newest day: the years still count back from the file's own.
        expect(bodyRowsOf(snapshot).every((row) => row.anchorYear === 2025)).toBe(true);
      });

      it("reads a cell of exactly LINE_INPUT_MAX units, and refuses one of a unit more", async () => {
        expect(cellAfter(LINE_INPUT_MAX - 4)).toHaveLength(LINE_INPUT_MAX);
        const whole = await runOf([
          ...manyTools(120),
          rowOf({ "AI Tool": cellAfter(LINE_INPUT_MAX - 4) }),
        ]);
        expect(idsOf(whole.parsed)).toContain("zorb");
        expect(whole.parsed.skipped).toBe(0);

        // One unit more, and the one unit lies beyond a blank first megabyte: nothing of it is read.
        const beyond = `${" ".repeat(LINE_INPUT_MAX)}Z`;
        expect(beyond).toHaveLength(LINE_INPUT_MAX + 1);
        const over = await runOf([...manyTools(120), rowOf({ "AI Tool": beyond })]);
        expect(over.parsed.records).toHaveLength(120);
        expect(over.parsed.skipped).toBe(1);
        expect(over.parsed.errors).toBe(0);

        // One unit more, with the tool straddling the limit: its start is read, so it never reads whole.
        expect(cellAfter(LINE_INPUT_MAX - 3)).toHaveLength(LINE_INPUT_MAX + 1);
        const straddling = await runOf([
          ...manyTools(120),
          rowOf({ "AI Tool": cellAfter(LINE_INPUT_MAX - 3) }),
        ]);
        expect(idsOf(straddling.parsed)).not.toContain("zorb");
        expect(straddling.parsed.skipped).toBe(1);
        expect(straddling.parsed.errors).toBe(0);
      });

      it("counts a cell that is blank beyond LINE_INPUT_MAX units as a row that does not read too: it cannot be known whole", async () => {
        const { parsed } = await runOf([
          ...manyTools(120),
          rowOf({ "AI Tool": " ".repeat(LINE_INPUT_MAX + 1) }),
        ]);
        expect(parsed.records).toHaveLength(120);
        expect(parsed.skipped).toBe(1);
        expect(parsed.errors).toBe(0);
      });
    });
  });

  describe("what a record counts", () => {
    /** A tool with five decisions, on days of four years, in the roles and countries below. */
    const zetabot = (): string[][] => [
      rowOf({
        "AI Tool": "Zetabot",
        Date: "2026-05-01",
        "Party(ies)": "Lawyer",
        "State(s)": "Freedonia",
      }),
      rowOf({
        "AI Tool": "Zetabot",
        Date: "2026-03-02",
        "Party(ies)": "Pro Se Litigant",
        "State(s)": "Freedonia",
      }),
      rowOf({
        "AI Tool": "Zetabot",
        Date: "2025-12-31",
        "Party(ies)": "Judge; Lawyer",
        "State(s)": "Freedonia; Atlantis",
      }),
      rowOf({
        "AI Tool": "Zetabot",
        Date: "2024-01-15",
        "Party(ies)": "Lawyer; Pro Se Litigant",
        "State(s)": "",
      }),
      rowOf({ "AI Tool": "Zetabot", Date: "2022-06-06", "Party(ies)": "", "State(s)": "Atlantis" }),
      // A decision that names no tool: it sets the newest day of the file, which the years count from.
      rowOf({ Date: "2026-07-07" }),
    ];

    it("gives the counts of a tool, and the exact text of its record", async () => {
      const { snapshot, parsed } = await runOf(zetabot());
      const record = recordOfId(parsed, "zetabot");

      expect(bodyRowsOf(snapshot)).toEqual([
        {
          id: "zetabot",
          display: "Zetabot",
          names: ["Zetabot"],
          decisions: 5,
          first: "2022-06-06",
          last: "2026-05-01",
          anchorYear: 2026,
          byYear: [2, 1, 1, 0],
          roles: { lawyers: 2, selfRepresented: 1, others: 2 },
          countries: [
            ["Freedonia", 3],
            ["Atlantis", 2],
            ["not stated", 1],
          ],
          disputed: 0,
        },
      ]);
      expect(record.title).toBe(`${MARK}: Zetabot`);
      expect(record.summary).toBe(
        [
          `${MARK} (damiencharlotin.com), an AI incident list.`,
          SENTENCE_TWO,
          "AI tool as written: Zetabot.",
          "Decisions that name it: 5, dated 2022-06-06 to 2026-05-01.",
          "By year: 2026 2, 2025 1, 2024 1.",
          "Filed by: lawyers 2, self-represented litigants 1, others 2.",
          "Countries: Freedonia 3, Atlantis 2, not stated 1.",
          CLOSING,
        ].join(" "),
      );
      expect(record.url).toBe(`${RECORD_URL}zetabot`);
      expect(record.identifiers).toEqual({
        tool: "Zetabot",
        decisions: 5,
        first: "2022-06-06",
        last: "2026-05-01",
        disputed: 0,
      });
      expect(record.matchKeys).toEqual(["name:zetabot"]);
      expect(record.publishedAt).toBe("2026-05-01");
      expect(record.sourceUpdatedAt).toBeNull();
      expectWellFormedRecords(parsed.records, { sourceId: "charlotin", mark: MARK });
    });

    it("counts the years back from the newest decision of the file, whatever that decision names", async () => {
      const { parsed } = await runOf([
        rowOf({ "AI Tool": "Oldbot", Date: "2025-08-01" }),
        rowOf({ "AI Tool": "Oldbot", Date: "2023-02-02" }),
        rowOf({ "AI Tool": "Ancientbot", Date: "2021-01-01" }),
        rowOf({ Date: "2026-07-07" }),
      ]);
      // 2026 has none of Oldbot's decisions: it is left out, and so is 2024.
      expect(recordOfId(parsed, "oldbot").summary).toContain("By year: 2025 1, 2023 1.");
      // All the years of the window are empty: the sentence is left out.
      expect(recordOfId(parsed, "ancientbot").summary).not.toContain("By year");
    });

    it("sets the year of the file by an alleged decision as well", async () => {
      const { parsed } = await runOf([
        rowOf({ "AI Tool": "Oldbot", Date: "2025-08-01" }),
        rowOf({ "AI Tool": "Allegedbot", Date: "2029-01-01", Alleged: "Yes" }),
      ]);
      // The window is 2029 to 2026, and the only decision of Oldbot is in 2025.
      expect(recordOfId(parsed, "oldbot").summary).not.toContain("By year");
    });

    it.each<[string, string]>([
      ["Lawyer", "Filed by: lawyers 1."],
      ["lawyer", "Filed by: lawyers 1."],
      ["Lawyer; Judge", "Filed by: lawyers 1."],
      ["Lawyer; Pro Se Litigant", "Filed by: lawyers 1."],
      ["Pro Se Litigant", "Filed by: self-represented litigants 1."],
      ["Pro Se Litigant; Lawyer", "Filed by: self-represented litigants 1."],
      ["Judge", "Filed by: others 1."],
      ["Judge; Lawyer", "Filed by: others 1."],
      ["Counsel for the state", "Filed by: others 1."],
      ["Expert", "Filed by: others 1."],
      ["", "Filed by: others 1."],
    ])("puts the role %j in the bucket of its first words", async (party, sentence) => {
      const { parsed } = await runOf([rowOf({ "AI Tool": "Rolebot", "Party(ies)": party })]);
      expect(recordOfId(parsed, "rolebot").summary).toContain(sentence);
    });

    it("counts a country once for a decision, and an empty one as not stated", async () => {
      const { snapshot } = await runOf([
        rowOf({ "AI Tool": "Countrybot", "State(s)": "Freedonia; Freedonia; Atlantis" }),
        rowOf({ "AI Tool": "Countrybot", "State(s)": ";" }),
        rowOf({ "AI Tool": "Countrybot", "State(s)": "Atlantis" }),
      ]);
      const [row] = bodyRowsOf(snapshot);
      expect(row.countries).toEqual([
        ["Atlantis", 2],
        ["Freedonia", 1],
        ["not stated", 1],
      ]);
    });

    it("shows the three countries with the most decisions, ties by the order of the texts", async () => {
      const countries = ["Delta", "Alpha", "Charlie", "Bravo", "Echo"];
      const { snapshot, parsed } = await runOf(
        countries.map((country) => rowOf({ "AI Tool": "Tiebot", "State(s)": country })),
      );
      expect(bodyRowsOf(snapshot)[0].countries).toEqual([
        ["Alpha", 1],
        ["Bravo", 1],
        ["Charlie", 1],
      ]);
      expect(recordOfId(parsed, "tiebot").summary).toContain(
        "Countries: Alpha 1, Bravo 1, Charlie 1.",
      );
    });

    it("attributes a dispute to the tools that the vendor's explanation names, and to no other", async () => {
      const explanation = "Acmelaw says ZZ-EXPLANATION-WORDS were not its output.";
      const { parsed } = await runOf([
        rowOf({
          "AI Tool": "Acmelaw, Acmelaw Precision, Betachat",
          "Vendor Disputed": "Yes",
          "Vendor Disputed Explanation": explanation,
          Date: "2026-01-10",
        }),
        // The explanation names another tool than the one of the row.
        rowOf({
          "AI Tool": "Betachat",
          "Vendor Disputed": "Yes",
          "Vendor Disputed Explanation": explanation,
        }),
        // A dispute without an explanation, and an explanation without a dispute, are attributed to nothing.
        rowOf({
          "AI Tool": "Acmelaw",
          "Vendor Disputed": "Yes",
          "Vendor Disputed Explanation": "",
        }),
        rowOf({
          "AI Tool": "Acmelaw",
          "Vendor Disputed": "No",
          "Vendor Disputed Explanation": explanation,
        }),
        // An alleged decision counts nowhere, a dispute included.
        rowOf({
          "AI Tool": "Acmelaw",
          Alleged: "Yes",
          "Vendor Disputed": "Yes",
          "Vendor Disputed Explanation": explanation,
        }),
      ]);
      const disputed = (id: string): unknown => recordOfId(parsed, id).identifiers.disputed;
      expect(disputed("acmelaw")).toBe(1);
      expect(disputed("acmelawprecision")).toBe(1);
      expect(disputed("betachat")).toBe(0);
      expect(recordOfId(parsed, "acmelaw").identifiers.decisions).toBe(3);
      expect(recordOfId(parsed, "acmelaw").summary).toContain(
        "Decisions that name it: 3, dated 2025-03-04 to 2026-01-10; 1 marked as disputed by a vendor, which said the errors did not come from its tool.",
      );
      expect(recordOfId(parsed, "betachat").summary).not.toContain("disputed");
      // The explanation is read for this test only: no copy of it is kept.
      expect(JSON.stringify(parsed.records)).not.toContain("ZZ-EXPLANATION");
      expect(JSON.stringify(parsed.records)).not.toContain("output");
    });

    it("attributes a dispute by a word of the explanation that is in the key, and by the key in its text", async () => {
      const { parsed } = await runOf([
        rowOf({
          "AI Tool": "Lawbot, Zetawidget",
          "Vendor Disputed": "Yes",
          "Vendor Disputed Explanation": "The Zeta widgets were not used",
        }),
        rowOf({
          "AI Tool": "Lawbot, Zetawidget",
          "Vendor Disputed": "Yes",
          "Vendor Disputed Explanation": "Law bot said so",
        }),
      ]);
      // No word of the first explanation that has five characters is in "zetawidget", but its
      // compact text ("zetawidgets") holds the key; the compact text of the second holds "lawbot".
      expect(recordOfId(parsed, "zetawidget").identifiers.disputed).toBe(1);
      expect(recordOfId(parsed, "lawbot").identifiers.disputed).toBe(1);
    });

    it("does not attribute a dispute by a word of fewer than five letters, even one inside the key", async () => {
      const { parsed } = await runOf([
        rowOf({
          "AI Tool": "Zetawidget",
          "Vendor Disputed": "Yes",
          "Vendor Disputed Explanation": "The Zeta thing was not used",
        }),
      ]);
      // "Zeta" is inside "zetawidget" and has four letters; "thing" has five and is not inside it.
      expect(recordOfId(parsed, "zetawidget").identifiers.disputed).toBe(0);
    });

    describe("the explanation of a dispute is read whole, or not at all", () => {
      /** The identifiers of the record of a tool that a vendor disputed, with `explanation` as its words. */
      const identifiersAfter = async (
        explanation: string,
      ): Promise<ParsedRecord["identifiers"]> => {
        const { parsed } = await runOf([
          rowOf({
            "AI Tool": "Zorbbot",
            "Vendor Disputed": "Yes",
            "Vendor Disputed Explanation": explanation,
          }),
        ]);
        return recordOfId(parsed, "zorbbot").identifiers;
      };

      /** An explanation of `units` units that names the tool at its start, in its middle, or at its end. */
      const PLACED: ReadonlyArray<[string, (units: number) => string]> = [
        ["at its start", (units) => `Zorbbot ${"a".repeat(units - 8)}`],
        [
          "in its middle",
          (units) =>
            `${"a".repeat((units - 9) >> 1)} Zorbbot ${"a".repeat(units - 9 - ((units - 9) >> 1))}`,
        ],
        ["at its end", (units) => `${"a".repeat(units - 8)} Zorbbot`],
      ];

      it.each(PLACED)(
        "reads an explanation of 300 units that names the tool %s whole",
        async (_where, make) => {
          expect(make(300)).toHaveLength(300);
          expect(await identifiersAfter(make(300))).toMatchObject({ disputed: 1, decisions: 1 });
        },
      );

      it.each(PLACED)(
        "marks nothing disputed for an explanation of 301 units that names the tool %s: it does not fit, and a cut text decides nothing",
        async (_where, make) => {
          expect(make(301)).toHaveLength(301);
          expect(await identifiersAfter(make(301))).toMatchObject({ disputed: 0, decisions: 1 });
        },
      );

      it("has explanations that a cut with one unit more would pass as whole: the premise of the next test", () => {
        for (const explanation of [BLANK_AT_THE_300_CUT, PAIR_AT_THE_300_CUT]) {
          const naive = lineOf(explanation, 301);
          expect(explanation.length).toBeGreaterThan(301);
          expect(naive.length).toBeLessThanOrEqual(300);
          expect(naive.endsWith(SHORTENED)).toBe(true);
          expect(naive.startsWith("Zorbbot")).toBe(true);
        }
      });

      it.each([
        ["a blank", BLANK_AT_THE_300_CUT],
        ["a pair of surrogates", PAIR_AT_THE_300_CUT],
      ])(
        "marks nothing disputed for an explanation of more than 300 units with %s at the cut: a cut text decides nothing",
        async (_where, explanation) => {
          expect(await identifiersAfter(explanation)).toMatchObject({ disputed: 0, decisions: 1 });
        },
      );

      it("marks nothing disputed for an explanation of more than LINE_INPUT_MAX units whose first megabyte names the tool, and still counts the row", async () => {
        const explanation = `Zorbbot said no${" ".repeat(LINE_INPUT_MAX)}`;
        expect(explanation.length).toBeGreaterThan(LINE_INPUT_MAX);
        const { parsed } = await runOf([
          ...manyTools(120),
          rowOf({
            "AI Tool": "Zorbbot",
            "Vendor Disputed": "Yes",
            "Vendor Disputed Explanation": explanation,
          }),
        ]);
        expect(recordOfId(parsed, "zorbbot").identifiers).toMatchObject({
          disputed: 0,
          decisions: 1,
        });
        expect(parsed.skipped).toBe(0);
        expect(parsed.errors).toBe(0);
      });

      it.each([
        ["short", "Zorbbot said no"],
        [
          "300 units long, the longest that is read, with the tool at its end",
          `${"a".repeat(292)} Zorbbot`,
        ],
      ])(
        "reads an explanation of exactly LINE_INPUT_MAX units whose clean line is %s: it can be known whole",
        async (_what, text) => {
          const explanation = `${text}${" ".repeat(LINE_INPUT_MAX - text.length)}`;
          expect(explanation).toHaveLength(LINE_INPUT_MAX);
          expect(lineOf(explanation, 300)).toBe(text);
          expect(await identifiersAfter(explanation)).toMatchObject({ disputed: 1, decisions: 1 });
        },
      );

      it("attributes the dispute of a short explanation as before, and a long one to no tool of its row", async () => {
        const { parsed } = await runOf([
          rowOf({
            "AI Tool": "Zorbbot, Quarkchat",
            "Vendor Disputed": "Yes",
            "Vendor Disputed Explanation": "Quarkchat was not used",
          }),
          rowOf({
            "AI Tool": "Zorbbot, Quarkchat",
            "Vendor Disputed": "Yes",
            "Vendor Disputed Explanation": `Quarkchat was not used ${"a".repeat(300)}`,
          }),
        ]);
        expect(recordOfId(parsed, "quarkchat").identifiers).toMatchObject({ disputed: 1 });
        expect(recordOfId(parsed, "zorbbot").identifiers).toMatchObject({ disputed: 0 });
      });
    });

    it("does not count an alleged decision anywhere, and gives no record to a tool that has only those", async () => {
      const { parsed } = await runOf([
        rowOf({ "AI Tool": "Allegedbot", Alleged: "Yes" }),
        rowOf({ "AI Tool": "Mixedbot, Allegedbot", Alleged: "Yes" }),
        rowOf({ "AI Tool": "Mixedbot", Alleged: "No", Date: "2026-01-02" }),
      ]);
      expect(idsOf(parsed)).toEqual(["mixedbot"]);
      expect(recordOfId(parsed, "mixedbot").identifiers).toMatchObject({
        decisions: 1,
        first: "2026-01-02",
        last: "2026-01-02",
      });
    });

    it("gives the same body for the same file read on two different days", async () => {
      const rows = zetabot();
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
        const first = await runOf(rows);
        jest.setSystemTime(new Date("2029-03-01T12:00:00Z"));
        const second = await runOf(rows);
        expect(second.snapshot.bodies).toEqual(first.snapshot.bodies);
        expect(second.parsed).toEqual(first.parsed);
      } finally {
        jest.useRealTimers();
      }
    });

    it("gives records with a different address each, whose address is the page of the tool", async () => {
      const { parsed } = await runOf([...manyTools(5), rowOf({ "AI Tool": "Beta Chat" })]);
      const urls = parsed.records.map((record) => record.url);
      expect(new Set(urls).size).toBe(parsed.records.length);
      for (const record of parsed.records) {
        expect(record.url).toBe(`${RECORD_URL}${encodeURIComponent(record.sourceRecordId)}`);
      }
    });

    it("writes the address of a tool whose key is not ASCII with percent escapes", async () => {
      const { parsed } = await runOf([rowOf({ "AI Tool": `Caf${cp(0xe9)}bot` })]);
      expect(parsed.records[0].sourceRecordId).toBe(`caf${cp(0xe9)}bot`);
      expect(parsed.records[0].url).toBe(`${RECORD_URL}caf%C3%A9bot`);
    });

    it("has a newest decision day as the version of the list", async () => {
      const { parsed } = await runOf(zetabot());
      expect(parsed.sourceVersion).toBe("2026-05-01");
      const none = charlotinConnector.parse(await downloadOf(csvOf(FILLER)));
      expect(none.sourceVersion).toBeNull();
    });

    it("has the newest decision day of any tool as the version, and not the oldest", async () => {
      const { parsed } = await runOf([
        rowOf({ "AI Tool": "Oldbot", Date: "2025-08-01" }),
        rowOf({ "AI Tool": "Newbot", Date: "2026-04-05" }),
        rowOf({ "AI Tool": "Midbot", Date: "2026-01-01" }),
      ]);
      expect(parsed.sourceVersion).toBe("2026-04-05");
    });

    it("does not let a day that does not exist set the year that the counts are made back from", async () => {
      const { parsed } = await runOf([
        ...manyTools(120),
        rowOf({ "AI Tool": "Alpha1", Date: "2099-02-30" }),
      ]);
      // The decision of the first tool is of 2025-01-01, in the newest year of the real days.
      expect(recordOfId(parsed, "bot0000").summary).toContain("By year: 2025 1.");
    });

    describe("the tool of the identifiers is the whole first spelling", () => {
      /**
       * Names that the title cuts at 60 units (47 are kept, and a marker): one that is over the cut, one
       * with a blank at its 48th unit (the cut takes it off), one with a pair of surrogates at its 48th
       * and 49th (the cut never splits a pair). None holds a separator of a tool cell.
       */
      const NAMES: ReadonlyArray<[string, string]> = [
        ["a name over the cut", `Zorb${" abcd".repeat(20)}`],
        ["a blank at the cut", `${"a".repeat(47)} ${"b".repeat(60)}`],
        ["a pair of surrogates at the cut", `${"a".repeat(47)}${cp(0x1f600)}${"b".repeat(60)}`],
      ];

      it("has names that the title cuts, and a cut that a name under it does not need: the premise of the next tests", () => {
        for (const [, name] of NAMES) {
          expect(name.length).toBeGreaterThan(60);
          expect(name.length).toBeLessThanOrEqual(200);
          expect(lineOf(name, 60).endsWith(SHORTENED)).toBe(true);
        }
        expect(lineOf("Zorb abcd", 60)).toBe("Zorb abcd");
      });

      it.each(NAMES)(
        "keeps the whole name in the identifiers and in the names, and cuts it in the title and the text only: %s",
        async (_where, name) => {
          const { snapshot, parsed } = await runOf([rowOf({ "AI Tool": name })]);
          const [row] = bodyRowsOf(snapshot);
          const record = recordOfId(parsed, row.id);
          expect(row.names[0]).toBe(name);
          expect(record.identifiers.tool).toBe(name);
          expect(String(record.identifiers.tool)).not.toContain("[shortened]");
          expect(record.title).toBe(`${MARK}: ${lineOf(name, 60)}`);
          expect(record.title.endsWith(SHORTENED)).toBe(true);
          expect(record.summary).toContain(`AI tool as written: ${lineOf(name, 60)}.`);
          expect(record.summary).not.toContain(name);
        },
      );

      it("keeps a name of 60 units, and one of 200, whole in the identifiers", async () => {
        const sixty = `Zorb${"x".repeat(56)}`;
        // Words of three letters: 200 units with a key of 151 letters, under the cap of keys.
        const twoHundred = `Quar${" abc".repeat(49)}`;
        expect(sixty).toHaveLength(60);
        expect(twoHundred).toHaveLength(200);
        const { parsed } = await runOf([
          rowOf({ "AI Tool": sixty }),
          rowOf({ "AI Tool": twoHundred }),
        ]);
        const tools = parsed.records.map((record) => record.identifiers.tool);
        expect(tools).toContain(sixty);
        expect(tools).toContain(twoHundred);
      });

      it("keeps the angle brackets of a name out of the identifiers, as before", async () => {
        const { parsed } = await runOf([rowOf({ "AI Tool": `<b>Zorb${" abcd".repeat(20)}` })]);
        const [record] = parsed.records;
        expect(JSON.stringify(record.identifiers)).not.toMatch(/[<>]/);
        expect(String(record.identifiers.tool).length).toBeGreaterThan(60);
      });
    });
  });

  describe("the worst case", () => {
    const worstRow = {
      id: "k".repeat(160),
      display: "D".repeat(200),
      names: ["D".repeat(200), "E".repeat(200), "F".repeat(200), "G".repeat(200), "H".repeat(200)],
      decisions: 20_000,
      first: "2024-03-11",
      last: "2026-07-23",
      anchorYear: 2026,
      byYear: [20_000, 19_999, 19_998, 19_997],
      roles: { lawyers: 20_000, selfRepresented: 19_999, others: 19_998 },
      countries: [
        ["C".repeat(40), 20_000],
        ["B".repeat(40), 19_999],
        ["A".repeat(40), 19_998],
      ],
      disputed: 20_000,
    };

    it("is under the limit of a summary, keeps its second sentence and its closing sentence", () => {
      const snapshot: Snapshot = {
        bodies: [JSON.stringify({ v: 1, rows: [worstRow], total: 20_000, unreadable: 0 })],
        etag: null,
        lastModified: null,
        bytes: 0,
      };
      const parsed = charlotinConnector.parse(snapshot);
      expect(parsed.errors).toBe(0);
      const [record] = parsed.records;
      expect(record.summary.length).toBeLessThanOrEqual(RECORD_SUMMARY_MAX);
      expect(record.summary.length).toBeLessThan(1_100);
      expect(record.summary).toContain(SENTENCE_TWO);
      expect(record.summary.endsWith(CLOSING)).toBe(true);
      expect(record.summary).toContain("[shortened]");
      expect(record.title.length).toBeLessThanOrEqual(200);
      expect(record.title.startsWith(`${MARK}: `)).toBe(true);
      expectWellFormedRecords(parsed.records, { sourceId: "charlotin", mark: MARK });
    });
  });

  describe("the columns", () => {
    it.each(USED.map((column) => [column]))(
      "is not the list without the column %s",
      async (column) => {
        const header = COLUMNS.filter((name) => name !== column);
        const rows = [...FILLER].map((row) => row.filter((_, at) => COLUMNS[at] !== column));
        const error = await failureOf(downloadOf(csvOf(rows, header)));
        expect(error).toBeInstanceOf(NotTheListError);
      },
    );

    it("is not the list when a column is spelled differently", async () => {
      const header = COLUMNS.map((name) => (name === "AI Tool" ? "AI Tools" : name));
      const error = await failureOf(downloadOf(csvOf(FILLER, header)));
      expect(error).toBeInstanceOf(NotTheListError);
    });

    it("is still the list without a column that it does not read", async () => {
      const without = COLUMNS.filter((name) => name !== "Court" && name !== "Details");
      const narrower = [rowOf({ "AI Tool": "Alpha1" }), ...FILLER].map((row) =>
        row.filter((_, at) => COLUMNS[at] !== "Court" && COLUMNS[at] !== "Details"),
      );
      const parsed = charlotinConnector.parse(await downloadOf(csvOf(narrower, without)));
      expect(parsed.errors).toBe(0);
      expect(idsOf(parsed)).toEqual(["alpha1"]);
    });

    it("is still the list with a column more: the width is the header's, not a constant", async () => {
      const wider = [rowOf({ "AI Tool": "Alpha1" }), ...FILLER].map((row) => [...row, "ZZ-EXTRA"]);
      const parsed = charlotinConnector.parse(
        await downloadOf(csvOf(wider, [...COLUMNS, "Added later"])),
      );
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
      expect(idsOf(parsed)).toEqual(["alpha1"]);
      expect(JSON.stringify(parsed.records)).not.toContain("ZZ-EXTRA");
    });

    it("counts every row of the old width as unreadable once the header has a column more", async () => {
      // The header grew, the rows did not: nothing can be read, and the list fails instead of being empty.
      const parsed = charlotinConnector.parse(
        await downloadOf(csvOf(FILLER, [...COLUMNS, "Added later"])),
      );
      expect(parsed.errors).toBeGreaterThan(0);
      expect(parsed.records).toEqual([]);
    });

    it("finds the columns by the name in the header, wherever they are", async () => {
      const order = [...COLUMNS].reverse();
      const rows = [rowOf({ "AI Tool": "Alpha1", Date: "2026-02-03" }), ...FILLER].map((row) =>
        order.map((column) => row[COLUMNS.indexOf(column)]),
      );
      const parsed = charlotinConnector.parse(await downloadOf(csvOf(rows, order)));
      expect(idsOf(parsed)).toEqual(["alpha1"]);
      expect(recordOfId(parsed, "alpha1").identifiers).toMatchObject({ last: "2026-02-03" });
    });

    it("finds a column whose name has blanks around it", async () => {
      const header = COLUMNS.map((name) => (name === "AI Tool" ? ` ${name} ` : name));
      const parsed = charlotinConnector.parse(
        await downloadOf(csvOf([rowOf({ "AI Tool": "Alpha1" }), ...FILLER], header)),
      );
      expect(idsOf(parsed)).toEqual(["alpha1"]);
    });
  });

  describe("rows that do not read", () => {
    it.each([
      ["a day that does not exist", "2026-02-30"],
      ["a day in the form of another country", "06/11/2026"],
      ["an empty day", ""],
      ["a day without its zeros", "2026-2-3"],
      ["a day with a time", "2026-07-23T10:00:00Z"],
      ["a year 0", "0000-01-01"],
      ["a month 13", "2026-13-01"],
      ["a word", "yesterday"],
    ])("counts a row with %s as unreadable", async (_why, date) => {
      const { parsed } = await runOf([
        ...manyTools(120),
        rowOf({ "AI Tool": "Alpha1", Date: date }),
      ]);
      expect(parsed.skipped).toBe(1);
      expect(parsed.errors).toBe(0);
      expect(parsed.records.some((record) => record.sourceRecordId === "alpha1")).toBe(false);
    });

    it("reads a day with blanks around it", async () => {
      const { parsed } = await runOf([rowOf({ "AI Tool": "Alpha1", Date: " 2026-02-03 " })]);
      expect(recordOfId(parsed, "alpha1").identifiers).toMatchObject({ first: "2026-02-03" });
    });

    it("counts a row narrower or wider than the header as unreadable", async () => {
      const narrow = rowOf({ "AI Tool": "Alpha1" }).slice(0, 18);
      const wide = [...rowOf({ "AI Tool": "Beta22" }), "ZZ-EXTRA"];
      const { parsed } = await runOf([...manyTools(120), narrow, wide]);
      expect(parsed.skipped).toBe(2);
      expect(parsed.errors).toBe(0);
      expect(idsOf(parsed).filter((id) => !id.startsWith("bot"))).toEqual([]);
      expect(JSON.stringify(parsed.records)).not.toContain("ZZ-EXTRA");
    });

    it("tolerates ten of them and fails the sync at eleven", async () => {
      const bad = (count: number): string[][] =>
        Array.from({ length: count }, () => rowOf({ "AI Tool": "Alpha1", Date: "" }));
      const ten = (await runOf([...manyTools(120), ...bad(10)])).parsed;
      expect(ten.skipped).toBe(10);
      expect(ten.errors).toBe(0);
      const eleven = (await runOf([...manyTools(120), ...bad(11)])).parsed;
      expect(eleven.errors).toBe(11);
      expect(eleven.skipped).toBe(0);
    });

    it("counts a flag that is neither Yes nor No on a row that names a tool, and no other", async () => {
      const { parsed } = await runOf([
        ...manyTools(120),
        rowOf({ "AI Tool": "Alpha1", Alleged: "Maybe" }),
        rowOf({ "AI Tool": "Beta22", "Vendor Disputed": "" }),
        // A row that names no tool is never asked about its flags.
        rowOf({ Alleged: "Maybe", "Vendor Disputed": "Maybe" }),
        rowOf({ "AI Tool": "Gamma3", Alleged: " yes ", "Vendor Disputed": "NO" }),
      ]);
      expect(parsed.skipped).toBe(2);
      expect(
        parsed.records.some((record) => /^(alpha1|beta22|gamma3)$/.test(record.sourceRecordId)),
      ).toBe(false);
    });

    describe("a flag cell of more than LINE_INPUT_MAX units", () => {
      /** A flag, a megabyte of blanks and the other flag: its first megabyte says one thing, the cell another. */
      const SHAPES: ReadonlyArray<[string, string]> = [
        ["No, a megabyte of blanks and Yes", `No${" ".repeat(LINE_INPUT_MAX)}Yes`],
        ["Yes, a megabyte of blanks and No", `Yes${" ".repeat(LINE_INPUT_MAX)}No`],
      ];
      const FLAG_COLUMNS = ["Alleged", "Vendor Disputed"] as const;
      type FlagColumn = (typeof FLAG_COLUMNS)[number];

      /** The cells of a row that names a tool, with the flag column set to `cell`. */
      const flagged = (column: FlagColumn, cell: string): Partial<Record<Column, string>> =>
        column === "Alleged" ? { Alleged: cell } : { "Vendor Disputed": cell };

      const CASES = FLAG_COLUMNS.flatMap((column) =>
        SHAPES.map(([shape, cell]): [FlagColumn, string, string] => [column, shape, cell]),
      );

      it("has cells whose first megabyte reads as a flag, and the cell as a whole does not: the premise of the next tests", () => {
        for (const [, cell] of SHAPES) {
          expect(cell.length).toBeGreaterThan(LINE_INPUT_MAX);
          expect(["no", "yes"]).toContain(lineOf(cell, 8).toLowerCase());
        }
      });

      it.each(CASES)(
        "counts a row whose %s cell is %s as a row that does not read, never as the flag of its first megabyte",
        async (column, _shape, cell) => {
          const { snapshot, parsed } = await runOf([
            ...manyTools(120),
            rowOf({ "AI Tool": "Zorbbot", Date: "2031-01-01", ...flagged(column, cell) }),
          ]);
          expect(parsed.records).toHaveLength(120);
          expect(idsOf(parsed)).not.toContain("zorbbot");
          expect(parsed.skipped).toBe(1);
          expect(parsed.errors).toBe(0);
          expect((JSON.parse(snapshot.bodies[0]) as { unreadable: number }).unreadable).toBe(1);
          // A row that does not read sets no newest day: the years still count back from the file's own.
          expect(bodyRowsOf(snapshot).every((row) => row.anchorYear === 2025)).toBe(true);
        },
      );

      it.each(CASES)(
        "still does not ask a row that names no tool about its %s cell, however long it is, and reads the row (%s)",
        async (column, _shape, cell) => {
          const { snapshot, parsed } = await runOf([
            ...manyTools(120),
            rowOf({ Date: "2031-01-01", ...flagged(column, cell) }),
          ]);
          expect(parsed.records).toHaveLength(120);
          expect(parsed.skipped).toBe(0);
          expect(parsed.errors).toBe(0);
          // The row reads, and counts for the newest decision of the file.
          expect(bodyRowsOf(snapshot).every((row) => row.anchorYear === 2031)).toBe(true);
        },
      );

      it.each(FLAG_COLUMNS.map((column) => [column]))(
        "reads a %s cell of exactly LINE_INPUT_MAX units, and refuses one of a unit more",
        async (column) => {
          const exact = `No${" ".repeat(LINE_INPUT_MAX - 2)}`;
          expect(exact).toHaveLength(LINE_INPUT_MAX);
          const whole = await runOf([
            ...manyTools(120),
            rowOf({ "AI Tool": "Zorbbot", ...flagged(column, exact) }),
          ]);
          expect(idsOf(whole.parsed)).toContain("zorbbot");
          expect(whole.parsed.skipped).toBe(0);

          const over = await runOf([
            ...manyTools(120),
            rowOf({ "AI Tool": "Zorbbot", ...flagged(column, `${exact} `) }),
          ]);
          expect(idsOf(over.parsed)).not.toContain("zorbbot");
          expect(over.parsed.skipped).toBe(1);
          expect(over.parsed.errors).toBe(0);
        },
      );
    });
  });

  describe("the size of the list", () => {
    it("is not the list below 1,500 rows, and is from 1,500", async () => {
      const short = await failureOf(downloadOf(csvOf(fillerRows(1_499))));
      expect(short).toBeInstanceOf(NotTheListError);
      const floor = await downloadOf(csvOf(fillerRows(1_500)));
      expect(JSON.parse(floor.bodies[0]).total).toBe(1_500);
    });

    it("is read up to 20,000 rows, and one row more is a list that is too large, never a shorter one", async () => {
      const full = await downloadOf(csvOf(fillerRows(20_000)));
      expect(JSON.parse(full.bodies[0]).total).toBe(20_000);
      const over = await failureOf(downloadOf(csvOf(fillerRows(20_001))));
      expect(over).toBeInstanceOf(BodyTooLargeError);
    });

    it("is too large when a row has more cells than any real row can", async () => {
      const wide = new Array<string>(1_000).fill("x");
      const error = await failureOf(downloadOf(csvOf([...FILLER, wide])));
      expect(error).toBeInstanceOf(BodyTooLargeError);
    });

    it("is too large when the file was cut at its limit, whatever it holds", async () => {
      const error = await failureOf(downloadOf(csvOf(FILLER), { truncated: true }));
      expect(error).toBeInstanceOf(BodyTooLargeError);
      const over = await failureOf(downloadOf(Buffer.alloc(16 * MIB + 1, 0x20)));
      expect(over).toBeInstanceOf(BodyTooLargeError);
    });

    it("is too large when the file ends inside a quoted cell: it was cut short", async () => {
      const text = csvOf([...FILLER, rowOf({ Details: "ZZ, a cell with a comma that ends here" })]);
      const cutAt = text.lastIndexOf("a cell with");
      const error = await failureOf(downloadOf(text.slice(0, cutAt + 6)));
      expect(error).toBeInstanceOf(BodyTooLargeError);
    });
  });

  describe("a file that is not the list", () => {
    it.each<[string, string]>([
      [
        "a page of HTML",
        "<!DOCTYPE html><html><head><title>Just a moment</title></head><body></body></html>",
      ],
      ["a JSON document", '{"cases": [], "total": 0}'],
      ["an empty file", ""],
      ["only line breaks", "\r\n\r\n"],
      ["another CSV", "id,name,day\r\n1,Alpha,2026-01-01\r\n"],
    ])("is refused for %s sent as text/csv", async (_what, body) => {
      const error = await failureOf(downloadOf(body));
      expect(error).toBeInstanceOf(NotTheListError);
    });

    it("is refused, without a word of what it holds, for a page of another type", async () => {
      const error = await failureOf(downloadOf("<html></html>", { contentType: "text/html" }));
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).reason).toBe("unsupported_type");
    });

    it("is refused when the answer comes from another host, another path, or by plain http", async () => {
      const answers = [
        "https://evil.example.org/hallucinations/hallucinations/download.csv",
        "https://damiencharlotin.com/hallucinations/hallucinations/download.csv",
        "https://www.damiencharlotin.com.evil.example/hallucinations/download.csv",
        "https://www.damiencharlotin.com/other/download.csv",
        "https://www.damiencharlotin.com/hallucinations-old/download.csv",
        "http://www.damiencharlotin.com/hallucinations/hallucinations/download.csv",
        "https://user:pass@www.damiencharlotin.com/hallucinations/hallucinations/download.csv",
        "https://www.damiencharlotin.com:8443/hallucinations/hallucinations/download.csv",
      ];
      for (const url of answers) {
        const error = await failureOf(downloadOf(csvOf(FILLER), { url }));
        expect(error).toBeInstanceOf(FetchError);
        expect((error as FetchError).reason).toBe("not_allowed");
        expect((error as FetchError).message).not.toContain("evil");
        expect((error as FetchError).message).not.toContain("pass");
      }
    });

    it("is read from a redirect that stays under the pin", async () => {
      const snapshot = await downloadOf(csvOf([rowOf({ "AI Tool": "Alpha1" }), ...FILLER]), {
        url: "https://www.damiencharlotin.com/hallucinations/other/export.csv",
      });
      expect(idsOf(charlotinConnector.parse(snapshot))).toEqual(["alpha1"]);
    });
  });

  describe("the validators", () => {
    const LAST_MODIFIED = "Mon, 02 Mar 2026 06:17:45 GMT";

    it("answers unchanged to a 304 through the validators that the first download stored", async () => {
      const files = {
        [FILE_URL]: { body: csvOf(FILLER), contentType: "text/csv", lastModified: LAST_MODIFIED },
      };
      const fetch = fakeFetch(files);
      const first = await charlotinConnector.download(fetch, {});
      if (first === "unchanged") throw new Error("A first download is never unchanged.");
      expect(first.lastModified).toBe(LAST_MODIFIED);

      const again = await charlotinConnector.download(fetch, {
        etag: first.etag,
        lastModified: first.lastModified,
      });
      expect(again).toBe("unchanged");
      // The server's own etag is sent without the prefix of the version; the export has none.
      expect(fetch.calls[1].validators).toEqual({ etag: null, lastModified: LAST_MODIFIED });
    });

    it("sends no validators for a snapshot of another reading, so that the new reading parses the file", async () => {
      const fetch = fakeFetch({
        [FILE_URL]: { body: csvOf(FILLER), contentType: "text/csv", lastModified: LAST_MODIFIED },
      });
      const again = await charlotinConnector.download(fetch, {
        etag: "k0:",
        lastModified: LAST_MODIFIED,
      });
      expect(again).not.toBe("unchanged");
      expect(fetch.calls[0].validators).toEqual({});
    });

    it("refuses a 304 that comes from another host", async () => {
      const fetch = fakeFetch({
        [FILE_URL]: {
          body: csvOf(FILLER),
          contentType: "text/csv",
          lastModified: LAST_MODIFIED,
          url: "https://evil.example.org/hallucinations/hallucinations/download.csv",
        },
      });
      const error = await failureOf(
        charlotinConnector.download(fetch, {
          etag: `k${charlotinConnector.version}:`,
          lastModified: LAST_MODIFIED,
        }),
      );
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).reason).toBe("not_allowed");
    });

    it("gives the same body for the same list, so that the hash of the sync tells it is unchanged", async () => {
      const rows = [rowOf({ "AI Tool": "Alpha1" })];
      const first = await runOf(rows);
      const second = await runOf(rows);
      expect(second.snapshot.bodies).toEqual(first.snapshot.bodies);
      expect(second.snapshot.bytes).toBe(first.snapshot.bytes);
    });
  });

  describe("what never reaches a snapshot or a record", () => {
    it("leaves out every column that it does not read, and the explanation of a dispute", async () => {
      const planted = {
        caseId: "ZZ-PLANTED-ID",
        caseName: "ZZ-PLANTED-PARTY v. ZZ-PLANTED-OTHER",
        court: "ZZ-PLANTED-COURT",
        items: "ZZ-PLANTED-ITEMS fabricated | free text",
        outcome: "ZZ-PLANTED-OUTCOME",
        penalty: "ZZ-PLANTED-5000 USD",
        pointer: "ZZ-PLANTED-PERSON",
        source: "/documents/ZZ-PLANTED-caption_2026-01-01.pdf",
        details: "ZZ-PLANTED-DETAILS",
        fieldOne: "ZZ-PLANTED-FIELD",
        fieldTwo: "ZZ-PLANTED-FIELD-TWO",
        explanation: "ZZ-PLANTED-EXPLANATION about Alpha1",
      };
      const { snapshot, parsed } = await runOf([
        rowOf({
          "AI Tool": "Alpha1",
          "Vendor Disputed": "Yes",
          case_id: planted.caseId,
          "Case Name": planted.caseName,
          Court: planted.court,
          "Hallucination Items": planted.items,
          Outcome: planted.outcome,
          "Monetary Penalty": planted.penalty,
          Pointer: planted.pointer,
          Source: planted.source,
          Details: planted.details,
          "Legal Field Primary": planted.fieldOne,
          "Legal Field Secondary": planted.fieldTwo,
          "Vendor Disputed Explanation": planted.explanation,
        }),
      ]);
      const everything = `${snapshot.bodies.join("\n")}\n${JSON.stringify(parsed)}`;
      for (const value of Object.values(planted)) {
        expect(everything).not.toContain(value);
      }
      // The filler rows hold the `ZZ-` tokens of the defaults in every column: none is anywhere.
      expect(everything).not.toContain("ZZ-");
      expect(recordOfId(parsed, "alpha1").identifiers.disputed).toBe(1);
    });

    it("does not keep the professional sanction, the court, nor any natural person's field", async () => {
      const { parsed } = await runOf([
        rowOf({
          "AI Tool": "Alpha1",
          "Professional Sanction": "Yes",
          "Case Name": "ZZ-Person One v. ZZ-Person Two",
        }),
      ]);
      const text = JSON.stringify(parsed);
      expect(text).not.toContain("Sanction");
      expect(text).not.toContain("Person");
    });
  });

  describe("hostile cells", () => {
    const ONE_HUNDRED_KB = 100 * 1024;

    it("keeps no control character, no hidden character and no angle bracket in a record", async () => {
      const hostile = [
        `Alpha${cp(0, 1, 7, 0x1b)}One`,
        `Beta${cp(0x202e)}Two${cp(0x2066, 0x2069)}`,
        "<script>alert(1)</script>",
        `Gamma${cp(0xd800)}Three`,
        `Delta${cp(0xdc00)}Four`,
        `Epsilon${cp(0xfeff, 0x00ad, 0x2060)}Five`,
        `Zeta${cp(0xff1c)}img src=x${cp(0xff1e)}`,
      ];
      const { parsed } = await runOf(hostile.map((tool) => rowOf({ "AI Tool": tool })));
      expect(parsed.errors).toBe(0);
      expect(parsed.records.length).toBeGreaterThanOrEqual(hostile.length);
      expectWellFormedRecords(parsed.records, { sourceId: "charlotin", mark: MARK });
      for (const record of parsed.records) {
        const text = `${record.title} ${record.summary} ${JSON.stringify(record.identifiers)}`;
        expect(text).not.toMatch(/[<>]/);
        expect(text).not.toMatch(/\p{Cc}/u);
        expect(text).not.toMatch(/[\u{D800}-\u{DFFF}]/u);
      }
      // The slash of the closing tag splits the cell, as any slash does.
      for (const id of [
        "alphaone",
        "betatwo",
        "scriptalert",
        "script",
        "gammathree",
        "deltafour",
      ]) {
        expect(idsOf(parsed)).toContain(id);
      }
      expect(idsOf(parsed)).toContain("epsilonfive");
      expect(idsOf(parsed)).toContain("zetaimgsrcx");
    });

    it("takes a cell of 100 KB in any column that it reads for what it is: a row that does not read, or a cut cell", async () => {
      const big = "x".repeat(ONE_HUNDRED_KB);
      const { parsed } = await runOf([
        ...manyTools(120),
        rowOf({ "AI Tool": big }),
        rowOf({ "AI Tool": "Alpha1", Date: big }),
        rowOf({ "AI Tool": "Beta22", "State(s)": big, "Party(ies)": big }),
        rowOf({
          "AI Tool": "Gamma3",
          "Vendor Disputed": "Yes",
          "Vendor Disputed Explanation": big,
          "Case Name": big,
          Details: big,
        }),
        rowOf({ "AI Tool": "Delta4", Alleged: big }),
      ]);
      // The tool column of the first row, the day of the second and the flag of the last are not readable.
      expect(parsed.skipped).toBe(3);
      expect(parsed.errors).toBe(0);
      expect(idsOf(parsed)).toContain("beta22");
      expect(idsOf(parsed)).toContain("gamma3");
      const beta = recordOfId(parsed, "beta22");
      expect(beta.summary.length).toBeLessThanOrEqual(RECORD_SUMMARY_MAX);
      expect(beta.summary).toContain("[shortened]");
      expectWellFormedRecords(parsed.records, { sourceId: "charlotin", mark: MARK });
    });

    it("replaces a lone surrogate in a country, and writes no raw `<` into the title", async () => {
      const { parsed } = await runOf([
        rowOf({ "AI Tool": "<b>Alpha1</b>", "State(s)": `Free${cp(0xd83d)}donia` }),
      ]);
      const [record] = parsed.records;
      expect(record.summary).toContain(`Free${cp(0xfffd)}donia`);
      expect(record.title).not.toMatch(/[<>]/);
      expectWellFormedRecords(parsed.records, { sourceId: "charlotin", mark: MARK });
    });

    it("does not let a cell with many separators cost more than its length", async () => {
      const started = Date.now();
      expect(await keysOfCell(",".repeat(190))).toEqual([]);
      expect(await keysOfCell("; ".repeat(95))).toEqual([]);
      expect(await keysOfCell(`(${"(".repeat(190)}`)).toEqual([]);
      expect(await keysOfCell(`${". ".repeat(95)}x`)).toEqual([]);
      expect(await keysOfCell(" and ".repeat(38))).toEqual([]);
      expect((await keysOfCell("a ".repeat(95))).length).toBeLessThanOrEqual(1);
      expect(Date.now() - started).toBeLessThan(10_000);
    });

    it("reads a list that names more tools than it has rows, under the cap, with the total of its entities", async () => {
      // 400 rows that name six tools each, behind the 1,600 rows that name none: 2,400 tools out of
      // 2,000 rows. A row can name several entities, so the entities may outnumber the rows; the
      // total of the reader is the larger of the rows it saw and its entities, because the kit
      // refuses a body whose total is below them.
      const sixTools = Array.from({ length: 400 }, (_, at) =>
        rowOf({
          "AI Tool": Array.from(
            { length: 6 },
            (_unused, index) => `Bot${String(at * 6 + index).padStart(4, "0")}`,
          ).join("; "),
        }),
      );
      expect(sixTools.length + FILLER.length).toBe(2_000);
      const snapshot = await downloadOf(csvOf([...sixTools, ...FILLER]));
      expect(bodyRowsOf(snapshot)).toHaveLength(2_400);
      expect(JSON.parse(snapshot.bodies[0])).toMatchObject({ total: 2_400, unreadable: 0 });
      const parsed = charlotinConnector.parse(snapshot);
      expect(parsed.records).toHaveLength(2_400);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
    });

    it("counts the rows that it could not read in the total, with the tools that it read", async () => {
      // 1,590 rows that read, five of them naming two tools: 1,595 tools. Ten rows are narrower than
      // the header: 1,600 rows in all. The tools alone do not outnumber the rows, but the tools and
      // the rows that could not be read do: 1,605.
      const readable = Array.from({ length: 1_590 }, (_, at) => {
        const name = `Bot${String(at).padStart(4, "0")}`;
        return rowOf({ "AI Tool": at < 5 ? `${name}a; ${name}b` : name });
      });
      const narrow = Array.from({ length: 10 }, () => rowOf().slice(0, 5));
      const snapshot = await downloadOf(csvOf([...readable, ...narrow]));
      expect(JSON.parse(snapshot.bodies[0])).toMatchObject({ total: 1_605, unreadable: 10 });
      const parsed = charlotinConnector.parse(snapshot);
      expect(parsed.records).toHaveLength(1_595);
      expect(parsed.skipped).toBe(10);
      expect(parsed.errors).toBe(0);
    });

    it("still refuses more than 5,000 tools when they outnumber the rows: the cap on entities decides", async () => {
      const cells = Array.from({ length: 300 }, (_, at) => {
        const tokens = Array.from({ length: 20 }, (_unused, index) => `T${at}x${index}`);
        return rowOf({ "AI Tool": tokens.join(",") });
      });
      // 300 rows of 20 tools make 6,000 entities out of 1,900 rows: more than the cap, and more
      // than the rows too.
      const error = await failureOf(downloadOf(csvOf([...cells, ...FILLER])));
      expect(error).toBeInstanceOf(NotTheListError);
    });

    it("reads 5,000 tools and refuses 5,001: the reader keeps no more entities than any real list has", async () => {
      const tools = (count: number): string[][] =>
        Array.from({ length: count }, (_, at) => rowOf({ "AI Tool": `Bot${at}` }));
      const full = await downloadOf(csvOf([...tools(5_000), ...FILLER]));
      expect(bodyRowsOf(full)).toHaveLength(5_000);
      const over = await failureOf(downloadOf(csvOf([...tools(5_001), ...FILLER])));
      expect(over).toBeInstanceOf(NotTheListError);
    });
  });

  describe("the contract of the kit", () => {
    const rows = [
      rowOf({ "AI Tool": "Alpha1, Beta22", Date: "2026-02-03", "State(s)": "Freedonia" }),
      rowOf({ "AI Tool": "Beta22", Date: "2026-02-03", "State(s)": "Atlantis" }),
      rowOf({
        "AI Tool": "Beta22",
        Date: "2026-02-03",
        "State(s)": "Freedonia",
        "Party(ies)": "Pro Se Litigant",
      }),
      rowOf({ "AI Tool": "Acme Bot", Date: "2025-01-02", "State(s)": "Atlantis" }),
      rowOf({ "AI Tool": "AcmeBot", Date: "2025-01-02", "State(s)": "Freedonia" }),
      rowOf({ "AI Tool": "ACMEBOT", Date: "2024-05-06" }),
      rowOf({
        "AI Tool": "Gamma3",
        "Vendor Disputed": "Yes",
        "Vendor Disputed Explanation": "Gamma3 was not used",
      }),
      rowOf({ "AI Tool": "Delta4", Alleged: "Yes" }),
    ];

    it("gives the same bodies and the same records whatever the order of the rows", async () => {
      await expectDeterministic(charlotinConnector, (reversed) => {
        const all = [...rows, ...FILLER];
        const body = csvOf(reversed ? all.slice().reverse() : all);
        return fakeFetch({ [FILE_URL]: { body, contentType: "text/csv" } });
      });
    });

    it("gives the same ids for a tool whatever the order of the rows, however they are shuffled", async () => {
      const ids = new Set<string>();
      let seed = 7;
      const next = (): number => {
        seed = (seed * 48_271) % 2_147_483_647;
        return seed;
      };
      for (let round = 0; round < 4; round += 1) {
        const shuffled = [...rows, ...FILLER]
          .map((row) => ({ row, key: next() }))
          .sort((a, b) => a.key - b.key)
          .map(({ row }) => row);
        const parsed = charlotinConnector.parse(await downloadOf(csvOf(shuffled)));
        ids.add(idsOf(parsed).join(","));
        expectWellFormedRecords(parsed.records, { sourceId: "charlotin", mark: MARK });
      }
      expect([...ids]).toEqual(["acmebot,alpha1,beta22,gamma3"]);
    });

    it("makes records that hold what the columns and the prompt need", async () => {
      const { parsed } = await runOf(rows);
      expect(parsed.records.length).toBe(4);
      expectWellFormedRecords(parsed.records, { sourceId: "charlotin", mark: MARK });
      for (const record of parsed.records) {
        expect(record.summary.startsWith(MARK)).toBe(true);
        expect(record.matchKeys.every((key) => key.startsWith("name:"))).toBe(true);
        expect(record.recordType).toBe("hallucination_cases");
      }
    });

    it("keeps no address, no row and no message in a failure", async () => {
      const failures = [
        await failureOf(downloadOf("<html>ZZ-PAGE</html>")),
        await failureOf(downloadOf(csvOf(FILLER), { truncated: true })),
        await failureOf(downloadOf(csvOf(FILLER), { url: "https://evil.example.org/x.csv" })),
      ];
      for (const error of failures) {
        const text = `${(error as Error).name} ${(error as Error).message}`;
        expect(text).not.toContain("ZZ-");
        expect(text).not.toContain("damiencharlotin");
        expect(text).not.toContain("evil.example");
        expect(text).not.toContain("https");
      }
    });

    it("has no root for a body that is not the one its download makes", () => {
      const notABody: Snapshot = { bodies: ["not json"], etag: null, lastModified: null, bytes: 0 };
      expect(charlotinConnector.parse(notABody).root).toBeNull();
      expect(charlotinConnector.parse({ ...notABody, bodies: [] }).root).toBeNull();
    });
  });
});
