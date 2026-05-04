import { vi } from "vitest";

vi.mock("../../Table/ProjectRiskMitigationTable/ProjectRiskMitigationTable", () => ({
  ProjectRiskMitigationTable: () => <div data-testid="mitigation-table" />,
}));

import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { ProjectRiskMitigation } from "../ProjectRiskMitigation";

describe("ProjectRiskMitigation", () => {
  const defaultProps = {
    onClose: vi.fn(),
    annexCategories: [],
    subClauses: [],
    assessments: [],
    controls: [],
    annexControls_27001: [],
    subClauses_27001: [],
  };

  it("renders without crashing", () => {
    renderWithProviders(<ProjectRiskMitigation {...defaultProps} />);
    expect(screen.getByText("Linked controls components")).toBeInTheDocument();
  });

  it("renders the mitigation table", () => {
    renderWithProviders(<ProjectRiskMitigation {...defaultProps} />);
    expect(screen.getByTestId("mitigation-table")).toBeInTheDocument();
  });
});
