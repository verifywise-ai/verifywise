import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock all hooks used by IntegratedDashboard
const mockFetchDashboard = vi.fn();
const mockNavigateSearch = vi.fn();

vi.mock("../../../../application/hooks/useDashboard", () => ({
  useDashboard: () => ({
    dashboard: mockDashboardData,
    loading: false,
    fetchDashboard: mockFetchDashboard,
  }),
}));

vi.mock("../../../../application/hooks/useDashboardMetrics", () => ({
  useDashboardMetrics: () => mockMetricsData,
  hasDashboardCache: () => mockHasCache,
}));

let mockPreferences: any = { data: undefined, isLoading: false };
const mockSaveLayout = vi.fn();

vi.mock("../../../../application/hooks/useDashboardPreferences", () => ({
  useDashboardPreferences: () => mockPreferences,
  useUpdateDashboardPreferences: () => ({ mutateAsync: mockSaveLayout }),
}));

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userToken: { name: "Test User" },
    userId: 1,
  }),
}));

vi.mock("../../../../application/hooks/useNavigateSearch", () => ({
  default: () => mockNavigateSearch,
}));

vi.mock("../../../../application/utils/dateFormatter", () => ({
  formatRelativeDate: (d: string) => d,
}));

// Lifecycle widgets have their own tests (UseCaseLifecycleWidgets.test.tsx).
vi.mock("../UseCaseLifecycleWidgets", () => ({
  default: () => <div data-testid="use-case-lifecycle-widgets" />,
}));

// Mock child components that are complex
vi.mock("../../../components/breadcrumbs/PageBreadcrumbs", () => ({
  PageBreadcrumbs: () => <div data-testid="breadcrumbs" />,
}));

vi.mock("../../../components/PageTour", () => ({
  default: () => null,
}));

vi.mock("../DashboardSteps", () => ({
  default: [],
}));

vi.mock("../../../components/MegaDropdown/AddNewMegaDropdown", () => ({
  default: () => <div data-testid="mega-dropdown" />,
}));

vi.mock("../../../components/MegaDropdown/MegaDropdownErrorBoundary", () => ({
  default: ({ children }: any) => <>{children}</>,
}));

vi.mock("../../../components/Dashboard/DashboardErrorBoundary", () => ({
  default: ({ children }: any) => <>{children}</>,
}));

vi.mock("../../../components/Modals/ChangeOrganizationName", () => ({
  default: () => <div data-testid="org-name-modal" />,
}));

vi.mock("../../../components/StepProgressDialog", () => ({
  StepProgressDialog: ({ open }: any) => (open ? <div data-testid="step-progress-dialog" /> : null),
}));

vi.mock("../../../components/button-toggle", () => ({
  ButtonToggle: ({ options, value, onChange }: any) => (
    <div data-testid="view-toggle">
      {options.map((opt: any) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          data-active={opt.value === value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("../../../components/Cards/DashboardHeaderCard", () => ({
  DashboardHeaderCard: ({ title, count }: any) => (
    <div data-testid={`header-card-${title.toLowerCase()}`}>
      {title}: {count}
    </div>
  ),
}));

vi.mock("../../../components/Cards/DashboardCard", () => ({
  DashboardCard: ({ title, children }: any) => (
    <div data-testid={`card-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      {title}
      {children}
    </div>
  ),
}));

vi.mock("../../../components/Cards/TaskRadarCard", () => ({
  TaskRadarCard: ({ overdue, due, upcoming }: any) => (
    <div data-testid="task-radar">
      Task Radar: {overdue}/{due}/{upcoming}
    </div>
  ),
}));

vi.mock("../../../components/Charts/RiskDonutWithLegend", () => ({
  RiskDonutWithLegend: () => <div data-testid="risk-donut" />,
}));

vi.mock("../../../components/Charts/NewMetricsCards", () => ({
  TrainingCompletionCard: () => <div data-testid="training-completion" />,
  PolicyStatusCard: () => <div data-testid="policy-status" />,
  IncidentStatusCard: () => <div data-testid="incident-status" />,
  EvidenceCoverageCard: () => <div data-testid="evidence-coverage" />,
  ModelLifecycleCard: () => <div data-testid="model-lifecycle" />,
}));

vi.mock("../../../components/Charts/GovernanceScoreCard", () => ({
  GovernanceScoreCard: () => <div data-testid="governance-score" />,
}));

vi.mock("../../../components/Table/UseCasesTable", () => ({
  default: ({ data }: any) => (
    <div data-testid="use-cases-table">
      {data.map((d: any) => (
        <div key={d.id}>{d.name}</div>
      ))}
    </div>
  ),
}));

vi.mock("../../../components/EmptyStateMessage", () => ({
  EmptyStateMessage: ({ message }: any) => <div data-testid="empty-state">{message}</div>,
}));

vi.mock("../../../components/ActivityItem", () => ({
  default: ({ title }: any) => <div data-testid="activity-item">{title}</div>,
}));

vi.mock("../constants", () => ({
  COLORS: { primary: "#13715B" },
  navIconButtonSx: {},
  getRiskLevelData: (d: any) => [{ name: "High", value: d.high, color: "red" }],
  getVendorRiskData: (d: any) => [{ name: "High", value: d.high, color: "red" }],
  getModelRiskData: (d: any) => [{ name: "High", value: d.high, color: "red" }],
  getNistStatusData: () => [],
  getCompletionData: () => [],
}));

// Mock react-router
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: "/", search: "", hash: "", state: null, key: "default" }),
  };
});

// --- Test data ---

let mockDashboardData: any = {
  projects: 2,
  trainings: 3,
  models: 5,
  reports: 1,
  task_radar: { overdue: 1, due: 2, upcoming: 3 },
  projects_list: [
    {
      id: 1,
      project_title: "AI Chatbot",
      framework: [{ name: "EU AI Act" }],
      totalSubcontrols: 10,
      doneSubcontrols: 5,
      status: "Active",
      last_updated: "2026-02-01",
    },
  ],
};

const mockMetricsData: any = {
  riskMetrics: { total: 10, distribution: { high: 3, medium: 5, low: 2, resolved: 0 }, recent: [] },
  evidenceMetrics: { total: 5, recent: [] },
  vendorRiskMetrics: {
    total: 4,
    distribution: { veryHigh: 0, high: 1, medium: 2, low: 1, veryLow: 0 },
    recent: [],
  },
  vendorMetrics: { total: 3, recent: [] },
  policyMetrics: { total: 7, pendingReviewCount: 2, recent: [] },
  incidentMetrics: { total: 2, openCount: 1, recent: [] },
  modelRiskMetrics: {
    total: 6,
    distribution: { critical: 1, high: 2, medium: 2, low: 1 },
    recent: [],
  },
  trainingMetrics: {
    total: 3,
    distribution: { planned: 1, inProgress: 1, completed: 1 },
    completionPercentage: 33,
    totalPeople: 50,
  },
  policyStatusMetrics: {
    total: 7,
    distribution: {
      draft: 2,
      underReview: 1,
      approved: 3,
      published: 1,
      archived: 0,
      deprecated: 0,
    },
  },
  incidentStatusMetrics: {
    total: 2,
    distribution: {
      open: 1,
      investigating: 1,
      mitigated: 0,
      closed: 0,
      suspended: 0,
      emergencyAction: 0,
    },
  },
  evidenceHubMetrics: {
    total: 10,
    totalFiles: 20,
    modelsWithEvidence: 3,
    totalModels: 5,
    coveragePercentage: 60,
  },
  modelLifecycleMetrics: {
    total: 5,
    distribution: { pending: 2, approved: 2, restricted: 1, blocked: 0 },
  },
  organizationalFrameworks: [],
  taskMetrics: { total: 8, recent: [] },
  useCaseMetrics: { total: 2, recent: [] },
  governanceScoreMetrics: { score: 78.5, modules: [{ name: "Risk", score: 85, weight: 0.3 }] },
  loading: false,
  isRevalidating: false,
  error: null,
  progressStep: 5,
  progressSteps: [
    { label: "Loading risks...", progress: 15 },
    { label: "Loading vendors...", progress: 40 },
    { label: "Loading models...", progress: 60 },
    { label: "Loading frameworks...", progress: 80 },
    { label: "Calculating scores...", progress: 100 },
  ],
};

let mockHasCache = true;

// Import the component under test
import IntegratedDashboard from "../IntegratedDashboard";

describe("IntegratedDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockHasCache = true;
    mockPreferences = { data: undefined, isLoading: false };
    mockSaveLayout.mockResolvedValue(undefined);
    // Suppress React "not wrapped in act(...)" warnings from async state updates
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render Dashboard heading", () => {
    renderWithProviders(<IntegratedDashboard />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("should render view toggle buttons (Operations / Executive)", () => {
    renderWithProviders(<IntegratedDashboard />);
    expect(screen.getByText("Operations view")).toBeInTheDocument();
    expect(screen.getByText("Executive view")).toBeInTheDocument();
  });

  it("should render quick stats header cards", () => {
    renderWithProviders(<IntegratedDashboard />);
    expect(screen.getByTestId("header-card-models")).toBeInTheDocument();
    expect(screen.getByTestId("header-card-vendors")).toBeInTheDocument();
    expect(screen.getByTestId("header-card-policies")).toBeInTheDocument();
    expect(screen.getByTestId("header-card-trainings")).toBeInTheDocument();
    expect(screen.getByTestId("header-card-incidents")).toBeInTheDocument();
  });

  it("should render task radar card", () => {
    renderWithProviders(<IntegratedDashboard />);
    expect(screen.getByTestId("task-radar")).toBeInTheDocument();
    expect(screen.getByText("Task Radar: 1/2/3")).toBeInTheDocument();
  });

  it("should render use cases table with project list", () => {
    renderWithProviders(<IntegratedDashboard />);
    expect(screen.getByTestId("use-cases-table")).toBeInTheDocument();
    expect(screen.getByText("AI Chatbot")).toBeInTheDocument();
  });

  it("should render governance score card when metrics available", () => {
    renderWithProviders(<IntegratedDashboard />);
    expect(screen.getByTestId("governance-score")).toBeInTheDocument();
  });

  it("should show empty state when no projects", () => {
    mockDashboardData = {
      ...mockDashboardData,
      projects_list: [],
    };

    renderWithProviders(<IntegratedDashboard />);

    const emptyStates = screen.getAllByTestId("empty-state");
    const messages = emptyStates.map((el) => el.textContent);
    expect(messages).toContain("No use cases created yet");

    // Restore
    mockDashboardData.projects_list = [
      {
        id: 1,
        project_title: "AI Chatbot",
        framework: [{ name: "EU AI Act" }],
        totalSubcontrols: 10,
        doneSubcontrols: 5,
        status: "Active",
        last_updated: "2026-02-01",
      },
    ];
  });

  it("should show progress dialog during cold load (no cache)", () => {
    mockHasCache = false;
    // Set metrics loading to true
    const originalLoading = mockMetricsData.loading;
    mockMetricsData.loading = true;

    renderWithProviders(<IntegratedDashboard />);

    expect(screen.getByTestId("step-progress-dialog")).toBeInTheDocument();

    // Restore
    mockMetricsData.loading = originalLoading;
    mockHasCache = true;
  });

  it("should not show progress dialog when cache exists", () => {
    mockHasCache = true;

    renderWithProviders(<IntegratedDashboard />);

    expect(screen.queryByTestId("step-progress-dialog")).not.toBeInTheDocument();
  });

  describe("per-user layout", () => {
    const entry = (widgetKey: string, position: number, visible = true) => ({
      widgetKey,
      visible,
      position,
    });
    const isBefore = (first: HTMLElement, second: HTMLElement) =>
      Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

    const expectDefaultLayout = () => {
      expect(screen.getByTestId("header-card-models")).toBeInTheDocument();
      expect(screen.getByTestId("task-radar")).toBeInTheDocument();
      expect(screen.getByTestId("card-model-risks")).toBeInTheDocument();
      expect(
        isBefore(screen.getByTestId("task-radar"), screen.getByTestId("card-model-risks")),
      ).toBe(true);
    };

    it("uses the default layout when there is no saved row", () => {
      mockPreferences = { data: { layout: null, updated_at: null }, isLoading: false };
      renderWithProviders(<IntegratedDashboard />);
      expectDefaultLayout();
    });

    it("uses the default layout when the fetch failed", () => {
      mockPreferences = { data: undefined, isLoading: false, isError: true };
      renderWithProviders(<IntegratedDashboard />);
      expectDefaultLayout();
    });

    it("ignores unknown saved keys without crashing", () => {
      mockPreferences = {
        data: { layout: [entry("operations.gone-widget", 0), entry("nonsense", 1)] },
        isLoading: false,
      };
      renderWithProviders(<IntegratedDashboard />);
      expectDefaultLayout();
    });

    it("hides and reorders widgets from the saved layout", () => {
      mockPreferences = {
        data: {
          layout: [
            entry("operations.model-risks", 0),
            entry("operations.task-radar", 1, false),
            entry("operations.quick-stats", 2),
          ],
        },
        isLoading: false,
      };
      renderWithProviders(<IntegratedDashboard />);
      expect(screen.queryByTestId("task-radar")).not.toBeInTheDocument();
      expect(
        isBefore(screen.getByTestId("card-model-risks"), screen.getByTestId("header-card-models")),
      ).toBe(true);
    });

    it("still shows a widget missing from the saved layout", () => {
      mockPreferences = {
        data: { layout: [entry("operations.quick-stats", 0)] },
        isLoading: false,
      };
      renderWithProviders(<IntegratedDashboard />);
      expect(screen.getByTestId("card-model-risks")).toBeInTheDocument();
    });

    it("keeps the two views apart", async () => {
      mockPreferences = {
        data: { layout: [entry("executive.task-radar", 0, false)] },
        isLoading: false,
      };
      renderWithProviders(<IntegratedDashboard />);
      expect(screen.getByTestId("task-radar")).toBeInTheDocument();

      await userEvent.click(screen.getByText("Executive view"));
      expect(screen.queryByTestId("task-radar")).not.toBeInTheDocument();
    });

    it("says so when every widget is hidden", () => {
      const layout = [
        "quick-stats",
        "task-radar",
        "incident-status",
        "evidence-coverage",
        "governance-score",
        "use-case-risks",
        "vendor-risks",
        "model-risks",
        "recent-use-cases",
        "recent-activity",
        "use-case-lifecycle",
        "training-status",
        "policy-status",
        "model-lifecycle",
      ].map((key, i) => entry(`operations.${key}`, i, false));
      mockPreferences = { data: { layout }, isLoading: false };
      renderWithProviders(<IntegratedDashboard />);
      expect(screen.getByTestId("empty-state")).toHaveTextContent(
        "All widgets are hidden. Use Edit layout to show them.",
      );
    });

    it("waits for the layout before drawing, so widgets do not jump", () => {
      mockPreferences = { data: undefined, isLoading: true };
      renderWithProviders(<IntegratedDashboard />);
      expect(screen.queryByTestId("task-radar")).not.toBeInTheDocument();
    });

    it("saves the edited view through the update hook", async () => {
      const user = userEvent.setup();
      mockPreferences = {
        data: { layout: [entry("executive.task-radar", 0, false)] },
        isLoading: false,
      };
      renderWithProviders(<IntegratedDashboard />);

      await user.click(screen.getByRole("button", { name: "Edit layout" }));
      await user.click(screen.getByRole("switch", { name: "Show Task radar" }));
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(mockSaveLayout).toHaveBeenCalledTimes(1));
      const saved = mockSaveLayout.mock.calls[0][0]([entry("executive.task-radar", 0, false)]);
      expect(saved).toContainEqual(entry("executive.task-radar", 0, false));
      const radar = saved.find((e: any) => e.widgetKey === "operations.task-radar");
      expect(radar.visible).toBe(false);
      const positions = saved.map((e: any) => e.position);
      expect(new Set(positions).size).toBe(positions.length);
      await waitFor(() => expect(screen.queryByText("Reset to default")).not.toBeInTheDocument());
    });
  });

  it("should render Dashboard heading text", () => {
    renderWithProviders(<IntegratedDashboard />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });
});
