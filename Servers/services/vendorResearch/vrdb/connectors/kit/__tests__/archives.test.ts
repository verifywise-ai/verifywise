/**
 * The archive helpers of the list kit (kit/archives.ts): the one file of a zip, and one sheet of a
 * workbook as a table of text, over the zip reader (vrdb/zip.ts) and the sheet reader
 * (vrdb/xlsx.ts), which do the reading. A zip and a workbook are third-party data: what is not one
 * is null, what is past a limit is too large (or an incomplete table), and nothing is a stack trace.
 * The archives are written by the test, with the zip writer of the zip reader's own tests.
 */
import ExcelJS from "exceljs";
import { type XlsxLimits } from "../../../xlsx";
import { type ZipLimits } from "../../../zip";
import { type WriterEntry, writeZip } from "../../../__tests__/helpers/zipWriter";
import { BodyTooLargeError } from "../../types";
import { onlyEntryOf, readSheetTable } from "../archives";

const ZIP_LIMITS: ZipLimits = {
  maxEntries: 16,
  maxEntryBytes: 1024 * 1024,
  maxTotalBytes: 4 * 1024 * 1024,
};

const csv = (name: string) => name.endsWith(".csv");

describe("onlyEntryOf", () => {
  const ONE = writeZip([{ name: "list.csv", data: "id,name\n1,Acme\n" }]);

  describe("a zip of one accepted entry", () => {
    it("gives the bytes of that entry", () => {
      const data = onlyEntryOf(ONE, csv, ZIP_LIMITS);
      expect(data).toBeInstanceOf(Buffer);
      expect(data?.toString("utf8")).toBe("id,name\n1,Acme\n");
    });

    it("gives the entry that is accepted among those that are not, wherever it is", () => {
      const zip = writeZip([
        { name: "readme.txt", data: "hello" },
        { name: "data/list.csv", data: "a,b\n" },
        { name: "notes.md", data: "# notes" },
      ]);
      expect(onlyEntryOf(zip, csv, ZIP_LIMITS)?.toString()).toBe("a,b\n");
    });

    it("gives the bytes of an entry that is stored, and of one that is deflated", () => {
      const stored = writeZip([{ name: "a.csv", data: "stored", method: 0 }]);
      const deflated = writeZip([{ name: "a.csv", data: "deflated", method: 8 }]);
      expect(onlyEntryOf(stored, csv, ZIP_LIMITS)?.toString()).toBe("stored");
      expect(onlyEntryOf(deflated, csv, ZIP_LIMITS)?.toString()).toBe("deflated");
    });

    it("gives bytes that are not text as they are", () => {
      const bytes = Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x0d, 0x0a]);
      expect(onlyEntryOf(writeZip([{ name: "a.csv", data: bytes }]), csv, ZIP_LIMITS)).toEqual(
        bytes,
      );
    });

    it("gives an empty buffer, and not null, for an entry that is empty", () => {
      const data = onlyEntryOf(writeZip([{ name: "a.csv", data: "" }]), csv, ZIP_LIMITS);
      expect(data).toBeInstanceOf(Buffer);
      expect(data).toHaveLength(0);
    });

    it("reads a zip of the Zip64 form", () => {
      const zip = writeZip([{ name: "a.csv", data: "zip64" }], { zip64: true });
      expect(onlyEntryOf(zip, csv, ZIP_LIMITS)?.toString()).toBe("zip64");
    });

    it("gives a buffer of its own: what is done to it does not reach the archive", () => {
      const zip = writeZip([{ name: "a.csv", data: "abcdef", method: 0 }]);
      const before = Buffer.from(zip);
      const data = onlyEntryOf(zip, csv, ZIP_LIMITS);
      data?.fill(0x7a);
      expect(zip.equals(before)).toBe(true);
    });

    it("is the same for the same archive each time", () => {
      expect(onlyEntryOf(ONE, csv, ZIP_LIMITS)).toEqual(onlyEntryOf(ONE, csv, ZIP_LIMITS));
    });
  });

  describe("the names that are asked about", () => {
    it("are handed to the test as the archive gives them, and never become a path", () => {
      const names = ["../../etc/passwd", "/abs/list.csv", "a\\b.csv", "C:\\x.csv"];
      for (const name of names) {
        const zip = writeZip([{ name, data: "x" }]);
        const asked: string[] = [];
        const data = onlyEntryOf(
          zip,
          (entry) => {
            asked.push(entry);
            return true;
          },
          ZIP_LIMITS,
        );
        expect(asked).toEqual([name]);
        expect(data?.toString()).toBe("x");
      }
    });

    it("are those of the entries only: a folder is no file", () => {
      const zip = writeZip([
        { name: "folder/", data: "" },
        { name: "folder/list.csv", data: "x" },
      ]);
      const asked: string[] = [];
      onlyEntryOf(
        zip,
        (name) => {
          asked.push(name);
          return csv(name);
        },
        ZIP_LIMITS,
      );
      expect(asked).toEqual(["folder/list.csv"]);
    });
  });

  describe("a zip of no accepted entry, or of several", () => {
    it("gives null when none is accepted", () => {
      const zip = writeZip([{ name: "a.txt", data: "x" }]);
      expect(onlyEntryOf(zip, csv, ZIP_LIMITS)).toBeNull();
      expect(onlyEntryOf(ONE, () => false, ZIP_LIMITS)).toBeNull();
    });

    it("gives null for a zip of no entry at all", () => {
      expect(onlyEntryOf(writeZip([]), () => true, ZIP_LIMITS)).toBeNull();
    });

    it("gives null when two are accepted, whichever they are", () => {
      const zip = writeZip([
        { name: "a.csv", data: "1" },
        { name: "b.csv", data: "2" },
      ]);
      expect(onlyEntryOf(zip, csv, ZIP_LIMITS)).toBeNull();
    });

    it("gives null when many are accepted, and reads no more than the second", () => {
      const entries: WriterEntry[] = Array.from({ length: 12 }, (_, at) => ({
        name: `${at}.csv`,
        data: `row ${at}`,
      }));
      const handed: string[] = [];
      const result = onlyEntryOf(
        writeZip(entries),
        (name) => {
          handed.push(name);
          return true;
        },
        ZIP_LIMITS,
      );
      expect(result).toBeNull();
      // The directory is walked entry by entry: the third is never reached.
      expect(handed).toEqual(["0.csv", "1.csv"]);
    });

    it("gives null for two entries of one name", () => {
      const zip = writeZip([
        { name: "a.csv", data: "1" },
        { name: "a.csv", data: "2" },
      ]);
      expect(onlyEntryOf(zip, csv, ZIP_LIMITS)).toBeNull();
    });
  });

  describe("a zip inside the zip", () => {
    const inner = writeZip([{ name: "list.csv", data: "inner" }]);
    const accept = (name: string) => name.endsWith(".zip") || name.endsWith(".csv");

    it("is read once more: the entry that is handed out is the one inside", () => {
      const outer = writeZip([{ name: "inner.zip", data: inner }]);
      expect(onlyEntryOf(outer, accept, ZIP_LIMITS)?.toString()).toBe("inner");
    });

    it("fails as too large when there is a zip inside that one: too deep is too large", () => {
      const innermost = writeZip([{ name: "inner.zip", data: inner }]);
      const outer = writeZip([{ name: "middle.zip", data: innermost }]);
      expect(() => onlyEntryOf(outer, accept, ZIP_LIMITS)).toThrow(BodyTooLargeError);
    });
  });

  describe("what is not a zip, or not a whole one", () => {
    it.each([
      ["no bytes", Buffer.alloc(0)],
      ["three bytes", Buffer.from([0x50, 0x4b, 0x03])],
      ["a text", Buffer.from("this is not a zip file at all")],
      ["an HTML page", Buffer.from("<html><body>Not found</body></html>")],
      ["zeros", Buffer.alloc(4096)],
      ["random bytes", Buffer.from(Array.from({ length: 2048 }, (_, at) => (at * 131) % 251))],
    ])("gives null for %s", (_name, bytes) => {
      expect(onlyEntryOf(bytes, () => true, ZIP_LIMITS)).toBeNull();
    });

    it("gives null for a zip that was cut short", () => {
      expect(onlyEntryOf(ONE.subarray(0, ONE.length - 8), csv, ZIP_LIMITS)).toBeNull();
      expect(onlyEntryOf(ONE.subarray(0, 30), csv, ZIP_LIMITS)).toBeNull();
    });

    it("gives null for an entry whose size or checksum is not what the directory says", () => {
      const lyingSize = writeZip([{ name: "a.csv", data: "abc", claimedSize: 99 }]);
      const lyingCrc = writeZip([{ name: "a.csv", data: "abc", claimedCrc: 12345 }]);
      expect(onlyEntryOf(lyingSize, csv, ZIP_LIMITS)).toBeNull();
      expect(onlyEntryOf(lyingCrc, csv, ZIP_LIMITS)).toBeNull();
    });

    it("gives null for an entry that is encrypted, or of a method that nobody reads", () => {
      const encrypted = writeZip([{ name: "a.csv", data: "abc", flags: 0x0801 }]);
      const strange = writeZip([{ name: "a.csv", data: "abc", method: 99 }]);
      expect(onlyEntryOf(encrypted, csv, ZIP_LIMITS)).toBeNull();
      expect(onlyEntryOf(strange, csv, ZIP_LIMITS)).toBeNull();
    });

    it("gives null for a corrupt deflate stream, as no error of the inflater", () => {
      const zip = Buffer.from(writeZip([{ name: "a.csv", data: "hello hello hello hello" }]));
      // The data of the first entry begins after its local header (30 bytes) and its name.
      const dataAt = 30 + "a.csv".length;
      for (let at = dataAt; at < dataAt + 8; at += 1) zip[at] = 0xff;
      expect(onlyEntryOf(zip, csv, ZIP_LIMITS)).toBeNull();
    });

    it("reads the entry that is accepted when another, that is not accepted, is corrupt: that one is not read", () => {
      const zip = writeZip([
        { name: "bad.txt", data: "abc", claimedCrc: 1 },
        { name: "good.csv", data: "fine" },
      ]);
      expect(onlyEntryOf(zip, csv, ZIP_LIMITS)?.toString()).toBe("fine");
    });
  });

  describe("a zip past its limits", () => {
    it("fails as too large when the entry is longer than the limit of an entry", () => {
      const zip = writeZip([{ name: "a.csv", data: Buffer.alloc(2048, 0x61) }]);
      const limits = { ...ZIP_LIMITS, maxEntryBytes: 1024 };
      expect(() => onlyEntryOf(zip, csv, limits)).toThrow(BodyTooLargeError);
    });

    it("fails as too large when the entries are more than the limit of entries", () => {
      const entries = Array.from({ length: 5 }, (_, at) => ({ name: `${at}.txt`, data: "x" }));
      expect(() => onlyEntryOf(writeZip(entries), csv, { ...ZIP_LIMITS, maxEntries: 4 })).toThrow(
        BodyTooLargeError,
      );
    });

    it("fails as too large when what it hands out is more than the total allows", () => {
      const zip = writeZip([{ name: "a.csv", data: Buffer.alloc(3000, 0x61) }]);
      expect(() => onlyEntryOf(zip, csv, { ...ZIP_LIMITS, maxTotalBytes: 2000 })).toThrow(
        BodyTooLargeError,
      );
    });

    it("fails as too large for a zip that inflates to a thousand times its size, whether or not its directory says so, and holds nothing of it", () => {
      const data = Buffer.alloc(40 * 1024 * 1024, 0);
      const honest = writeZip([{ name: "a.csv", data }]);
      // The headers say that the entry is small: only the inflater can tell that it is not.
      const lying = writeZip([{ name: "a.csv", data, claimedSize: 1000 }]);
      expect(honest.length).toBeLessThan(100 * 1024);
      const before = process.memoryUsage().heapUsed + process.memoryUsage().external;
      expect(() => onlyEntryOf(honest, csv, ZIP_LIMITS)).toThrow(BodyTooLargeError);
      expect(() => onlyEntryOf(lying, csv, ZIP_LIMITS)).toThrow(BodyTooLargeError);
      const after = process.memoryUsage().heapUsed + process.memoryUsage().external;
      expect(after - before).toBeLessThan(200 * 1024 * 1024);
    });

    it("gives the message of a file that is too large, and none of the archive", () => {
      const zip = writeZip([{ name: "secret-name.csv", data: Buffer.alloc(2048, 0x61) }]);
      let failure: unknown;
      try {
        onlyEntryOf(zip, csv, { ...ZIP_LIMITS, maxEntryBytes: 1024 });
      } catch (error) {
        failure = error;
      }
      expect((failure as Error).message).toBe("The file is larger than its limit.");
      expect((failure as Error).message).not.toContain("secret-name");
    });
  });

  it("lets an error that is not the zip reader's go through: a test that throws is a bug of the connector", () => {
    const bug = new TypeError("a bug of the test");
    expect(() =>
      onlyEntryOf(
        ONE,
        () => {
          throw bug;
        },
        ZIP_LIMITS,
      ),
    ).toThrow(bug);
  });
});

describe("readSheetTable", () => {
  const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const RELATIONSHIP_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const PACKAGE_RELATIONSHIPS = "http://schemas.openxmlformats.org/package/2006/relationships";

  const LIMITS: XlsxLimits = {
    zip: ZIP_LIMITS,
    maxRows: 100,
    maxColumns: 20,
  };

  const xmlEscape = (text: string): string =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  /** `1` is A, `27` is AA. */
  function columnName(column: number): string {
    let name = "";
    for (let rest = column; rest > 0; rest = Math.floor((rest - 1) / 26)) {
      name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
    }
    return name;
  }

  type Cell = string | number | boolean | null;

  /** A sheet as the writer of a real export writes it: strings inline, every cell with its place. */
  function sheetXml(rows: ReadonlyArray<readonly Cell[]>): string {
    const body = rows
      .map((cells, rowIndex) => {
        const row = rowIndex + 1;
        const xml = cells
          .map((value, columnIndex) => {
            const reference = `${columnName(columnIndex + 1)}${row}`;
            if (value === null) return "";
            if (typeof value === "number") return `<c r="${reference}" t="n"><v>${value}</v></c>`;
            if (typeof value === "boolean") {
              return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`;
            }
            return `<c r="${reference}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
          })
          .join("");
        return `<row r="${row}">${xml}</row>`;
      })
      .join("");
    return `<worksheet xmlns="${MAIN}"><sheetData>${body}</sheetData></worksheet>`;
  }

  interface Options {
    name?: string;
    sheet?: string;
    properties?: string;
    sharedStrings?: string;
    relationshipTarget?: string;
    extra?: WriterEntry[];
  }

  function workbookOf(rows: ReadonlyArray<readonly Cell[]>, options: Options = {}): Buffer {
    const name = options.name ?? "Data";
    const entries: WriterEntry[] = [
      { name: "xl/worksheets/sheet1.xml", data: options.sheet ?? sheetXml(rows) },
    ];
    if (options.sharedStrings !== undefined) {
      entries.push({ name: "xl/sharedStrings.xml", data: options.sharedStrings });
    }
    entries.push(...(options.extra ?? []));
    entries.push({
      name: "xl/workbook.xml",
      data: `<workbook xmlns:r="${RELATIONSHIP_TYPE}" xmlns="${MAIN}">${options.properties ?? "<workbookPr />"}<sheets><sheet name="${xmlEscape(name)}" sheetId="1" state="visible" r:id="rId1" /></sheets></workbook>`,
    });
    entries.push({
      name: "xl/_rels/workbook.xml.rels",
      data: `<Relationships xmlns="${PACKAGE_RELATIONSHIPS}"><Relationship Type="${RELATIONSHIP_TYPE}/worksheet" Target="${options.relationshipTarget ?? "/xl/worksheets/sheet1.xml"}" Id="rId1" /></Relationships>`,
    });
    return writeZip(entries);
  }

  describe("a sheet that is read", () => {
    it("gives its cells as text, row by row, with the header as the first row", () => {
      const book = workbookOf([
        ["id", "name", "since"],
        ["A-1", "Acme Robotics", "2026-01-05"],
        ["A-2", "Beta Analytics", "2026-02-06"],
      ]);
      expect(readSheetTable(book, "Data", LIMITS)).toEqual({
        rows: [
          ["id", "name", "since"],
          ["A-1", "Acme Robotics", "2026-01-05"],
          ["A-2", "Beta Analytics", "2026-02-06"],
        ],
        complete: true,
      });
    });

    it("gives a number as the text of the number, as the AI Incident Database reader does", () => {
      const book = workbookOf([["n"], [12], [1.5], [-3], [0], [1e21], [0.1]]);
      expect(readSheetTable(book, "Data", LIMITS)?.rows.slice(1)).toEqual([
        ["12"],
        ["1.5"],
        ["-3"],
        ["0"],
        ["1e+21"],
        ["0.1"],
      ]);
    });

    it("gives a boolean as 1 or 0, as the sheet reader reads it", () => {
      const book = workbookOf([[true, false]]);
      expect(readSheetTable(book, "Data", LIMITS)?.rows).toEqual([["1", "0"]]);
    });

    it("trims every cell, and keeps what is inside it", () => {
      const book = workbookOf([["  id ", "\tAcme   Robotics\n", " "]]);
      expect(readSheetTable(book, "Data", LIMITS)?.rows).toEqual([["id", "Acme   Robotics", ""]]);
    });

    it("gives an empty text for a cell that is empty and one that is not there", () => {
      const book = workbookOf([["a", null, "c"], [null, "b"], []]);
      // The last row has no cell, so that the sheet does not reach it.
      expect(readSheetTable(book, "Data", LIMITS)?.rows).toEqual([
        ["a", "", "c"],
        ["", "b"],
      ]);
    });

    it("gives the rows at their places: a row that has no cell is an empty row, and the rows after it keep theirs", () => {
      const book = workbookOf([["first"], [], [], ["fourth"]]);
      expect(readSheetTable(book, "Data", LIMITS)?.rows).toEqual([["first"], [], [], ["fourth"]]);
    });

    it("reads cells that point into the shared strings of the workbook", () => {
      const sheet = `<worksheet xmlns="${MAIN}"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row></sheetData></worksheet>`;
      const shared = `<sst xmlns="${MAIN}" count="3" uniqueCount="2"><si><t>id</t></si><si><r><t>na</t></r><r><t>me</t></r></si></sst>`;
      const book = workbookOf([], { sheet, sharedStrings: shared });
      expect(readSheetTable(book, "Data", LIMITS)?.rows).toEqual([["id", "name"], ["name"]]);
    });

    it("reads a workbook that a spreadsheet library wrote, with relative targets and shared strings", async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Entries");
      sheet.addRow(["id", "name", "count"]);
      sheet.addRow(["E-1", "Acme <Robotics> & Co", 12]);
      sheet.addRow(["E-2", "Caf\u{e9}", 0.5]);
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      expect(readSheetTable(buffer, "Entries", LIMITS)).toEqual({
        rows: [
          ["id", "name", "count"],
          ["E-1", "Acme <Robotics> & Co", "12"],
          ["E-2", "Caf\u{e9}", "0.5"],
        ],
        complete: true,
      });
    });

    it("keeps the names of a hostile sheet as text: nothing of a cell is read as anything else", () => {
      const book = workbookOf([["__proto__", "constructor", "<script>x</script>"]]);
      const table = readSheetTable(book, "Data", LIMITS);
      expect(table?.rows).toEqual([["__proto__", "constructor", "<script>x</script>"]]);
      expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    });

    it("gives an empty table for a sheet with no cell", () => {
      expect(readSheetTable(workbookOf([]), "Data", LIMITS)).toEqual({ rows: [], complete: true });
    });
  });

  describe("a workbook or a sheet that is not there", () => {
    it("gives null for a sheet of another name, whatever its case", () => {
      const book = workbookOf([["a"]]);
      expect(readSheetTable(book, "Other", LIMITS)).toBeNull();
      expect(readSheetTable(book, "data", LIMITS)).toBeNull();
      expect(readSheetTable(book, "", LIMITS)).toBeNull();
    });

    it("gives null for something that is not a zip", () => {
      expect(readSheetTable(Buffer.from("id,name\n1,2\n"), "Data", LIMITS)).toBeNull();
      expect(readSheetTable(Buffer.alloc(0), "Data", LIMITS)).toBeNull();
    });

    it("gives null for a zip that is not a workbook", () => {
      const zip = writeZip([{ name: "list.csv", data: "id\n1\n" }]);
      expect(readSheetTable(zip, "Data", LIMITS)).toBeNull();
    });

    it("gives null for a workbook that was cut short", () => {
      const book = workbookOf([["a"]]);
      expect(readSheetTable(book.subarray(0, book.length - 10), "Data", LIMITS)).toBeNull();
    });

    it("gives null for a relationship that leads anywhere but to a sheet's part", () => {
      for (const target of ["../../etc/passwd", "/xl/worksheets/../workbook.xml", "evil.xml"]) {
        const book = workbookOf([["a"]], { relationshipTarget: target });
        expect(readSheetTable(book, "Data", LIMITS)).toBeNull();
      }
    });

    it("gives null for a workbook that counts its dates from 1904: its numbers would mean other days", () => {
      const book = workbookOf([["a"]], { properties: '<workbookPr date1904="1" />' });
      expect(readSheetTable(book, "Data", LIMITS)).toBeNull();
      const on = workbookOf([["a"]], { properties: '<workbookPr date1904="true" />' });
      expect(readSheetTable(on, "Data", LIMITS)).toBeNull();
      const off = workbookOf([["a"]], { properties: '<workbookPr date1904="0" />' });
      expect(readSheetTable(off, "Data", LIMITS)).toEqual({ rows: [["a"]], complete: true });
    });

    it("gives null for a sheet whose cell has no place: its value would belong to another row", () => {
      const sheet = `<worksheet xmlns="${MAIN}"><sheetData><row r="1"><c t="inlineStr"><is><t>lost</t></is></c></row></sheetData></worksheet>`;
      expect(readSheetTable(workbookOf([], { sheet }), "Data", LIMITS)).toBeNull();
    });

    it("gives null for a sheet that is not a worksheet, and for one that is not XML", () => {
      expect(readSheetTable(workbookOf([], { sheet: "<notasheet />" }), "Data", LIMITS)).toBeNull();
      expect(
        readSheetTable(workbookOf([], { sheet: "not xml at all" }), "Data", LIMITS),
      ).toBeNull();
      expect(
        readSheetTable(
          workbookOf([], { sheet: `<worksheet xmlns="${MAIN}"><sheetData>` }),
          "Data",
          LIMITS,
        ),
      ).toBeNull();
    });

    it("gives null for an archive that is encrypted or of another method", () => {
      const strange = writeZip([{ name: "xl/workbook.xml", data: "<workbook />", method: 99 }]);
      expect(readSheetTable(strange, "Data", LIMITS)).toBeNull();
    });
  });

  describe("a sheet past a limit", () => {
    const rowsOf = (count: number, columns = 1): Cell[][] =>
      Array.from({ length: count }, (_, row) =>
        Array.from({ length: columns }, (_, column) => `r${row}c${column}`),
      );

    it("is read whole when it is just as large as the limits allow", () => {
      const table = readSheetTable(workbookOf(rowsOf(100, 20)), "Data", LIMITS);
      expect(table?.complete).toBe(true);
      expect(table?.rows).toHaveLength(100);
      expect(table?.rows[99]).toHaveLength(20);
    });

    it("is incomplete, and gives no row, when it has a row more than the limit", () => {
      expect(readSheetTable(workbookOf(rowsOf(101)), "Data", LIMITS)).toEqual({
        rows: [],
        complete: false,
      });
    });

    it("is incomplete, and gives no row, when it has a column more than the limit", () => {
      expect(readSheetTable(workbookOf(rowsOf(3, 21)), "Data", LIMITS)).toEqual({
        rows: [],
        complete: false,
      });
    });

    it("is incomplete for a cell at the far corner that the limits do not allow, without making the rows between", () => {
      const sheet = `<worksheet xmlns="${MAIN}"><sheetData><row r="1000000"><c r="XFD1000000" t="n"><v>1</v></c></row></sheetData></worksheet>`;
      const start = Date.now();
      expect(readSheetTable(workbookOf([], { sheet }), "Data", LIMITS)).toEqual({
        rows: [],
        complete: false,
      });
      expect(Date.now() - start).toBeLessThan(5000);
    });

    it("is incomplete when the sheet inflates to more than the limit of an entry", () => {
      const big = sheetXml(rowsOf(90, 12));
      const limits: XlsxLimits = { ...LIMITS, zip: { ...ZIP_LIMITS, maxEntryBytes: 2048 } };
      expect(big.length).toBeGreaterThan(2048);
      expect(readSheetTable(workbookOf([], { sheet: big }), "Data", limits)).toEqual({
        rows: [],
        complete: false,
      });
    });

    it("is incomplete when the workbook holds more entries than the limit", () => {
      const extra: WriterEntry[] = Array.from({ length: 20 }, (_, at) => ({
        name: `xl/media/image${at}.png`,
        data: "x",
      }));
      const book = workbookOf([["a"]], { extra });
      expect(readSheetTable(book, "Data", LIMITS)).toEqual({ rows: [], complete: false });
    });

    it("is incomplete for a workbook that is a bomb: the sheet inflates to a thousand times its size", () => {
      const filler = `<worksheet xmlns="${MAIN}"><sheetData>${" ".repeat(40 * 1024 * 1024)}</sheetData></worksheet>`;
      const book = workbookOf([], { sheet: filler });
      expect(book.length).toBeLessThan(200 * 1024);
      expect(readSheetTable(book, "Data", LIMITS)).toEqual({ rows: [], complete: false });
    });
  });

  it("gives a table of text that no later step can mistake for numbers: every cell is a string", () => {
    const table = readSheetTable(workbookOf([[1, "2", true, null, "x"]]), "Data", LIMITS);
    expect(table?.rows[0].every((cell) => typeof cell === "string")).toBe(true);
  });
});
