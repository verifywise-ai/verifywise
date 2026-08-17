import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const coverageItem = {
  framework_id: 1,
  framework_name: "EU AI Act",
  total_controls: 10,
  mapped_controls: 6,
  coverage_percentage: 60,
  gap_details: { unmapped_controls: ["A1", "A2"] },
  synergy_details: { multi_framework_controls: ["A3"] },
};

let mockContextValue: any = { projects: [], userId: 1, organizationId: 1 };

vi.mock("../../../../application/contexts/VerifyWise.context", () => ({
  VerifyWiseContext: {
    get _currentValue() {
      return mockContextValue;
    },
    Provider: ({ children }: any) => children,
    Consumer: ({ children }: any) => children(mockContextValue),
  },
}));

let mockCoverage: any[] | undefined = undefined;
let mockCoverageLoading = false;
const mockRefreshMutate = vi.fn();
let mockRefreshPending = false;
let mockScenarios: any[] = [];
let mockPreferences: any = null;

vi.mock("../../../../application/hooks/useGovernanceOs", () => ({
  useCoverage: () => ({ data: mockCoverage, isLoading: mockCoverageLoading }),
  useRefreshCoverage: () => ({ mutate: mockRefreshMutate, isPending: mockRefreshPending }),
  useScenarios: () => ({ data: mockScenarios }),
  useGovernancePreferences: () => ({ data: mockPreferences }),
}));

const mockCreateTask = vi.fn();
vi.mock("../../../../application/repository/task.repository", () => ({
  createTask: (...args: any[]) => mockCreateTask(...args),
}));

vi.mock("../../../components/GovernanceOS/CoverageChart", () => ({
  default: ({ coverage, onCreateTaskForGap, onCreateTasksForGaps }: any) => (
    <div data-testid="coverage-chart">
      <span data-testid="coverage-count">{coverage.length}</span>
      <button onClick={() => onCreateTaskForGap("EU AI Act", "A1")}>create-gap-task</button>
      <button onClick={() => onCreateTasksForGaps("EU AI Act", ["A1", "A2"])}>
        create-bulk-gap-task
      </button>
    </div>
  ),
}));

vi.mock("../../../components/GovernanceOS/MappingStatsPanel", () => ({
  default: ({ projectId }: any) => (
    <div data-testid="mapping-stats-panel">stats-{projectId}</div>
  ),
}));

vi.mock("../../../components/Modals/CreateTask", () => ({
  default: ({ isOpen, onSuccess }: any) =>
    isOpen ? (
      <div data-testid="create-task-modal">
        <button onClick={() => onSuccess({ title: "test", entity_links: [] })}>
          submit-task
        </button>
      </div>
    ) : null,
}));

import UnifiedInsights from "../UnifiedInsights";

describe("UnifiedInsights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContextValue = { projects: [{ id: 3, project_title: "Project A" }], userId: 1, organizationId: 1 };
    mockCoverage = undefined;
    mockCoverageLoading = false;
    mockRefreshPending = false;
    mockScenarios = [];
    mockPreferences = null;
  });

  it("shows an empty state when no project is selected", () => {
    renderWithProviders(<UnifiedInsights />);

    expect(
      screen.getByText("Select a project to view its cross-framework coverage analysis."),
    ).toBeInTheDocument();
  });

  it("renders summary stats and the coverage chart once a project is selected", async () => {
    mockCoverage = [coverageItem];
    renderWithProviders(<UnifiedInsights />);

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Project A" }));

    await waitFor(() => {
      expect(screen.getByTestId("coverage-chart")).toBeInTheDocument();
    });

    expect(screen.getByText("Average Coverage")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("Mapped Controls")).toBeInTheDocument();
    expect(screen.getByTestId("mapping-stats-panel")).toHaveTextContent("stats-3");
  });

  it("shows a loading spinner while coverage loads", async () => {
    mockCoverageLoading = true;
    renderWithProviders(<UnifiedInsights />);

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Project A" }));

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows the active scenario banner when a scenario is selected", async () => {
    mockScenarios = [{ id: 9, name: "EU High Risk", priority_order: { primary: 1 } }];
    mockPreferences = { selected_scenario_id: 9 };
    mockCoverage = [coverageItem];

    renderWithProviders(<UnifiedInsights />);

    expect(screen.getByText(/Coverage aligned with active scenario/)).toBeInTheDocument();
    expect(screen.getByText("EU High Risk")).toBeInTheDocument();
  });

  it("refreshes coverage when the refresh button is clicked", async () => {
    mockCoverage = [coverageItem];
    renderWithProviders(<UnifiedInsights />);

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Project A" }));

    fireEvent.click(await screen.findByRole("button", { name: "Refresh Coverage" }));
    expect(mockRefreshMutate).toHaveBeenCalledWith(3);
  });

  it("opens the create task modal for a single gap and submits it", async () => {
    mockCoverage = [coverageItem];
    renderWithProviders(<UnifiedInsights />);

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Project A" }));

    fireEvent.click(await screen.findByText("create-gap-task"));
    expect(screen.getByTestId("create-task-modal")).toBeInTheDocument();

    mockCreateTask.mockResolvedValue({ data: { id: 42 } });
    fireEvent.click(screen.getByText("submit-task"));

    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText("Task created successfully")).toBeInTheDocument();
    });
  });

  it("shows an error alert when task creation fails", async () => {
    mockCoverage = [coverageItem];
    mockCreateTask.mockRejectedValue(new Error("boom"));

    renderWithProviders(<UnifiedInsights />);

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Project A" }));

    fireEvent.click(await screen.findByText("create-bulk-gap-task"));
    fireEvent.click(screen.getByText("submit-task"));

    await waitFor(() => {
      expect(screen.getByText("Failed to create task. Please try again.")).toBeInTheDocument();
    });
  });
});
