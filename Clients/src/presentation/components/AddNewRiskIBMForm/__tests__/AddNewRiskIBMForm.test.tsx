import { vi } from "vitest";

vi.mock("../../../assets/IBMAIRISKDB.json", () => ({
  default: [
    {
      id: "1",
      name: "Test Risk",
      description: "A test risk",
      severity: "Major",
      likelihood: "Likely",
      category: "Test",
    },
  ],
}));

vi.mock("../../RiskDatabaseModal", () => ({
  default: (props: Record<string, unknown>) => (
    <div data-testid="risk-database-modal">
      <span data-testid="modal-title">{String(props.title)}</span>
      <span data-testid="modal-open">{String(props.isOpen)}</span>
      <span data-testid="database-name">{String(props.databaseName)}</span>
    </div>
  ),
}));

vi.mock("../../RiskDatabaseModal/types", () => ({
  RiskData: {},
  SelectedRiskData: {},
}));

vi.mock("../../RiskLevel/constants", () => ({
  Severity: {
    Minor: "Minor",
    Moderate: "Moderate",
    Major: "Major",
  },
  Likelihood: {
    Unlikely: "Unlikely",
    Possible: "Possible",
    Likely: "Likely",
  },
}));

import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import AddNewRiskIBMModal from "../index";

describe("AddNewRiskIBMModal", () => {
  it("renders RiskDatabaseModal with IBM-specific props", () => {
    renderWithProviders(<AddNewRiskIBMModal isOpen={true} setIsOpen={vi.fn()} />);
    expect(screen.getByTestId("risk-database-modal")).toBeInTheDocument();
    expect(screen.getByTestId("modal-title")).toHaveTextContent(
      "Add a new risk from IBM risk database",
    );
    expect(screen.getByTestId("database-name")).toHaveTextContent("IBM AI Risk Database");
  });

  it("passes isOpen prop to modal", () => {
    renderWithProviders(<AddNewRiskIBMModal isOpen={false} setIsOpen={vi.fn()} />);
    expect(screen.getByTestId("modal-open")).toHaveTextContent("false");
  });

  it("renders without onRiskSelected callback", () => {
    renderWithProviders(<AddNewRiskIBMModal isOpen={true} setIsOpen={vi.fn()} />);
    expect(screen.getByTestId("risk-database-modal")).toBeInTheDocument();
  });
});
