import { vi } from "vitest";

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
    Negligible: "Negligible",
    Minor: "Minor",
    Moderate: "Moderate",
    Major: "Major",
    Catastrophic: "Catastrophic",
  },
  Likelihood: {
    Rare: "Rare",
    Unlikely: "Unlikely",
    Possible: "Possible",
    Likely: "Likely",
    AlmostCertain: "AlmostCertain",
  },
}));

import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import AddNewRiskMITModal from "../index";

describe("AddNewRiskMITModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fetch for lazy loading
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve([]),
    });
  });

  it("renders RiskDatabaseModal with MIT-specific props", () => {
    renderWithProviders(<AddNewRiskMITModal isOpen={true} setIsOpen={vi.fn()} />);
    expect(screen.getByTestId("risk-database-modal")).toBeInTheDocument();
    expect(screen.getByTestId("modal-title")).toHaveTextContent(
      "Add a new risk from risk database",
    );
    expect(screen.getByTestId("database-name")).toHaveTextContent("MIT AI Risk Database");
  });

  it("passes isOpen prop to modal", () => {
    renderWithProviders(<AddNewRiskMITModal isOpen={false} setIsOpen={vi.fn()} />);
    expect(screen.getByTestId("modal-open")).toHaveTextContent("false");
  });

  it("renders without onRiskSelected callback", () => {
    renderWithProviders(<AddNewRiskMITModal isOpen={true} setIsOpen={vi.fn()} />);
    expect(screen.getByTestId("risk-database-modal")).toBeInTheDocument();
  });
});
