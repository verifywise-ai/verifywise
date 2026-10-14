import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { getModeChip, getStatusChip } from "../biasAuditHelpers";

describe("biasAuditHelpers", () => {
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
});
