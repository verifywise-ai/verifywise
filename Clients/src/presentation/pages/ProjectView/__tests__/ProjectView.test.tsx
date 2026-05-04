import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock hooks
vi.mock("../../../../application/hooks/useProjectData", () => ({
  default: () => ({
    project: null,
  }),
}));

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userRoleName: "Admin",
  }),
}));

// Mock contexts
vi.mock("../../../../application/contexts/PluginRegistry.context", () => ({
  usePluginRegistry: () => ({
    getComponentsForSlot: () => [],
  }),
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

vi.mock("../../../../domain/constants/pluginSlots", () => ({
  PLUGIN_SLOTS: {
    USE_CASE_OVERVIEW: "use-case-overview",
    USE_CASE_RISKS: "use-case-risks",
    USE_CASE_MODELS: "use-case-models",
    USE_CASE_FRAMEWORKS: "use-case-frameworks",
    USE_CASE_CE_MARKING: "use-case-ce-marking",
    USE_CASE_ACTIVITY: "use-case-activity",
    USE_CASE_MONITORING: "use-case-monitoring",
    USE_CASE_SETTINGS: "use-case-settings",
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

// Mock react-router-dom
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams("projectId=1"), vi.fn()],
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
});
