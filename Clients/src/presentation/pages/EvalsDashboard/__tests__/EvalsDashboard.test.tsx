import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock the deepEval repository
vi.mock("../../../../application/repository/deepEval.repository", () => ({
  getAllProjects: vi.fn().mockResolvedValue([]),
  getProject: vi.fn().mockResolvedValue(null),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  getAllExperiments: vi.fn().mockResolvedValue([]),
  getExperiment: vi.fn(),
  listMyDatasets: vi.fn().mockResolvedValue([]),
  listScorers: vi.fn().mockResolvedValue([]),
  listArenaComparisons: vi.fn().mockResolvedValue([]),
  getAllOrgs: vi.fn().mockResolvedValue([{ id: "org-1", name: "Test Org" }]),
  createOrg: vi.fn().mockResolvedValue({ org: { id: "org-1", name: "Test Org" } }),
  setCurrentOrg: vi.fn().mockResolvedValue(undefined),
  getCurrentOrg: vi.fn().mockResolvedValue({ id: "org-1", name: "Test Org" }),
  getProjectsForOrg: vi.fn().mockResolvedValue([]),
  addProjectToOrg: vi.fn(),
  getAllLlmApiKeys: vi.fn().mockResolvedValue([]),
  deleteLlmApiKey: vi.fn(),
  addLlmApiKey: vi.fn(),
  verifyLlmApiKey: vi.fn(),
}));

// Mock evalModelsService
vi.mock("../../../../infrastructure/api/evalModelsService", () => ({
  evalModelsService: {
    list: vi.fn().mockResolvedValue([]),
  },
}));

// Mock useAuth hook
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userRoleName: "Admin",
    userToken: { name: "Test User" },
    userId: 1,
  }),
}));

// Mock EvalsSidebar context with all required methods
vi.mock("../../../../application/contexts/EvalsSidebar.context", () => ({
  useEvalsSidebarContext: () => ({
    activeTab: "overview",
    setActiveTab: vi.fn(),
    experimentsCount: 0,
    setExperimentsCount: vi.fn(),
    datasetsCount: 0,
    setDatasetsCount: vi.fn(),
    scorersCount: 0,
    setScorersCount: vi.fn(),
    modelsCount: 0,
    setModelsCount: vi.fn(),
    arenaCount: 0,
    setArenaCount: vi.fn(),
    disabled: false,
    setDisabled: vi.fn(),
    recentExperiments: [],
    setRecentExperiments: vi.fn(),
    recentProjects: [],
    setRecentProjects: vi.fn(),
    onExperimentClick: undefined,
    setOnExperimentClick: vi.fn(),
    onProjectClick: undefined,
    setOnProjectClick: vi.fn(),
    currentProject: null,
    setCurrentProject: vi.fn(),
    allProjects: [],
    setAllProjects: vi.fn(),
    onProjectChange: undefined,
    setOnProjectChange: vi.fn(),
  }),
}));

// Mock permissions
vi.mock("../../../../application/constants/permissions", () => ({
  default: {
    evals: {
      manageApiKeys: ["Admin"],
    },
  },
}));

// Mock env vars
vi.mock("../../../../../env.vars", () => ({
  ENV_VARs: {
    VITE_APP_API_URL: "http://localhost:3000",
  },
}));

// Mock SVG imports
vi.mock("../../../assets/icons/openai_logo.svg", () => ({
  ReactComponent: () => <svg data-testid="openai-logo" />,
}));
vi.mock("../../../assets/icons/anthropic_logo.svg", () => ({
  ReactComponent: () => <svg data-testid="anthropic-logo" />,
}));
vi.mock("../../../assets/icons/gemini_logo.svg", () => ({
  ReactComponent: () => <svg data-testid="gemini-logo" />,
}));
vi.mock("../../../assets/icons/mistral_logo.svg", () => ({
  ReactComponent: () => <svg data-testid="mistral-logo" />,
}));
vi.mock("../../../assets/icons/xai_logo.svg", () => ({
  ReactComponent: () => <svg data-testid="xai-logo" />,
}));
vi.mock("../../../assets/icons/openrouter_logo.svg", () => ({
  ReactComponent: () => <svg data-testid="openrouter-logo" />,
}));
vi.mock("../../../assets/icons/ollama_logo.svg", () => ({
  ReactComponent: () => <svg data-testid="ollama-logo" />,
}));
vi.mock("../../../assets/icons/folder_filled.svg", () => ({
  ReactComponent: () => <svg data-testid="folder-icon" />,
}));

// Mock child tab components
vi.mock("../ProjectsList", () => ({
  default: () => <div data-testid="projects-list" />,
}));
vi.mock("../ProjectOverview", () => ({
  default: () => <div data-testid="project-overview" />,
}));
vi.mock("../ProjectExperiments", () => ({
  default: () => <div data-testid="project-experiments" />,
}));
vi.mock("../ProjectDatasets", () => ({
  ProjectDatasets: () => <div data-testid="project-datasets" />,
}));
vi.mock("../ProjectScorers", () => ({
  default: () => <div data-testid="project-scorers" />,
}));
vi.mock("../ModelsPage", () => ({
  default: () => <div data-testid="models-page" />,
}));
vi.mock("../ExperimentDetailContent", () => ({
  default: () => <div data-testid="experiment-detail" />,
}));
vi.mock("../ArenaPage", () => ({
  default: () => <div data-testid="arena-page" />,
}));
vi.mock("../BiasAuditsList", () => ({
  default: () => <div data-testid="bias-audits-list" />,
}));
vi.mock("../BiasAuditDetail", () => ({
  default: () => <div data-testid="bias-audit-detail" />,
}));
vi.mock("../ReportPage", () => ({
  default: () => <div data-testid="report-page" />,
}));

// Mock PageHeader and PageBreadcrumbs
vi.mock("../../../components/Layout/PageHeader", () => ({
  PageHeader: ({ title }: any) => <div data-testid="page-header">{title}</div>,
}));
vi.mock("../../../components/breadcrumbs/PageBreadcrumbs", () => ({
  PageBreadcrumbs: () => <div data-testid="breadcrumbs" />,
}));

// Mock StandardModal
vi.mock("../../../components/Modals/StandardModal", () => ({
  default: () => null,
}));

// Mock SelectableCard
vi.mock("../../../components/SelectableCard", () => ({
  default: ({ children }: any) => <div data-testid="selectable-card">{children}</div>,
}));

// Mock ConfirmationModal
vi.mock("../../../components/Dialogs/ConfirmationModal", () => ({
  default: () => null,
}));

import EvalsDashboard from "../EvalsDashboard";

describe("EvalsDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders without crashing", async () => {
    const { container } = renderWithProviders(<EvalsDashboard />, { route: "/evals" });

    // The component should render its root layout (breadcrumbs + content area)
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByTestId("breadcrumbs")).toBeInTheDocument();
  });
});
