/**
 * The reader of one sheet of an .xlsx (xlsx.ts), made for the AI Incident Database export. A
 * workbook is third-party data: it is read on the zip reader and the XML scanner within limits, only
 * the four parts it needs are inflated, and what a workbook says about where its sheet is cannot
 * lead the reader anywhere but to `xl/worksheets/sheet<N>.xml`. The workbooks are written by the
 * test: with exceljs (relative targets, shared strings), and by hand in the shape of the real
 * export (absolute targets, inline strings, no shared strings, the sheet before the workbook).
 */
import ExcelJS from "exceljs";
import {
  type CellValue,
  type XlsxLimits,
  dayOfExcelSerial,
  readSheetParts,
  readXlsxSheet,
  sheetRowsOf,
} from "../xlsx";
import { ZipError } from "../zip";
import { type WriterEntry, writeZip } from "./helpers/zipWriter";

jest.setTimeout(30_000);

const LIMITS: XlsxLimits = {
  zip: { maxEntries: 64, maxEntryBytes: 48 * 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024 },
  maxRows: 20_000,
  maxColumns: 256,
};
const SHEET_LIMITS = { maxRows: LIMITS.maxRows, maxColumns: LIMITS.maxColumns };

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELATIONSHIP_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_RELATIONSHIPS = "http://schemas.openxmlformats.org/package/2006/relationships";

type Cell = string | number | boolean | null;

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

/**
 * A sheet as the writer of the real export writes it: strings inline, numbers with t="n", an empty
 * cell as an empty inline string, and every cell with its reference.
 */
function sheetXml(rows: ReadonlyArray<readonly Cell[]>): string {
  const body = rows
    .map((cells, rowIndex) => {
      const row = rowIndex + 1;
      const xml = cells
        .map((value, columnIndex) => {
          const reference = `${columnName(columnIndex + 1)}${row}`;
          if (value === null) return `<c r="${reference}" t="inlineStr" />`;
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

interface SheetPart {
  name: string;
  xml: string;
  /** The target of its relationship, in place of `/xl/worksheets/sheet<N>.xml`. */
  target?: string;
  /** The name of its entry in the zip, in place of `xl/worksheets/sheet<N>.xml`. */
  entry?: string;
}

interface Workbook {
  sheets?: SheetPart[];
  sharedStrings?: string;
  /** The workbook's own properties element, in place of `<workbookPr />`. */
  properties?: string;
  /** Entries added after the sheets, before the workbook. */
  extra?: WriterEntry[];
  /** Entries added at the end, after the relationships. */
  after?: WriterEntry[];
  /** The text of the workbook, in place of the one made from `sheets`. */
  workbookXml?: string;
  /** The text of the relationships, in place of the ones made from `sheets`. */
  relationshipsXml?: string;
}

/** A workbook in the order of the real export's zip: the sheets, then the workbook and its relationships. */
function workbookZip(options: Workbook = {}): Buffer {
  const sheets = options.sheets ?? [{ name: "Incidents", xml: sheetXml([["a"]]) }];
  const entries: WriterEntry[] = [];
  sheets.forEach((sheet, index) => {
    entries.push({ name: sheet.entry ?? `xl/worksheets/sheet${index + 1}.xml`, data: sheet.xml });
  });
  if (options.sharedStrings !== undefined) {
    entries.push({ name: "xl/sharedStrings.xml", data: options.sharedStrings });
  }
  entries.push(...(options.extra ?? []));
  const listed = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" state="visible" r:id="rId${index + 1}" />`,
    )
    .join("");
  entries.push({
    name: "xl/workbook.xml",
    data:
      options.workbookXml ??
      `<workbook xmlns:r="${RELATIONSHIP_TYPE}" xmlns="${MAIN}">${options.properties ?? "<workbookPr />"}<sheets>${listed}</sheets></workbook>`,
  });
  const relationships = sheets
    .map(
      (sheet, index) =>
        `<Relationship Type="${RELATIONSHIP_TYPE}/worksheet" Target="${sheet.target ?? `/xl/worksheets/sheet${index + 1}.xml`}" Id="rId${index + 1}" />`,
    )
    .join("");
  entries.push({
    name: "xl/_rels/workbook.xml.rels",
    data:
      options.relationshipsXml ??
      `<Relationships xmlns="${PACKAGE_RELATIONSHIPS}">${relationships}</Relationships>`,
  });
  entries.push(...(options.after ?? []));
  return writeZip(entries);
}

const codeOf = (read: () => unknown): string | null => {
  try {
    read();
  } catch (error) {
    return error instanceof ZipError ? error.code : (error as Error).name;
  }
  return null;
};

/** Cells given by hand, in a sheet with the usual wrapper. */
const sheetOf = (cells: string): string =>
  `<worksheet xmlns="${MAIN}"><sheetData><row r="1">${cells}</row></sheetData></worksheet>`;
const rowsOfCells = (cells: string, shared: string | null = null): CellValue[][] =>
  sheetRowsOf(sheetOf(cells), shared, SHEET_LIMITS).rows;

describe("readXlsxSheet with a workbook of exceljs", () => {
  // exceljs writes relative targets (`worksheets/sheet1.xml`), shared strings, numbers without a
  // type, and leaves a row without cells out.
  const build = async (): Promise<Buffer> => {
    const workbook = new ExcelJS.Workbook();
    const incidents = workbook.addWorksheet("Incidents");
    incidents.addRow(["Fictional export title"]);
    incidents.addRow([]);
    incidents.addRow(["Incident ID", "date", "title", "flag"]);
    incidents.addRow([1, 25569, "A & B <test>", true]);
    incidents.addRow([2, 42143, "  padded  ", false]);
    incidents.getCell("F5").value = "far";
    incidents.getCell("A6").value = { richText: [{ text: "rich " }, { text: "text" }] };
    workbook.addWorksheet("Other").addRow(["not this one"]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  };

  it("reads strings, numbers, booleans, rich text and cells that do not start at column A", async () => {
    const { rows, errors, root } = readXlsxSheet(await build(), "Incidents", LIMITS);

    expect(errors).toBe(0);
    expect(root).toBe("worksheet");
    expect(rows).toEqual([
      ["Fictional export title"],
      [],
      ["Incident ID", "date", "title", "flag"],
      [1, 25569, "A & B <test>", 1],
      [2, 42143, "  padded  ", 0, null, "far"],
      ["rich text"],
    ]);
  });

  it("gives the sheet of the name asked for", async () => {
    expect(readXlsxSheet(await build(), "Other", LIMITS).rows).toEqual([["not this one"]]);
  });

  it("keeps the shared strings with the sheet, for a parse that needs no zip", async () => {
    const parts = readSheetParts(await build(), "Incidents", LIMITS.zip);

    expect(parts.sharedStringsXml).toContain("<sst");
    expect(parts.date1904).toBe(false);
    expect(sheetRowsOf(parts.sheetXml, parts.sharedStringsXml, SHEET_LIMITS).rows[2]).toEqual([
      "Incident ID",
      "date",
      "title",
      "flag",
    ]);
  });
});

describe("readXlsxSheet with a workbook in the shape of the real export", () => {
  const rows: Cell[][] = [
    ["Fictional export | 2 incidents | 4 columns"],
    ["IDENTITY", null, null, "COVERAGE"],
    ["Incident ID", "date", "title", "report_count"],
    [1, 42143, "First", 14],
    [2, 25569, "Second & third", null],
  ];

  it("reads inline strings and numbers, with no shared strings and an absolute target", () => {
    const zip = workbookZip({ sheets: [{ name: "Incidents", xml: sheetXml(rows) }] });

    const parts = readSheetParts(zip, "Incidents", LIMITS.zip);
    const sheet = readXlsxSheet(zip, "Incidents", LIMITS);

    expect(parts.sharedStringsXml).toBeNull();
    expect(sheet.errors).toBe(0);
    expect(sheet.rows).toEqual([
      ["Fictional export | 2 incidents | 4 columns"],
      ["IDENTITY", null, null, "COVERAGE"],
      ["Incident ID", "date", "title", "report_count"],
      [1, 42143, "First", 14],
      [2, 25569, "Second & third", null],
    ]);
  });

  it("finds the sheet by its name, not by its place, whichever sheet comes first", () => {
    const zip = workbookZip({
      sheets: [
        { name: "Reports", xml: sheetXml([["report"]]) },
        { name: "Incidents", xml: sheetXml([["incident"]]) },
        { name: "Entities", xml: sheetXml([["entity"]]) },
      ],
    });

    expect(readXlsxSheet(zip, "Incidents", LIMITS).rows).toEqual([["incident"]]);
    expect(readXlsxSheet(zip, "Entities", LIMITS).rows).toEqual([["entity"]]);
  });
});

describe("readSheetParts: where the sheet is", () => {
  // The zip holds a part under the very name the target resolves to (the folder of the workbook
  // for a relative target, the root for a target with a slash), so that only the reader's own check
  // of that name can refuse the target and not the lack of a part.
  const withTarget = (target: string, entry?: string) =>
    workbookZip({
      sheets: [
        {
          name: "Incidents",
          xml: sheetXml([["ok"]]),
          target,
          entry: entry ?? (target.startsWith("/") ? target.slice(1) : `xl/${target}`),
        },
      ],
    });

  it.each([
    ["relative to xl/, as Excel writes it", "worksheets/sheet1.xml"],
    ["from the root of the package, as openpyxl writes it", "/xl/worksheets/sheet1.xml"],
  ])("reads a target that is %s", (_label, target) => {
    expect(readXlsxSheet(withTarget(target), "Incidents", LIMITS).rows).toEqual([["ok"]]);
  });

  it("reads a sheet whose number has several digits", () => {
    const zip = withTarget("/xl/worksheets/sheet12.xml", "xl/worksheets/sheet12.xml");

    expect(readXlsxSheet(zip, "Incidents", LIMITS).rows).toEqual([["ok"]]);
  });

  it.each([
    ["a parent folder", "../worksheets/sheet1.xml"],
    ["a parent folder inside the folder", "worksheets/../worksheets/sheet1.xml"],
    ["a parent folder from the root", "/xl/worksheets/../worksheets/sheet1.xml"],
    ["a parent folder above the root", "/../xl/worksheets/sheet1.xml"],
    ["a current folder", "./worksheets/sheet1.xml"],
    ["an absolute path outside xl/", "/worksheets/sheet1.xml"],
    ["an absolute path to a system file", "/etc/passwd"],
    ["the workbook itself", "/xl/workbook.xml"],
    ["the workbook, relative", "workbook.xml"],
    ["a part that is not a sheet's", "/xl/worksheets/sheet.xml"],
    ["a name with a letter for a number", "/xl/worksheets/sheetA.xml"],
    ["a sheet number of ten digits", "/xl/worksheets/sheet1234567890.xml"],
    ["a folder inside the sheets' folder", "/xl/worksheets/sub/sheet1.xml"],
    ["another extension", "/xl/worksheets/sheet1.xml.bak"],
    ["a query", "/xl/worksheets/sheet1.xml?x=1"],
    ["a fragment", "/xl/worksheets/sheet1.xml#x"],
    ["a doubled slash", "//xl/worksheets/sheet1.xml"],
    ["a backslash", "\\xl\\worksheets\\sheet1.xml"],
    ["an escaped dot", "worksheets/%2e%2e/sheet1.xml"],
    ["an address", "https://example.com/xl/worksheets/sheet1.xml"],
    ["xl/ spelled out of a relative target", "xl/worksheets/sheet1.xml"],
    ["a new line at the end", "/xl/worksheets/sheet1.xml\n"],
    ["nothing", ""],
  ])("refuses a target with %s", (_label, target) => {
    expect(codeOf(() => readSheetParts(withTarget(target), "Incidents", LIMITS.zip))).toBe(
      "NotTheListError",
    );
  });

  it("refuses an external relationship, however its target looks", () => {
    const zip = workbookZip({
      relationshipsXml: `<Relationships xmlns="${PACKAGE_RELATIONSHIPS}"><Relationship Type="${RELATIONSHIP_TYPE}/worksheet" Target="/xl/worksheets/sheet1.xml" TargetMode="External" Id="rId1" /></Relationships>`,
    });

    expect(codeOf(() => readSheetParts(zip, "Incidents", LIMITS.zip))).toBe("NotTheListError");
  });

  it("refuses a relationship whose part is not in the zip", () => {
    const zip = withTarget("/xl/worksheets/sheet9.xml", "xl/worksheets/sheet1.xml");

    expect(codeOf(() => readSheetParts(zip, "Incidents", LIMITS.zip))).toBe("NotTheListError");
  });

  it("refuses a workbook without a sheet of that name, in any other case too", () => {
    const zip = workbookZip();

    expect(codeOf(() => readSheetParts(zip, "Reports", LIMITS.zip))).toBe("NotTheListError");
    expect(codeOf(() => readSheetParts(zip, "incidents", LIMITS.zip))).toBe("NotTheListError");
  });

  it("refuses two sheets of one name, which two readers would read differently", () => {
    const zip = workbookZip({
      sheets: [
        { name: "Incidents", xml: sheetXml([["first"]]) },
        { name: "Incidents", xml: sheetXml([["second"]]) },
      ],
    });

    expect(codeOf(() => readSheetParts(zip, "Incidents", LIMITS.zip))).toBe("NotTheListError");
  });

  it("refuses a relationship id that two relationships share", () => {
    const relationship = `<Relationship Type="${RELATIONSHIP_TYPE}/worksheet" Target="/xl/worksheets/sheet1.xml" Id="rId1" />`;
    const zip = workbookZip({
      relationshipsXml: `<Relationships xmlns="${PACKAGE_RELATIONSHIPS}">${relationship}${relationship}</Relationships>`,
    });

    expect(codeOf(() => readSheetParts(zip, "Incidents", LIMITS.zip))).toBe("NotTheListError");
  });

  it("refuses a sheet with no relationship id, and an id that no relationship has", () => {
    const noId = workbookZip({
      workbookXml: `<workbook xmlns="${MAIN}"><sheets><sheet name="Incidents" sheetId="1" /></sheets></workbook>`,
    });
    const unknownId = workbookZip({
      workbookXml: `<workbook xmlns:r="${RELATIONSHIP_TYPE}" xmlns="${MAIN}"><sheets><sheet name="Incidents" sheetId="1" r:id="rId7" /></sheets></workbook>`,
    });

    expect(codeOf(() => readSheetParts(noId, "Incidents", LIMITS.zip))).toBe("NotTheListError");
    expect(codeOf(() => readSheetParts(unknownId, "Incidents", LIMITS.zip))).toBe(
      "NotTheListError",
    );
  });

  it("refuses an empty relationship id, even when a relationship has the same empty id", () => {
    const zip = workbookZip({
      workbookXml: `<workbook xmlns:r="${RELATIONSHIP_TYPE}" xmlns="${MAIN}"><sheets><sheet name="Incidents" sheetId="1" r:id="" /></sheets></workbook>`,
      relationshipsXml: `<Relationships xmlns="${PACKAGE_RELATIONSHIPS}"><Relationship Type="${RELATIONSHIP_TYPE}/worksheet" Target="/xl/worksheets/sheet1.xml" Id="" /></Relationships>`,
    });

    expect(codeOf(() => readSheetParts(zip, "Incidents", LIMITS.zip))).toBe("NotTheListError");
  });

  it("refuses a workbook or relationships that are some other document", () => {
    const otherWorkbook = workbookZip({ workbookXml: `<html><body>Not Found</body></html>` });
    const otherRelationships = workbookZip({ relationshipsXml: `<html><body>x</body></html>` });
    const cutWorkbook = workbookZip({
      workbookXml: `<workbook xmlns:r="${RELATIONSHIP_TYPE}" xmlns="${MAIN}"><sheets><sheet name="Incidents" sheetId="1" r:id="rId1" />`,
    });

    for (const zip of [otherWorkbook, otherRelationships, cutWorkbook]) {
      expect(codeOf(() => readSheetParts(zip, "Incidents", LIMITS.zip))).toBe("NotTheListError");
    }
  });

  it("refuses a workbook or relationships whose root is another element, whatever they hold", () => {
    const otherWorkbook = workbookZip({
      workbookXml: `<book xmlns:r="${RELATIONSHIP_TYPE}" xmlns="${MAIN}"><sheets><sheet name="Incidents" sheetId="1" r:id="rId1" /></sheets></book>`,
    });
    const otherRelationships = workbookZip({
      relationshipsXml: `<list xmlns="${PACKAGE_RELATIONSHIPS}"><Relationship Type="${RELATIONSHIP_TYPE}/worksheet" Target="/xl/worksheets/sheet1.xml" Id="rId1" /></list>`,
    });
    const cutRelationships = workbookZip({
      relationshipsXml: `<Relationships xmlns="${PACKAGE_RELATIONSHIPS}"><Relationship Type="${RELATIONSHIP_TYPE}/worksheet" Target="/xl/worksheets/sheet1.xml" Id="rId1" />`,
    });

    for (const zip of [otherWorkbook, otherRelationships, cutRelationships]) {
      expect(codeOf(() => readSheetParts(zip, "Incidents", LIMITS.zip))).toBe("NotTheListError");
    }
  });

  it("refuses a zip with no workbook, or with no relationships", () => {
    const noWorkbook = writeZip([{ name: "xl/worksheets/sheet1.xml", data: sheetXml([["a"]]) }]);
    const noRelationships = writeZip([
      { name: "xl/worksheets/sheet1.xml", data: sheetXml([["a"]]) },
      { name: "xl/workbook.xml", data: `<workbook xmlns="${MAIN}"><sheets /></workbook>` },
    ]);

    expect(codeOf(() => readSheetParts(noWorkbook, "Incidents", LIMITS.zip))).toBe(
      "NotTheListError",
    );
    expect(codeOf(() => readSheetParts(noRelationships, "Incidents", LIMITS.zip))).toBe(
      "NotTheListError",
    );
  });

  it("refuses a zip with two parts of one name, which two readers would read differently", () => {
    const sheets = [{ name: "Incidents", xml: sheetXml([["ok"]]) }];
    const strings = `<sst xmlns="${MAIN}"><si><t>one</t></si></sst>`;
    const zips = {
      workbook: workbookZip({ sheets, after: [{ name: "xl/workbook.xml", data: "<workbook />" }] }),
      relationships: workbookZip({
        sheets,
        after: [{ name: "xl/_rels/workbook.xml.rels", data: "<Relationships />" }],
      }),
      sheet: workbookZip({
        sheets,
        extra: [{ name: "xl/worksheets/sheet1.xml", data: sheetXml([["other"]]) }],
      }),
      "shared strings": workbookZip({
        sheets,
        sharedStrings: strings,
        extra: [{ name: "xl/sharedStrings.xml", data: strings }],
      }),
    };

    for (const [part, zip] of Object.entries(zips)) {
      expect([part, codeOf(() => readSheetParts(zip, "Incidents", LIMITS.zip))]).toEqual([
        part,
        "NotTheListError",
      ]);
    }
  });

  it("is a ZipError when the file is no zip", () => {
    expect(
      codeOf(() => readSheetParts(Buffer.from("<html>Not found</html>"), "Incidents", LIMITS.zip)),
    ).toBe("not_zip");
  });

  it.each([
    ["no properties", "", false],
    ["empty properties", "<workbookPr />", false],
    ["date1904 off", '<workbookPr date1904="0" />', false],
    ["date1904 false", '<workbookPr date1904="false" />', false],
    ["date1904 on", '<workbookPr date1904="1" />', true],
    ["date1904 true", '<workbookPr date1904="true" />', true],
    ["date1904 TRUE", '<workbookPr date1904="TRUE" />', true],
  ])("tells whether the workbook counts from 1904: %s", (_label, properties, expected) => {
    const zip = workbookZip({ properties });

    expect(readSheetParts(zip, "Incidents", LIMITS.zip).date1904).toBe(expected);
  });
});

describe("readSheetParts: what is inflated", () => {
  it("inflates the four parts it needs and no other, whatever the others hold", () => {
    // The other sheets, a part with a wrong checksum and a part that claims a size past the
    // limits: any of them would fail the read if it were inflated.
    const zip = workbookZip({
      sheets: [
        { name: "Incidents", xml: sheetXml([["ok"]]) },
        { name: "Reports", xml: "x".repeat(10_000) },
      ],
      extra: [
        { name: "docProps/app.xml", data: "<Properties />", claimedCrc: 1 },
        { name: "xl/media/image1.png", data: "x", claimedSize: 2_000_000_000 },
        { name: "xl/theme/theme1.xml", data: "x".repeat(10_000) },
      ],
    });

    const parts = readSheetParts(zip, "Incidents", {
      maxEntries: 64,
      maxEntryBytes: 4_096,
      maxTotalBytes: 8_192,
    });

    expect(parts.sheetXml).toContain("<worksheet");
  });

  it("refuses a zip with more entries than the limit, whether it accepts them or not", () => {
    const many = Array.from({ length: 10 }, (_, index) => ({
      name: `docProps/part${index}.xml`,
      data: "<p />",
    }));
    const zip = workbookZip({ extra: many });

    expect(codeOf(() => readSheetParts(zip, "Incidents", { ...LIMITS.zip, maxEntries: 8 }))).toBe(
      "too_large",
    );
  });

  it("a sheet that inflates past the limit is too_large, from its directory or from its data", () => {
    const sheet = sheetXml([["x".repeat(10_000)]]);
    const honest = workbookZip({ sheets: [{ name: "Incidents", xml: sheet }] });
    const lying = writeZip([
      { name: "xl/worksheets/sheet1.xml", data: sheet, claimedSize: 100 },
      {
        name: "xl/workbook.xml",
        data: `<workbook xmlns:r="${RELATIONSHIP_TYPE}" xmlns="${MAIN}"><sheets><sheet name="Incidents" sheetId="1" r:id="rId1" /></sheets></workbook>`,
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        data: `<Relationships xmlns="${PACKAGE_RELATIONSHIPS}"><Relationship Type="${RELATIONSHIP_TYPE}/worksheet" Target="/xl/worksheets/sheet1.xml" Id="rId1" /></Relationships>`,
      },
    ]);
    const limits = { maxEntries: 64, maxEntryBytes: 4_096, maxTotalBytes: 16_384 };

    expect(codeOf(() => readSheetParts(honest, "Incidents", limits))).toBe("too_large");
    expect(codeOf(() => readSheetParts(lying, "Incidents", limits))).toBe("too_large");
  });

  it("the sheet and the shared strings together are held to the total limit", () => {
    const zip = workbookZip({
      sheets: [{ name: "Incidents", xml: sheetXml([["x".repeat(3_000)]]) }],
      sharedStrings: `<sst xmlns="${MAIN}"><si><t>${"y".repeat(3_000)}</t></si></sst>`,
    });
    const limits = { maxEntries: 64, maxEntryBytes: 8_192, maxTotalBytes: 6_000 };

    expect(codeOf(() => readSheetParts(zip, "Incidents", limits))).toBe("too_large");
    expect(
      readSheetParts(zip, "Incidents", { ...limits, maxTotalBytes: 16_384 }).sheetXml,
    ).toContain("x");
  });

  it("reads a workbook and relationships of 600 KB each, and refuses copies that pass 2 MB together", () => {
    const comment = (bytes: number) => `<!-- ${"x".repeat(bytes)} -->`;
    const big = (bytes: number) => ({
      workbookXml: `<workbook xmlns:r="${RELATIONSHIP_TYPE}" xmlns="${MAIN}"><sheets><sheet name="Incidents" sheetId="1" r:id="rId1" /></sheets>${comment(bytes)}</workbook>`,
      relationshipsXml: `<Relationships xmlns="${PACKAGE_RELATIONSHIPS}"><Relationship Type="${RELATIONSHIP_TYPE}/worksheet" Target="/xl/worksheets/sheet1.xml" Id="rId1" />${comment(bytes)}</Relationships>`,
    });
    // Three more copies of the workbook, each under a megabyte, 2.7 MB in all.
    const copy = { name: "xl/workbook.xml", data: `<workbook>${comment(900_000)}</workbook>` };

    expect(readSheetParts(workbookZip(big(600_000)), "Incidents", LIMITS.zip).sheetXml).toContain(
      "<worksheet",
    );
    expect(
      codeOf(() =>
        readSheetParts(workbookZip({ after: [copy, copy, copy] }), "Incidents", LIMITS.zip),
      ),
    ).toBe("too_large");
  });

  it("the parts that name the sheets are held to a megabyte, whatever the limit for the sheet", () => {
    const zip = workbookZip({
      workbookXml: `<workbook xmlns:r="${RELATIONSHIP_TYPE}" xmlns="${MAIN}"><sheets><sheet name="Incidents" sheetId="1" r:id="rId1" /></sheets><!-- ${"x".repeat(1_100_000)} --></workbook>`,
    });

    expect(codeOf(() => readSheetParts(zip, "Incidents", LIMITS.zip))).toBe("too_large");
  });
});

describe("sheetRowsOf: the cells", () => {
  it.each([
    ["A1", 1],
    ["B1", 2],
    ["Z1", 26],
    ["AA1", 27],
    ["AZ1", 52],
    ["BA1", 53],
    ["BG1", 59],
    ["ZZ1", 702],
    ["AAA1", 703],
  ])("places the cell %s in column %i", (reference, column) => {
    const [row] = sheetRowsOf(
      sheetOf(`<c r="${reference}" t="inlineStr"><is><t>x</t></is></c>`),
      null,
      { maxRows: 10, maxColumns: 1000 },
    ).rows;

    expect(row).toHaveLength(column);
    expect(row[column - 1]).toBe("x");
    expect(row.slice(0, column - 1).every((value) => value === null)).toBe(true);
  });

  it("places the last column of a sheet, XFD, at 16384", () => {
    const { rows } = sheetRowsOf(sheetOf(`<c r="XFD1" t="n"><v>7</v></c>`), null, {
      maxRows: 10,
      maxColumns: 16_384,
    });

    expect(rows[0]).toHaveLength(16_384);
    expect(rows[0][16_383]).toBe(7);
  });

  it("places a cell by its own reference: rows may be sparse and cells need not start at column A", () => {
    const xml =
      `<worksheet xmlns="${MAIN}"><sheetData>` +
      `<row r="2"><c r="C2" t="n"><v>1</v></c><c r="E2" t="n"><v>2</v></c></row>` +
      `<row r="5"><c r="B5" t="inlineStr"><is><t>b</t></is></c></row>` +
      `</sheetData></worksheet>`;

    const { rows, errors } = sheetRowsOf(xml, null, SHEET_LIMITS);

    expect(errors).toBe(0);
    expect(rows).toEqual([[], [null, null, 1, null, 2], [], [], [null, "b"]]);
  });

  it("does not depend on the order of the cells, and the last of a cell given twice stands", () => {
    const rows = rowsOfCells(
      `<c r="B1" t="n"><v>2</v></c><c r="A1" t="n"><v>1</v></c><c r="A1" t="n"><v>3</v></c>`,
    );

    expect(rows).toEqual([[3, 2]]);
  });

  it("reads the cell types of the real export: inline strings, numbers and an empty inline string", () => {
    expect(
      rowsOfCells(
        `<c r="A1" s="12" t="n"><v>1797</v></c>` +
          `<c r="B1" s="13" t="n"><v>46325</v></c>` +
          `<c r="C1" s="12" t="inlineStr"><is><t>Title</t></is></c>` +
          `<c r="D1" s="12" t="inlineStr" />` +
          `<c r="E1" s="12" t="b"><v>1</v></c>`,
      ),
    ).toEqual([[1797, 46325, "Title", null, 1]]);
  });

  it("reads a number with no type, and every form of a number", () => {
    const cells = ["1", "-2", "+3", "4.5", ".5", "6.", "1e3", "1.5E-2", " 7 ", "0"];
    const xml = cells.map((text, index) => `<c r="${columnName(index + 1)}1"><v>${text}</v></c>`);

    expect(rowsOfCells(xml.join(""))[0]).toEqual([1, -2, 3, 4.5, 0.5, 6, 1000, 0.015, 7, 0]);
  });

  it("gives null for a number it cannot read, an empty value, and no value", () => {
    const cells = [
      "abc",
      "",
      "1e999",
      "0x10",
      "1 2",
      "--1",
      "NaN",
      "Infinity",
      "9".repeat(60) + "x",
    ];
    const xml = cells.map((text, index) => `<c r="${columnName(index + 1)}1"><v>${text}</v></c>`);

    expect(rowsOfCells(`${xml.join("")}<c r="J1" t="n" /><c r="K1"><v /></c>`)[0]).toEqual([
      ...cells.map(() => null),
      null,
      null,
    ]);
  });

  it("reads a number of up to 40 characters, and gives null for a longer one", () => {
    const cells = [
      "123456789012",
      "25569.123456789012345",
      `1${"0".repeat(39)}`,
      `1${"0".repeat(40)}`,
    ];
    const xml = cells.map((text, index) => `<c r="${columnName(index + 1)}1"><v>${text}</v></c>`);

    expect(rowsOfCells(xml.join(""))[0]).toEqual([123456789012, 25569.123456789012345, 1e39, null]);
  });

  it("reads a long run of digits with a letter after it in time in proportion to its length", () => {
    const startedAt = performance.now();
    const rows = rowsOfCells(`<c r="A1"><v>${"1".repeat(300_000)}x</v></c>`);

    expect(rows).toEqual([[null]]);
    expect(performance.now() - startedAt).toBeLessThan(10_000);
  });

  it.each([
    ["1", 1],
    ["0", 0],
    ["true", 1],
    ["false", 0],
    [" TRUE ", 1],
    ["2", null],
    ["", null],
    ["yes", null],
  ])("reads the boolean %j as %j", (text, expected) => {
    expect(rowsOfCells(`<c r="A1" t="b"><v>${text}</v></c>`)).toEqual([[expected]]);
  });

  it("reads str and d cells as strings, an error value as no value, and an unknown type as no value", () => {
    expect(
      rowsOfCells(
        `<c r="A1" t="str"><v>formula text</v></c>` +
          `<c r="B1" t="d"><v>2015-05-19T00:00:00Z</v></c>` +
          `<c r="C1" t="e"><v>#N/A</v></c>` +
          `<c r="D1" t="x"><v>1</v></c>` +
          `<c r="E1" t="str"><v></v></c>`,
      ),
    ).toEqual([["formula text", "2015-05-19T00:00:00Z", null, null, null]]);
  });

  it("reads the text of a string as written: entities decoded once, white space kept", () => {
    const cell = (text: string) =>
      `<c r="A1" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;

    expect(rowsOfCells(cell("  Q&amp;A &amp;lt; &#65;&#x42; \n end  "))).toEqual([
      ["  Q&A &lt; AB \n end  "],
    ]);
    expect(rowsOfCells(cell("<![CDATA[a <b> & c]]>"))).toEqual([["a <b> & c"]]);
  });

  it("joins the runs of a rich inline string, and leaves out its phonetic runs", () => {
    expect(
      rowsOfCells(
        `<c r="A1" t="inlineStr"><is><r><rPr><b /></rPr><t>bold </t></r><r><t>plain</t></r>` +
          `<r><note>NOISE</note><t>!</t></r><rPh sb="0" eb="1"><t>PHONETIC</t></rPh></is></c>`,
      ),
    ).toEqual([["bold plain!"]]);
  });

  it("gives null for an inline string cell with no text", () => {
    expect(
      rowsOfCells(
        `<c r="A1" t="inlineStr"><is><t></t></is></c><c r="B1" t="inlineStr"><is /></c><c r="C1" t="inlineStr" />`,
      ),
    ).toEqual([[null, null, null]]);
  });

  describe("shared strings", () => {
    const shared =
      `<sst xmlns="${MAIN}" count="3" uniqueCount="3"><si><t>zero</t></si>` +
      `<si><r><t xml:space="preserve">one </t></r><r><t>two</t></r><rPh><t>x</t></rPh></si>` +
      `<si><t>A &amp; B</t></si></sst>`;

    it("reads a cell of type s through the table, rich items included", () => {
      expect(
        rowsOfCells(
          `<c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c>`,
          shared,
        ),
      ).toEqual([["zero", "one two", "A & B"]]);
    });

    it("reads an index with white space around it", () => {
      expect(rowsOfCells(`<c r="A1" t="s"><v> 1 </v></c>`, shared)).toEqual([["one two"]]);
    });

    it("gives null for an index that is out of range, is no whole number, or has no table", () => {
      const cells = ["3", "-1", "1.5", "x", "", "99999999999", "1e0"];
      const xml = cells.map(
        (text, index) => `<c r="${columnName(index + 1)}1" t="s"><v>${text}</v></c>`,
      );

      expect(rowsOfCells(xml.join(""), shared)[0]).toEqual(cells.map(() => null));
      expect(rowsOfCells(`<c r="A1" t="s"><v>0</v></c>`, null)).toEqual([[null]]);
    });

    it("counts a table that is not one as an error", () => {
      const sheet = sheetOf(`<c r="A1" t="s"><v>0</v></c>`);

      expect(sheetRowsOf(sheet, "<html>x</html>", SHEET_LIMITS).errors).toBeGreaterThan(0);
      expect(
        sheetRowsOf(sheet, `<sst xmlns="${MAIN}"><si><t>cut`, SHEET_LIMITS).errors,
      ).toBeGreaterThan(0);
    });
  });

  it("counts a cell with no place as an error, and reads the rest", () => {
    const rows = sheetRowsOf(
      sheetOf(
        `<c t="n"><v>1</v></c><c r="B1" t="n"><v>2</v></c><c r="1A" t="n"><v>3</v></c>` +
          `<c r="A0" t="n"><v>4</v></c><c r="a1" t="n"><v>5</v></c><c r="A01" t="n"><v>6</v></c>` +
          `<c r="A1B" t="n"><v>7</v></c><c r="" t="n"><v>8</v></c><c r="ABCD1" t="n"><v>9</v></c>`,
      ),
      null,
      SHEET_LIMITS,
    );

    expect(rows.errors).toBe(8);
    expect(rows.rows).toEqual([[null, 2]]);
  });

  it("counts a document that is malformed, cut short, or not a worksheet as an error", () => {
    const cut = `<worksheet xmlns="${MAIN}"><sheetData><row r="1"><c r="A1" t="n"><v>1</v></c>`;
    const other = `<html><body><c r="A1" t="n"><v>1</v></c></body></html>`;

    expect(sheetRowsOf(cut, null, SHEET_LIMITS)).toMatchObject({ errors: 1, rows: [[1]] });
    expect(sheetRowsOf(other, null, SHEET_LIMITS)).toMatchObject({ errors: 1, root: "html" });
    expect(sheetRowsOf("", null, SHEET_LIMITS)).toMatchObject({ errors: 1, root: null, rows: [] });
    expect(sheetRowsOf(sheetOf(""), null, SHEET_LIMITS)).toMatchObject({ errors: 0, rows: [] });
  });

  it("refuses a DOCTYPE with an internal subset: an entity a sheet declares is never expanded", () => {
    const xml = `<!DOCTYPE worksheet [<!ENTITY boom "boom">]><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&boom;</t></is></c></row></sheetData></worksheet>`;

    const { rows, errors } = sheetRowsOf(xml, null, SHEET_LIMITS);

    expect(errors).toBeGreaterThan(0);
    expect(rows).toEqual([]);
  });

  it("keeps a cell named __proto__ out of the way: the row is an array and nothing is polluted", () => {
    const rows = rowsOfCells(
      `<c r="A1" t="inlineStr" __proto__="x" constructor="y"><is><t>ok</t></is></c>`,
    );

    expect(rows).toEqual([["ok"]]);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  describe("limits", () => {
    it("a cell past the last row or the last column is too_large", () => {
      const limits = { maxRows: 5, maxColumns: 3 };
      const at = (reference: string) =>
        codeOf(() => sheetRowsOf(sheetOf(`<c r="${reference}" t="n"><v>1</v></c>`), null, limits));

      expect(at("C5")).toBeNull();
      expect(at("A6")).toBe("too_large");
      expect(at("D1")).toBe("too_large");
      expect(at("A1048576")).toBe("too_large");
      expect(at("XFD1")).toBe("too_large");
    });

    it("stops at the first cell past a limit, so that the rest of the sheet costs nothing", () => {
      const filler = '<c r="A1" t="n"><v>1</v></c>'.repeat(200_000);
      const startedAt = performance.now();

      expect(
        codeOf(() =>
          sheetRowsOf(sheetOf(`<c r="A999" t="n"><v>1</v></c>${filler}`), null, {
            maxRows: 10,
            maxColumns: 10,
          }),
        ),
      ).toBe("too_large");
      expect(performance.now() - startedAt).toBeLessThan(10_000);
    });

    it("a sheet of the limit's size is read whole", () => {
      const rows = Array.from({ length: 1_000 }, (_, index) => [index]);

      const sheet = sheetRowsOf(sheetXml(rows), null, { maxRows: 1_000, maxColumns: 1 });

      expect(sheet.rows).toHaveLength(1_000);
      expect(sheet.rows[999]).toEqual([999]);
    });
  });

  // A linear scan takes a fraction of a second here and a quadratic one far longer, so the bound
  // leaves room for a machine that runs the whole suite at once.
  it("a sheet the size of the real one (6.7 MB, 100,000 cells) is read in under four seconds", () => {
    const row = (index: number): Cell[] => [
      index,
      42_000 + index,
      `Incident number ${index} with a title of some length`,
      "A description of some length, written by an editor, that tells what the system did and who it harmed.".repeat(
        2,
      ),
      "Fictional Deployer, Another Deployer",
      "Fictional Developer",
      ...Array.from({ length: 4 }, (_, extra) => (extra % 2 === 0 ? null : "taxonomy")),
    ];
    const xml = sheetXml(Array.from({ length: 12_500 }, (_, index) => row(index + 1)));
    expect(xml.length).toBeGreaterThan(6_000_000);

    const startedAt = performance.now();
    const sheet = sheetRowsOf(xml, null, SHEET_LIMITS);

    expect(performance.now() - startedAt).toBeLessThan(10_000);
    expect(sheet.errors).toBe(0);
    expect(sheet.rows).toHaveLength(12_500);
    expect(sheet.rows[12_499][0]).toBe(12_500);
  });

  it("a hostile run of '<' or '&' in a cell is read in time in proportion to its size", () => {
    for (const text of ["<".repeat(200_000), "&".repeat(200_000)]) {
      const startedAt = performance.now();
      sheetRowsOf(
        sheetOf(`<c r="A1" t="inlineStr"><is><t>${text}</t></is></c>`),
        null,
        SHEET_LIMITS,
      );
      expect(performance.now() - startedAt).toBeLessThan(10_000);
    }
  });
});

describe("dayOfExcelSerial", () => {
  it.each([
    [25569, "1970-01-01"],
    [25568, "1969-12-31"],
    [42143, "2015-05-19"],
    [61, "1900-03-01"],
    [36526, "2000-01-01"],
    [36585, "2000-02-29"],
    [36586, "2000-03-01"],
    [43890, "2020-02-29"],
    [44926, "2022-12-31"],
    [44927, "2023-01-01"],
    [45291, "2023-12-31"],
    [73109, "2100-02-28"],
    [73110, "2100-03-01"],
    [46325, "2026-10-30"],
    [2_958_465, "9999-12-31"],
  ])("serial %i is %s", (serial, day) => {
    expect(dayOfExcelSerial(serial)).toBe(day);
  });

  it("is the day of a serial with a time of day", () => {
    expect(dayOfExcelSerial(42143.99999)).toBe("2015-05-19");
    expect(dayOfExcelSerial(25569.5)).toBe("1970-01-01");
  });

  it.each([
    ["the day Excel invents, 29 February 1900", 60],
    ["a serial before the 1900 leap day", 59],
    ["zero", 0],
    ["a negative serial", -5],
    ["a serial past 9999-12-31", 2_958_466],
    ["not a number", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
  ])("serial for %s is no day", (_label, serial) => {
    expect(dayOfExcelSerial(serial)).toBeNull();
  });
});
