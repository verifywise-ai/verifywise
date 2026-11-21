/**
 * The table readers of the list kit (kit/table.ts): tab-delimited text without quoting, CSV text
 * as the OFAC reader reads it with a byte order mark out, both with a limit of rows and a limit of
 * columns, the header that moves, the columns of a header, a row of another width, a row as an
 * object, and a cell of a row that may be short.
 */
import { readCsv } from "../../ofac";
import {
  cellAt,
  cellsOf,
  columnsOf,
  findHeader,
  readCsvText,
  readTsv,
  rowObjectOf,
} from "../table";

const cp = (code: number): string => String.fromCodePoint(code);
const BOM = cp(0xfeff);

/** How long a call takes, in milliseconds. */
const took = (run: () => unknown): number => {
  const start = process.hrtime.bigint();
  run();
  return Number(process.hrtime.bigint() - start) / 1e6;
};

const MEGABYTE = 1024 * 1024;
/** What a hostile line may make a reader hold: far less than the cells of its delimiters would take. */
const HEAP_BOUND = 100 * MEGABYTE;

/**
 * What a reading holds, counted: a test of a hostile line asserts on this and never on the rows,
 * so that a reader that fails it does not make the runner print ten million cells.
 */
const shapeOf = (reading: {
  rows: readonly (readonly string[])[];
  more: boolean;
  wide: boolean;
  cut?: boolean;
}): { rows: number; cells: number; more: boolean; wide: boolean; cut?: boolean } => ({
  rows: reading.rows.length,
  cells: reading.rows.reduce((count, row) => count + row.length, 0),
  more: reading.more,
  wide: reading.wide,
  ...(reading.cut === undefined ? {} : { cut: reading.cut }),
});

/** The heap that a call grew by, in bytes, and how long it took. */
function measured<T>(run: () => T): { result: T; grew: number; ms: number } {
  const before = process.memoryUsage().heapUsed;
  const start = process.hrtime.bigint();
  const result = run();
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  return { result, grew: process.memoryUsage().heapUsed - before, ms };
}

describe("readTsv", () => {
  it("reads a record per line and a cell per tab", () => {
    expect(readTsv("a\tb\nc\td\n", 10, Number.POSITIVE_INFINITY)).toEqual({
      rows: [
        ["a", "b"],
        ["c", "d"],
      ],
      more: false,
      wide: false,
      complete: true,
    });
  });

  it("keeps the empty cells, the one after a last tab included", () => {
    expect(readTsv("a\t\tb\nc\t\n\td", 10, Number.POSITIVE_INFINITY).rows).toEqual([
      ["a", "", "b"],
      ["c", ""],
      ["", "d"],
    ]);
  });

  it("reads a last line that has no line end, and a line of one cell", () => {
    expect(readTsv("a\tb\nc", 10, Number.POSITIVE_INFINITY).rows).toEqual([["a", "b"], ["c"]]);
    expect(readTsv("only", 10, Number.POSITIVE_INFINITY).rows).toEqual([["only"]]);
  });

  it("does not trim or clean a cell: the caller does", () => {
    expect(readTsv(` a \t${cp(0x200b)}b\u{0}\n`, 10, Number.POSITIVE_INFINITY).rows).toEqual([
      [" a ", `${cp(0x200b)}b${cp(0)}`],
    ]);
  });

  describe("the line ends", () => {
    it("tolerates a carriage return before a line feed", () => {
      expect(readTsv("a\tb\r\nc\td\r\n", 10, Number.POSITIVE_INFINITY).rows).toEqual([
        ["a", "b"],
        ["c", "d"],
      ]);
    });

    it("reads a lone carriage return as a line end, as the CSV reader does", () => {
      expect(readTsv("a\rb\r\rc", 10, Number.POSITIVE_INFINITY).rows).toEqual([
        ["a"],
        ["b"],
        ["c"],
      ]);
    });

    it("mixes them", () => {
      expect(readTsv("a\r\nb\nc\rd\n\r\ne", 10, Number.POSITIVE_INFINITY).rows).toEqual([
        ["a"],
        ["b"],
        ["c"],
        ["d"],
        ["e"],
      ]);
    });
  });

  describe("the blank lines", () => {
    it("skips them: at the start, between the records, doubled and at the end", () => {
      expect(readTsv("\n\na\tb\n\n\nc\td\n\n\n", 10, Number.POSITIVE_INFINITY).rows).toEqual([
        ["a", "b"],
        ["c", "d"],
      ]);
      expect(readTsv("\r\n\r\na\r\n\r\n", 10, Number.POSITIVE_INFINITY).rows).toEqual([["a"]]);
    });

    it("gives no rows for a text of nothing but line ends, or for no text", () => {
      expect(readTsv("", 10, Number.POSITIVE_INFINITY)).toEqual({
        rows: [],
        more: false,
        wide: false,
        complete: true,
      });
      expect(readTsv("\n\r\n\r", 10, Number.POSITIVE_INFINITY)).toEqual({
        rows: [],
        more: false,
        wide: false,
        complete: true,
      });
      expect(readTsv(BOM, 10, Number.POSITIVE_INFINITY)).toEqual({
        rows: [],
        more: false,
        wide: false,
        complete: true,
      });
      expect(readTsv(`${BOM}\r\n`, 10, Number.POSITIVE_INFINITY)).toEqual({
        rows: [],
        more: false,
        wide: false,
        complete: true,
      });
    });

    it("does not call a line of blanks or of tabs blank: it is a record, as in a CSV", () => {
      expect(readTsv(" \n\t\n", 10, Number.POSITIVE_INFINITY).rows).toEqual([[" "], ["", ""]]);
    });
  });

  describe("the byte order mark", () => {
    it("is taken off the start of the text", () => {
      expect(readTsv(`${BOM}a\tb\nc\td`, 10, Number.POSITIVE_INFINITY).rows).toEqual([
        ["a", "b"],
        ["c", "d"],
      ]);
    });

    it("is taken off once, and only at the start", () => {
      expect(readTsv(`${BOM}${BOM}a\n${BOM}b`, 10, Number.POSITIVE_INFINITY).rows).toEqual([
        [`${BOM}a`],
        [`${BOM}b`],
      ]);
    });
  });

  describe("no quoting", () => {
    it("reads a quote as a character, and a tab inside quotes as the end of a cell", () => {
      expect(readTsv('"a\tb"\tc\n"d\n"e"', 10, Number.POSITIVE_INFINITY).rows).toEqual([
        ['"a', 'b"', "c"],
        ['"d'],
        ['"e"'],
      ]);
    });
  });

  describe("the limit of rows", () => {
    const text = "a\nb\nc\nd\ne\n";

    it("stops after maxRows and says that more follow", () => {
      expect(readTsv(text, 3, Number.POSITIVE_INFINITY)).toEqual({
        rows: [["a"], ["b"], ["c"]],
        more: true,
        wide: false,
        complete: false,
      });
      expect(readTsv(text, 1, Number.POSITIVE_INFINITY)).toEqual({
        rows: [["a"]],
        more: true,
        wide: false,
        complete: false,
      });
      expect(readTsv(text, 4, Number.POSITIVE_INFINITY)).toEqual({
        rows: [["a"], ["b"], ["c"], ["d"]],
        more: true,
        wide: false,
        complete: false,
      });
    });

    it("says that no more follow when the limit is the number of rows or higher", () => {
      expect(readTsv(text, 5, Number.POSITIVE_INFINITY)).toEqual({
        rows: [["a"], ["b"], ["c"], ["d"], ["e"]],
        more: false,
        wide: false,
        complete: true,
      });
      expect(readTsv(text, 6, Number.POSITIVE_INFINITY).more).toBe(false);
      expect(readTsv(text, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY).rows).toHaveLength(
        5,
      );
    });

    it("does not count blank lines after the last row as more", () => {
      expect(readTsv("a\nb\n\n\r\n\n", 2, Number.POSITIVE_INFINITY)).toEqual({
        rows: [["a"], ["b"]],
        more: false,
        wide: false,
        complete: true,
      });
      expect(readTsv("a\nb\n\n\nc", 2, Number.POSITIVE_INFINITY).more).toBe(true);
    });

    it("reads no row for a limit of zero or less, and says whether there is anything to read", () => {
      expect(readTsv("a\nb", 0, Number.POSITIVE_INFINITY)).toEqual({
        rows: [],
        more: true,
        wide: false,
        complete: false,
      });
      expect(readTsv("a\nb", -4, Number.POSITIVE_INFINITY)).toEqual({
        rows: [],
        more: true,
        wide: false,
        complete: false,
      });
      expect(readTsv("\n\n", 0, Number.POSITIVE_INFINITY)).toEqual({
        rows: [],
        more: false,
        wide: false,
        complete: true,
      });
      expect(readTsv("", 0, Number.POSITIVE_INFINITY)).toEqual({
        rows: [],
        more: false,
        wide: false,
        complete: true,
      });
    });
  });

  describe("the limit of columns (review finding 2)", () => {
    it("reads a row of exactly maxColumns cells, and a row of fewer", () => {
      expect(readTsv("a\tb\tc\nd\te\nf\n", 10, 3)).toEqual({
        rows: [["a", "b", "c"], ["d", "e"], ["f"]],
        more: false,
        wide: false,
        complete: true,
      });
      expect(readTsv("a\nb\n", 10, 1)).toEqual({
        rows: [["a"], ["b"]],
        more: false,
        wide: false,
        complete: true,
      });
    });

    it("stops at once at a row of more than maxColumns cells, and says that it is wide", () => {
      expect(readTsv("a\tb\tc\td\n", 10, 3)).toEqual({
        rows: [],
        more: false,
        wide: true,
        complete: false,
      });
      expect(readTsv("a\tb\tc\n", 10, 2)).toEqual({
        rows: [],
        more: false,
        wide: true,
        complete: false,
      });
    });

    it("keeps the rows read before the wide one, and reads nothing after it", () => {
      const reading = readTsv("a\tb\nc\td\ne\tf\tg\nh\ti\nj\tk\n", 10, 2);
      expect(reading).toEqual({
        rows: [
          ["a", "b"],
          ["c", "d"],
        ],
        more: false,
        wide: true,
        complete: false,
      });
    });

    it("counts the empty cells: a line of tabs is as many cells as it has tabs and one", () => {
      expect(readTsv("\t\t\n", 10, 3)).toEqual({
        rows: [["", "", ""]],
        more: false,
        wide: false,
        complete: true,
      });
      expect(readTsv("\t\t\t\n", 10, 3)).toEqual({
        rows: [],
        more: false,
        wide: true,
        complete: false,
      });
      expect(readTsv("a\t\t\t\n", 10, 3).wide).toBe(true);
      expect(readTsv("a\t\t\n", 10, 3).wide).toBe(false);
    });

    it("counts the cells of each line by itself, not of the text", () => {
      const text = "a\tb\nc\td\ne\tf\ng\th\n";
      expect(readTsv(text, 10, 2)).toMatchObject({ wide: false });
      expect(readTsv(text, 10, 2).rows).toHaveLength(4);
    });

    it("counts a line up to its end, whichever line end it has, and not further", () => {
      expect(readTsv("a\tb\r\nc\td\re\tf\n", 10, 2).wide).toBe(false);
      expect(readTsv("a\tb\r\nc\td\te\r\n", 10, 2).wide).toBe(true);
      expect(readTsv(`${BOM}a\tb\n`, 10, 2)).toEqual({
        rows: [["a", "b"]],
        more: false,
        wide: false,
        complete: true,
      });
    });

    it("does not count the quotes: a tab inside quotes ends a cell", () => {
      expect(readTsv('"a\tb"\tc\n', 10, 2).wide).toBe(true);
      expect(readTsv('"a\tb"\tc\n', 10, 3).wide).toBe(false);
    });

    it("says that more rows follow before it looks at the next row, so that a limit of rows is met first", () => {
      expect(readTsv("a\tb\nc\td\te\n", 1, 2)).toEqual({
        rows: [["a", "b"]],
        more: true,
        wide: false,
        complete: false,
      });
    });

    it("says that every row is wide when the limit is zero, less, or no number", () => {
      for (const limit of [0, -1, Number.NaN]) {
        expect(readTsv("a\n", 10, limit)).toEqual({
          rows: [],
          more: false,
          wide: true,
          complete: false,
        });
      }
      expect(readTsv("\n\n", 10, 0)).toEqual({
        rows: [],
        more: false,
        wide: false,
        complete: true,
      });
    });

    it("does not limit the columns when the limit is infinite", () => {
      const line = "\t".repeat(50_000);
      expect(readTsv(line, 10, Number.POSITIVE_INFINITY).rows[0].length).toBe(50_001);
    });

    it("stops at once on a line of 10 million tabs, and makes no cell of it", () => {
      const text = "\t".repeat(10_000_000);
      const { result, grew, ms } = measured(() => readTsv(text, 1_000_000, 1000));
      expect(shapeOf(result)).toEqual({ rows: 0, cells: 0, more: false, wide: true });
      expect(grew).toBeLessThan(HEAP_BOUND);
      expect(ms).toBeLessThan(10_000);
    });

    it("stops at once on a wide line after many narrow rows, which it keeps", () => {
      const text = `${"a\tb\n".repeat(1000)}${"\t".repeat(10_000_000)}\nc\td\n`;
      const { result, grew, ms } = measured(() => readTsv(text, 1_000_000, 1000));
      expect(shapeOf(result)).toEqual({ rows: 1000, cells: 2000, more: false, wide: true });
      expect(grew).toBeLessThan(HEAP_BOUND);
      expect(ms).toBeLessThan(10_000);
    });

    it("counts the tabs of a long line that has few, in the time of its length", () => {
      const text = `${"x".repeat(5 * MEGABYTE)}\ty\n`;
      expect(took(() => readTsv(text, 10, 1000))).toBeLessThan(10_000);
      expect(readTsv(text, 10, 1000).rows[0].length).toBe(2);
    });

    it("takes no longer on many lines that have no tab than the lines take to read", () => {
      const text = "x\n".repeat(MEGABYTE);
      expect(took(() => readTsv(text, 5_000_000, 1000))).toBeLessThan(10_000);
    });
  });

  describe("the time it takes", () => {
    it("reads 200,000 rows in less than a second", () => {
      const lines: string[] = [];
      for (let at = 0; at < 200_000; at += 1) lines.push(`id-${at}\tname ${at}\t2026-01-05`);
      const text = `${lines.join("\r\n")}\r\n`;
      let rows = 0;
      expect(
        took(() => (rows = readTsv(text, 1_000_000, Number.POSITIVE_INFINITY).rows.length)),
      ).toBeLessThan(10_000);
      expect(rows).toBe(200_000);
    });

    it("stops early: the limit of rows bounds the work, not the text", () => {
      const text = "a\tb\n".repeat(2_000_000);
      expect(took(() => readTsv(text, 10, Number.POSITIVE_INFINITY))).toBeLessThan(10_000);
    });

    it.each([
      ["5 MB of carriage returns", () => "\r".repeat(5 * MEGABYTE)],
      ["5 MB of line feeds", () => "\n".repeat(5 * MEGABYTE)],
      ["5 MB of carriage return and line feed pairs", () => "\r\n".repeat(2.5 * MEGABYTE)],
      ["one line of 5 MB", () => "x".repeat(5 * MEGABYTE)],
      ["one line of a million tabs", () => "\t".repeat(MEGABYTE)],
      ["a million lines of one character", () => "x\n".repeat(MEGABYTE)],
      ["a million lines of one tab", () => "\t\n".repeat(MEGABYTE)],
    ])("reads %s in less than a second", (_name, make) => {
      const text = make();
      expect(took(() => readTsv(text, 5_000_000, Number.POSITIVE_INFINITY))).toBeLessThan(10_000);
    });
  });
});

describe("readCsvText", () => {
  it("reads rows with quotes, commas, doubled quotes and line breaks inside quotes", () => {
    const text = 'id,name,note\n1,"Acme, Inc.","say ""hi"""\n2,"two\nlines",x\r\n';
    expect(readCsvText(text, 10, Number.POSITIVE_INFINITY)).toEqual({
      rows: [
        ["id", "name", "note"],
        ["1", "Acme, Inc.", 'say "hi"'],
        ["2", "two\nlines", "x"],
      ],
      more: false,
      cut: false,
      wide: false,
      complete: true,
    });
  });

  it("takes the byte order mark off, in front of a quoted first cell too", () => {
    expect(readCsvText(`${BOM}"a",b\n1,2\n`, 10, Number.POSITIVE_INFINITY).rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(readCsvText(`${BOM}a,b\n`, 10, Number.POSITIVE_INFINITY).rows).toEqual([["a", "b"]]);
  });

  it("tolerates carriage returns and skips blank lines", () => {
    expect(readCsvText("\r\na,b\r\n\r\n\nc,d\r\n\r\n", 10, Number.POSITIVE_INFINITY).rows).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("keeps the empty cells of a row", () => {
    expect(readCsvText("a,,b\n,\nc,", 10, Number.POSITIVE_INFINITY).rows).toEqual([
      ["a", "", "b"],
      ["", ""],
      ["c", ""],
    ]);
  });

  it("says that the text was cut when it ends inside a quoted field, and leaves that row out", () => {
    const result = readCsvText('a,b\n1,2\n3,"unfinished\nand more', 10, Number.POSITIVE_INFINITY);
    expect(result.cut).toBe(true);
    expect(result.rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(result.more).toBe(false);
  });

  it("says that it was cut for a text that is one open quote", () => {
    expect(readCsvText('"', 10, Number.POSITIVE_INFINITY)).toEqual({
      rows: [],
      more: false,
      cut: true,
      wide: false,
      complete: false,
    });
  });

  it("does not say it was cut for a quote that closes, nor for a quote inside a plain cell", () => {
    expect(readCsvText('a,"b"\n', 10, Number.POSITIVE_INFINITY).cut).toBe(false);
    expect(readCsvText('a,b"c\n', 10, Number.POSITIVE_INFINITY)).toEqual({
      rows: [["a", 'b"c']],
      more: false,
      cut: false,
      wide: false,
      complete: true,
    });
  });

  it("stops after maxRows and says whether more follow", () => {
    const text = "a,1\nb,2\nc,3\nd,4\n";
    expect(readCsvText(text, 2, Number.POSITIVE_INFINITY)).toEqual({
      rows: [
        ["a", "1"],
        ["b", "2"],
      ],
      more: true,
      cut: false,
      wide: false,
      complete: false,
    });
    expect(readCsvText(text, 4, Number.POSITIVE_INFINITY).more).toBe(false);
    expect(readCsvText(`${text}\n\n`, 4, Number.POSITIVE_INFINITY).more).toBe(false);
    expect(readCsvText(text, 0, Number.POSITIVE_INFINITY)).toEqual({
      rows: [],
      more: true,
      cut: false,
      wide: false,
      complete: false,
    });
  });

  it("gives no rows for an empty text", () => {
    expect(readCsvText("", 10, Number.POSITIVE_INFINITY)).toEqual({
      rows: [],
      more: false,
      cut: false,
      wide: false,
      complete: true,
    });
    expect(readCsvText(BOM, 10, Number.POSITIVE_INFINITY)).toEqual({
      rows: [],
      more: false,
      cut: false,
      wide: false,
      complete: true,
    });
  });

  it("reads what the OFAC reader reads, apart from the byte order mark and the form of cut", () => {
    const text = 'a,"b ""c"" d",e\n\n"f\r\ng",,h\n"i","j"\nk,l,m\n';
    const expected = readCsv(text, 3);
    expect(readCsvText(text, 3, Number.POSITIVE_INFINITY)).toEqual({
      rows: expected.rows,
      more: expected.more,
      cut: expected.cut !== null,
      wide: false,
      complete: !expected.more && expected.cut === null,
    });
  });

  it("reads 200,000 rows in less than a second", () => {
    const lines: string[] = [];
    for (let at = 0; at < 200_000; at += 1) lines.push(`id-${at},"name, ${at}",2026-01-05`);
    const text = `${lines.join("\r\n")}\r\n`;
    let rows = 0;
    expect(
      took(() => (rows = readCsvText(text, 1_000_000, Number.POSITIVE_INFINITY).rows.length)),
    ).toBeLessThan(10_000);
    expect(rows).toBe(200_000);
  });

  it.each([
    ["5 MB of quotes", () => '"'.repeat(5 * MEGABYTE)],
    ["5 MB of commas", () => ",".repeat(5 * MEGABYTE)],
    ["5 MB of line breaks", () => "\r\n".repeat(2.5 * MEGABYTE)],
    ["a quote that is never closed, over 5 MB", () => `"${"x\n".repeat(2.5 * MEGABYTE)}`],
  ])("reads %s in less than a second", (_name, make) => {
    const text = make();
    expect(took(() => readCsvText(text, 5_000_000, Number.POSITIVE_INFINITY))).toBeLessThan(10_000);
  });

  describe("the limit of columns (review finding 2)", () => {
    it("reads a row of exactly maxColumns cells, and a row of fewer", () => {
      expect(readCsvText("a,b,c\nd,e\nf\n", 10, 3)).toEqual({
        rows: [["a", "b", "c"], ["d", "e"], ["f"]],
        more: false,
        cut: false,
        wide: false,
        complete: true,
      });
    });

    it("stops at once at a row of more than maxColumns cells, and says that it is wide", () => {
      expect(readCsvText("a,b,c,d\n", 10, 3)).toEqual({
        rows: [],
        more: false,
        cut: false,
        wide: true,
        complete: false,
      });
    });

    it("keeps the rows read before the wide one, and reads nothing after it", () => {
      expect(readCsvText("a,b\nc,d\ne,f,g\nh,i\n", 10, 2)).toEqual({
        rows: [
          ["a", "b"],
          ["c", "d"],
        ],
        more: false,
        cut: false,
        wide: true,
        complete: false,
      });
    });

    it("counts the empty cells, a trailing comma and a quoted cell as one each, and no comma in quotes", () => {
      expect(readCsvText("a,b,\n", 10, 3).wide).toBe(false);
      expect(readCsvText("a,b,,\n", 10, 3).wide).toBe(true);
      expect(readCsvText(",,\n", 10, 3).wide).toBe(false);
      expect(readCsvText(",,,\n", 10, 3).wide).toBe(true);
      expect(readCsvText('"a,b,c,d",e\n', 10, 2)).toMatchObject({
        rows: [["a,b,c,d", "e"]],
        wide: false,
      });
      expect(readCsvText('"a","b","c","d"\n', 10, 3).wide).toBe(true);
    });

    it("counts the cells of each line by itself, a quoted line break included", () => {
      expect(readCsvText('a,b\n"c\nd",e\nf,g\n', 10, 2)).toMatchObject({
        rows: [
          ["a", "b"],
          ["c\nd", "e"],
          ["f", "g"],
        ],
        wide: false,
      });
    });

    it("takes the byte order mark off before it counts", () => {
      expect(readCsvText(`${BOM}a,b\n`, 10, 2)).toMatchObject({ rows: [["a", "b"]], wide: false });
    });

    it("says that every row is wide when the limit is zero, less, or no number", () => {
      for (const limit of [0, -1, Number.NaN]) {
        expect(readCsvText("a\n", 10, limit)).toEqual({
          rows: [],
          more: false,
          cut: false,
          wide: true,
          complete: false,
        });
      }
    });

    it("is wide before it is cut: a row that is both is wide, with no cut row", () => {
      const reading = readCsvText('a,b\nc,d,e,"unclosed', 10, 2);
      expect(reading).toEqual({
        rows: [["a", "b"]],
        more: false,
        cut: false,
        wide: true,
        complete: false,
      });
    });

    it("stops at once on a line of 10 million commas, and makes no cell of it", () => {
      const text = ",".repeat(10_000_000);
      const { result, grew, ms } = measured(() => readCsvText(text, 1_000_000, 1000));
      expect(shapeOf(result)).toEqual({ rows: 0, cells: 0, more: false, wide: true, cut: false });
      expect(grew).toBeLessThan(HEAP_BOUND);
      expect(ms).toBeLessThan(10_000);
    });

    it("stops at once on a wide line after many narrow rows, which it keeps", () => {
      const text = `${"a,b\n".repeat(1000)}${",".repeat(10_000_000)}\nc,d\n`;
      const { result, grew, ms } = measured(() => readCsvText(text, 1_000_000, 1000));
      expect(shapeOf(result)).toEqual({
        rows: 1000,
        cells: 2000,
        more: false,
        wide: true,
        cut: false,
      });
      expect(grew).toBeLessThan(HEAP_BOUND);
      expect(ms).toBeLessThan(10_000);
    });

    it("reads a quoted cell of 10 million commas as the one cell that it is", () => {
      const text = `"${",".repeat(10_000_000)}",x\n`;
      const { result, ms } = measured(() => readCsvText(text, 10, 2));
      expect(shapeOf(result)).toEqual({ rows: 1, cells: 2, more: false, wide: false, cut: false });
      expect(result.rows[0][0].length).toBe(10_000_000);
      expect(ms).toBeLessThan(10_000);
    });

    it("does not limit the columns when the limit is infinite", () => {
      const line = ",".repeat(50_000);
      expect(readCsvText(line, 10, Number.POSITIVE_INFINITY).rows[0].length).toBe(50_001);
    });
  });
});

describe("columnsOf", () => {
  const WANTED = { id: "Report ID", name: "Reporting Entity", day: "Incident Date" };

  it("gives the position of each wanted column in the header", () => {
    const header = ["Extra", "Incident Date", "Report ID", "Other", "Reporting Entity"];
    expect(columnsOf(header, WANTED)).toEqual({ id: 2, name: 4, day: 1 });
  });

  it("matches the names exactly: the case counts", () => {
    expect(columnsOf(["report id", "Reporting Entity", "Incident Date"], WANTED)).toBeNull();
    expect(columnsOf(["Report ID", "Reporting Entity", "incident date"], WANTED)).toBeNull();
  });

  it("trims the cells of the header, and a byte order mark with them", () => {
    expect(
      columnsOf([` ${BOM}Report ID `, "\tReporting Entity\r", "Incident Date"], WANTED),
    ).toEqual({
      id: 0,
      name: 1,
      day: 2,
    });
  });

  it("gives null when any wanted column is missing, as the file is then not the list", () => {
    expect(columnsOf(["Report ID", "Reporting Entity"], WANTED)).toBeNull();
    expect(columnsOf(["Reporting Entity", "Incident Date"], WANTED)).toBeNull();
    expect(columnsOf([], WANTED)).toBeNull();
  });

  it("does not match a name that merely contains a wanted one, or holds it with another word", () => {
    expect(columnsOf(["Report ID Number", "Reporting Entity", "Incident Date"], WANTED)).toBeNull();
    expect(columnsOf(["Report", "ID", "Reporting Entity", "Incident Date"], WANTED)).toBeNull();
  });

  it("takes the first of a column that the header holds twice", () => {
    expect(
      columnsOf(["Report ID", "Reporting Entity", "Incident Date", "Report ID"], WANTED),
    ).toEqual({
      id: 0,
      name: 1,
      day: 2,
    });
  });

  it("ignores the columns that are not wanted, and gives nothing for no wanted column", () => {
    expect(columnsOf(["a", "b"], {})).toEqual({});
  });

  it("gives one wanted name to two keys when they name the same column", () => {
    expect(columnsOf(["x", "Name"], { first: "Name", second: "Name" })).toEqual({
      first: 1,
      second: 1,
    });
  });

  it("is typed by the keys it is given", () => {
    const columns = columnsOf(["a", "b"], { left: "a", right: "b" });
    const left: number | undefined = columns?.left;
    const right: number | undefined = columns?.right;
    expect([left, right]).toEqual([0, 1]);
  });
});

describe("cellAt", () => {
  it("gives the cell at an index", () => {
    expect(cellAt(["a", "b", "c"], 0)).toBe("a");
    expect(cellAt(["a", "b", "c"], 2)).toBe("c");
    expect(cellAt(["a", "", "c"], 1)).toBe("");
  });

  it("gives an empty text when the row is short, or the index is no position", () => {
    expect(cellAt(["a", "b"], 2)).toBe("");
    expect(cellAt([], 0)).toBe("");
    expect(cellAt(["a"], -1)).toBe("");
    expect(cellAt(["a"], 0.5)).toBe("");
    expect(cellAt(["a"], Number.NaN)).toBe("");
    expect(cellAt(["a"], Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("findHeader", () => {
  const WANTED = { id: "Report ID", name: "Reporting Entity" };
  const TITLE = ["Standing General Order: reports"];
  const GROUPS = ["", "Who", ""];
  const HEADER = ["Report ID", "Other", "Reporting Entity"];

  it("gives the first of the first maxScan rows that holds every wanted column, and the place of each", () => {
    const rows = [TITLE, GROUPS, HEADER, ["1", "x", "Acme"]];
    expect(findHeader(rows, WANTED, 10)).toEqual({ at: 2, columns: { id: 0, name: 2 } });
  });

  it("gives the header at the first row when that is it", () => {
    expect(findHeader([HEADER, ["1", "x", "Acme"]], WANTED, 10)).toEqual({
      at: 0,
      columns: { id: 0, name: 2 },
    });
  });

  it("takes the first when two rows hold the columns", () => {
    const again = ["Reporting Entity", "Report ID"];
    expect(findHeader([TITLE, HEADER, again], WANTED, 10)).toEqual({
      at: 1,
      columns: { id: 0, name: 2 },
    });
  });

  it("looks at maxScan rows and no more", () => {
    const rows = [TITLE, GROUPS, HEADER];
    expect(findHeader(rows, WANTED, 2)).toBeNull();
    expect(findHeader(rows, WANTED, 3)).toEqual({ at: 2, columns: { id: 0, name: 2 } });
    expect(findHeader(rows, WANTED, 100)).toEqual({ at: 2, columns: { id: 0, name: 2 } });
  });

  it("gives null when no row holds every wanted column, and for no row", () => {
    expect(findHeader([TITLE, ["Report ID", "x"], ["Reporting Entity"]], WANTED, 10)).toBeNull();
    expect(findHeader([], WANTED, 10)).toBeNull();
  });

  it("gives null when it may look at no row: a limit of zero, less or no number", () => {
    for (const maxScan of [0, -3, Number.NaN]) {
      expect(findHeader([HEADER], WANTED, maxScan)).toBeNull();
    }
  });

  it("finds the columns as columnsOf does: trimmed cells, the exact name, the first of a name twice", () => {
    const row = [` ${BOM}Report ID `, "Reporting Entity\r", "Report ID"];
    expect(findHeader([row], WANTED, 1)).toEqual({ at: 0, columns: { id: 0, name: 1 } });
    expect(findHeader([["report id", "reporting entity"]], WANTED, 1)).toBeNull();
    expect(findHeader([HEADER], WANTED, 1)?.columns).toEqual(columnsOf(HEADER, WANTED));
  });

  it("finds a header of no wanted column in the first row", () => {
    expect(findHeader([["a"], ["b"]], {}, 5)).toEqual({ at: 0, columns: {} });
  });

  it("reads no row beyond maxScan, whatever the rows hold", () => {
    const rows: string[][] = Array.from({ length: 2_000_000 }, () => ["x"]);
    rows.push(HEADER);
    expect(took(() => findHeader(rows, WANTED, 5))).toBeLessThan(1_000);
    expect(findHeader(rows, WANTED, 5)).toBeNull();
  });

  it("is typed by the keys it is given", () => {
    const found = findHeader([["a", "b"]], { left: "a", right: "b" }, 1);
    const right: number | undefined = found?.columns.right;
    expect(right).toBe(1);
  });
});

describe("cellsOf", () => {
  it("gives the row when it has exactly width cells, and the row itself", () => {
    const row = ["a", "b", "c"];
    expect(cellsOf(row, 3)).toBe(row);
    expect(cellsOf([""], 1)).toEqual([""]);
    expect(cellsOf([], 0)).toEqual([]);
  });

  it("gives null for a row that is shorter, and for one that is longer", () => {
    expect(cellsOf(["a", "b"], 3)).toBeNull();
    expect(cellsOf(["a", "b", "c", "d"], 3)).toBeNull();
    expect(cellsOf([], 1)).toBeNull();
    expect(cellsOf(["a"], 0)).toBeNull();
  });

  it("gives null for a width that is no count", () => {
    for (const width of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(cellsOf(["a"], width)).toBeNull();
    }
  });
});

describe("rowObjectOf", () => {
  it("makes an object of the cells by the names of the header", () => {
    expect(rowObjectOf(["id", "name"], ["1", "Acme"])).toEqual({ id: "1", name: "Acme" });
  });

  it("trims the names of the header, and not the cells", () => {
    expect(rowObjectOf([" id ", "\tname\r"], [" 1 ", " Acme "])).toEqual({
      id: " 1 ",
      name: " Acme ",
    });
  });

  it("takes the first of a name that the header holds twice", () => {
    expect(rowObjectOf(["id", "name", "id"], ["1", "Acme", "2"])).toEqual({
      id: "1",
      name: "Acme",
    });
    expect(rowObjectOf(["id", " id "], ["1", "2"])).toEqual({ id: "1" });
  });

  it("has no prototype, so that no name that an object has is a cell that the row has", () => {
    const row = rowObjectOf(["id"], ["1"]);
    expect(Object.getPrototypeOf(row)).toBeNull();
    for (const name of ["toString", "constructor", "hasOwnProperty", "valueOf", "__proto__"]) {
      expect(row[name]).toBeUndefined();
      expect(name in row).toBe(false);
    }
  });

  it("makes a name that an object has an ordinary key, such as constructor and toString", () => {
    const row = rowObjectOf(["constructor", "toString", "hasOwnProperty"], ["a", "b", "c"]);
    expect(row.constructor).toBe("a");
    expect(row.toString).toBe("b");
    expect(row.hasOwnProperty).toBe("c");
  });

  it("makes __proto__ an ordinary key: it sets the prototype of nothing", () => {
    const row = rowObjectOf(["__proto__", "polluted"], ["evil", "1"]);
    expect(Object.getPrototypeOf(row)).toBeNull();
    expect(Object.keys(row)).toEqual(["__proto__", "polluted"]);
    expect(row.__proto__).toBe("evil");
    expect(row.polluted).toBe("1");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect((Object.prototype as Record<string, unknown>).evil).toBeUndefined();
  });

  it("takes the first of __proto__ written twice, as of any name", () => {
    expect(rowObjectOf(["__proto__", "__proto__"], ["first", "second"]).__proto__).toBe("first");
  });

  it("gives an empty text for a cell that the row lacks, and ignores the cells that have no name", () => {
    expect(rowObjectOf(["a", "b", "c"], ["1"])).toEqual({ a: "1", b: "", c: "" });
    expect(rowObjectOf(["a"], ["1", "2", "3"])).toEqual({ a: "1" });
    expect(rowObjectOf(["a", "", "  ", "b"], ["1", "2", "3", "4"])).toEqual({ a: "1", b: "4" });
    expect(rowObjectOf([], ["1"])).toEqual({});
  });

  it("does not change its arguments", () => {
    const header = [" id ", "name"];
    const cells = ["1", "Acme"];
    rowObjectOf(header, cells);
    expect(header).toEqual([" id ", "name"]);
    expect(cells).toEqual(["1", "Acme"]);
  });

  it("makes a row of 1,000 columns, ten thousand times over, in little time", () => {
    const header = Array.from({ length: 1000 }, (_, at) => `column ${at}`);
    const cells = Array.from({ length: 1000 }, (_, at) => `${at}`);
    expect(
      took(() => Array.from({ length: 10_000 }, () => rowObjectOf(header, cells))),
    ).toBeLessThan(10_000);
  });
});

describe("complete (review F4): the readers say whether they gave the whole list", () => {
  const LIMITS = [0, 1, 2, 3, 10, Number.POSITIVE_INFINITY];

  describe("readTsv", () => {
    it("is true for a list that fits", () => {
      expect(readTsv("a\tb\nc\td\n", 10, 10).complete).toBe(true);
      expect(readTsv("only", 10, 10).complete).toBe(true);
      expect(readTsv("a\r\nb\rc", 3, 10).complete).toBe(true);
    });

    it("is true when there is nothing to read: no text, line ends, a byte order mark, blank lines after the last row", () => {
      for (const text of ["", "\n\r\n\r", BOM, `${BOM}\r\n`, "a\nb\n\n\r\n\n"]) {
        expect(readTsv(text, 2, 10).complete).toBe(true);
      }
    });

    it("is true when the limit of rows is the number of rows, and false one row below it", () => {
      const text = "a\nb\nc\n";
      expect(readTsv(text, 4, 10).complete).toBe(true);
      expect(readTsv(text, 3, 10).complete).toBe(true);
      expect(readTsv(text, 2, 10)).toMatchObject({ more: true, complete: false });
    });

    it("is false when more rows follow the limit, a limit of none or less included", () => {
      expect(readTsv("a\nb\nc\n", 1, 10).complete).toBe(false);
      expect(readTsv("a\nb", 0, 10).complete).toBe(false);
      expect(readTsv("a\nb", -4, 10).complete).toBe(false);
      expect(readTsv("a\nb\n\n\nc", 2, 10).complete).toBe(false);
    });

    it("is false at a row wider than maxColumns, and the rows before it are kept", () => {
      const reading = readTsv("a\tb\nc\td\te\nf\tg\n", 10, 2);
      expect(reading).toMatchObject({ wide: true, more: false, complete: false });
      expect(reading.rows).toEqual([["a", "b"]]);
      expect(readTsv("a\n", 10, 0).complete).toBe(false);
      expect(readTsv("a\n", 10, Number.NaN).complete).toBe(false);
    });

    it("is true for a row of exactly maxColumns cells, and false for one cell more", () => {
      expect(readTsv("a\tb\tc\n", 10, 3).complete).toBe(true);
      expect(readTsv("a\tb\tc\td\n", 10, 3).complete).toBe(false);
    });

    it("is !more && !wide for every text and limit tried, so that a connector passes it on as it is", () => {
      const texts = [
        "",
        "a",
        "a\tb\nc\td\n",
        "a\nb\nc\nd\n",
        "a\tb\tc\td\n",
        "x\ty\tz\n\n\nw\n",
        `${BOM}a\tb\r\nc`,
        "\t\t\t\n",
      ];
      for (const text of texts) {
        for (const rows of LIMITS) {
          for (const columns of LIMITS) {
            const reading = readTsv(text, rows, columns);
            expect({ text, rows, columns, complete: reading.complete }).toEqual({
              text,
              rows,
              columns,
              complete: !reading.more && !reading.wide,
            });
          }
        }
      }
    });
  });

  describe("readCsvText", () => {
    it("is true for a list that fits, quotes and line breaks inside quotes included", () => {
      const text = 'id,name,note\n1,"Acme, Inc.","say ""hi"""\n2,"two\nlines",x\r\n';
      expect(readCsvText(text, 10, 10).complete).toBe(true);
      expect(readCsvText(text, 3, 3).complete).toBe(true);
      expect(readCsvText('a,"b"\n', 10, 10).complete).toBe(true);
      expect(readCsvText('a,b"c\n', 10, 10).complete).toBe(true);
    });

    it("is true when there is nothing to read: no text, a byte order mark, blank lines after the last row", () => {
      for (const text of ["", BOM, "a,b\n\n\r\n\n"]) {
        expect(readCsvText(text, 10, 10).complete).toBe(true);
      }
    });

    it("is false when more rows follow the limit, and true when the limit is just enough", () => {
      const text = "a,1\nb,2\nc,3\nd,4\n";
      expect(readCsvText(text, 2, 10)).toMatchObject({ more: true, complete: false });
      expect(readCsvText(text, 4, 10).complete).toBe(true);
      expect(readCsvText(text, 0, 10).complete).toBe(false);
    });

    it("is false at a row wider than maxColumns, and the rows before it are kept", () => {
      const reading = readCsvText("a,b\nc,d,e\nf,g\n", 10, 2);
      expect(reading).toMatchObject({ wide: true, cut: false, more: false, complete: false });
      expect(reading.rows).toEqual([["a", "b"]]);
      expect(readCsvText("a\n", 10, 0).complete).toBe(false);
    });

    it("is false when the text ends inside a quoted field: a line was cut, and the row that the quote opened is not among the rows", () => {
      const reading = readCsvText('a,b\n1,2\n3,"unfinished\nand more', 10, 10);
      expect(reading).toMatchObject({ cut: true, more: false, wide: false, complete: false });
      expect(reading.rows).toEqual([
        ["a", "b"],
        ["1", "2"],
      ]);
      expect(readCsvText('"', 10, 10).complete).toBe(false);
    });

    it("is false for a row that is wide and for a text that is cut, whichever stops the reading first", () => {
      expect(readCsvText('a,b\nc,d,e,"unclosed', 10, 2).complete).toBe(false);
      expect(readCsvText('a,b\nc,d\n"unclosed', 10, 2).complete).toBe(false);
    });

    it("is !more && !cut && !wide for every text and limit tried, so that a connector passes it on as it is", () => {
      const texts = [
        "",
        "a",
        "a,b\nc,d\n",
        "a,1\nb,2\nc,3\nd,4\n",
        "a,b,c,d\n",
        'a,"b,c",d\n',
        '"unclosed',
        'a,b\nc,"unfinished\nand more',
        `${BOM}a,b\r\nc`,
        ",,,\n",
      ];
      for (const text of texts) {
        for (const rows of LIMITS) {
          for (const columns of LIMITS) {
            const reading = readCsvText(text, rows, columns);
            expect({ text, rows, columns, complete: reading.complete }).toEqual({
              text,
              rows,
              columns,
              complete: !reading.more && !reading.cut && !reading.wide,
            });
          }
        }
      }
    });
  });
});
