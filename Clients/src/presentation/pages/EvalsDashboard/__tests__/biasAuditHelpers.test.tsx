import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { formatDate, getModeChip, getStatusChip } from "../biasAuditHelpers";

describe("biasAuditHelpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("getStatusChip", () => {
    it.each([
      ["completed", "Completed"],
      ["running", "Running"],
      ["pending", "Pending"],
      ["failed", "Failed"],
      ["queued", "queued"],
    ] as const)("maps %s to its chip label", (status, expectedLabel) => {
      renderWithProviders(<>{getStatusChip(status)}</>);
      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    });
  });

  describe("getModeChip", () => {
    it.each([
      ["quantitative_audit", "Quantitative"],
      ["impact_assessment", "Assessment"],
      ["compliance_checklist", "Checklist"],
      ["framework_assessment", "Framework"],
      ["custom", "Custom"],
      ["unknown_mode", "unknown_mode"],
    ] as const)("maps %s to its chip label", (mode, expectedLabel) => {
      renderWithProviders(<>{getModeChip(mode)}</>);
      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    });
  });

  describe("formatDate", () => {
    it("returns an em dash for a null date", () => {
      expect(formatDate(null)).toBe("—");
    });

    it("returns an em dash for an empty date string", () => {
      expect(formatDate("")).toBe("—");
    });

    it("formats a valid ISO date using the default DD-MM-YYYY preference", () => {
      expect(formatDate("2025-06-01")).toBe("01-06-2025");
    });
  });
});
