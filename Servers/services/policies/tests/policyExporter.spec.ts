/**
 * @fileoverview Policy Exporter Tests
 *
 * Tests for policy export filename generation. PDF/DOCX generation (Playwright/docx)
 * is covered separately.
 *
 * @module tests/policyExporter
 */

import { generateFilename } from "../policyExporter";

describe("policyExporter", () => {
  describe("generateFilename", () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date("2026-03-15T12:00:00Z"));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("appends the current ISO date to the sanitized title", () => {
      expect(generateFilename("Data Retention Policy", "pdf")).toBe(
        "Data_Retention_Policy_2026-03-15.pdf",
      );
    });

    it("uses the docx extension when requested", () => {
      expect(generateFilename("Data Retention Policy", "docx")).toBe(
        "Data_Retention_Policy_2026-03-15.docx",
      );
    });

    it("strips characters that aren't alphanumeric, whitespace, or hyphens", () => {
      expect(generateFilename("Policy: GDPR & CCPA (2026)!", "pdf")).toBe(
        "Policy_GDPR_CCPA_2026_2026-03-15.pdf",
      );
    });

    it("collapses runs of whitespace into a single underscore", () => {
      expect(generateFilename("Multi   Word    Title", "pdf")).toBe(
        "Multi_Word_Title_2026-03-15.pdf",
      );
    });

    it("preserves hyphens in the title", () => {
      expect(generateFilename("Data-Sharing Policy", "pdf")).toBe(
        "Data-Sharing_Policy_2026-03-15.pdf",
      );
    });

    it("truncates the sanitized title to 50 characters before appending the date", () => {
      const longTitle = "A".repeat(80);
      const result = generateFilename(longTitle, "pdf");

      expect(result).toBe(`${"A".repeat(50)}_2026-03-15.pdf`);
    });

    it("returns just the date and extension when the title sanitizes to empty", () => {
      expect(generateFilename("!!!???", "pdf")).toBe("_2026-03-15.pdf");
    });
  });
});
