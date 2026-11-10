/**
 * The Epoch AI Data on AI Models as a mirrored list of the vendor risk database
 * (connectors/epochAi.ts): one CSV of AI models, read into one record per developing organisation
 * that Epoch itself labels Industry. The files are synthetic: they copy the shape of the real file
 * (the 57 columns in order, LF line ends, line breaks inside quoted cells, comma lists in the
 * Organization and Organization categorization columns that line up by position) with every model
 * and organisation invented. A column that the connector must leave out holds a token that starts
 * with `ZZ-` in every row that a test designs, so that a copy of it anywhere in a snapshot or a
 * record is found. Every character that is hard to type is built with `cp`. Nothing here uses the
 * network: `fakeFetch` answers from the files.
 */
import { FetchError } from "../../../../webResearch/guardedFetch";
import type { ParsedRecord } from "../../types";
import { EPOCH_AI_RECORD_MARK, epochAiConnector, uncutLineOf } from "../epochAi";
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

const MARK = EPOCH_AI_RECORD_MARK;
const FILE_URL = "https://epoch.ai/data/all_ai_models.csv";
const RECORD_URL = "https://epoch.ai/data/ai-models-documentation?organisation=";
const MIB = 1024 * 1024;

/**
 * Texts that are too long for a cap of 200 units, and that `lineOf(text, 201)` cuts to a line of
 * 200 units that ends in the marker, so that a length test on that line passes them as whole. The
 * first has a blank at its 189th unit (the cut takes it off); the second a pair of surrogates at
 * its 189th and 190th (the cut never splits a pair). Their key is 151 letters, under the cap of keys.
 */
const BLANK_AT_THE_CUT = `abcd${" abc".repeat(60)}`;
const PAIR_AT_THE_CUT = `abcd${" abc".repeat(46)}${cp(0x1f600)}${" abc".repeat(15)}`;
/**
 * An item of 1,950 units (under the cap of a list cell) that folds to 2,092: a parenthetical of
 * 1,900 units, then 47 characters of four letters each once folded (U+3300). `lineOf(item, 2001)`
 * cuts it inside the tail, and taking the parenthetical out would leave a short name that ends in
 * the marker.
 */
const EXPANDED_ITEM = `(${"x".repeat(1_900)}) ${cp(0x3300).repeat(47)}`;

const COLUMNS = [
  "Model",
  "Domain",
  "Task",
  "Organization",
  "Authors",
  "Publication date",
  "Reference",
  "Link",
  "Citations",
  "Notability criteria",
  "Notability criteria notes",
  "Parameters",
  "Parameters notes",
  "Training compute (FLOP)",
  "Training compute notes",
  "Training dataset size (total)",
  "Dataset size notes",
  "Training time (hours)",
  "Training time notes",
  "Training hardware",
  "Approach",
  "Confidence",
  "Abstract",
  "Epochs",
  "WikiText and Penn Treebank data",
  "Model accessibility",
  "Country (of organization)",
  "Base model",
  "Finetune compute (FLOP)",
  "Finetune compute notes",
  "Hardware quantity",
  "Hardware utilization (MFU)",
  "Last modified",
  "Training cloud compute vendor",
  "Training data center",
  "Archived links",
  "Batch size",
  "Batch size notes",
  "Organization categorization",
  "Foundation model",
  "Training compute lower bound",
  "Training compute upper bound",
  "Training chip-hours",
  "Training code accessibility",
  "Accessibility notes",
  "Possibly over 1e23 FLOP",
  "Training compute cost (2023 USD)",
  "Utilization notes",
  "Numerical format",
  "Frontier model",
  "Training power draw (W)",
  "Training compute estimation method",
  "Hugging Face developer id",
  "Post-training compute (FLOP)",
  "Post-training compute notes",
  "Hardware utilization (HFU)",
  "Open model weights?",
] as const;

type Column = (typeof COLUMNS)[number];

/** The columns that the connector reads: a file without one of them is not the list. */
const USED: readonly Column[] = [
  "Model",
  "Organization",
  "Organization categorization",
  "Publication date",
  "Frontier model",
  "Open model weights?",
  "Last modified",
];

const LEFT_OUT: readonly Column[] = COLUMNS.filter((column) => !USED.includes(column));

/** A row that a test designs: every column that is not read holds a `ZZ-` token with its name. */
let modelNumber = 0;
function rowOf(over: Partial<Record<Column, string>> = {}): string[] {
  modelNumber += 1;
  const cells: Partial<Record<Column, string>> = {
    Model: `Model ${modelNumber}`,
    "Publication date": "2025-06-01",
    "Last modified": "2025-03-14 09:26:53+00:00",
    ...Object.fromEntries(LEFT_OUT.map((column) => [column, `ZZ-${column}`])),
  };
  return COLUMNS.map((column) => over[column] ?? cells[column] ?? "");
}

/** The organisations of a row, with the labels that Epoch gives them, as the two comma lists. */
const developers = (...pairs: Array<[string, string]>): Partial<Record<Column, string>> => ({
  Organization: pairs.map(([name]) => name).join(","),
  "Organization categorization": pairs.map(([, label]) => label).join(","),
});

/** A model of one organisation that Epoch labels Industry. */
const industryRow = (organisation: string, over: Partial<Record<Column, string>> = {}): string[] =>
  rowOf({ ...developers([organisation, "Industry"]), ...over });

const quote = (cell: string): string =>
  /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;

/** The file as a text: the header, the rows, a line feed after each, quoted as a CSV writer quotes. */
const csvOf = (
  rows: ReadonlyArray<readonly string[]>,
  header: readonly string[] = COLUMNS,
  eol = "\n",
): string => `${[header, ...rows].map((row) => row.map(quote).join(",")).join(eol)}${eol}`;

/** A row that names a model and nothing else: the cheapest row of the file. */
let fillerNumber = 0;
const fillerRow = (): string[] => {
  fillerNumber += 1;
  return COLUMNS.map((column) => {
    if (column === "Model") return `Filler model ${fillerNumber}`;
    if (column === "Publication date") return "2024-02-03";
    return column === "Last modified" ? "2025-03-14 09:26:53+00:00" : "";
  });
};
const fillerRows = (count: number): string[][] => Array.from({ length: count }, fillerRow);

/** Rows of an organisation that Epoch labels Academia: they line up, and they give no record. */
const academicRows = (count: number): string[][] =>
  Array.from({ length: count }, () => rowOf(developers(["Filler University", "Academia"])));

/** The floor of the list is 3,000 rows; sixty rows of organisations make the check of the lists meaningful. */
const FILLER: string[][] = [...fillerRows(3_000), ...academicRows(60)];

/** A file of `count` rows in all, with rows of organisations in it (a file that has none is not the list). */
const rowsOfCount = (count: number): string[][] => [...academicRows(60), ...fillerRows(count - 60)];

/**
 * Organisations of industry in numbers that make a list of many entities: the allowance of ten
 * rows that do not parse is a tenth of the entities at most, and so needs about a hundred of them.
 */
const manyOrganisations = (count: number): string[][] =>
  Array.from({ length: count }, (_, at) => industryRow(`Org${String(at).padStart(3, "0")} Labs`));

/**
 * The cells of a row with one list cell over the cap of 2,000 characters. Each is made so that a
 * cut at 2,000 would leave two lists of the same length (and so a row that lines up, with keys):
 * the organisation cell has 300 items of ten characters (3,299 characters) against the 182 labels
 * that a cut leaves items for, the categorisation cell has 223 labels (2,006 characters) against
 * 223 items of seven characters (1,783). A list cell over the cap is no list: the row gives no key.
 */
const OVER_THE_CAP = {
  organisation: {
    Organization: Array.from({ length: 300 }, (_, at) => `Org${String(at).padStart(7, "0")}`).join(
      ",",
    ),
    "Organization categorization": Array.from({ length: 182 }, () => "Industry").join(","),
  },
  categorisation: {
    Organization: Array.from({ length: 223 }, (_, at) => `Org${String(at).padStart(4, "0")}`).join(
      ",",
    ),
    "Organization categorization": Array.from({ length: 223 }, () => "Industry").join(","),
  },
} as const;
type OverTheCap = keyof typeof OVER_THE_CAP;
const OVER_THE_CAP_KINDS: ReadonlyArray<[OverTheCap]> = [["organisation"], ["categorisation"]];
const overTheCap = (which: OverTheCap): string[] => rowOf(OVER_THE_CAP[which]);

const downloadOf = async (
  body: string | Buffer,
  over: Partial<FakeFile> = {},
): Promise<Snapshot> => {
  const fetch = fakeFetch({ [FILE_URL]: { body, contentType: "text/csv", ...over } });
  const result = await epochAiConnector.download(fetch, {});
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
  return { snapshot, parsed: epochAiConnector.parse(snapshot) };
}

const idsOf = (parsed: ParseResult): string[] =>
  parsed.records.map((record) => record.sourceRecordId).sort();

const recordOfId = (parsed: ParseResult, id: string): ParsedRecord => {
  const record = parsed.records.find((candidate) => candidate.sourceRecordId === id);
  if (record === undefined) throw new Error(`No record has the id ${id}.`);
  return record;
};

/** The keys that an Organization cell and its labels give, through the whole path. */
const keysOf = async (organization: string, categorization: string): Promise<string[]> =>
  idsOf(
    (
      await runOf([
        rowOf({ Organization: organization, "Organization categorization": categorization }),
      ])
    ).parsed,
  );

interface BodyRow {
  id: string;
  display: string;
  names: string[];
  models: number;
  firstYear: number | null;
  newestDay: string | null;
  frontier: number;
  openWeights: number;
  newest: Array<{ name: string; day: string | null }>;
  modified: string | null;
}

const bodyRowsOf = (snapshot: Snapshot): BodyRow[] =>
  (JSON.parse(snapshot.bodies[0]) as { rows: BodyRow[] }).rows;

const SENTENCE_TWO =
  "A record counts the AI models in Epoch AI's database that name this organisation among their developers; it describes model releases as Epoch classifies them and says nothing about their safety or the organisation's conduct.";
const CLOSING =
  "Source: Epoch AI, 'Data on AI models' (epoch.ai), Creative Commons Attribution; counted by VerifyWise, not endorsed by Epoch AI.";

describe("epochAiConnector", () => {
  describe("the connector", () => {
    it("is the connector of the list, in the snapshot form, with the mark of its records", () => {
      expect(epochAiConnector.id).toBe("epoch_ai");
      expect(epochAiConnector.kind).toBeUndefined();
      expect(Number.isInteger(epochAiConnector.version)).toBe(true);
      expect(epochAiConnector.version).toBeGreaterThanOrEqual(1);
      expect(MARK).toBe("Epoch AI Data on AI Models");
    });

    it("asks for the one file, as a CSV, within the limits of the list", async () => {
      const fetch = fakeFetch({ [FILE_URL]: { body: csvOf(FILLER), contentType: "text/csv" } });
      await epochAiConnector.download(fetch, {});
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
    it("is read into one record per organisation, from the 57 columns in order, with line breaks inside cells", async () => {
      const rows = [
        industryRow("Alpha Labs", {
          Model: "Alpha-1\nwith a line break in its name",
          Abstract: 'A text with a comma, a "quote" and\na line break',
          "Publication date": "2026-02-03",
        }),
        rowOf({
          ...developers(["Alpha Labs", "Industry"], ["Beta University", "Academia"]),
          Model: "Alpha-2",
          "Publication date": "2026-04-05",
          "Parameters notes": "first line\nsecond line, third",
        }),
      ];
      const { parsed } = await runOf(rows);

      expect(parsed.root).not.toBeNull();
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
      expect(idsOf(parsed)).toEqual(["alphalabs"]);
      expect(recordOfId(parsed, "alphalabs").identifiers).toMatchObject({
        organisation: "Alpha Labs",
        models: 2,
      });
      expect(recordOfId(parsed, "alphalabs").summary).toContain(
        "Newest: Alpha-2 (2026-04-05); Alpha-1 with a line break in its name (2026-02-03).",
      );
      expectWellFormedRecords(parsed.records, { sourceId: "epoch_ai", mark: MARK });
    });

    it("reads the same file with CRLF line ends and a byte order mark", async () => {
      const rows = [industryRow("Alpha Labs", { Model: "Alpha-1" })];
      const lf = await runOf(rows);
      const crlf = await runOf(rows, { eol: "\r\n" });
      expect(crlf.snapshot.bodies).toEqual(lf.snapshot.bodies);
      const text = csvOf([...rows, ...FILLER]);
      const withMark = await downloadOf(
        Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]),
      );
      expect(withMark.bodies).toEqual(lf.snapshot.bodies);
      const unterminated = await downloadOf(text.slice(0, -1));
      expect(unterminated.bodies).toEqual(lf.snapshot.bodies);
    });

    it("accepts a Content-Type with parameters", async () => {
      const snapshot = await downloadOf(csvOf([industryRow("Alpha Labs"), ...FILLER]), {
        contentType: "text/csv; charset=utf-8",
      });
      expect(epochAiConnector.parse(snapshot).records).toHaveLength(1);
    });

    it("is still the list with a 58th column, and finds the columns by name wherever they are", async () => {
      const added = [industryRow("Alpha Labs"), ...FILLER].map((row) => [...row, "ZZ-ADDED"]);
      const parsed = epochAiConnector.parse(
        await downloadOf(csvOf(added, [...COLUMNS, "Added later"])),
      );
      expect(parsed.errors).toBe(0);
      expect(idsOf(parsed)).toEqual(["alphalabs"]);
      expect(JSON.stringify(parsed.records)).not.toContain("ZZ-ADDED");

      const order = [...COLUMNS].reverse();
      const reordered = [industryRow("Alpha Labs"), ...FILLER].map((row) =>
        order.map((column) => row[COLUMNS.indexOf(column)]),
      );
      const again = epochAiConnector.parse(await downloadOf(csvOf(reordered, order)));
      expect(idsOf(again)).toEqual(["alphalabs"]);
    });

    it("finds a column whose name has blanks around it", async () => {
      const header = COLUMNS.map((name) => (name === "Organization" ? ` ${name} ` : name));
      const parsed = epochAiConnector.parse(
        await downloadOf(csvOf([industryRow("Alpha Labs"), ...FILLER], header)),
      );
      expect(idsOf(parsed)).toEqual(["alphalabs"]);
    });

    it("has a summary that begins with the mark, names the operator and says what it is not", async () => {
      const { parsed } = await runOf([industryRow("Alpha Labs")]);
      const [record] = parsed.records;
      expect(record.summary.startsWith(`${MARK} (epoch.ai), a register or status list.`)).toBe(
        true,
      );
      expect(record.summary).toContain(SENTENCE_TWO);
      expect(record.summary.endsWith(CLOSING)).toBe(true);
      expect(record.recordType).toBe("ai_model_developer");
    });
  });

  describe("the organisations of a row (rule O)", () => {
    it("keeps the organisations that Epoch labels Industry, by position", async () => {
      expect(await keysOf("Acme AI,Beta Labs", "Industry,Academia")).toEqual(["acmeai"]);
      expect(await keysOf("Beta Labs,Acme AI", "Academia,Industry")).toEqual(["acmeai"]);
      expect(await keysOf("Acme AI,Beta Labs", "Industry,Industry")).toEqual([
        "acmeai",
        "betalabs",
      ]);
      expect(await keysOf("Acme AI,Beta Labs", "Academia,Government")).toEqual([]);
      expect(await keysOf("Acme AI", "Think tank")).toEqual([]);
    });

    it("compares a label exactly, blanks around it aside", async () => {
      expect(await keysOf("Acme AI, Beta Labs", "Academia, Industry")).toEqual(["betalabs"]);
      expect(await keysOf("Acme AI", " Industry ")).toEqual(["acmeai"]);
      expect(await keysOf("Acme AI", "industry")).toEqual([]);
      expect(await keysOf("Acme AI", "Industrial")).toEqual([]);
      // A label that only begins with the word is another label.
      expect(await keysOf("Acme AI", "Industry and academia")).toEqual([]);
      expect(await keysOf("Acme AI", "Industry (private)")).toEqual([]);
    });

    it("gives no key when the two lists are of different lengths", async () => {
      // Two organisations, one label: the position of the label means nothing.
      const { parsed } = await runOf([
        ...Array.from({ length: 20 }, () => industryRow("Acme AI")),
        rowOf({
          Organization: "Beta Labs,Gamma Labs",
          "Organization categorization": "Industry",
        }),
        rowOf({ Organization: "Delta Labs", "Organization categorization": "Industry,Industry" }),
      ]);
      expect(idsOf(parsed)).toEqual(["acmeai"]);
    });

    it("gives no key to an organisation without a label", async () => {
      expect(await keysOf("Acme AI", "")).toEqual([]);
    });

    it("keeps a legal form that follows a comma in the name, and splits at any other comma", async () => {
      expect(await keysOf("Acme, Inc.", "Industry")).toEqual(["acme"]);
      expect(await keysOf("Acme,Inc", "Industry")).toEqual(["acme"]);
      expect(await keysOf("Acme Robotics, Ltd", "Industry")).toEqual(["acmerobotics"]);
      for (const form of [
        "LLC",
        "Corp.",
        "GmbH",
        "Co.",
        "SA",
        "AG",
        "PLC",
        "Limited",
        "Corporation",
      ]) {
        expect(await keysOf(`Acme Robotics, ${form}`, "Industry")).toEqual(["acmerobotics"]);
      }
      // A legal form is written as Epoch writes it: in another case the comma splits, and the two
      // items then meet one label.
      expect(await keysOf("Acme Robotics, inc", "Industry")).toEqual([]);
      expect(await keysOf("Acme Robotics, LTD", "Industry")).toEqual([]);
      // A word that only begins like a legal form is a name of its own.
      expect(await keysOf("Acme Robotics, Incredible Labs", "Industry,Industry")).toEqual([
        "acmerobotics",
        "incrediblelabs",
      ]);
      expect(await keysOf("Acme Robotics, Company Labs", "Industry,Industry")).toEqual([
        "acmerobotics",
        "companylabs",
      ]);
    });

    it("keys a name without its legal form, and with it", async () => {
      const { parsed } = await runOf([industryRow("Acme Robotics, Inc.")]);
      expect(idsOf(parsed)).toEqual(["acmerobotics"]);
      expect(recordOfId(parsed, "acmerobotics").matchKeys.sort()).toEqual([
        "name:acmerobotics",
        "name:acmeroboticsinc",
      ]);
    });

    it("ends the sentence of a name that ends with a full stop with that one full stop", async () => {
      const { parsed } = await runOf([industryRow("Acme Robotics, Inc.")]);
      const { summary } = recordOfId(parsed, "acmerobotics");
      expect(summary).toContain("Organisation as written: Acme Robotics, Inc. Models: 1");
      expect(summary).not.toContain("..");
    });

    it("cuts a parenthetical, an unclosed one to the end, and a legal form inside it does not split", async () => {
      expect(await keysOf("Acme AI (formerly Foo, Inc.)", "Industry")).toEqual(["acmeai"]);
      expect(await keysOf("Acme AI (formerly Foo", "Industry")).toEqual(["acmeai"]);
      expect(await keysOf("(a note) Acme AI", "Industry")).toEqual(["acmeai"]);
      expect(await keysOf("Acme(AI)Labs", "Industry")).toEqual(["acmelabs"]);
      // A full-width parenthesis is one like the others once the item is a line.
      expect(await keysOf(`Acme AI ${cp(0xff08)}formerly Foo${cp(0xff09)}`, "Industry")).toEqual([
        "acmeai",
      ]);
    });

    it("gives no key to a name of fewer than four letters and digits", async () => {
      for (const name of ["IBM", "xAI", "Z.ai", "AT&T", "Q4Z", "Wy", "Foo, Inc."]) {
        expect(await keysOf(name, "Industry")).toEqual([]);
      }
      expect(await keysOf("Lexi", "Industry")).toEqual(["lexi"]);
    });

    it("counts a model once for an organisation that its row names twice", async () => {
      const { parsed } = await runOf([
        rowOf(
          developers(["Acme AI", "Industry"], ["Acme AI", "Industry"], ["ACME AI", "Industry"]),
        ),
      ]);
      expect(recordOfId(parsed, "acmeai").identifiers).toMatchObject({ models: 1 });
    });

    it("counts a model for each of the organisations that its row names", async () => {
      const { parsed } = await runOf([
        rowOf(developers(["Alpha Labs", "Industry"], ["Beta Labs", "Industry"])),
        industryRow("Beta Labs"),
      ]);
      expect(recordOfId(parsed, "alphalabs").identifiers).toMatchObject({ models: 1 });
      expect(recordOfId(parsed, "betalabs").identifiers).toMatchObject({ models: 2 });
    });

    it("counts only the rows that label an organisation Industry, one row at a time", async () => {
      const { parsed } = await runOf([
        rowOf({ ...developers(["Gamma Labs", "Academia"]), Model: "Gamma-1" }),
        rowOf({ ...developers(["Gamma Labs", "Industry"]), Model: "Gamma-2" }),
      ]);
      expect(recordOfId(parsed, "gammalabs").identifiers).toMatchObject({ models: 1 });
      expect(recordOfId(parsed, "gammalabs").summary).toContain("Newest: Gamma-2 (2025-06-01).");
    });

    it("folds the compatibility forms and drops the characters nobody sees", async () => {
      expect(await keysOf(`${cp(0xff21, 0xff43, 0xff4d, 0xff45)} AI`, "Industry")).toEqual([
        "acmeai",
      ]);
      expect(await keysOf(`Acme${cp(0x200b)} AI`, "Industry")).toEqual(["acmeai"]);
      expect(await keysOf(`Acme${cp(0x07)} AI`, "Industry")).toEqual(["acmeai"]);
      expect(await keysOf("Acme\nAI", "Industry")).toEqual(["acmeai"]);
    });

    it("shows the most frequent spelling, ties by the order of the texts, and keeps five spellings at most", async () => {
      const spellings = [
        "Acme Bot",
        "ACME BOT",
        "AcmeBot",
        "Acme-Bot",
        "acme bot",
        "Acme.Bot",
        "Acme Bot",
      ];
      const { snapshot, parsed } = await runOf(spellings.map((name) => industryRow(name)));
      expect(recordOfId(parsed, "acmebot").identifiers).toMatchObject({ organisation: "Acme Bot" });
      const [row] = bodyRowsOf(snapshot);
      expect(row.names).toHaveLength(5);
      expect(new Set(row.names).size).toBe(5);
      expect(row.names[0]).toBe("Acme Bot");

      const tie = await runOf([industryRow("Zeta Bot"), industryRow("ZetaBot")]);
      expect(recordOfId(tie.parsed, "zetabot").identifiers).toMatchObject({
        organisation: "Zeta Bot",
      });
    });

    it("refuses a key of more than 160 characters, and keeps one of 160", async () => {
      const keep = "k".repeat(160);
      const { parsed } = await runOf([
        ...manyOrganisations(120),
        industryRow(keep),
        industryRow("j".repeat(161)),
        // An item of 256 characters is too long to be a name, whatever its key would be.
        industryRow(`Alpha ${"x".repeat(250)}`),
      ]);
      expect(parsed.records.some((record) => record.sourceRecordId === keep)).toBe(true);
      expect(parsed.records.some((record) => record.sourceRecordId.startsWith("j"))).toBe(false);
      expect(parsed.records.some((record) => record.sourceRecordId.startsWith("alpha"))).toBe(
        false,
      );
      expect(parsed.skipped).toBe(2);
      expect(parsed.errors).toBe(0);
    });

    it("reads an item of 200 characters and not one of 201, however short its key is", async () => {
      // Fifty words of three letters and a letter more: 200 characters with a key of 151 letters.
      const item = (length: number): string =>
        `${"abc ".repeat(50).trim()}${"d".repeat(length - 199)}`;
      expect(item(200)).toHaveLength(200);
      const { parsed } = await runOf([
        ...manyOrganisations(120),
        industryRow(item(200)),
        industryRow(item(201)),
      ]);
      expect(
        parsed.records.some((record) => record.sourceRecordId === `${"abc".repeat(50)}d`),
      ).toBe(true);
      expect(
        parsed.records.some((record) => record.sourceRecordId === `${"abc".repeat(50)}dd`),
      ).toBe(false);
      expect(parsed.skipped).toBe(1);
      expect(parsed.errors).toBe(0);
    });

    it("has too-long texts that a cut with one unit more would pass as whole: the premise of the next tests", () => {
      for (const text of [BLANK_AT_THE_CUT, PAIR_AT_THE_CUT]) {
        const naive = lineOf(text, 201);
        expect(text.length).toBeGreaterThan(201);
        expect(naive.length).toBeLessThanOrEqual(200);
        expect(naive.endsWith(SHORTENED)).toBe(true);
      }
      expect(EXPANDED_ITEM.length).toBeLessThanOrEqual(2_000);
      expect(lineOf(EXPANDED_ITEM, 2_001).endsWith(SHORTENED)).toBe(true);
    });

    it.each([
      ["a blank at the cut", BLANK_AT_THE_CUT],
      ["a pair of surrogates at the cut", PAIR_AT_THE_CUT],
      ["a cut inside the first clean of the item", EXPANDED_ITEM],
    ])(
      "counts an organisation item of more than 200 units with %s as unreadable, never as a cut name",
      async (_where, item) => {
        const { parsed } = await runOf([...manyOrganisations(120), industryRow(item)]);
        expect(parsed.records).toHaveLength(120);
        expect(parsed.skipped).toBe(1);
        expect(parsed.errors).toBe(0);
      },
    );

    it("reads an item that folds to 2,000 units and not one that folds to 2,001", async () => {
      // A parenthetical, then ten ligatures (U+FB03) of three letters each once folded: the name is
      // those thirty letters. The raw item is under the cap of a list cell; the folded one is on it.
      const item = (folded: number): string =>
        `(${"x".repeat(folded - 33)}) ${cp(0xfb03).repeat(10)}`;
      expect(lineOf(item(2_000), 5_000)).toHaveLength(2_000);
      expect(lineOf(item(2_001), 5_000)).toHaveLength(2_001);
      expect(item(2_001).length).toBeLessThanOrEqual(2_000);
      const { snapshot, parsed } = await runOf([
        ...manyOrganisations(120),
        industryRow(item(2_000)),
        industryRow(item(2_001)),
      ]);
      expect(bodyRowsOf(snapshot).find((row) => row.id === "ffi".repeat(10))?.models).toBe(1);
      expect(parsed.skipped).toBe(1);
      expect(parsed.errors).toBe(0);
    });

    it.each([
      ["a note in parentheses", "(a note)"],
      ["only hidden characters", `${cp(0x200b)}${cp(0x200d)}`],
    ])(
      "reads an organisation item that is %s as an item without a name, not as one that does not read",
      async (_what, item) => {
        const { parsed } = await runOf([...manyOrganisations(120), industryRow(item)]);
        expect(parsed.records).toHaveLength(120);
        expect(parsed.skipped).toBe(0);
        expect(parsed.errors).toBe(0);
      },
    );

    it.each([
      ["more than 200 units", `${cp(0x1f600)}${" abc".repeat(80)}`],
      ["more than 2,000 units once folded", `${cp(0x1f600)}${cp(0x3300).repeat(500)}`],
    ])(
      "counts an organisation item of %s that starts with a pair of surrogates as unreadable, not as an empty one",
      async (_size, item) => {
        // A cut to one unit cannot keep a pair, so it would give an empty line for these items.
        const { parsed } = await runOf([...manyOrganisations(120), industryRow(item)]);
        expect(parsed.records).toHaveLength(120);
        expect(parsed.skipped).toBe(1);
        expect(parsed.errors).toBe(0);
      },
    );

    describe("a text of more than LINE_INPUT_MAX units", () => {
      // No item can be that long through the reader: a list cell of more than 2,000 units is refused
      // before it is split, so the limit of the helper is tested on the helper itself.
      const textAfter = (blanks: number): string => `${" ".repeat(blanks)}Zorb`;

      it("has a text whose first megabyte is blank that the empty test of a cut to two units reads as empty: the premise of the next tests", () => {
        const text = textAfter(LINE_INPUT_MAX);
        expect(text.length).toBeGreaterThan(LINE_INPUT_MAX);
        expect(lineOf(text, 2)).toBe("");
      });

      it("is null for a text of more than LINE_INPUT_MAX units whose first megabyte is blank, never an empty text", () => {
        expect(uncutLineOf(textAfter(LINE_INPUT_MAX), 200)).toBeNull();
        // One unit more than the limit, the one unit beyond a blank first megabyte.
        expect(uncutLineOf(`${" ".repeat(LINE_INPUT_MAX)}Z`, 200)).toBeNull();
        // A text that is blank as far as it goes cannot be known to be empty either.
        expect(uncutLineOf(" ".repeat(LINE_INPUT_MAX + 1), 200)).toBeNull();
      });

      it("is null for a text of more than LINE_INPUT_MAX units that starts with a name, as before", () => {
        expect(uncutLineOf(`Zorb${" ".repeat(LINE_INPUT_MAX)}`, 200)).toBeNull();
      });

      it("reads a text of exactly LINE_INPUT_MAX units, and still says empty for an empty clean line", () => {
        expect(textAfter(LINE_INPUT_MAX - 4)).toHaveLength(LINE_INPUT_MAX);
        expect(uncutLineOf(textAfter(LINE_INPUT_MAX - 4), 200)).toBe("Zorb");
        expect(uncutLineOf(" ".repeat(LINE_INPUT_MAX), 200)).toBe("");
        expect(uncutLineOf("", 200)).toBe("");
        expect(uncutLineOf(`${cp(0x200b)}${cp(0x200d)}`, 200)).toBe("");
      });

      it("keeps its other rules: the clean line within the limit, null above it", () => {
        expect(uncutLineOf("  Alpha   Labs  ", 200)).toBe("Alpha Labs");
        expect(uncutLineOf("a".repeat(200), 200)).toBe("a".repeat(200));
        expect(uncutLineOf("a".repeat(201), 200)).toBeNull();
        expect(uncutLineOf(BLANK_AT_THE_CUT, 200)).toBeNull();
        expect(uncutLineOf(`${cp(0x1f600)}${" abc".repeat(80)}`, 200)).toBeNull();
      });

      /**
       * A text of `LINE_INPUT_MAX` units made of one blank character or a pair of them: the cleaning
       * takes every one out, or turns them all into one blank, so `lineOf` says that the text is
       * empty.
       */
      const NOTHING_VISIBLE: ReadonlyArray<[string, string]> = [
        ["hidden characters", cp(0x200b)],
        ["line breaks", "\n"],
        ["Braille pattern blanks", cp(0x2800)],
        ["tabs and no-break blanks", `\t${cp(0xa0)}`],
      ];
      const megabyteOf = (unit: string): string =>
        unit.repeat(Math.ceil(LINE_INPUT_MAX / unit.length)).slice(0, LINE_INPUT_MAX);

      it.each(NOTHING_VISIBLE)(
        "has a first megabyte of %s that the empty test of a cut to two units reads as empty: the premise of the next tests",
        (_what, unit) => {
          expect(megabyteOf(unit)).toHaveLength(LINE_INPUT_MAX);
          expect(lineOf(`${megabyteOf(unit)}Zorb`, 2)).toBe("");
        },
      );

      it.each(NOTHING_VISIBLE)(
        "is null for a text of more than LINE_INPUT_MAX units whose first megabyte is %s, never an empty text",
        (_what, unit) => {
          const text = `${megabyteOf(unit)}Zorb`;
          expect(text.length).toBeGreaterThan(LINE_INPUT_MAX);
          expect(uncutLineOf(text, 200)).toBeNull();
          // One unit beyond the first megabyte, and nothing visible in it either.
          expect(uncutLineOf(`${megabyteOf(unit)}${unit.slice(0, 1)}`, 200)).toBeNull();
          // The megabyte itself, with nothing beyond it, is a text that is known to be empty.
          expect(uncutLineOf(megabyteOf(unit), 200)).toBe("");
        },
      );
    });

    it("gives no key for a row whose organisation cell is over 2,000 characters: not a cut list, not the piece of a name", async () => {
      // 300 items of ten characters make 3,299 characters, and 182 labels line up with the first
      // 182 of them. A cut at 2,000 would leave 181 whole items and nine characters of the next, and
      // read the piece as a name: the cell is no list of this file, and the row gives nothing. No
      // real cell is near the cap (the longest has 759 characters).
      expect(OVER_THE_CAP.organisation.Organization).toHaveLength(3_299);
      const { parsed } = await runOf([
        ...Array.from({ length: 20 }, () => industryRow("Acme AI")),
        overTheCap("organisation"),
      ]);
      expect(idsOf(parsed)).toEqual(["acmeai"]);
      // The row does not line up; it is not a row that could not be read.
      expect(parsed.skipped).toBe(0);
      expect(parsed.errors).toBe(0);
    });

    it("gives no key when only the organisation cell is over 2,000 characters, though the lists would line up", async () => {
      // 20 items of 120 characters (2,419 characters) and 20 labels (179): read whole, they line up.
      const items = Array.from(
        { length: 20 },
        (_, at) => `Org${String(at).padStart(2, "0")}${"x".repeat(115)}`,
      );
      const labels = items.map(() => "Industry");
      expect(items.join(",")).toHaveLength(2_419);
      expect(labels.join(",")).toHaveLength(179);
      const { parsed } = await runOf([
        ...Array.from({ length: 20 }, () => industryRow("Acme AI")),
        rowOf({ Organization: items.join(","), "Organization categorization": labels.join(",") }),
      ]);
      expect(idsOf(parsed)).toEqual(["acmeai"]);
    });

    it("gives no key for a long row whose two lists line up: neither list is cut", async () => {
      // 300 items and 300 labels of eight characters: both cells are 2,699 characters. A cut at
      // 2,000 would leave 222 whole items of each and two characters of the next ("Or" and "In").
      const items = Array.from({ length: 300 }, (_, at) => `Org${String(at).padStart(5, "0")}`);
      const labels = items.map(() => "Industry");
      expect(items.join(",")).toHaveLength(2_699);
      expect(labels.join(",")).toHaveLength(2_699);
      const { parsed } = await runOf([
        ...Array.from({ length: 20 }, () => industryRow("Acme AI")),
        rowOf({ Organization: items.join(","), "Organization categorization": labels.join(",") }),
      ]);
      expect(idsOf(parsed)).toEqual(["acmeai"]);
    });

    it("gives no key for a row whose categorisation cell is over 2,000 characters: a label cut in two is no label", async () => {
      // 223 items of seven characters (1,783 characters) and 223 labels (2,006 characters). A cut
      // would leave 222 whole labels and "In", and read 222 organisations.
      expect(OVER_THE_CAP.categorisation.Organization).toHaveLength(1_783);
      expect(OVER_THE_CAP.categorisation["Organization categorization"]).toHaveLength(2_006);
      const { parsed } = await runOf([
        ...Array.from({ length: 20 }, () => industryRow("Acme AI")),
        overTheCap("categorisation"),
      ]);
      expect(idsOf(parsed)).toEqual(["acmeai"]);
      expect(parsed.skipped).toBe(0);
      expect(parsed.errors).toBe(0);
    });

    it("reads a list cell of 2,000 characters whole, and gives no key for one of 2,001, in either cell", async () => {
      // 222 items of eight characters and 222 labels. The first few of a list are one character
      // longer (a letter after the item, a blank after the label), so that the cell is as long as
      // the number of those says: 1,997 characters and one for each.
      const items = (longer: number): string =>
        Array.from(
          { length: 222 },
          (_, at) => `Org${String(at).padStart(5, "0")}${at < longer ? "x" : ""}`,
        ).join(",");
      const labels = (longer: number): string =>
        Array.from({ length: 222 }, (_, at) => (at < longer ? "Industry " : "Industry")).join(",");
      expect(items(3)).toHaveLength(2_000);
      expect(items(4)).toHaveLength(2_001);
      expect(labels(3)).toHaveLength(2_000);
      expect(labels(4)).toHaveLength(2_001);
      const idsOfCells = async (organization: string, categorization: string): Promise<string[]> =>
        idsOf(
          (
            await runOf([
              rowOf({ Organization: organization, "Organization categorization": categorization }),
            ])
          ).parsed,
        );

      const wholeItems = await idsOfCells(items(3), labels(0));
      expect(wholeItems).toHaveLength(222);
      expect(wholeItems).toContain("org00221");
      expect(await idsOfCells(items(4), labels(0))).toEqual([]);

      const wholeLabels = await idsOfCells(items(0), labels(3));
      expect(wholeLabels).toHaveLength(222);
      expect(wholeLabels).toContain("org00221");
      expect(await idsOfCells(items(0), labels(4))).toEqual([]);
    });

    it("reads a list whose items are broken over lines, and a legal form on the next line", async () => {
      expect(await keysOf("Alpha Labs,\nBeta Labs", "Industry,Industry")).toEqual([
        "alphalabs",
        "betalabs",
      ]);
      expect(await keysOf("Acme Robotics,\nInc.", "Industry")).toEqual(["acmerobotics"]);
    });
  });

  describe("what a record counts", () => {
    const zetacorp = (): string[][] => [
      industryRow("Zetacorp", {
        Model: "Zeta One",
        "Publication date": "2019-05-05",
        "Open model weights?": "No",
      }),
      industryRow("Zetacorp", {
        Model: "Zeta Two",
        "Publication date": "2026-09-21",
        "Frontier model": "True",
        "Open model weights?": "Yes",
      }),
      industryRow("Zetacorp", {
        Model: "Zeta Three",
        "Publication date": "2026-09-21",
        "Open model weights?": "Yes",
      }),
      industryRow("Zetacorp", {
        Model: "Zeta Four",
        "Publication date": "",
        "Frontier model": "True",
      }),
      rowOf({
        ...developers(["Zetacorp", "Industry"], ["Some University", "Academia"]),
        Model: "Zeta Five",
        "Publication date": "2024-01-02",
        "Open model weights?": "No",
      }),
    ];

    it("gives the counts of an organisation, and the exact text of its record", async () => {
      const { snapshot, parsed } = await runOf(zetacorp());
      const record = recordOfId(parsed, "zetacorp");

      expect(bodyRowsOf(snapshot)).toEqual([
        {
          id: "zetacorp",
          display: "Zetacorp",
          names: ["Zetacorp"],
          models: 5,
          firstYear: 2019,
          newestDay: "2026-09-21",
          frontier: 2,
          openWeights: 2,
          newest: [
            { name: "Zeta Three", day: "2026-09-21" },
            { name: "Zeta Two", day: "2026-09-21" },
            { name: "Zeta Five", day: "2024-01-02" },
          ],
          modified: "2025-03-14",
        },
      ]);
      expect(record.title).toBe(`${MARK}: Zetacorp`);
      expect(record.summary).toBe(
        [
          `${MARK} (epoch.ai), a register or status list.`,
          SENTENCE_TWO,
          "Organisation as written: Zetacorp.",
          "Models: 5, published 2019 to 2026-09-21; 2 marked frontier by Epoch (among the five largest by training compute at release), 2 with open weights.",
          "Newest: Zeta Three (2026-09-21); Zeta Two (2026-09-21); Zeta Five (2024-01-02).",
          CLOSING,
        ].join(" "),
      );
      expect(record.url).toBe(`${RECORD_URL}zetacorp`);
      expect(record.identifiers).toEqual({
        organisation: "Zetacorp",
        models: 5,
        frontier: 2,
        openWeights: 2,
      });
      expect(record.matchKeys).toEqual(["name:zetacorp"]);
      expect(record.publishedAt).toBe("2026-09-21");
      expect(record.sourceUpdatedAt).toBeNull();
      expectWellFormedRecords(parsed.records, { sourceId: "epoch_ai", mark: MARK });
    });

    it("puts the undated models last, and leaves the dates out of the sentence of years when there is none", async () => {
      const { parsed } = await runOf([
        industryRow("Undatedcorp", { Model: "U One", "Publication date": "" }),
        industryRow("Undatedcorp", { Model: "U Two", "Publication date": "" }),
        industryRow("Mixedcorp", { Model: "M Undated", "Publication date": "" }),
        industryRow("Mixedcorp", { Model: "M Dated", "Publication date": "2020-01-01" }),
      ]);
      const undated = recordOfId(parsed, "undatedcorp");
      expect(undated.summary).toContain("Models: 2; 0 marked frontier");
      expect(undated.summary).toContain("Newest: U One (undated); U Two (undated).");
      expect(undated.publishedAt).toBeNull();
      const mixed = recordOfId(parsed, "mixedcorp");
      expect(mixed.summary).toContain("Models: 2, published 2020 to 2020-01-01;");
      expect(mixed.summary).toContain("Newest: M Dated (2020-01-01); M Undated (undated).");
      expect(mixed.publishedAt).toBe("2020-01-01");
    });

    it("shows the three newest models only, newest first, ties by the order of the names", async () => {
      const { parsed } = await runOf(
        ["B", "D", "A", "C", "E"].map((letter, at) =>
          industryRow("Orderedcorp", {
            Model: `Model ${letter}`,
            "Publication date": at < 3 ? "2025-01-01" : `2025-01-0${at}`,
          }),
        ),
      );
      // B, D, A are dated 2025-01-01; C is 2025-01-03 and E 2025-01-04.
      expect(recordOfId(parsed, "orderedcorp").summary).toContain(
        "Newest: Model E (2025-01-04); Model C (2025-01-03); Model A (2025-01-01).",
      );
    });

    it("cuts a model name at 60 characters and an organisation at 80, and writes a name on one line", async () => {
      const long = `Model ${"x".repeat(100)}`;
      const organisation = `Longcorp ${"y".repeat(120)}`;
      const { parsed, snapshot } = await runOf([
        industryRow(organisation, { Model: long }),
        industryRow(organisation, { Model: "Name\nwith\r\nbreaks  and  blanks" }),
      ]);
      const [record] = parsed.records.filter((candidate) => candidate.title.includes("Longcorp"));
      expect(record.summary).toContain("Name with breaks and blanks");
      expect(record.summary).toContain(`${long.slice(0, 48)} [shortened] (2025-06-01)`);
      expect(record.title).toBe(`${MARK}: ${organisation.slice(0, 68)} [shortened]`);
      // The body holds the name as it is shown, and no more of it.
      const stored = bodyRowsOf(snapshot).find((row) => row.id === record.sourceRecordId);
      expect(stored?.newest[0].name).toBe(`${long.slice(0, 48)} [shortened]`);
    });

    it("writes the first year with four digits", async () => {
      const { parsed } = await runOf([
        industryRow("Ancientcorp", { Model: "A1", "Publication date": "0999-05-05" }),
        industryRow("Ancientcorp", { Model: "A2", "Publication date": "1951-08-03" }),
      ]);
      const record = recordOfId(parsed, "ancientcorp");
      expect(record.summary).toContain("Models: 2, published 0999 to 1951-08-03;");
      expect(record.publishedAt).toBe("1951-08-03");
    });

    it("reads a day that is not a real day as no day", async () => {
      const { parsed } = await runOf([
        industryRow("Zaycorp", { Model: "D1", "Publication date": "2026-02-30" }),
        industryRow("Zaycorp", { Model: "D2", "Publication date": "06/11/2026" }),
        industryRow("Zaycorp", { Model: "D3", "Publication date": " 2026-03-04 " }),
      ]);
      expect(recordOfId(parsed, "zaycorp").summary).toContain(
        "Newest: D3 (2026-03-04); D1 (undated); D2 (undated).",
      );
      expect(parsed.skipped).toBe(0);
    });

    it("counts the flags that Epoch writes, exactly: True is frontier and Yes is open weights", async () => {
      const { parsed } = await runOf([
        industryRow("Flagcorp", {
          Model: "F1",
          "Frontier model": "True",
          "Open model weights?": "Yes",
        }),
        industryRow("Flagcorp", {
          Model: "F2",
          "Frontier model": "true",
          "Open model weights?": "yes",
        }),
        industryRow("Flagcorp", {
          Model: "F3",
          "Frontier model": "False",
          "Open model weights?": "No",
        }),
        industryRow("Flagcorp", {
          Model: "F4",
          "Frontier model": " True ",
          "Open model weights?": "",
        }),
      ]);
      expect(recordOfId(parsed, "flagcorp").identifiers).toMatchObject({
        models: 4,
        frontier: 2,
        openWeights: 1,
      });
    });

    it("counts a record's models once, however many organisations they name", async () => {
      const { parsed } = await runOf([
        rowOf({
          ...developers(
            ["Alpha Labs", "Industry"],
            ["Beta Labs", "Industry"],
            ["Gamma Labs", "Industry"],
          ),
          "Frontier model": "True",
        }),
      ]);
      for (const id of ["alphalabs", "betalabs", "gammalabs"]) {
        expect(recordOfId(parsed, id).identifiers).toMatchObject({ models: 1, frontier: 1 });
      }
    });

    it("has the newest 'Last modified' day of the file as the version of the list", async () => {
      const { parsed, snapshot } = await runOf([
        industryRow("Alpha Labs", { "Last modified": "2026-08-17 18:42:07+00:00" }),
        industryRow("Beta Labs", { "Last modified": "2026-07-31T14:32:04Z" }),
        industryRow("Gamma Labs", { "Last modified": "not a day" }),
        industryRow("Delta Labs", { "Last modified": "2026-13-45 00:00:00+00:00" }),
      ]);
      expect(parsed.sourceVersion).toBe("2026-08-17");
      expect(bodyRowsOf(snapshot).every((row) => row.modified === "2026-08-17")).toBe(true);
      const none = await downloadOf(
        csvOf(
          [industryRow("Alpha Labs", { "Last modified": "" }), ...fillerRows(3_000)].map((row) =>
            row.map((cell, at) => (COLUMNS[at] === "Last modified" ? "" : cell)),
          ),
        ),
      );
      expect(epochAiConnector.parse(none).sourceVersion).toBeNull();
    });

    it("takes the newest of the days that the rows of a body hold as its version, whichever row comes first", () => {
      const row = (id: string, modified: string | null): Record<string, unknown> => ({
        id,
        display: id,
        names: [id],
        models: 1,
        firstYear: 2025,
        newestDay: "2025-06-01",
        frontier: 0,
        openWeights: 0,
        newest: [{ name: "M", day: "2025-06-01" }],
        modified,
      });
      const bodyOf = (rows: unknown[]): Snapshot => ({
        bodies: [JSON.stringify({ v: 1, rows, total: 5_000, unreadable: 0 })],
        etag: null,
        lastModified: null,
        bytes: 0,
      });
      const mixed = epochAiConnector.parse(
        bodyOf([
          row("alphalabs", "2026-01-01"),
          row("betalabs", "2026-08-17"),
          row("gammalabs", null),
          row("deltalabs", "2026-05-05"),
        ]),
      );
      expect(mixed.sourceVersion).toBe("2026-08-17");
      expect(epochAiConnector.parse(bodyOf([row("alphalabs", null)])).sourceVersion).toBeNull();
    });

    it("gives records with a different address each, whose address is the page of the organisation", async () => {
      const { parsed } = await runOf([
        industryRow("Alpha Labs"),
        industryRow("Beta Labs"),
        industryRow("Gamma Labs"),
      ]);
      const urls = parsed.records.map((record) => record.url);
      expect(new Set(urls).size).toBe(parsed.records.length);
      for (const record of parsed.records) {
        expect(record.url).toBe(`${RECORD_URL}${encodeURIComponent(record.sourceRecordId)}`);
      }
    });

    it("writes the address of an organisation whose key is not ASCII with percent escapes", async () => {
      const { parsed } = await runOf([industryRow(`Caf${cp(0xe9)} Labs`)]);
      expect(parsed.records[0].sourceRecordId).toBe(`caf${cp(0xe9)}labs`);
      expect(parsed.records[0].url).toBe(`${RECORD_URL}caf%C3%A9labs`);
    });

    describe("the organisation of the identifiers is the whole first spelling", () => {
      /**
       * Names that the title cuts at 80 units (67 are kept, and a marker): one that is over the cut, one
       * with a blank at its 68th unit (the cut takes it off), one with a pair of surrogates at its 68th
       * and 69th (the cut never splits a pair). None holds a comma, which splits an Organization cell.
       */
      const NAMES: ReadonlyArray<[string, string]> = [
        ["a name over the cut", `Zorb${" abcd".repeat(30)}`],
        ["a blank at the cut", `${"a".repeat(67)} ${"b".repeat(60)}`],
        ["a pair of surrogates at the cut", `${"a".repeat(67)}${cp(0x1f600)}${"b".repeat(60)}`],
      ];

      it("has names that the title cuts, and a cut that a name under it does not need: the premise of the next tests", () => {
        for (const [, name] of NAMES) {
          expect(name.length).toBeGreaterThan(80);
          expect(name.length).toBeLessThanOrEqual(200);
          expect(lineOf(name, 80).endsWith(SHORTENED)).toBe(true);
        }
        expect(lineOf("Zorb abcd", 80)).toBe("Zorb abcd");
      });

      it.each(NAMES)(
        "keeps the whole name in the identifiers and in the names, and cuts it in the title and the text only: %s",
        async (_where, name) => {
          const { snapshot, parsed } = await runOf([industryRow(name)]);
          const [row] = bodyRowsOf(snapshot);
          const record = recordOfId(parsed, row.id);
          expect(row.names[0]).toBe(name);
          expect(record.identifiers.organisation).toBe(name);
          expect(String(record.identifiers.organisation)).not.toContain("[shortened]");
          expect(record.title).toBe(`${MARK}: ${lineOf(name, 80)}`);
          expect(record.title.endsWith(SHORTENED)).toBe(true);
          expect(record.summary).toContain(`Organisation as written: ${lineOf(name, 80)}.`);
          expect(record.summary).not.toContain(name);
        },
      );

      it("keeps a name of 80 units, and one of 200, whole in the identifiers", async () => {
        const eighty = `Zorb${"x".repeat(76)}`;
        // Words of three letters: 200 units with a key of 151 letters, under the cap of keys.
        const twoHundred = `Quar${" abc".repeat(49)}`;
        expect(eighty).toHaveLength(80);
        expect(twoHundred).toHaveLength(200);
        const { parsed } = await runOf([industryRow(eighty), industryRow(twoHundred)]);
        const organisations = parsed.records.map((record) => record.identifiers.organisation);
        expect(organisations).toContain(eighty);
        expect(organisations).toContain(twoHundred);
      });

      it("keeps the angle brackets of a name out of the identifiers, as before", async () => {
        const { parsed } = await runOf([industryRow(`<b>Zorb${" abcd".repeat(30)}`)]);
        const [record] = parsed.records;
        expect(JSON.stringify(record.identifiers)).not.toMatch(/[<>]/);
        expect(String(record.identifiers.organisation).length).toBeGreaterThan(80);
      });
    });
  });

  describe("the worst case", () => {
    const worstRow = {
      id: "k".repeat(160),
      display: "D".repeat(200),
      names: ["D".repeat(200), "E".repeat(200), "F".repeat(200), "G".repeat(200), "H".repeat(200)],
      models: 20_000,
      firstYear: 1950,
      newestDay: "2026-09-21",
      frontier: 20_000,
      openWeights: 20_000,
      newest: [
        { name: "M".repeat(200), day: "2026-09-21" },
        { name: "N".repeat(200), day: "2026-09-21" },
        { name: "O".repeat(200), day: "2026-09-21" },
      ],
      modified: "2026-08-17",
    };

    it("is under the limit of a summary, keeps its second sentence and its closing sentence", () => {
      const snapshot: Snapshot = {
        bodies: [JSON.stringify({ v: 1, rows: [worstRow], total: 20_000, unreadable: 0 })],
        etag: null,
        lastModified: null,
        bytes: 0,
      };
      const parsed = epochAiConnector.parse(snapshot);
      expect(parsed.errors).toBe(0);
      const [record] = parsed.records;
      expect(record.summary.length).toBeLessThanOrEqual(RECORD_SUMMARY_MAX);
      expect(record.summary.length).toBeLessThan(1_100);
      expect(record.summary).toContain(SENTENCE_TWO);
      expect(record.summary.endsWith(CLOSING)).toBe(true);
      expect(record.summary).toContain("[shortened]");
      expect(record.title.length).toBeLessThanOrEqual(200);
      expect(record.title.startsWith(`${MARK}: `)).toBe(true);
      expectWellFormedRecords(parsed.records, { sourceId: "epoch_ai", mark: MARK });
    });
  });

  describe("the columns", () => {
    it.each(USED.map((column) => [column]))(
      "is not the list without the column %s",
      async (column) => {
        const header = COLUMNS.filter((name) => name !== column);
        const rows = FILLER.map((row) => row.filter((_, at) => COLUMNS[at] !== column));
        const error = await failureOf(downloadOf(csvOf(rows, header)));
        expect(error).toBeInstanceOf(NotTheListError);
      },
    );

    it("is not the list when a column is spelled differently", async () => {
      const header = COLUMNS.map((name) => (name === "Organization" ? "Organisation" : name));
      const error = await failureOf(downloadOf(csvOf(FILLER, header)));
      expect(error).toBeInstanceOf(NotTheListError);
    });

    it("is still the list without a column that it does not read", async () => {
      const dropped: readonly Column[] = ["Authors", "Abstract", "Hugging Face developer id"];
      const header = COLUMNS.filter((name) => !dropped.includes(name));
      const rows = [industryRow("Alpha Labs"), ...FILLER].map((row) =>
        row.filter((_, at) => !dropped.includes(COLUMNS[at])),
      );
      const parsed = epochAiConnector.parse(await downloadOf(csvOf(rows, header)));
      expect(parsed.errors).toBe(0);
      expect(idsOf(parsed)).toEqual(["alphalabs"]);
    });

    it("is not the list when the header has a column more and every row is of the old width", async () => {
      // The header grew, the rows did not: nothing can be read, and the list fails instead of being empty.
      const error = await failureOf(downloadOf(csvOf(FILLER, [...COLUMNS, "Added later"])));
      expect(error).toBeInstanceOf(NotTheListError);
    });
  });

  describe("the names of the models", () => {
    it("is not the list when a model name is used twice, however it is spelled", async () => {
      const twice = await failureOf(
        downloadOf(
          csvOf([
            industryRow("Alpha Labs", { Model: "Alpha" }),
            industryRow("Beta Labs", { Model: "Alpha" }),
            ...FILLER,
          ]),
        ),
      );
      expect(twice).toBeInstanceOf(NotTheListError);
      const spelled = await failureOf(
        downloadOf(
          csvOf([
            industryRow("Alpha Labs", { Model: "Alpha Model" }),
            industryRow("Beta Labs", { Model: ` Alpha${cp(0xa0)} \n Model ` }),
            ...FILLER,
          ]),
        ),
      );
      expect(spelled).toBeInstanceOf(NotTheListError);
    });

    it("takes names that differ by a letter, or by the case of one, for different models", async () => {
      const parsed = epochAiConnector.parse(
        await downloadOf(
          csvOf([
            industryRow("Alpha Labs", { Model: "Alpha" }),
            industryRow("Beta Labs", { Model: "alpha" }),
            ...FILLER,
          ]),
        ),
      );
      expect(idsOf(parsed)).toEqual(["alphalabs", "betalabs"]);
    });

    it("counts a row without a model name as unreadable, and so a name too long to be one", async () => {
      const { parsed } = await runOf([
        ...manyOrganisations(120),
        industryRow("Alpha Labs", { Model: "" }),
        industryRow("Beta Labs", { Model: "x".repeat(250) }),
        industryRow("Gamma Labs", { Model: "Gamma-1" }),
      ]);
      expect(idsOf(parsed)).toContain("gammalabs");
      expect(idsOf(parsed)).not.toContain("alphalabs");
      expect(idsOf(parsed)).not.toContain("betalabs");
      expect(parsed.skipped).toBe(2);
      expect(parsed.errors).toBe(0);
    });

    it("reads a model name of 200 characters and not one of 201", async () => {
      const name = (length: number): string => `M${"x".repeat(length - 1)}`;
      const { parsed } = await runOf([
        ...manyOrganisations(120),
        industryRow("Alpha Labs", { Model: name(200) }),
        industryRow("Beta Labs", { Model: name(201) }),
      ]);
      expect(idsOf(parsed)).toContain("alphalabs");
      expect(idsOf(parsed)).not.toContain("betalabs");
      expect(parsed.skipped).toBe(1);
      expect(parsed.errors).toBe(0);
    });

    it.each([
      ["a blank", BLANK_AT_THE_CUT],
      ["a pair of surrogates", PAIR_AT_THE_CUT],
    ])(
      "counts a model name of more than 200 units with %s at the cut as unreadable, never as a cut name",
      async (_where, model) => {
        const { parsed } = await runOf([
          ...manyOrganisations(120),
          industryRow("Alpha Labs", { Model: model }),
          industryRow("Gamma Labs", { Model: "Gamma-1" }),
        ]);
        expect(idsOf(parsed)).toContain("gammalabs");
        expect(idsOf(parsed)).not.toContain("alphalabs");
        expect(parsed.skipped).toBe(1);
        expect(parsed.errors).toBe(0);
      },
    );

    it("does not take two long names that begin alike for one: the check is on the whole name", async () => {
      const stem = `Model ${"x".repeat(80)}`;
      const parsed = epochAiConnector.parse(
        await downloadOf(
          csvOf([
            industryRow("Alpha Labs", { Model: `${stem} one` }),
            industryRow("Alpha Labs", { Model: `${stem} two` }),
            ...FILLER,
          ]),
        ),
      );
      expect(recordOfId(parsed, "alphalabs").identifiers).toMatchObject({ models: 2 });
    });
  });

  describe("rows that do not read", () => {
    const aligned = (count: number): string[][] =>
      Array.from({ length: count }, () => industryRow("Acme AI"));
    const misaligned = (count: number): string[][] =>
      Array.from({ length: count }, () =>
        rowOf({ Organization: "Beta Labs,Gamma Labs", "Organization categorization": "Industry" }),
      );

    it("counts a row narrower or wider than the header as unreadable", async () => {
      const narrow = industryRow("Alpha Labs").slice(0, 56);
      const wide = [...industryRow("Beta Labs"), "ZZ-EXTRA"];
      const { parsed } = await runOf([
        ...Array.from({ length: 120 }, (_, at) =>
          industryRow(`Org${String(at).padStart(3, "0")} Labs`),
        ),
        narrow,
        wide,
      ]);
      expect(parsed.skipped).toBe(2);
      expect(parsed.errors).toBe(0);
      expect(idsOf(parsed)).not.toContain("alphalabs");
      expect(idsOf(parsed)).not.toContain("betalabs");
      expect(JSON.stringify(parsed.records)).not.toContain("ZZ-EXTRA");
    });

    it("tolerates ten of them and fails the sync at eleven", async () => {
      const bad = (count: number): string[][] =>
        Array.from({ length: count }, () => industryRow("Alpha Labs", { Model: "" }));
      const many = Array.from({ length: 120 }, (_, at) =>
        industryRow(`Org${String(at).padStart(3, "0")} Labs`),
      );
      const ten = (await runOf([...many, ...bad(10)])).parsed;
      expect(ten.skipped).toBe(10);
      expect(ten.errors).toBe(0);
      const eleven = (await runOf([...many, ...bad(11)])).parsed;
      expect(eleven.errors).toBe(11);
      expect(eleven.skipped).toBe(0);
    });

    it("is not the list when under 90 % of the rows with an organisation line up, and is when 90 % do", async () => {
      const header = COLUMNS;
      const build = (good: number, bad: number): string =>
        csvOf([...aligned(good), ...misaligned(bad), ...fillerRows(3_000)], header);
      const ok = await downloadOf(build(90, 10));
      expect(epochAiConnector.parse(ok).errors).toBe(0);
      const refused = await failureOf(downloadOf(build(89, 11)));
      expect(refused).toBeInstanceOf(NotTheListError);
      const worse = await failureOf(downloadOf(build(10, 90)));
      expect(worse).toBeInstanceOf(NotTheListError);
    });

    it("counts a row with an organisation and no label as one that does not line up", async () => {
      const bare = Array.from({ length: 20 }, () =>
        rowOf({ Organization: "Beta Labs", "Organization categorization": "" }),
      );
      const refused = await failureOf(
        downloadOf(csvOf([...aligned(60), ...bare, ...fillerRows(3_000)])),
      );
      expect(refused).toBeInstanceOf(NotTheListError);
    });

    const withOverTheCap = (which: OverTheCap, good: number, bad: number): string =>
      csvOf([
        ...aligned(good),
        ...Array.from({ length: bad }, () => overTheCap(which)),
        ...fillerRows(3_000),
      ]);

    it.each(OVER_THE_CAP_KINDS)(
      "counts a row with the %s cell over 2,000 characters as one that does not line up, and not as unreadable",
      async (which) => {
        // A tenth of the rows with an organisation is the most that may not line up.
        const parsed = epochAiConnector.parse(await downloadOf(withOverTheCap(which, 90, 10)));
        expect(idsOf(parsed)).toEqual(["acmeai"]);
        expect(recordOfId(parsed, "acmeai").identifiers).toMatchObject({ models: 90 });
        expect(parsed.skipped).toBe(0);
        expect(parsed.errors).toBe(0);
      },
    );

    it.each(OVER_THE_CAP_KINDS)(
      "is not the list when more than a tenth of the rows with an organisation have the %s cell over 2,000 characters",
      async (which) => {
        const refused = await failureOf(downloadOf(withOverTheCap(which, 89, 11)));
        expect(refused).toBeInstanceOf(NotTheListError);
        const worse = await failureOf(downloadOf(withOverTheCap(which, 10, 90)));
        expect(worse).toBeInstanceOf(NotTheListError);
      },
    );

    it("leaves the rows without an organisation out of the check", async () => {
      const parsed = epochAiConnector.parse(
        await downloadOf(csvOf([...aligned(20), ...fillerRows(3_000)])),
      );
      expect(idsOf(parsed)).toEqual(["acmeai"]);
    });

    it("is not the list when no row names an organisation: the column is there and empty", async () => {
      const error = await failureOf(downloadOf(csvOf(fillerRows(3_000))));
      expect(error).toBeInstanceOf(NotTheListError);
    });

    it("gives no record, and no failure of the read, when no organisation is one of industry", async () => {
      const parsed = epochAiConnector.parse(
        await downloadOf(csvOf([...academicRows(100), ...fillerRows(3_000)])),
      );
      expect(parsed.records).toEqual([]);
      expect(parsed.errors).toBe(0);
      expect(parsed.sourceVersion).toBeNull();
    });

    describe("a flag cell of more than LINE_INPUT_MAX units", () => {
      /** A flag, a megabyte of blanks and another flag: the first megabyte says one thing, the cell another. */
      const SHAPES: ReadonlyArray<[string, string]> = [
        ["No, a megabyte of blanks and Yes", `No${" ".repeat(LINE_INPUT_MAX)}Yes`],
        ["Yes, a megabyte of blanks and No", `Yes${" ".repeat(LINE_INPUT_MAX)}No`],
        ["False, a megabyte of blanks and True", `False${" ".repeat(LINE_INPUT_MAX)}True`],
        ["True, a megabyte of blanks and False", `True${" ".repeat(LINE_INPUT_MAX)}False`],
      ];
      const FLAG_COLUMNS = ["Frontier model", "Open model weights?"] as const;
      type FlagColumn = (typeof FLAG_COLUMNS)[number];

      const flagged = (column: FlagColumn, cell: string): Partial<Record<Column, string>> =>
        column === "Frontier model" ? { "Frontier model": cell } : { "Open model weights?": cell };

      const CASES = FLAG_COLUMNS.flatMap((column) =>
        SHAPES.map(([shape, cell]): [FlagColumn, string, string] => [column, shape, cell]),
      );

      it("has cells whose first megabyte reads as a flag, and the cell as a whole does not: the premise of the next tests", () => {
        for (const [, cell] of SHAPES) {
          expect(cell.length).toBeGreaterThan(LINE_INPUT_MAX);
          expect(["no", "yes", "false", "true"]).toContain(lineOf(cell, 8).toLowerCase());
        }
      });

      it.each(CASES)(
        "counts a row whose %s cell is %s as a row that does not read, never as the flag of its first megabyte",
        async (column, _shape, cell) => {
          const { snapshot, parsed } = await runOf([
            ...manyOrganisations(120),
            industryRow("Zorb Labs", {
              "Last modified": "2031-01-01 00:00:00+00:00",
              ...flagged(column, cell),
            }),
          ]);
          expect(parsed.records).toHaveLength(120);
          expect(idsOf(parsed)).not.toContain("zorblabs");
          expect(parsed.skipped).toBe(1);
          expect(parsed.errors).toBe(0);
          expect((JSON.parse(snapshot.bodies[0]) as { unreadable: number }).unreadable).toBe(1);
          // The day of the row that does not read is not the version of the list.
          expect(parsed.sourceVersion).toBe("2025-03-14");
        },
      );

      it("keeps nothing of a row that does not read, not even its model name: the key of the list is that of the rows that read", async () => {
        const { parsed } = await runOf([
          ...manyOrganisations(120),
          industryRow("Zorb Labs", { Model: "Zorb One", "Frontier model": SHAPES[0][1] }),
          industryRow("Quark Labs", { Model: "Zorb One" }),
        ]);
        expect(parsed.records).toHaveLength(121);
        expect(recordOfId(parsed, "quarklabs").identifiers).toMatchObject({
          models: 1,
          frontier: 0,
          openWeights: 0,
        });
        expect(idsOf(parsed)).not.toContain("zorblabs");
        expect(parsed.skipped).toBe(1);
      });

      it("refuses a row with a flag cell that is too long before it asks whether its model was named before", async () => {
        const { parsed } = await runOf([
          ...manyOrganisations(120),
          industryRow("Quark Labs", { Model: "Zorb One" }),
          industryRow("Zorb Labs", { Model: "Zorb One", "Open model weights?": SHAPES[1][1] }),
        ]);
        expect(parsed.records).toHaveLength(121);
        expect(idsOf(parsed)).toContain("quarklabs");
        expect(idsOf(parsed)).not.toContain("zorblabs");
        expect(parsed.skipped).toBe(1);
      });

      it.each(CASES)(
        "counts a row without an organisation, with its %s cell like that, as a row that does not read too (%s)",
        async (column, _shape, cell) => {
          const { parsed } = await runOf([
            ...manyOrganisations(120),
            rowOf({ Model: "Zorb One", ...flagged(column, cell) }),
          ]);
          expect(parsed.records).toHaveLength(120);
          expect(parsed.skipped).toBe(1);
          expect(parsed.errors).toBe(0);
        },
      );

      it.each(FLAG_COLUMNS.map((column) => [column]))(
        "reads a %s cell of exactly LINE_INPUT_MAX units, and refuses one of a unit more",
        async (column) => {
          const exact = `${column === "Frontier model" ? "True" : "Yes"}${" ".repeat(
            LINE_INPUT_MAX - (column === "Frontier model" ? 4 : 3),
          )}`;
          expect(exact).toHaveLength(LINE_INPUT_MAX);
          const whole = await runOf([
            ...manyOrganisations(120),
            industryRow("Zorb Labs", flagged(column, exact)),
          ]);
          expect(recordOfId(whole.parsed, "zorblabs").identifiers).toMatchObject(
            column === "Frontier model"
              ? { frontier: 1, openWeights: 0 }
              : { frontier: 0, openWeights: 1 },
          );
          expect(whole.parsed.skipped).toBe(0);

          const over = await runOf([
            ...manyOrganisations(120),
            industryRow("Zorb Labs", flagged(column, `${exact} `)),
          ]);
          expect(idsOf(over.parsed)).not.toContain("zorblabs");
          expect(over.parsed.skipped).toBe(1);
          expect(over.parsed.errors).toBe(0);
        },
      );
    });
  });

  describe("the size of the list", () => {
    it("is not the list below 3,000 rows, and is from 3,000", async () => {
      const short = await failureOf(downloadOf(csvOf(rowsOfCount(2_999))));
      expect(short).toBeInstanceOf(NotTheListError);
      const floor = await downloadOf(csvOf(rowsOfCount(3_000)));
      expect(JSON.parse(floor.bodies[0]).total).toBe(3_000);
    });

    it("is read up to 20,000 rows, and one row more is a list that is too large, never a shorter one", async () => {
      const full = await downloadOf(csvOf(rowsOfCount(20_000)));
      expect(JSON.parse(full.bodies[0]).total).toBe(20_000);
      const over = await failureOf(downloadOf(csvOf(rowsOfCount(20_001))));
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
      const text = csvOf([
        ...FILLER,
        industryRow("Alpha Labs", { Abstract: "ZZ, a cell with a comma that ends here" }),
      ]);
      const cutAt = text.lastIndexOf("a cell with");
      const error = await failureOf(downloadOf(text.slice(0, cutAt + 6)));
      expect(error).toBeInstanceOf(BodyTooLargeError);
    });

    it("reads a list that names more organisations than it has rows, under the cap, with the total of its entities", async () => {
      // 1,000 rows that name four organisations of industry each, behind 2,100 rows that name
      // none: 4,000 organisations out of 3,100 rows. A row can name several entities, so the
      // entities may outnumber the rows; the total of the reader is the larger of the rows it saw
      // and its entities, because the kit refuses a body whose total is below them.
      const fourEach = Array.from({ length: 1_000 }, (_, at) =>
        rowOf(
          developers(
            ...[0, 1, 2, 3].map((offset): [string, string] => [
              `Org${String(at * 4 + offset).padStart(5, "0")} Labs`,
              "Industry",
            ]),
          ),
        ),
      );
      const rows = [...fourEach, ...fillerRows(2_100)];
      expect(rows).toHaveLength(3_100);
      const snapshot = await downloadOf(csvOf(rows));
      expect(bodyRowsOf(snapshot)).toHaveLength(4_000);
      expect(JSON.parse(snapshot.bodies[0])).toMatchObject({ total: 4_000, unreadable: 0 });
      const parsed = epochAiConnector.parse(snapshot);
      expect(parsed.records).toHaveLength(4_000);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
    });

    it("counts the rows that it could not read in the total, with the organisations that it read", async () => {
      // 3,090 rows that read, five of them naming two organisations: 3,095 organisations. Ten rows
      // have no model name: 3,100 rows in all. The organisations alone do not outnumber the rows,
      // but the organisations and the rows that could not be read do: 3,105.
      const readable = Array.from({ length: 3_090 }, (_, at) =>
        rowOf(
          developers(
            ...(at < 5 ? ["a", "b"] : ["a"]).map((suffix): [string, string] => [
              `Org${String(at).padStart(4, "0")}${suffix} Labs`,
              "Industry",
            ]),
          ),
        ),
      );
      const nameless = Array.from({ length: 10 }, () => industryRow("Acme AI", { Model: "" }));
      const snapshot = await downloadOf(csvOf([...readable, ...nameless]));
      expect(JSON.parse(snapshot.bodies[0])).toMatchObject({ total: 3_105, unreadable: 10 });
      const parsed = epochAiConnector.parse(snapshot);
      expect(parsed.records).toHaveLength(3_095);
      expect(parsed.skipped).toBe(10);
      expect(parsed.errors).toBe(0);
    });

    it("still refuses more than 5,000 organisations when they outnumber the rows: the cap on entities decides", async () => {
      const rows = Array.from({ length: 1_000 }, (_, at) =>
        rowOf(
          developers(
            ...[0, 1, 2, 3, 4, 5].map((offset): [string, string] => [
              `Org${String(at * 6 + offset).padStart(5, "0")} Labs`,
              "Industry",
            ]),
          ),
        ),
      );
      // 1,000 rows of six organisations make 6,000 records out of 4,060 rows: more than the cap,
      // and more than the rows too.
      const error = await failureOf(downloadOf(csvOf([...rows, ...FILLER])));
      expect(error).toBeInstanceOf(NotTheListError);
    });

    it("reads 5,000 organisations and refuses 5,001: the reader keeps no more than any real list has", async () => {
      const organisations = (count: number): string[][] =>
        Array.from({ length: count }, (_, at) =>
          industryRow(`Org${String(at).padStart(5, "0")} Labs`),
        );
      const full = await downloadOf(csvOf([...organisations(5_000), ...FILLER]));
      expect(bodyRowsOf(full)).toHaveLength(5_000);
      const over = await failureOf(downloadOf(csvOf([...organisations(5_001), ...FILLER])));
      expect(over).toBeInstanceOf(NotTheListError);
    });
  });

  describe("a file that is not the list", () => {
    it.each<[string, string]>([
      [
        "a page of HTML",
        "<!DOCTYPE html><html><head><title>Maintenance</title></head><body></body></html>",
      ],
      ["a JSON document", '{"models": [], "total": 0}'],
      ["an empty file", ""],
      ["only line breaks", "\n\n"],
      [
        "another CSV",
        "Name,Organization (from Organizations),Company type\nAcme,Acme,Foundation\n",
      ],
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
        "https://evil.example.org/data/all_ai_models.csv",
        "https://www.epoch.ai/data/all_ai_models.csv",
        "https://epoch.ai.evil.example/data/all_ai_models.csv",
        "https://epoch.ai/other/all_ai_models.csv",
        "https://epoch.ai/database/all_ai_models.csv",
        "http://epoch.ai/data/all_ai_models.csv",
        "https://user:pass@epoch.ai/data/all_ai_models.csv",
        "https://epoch.ai:8443/data/all_ai_models.csv",
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
      const snapshot = await downloadOf(csvOf([industryRow("Alpha Labs"), ...FILLER]), {
        url: "https://epoch.ai/data/other/all_ai_models.csv",
      });
      expect(idsOf(epochAiConnector.parse(snapshot))).toEqual(["alphalabs"]);
    });
  });

  describe("the validators", () => {
    const ETAG = 'W/"3c9e1b7a5d2f40869a1e7c0b4d6f8a25"';

    it("answers unchanged to a 304 through the weak etag that the first download stored", async () => {
      const fetch = fakeFetch({
        [FILE_URL]: { body: csvOf(FILLER), contentType: "text/csv", etag: ETAG },
      });
      const first = await epochAiConnector.download(fetch, {});
      if (first === "unchanged") throw new Error("A first download is never unchanged.");
      // The etag of the snapshot carries the version of the reading before the server's own.
      expect(first.etag).toBe(`k${epochAiConnector.version}:${ETAG}`);

      const again = await epochAiConnector.download(fetch, {
        etag: first.etag,
        lastModified: first.lastModified,
      });
      expect(again).toBe("unchanged");
      expect(fetch.calls[1].validators).toEqual({ etag: ETAG, lastModified: null });
    });

    it("sends no validators for a snapshot of another reading, so that the new reading parses the file", async () => {
      const fetch = fakeFetch({
        [FILE_URL]: { body: csvOf(FILLER), contentType: "text/csv", etag: ETAG },
      });
      const again = await epochAiConnector.download(fetch, {
        etag: `k0:${ETAG}`,
        lastModified: null,
      });
      expect(again).not.toBe("unchanged");
      expect(fetch.calls[0].validators).toEqual({});
    });

    it("reads the file again when the etag changed", async () => {
      const fetch = fakeFetch({
        [FILE_URL]: { body: csvOf(FILLER), contentType: "text/csv", etag: 'W/"other"' },
      });
      const again = await epochAiConnector.download(fetch, {
        etag: `k${epochAiConnector.version}:${ETAG}`,
        lastModified: null,
      });
      expect(again).not.toBe("unchanged");
    });

    it("refuses a 304 that comes from another host", async () => {
      const fetch = fakeFetch({
        [FILE_URL]: {
          body: csvOf(FILLER),
          contentType: "text/csv",
          etag: ETAG,
          url: "https://evil.example.org/data/all_ai_models.csv",
        },
      });
      const error = await failureOf(
        epochAiConnector.download(fetch, {
          etag: `k${epochAiConnector.version}:${ETAG}`,
          lastModified: null,
        }),
      );
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).reason).toBe("not_allowed");
    });

    it("gives the same body for the same list, so that the hash of the sync tells it is unchanged", async () => {
      const rows = [industryRow("Alpha Labs", { Model: "Alpha-1" })];
      const first = await runOf(rows);
      const second = await runOf(rows);
      expect(second.snapshot.bodies).toEqual(first.snapshot.bodies);
      expect(second.snapshot.bytes).toBe(first.snapshot.bytes);
    });
  });

  describe("what never reaches a snapshot or a record", () => {
    it("leaves out every column that it does not read: the authors, the abstract, the handle, the notes", async () => {
      const planted: Partial<Record<Column, string>> = {
        Authors: "ZZ-PLANTED-AUTHOR One, ZZ-PLANTED-AUTHOR Two",
        Abstract: "ZZ-PLANTED-ABSTRACT with <b>tags</b> and ZZ@example.org",
        "Hugging Face developer id": "ZZ-PLANTED-HANDLE",
        Reference: "ZZ-PLANTED-REFERENCE",
        Link: "https://example.org/ZZ-PLANTED-LINK",
        "Archived links": "ZZ-PLANTED-ARCHIVE",
        "Parameters notes": "ZZ-PLANTED-NOTES",
        "Accessibility notes": "ZZ-PLANTED-ACCESS",
        "Country (of organization)": "ZZ-PLANTED-COUNTRY",
        Domain: "ZZ-PLANTED-DOMAIN",
        "Model accessibility": "ZZ-PLANTED-ACCESSIBILITY",
        Parameters: "ZZ-PLANTED-PARAMETERS",
      };
      const { snapshot, parsed } = await runOf([industryRow("Alpha Labs", planted)]);
      const everything = `${snapshot.bodies.join("\n")}\n${JSON.stringify(parsed)}`;
      for (const value of Object.values(planted)) {
        expect(everything).not.toContain(value);
      }
      // The designed rows hold `ZZ-` tokens in every column that is not read: none is anywhere.
      expect(everything).not.toContain("ZZ-");
      expect(idsOf(parsed)).toEqual(["alphalabs"]);
    });

    it("keeps no author, e-mail address or handle in the text of a record", async () => {
      const { parsed } = await runOf([
        industryRow("Alpha Labs", {
          Authors: "ZZ-Person One, ZZ-Person Two",
          Abstract: "mail ZZ-person@example.org",
        }),
      ]);
      const text = JSON.stringify(parsed.records);
      expect(text).not.toContain("Person");
      expect(text).not.toContain("@");
    });
  });

  describe("hostile cells", () => {
    it("keeps no control character, no hidden character and no angle bracket in a record", async () => {
      const hostile: Array<[string, string]> = [
        [`Alpha${cp(0, 1, 7, 0x1b)}One Labs`, "alphaonelabs"],
        [`Beta${cp(0x202e)}Two${cp(0x2066, 0x2069)} Labs`, "betatwolabs"],
        // The parenthetical `(1)` is cut like any other: what is left holds no angle bracket in its key.
        ["<script>alert(1)</script> Labs", "scriptalertscriptlabs"],
        [`Gamma${cp(0xd800)}Three Labs`, "gammathreelabs"],
        [`Delta${cp(0xdc00)}Four Labs`, "deltafourlabs"],
        [`Epsilon${cp(0xfeff, 0x00ad, 0x2060)}Five Labs`, "epsilonfivelabs"],
        [`Zeta${cp(0xff1c)}img src=x${cp(0xff1e)} Labs`, "zetaimgsrcxlabs"],
      ];
      const { parsed } = await runOf(
        hostile.map(([name], at) =>
          industryRow(name, {
            Model: `Model <i>${at}</i>${cp(0x202e)}${cp(0xd83d)}`,
          }),
        ),
      );
      expect(parsed.errors).toBe(0);
      expectWellFormedRecords(parsed.records, { sourceId: "epoch_ai", mark: MARK });
      for (const record of parsed.records) {
        const text = `${record.title} ${record.summary} ${JSON.stringify(record.identifiers)}`;
        expect(text).not.toMatch(/[<>]/);
        expect(text).not.toMatch(/\p{Cc}/u);
        expect(text).not.toMatch(/[\u{D800}-\u{DFFF}]/u);
      }
      for (const [, id] of hostile) expect(idsOf(parsed)).toContain(id);
    });

    it("takes a cell of 100 KB in any column that it reads for what it is", async () => {
      const big = "x".repeat(100 * 1024);
      const { parsed } = await runOf([
        ...manyOrganisations(120),
        // Cells that are not read, whatever their size.
        industryRow("Alpha Labs", { Abstract: big, Authors: big, "Training compute notes": big }),
        // An organisation cell of 100 KB is no list: the row does not line up, and gives no key.
        rowOf({ Organization: big, "Organization categorization": "Industry" }),
        // A categorisation cell of 100 KB is no list either.
        rowOf({ Organization: "Acme AI", "Organization categorization": big }),
        // A model name of 100 KB is no name.
        industryRow("Beta Labs", { Model: big }),
        // A day and the flags of 100 KB are no day and no flag, and the row still counts.
        industryRow("Gamma Labs", {
          "Publication date": big,
          "Frontier model": big,
          "Open model weights?": big,
        }),
        industryRow("Delta Labs", { "Last modified": big }),
      ]);
      expect(idsOf(parsed)).toContain("alphalabs");
      expect(idsOf(parsed)).not.toContain("betalabs");
      expect(idsOf(parsed)).toContain("gammalabs");
      expect(idsOf(parsed)).toContain("deltalabs");
      expect(parsed.records.some((record) => record.sourceRecordId.startsWith("xxxx"))).toBe(false);
      // Only the model name of 100 KB is unreadable; the two rows with a list cell of 100 KB do not line up.
      expect(parsed.skipped).toBe(1);
      expect(parsed.errors).toBe(0);
      expect(recordOfId(parsed, "gammalabs").identifiers).toMatchObject({
        frontier: 0,
        openWeights: 0,
      });
      expectWellFormedRecords(parsed.records, { sourceId: "epoch_ai", mark: MARK });
    });

    it("does not let a cell with many separators cost more than its length", async () => {
      const started = Date.now();
      expect(await keysOf(",".repeat(1_900), "Industry")).toEqual([]);
      expect(await keysOf(", ".repeat(900), ",".repeat(1_800))).toEqual([]);
      expect(await keysOf(`(${"(".repeat(1_900)}`, "Industry")).toEqual([]);
      expect(await keysOf(`${". ".repeat(900)}x`, "Industry")).toEqual([]);
      expect(await keysOf(",Inc".repeat(450), "Industry")).toEqual([]);
      expect(Date.now() - started).toBeLessThan(10_000);
    });
  });

  describe("the contract of the kit", () => {
    const rows = [
      rowOf({
        ...developers(["Alpha Labs", "Industry"], ["Beta Labs", "Industry"]),
        Model: "Shared-1",
        "Publication date": "2026-02-03",
      }),
      industryRow("Beta Labs", { Model: "Beta-1", "Publication date": "2026-02-03" }),
      industryRow("Beta Labs", {
        Model: "Beta-2",
        "Publication date": "2026-02-03",
        "Frontier model": "True",
      }),
      industryRow("Acme Bot", { Model: "Acme-1", "Publication date": "2025-01-02" }),
      industryRow("AcmeBot", { Model: "Acme-2", "Publication date": "2025-01-02" }),
      industryRow("ACMEBOT", { Model: "Acme-3", "Publication date": "2024-05-06" }),
      rowOf({
        ...developers(["Gamma Labs", "Industry"], ["Some University", "Academia"]),
        Model: "Gamma-1",
        "Publication date": "",
      }),
      rowOf({ ...developers(["Delta Labs", "Academia"]), Model: "Delta-1" }),
    ];

    it("gives the same bodies and the same records whatever the order of the rows", async () => {
      await expectDeterministic(epochAiConnector, (reversed) => {
        const all = [...rows, ...FILLER];
        const body = csvOf(reversed ? all.slice().reverse() : all);
        return fakeFetch({ [FILE_URL]: { body, contentType: "text/csv" } });
      });
    });

    it("gives the same ids and the same hash for the same file however its rows are shuffled", async () => {
      const bodies = new Set<string>();
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
        const snapshot = await downloadOf(csvOf(shuffled));
        const parsed = epochAiConnector.parse(snapshot);
        bodies.add(snapshot.bodies[0]);
        ids.add(idsOf(parsed).join(","));
        expectWellFormedRecords(parsed.records, { sourceId: "epoch_ai", mark: MARK });
      }
      expect(bodies.size).toBe(1);
      expect([...ids]).toEqual(["acmebot,alphalabs,betalabs,gammalabs"]);
    });

    it("makes records that hold what the columns and the prompt need", async () => {
      const { parsed } = await runOf(rows);
      expect(parsed.records.length).toBe(4);
      expectWellFormedRecords(parsed.records, { sourceId: "epoch_ai", mark: MARK });
      for (const record of parsed.records) {
        expect(record.summary.startsWith(MARK)).toBe(true);
        expect(record.matchKeys.every((key) => key.startsWith("name:"))).toBe(true);
        expect(record.recordType).toBe("ai_model_developer");
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
        expect(text).not.toContain("epoch.ai");
        expect(text).not.toContain("evil.example");
        expect(text).not.toContain("https");
      }
    });

    it("has no root for a body that is not the one its download makes", () => {
      const notABody: Snapshot = { bodies: ["not json"], etag: null, lastModified: null, bytes: 0 };
      expect(epochAiConnector.parse(notABody).root).toBeNull();
      expect(epochAiConnector.parse({ ...notABody, bodies: [] }).root).toBeNull();
    });
  });
});
