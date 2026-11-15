import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  flattenCellValue,
  MAX_SPREADSHEET_BYTES,
  parseSpreadsheet,
  SpreadsheetParseError,
} from "../parseSpreadsheet";

const fileFrom = (name: string, content: ArrayBuffer | Uint8Array, size?: number): File =>
  ({
    name,
    size: size ?? content.byteLength,
    arrayBuffer: async () => content,
  }) as unknown as File;

async function workbookFile(build: (workbook: ExcelJS.Workbook) => void): Promise<File> {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  const buffer = await workbook.xlsx.writeBuffer();
  return fileFrom("apps.xlsx", buffer as unknown as ArrayBuffer);
}

describe("flattenCellValue", () => {
  it("joins rich text runs", () => {
    expect(flattenCellValue({ richText: [{ text: "Chat" }, { text: "GPT " }] })).toBe("ChatGPT");
  });

  it("uses the text of a hyperlink", () => {
    expect(flattenCellValue({ text: "a@b.co", hyperlink: "mailto:a@b.co" })).toBe("a@b.co");
  });

  it("flattens a hyperlink whose text is rich text", () => {
    expect(
      flattenCellValue({ text: { richText: [{ text: "Docs" }] }, hyperlink: "https://x.io" }),
    ).toBe("Docs");
  });

  it("falls back to the address of a hyperlink with no text", () => {
    expect(flattenCellValue({ hyperlink: "mailto:a@b.co" })).toBe("a@b.co");
  });

  it("uses the result of a formula", () => {
    expect(flattenCellValue({ formula: "A1+1", result: 4 })).toBe(4);
    expect(flattenCellValue({ sharedFormula: "A1", result: "x" })).toBe("x");
  });

  it("treats a formula with no result or an error result as blank", () => {
    expect(flattenCellValue({ formula: "A1" })).toBeNull();
    expect(flattenCellValue({ formula: "A1", result: { error: "#REF!" } })).toBeNull();
  });

  it("writes dates as strings and keeps a time when there is one", () => {
    expect(flattenCellValue(new Date("2026-03-01T00:00:00.000Z"))).toBe("2026-03-01");
    expect(flattenCellValue(new Date("2026-03-01T10:30:00.000Z"))).toBe("2026-03-01T10:30:00.000Z");
  });

  it("trims strings and treats blank ones as null", () => {
    expect(flattenCellValue("  x ")).toBe("x");
    expect(flattenCellValue("   ")).toBeNull();
    expect(flattenCellValue(undefined)).toBeNull();
  });

  it("keeps numbers and booleans", () => {
    expect(flattenCellValue(0)).toBe(0);
    expect(flattenCellValue(false)).toBe(false);
  });
});

describe("parseSpreadsheet", () => {
  it("reports real row numbers and skips wholly blank rows", async () => {
    const file = await workbookFile((workbook) => {
      const sheet = workbook.addWorksheet("Apps");
      sheet.getCell("A1").value = "Name";
      sheet.getCell("B1").value = "Status";
      sheet.getCell("A2").value = "First";
      sheet.getCell("A5").value = "Second";
      sheet.getCell("B5").value = "Draft";
      // Has a cell, but nothing in it.
      sheet.getCell("A6").value = "   ";
      sheet.getCell("A7").value = "Third";
    });

    const result = await parseSpreadsheet(file);

    expect(result.headers).toEqual(["Name", "Status"]);
    expect(result.rows.map((row) => row.row_number)).toEqual([2, 5, 7]);
    expect(result.rows[1].values).toEqual({ Name: "Second", Status: "Draft" });
    expect(result.rows[0].values).toEqual({ Name: "First", Status: null });
  });

  it("reads rich text, hyperlinks and formulas from a real workbook", async () => {
    const file = await workbookFile((workbook) => {
      const sheet = workbook.addWorksheet("Apps");
      sheet.addRow(["Name", "Owner", "Score"]);
      sheet.getCell("A2").value = { richText: [{ text: "Co" }, { text: "pilot" }] };
      sheet.getCell("B2").value = { text: "a@b.co", hyperlink: "mailto:a@b.co" };
      sheet.getCell("C2").value = { formula: "1+1", result: 2, date1904: false };
    });

    const result = await parseSpreadsheet(file);

    expect(result.rows[0].values).toEqual({ Name: "Copilot", Owner: "a@b.co", Score: 2 });
  });

  it("reads only the first worksheet and ignores unnamed columns", async () => {
    const file = await workbookFile((workbook) => {
      const first = workbook.addWorksheet("First");
      first.getCell("A1").value = "Name";
      first.getCell("A2").value = "Kept";
      first.getCell("C2").value = "No header";
      workbook.addWorksheet("Second").addRow(["Other"]);
    });

    const result = await parseSpreadsheet(file);

    expect(result.headers).toEqual(["Name"]);
    expect(result.rows).toEqual([{ row_number: 2, values: { Name: "Kept" } }]);
  });

  it("rejects a file that is not xlsx", async () => {
    await expect(parseSpreadsheet(fileFrom("apps.csv", new Uint8Array(1)))).rejects.toThrow(
      "Choose an Excel file (.xlsx).",
    );
  });

  it("accepts an upper-case extension", async () => {
    const file = await workbookFile((workbook) => workbook.addWorksheet("A").addRow(["Name"]));
    const renamed = fileFrom("APPS.XLSX", await file.arrayBuffer());
    await expect(parseSpreadsheet(renamed)).resolves.toEqual({ headers: ["Name"], rows: [] });
  });

  it("rejects an oversized file before reading it", async () => {
    const file = fileFrom("apps.xlsx", new Uint8Array(1), MAX_SPREADSHEET_BYTES + 1);
    await expect(parseSpreadsheet(file)).rejects.toThrow("The file is larger than 10 MB.");
  });

  it("rejects a corrupt file with a readable message", async () => {
    const file = fileFrom("apps.xlsx", new TextEncoder().encode("not a zip"));
    await expect(parseSpreadsheet(file)).rejects.toBeInstanceOf(SpreadsheetParseError);
  });
});
