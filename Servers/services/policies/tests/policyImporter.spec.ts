/**
 * @fileoverview Policy Importer Tests
 *
 * Tests for DOCX to HTML conversion and validation constants.
 *
 * @module tests/policyImporter
 */

jest.mock("mammoth", () => ({
  convertToHtml: jest.fn(),
}));

// Mock the shared sanitizer module to assert it's called with the converted
// HTML. Real sanitize-html behavior is covered by utils/__tests__/sanitizeUserHtml.test.ts.
jest.mock("../../../utils/sanitizeUserHtml", () => ({
  sanitizeUserHtml: jest.fn((html: unknown) => html),
}));

import mammoth from "mammoth";
import { sanitizeUserHtml } from "../../../utils/sanitizeUserHtml";
import { convertDocxToHtml, DOCX_MAX_FILE_SIZE_BYTES, DOCX_ALLOWED_MIMES } from "../policyImporter";

const mockConvertToHtml = mammoth.convertToHtml as jest.MockedFunction<
  typeof mammoth.convertToHtml
>;
const mockSanitizeUserHtml = sanitizeUserHtml as jest.MockedFunction<typeof sanitizeUserHtml>;

describe("policyImporter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("constants", () => {
    it("DOCX_MAX_FILE_SIZE_BYTES should be 10MB", () => {
      expect(DOCX_MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
    });

    it("DOCX_ALLOWED_MIMES should include DOCX and octet-stream", () => {
      expect(DOCX_ALLOWED_MIMES).toContain(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      expect(DOCX_ALLOWED_MIMES).toContain("application/octet-stream");
    });
  });

  describe("convertDocxToHtml", () => {
    it("should convert DOCX buffer to sanitized HTML", async () => {
      mockConvertToHtml.mockResolvedValue({
        value: "<h1>Title</h1><p>Paragraph</p>",
        messages: [],
      });

      const result = await convertDocxToHtml(Buffer.from("fake"));

      expect(mockConvertToHtml).toHaveBeenCalledWith(
        { buffer: expect.any(Buffer) },
        expect.objectContaining({
          styleMap: expect.arrayContaining(["p[style-name='Heading 1'] => h1:fresh"]),
        }),
      );
      expect(result.html).toBe("<h1>Title</h1><p>Paragraph</p>");
      expect(result.warnings).toEqual([]);
    });

    it("should collapse h4-h6 to h3", async () => {
      mockConvertToHtml.mockResolvedValue({
        value: "<h4>Heading</h4><h5>Sub</h5>",
        messages: [],
      });

      const result = await convertDocxToHtml(Buffer.from("fake"));
      expect(result.html).toContain("<h3>Heading</h3>");
      expect(result.html).toContain("<h3>Sub</h3>");
    });

    it("should strip class attributes", async () => {
      mockConvertToHtml.mockResolvedValue({
        value: '<p class="MsoNormal">text</p>',
        messages: [],
      });

      const result = await convertDocxToHtml(Buffer.from("fake"));
      expect(result.html).not.toContain('class="MsoNormal"');
      expect(result.html).toContain("<p>text</p>");
    });

    it("should extract warning messages", async () => {
      mockConvertToHtml.mockResolvedValue({
        value: "<p>text</p>",
        messages: [
          { type: "warning", message: "Unrecognized element" },
          { type: "info", message: "Some info" },
        ],
      });

      const result = await convertDocxToHtml(Buffer.from("fake"));
      expect(result.warnings).toEqual(["Unrecognized element"]);
    });

    it("should pass converted HTML through the shared sanitizeUserHtml utility", async () => {
      mockConvertToHtml.mockResolvedValue({
        value: "<p>safe</p>",
        messages: [],
      });

      await convertDocxToHtml(Buffer.from("fake"));

      expect(mockSanitizeUserHtml).toHaveBeenCalledWith(expect.stringContaining("<p>safe</p>"));
    });

    it("should pass the buffer to mammoth correctly", async () => {
      mockConvertToHtml.mockResolvedValue({ value: "", messages: [] });
      const buffer = Buffer.from("docx-data");

      await convertDocxToHtml(buffer);

      expect(mockConvertToHtml).toHaveBeenCalledWith({ buffer }, expect.any(Object));
    });
  });
});
