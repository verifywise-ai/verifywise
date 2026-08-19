import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const baseScenario = {
  id: 1,
  name: "EU High Risk",
  description: "For EU high risk AI systems",
  industry: "technology",
  region: "eu",
  recommended_framework_ids: [1, 2],
  priority_order: { primary: 1, secondary: [2], supplementary: [] },
  is_builtin: true,
};

let mockScenarios: any[] = [baseScenario];
let mockScenariosLoading = false;
let mockPreferences: any = null;
const mockUpdatePreferencesMutate = vi.fn();
const mockRecommendMutate = vi.fn();
let mockRecommendData: any[] | undefined = undefined;
let mockRecommendPending = false;
const mockCreateScenarioMutate = vi.fn();
const mockUpdateScenarioMutate = vi.fn();
const mockDeleteScenarioMutate = vi.fn();
const mockActivateScenarioMutate = vi.fn();
let mockActivatePending = false;
const mockSimulateMutate = vi.fn();

vi.mock("../../../../application/hooks/useGovernanceOs", () => ({
  useScenarios: () => ({ data: mockScenarios, isLoading: mockScenariosLoading }),
  useGovernancePreferences: () => ({ data: mockPreferences }),
  useUpdatePreferences: () => ({ mutate: mockUpdatePreferencesMutate, isPending: false }),
  useGovernanceRecommendations: () => ({
    mutate: mockRecommendMutate,
    data: mockRecommendData,
    isPending: mockRecommendPending,
  }),
  useCreateScenario: () => ({ mutate: mockCreateScenarioMutate, isPending: false }),
  useUpdateScenario: () => ({ mutate: mockUpdateScenarioMutate, isPending: false }),
  useDeleteScenario: () => ({ mutate: mockDeleteScenarioMutate, isPending: false }),
  useActivateScenario: () => ({
    mutate: mockActivateScenarioMutate,
    isPending: mockActivatePending,
  }),
  useSimulateScenario: () => ({
    mutate: mockSimulateMutate,
    data: undefined,
    isPending: false,
    error: null,
  }),
}));

vi.mock("../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ approvedProjects: [], isLoading: false }),
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [], loading: false }),
}));

vi.mock("../../../components/GovernanceOS/ActivationWizard", () => ({
  default: ({ open, onActivate, onClose }: any) =>
    open ? (
      <div data-testid="activation-wizard">
        <button onClick={() => onActivate({ projectIds: [1], ownerAssignments: {} })}>
          confirm-activate
        </button>
        <button onClick={onClose}>close-wizard</button>
      </div>
    ) : null,
}));

vi.mock("../../../components/GovernanceOS/WhatIfSimulator", () => ({
  default: () => <div data-testid="what-if-simulator" />,
}));

vi.mock("../../../components/GovernanceOS/ScenarioComparison", () => ({
  default: () => <div data-testid="scenario-comparison" />,
}));

vi.mock("../../../components/GovernanceOS/ActiveScenarioPanel", () => ({
  default: ({ activeScenario, onActivate }: any) => (
    <div data-testid="active-scenario-panel">
      {activeScenario ? (
        <button onClick={() => onActivate(activeScenario)}>activate-active</button>
      ) : (
        "no-active-scenario"
      )}
    </div>
  ),
}));

vi.mock("../../../components/GovernanceOS/ActivationHistory", () => ({
  default: () => <div data-testid="activation-history" />,
}));

vi.mock("../../../components/GovernanceOS/ScenarioCard", () => ({
  default: ({ scenario, onSelect, onEdit, onDelete, onActivate }: any) => (
    <div data-testid={`scenario-card-${scenario.id}`}>
      <span>{scenario.name}</span>
      <button onClick={() => onSelect?.(scenario)}>select-{scenario.id}</button>
      {onEdit && <button onClick={() => onEdit(scenario)}>edit-{scenario.id}</button>}
      {onDelete && <button onClick={() => onDelete(scenario)}>delete-{scenario.id}</button>}
      {onActivate && <button onClick={() => onActivate(scenario)}>activate-{scenario.id}</button>}
    </div>
  ),
}));

import ScenarioBuilder from "../ScenarioBuilder";

describe("ScenarioBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScenarios = [baseScenario];
    mockScenariosLoading = false;
    mockPreferences = null;
    mockRecommendData = undefined;
    mockRecommendPending = false;
    mockActivatePending = false;
  });

  it("renders the scenario list", () => {
    renderWithProviders(<ScenarioBuilder />);

    expect(screen.getByText("All Governance Scenarios")).toBeInTheDocument();
    expect(screen.getByTestId("scenario-card-1")).toBeInTheDocument();
    expect(screen.getByText("EU High Risk")).toBeInTheDocument();
  });

  it("shows a loading spinner while scenarios load", () => {
    mockScenariosLoading = true;
    renderWithProviders(<ScenarioBuilder />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows an empty state when there are no scenarios", () => {
    mockScenarios = [];
    renderWithProviders(<ScenarioBuilder />);

    expect(screen.getByText("No governance scenarios available.")).toBeInTheDocument();
  });

  it("selects a scenario, calling updatePreferences", () => {
    renderWithProviders(<ScenarioBuilder />);

    fireEvent.click(screen.getByText("select-1"));

    expect(mockUpdatePreferencesMutate).toHaveBeenCalledWith({ selected_scenario_id: 1 });
  });

  it("opens the create scenario modal", () => {
    renderWithProviders(<ScenarioBuilder />);

    fireEvent.click(screen.getByRole("button", { name: "New Scenario" }));

    expect(screen.getByText("New Scenario", { selector: "h2, [id]" })).toBeInTheDocument();
  });

  it("opens the edit scenario modal pre-filled", () => {
    renderWithProviders(<ScenarioBuilder />);

    fireEvent.click(screen.getByText("edit-1"));

    expect(screen.getByText("Edit Scenario")).toBeInTheDocument();
  });

  it("opens the delete confirmation and deletes on confirm", () => {
    renderWithProviders(<ScenarioBuilder />);

    fireEvent.click(screen.getByText("delete-1"));
    expect(screen.getByText("Delete Scenario")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mockDeleteScenarioMutate).toHaveBeenCalledWith(1);
  });

  it("opens the activation wizard and activates a scenario", () => {
    renderWithProviders(<ScenarioBuilder />);

    fireEvent.click(screen.getByText("activate-1"));
    expect(screen.getByTestId("activation-wizard")).toBeInTheDocument();

    fireEvent.click(screen.getByText("confirm-activate"));
    expect(mockActivateScenarioMutate).toHaveBeenCalledWith(
      { id: 1, body: { projectIds: [1], ownerAssignments: {} } },
      expect.any(Object),
    );
  });

  it("shows recommendation results when the recommendation mutation returns data", () => {
    mockRecommendData = [{ scenario: baseScenario, score: 0.8, matchedRules: ["industry"] }];
    renderWithProviders(<ScenarioBuilder />);

    expect(screen.getByText("Recommended Scenarios")).toBeInTheDocument();
  });

  it("shows a no-matches alert when recommendations return empty", () => {
    mockRecommendData = [];
    renderWithProviders(<ScenarioBuilder />);

    expect(
      screen.getByText(/No strong matches found\. Try adjusting your criteria/),
    ).toBeInTheDocument();
  });

  it("disables the Get Recommendations button until a filter is chosen", () => {
    renderWithProviders(<ScenarioBuilder />);

    expect(screen.getByRole("button", { name: "Get Recommendations" })).toBeDisabled();
  });

  it("renders the active scenario panel with the selected scenario", () => {
    mockPreferences = { selected_scenario_id: 1 };
    renderWithProviders(<ScenarioBuilder />);

    expect(screen.getByTestId("active-scenario-panel")).toBeInTheDocument();
    expect(screen.getByText("activate-active")).toBeInTheDocument();
  });
});
