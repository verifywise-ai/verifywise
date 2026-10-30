import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock hooks
const { projectDataMock, navigateMock } = vi.hoisted(() => ({
  projectDataMock: vi.fn(() => ({
    project: null as unknown,
    error: null as string | null,
    isLoading: true,
  })),
  navigateMock: vi.fn(),
}));

vi.mock("../../../../application/hooks/useProjectData", () => ({
  default: projectDataMock,
}));

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userRoleName: "Admin",
  }),
}));

// Mock contexts. renderWithProviders now mounts <ExtensionsProvider> so
// the mock must re-export it (as a passthrough that just renders children).
vi.mock("../../../../application/contexts/Extensions.context", () => ({
  useExtensions: () => ({ isEnabled: () => false }),
  ExtensionsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../../Extensions/jira-assets/JiraUseCaseOverview", () => ({
  JiraUseCaseOverview: () => null,
}));
vi.mock("../../Extensions/jira-assets/JiraUseCaseMonitoring", () => ({
  JiraUseCaseMonitoring: () => null,
}));
vi.mock("../../Extensions/jira-assets/JiraUseCaseSettings", () => ({
  JiraUseCaseSettings: () => null,
}));

// Mock repositories
vi.mock("../../../../application/repository/projectRisk.repository", () => ({
  getAllProjectRisksByProjectId: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock("../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock("../../../../infrastructure/api/networkServices", () => ({
  apiServices: {},
}));

// Mock constants
vi.mock("../../../../application/constants/permissions", () => ({
  default: {
    projects: { edit: ["Admin"] },
  },
}));

// Mock child components
vi.mock("../V1.0ProjectView/Overview", () => ({
  default: () => <div data-testid="project-overview" />,
}));
vi.mock("../V1.0ProjectView/ProjectRisks", () => ({
  default: () => <div data-testid="project-risks" />,
}));
vi.mock("../V1.0ProjectView/LinkedModels", () => ({
  default: () => <div data-testid="linked-models" />,
}));
vi.mock("../ProjectSettings", () => ({
  default: () => <div data-testid="project-settings" />,
}));
vi.mock("../ProjectFrameworks", () => ({
  default: () => <div data-testid="project-frameworks" />,
}));
vi.mock("../CEMarking", () => ({
  default: () => <div data-testid="ce-marking" />,
}));
vi.mock("../Activity", () => ({
  default: () => <div data-testid="activity" />,
}));
vi.mock("../PostMarketMonitoring", () => ({
  default: () => <div data-testid="post-market-monitoring" />,
}));
vi.mock("../Fria", () => ({
  default: () => <div data-testid="fria" />,
}));
vi.mock("../../../components/Skeletons", () => ({
  default: () => <div data-testid="skeleton" />,
}));
vi.mock("../../../components/Toast", () => ({
  default: () => <div data-testid="toast" />,
}));
vi.mock("../../../components/breadcrumbs/PageBreadcrumbs", () => ({
  PageBreadcrumbs: () => <div data-testid="breadcrumbs" />,
}));
vi.mock("../../../components/breadcrumbs/routeMapping", () => ({
  getRouteIcon: () => null,
}));
vi.mock("../../../components/TabBar", () => ({
  default: () => <div data-testid="tab-bar" />,
}));

// Mock react-router
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams("projectId=1"), vi.fn()],
    useNavigate: () => navigateMock,
  };
});

import VWProjectView from "../V1.0ProjectView/index";

describe("ProjectView (VWProjectView)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<VWProjectView />, {
      route: "/project-view?projectId=1",
    });
    expect(container).toBeTruthy();
  });

  it("shows a way back when the use case cannot be loaded", () => {
    projectDataMock.mockReturnValue({
      project: null,
      error: "Failed to fetch project #1: Request failed with status code 404",
      isLoading: false,
    });
    renderWithProviders(<VWProjectView />, { route: "/project-view?projectId=1" });

    expect(screen.getByText(/This use case could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByTestId("tab-bar")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to use cases" }));
    expect(navigateMock).toHaveBeenCalledWith("/overview");
  });

  it("keeps the skeletons while the use case is still loading", () => {
    projectDataMock.mockReturnValue({ project: null, error: null, isLoading: true });
    renderWithProviders(<VWProjectView />, { route: "/project-view?projectId=1" });

    expect(screen.queryByText(/This use case could not be loaded/)).not.toBeInTheDocument();
    expect(screen.getByTestId("tab-bar")).toBeInTheDocument();
  });

  it("titles the page with the use case ID and name", () => {
    projectDataMock.mockReturnValue({
      project: { id: 1, uc_id: "UC-7", project_title: "Resume screening" },
      error: null,
      isLoading: false,
    });
    renderWithProviders(<VWProjectView />, { route: "/project-view?projectId=1" });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("UC-7: Resume screening");
  });
});
