/**
 * @fileoverview Text Extractor Tests
 *
 * Tests for file text extraction and normalization.
 *
 * @module tests/textExtractor
 */

jest.mock("pdf-parse", () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: jest.fn().mockResolvedValue({ text: "PDF content" }),
    destroy: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("mammoth", () => ({
  extractRawText: jest.fn(),
}));

jest.mock("xlsx", () => ({
  read: jest.fn(),
  utils: {
    sheet_to_json: jest.fn(),
  },
}));

import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { extractText, normalizeText } from "../textExtractor";

const mockExtractRawText = mammoth.extractRawText as jest.MockedFunction<
  typeof mammoth.extractRawText
>;
const mockXlsxRead = XLSX.read as jest.MockedFunction<typeof XLSX.read>;
const mockSheetToJson = XLSX.utils.sheet_to_json as jest.MockedFunction<
  typeof XLSX.utils.sheet_to_json
>;

describe("textExtractor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("extractText", () => {
    it("should extract text from PDF", async () => {
      const result = await extractText(Buffer.from("pdf"), "application/pdf");
      expect(result).toBe("PDF content");
    });

    it("should extract text from DOCX", async () => {
      mockExtractRawText.mockResolvedValue({ value: "DOCX content" });
      const result = await extractText(
        Buffer.from("docx"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      expect(result).toBe("DOCX content");
    });

    it("should extract text from XLSX", async () => {
      mockXlsxRead.mockReturnValue({
        SheetNames: ["Sheet1"],
        Sheets: {
          Sheet1: {},
        },
      } as any);
      mockSheetToJson.mockReturnValue([
        ["Header1", "Header2"],
        ["Value1", "Value2"],
      ]);

      const result = await extractText(
        Buffer.from("xlsx"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      expect(result).toBe("Header1 Header2\nValue1 Value2");
    });

    it("should extract text from CSV", async () => {
      const buffer = Buffer.from("col1,col2\nval1,val2");
      const result = await extractText(buffer, "text/csv");
      expect(result).toBe("col1,col2\nval1,val2");
    });

    it("should extract text from plain text", async () => {
      const buffer = Buffer.from("plain text content");
      const result = await extractText(buffer, "text/plain");
      expect(result).toBe("plain text content");
    });

    it("should extract text from markdown", async () => {
      const buffer = Buffer.from("# Heading");
      const result = await extractText(buffer, "text/markdown");
      expect(result).toBe("# Heading");
    });

    it("should return null for unsupported mimetype", async () => {
      const result = await extractText(Buffer.from("img"), "image/png");
      expect(result).toBeNull();
    });

    it("should return null on extraction error", async () => {
      mockExtractRawText.mockRejectedValue(new Error("parse error"));
      const result = await extractText(
        Buffer.from("docx"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      expect(result).toBeNull();
    });

    it("should handle XLSX with multiple sheets", async () => {
      mockXlsxRead.mockReturnValue({
        SheetNames: ["Sheet1", "Sheet2"],
        Sheets: {
          Sheet1: {},
          Sheet2: {},
        },
      } as any);
      mockSheetToJson.mockReturnValueOnce([["A", "B"]]).mockReturnValueOnce([["C", "D"]]);

      const result = await extractText(
        Buffer.from("xlsx"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      expect(result).toBe("A B\nC D");
    });

    it("should skip empty rows in spreadsheets", async () => {
      mockXlsxRead.mockReturnValue({
        SheetNames: ["Sheet1"],
        Sheets: { Sheet1: {} },
      } as any);
      mockSheetToJson.mockReturnValue([
        ["A", "B"],
        ["", ""],
        ["C", "D"],
      ]);

      const result = await extractText(
        Buffer.from("xlsx"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      expect(result).toBe("A B\nC D");
    });

    it("should handle null cells in spreadsheets", async () => {
      mockXlsxRead.mockReturnValue({
        SheetNames: ["Sheet1"],
        Sheets: { Sheet1: {} },
      } as any);
      mockSheetToJson.mockReturnValue([["A", null, "B"]]);

      const result = await extractText(
        Buffer.from("xlsx"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      expect(result).toBe("A  B");
    });

    it("should handle legacy XLS mimetype", async () => {
      mockXlsxRead.mockReturnValue({
        SheetNames: ["Sheet1"],
        Sheets: { Sheet1: {} },
      } as any);
      mockSheetToJson.mockReturnValue([["legacy"]]);

      const result = await extractText(Buffer.from("xls"), "application/vnd.ms-excel");
      expect(result).toBe("legacy");
    });
  });

  describe("normalizeText", () => {
    it("should return empty string for empty input", () => {
      expect(normalizeText("")).toBe("");
    });

    it("should return empty string for null/undefined", () => {
      expect(normalizeText(null as any)).toBe("");
      expect(normalizeText(undefined as any)).toBe("");
    });

    it("should remove null bytes", () => {
      expect(normalizeText("hello\u0000 world")).toBe("hello world");
    });

    it("should collapse whitespace", () => {
      expect(normalizeText("a   b\t\nc")).toBe("a b c");
    });

    it("should trim leading/trailing whitespace", () => {
      expect(normalizeText("  hello  ")).toBe("hello");
    });

    it("should truncate to maxLength", () => {
      const long = "a".repeat(2_000_000);
      const result = normalizeText(long, 1_000_000);
      expect(result.length).toBe(1_000_000);
    });

    it("should use default maxLength of 1_000_000", () => {
      const long = "a".repeat(1_500_000);
      const result = normalizeText(long);
      expect(result.length).toBe(1_000_000);
    });

    it("should not truncate short text", () => {
      expect(normalizeText("short")).toBe("short");
    });
  });
});
