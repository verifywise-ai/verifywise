/**
 * The Foundation Model Transparency Index (connectors/fmti.ts): the December 2025 scores file of
 * the Stanford CRFM, a small wide CSV (the header is `Indicator` and one column for each developer
 * of foundation models, one row for each indicator, every cell 0 or 1), read into one record per
 * developer column. Every file here is invented: the developers and the indicators are made up, the
 * shape is the real one (two indicator names hold a quoted comma, two developers have names of three
 * letters), and no test touches the network (a fake fetch serves the files).
 */
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { FetchError } from "../../../../webResearch/guardedFetch";
import { compactName } from "../../../records/match";
import { FMTI_RECORD_MARK, fmtiConnector } from "../fmti";
import { SHORTENED, lineOf as cleanLineOf, unreadableAllowed } from "../kit/clean";
import { BodyTooLargeError, NotTheListError } from "../types";
import {
  type FakeFile,
  expectDeterministic,
  expectWellFormedRecords,
  fakeFetch,
} from "./helpers/kitContract";

jest.setTimeout(30_000);

const MARK = FMTI_RECORD_MARK;
const FILE_URL =
  "https://raw.githubusercontent.com/stanford-crfm/fmti/main/Dec2025/Dec2025_scores.csv";
const PAGE_URL = "https://github.com/stanford-crfm/fmti?developer=";
const ETAG = 'W/"5d21c4-0b9e"';
const LAST_MODIFIED = "Sun, 08 Nov 2026 21:46:10 GMT";

const S1 =
  "Foundation Model Transparency Index (github.com/stanford-crfm), a register or status list.";
const S2 =
  "A record shows how much a developer of foundation models disclosed, as the index's team scored it; it measures transparency, not safety, quality or compliance.";
const S5 =
  "Source: Foundation Model Transparency Index, Stanford CRFM (Bommasani, Klyman et al.), CC BY 4.0; adapted by VerifyWise.";

/** Thirteen invented developers, as the real file has: two have a name of three letters, no key. */
const DEVELOPERS = [
  "Zorbix",
  "Quillworks",
  "Frobnitz",
  "Wumbatek",
  "Plinkops",
  "Grondle",
  "Thimble",
  "Snarfbot",
  "Klobby Labs",
  "Gleamwright Inc",
  "Zib21 Labs",
  "Qux",
  "Zap",
];
/** The compact names of the developers that have one: the ids of the records. */
const KEYS = [
  "zorbix",
  "quillworks",
  "frobnitz",
  "wumbatek",
  "plinkops",
  "grondle",
  "thimble",
  "snarfbot",
  "klobbylabs",
  "gleamwrightinc",
  "zib21labs",
];

/** `n` as letters only. */
const lettersOf = (n: number): string =>
  [...n.toString(26)].map((digit) => String.fromCharCode(97 + parseInt(digit, 26))).join("");

/** The names of `count` invented indicators; two of them hold a comma, so that a quote is needed. */
const indicatorsOf = (count: number): string[] =>
  Array.from({ length: count }, (_, at) =>
    at === 3 || at === 41
      ? `ZZINDICATOR ${lettersOf(at)}: does the developer say x, y or z?`
      : `ZZINDICATOR ${lettersOf(at)} of the invented index`,
  );

/** The cell of an indicator row and a developer column: a fixed pattern of 0 and 1. */
const patternCell = (row: number, column: number): string =>
  row % (column + 2) === 0 || (row + column) % 11 === 0 ? "1" : "0";

/** The indicators that a pattern marks as met for one developer column, among `rows` rows. */
const metOf = (column: number, rows: number, skip: ReadonlySet<number> = new Set()): number =>
  Array.from({ length: rows }, (_, row) => row).filter(
    (row) => !skip.has(row) && patternCell(row, column) === "1",
  ).length;

const quote = (cell: string): string =>
  /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
const lineOf = (cells: readonly string[]): string => cells.map(quote).join(",");

interface Table {
  developers?: readonly string[];
  indicators?: readonly string[];
  cell?: (row: number, column: number) => string;
  /** The first cell of the header. */
  first?: string;
  eol?: string;
  /** Leave the line break after the last row out. */
  noFinalBreak?: boolean;
}

/** A CSV text of the table: the header, then a row for each indicator. */
function csvOf(table: Table = {}): string {
  const developers = table.developers ?? DEVELOPERS;
  const indicators = table.indicators ?? indicatorsOf(100);
  const cell = table.cell ?? patternCell;
  const eol = table.eol ?? "\n";
  const lines = [
    lineOf([table.first ?? "Indicator", ...developers]),
    ...indicators.map((name, row) =>
      lineOf([name, ...developers.map((_, column) => cell(row, column))]),
    ),
  ];
  return `${lines.join(eol)}${table.noFinalBreak === true ? "" : eol}`;
}

const filesOf = (body: string, over: Partial<FakeFile> = {}): Record<string, FakeFile> => ({
  [FILE_URL]: {
    body,
    contentType: "text/plain; charset=utf-8",
    etag: ETAG,
    lastModified: LAST_MODIFIED,
    ...over,
  },
});

interface Body {
  v: number;
  rows: Array<Record<string, unknown>>;
  total: number;
  unreadable: number;
}

/** The table of this text, downloaded and parsed. */
async function run(text: string, over: Partial<FakeFile> = {}) {
  const fetch = fakeFetch(filesOf(text, over));
  const snapshot = await fmtiConnector.download(fetch, {});
  if (snapshot === "unchanged") throw new Error("The fake fetch answered unchanged.");
  const result = fmtiConnector.parse(snapshot);
  const body = JSON.parse(snapshot.bodies[0]) as Body;
  const byId = new Map(result.records.map((record) => [record.sourceRecordId, record]));
  return { fetch, snapshot, result, body, byId };
}

/** The failure of a promise, or undefined when it did not fail. */
const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

const failsAsNotTheList = async (text: string): Promise<void> => {
  const fetch = fakeFetch(filesOf(text));
  expect(await failureOf(fmtiConnector.download(fetch, {}))).toBeInstanceOf(NotTheListError);
};

const everythingOf = (done: { snapshot: { bodies: string[] }; result: { records: unknown[] } }) =>
  `${done.snapshot.bodies.join("")}${JSON.stringify(done.result.records)}`;

// --- names that are cut where a cut is hard to see ---

/** The caps of the reader: the name of a developer (a header), and the name of an indicator (a row). */
const DEVELOPER_CHARS = 40;
const INDICATOR_CHARS = 200;

const GRINNING_FACE = String.fromCodePoint(0x1f600);

/** The two places where the cut of `lineOf` leaves a line shorter than its cap. */
const SHORT_CUTS: Array<[string, "blank" | "pair"]> = [
  ["a blank, which the cut takes off", "blank"],
  ["a pair of surrogates, which the cut does not split", "pair"],
];
const jointOf = (where: "blank" | "pair"): string => (where === "blank" ? " " : GRINNING_FACE);
/**
 * What may stand at the cut: a blank, a pair of surrogates, or a blank and a pair (the pair that the cut
 * does not split goes, and the blank before it with it, so that the line is two units short of the cap).
 */
const JOINTS = [" ", GRINNING_FACE, ` ${GRINNING_FACE}`];

/**
 * A header that `lineOf` cuts, at one unit above the cap, into a line of exactly the cap that ends in
 * the marker: the cut keeps `cap + 1 - 12` units, 29 here, and the 29th is the blank that the cut
 * takes off (`blank`), or the first half of a pair that it does not split (`pair`), so 28 units are
 * kept, `Quillworks Laboratories Abcd`, and the marker after them. A test that cuts at the cap and
 * one unit and compares the length of the line with the cap takes that line for a name that fits.
 */
const shortCutHeader = (where: "blank" | "pair"): string =>
  `Quillworks Laboratories Abcd${jointOf(where)}Intl Holdings`;

/**
 * An indicator name cut in the same way at 201 units: 188 are kept (eighteen words of nine letters, a
 * word of eight, then the joint), and the marker makes the line 200 units.
 */
const shortCutIndicator = (where: "blank" | "pair"): string =>
  `${"abcdefghi ".repeat(18)}abcdefgh${jointOf(where)}and more words follow here`;

describe("fmtiConnector", () => {
  describe("the connector", () => {
    it("is the snapshot connector of the list, at its first version", () => {
      expect(fmtiConnector.id).toBe("fmti");
      expect(fmtiConnector.version).toBe(1);
      expect(fmtiConnector.kind).toBeUndefined();
      expect(MARK).toBe("Foundation Model Transparency Index");
    });

    it("asks the scores file of the December 2025 edition once, with the limits of the list", async () => {
      const fetch = fakeFetch(filesOf(csvOf()));
      const first = await fmtiConnector.download(fetch, {});
      expect(first).not.toBe("unchanged");
      expect(fetch.calls).toHaveLength(1);
      expect(fetch.calls[0].url).toBe(FILE_URL);
      expect(fetch.calls[0].validators).toEqual({});
      expect(fetch.calls[0].limits).toEqual({
        maxBytes: 1_048_576,
        allowedContentTypes: ["text/plain"],
        totalTimeoutMs: 60_000,
      });
    });

    it("keeps the validators of the file behind the version of its reading", async () => {
      const { snapshot } = await run(csvOf());
      expect(snapshot.etag).toBe(`k1:${ETAG}`);
      expect(snapshot.lastModified).toBe(LAST_MODIFIED);
    });

    it("writes nothing to the console, and its code holds no console and no logger", async () => {
      const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
        jest.spyOn(console, method).mockImplementation(() => undefined),
      );
      try {
        await run(csvOf({ cell: (row, column) => (row === 4 && column === 2 ? "x" : "1") }));
      } finally {
        for (const spy of spies) {
          expect(spy).not.toHaveBeenCalled();
          spy.mockRestore();
        }
      }
      const source = readFileSync(join(__dirname, "..", "fmti.ts"), "utf8");
      expect(source).not.toMatch(/console\.|logger/);
    });
  });

  describe("a table of thirteen developers and a hundred indicators", () => {
    it("gives one record for each developer that has a name key, whose id is the compact name", async () => {
      const { result, body } = await run(csvOf());
      expect(result.records.map((record) => record.sourceRecordId)).toEqual([...KEYS].sort());
      expect(result).toMatchObject({ errors: 0, skipped: 0, root: "Dec2025_scores.csv" });
      expect(body.rows).toHaveLength(11);
      expect(body.total).toBe(100);
    });

    it("counts a developer whose name is too short to be a key as no entity: no record, nothing unreadable", async () => {
      const { byId, body } = await run(csvOf());
      expect(byId.has("qux")).toBe(false);
      expect(byId.has("zap")).toBe(false);
      expect(body.unreadable).toBe(0);
    });

    it("gives records that the database and the prompt can take", async () => {
      const { result } = await run(csvOf());
      expectWellFormedRecords(result.records, { sourceId: "fmti", mark: MARK });
    });

    it("begins every summary with the mark, the first sentence and the second, and ends it with the credit", async () => {
      const { result } = await run(csvOf());
      for (const record of result.records) {
        expect(record.summary.startsWith(MARK)).toBe(true);
        expect(record.summary.startsWith(`${S1} ${S2} `)).toBe(true);
        expect(record.summary.endsWith(S5)).toBe(true);
      }
    });

    it("gives records of the state type of the list, with no date", async () => {
      const { result } = await run(csvOf());
      for (const record of result.records) {
        expect(record.recordType).toBe("transparency_index_score");
        expect(record.publishedAt).toBeNull();
        expect(record.sourceUpdatedAt).toBeNull();
      }
    });

    it("names the edition as the version of the list", async () => {
      const { result } = await run(csvOf());
      expect(result.sourceVersion).toBe("Dec2025");
    });

    it("gives records of different developers different addresses, built from the id", async () => {
      const { result } = await run(csvOf());
      const urls = result.records.map((record) => record.url);
      expect(new Set(urls).size).toBe(11);
      for (const record of result.records) {
        expect(record.url).toBe(`${PAGE_URL}${record.sourceRecordId}`);
      }
    });

    it("encodes an id that is not ASCII in its address", async () => {
      const name = `Zibbl${String.fromCodePoint(0xe9)}tek`;
      const { byId } = await run(csvOf({ developers: [...DEVELOPERS, name] }));
      const id = compactName(name);
      expect(byId.get(id)?.url).toBe(`${PAGE_URL}${encodeURIComponent(id)}`);
      expect(byId.get(id)?.url).toContain("%C3%A9");
    });
  });

  describe("the record of one developer, in full", () => {
    async function zorbix() {
      const done = await run(csvOf());
      return { ...done, record: done.byId.get("zorbix") };
    }

    it("is made as the template says: the id, the title, the keys, the address and the counts", async () => {
      const { record } = await zorbix();
      expect(record).toEqual({
        sourceRecordId: "zorbix",
        recordType: "transparency_index_score",
        title: `${MARK}: Zorbix`,
        summary: expect.any(String),
        url: `${PAGE_URL}zorbix`,
        identifiers: {
          developer: "Zorbix",
          met: metOf(0, 100),
          indicators: 100,
          edition: "December 2025",
        },
        matchKeys: ["name:zorbix"],
        publishedAt: null,
        sourceUpdatedAt: null,
      });
    });

    it("has the text of the template, sentence by sentence", async () => {
      const { record } = await zorbix();
      expect(record?.summary).toBe(
        [
          S1,
          S2,
          "Developer: Zorbix.",
          `December 2025 edition: the published scores file marks ${metOf(0, 100)} of its 100 indicators as met for this developer (counted by VerifyWise from the file; the index team's own published scores are the only validated ones).`,
          S5,
        ].join(" "),
      );
    });

    it("counts the cells of each column on its own", async () => {
      const { byId } = await run(csvOf());
      DEVELOPERS.forEach((developer, column) => {
        const key = compactName(developer);
        if (!KEYS.includes(key)) return;
        expect(byId.get(key)?.identifiers).toMatchObject({ met: metOf(column, 100) });
      });
      // The pattern gives the developers different counts: the test cannot pass by one number.
      expect(new Set(KEYS.map((_, column) => metOf(column, 100))).size).toBeGreaterThan(1);
    });

    it("makes the keys of the header as written and without its legal form", async () => {
      const { byId } = await run(csvOf());
      expect(byId.get("gleamwrightinc")?.matchKeys).toEqual([
        "name:gleamwrightinc",
        "name:gleamwright",
      ]);
      expect(byId.get("klobbylabs")?.matchKeys).toEqual(["name:klobbylabs"]);
      expect(byId.get("zib21labs")?.matchKeys).toEqual(["name:zib21labs"]);
    });

    it("shows the developer as the header gives it, with its own spaces and capitals", async () => {
      const { byId } = await run(csvOf());
      expect(byId.get("klobbylabs")?.title).toBe(`${MARK}: Klobby Labs`);
      expect(byId.get("klobbylabs")?.summary).toContain("Developer: Klobby Labs.");
    });

    it("keeps no indicator name, in the body or in a record", async () => {
      const done = await run(csvOf());
      expect(csvOf()).toContain("ZZINDICATOR");
      expect(everythingOf(done)).not.toContain("ZZINDICATOR");
      expect(everythingOf(done)).not.toContain("invented index");
    });

    it("asks no other file than the scores of the edition: the transparency reports are never fetched", async () => {
      const { fetch } = await run(csvOf());
      expect(fetch.calls.map((call) => call.url)).toEqual([FILE_URL]);
    });

    it("ends the sentence of the developer with one full stop, whatever its own end", async () => {
      const { byId } = await run(csvOf({ developers: [...DEVELOPERS, "Quill Inc."] }));
      const summary = byId.get("quillinc")?.summary ?? "";
      expect(summary).toContain("Developer: Quill Inc. December 2025 edition");
      expect(summary).not.toContain("..");
    });
  });

  describe("the cells of the indicators", () => {
    /** Row 10 of a table is the one that these tests spoil. */
    const spoiled = (value: string) =>
      csvOf({
        cell: (row, column) => (row === 10 && column === 0 ? value : patternCell(row, column)),
      });

    it.each([
      ["2", "2"],
      ["an empty cell", ""],
      ["a blank before the digit", " 1"],
      ["a blank after the digit", "0 "],
      ["a leading zero", "01"],
      ["a word", "yes"],
      ["a capital", "TRUE"],
      ["a decimal", "1.0"],
      ["a minus sign", "-1"],
      ["a hidden character", `1${String.fromCodePoint(0x200b)}`],
    ])("makes the whole row unreadable for a cell that is %s", async (_name, value) => {
      const { byId, body, result } = await run(spoiled(value));
      expect(body.unreadable).toBe(1);
      expect(result).toMatchObject({ errors: 0, skipped: 1 });
      // The counts are over the 99 rows that read, for every developer.
      expect(byId.get("zorbix")?.identifiers).toMatchObject({
        indicators: 99,
        met: metOf(0, 100, new Set([10])),
      });
      expect(byId.get("quillworks")?.identifiers).toMatchObject({
        indicators: 99,
        met: metOf(1, 100, new Set([10])),
      });
    });

    it("makes a row unreadable for a bad cell in a column that has no record (a developer of three letters)", async () => {
      const text = csvOf({
        cell: (row, column) => (row === 10 && column === 11 ? "9" : patternCell(row, column)),
      });
      const { body, byId } = await run(text);
      expect(body.unreadable).toBe(1);
      expect(byId.get("zorbix")?.identifiers).toMatchObject({ indicators: 99 });
    });

    it("makes a row of another width unreadable: too few cells, and too many", async () => {
      const lines = csvOf().trimEnd().split("\n");
      lines[20] = lines[20].split(",").slice(0, -1).join(",");
      lines[30] = `${lines[30]},1`;
      const { body, byId } = await run(`${lines.join("\n")}\n`);
      expect(body.unreadable).toBe(2);
      expect(byId.get("zorbix")?.identifiers).toMatchObject({ indicators: 98 });
    });

    it("makes a row with no indicator name unreadable", async () => {
      const names = indicatorsOf(100);
      names[10] = "   ";
      const { body, byId } = await run(csvOf({ indicators: names }));
      expect(body.unreadable).toBe(1);
      expect(byId.get("zorbix")?.identifiers).toMatchObject({ indicators: 99 });
    });

    it("keeps an indicator name of 200 characters, and makes the row of one of 201 unreadable", async () => {
      const names = indicatorsOf(100);
      names[10] = `I${"n".repeat(199)}`;
      const ok = await run(csvOf({ indicators: names }));
      expect(ok.body.unreadable).toBe(0);
      expect(ok.byId.get("zorbix")?.identifiers).toMatchObject({ indicators: 100 });
      names[10] = `I${"n".repeat(200)}`;
      const bad = await run(csvOf({ indicators: names }));
      expect(bad.body.unreadable).toBe(1);
      expect(bad.byId.get("zorbix")?.identifiers).toMatchObject({ indicators: 99 });
    });

    // The cut of `lineOf` takes a blank before it off and never splits a pair of surrogates, so
    // the line of a name that was cut can be as SHORT as the cap and still end in the marker. A name
    // whose line is cut at the cap and one unit and compared by length with the cap would pass for a
    // name that fits, and the row would be read, with a cut name in the set of its names.
    it.each(SHORT_CUTS)(
      "makes the row of an indicator name unreadable when the cut of it falls after %s, though the cut line is as short as the cap",
      async (_label, where) => {
        const name = shortCutIndicator(where);
        // The shape: a name over the cap whose line, cut one unit above it, is exactly the cap long and ends in the marker.
        expect(name.length).toBeGreaterThan(INDICATOR_CHARS + 1);
        const naive = cleanLineOf(name, INDICATOR_CHARS + 1);
        expect(naive).toHaveLength(INDICATOR_CHARS);
        expect(naive.endsWith(SHORTENED)).toBe(true);

        const names = indicatorsOf(100);
        names[10] = name;
        const done = await run(csvOf({ indicators: names }));
        expect(done.body.unreadable).toBe(1);
        expect(done.byId.get("zorbix")?.identifiers).toMatchObject({ indicators: 99 });
        expect(everythingOf(done)).not.toContain("shortened");
      },
    );

    it("makes the row of an indicator name unreadable wherever a blank or a pair of surrogates falls around the cut, whatever the name", async () => {
      for (let at = INDICATOR_CHARS - 16; at <= INDICATOR_CHARS - 6; at += 1) {
        for (const joint of JOINTS) {
          const names = indicatorsOf(100);
          names[10] = `${"a".repeat(at)}${joint}${"b".repeat(20)}`;
          const done = await run(csvOf({ indicators: names }));
          expect(done.body.unreadable).toBe(1);
          expect(done.byId.get("zorbix")?.identifiers).toMatchObject({ indicators: 99 });
          expect(everythingOf(done)).not.toContain("shortened");
        }
      }
    });

    it("counts each row that does not read once, and says how many rows it saw", async () => {
      const { body } = await run(
        csvOf({
          cell: (row, column) =>
            (row === 5 || row === 6) && column === 3 ? "z" : patternCell(row, column),
        }),
      );
      expect(body.unreadable).toBe(2);
      expect(body.total).toBe(100);
    });

    it("reads a column that has no header as no column at all: its cells are not read", async () => {
      const developers = [...DEVELOPERS.slice(0, 5), "", ...DEVELOPERS.slice(5)];
      const { body, byId } = await run(
        csvOf({
          developers,
          cell: (row, column) => (column === 5 ? "garbage" : patternCell(row, column)),
        }),
      );
      expect(body.unreadable).toBe(0);
      expect(byId.size).toBe(11);
    });
  });

  describe("the allowance for rows that do not read", () => {
    const spoilRows = (rows: number) =>
      csvOf({
        cell: (row, column) => (row < rows && column === 0 ? "?" : patternCell(row, column)),
      });

    it("lets as many rows go as the kit allows for eleven developers, and fails the list above that", async () => {
      // The kit measures the allowance over the records and the rows that did not read.
      expect(unreadableAllowed(11 + 2)).toBe(2);
      expect(unreadableAllowed(11 + 3)).toBe(2);
      const within = await run(spoilRows(2));
      expect(within.result).toMatchObject({ errors: 0, skipped: 2 });
      const over = await run(spoilRows(3));
      expect(over.result.errors).toBe(3);
      expect(over.result.skipped).toBe(0);
      expect(over.result.records).toHaveLength(11);
    });
  });

  describe("the developers", () => {
    it("counts the letters and digits of a name, and not its spaces: two short words make a key", async () => {
      const { byId } = await run(csvOf({ developers: [...DEVELOPERS, "Qux Zap"] }));
      expect(byId.has("quxzap")).toBe(true);
    });

    it("gives no record to a name of fewer than four letters and digits, spaces and punctuation not counted", async () => {
      const developers = [...DEVELOPERS, "A. B", "x-1", "!!!", "  "];
      const { byId, body } = await run(csvOf({ developers }));
      expect(byId.size).toBe(11);
      expect(body.unreadable).toBe(0);
    });

    it("gives a record to a name of four letters", async () => {
      const { byId } = await run(csvOf({ developers: [...DEVELOPERS, "Quxx"] }));
      expect(byId.has("quxx")).toBe(true);
    });

    it("drops both columns of two developers that share one key, whatever their order, and counts both", async () => {
      for (const developers of [
        [...DEVELOPERS, "Zorbix2", "ZORBIX2"],
        [...DEVELOPERS, "ZORBIX2", "Zorbix2"],
        ["Zorbix2", ...DEVELOPERS, "Zor-bix2"],
      ]) {
        const { byId, body } = await run(csvOf({ developers }));
        expect(byId.has("zorbix2")).toBe(false);
        expect(body.unreadable).toBe(2);
        expect(byId.size).toBe(11);
      }
    });

    it("makes a column unreadable when its name is over 40 characters: a cut name would key two names alike", async () => {
      const long = `Quill${"works".repeat(8)}`;
      expect(long.length).toBeGreaterThan(40);
      const { byId, body } = await run(csvOf({ developers: [...DEVELOPERS, long] }));
      expect(body.unreadable).toBe(1);
      expect(byId.has(compactName(long))).toBe(false);
      expect(byId.size).toBe(11);
    });

    it("keeps a name of 40 characters whole", async () => {
      const forty = `Q${"u".repeat(39)}`;
      const { byId, body } = await run(csvOf({ developers: [...DEVELOPERS, forty] }));
      expect(body.unreadable).toBe(0);
      expect(byId.get(compactName(forty))?.title).toBe(`${MARK}: ${forty}`);
    });

    it("makes a column unreadable at 41 characters, the first length that is cut", async () => {
      const over = `Q${"u".repeat(40)}`;
      expect(over).toHaveLength(41);
      const { byId, body } = await run(csvOf({ developers: [...DEVELOPERS, over] }));
      expect(body.unreadable).toBe(1);
      expect(byId.has(compactName(over))).toBe(false);
      expect(byId.size).toBe(11);
    });

    // The same as for an indicator name. A header whose line is cut at the cap and one unit and
    // compared by length with the cap would pass for a name that fits, and the column would be a
    // developer named by a cut text, with its id and its key made of the marker.
    it.each(SHORT_CUTS)(
      "makes a column unreadable when the cut of its name falls after %s, though the cut line is as short as the cap",
      async (_label, where) => {
        const header = shortCutHeader(where);
        // The shape: a name over the cap whose line, cut one unit above it, is exactly the cap long and ends in the marker.
        expect(header.length).toBeGreaterThan(DEVELOPER_CHARS + 1);
        const naive = cleanLineOf(header, DEVELOPER_CHARS + 1);
        expect(naive).toHaveLength(DEVELOPER_CHARS);
        expect(naive.endsWith(SHORTENED)).toBe(true);
        expect(naive.slice(0, -SHORTENED.length).endsWith("Abcd")).toBe(true);

        const done = await run(csvOf({ developers: [...DEVELOPERS, header] }));
        expect(done.body.unreadable).toBe(1);
        expect(done.byId.size).toBe(11);
        const everything = everythingOf(done).toLowerCase();
        expect(everything).not.toContain("shortened");
        expect(everything).not.toContain("laboratories");
      },
    );

    it("makes a column unreadable wherever a blank or a pair of surrogates falls around the cut, whatever the name", async () => {
      for (let at = DEVELOPER_CHARS - 16; at <= DEVELOPER_CHARS - 6; at += 1) {
        for (const joint of JOINTS) {
          const header = `${"a".repeat(at)}${joint}${"b".repeat(20)}`;
          const done = await run(csvOf({ developers: [...DEVELOPERS, header] }));
          expect(done.body.unreadable).toBe(1);
          expect(done.byId.size).toBe(11);
          expect(everythingOf(done)).not.toContain("shortened");
        }
      }
    });

    it("gives the same id and the same counts to a developer wherever its column stands", async () => {
      const columns = DEVELOPERS.map((developer, column) => ({ developer, column }));
      const reversed = [...columns].reverse();
      const first = await run(csvOf());
      const second = await run(
        csvOf({
          developers: reversed.map(({ developer }) => developer),
          cell: (row, column) => patternCell(row, reversed[column].column),
        }),
      );
      expect(second.snapshot.bodies).toEqual(first.snapshot.bodies);
      expect(second.result.records).toEqual(first.result.records);
    });
  });

  describe("cells that a third party wrote", () => {
    it("are cleaned: controls, bidirectional and zero-width characters, and a lone surrogate", async () => {
      const nul = String.fromCharCode(0);
      const bell = String.fromCharCode(7);
      const bidi = String.fromCodePoint(0x202e);
      const zero = String.fromCodePoint(0x200b);
      const lone = String.fromCharCode(0xd800);
      const developer = `Quill${nul}works${zero} ${bidi}Labs${bell} ${lone}`;
      const { byId, result } = await run(csvOf({ developers: [...DEVELOPERS, developer] }));
      const replacement = String.fromCodePoint(0xfffd);
      const record = byId.get("quillworkslabs");
      expect(record?.title).toBe(`${MARK}: Quillworks Labs ${replacement}`);
      expectWellFormedRecords(result.records, { sourceId: "fmti", mark: MARK });
    });

    it("keep no angle bracket: a tag is written with the angle quotation marks", async () => {
      const developer = `Quill<b>Labs</b>${String.fromCodePoint(0xff1c)}i${String.fromCodePoint(0xff1e)}`;
      const { byId, result } = await run(csvOf({ developers: [...DEVELOPERS, developer] }));
      const record = byId.get("quillblabsbi");
      expect(record).toBeDefined();
      expect(record?.title).not.toMatch(/[<>]/);
      expect(record?.summary).not.toMatch(/[<>]/);
      expectWellFormedRecords(result.records, { sourceId: "fmti", mark: MARK });
    });

    it("are cut: a header of 100 KB is no name, and an indicator name of 100 KB makes its row unreadable", async () => {
      const huge = "x".repeat(100_000);
      const text = csvOf({ developers: [...DEVELOPERS, huge] });
      const fetch = fakeFetch(filesOf(text));
      const snapshot = await fmtiConnector.download(fetch, {});
      if (snapshot === "unchanged") throw new Error("unchanged");
      expect(JSON.parse(snapshot.bodies[0]).unreadable).toBe(1);
      expect(snapshot.bodies[0].length).toBeLessThan(10_000);
      const long = await run(csvOf({ indicators: [huge, ...indicatorsOf(99)] }));
      expect(long.body.unreadable).toBe(1);
      expect(long.snapshot.bodies[0]).not.toContain("xxxxxxxxxx");
      expect(long.byId.get("zorbix")?.identifiers).toMatchObject({ indicators: 99 });
    });

    it("do not pollute what they name: a header called __proto__ is an ordinary header", async () => {
      const { byId } = await run(
        csvOf({ developers: [...DEVELOPERS, "__proto__", "constructor"] }),
      );
      expect(byId.has("proto")).toBe(true);
      expect(byId.has("constructor")).toBe(true);
      expect(({} as Record<string, unknown>).developer).toBeUndefined();
    });
  });

  describe("the worst case", () => {
    it("is under 1,300 characters, with the 'is not' sentence and the credit whole", async () => {
      const developer = `Q${"u".repeat(39)}`;
      const { byId, result } = await run(
        csvOf({
          developers: [...DEVELOPERS, developer],
          indicators: indicatorsOf(200),
          cell: () => "1",
        }),
      );
      const record = byId.get(compactName(developer));
      const summary = record?.summary ?? "";
      expect(summary.length).toBeLessThanOrEqual(1300);
      expect(summary.length).toBeGreaterThan(600);
      expect(summary.startsWith(`${S1} ${S2} `)).toBe(true);
      expect(summary.endsWith(S5)).toBe(true);
      expect(summary).toContain("marks 200 of its 200 indicators");
      expectWellFormedRecords(result.records, { sourceId: "fmti", mark: MARK });
    });
  });

  describe("a file that is not the list", () => {
    it.each([
      ["an HTML page", "<html><body>Not found</body></html>"],
      ["nothing", ""],
      ["text that is not a table", "not a table at all"],
      ["a JSON object", JSON.stringify({ indicators: [] })],
      ["a table without its header", csvOf().split("\n").slice(1).join("\n")],
      ["a header that is another word", csvOf({ first: "Metric" })],
      ["a header in lower case", csvOf({ first: "indicator" })],
      ["a header that is the word and more", csvOf({ first: "Indicators" })],
      ["a header with an empty first cell", csvOf({ first: "" })],
      ["a header and nothing else", `${lineOf(["Indicator", ...DEVELOPERS])}\n`],
    ])("is refused for %s, as not the list", async (_name, text) => {
      await failsAsNotTheList(text);
    });

    it("takes the word Indicator with blanks around it", async () => {
      const { result } = await run(csvOf({ first: " Indicator " }));
      expect(result.records).toHaveLength(11);
    });

    it("is refused for fewer than 50 indicator rows, and read at 50", async () => {
      await failsAsNotTheList(csvOf({ indicators: indicatorsOf(49) }));
      const { result, byId } = await run(csvOf({ indicators: indicatorsOf(50) }));
      expect(result.errors).toBe(0);
      expect(byId.get("zorbix")?.identifiers).toMatchObject({ indicators: 50 });
    });

    it("does not count the rows that do not read toward the 50", async () => {
      const text = csvOf({
        indicators: indicatorsOf(52),
        cell: (row, column) => (row < 3 && column === 0 ? "?" : patternCell(row, column)),
      });
      await failsAsNotTheList(text);
    });

    it("is refused for fewer than five developer columns, and read at five", async () => {
      await failsAsNotTheList(csvOf({ developers: DEVELOPERS.slice(0, 4) }));
      const { result } = await run(csvOf({ developers: DEVELOPERS.slice(0, 5) }));
      expect(result.records).toHaveLength(5);
    });

    it("counts the developers that have no key toward the five, and not the columns that have no header", async () => {
      const { result } = await run(
        csvOf({ developers: ["Zorbix", "Quillworks", "Frobnitz", "Qux", "Zap"] }),
      );
      expect(result.records).toHaveLength(3);
      await failsAsNotTheList(
        csvOf({ developers: ["Zorbix", "Quillworks", "Frobnitz", "Qux", "", " "] }),
      );
    });

    it("is refused when no developer has a name key", async () => {
      await failsAsNotTheList(csvOf({ developers: ["Qux", "Zap", "Fox", "Owl", "Elk"] }));
    });

    it("is refused when two indicators have one name", async () => {
      const names = indicatorsOf(100);
      names[60] = names[7];
      await failsAsNotTheList(csvOf({ indicators: names }));
    });

    it("sees the duplicate of an indicator name whatever its row holds", async () => {
      const names = indicatorsOf(100);
      names[60] = names[7];
      await failsAsNotTheList(
        csvOf({
          indicators: names,
          cell: (row, column) => (row === 60 && column === 0 ? "?" : patternCell(row, column)),
        }),
      );
    });

    it("reads a header with a byte order mark, line ends of CRLF, a last row without a line break, and blank lines", async () => {
      const bom = String.fromCodePoint(0xfeff);
      for (const text of [
        `${bom}${csvOf()}`,
        csvOf({ eol: "\r\n" }),
        csvOf({ noFinalBreak: true }),
        csvOf().replace("\n", "\n\n"),
      ]) {
        const { result } = await run(text);
        expect(result.records).toHaveLength(11);
        expect(result.errors).toBe(0);
      }
    });

    it("reads an indicator name with a quoted comma, and one with a quoted quote", async () => {
      const names = indicatorsOf(100);
      names[9] = 'ZZINDICATOR "quoted", twice';
      const { result } = await run(csvOf({ indicators: names }));
      expect(result.records).toHaveLength(11);
    });

    it("fails, with a message that holds no address, as a download", async () => {
      const fetch = fakeFetch(filesOf("not a table"));
      const error = (await failureOf(fmtiConnector.download(fetch, {}))) as Error;
      expect(error).toBeInstanceOf(NotTheListError);
      expect(error.message).not.toMatch(/githubusercontent|stanford|https?:/i);
    });
  });

  describe("a table over its limits", () => {
    it("is read at 200 indicator rows", async () => {
      const { result, byId } = await run(csvOf({ indicators: indicatorsOf(200) }));
      expect(result.errors).toBe(0);
      expect(byId.get("zorbix")?.identifiers).toMatchObject({ indicators: 200 });
    });

    it("fails the download as too large, and never gives a shorter list, at 201 rows", async () => {
      const fetch = fakeFetch(filesOf(csvOf({ indicators: indicatorsOf(201) })));
      expect(await failureOf(fmtiConnector.download(fetch, {}))).toBeInstanceOf(BodyTooLargeError);
    });

    it("fails the download as too large when a row is wider than 200 cells", async () => {
      const lines = csvOf().trimEnd().split("\n");
      lines[10] = `${lines[10]}${",1".repeat(300)}`;
      const fetch = fakeFetch(filesOf(`${lines.join("\n")}\n`));
      expect(await failureOf(fmtiConnector.download(fetch, {}))).toBeInstanceOf(BodyTooLargeError);
    });

    it("is refused as not the list when the header itself is wider than 200 cells", async () => {
      const developers = Array.from({ length: 250 }, (_, at) => `Developer${lettersOf(at)}x`);
      await failsAsNotTheList(csvOf({ developers }));
    });

    it("sees a row as too wide at 201 cells, and at 200 reads it as a row of another width", async () => {
      const lines = csvOf().trimEnd().split("\n");
      const cells = lines[10].split(",").length;
      const widened = (count: number): string => {
        const turned = [...lines];
        turned[10] = `${lines[10]}${",1".repeat(count - cells)}`;
        return `${turned.join("\n")}\n`;
      };
      const at200 = await run(widened(200));
      expect(at200.body.unreadable).toBe(1);
      expect(at200.result.records).toHaveLength(11);
      const fetch = fakeFetch(filesOf(widened(201)));
      expect(await failureOf(fmtiConnector.download(fetch, {}))).toBeInstanceOf(BodyTooLargeError);
    });

    it("is refused as not the list for a header of 201 cells, the first that is too wide", async () => {
      const developers = Array.from({ length: 200 }, (_, at) => `Developer${lettersOf(at)}x`);
      await failsAsNotTheList(csvOf({ developers, indicators: indicatorsOf(60) }));
    });

    it("is read at 199 developer columns, the widest that 200 cells allow", async () => {
      const developers = Array.from({ length: 199 }, (_, at) => `Developer${lettersOf(at)}x`);
      const { result, body } = await run(csvOf({ developers, indicators: indicatorsOf(60) }));
      expect(result.records).toHaveLength(199);
      // The rows that it saw: no less than the records and the rows that did not read.
      expect(body.total).toBeGreaterThanOrEqual(199);
      expect(result.errors).toBe(0);
    });

    it("fails the download as too large when a quote is never closed: the table was cut", async () => {
      const text = `${csvOf()}"a name that is cut`;
      const fetch = fakeFetch(filesOf(text));
      expect(await failureOf(fmtiConnector.download(fetch, {}))).toBeInstanceOf(BodyTooLargeError);
    });

    it("fails the download as too large when the file is cut at its limit", async () => {
      const cut = fakeFetch(filesOf(csvOf(), { truncated: true }));
      expect(await failureOf(fmtiConnector.download(cut, {}))).toBeInstanceOf(BodyTooLargeError);
      const long = `${csvOf()}${"\n".repeat(1_048_576)}`;
      const over = fakeFetch(filesOf(long));
      expect(await failureOf(fmtiConnector.download(over, {}))).toBeInstanceOf(BodyTooLargeError);
    });
  });

  describe("the order of the file", () => {
    /** The table with its rows and its developer columns turned around. */
    function turned(reversed: boolean): string {
      const rows = Array.from({ length: 100 }, (_, row) => row);
      const columns = DEVELOPERS.map((_, column) => column);
      const rowOrder = reversed ? [...rows].reverse() : rows;
      const columnOrder = reversed ? [...columns].reverse() : columns;
      const names = indicatorsOf(100);
      return csvOf({
        developers: columnOrder.map((column) => DEVELOPERS[column]),
        indicators: rowOrder.map((row) => names[row]),
        cell: (row, column) => patternCell(rowOrder[row], columnOrder[column]),
      });
    }

    it("never changes the body or the records (the kit's contract)", async () => {
      await expectDeterministic(fmtiConnector, (reversed) => fakeFetch(filesOf(turned(reversed))));
    });

    it("gives the same body for every rotation of the rows, which is the same hash", async () => {
      const [header, ...rows] = csvOf().trimEnd().split("\n");
      const hashes = new Set<string>();
      for (const shift of [0, 7, 19, 33, 61, 99]) {
        const rotated = [...rows.slice(shift), ...rows.slice(0, shift)];
        const fetch = fakeFetch(filesOf(`${[header, ...rotated].join("\n")}\n`));
        const snapshot = await fmtiConnector.download(fetch, {});
        if (snapshot === "unchanged") throw new Error("unchanged");
        hashes.add(createHash("sha256").update(snapshot.bodies[0]).digest("hex"));
      }
      expect(hashes.size).toBe(1);
    });
  });

  describe("the answer of the server", () => {
    it("is 'unchanged' when the file is the one that the stored validators name, and nothing is read", async () => {
      const fetch = fakeFetch(filesOf(csvOf()));
      const first = await fmtiConnector.download(fetch, {});
      if (first === "unchanged") throw new Error("unchanged");
      const second = await fmtiConnector.download(fetch, {
        etag: first.etag,
        lastModified: first.lastModified,
      });
      expect(second).toBe("unchanged");
      expect(fetch.calls).toHaveLength(2);
      // The stored etag is behind the prefix of the version; the server gets its own.
      expect(fetch.calls[1].validators).toEqual({ etag: ETAG, lastModified: LAST_MODIFIED });
    });

    it("is read again when the stored etag is that of another version of the reading", async () => {
      const fetch = fakeFetch(filesOf(csvOf()));
      const answer = await fmtiConnector.download(fetch, {
        etag: `k0:${ETAG}`,
        lastModified: LAST_MODIFIED,
      });
      expect(answer).not.toBe("unchanged");
      expect(fetch.calls[0].validators).toEqual({});
    });

    it("fails as not allowed when the answer came from another host", async () => {
      const fetch = fakeFetch(filesOf(csvOf(), { url: "https://evil.example/Dec2025_scores.csv" }));
      const error = await failureOf(fmtiConnector.download(fetch, {}));
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).reason).toBe("not_allowed");
      expect((error as Error).message).not.toContain("evil");
    });

    it("fails as not allowed when a 304 came from another host", async () => {
      const fetch = fakeFetch(filesOf(csvOf(), { url: "https://evil.example/Dec2025_scores.csv" }));
      const error = await failureOf(
        fmtiConnector.download(fetch, { etag: `k1:${ETAG}`, lastModified: LAST_MODIFIED }),
      );
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).reason).toBe("not_allowed");
    });

    it("fails as not allowed for the host with another port, scheme or user name, or for a lookalike host", async () => {
      const path = "/stanford-crfm/fmti/main/Dec2025/Dec2025_scores.csv";
      for (const url of [
        `https://raw.githubusercontent.com:8443${path}`,
        `http://raw.githubusercontent.com${path}`,
        `https://user@raw.githubusercontent.com${path}`,
        `https://www.raw.githubusercontent.com${path}`,
        `https://raw.githubusercontent.com.evil.example${path}`,
        `https://github.com${path}`,
      ]) {
        const fetch = fakeFetch(filesOf(csvOf(), { url }));
        const error = await failureOf(fmtiConnector.download(fetch, {}));
        expect(error).toBeInstanceOf(FetchError);
      }
    });

    it("fails as not allowed for another path of the host: another owner, another repository, a longer name", async () => {
      for (const path of [
        "/other-org/fmti/main/Dec2025/Dec2025_scores.csv",
        "/stanford-crfm/fmti-evil/main/Dec2025/Dec2025_scores.csv",
        "/stanford-crfm/main.csv",
        "/Stanford-CRFM/fmti/main/Dec2025/Dec2025_scores.csv",
        "/stanford-crfm/fmti/../../other-org/x/main/scores.csv",
      ]) {
        const fetch = fakeFetch(
          filesOf(csvOf(), { url: `https://raw.githubusercontent.com${path}` }),
        );
        const error = await failureOf(fmtiConnector.download(fetch, {}));
        expect(error).toBeInstanceOf(FetchError);
        expect((error as FetchError).reason).toBe("not_allowed");
      }
    });

    it("takes an answer from another path under the repository's directory", async () => {
      const fetch = fakeFetch(
        filesOf(csvOf(), {
          url: "https://raw.githubusercontent.com/stanford-crfm/fmti/refs/heads/main/Dec2025/Dec2025_scores.csv",
        }),
      );
      expect(await fmtiConnector.download(fetch, {})).not.toBe("unchanged");
    });

    it("takes the type that the real server answers with, and fails for another", async () => {
      for (const contentType of ["text/plain; charset=utf-8", "text/plain"]) {
        const fetch = fakeFetch(filesOf(csvOf(), { contentType }));
        expect(await fmtiConnector.download(fetch, {})).not.toBe("unchanged");
      }
      const fetch = fakeFetch(filesOf(csvOf(), { contentType: "text/html" }));
      const error = await failureOf(fmtiConnector.download(fetch, {}));
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).reason).toBe("unsupported_type");
    });
  });

  describe("parse of a body that the download made", () => {
    it("is the same for the same body: the records do not depend on the clock", async () => {
      const { snapshot } = await run(csvOf());
      expect(fmtiConnector.parse(snapshot)).toEqual(fmtiConnector.parse(snapshot));
    });

    it("leaves out, as unreadable, a row whose id cannot be written in an address", async () => {
      const { snapshot } = await run(csvOf());
      const body = JSON.parse(snapshot.bodies[0]) as Body;
      body.rows[0].id = `abc${String.fromCharCode(0xd800)}`;
      const parsed = fmtiConnector.parse({ ...snapshot, bodies: [JSON.stringify(body)] });
      expect(parsed.records).toHaveLength(10);
      expect(parsed).toMatchObject({ errors: 0, skipped: 1 });
    });

    it("writes the id of a row into the address encoded, as the one value of the query", async () => {
      const { snapshot } = await run(csvOf());
      const body = JSON.parse(snapshot.bodies[0]) as Body;
      const id = "a#b&c=d e/f?g%h";
      body.rows[0].id = id;
      const parsed = fmtiConnector.parse({ ...snapshot, bodies: [JSON.stringify(body)] });
      const record = parsed.records.find((candidate) => candidate.sourceRecordId === id);
      expect(record?.url).toBe(`${PAGE_URL}a%23b%26c%3Dd%20e%2Ff%3Fg%25h`);
      expect(new URL(record?.url ?? "").searchParams.get("developer")).toBe(id);
    });

    it("is no list for a body that is not the one of the download", () => {
      const result = fmtiConnector.parse({
        bodies: ["{}"],
        etag: null,
        lastModified: null,
        bytes: 2,
      });
      expect(result).toMatchObject({ records: [], root: null });
      expect(result.errors).toBeGreaterThan(0);
    });
  });
});
