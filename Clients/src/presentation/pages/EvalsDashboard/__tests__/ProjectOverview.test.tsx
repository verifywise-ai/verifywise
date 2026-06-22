import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual: any = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

let mockUserRoleName = "Admin";
let mockIsSuperAdmin = false;

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userRoleName: mockUserRoleName,
    userId: 1,
    isSuperAdmin: mockIsSuperAdmin,
    activeOrganizationId: null,
  }),
}));

const mockGetProject = vi.fn();
const mockGetExperiments = vi.fn();
const mockGetLogs = vi.fn();
const mockGetMonitorDashboard = vi.fn();

vi.mock("../../../../application/repository/deepEval.repository", () => ({
  getProject: (...args: any[]) => mockGetProject(...args),
  getExperiments: (...args: any[]) => mockGetExperiments(...args),
  getLogs: (...args: any[]) => mockGetLogs(...args),
  getMonitorDashboard: (...args: any[]) => mockGetMonitorDashboard(...args),
}));

vi.mock("../../../components/Layout/PageHeader", () => ({
  PageHeader: ({ title }: any) => <div data-testid="page-header">{title}</div>,
}));

vi.mock("../../../components/HelperIcon", () => ({
  default: () => <div data-testid="helper-icon" />,
}));

vi.mock("../../../components/TipBox", () => ({
  default: () => <div data-testid="tip-box" />,
}));

vi.mock("../../../components/button/customizable-button", () => ({
  CustomizableButton: ({ text, onClick, isDisabled, icon }: any) => (
    <button data-testid="customizable-button" onClick={onClick} disabled={isDisabled}>
      {icon}
      {text}
    </button>
  ),
}));

vi.mock("../../../components/Table/ExperimentTable", () => ({
  default: ({ rows, onRowClick }: any) => (
    <div data-testid="experiment-table">
      <span data-testid="table-row-count">{rows.length}</span>
      <button data-testid="table-row-click" onClick={() => onRowClick?.(rows[0])}>
        view experiment
      </button>
    </div>
  ),
}));

vi.mock("../NewExperimentModal", () => ({
  default: ({ isOpen }: any) => <div data-testid="new-experiment-modal" data-open={isOpen} />,
}));

import ProjectOverview from "../ProjectOverview";
import type {
  Experiment,
  EvaluationLog,
  MonitorDashboard,
} from "../../../../application/repository/deepEval.repository";
import type { DeepEvalProject } from "../types";

const mockProject: DeepEvalProject = {
  id: "proj-1",
  name: "Test Project",
  description: "A test project",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
  createdBy: "user-1",
  useCase: "chatbot",
};

const mockExperiments: Experiment[] = [
  {
    id: "exp-1",
    project_id: "proj-1",
    name: "Experiment 1",
    config: {
      model: { name: "gpt-4" },
      dataset: { name: "Test Dataset" },
      judgeLlm: { model: "gpt-4" },
    },
    status: "completed",
    results: { avg_scores: { accuracy: 0.95, relevance: 0.88 } },
    created_at: "2025-06-01T12:00:00Z",
    updated_at: "2025-06-01T12:00:00Z",
    tenant: "test",
  },
  {
    id: "exp-2",
    project_id: "proj-1",
    name: "Experiment 2",
    config: {
      model: { name: "gpt-4" },
      dataset: { name: "Test Dataset 2" },
      judgeLlm: { model: "gpt-4" },
    },
    status: "completed",
    results: { avg_scores: { accuracy: 0.92 } },
    created_at: "2025-06-02T12:00:00Z",
    updated_at: "2025-06-02T12:00:00Z",
    tenant: "test",
  },
];

const mockLogs: EvaluationLog[] = [
  {
    id: "log-1",
    project_id: "proj-1",
    latency_ms: 150,
    token_count: 500,
    timestamp: "2025-06-01T12:00:00Z",
    tenant: "test",
  },
  {
    id: "log-2",
    project_id: "proj-1",
    latency_ms: 200,
    token_count: 750,
    timestamp: "2025-06-01T12:00:00Z",
    tenant: "test",
  },
];

const mockDashboard: MonitorDashboard = {
  project_id: "proj-1",
  time_range: { start: "2025-01-01", end: "2025-06-01" },
  metrics: {},
  logs: { total: 2, success: 2, error: 0, error_rate: 0 },
  recent_experiments: [],
};

const defaultProps = {
  projectId: "proj-1",
  orgId: "org-1",
  project: mockProject,
  onProjectUpdate: vi.fn(),
};

describe("ProjectOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRoleName = "Admin";
    mockIsSuperAdmin = false;
    mockGetProject.mockResolvedValue({ project: mockProject });
    mockGetExperiments.mockResolvedValue({ experiments: mockExperiments });
    mockGetLogs.mockResolvedValue({ logs: mockLogs });
    mockGetMonitorDashboard.mockResolvedValue({ data: mockDashboard });
  });

  it("shows loading spinner initially", () => {
    mockGetExperiments.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<ProjectOverview {...defaultProps} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders stat cards and experiment table with data", async () => {
    renderWithProviders(<ProjectOverview {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Overview")).toBeInTheDocument();
    });

    expect(screen.getByTestId("page-header")).toBeInTheDocument();
    expect(screen.getByTestId("tip-box")).toBeInTheDocument();
    expect(screen.getByTestId("experiment-table")).toBeInTheDocument();
    expect(screen.getByTestId("table-row-count").textContent).toBe("2");

    expect(screen.getByText("Experiments")).toBeInTheDocument();
    expect(screen.getByText("Success rate")).toBeInTheDocument();
    expect(screen.getByText("Avg latency")).toBeInTheDocument();
    expect(screen.getByText("Avg score")).toBeInTheDocument();
    expect(screen.getByText("Total tokens")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();

    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("175ms")).toBeInTheDocument();

    expect(screen.getByText("Recent experiments")).toBeInTheDocument();
  });

  it("shows empty state when no experiments", async () => {
    mockGetExperiments.mockResolvedValue({ experiments: [] });
    mockGetLogs.mockResolvedValue({ logs: [] });
    mockGetMonitorDashboard.mockResolvedValue({
      data: {
        ...mockDashboard,
        metrics: {},
        logs: { total: 0, success: 0, error: 0, error_rate: 0 },
      },
    });

    renderWithProviders(<ProjectOverview {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("No experiments yet")).toBeInTheDocument();
    });

    expect(
      screen.getByText("Run your first experiment to start evaluating your LLM."),
    ).toBeInTheDocument();
    expect(screen.getByText("Run first experiment")).toBeInTheDocument();
    expect(screen.queryByTestId("experiment-table")).not.toBeInTheDocument();
  });

  it("shows 'No data' for metrics when no data available", async () => {
    mockGetExperiments.mockResolvedValue({ experiments: [] });
    mockGetLogs.mockResolvedValue({ logs: [] });
    mockGetMonitorDashboard.mockResolvedValue({
      data: {
        ...mockDashboard,
        metrics: {},
        logs: { total: 0, success: 0, error: 0, error_rate: 0 },
      },
    });

    renderWithProviders(<ProjectOverview {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getAllByText("No data").length).toBeGreaterThan(0);
    });
  });

  it("disables buttons for non-admin, non-editor roles", async () => {
    mockUserRoleName = "Auditor";

    renderWithProviders(<ProjectOverview {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Overview")).toBeInTheDocument();
    });

    const buttons = screen.getAllByTestId("customizable-button");
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it("enables buttons for admin role", async () => {
    renderWithProviders(<ProjectOverview {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Overview")).toBeInTheDocument();
    });

    const buttons = screen.getAllByTestId("customizable-button");
    buttons.forEach((btn) => {
      expect(btn).not.toBeDisabled();
    });
  });

  it("follows RBAC for super admins", async () => {
    mockUserRoleName = "Admin";
    mockIsSuperAdmin = true;

    renderWithProviders(<ProjectOverview {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Overview")).toBeInTheDocument();
    });

    const buttons = screen.getAllByTestId("customizable-button");
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it("calls onViewExperiment when provided and row is clicked", async () => {
    const onViewExperiment = vi.fn();

    renderWithProviders(<ProjectOverview {...defaultProps} onViewExperiment={onViewExperiment} />);

    await waitFor(() => {
      expect(screen.getByTestId("experiment-table")).toBeInTheDocument();
    });

    screen.getByTestId("table-row-click").click();
    expect(onViewExperiment).toHaveBeenCalledWith("exp-2");
  });

  it("navigates to experiment page when onViewExperiment is not provided and row clicked", async () => {
    renderWithProviders(<ProjectOverview {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId("experiment-table")).toBeInTheDocument();
    });

    screen.getByTestId("table-row-click").click();
    expect(mockNavigate).toHaveBeenCalledWith("/evals/proj-1/experiment/exp-2");
  });

  it("loads project data when project prop is null", async () => {
    const onProjectUpdate = vi.fn();

    renderWithProviders(
      <ProjectOverview {...defaultProps} project={null} onProjectUpdate={onProjectUpdate} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("experiment-table")).toBeInTheDocument();
    });

    expect(mockGetProject).toHaveBeenCalledWith("proj-1");
    expect(onProjectUpdate).toHaveBeenCalledWith(mockProject);
  });

  it("does not call getProject when project prop is provided", async () => {
    renderWithProviders(<ProjectOverview {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId("experiment-table")).toBeInTheDocument();
    });

    expect(mockGetProject).not.toHaveBeenCalled();
  });

  it("handles API errors gracefully", async () => {
    mockGetExperiments.mockRejectedValue(new Error("API error"));
    mockGetLogs.mockRejectedValue(new Error("API error"));
    mockGetMonitorDashboard.mockRejectedValue(new Error("API error"));

    renderWithProviders(<ProjectOverview {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Overview")).toBeInTheDocument();
    });

    expect(screen.getByText("No experiments yet")).toBeInTheDocument();
  });

  it("opens new experiment modal when button clicked", async () => {
    renderWithProviders(<ProjectOverview {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Overview")).toBeInTheDocument();
    });

    const buttons = screen.getAllByTestId("customizable-button");
    fireEvent.click(buttons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("new-experiment-modal")).toHaveAttribute("data-open", "true");
    });
  });
});
