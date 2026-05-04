import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { AuditRiskPopup } from "../AuditRiskPopup";

// Mock AuditRiskTable
vi.mock("../../Table/AuditRiskTable/AuditRiskTable", () => ({
  AuditRiskTable: () => <div data-testid="audit-risk-table">AuditRiskTable</div>,
}));

describe("AuditRiskPopup", () => {
  const defaultProps = {
    onClose: vi.fn(),
    risks: [1, 2, 3],
    _deletedRisks: [] as number[],
    _setDeletedRisks: vi.fn(),
    _selectedRisks: [1, 2],
    _setSelectedRisks: vi.fn(),
  };

  it("renders when open", () => {
    renderWithProviders(<AuditRiskPopup {...defaultProps} />);
    expect(screen.getByText("Marked as done but linked risk detected")).toBeInTheDocument();
  });

  it("renders the description text", () => {
    renderWithProviders(<AuditRiskPopup {...defaultProps} />);
    expect(
      screen.getByText(/This section has been been marked as done, but there's still a risk/),
    ).toBeInTheDocument();
  });

  it("renders the audit risk table", () => {
    renderWithProviders(<AuditRiskPopup {...defaultProps} />);
    expect(screen.getByTestId("audit-risk-table")).toBeInTheDocument();
  });

  it("renders the action buttons", () => {
    renderWithProviders(<AuditRiskPopup {...defaultProps} />);
    expect(screen.getByText("Keep risk as is")).toBeInTheDocument();
    expect(screen.getByText("Unlink risk")).toBeInTheDocument();
  });

  it("renders the instruction text", () => {
    renderWithProviders(<AuditRiskPopup {...defaultProps} />);
    expect(
      screen.getByText(/Marking it as done doesn't automatically resolve this risk/),
    ).toBeInTheDocument();
  });
});
