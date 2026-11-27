import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock hooks
const { projectDataMock, navigateMock, searchParamsMock, euAiActWorkMock } = vi.hoisted(() => ({
  euAiActWorkMock: vi.fn(),
  searchParamsMock: { value: "projectId=1" },
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

vi.mock("../../../../application/repository/project.repository", () => ({
  getUseCaseEuAiActWork: euAiActWorkMock,
}));

vi.mock("../../../../infrastructure/api/networkServices", () => ({
  apiServices: {},
}));

// Mock constants
// Mock child components
vi.mock("../V1.0ProjectView/Overview", () => ({
  default: () => <div data-testid="project-overview" />,
}));
vi.mock("../V1.0ProjectView/Raci", () => ({
  default: () => <div data-testid="project-raci" />,
}));
vi.mock("../V1.0ProjectView/ProjectRisks", () => ({
  default: () => <div data-testid="project-risks" />,
}));
vi.mock("../V1.0ProjectView/LinkedModels", () => ({
  default: () => <div data-testid="linked-models" />,
}));
vi.mock("../ProjectSettings", () => ({
  default: ({ triggerRefresh }: { triggerRefresh: (isTrigger: boolean) => void }) => (
    <button data-testid="project-settings" onClick={() => triggerRefresh(true)}>
      Save settings
    </button>
  ),
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
vi.mock("../EuAiActOnlyNote", () => ({
  default: (props: { isOrganizational: boolean; workConfirmed: boolean }) => (
    <div
      data-testid="eu-ai-act-only-note"
      data-organizational={String(props.isOrganizational)}
      data-confirmed={String(props.workConfirmed)}
    />
  ),
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
  default: ({ tabs }: { tabs: Array<{ label: string }> }) => (
    <div data-testid="tab-bar">
      {tabs.map((tab) => (
        <span key={tab.label}>{tab.label}</span>
      ))}
    </div>
  ),
}));

// Mock react-router
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(searchParamsMock.value), vi.fn()],
    useNavigate: () => navigateMock,
  };
});

import { waitFor } from "@testing-library/react";
import VWProjectView from "../V1.0ProjectView/index";

const EU_AI_ACT = { framework_id: 1, project_framework_id: 11 };
const ISO_42001 = { framework_id: 2, project_framework_id: 12 };
const EU_AI_ACT_ORGANIZATION = { framework_id: 29, project_framework_id: 13 };

const showUseCase = (framework: unknown[], extra: Record<string, unknown> = {}) =>
  projectDataMock.mockReturnValue({
    project: { id: 1, project_title: "Resume screening", framework, ...extra },
    error: null,
    isLoading: false,
  });

describe("ProjectView (VWProjectView)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    euAiActWorkMock.mockResolvedValue({ fria: false, ce_marking: false });
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

  it("retries the load from the error page", () => {
    projectDataMock.mockReturnValue({
      project: null,
      error: "Failed to fetch project #1: Network Error",
      isLoading: false,
    });
    renderWithProviders(<VWProjectView />, { route: "/project-view?projectId=1" });
    const callsBefore = projectDataMock.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    const lastArgs = (projectDataMock.mock.lastCall as unknown as [{ refreshKey: number }])[0];
    expect(projectDataMock.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(lastArgs.refreshKey).toBe(1);
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

  it("offers the RACI tab on a regular use case", () => {
    projectDataMock.mockReturnValue({
      project: { id: 1, project_title: "Resume screening", is_organizational: false },
      error: null,
      isLoading: false,
    });
    renderWithProviders(<VWProjectView />, { route: "/project-view?projectId=1" });

    expect(screen.getByText("RACI")).toBeInTheDocument();
  });

  describe("with a link to the RACI tab", () => {
    beforeEach(() => {
      searchParamsMock.value = "projectId=1&tab=raci";
    });
    afterEach(() => {
      searchParamsMock.value = "projectId=1";
    });

    it("opens the matrix on a regular use case", () => {
      projectDataMock.mockReturnValue({
        project: { id: 1, project_title: "Resume screening", is_organizational: false },
        error: null,
        isLoading: false,
      });
      renderWithProviders(<VWProjectView />, { route: "/project-view?projectId=1&tab=raci" });

      expect(screen.getByTestId("project-raci")).toBeInTheDocument();
    });

    it("falls back to overview on an organizational use case", () => {
      projectDataMock.mockReturnValue({
        project: { id: 1, project_title: "ISO programme", is_organizational: true },
        error: null,
        isLoading: false,
      });
      renderWithProviders(<VWProjectView />, { route: "/project-view?projectId=1&tab=raci" });

      expect(screen.getByTestId("project-overview")).toBeInTheDocument();
      expect(screen.queryByTestId("project-raci")).not.toBeInTheDocument();
    });
  });

  it("hides the RACI tab on an organizational use case", () => {
    projectDataMock.mockReturnValue({
      project: { id: 1, project_title: "ISO programme", is_organizational: true },
      error: null,
      isLoading: false,
    });
    renderWithProviders(<VWProjectView />, { route: "/project-view?projectId=1" });

    expect(screen.getByTestId("tab-bar")).toBeInTheDocument();
    expect(screen.queryByText("RACI")).not.toBeInTheDocument();
  });

  describe("FRIA and CE marking tabs", () => {
    afterEach(() => {
      searchParamsMock.value = "projectId=1";
    });

    it("shows both on a use case with the EU AI Act, without asking for saved work", () => {
      showUseCase([EU_AI_ACT]);
      renderWithProviders(<VWProjectView />, { route: "/project-view?projectId=1" });

      expect(screen.getByText("FRIA")).toBeInTheDocument();
      expect(screen.getByText("CE marking")).toBeInTheDocument();
      expect(euAiActWorkMock).not.toHaveBeenCalled();
    });

    it("hides both without the EU AI Act when neither holds work", async () => {
      euAiActWorkMock.mockResolvedValue({ fria: false, ce_marking: false });
      showUseCase([ISO_42001]);
      renderWithProviders(<VWProjectView />, { route: "/project-view?projectId=1" });

      await waitFor(() => expect(euAiActWorkMock).toHaveBeenCalled());
      expect(euAiActWorkMock.mock.calls[0][0].id).toBe(1);
      await waitFor(() => expect(screen.queryByText("FRIA")).not.toBeInTheDocument());
      expect(screen.queryByText("CE marking")).not.toBeInTheDocument();
    });

    it("keeps only the tab that holds work, with the note", async () => {
      euAiActWorkMock.mockResolvedValue({ fria: true, ce_marking: false });
      searchParamsMock.value = "projectId=1&tab=fria";
      showUseCase([ISO_42001]);
      renderWithProviders(<VWProjectView />, { route: "/project-view?projectId=1&tab=fria" });

      expect(await screen.findByTestId("fria")).toBeInTheDocument();
      expect(screen.getByTestId("eu-ai-act-only-note")).toBeInTheDocument();
      expect(screen.getByText("FRIA")).toBeInTheDocument();
      expect(screen.queryByText("CE marking")).not.toBeInTheDocument();
    });

    it("shows no note with the EU AI Act", () => {
      searchParamsMock.value = "projectId=1&tab=ce-marking";
      showUseCase([EU_AI_ACT]);
      renderWithProviders(<VWProjectView />, { route: "/project-view?projectId=1&tab=ce-marking" });

      expect(screen.getByTestId("ce-marking")).toBeInTheDocument();
      expect(screen.queryByTestId("eu-ai-act-only-note")).not.toBeInTheDocument();
    });

    it("shows both when the check fails, so saved work is never hidden", async () => {
      euAiActWorkMock.mockRejectedValue(new Error("Network Error"));
      showUseCase([]);
      renderWithProviders(<VWProjectView />, { route: "/project-view?projectId=1" });

      expect(await screen.findByText("FRIA")).toBeInTheDocument();
      expect(screen.getByText("CE marking")).toBeInTheDocument();
    });

    it("hides both on the organizational use case, whose EU AI Act does not count", async () => {
      euAiActWorkMock.mockResolvedValue({ fria: false, ce_marking: false });
      showUseCase([EU_AI_ACT_ORGANIZATION], { is_organizational: true });
      renderWithProviders(<VWProjectView />, { route: "/project-view?projectId=1" });

      await waitFor(() => expect(euAiActWorkMock).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByText("CE marking")).not.toBeInTheDocument());
      expect(screen.queryByText("FRIA")).not.toBeInTheDocument();
    });

    it("sends a link to a hidden tab to overview", async () => {
      euAiActWorkMock.mockResolvedValue({ fria: false, ce_marking: false });
      searchParamsMock.value = "projectId=1&tab=ce-marking";
      showUseCase([ISO_42001]);
      renderWithProviders(<VWProjectView />, { route: "/project-view?projectId=1&tab=ce-marking" });

      expect(await screen.findByTestId("project-overview")).toBeInTheDocument();
      expect(screen.queryByTestId("ce-marking")).not.toBeInTheDocument();
    });

    it("keeps a linked tab while the use case itself is still loading", () => {
      searchParamsMock.value = "projectId=1&tab=fria";
      projectDataMock.mockReturnValue({ project: null, error: null, isLoading: true });
      renderWithProviders(<VWProjectView />, { route: "/project-view?projectId=1&tab=fria" });

      expect(screen.getByText("FRIA")).toBeInTheDocument();
      expect(screen.queryByTestId("project-overview")).not.toBeInTheDocument();
    });

    it("keeps kept tabs in place while a refresh re-checks", async () => {
      euAiActWorkMock.mockResolvedValueOnce({ fria: true, ce_marking: false });
      searchParamsMock.value = "projectId=1&tab=settings";
      showUseCase([ISO_42001]);
      renderWithProviders(<VWProjectView />, { route: "/project-view?projectId=1&tab=settings" });
      expect(await screen.findByText("FRIA")).toBeInTheDocument();

      euAiActWorkMock.mockReturnValue(new Promise(() => {}));
      fireEvent.click(screen.getByTestId("project-settings"));

      await waitFor(() => expect(euAiActWorkMock).toHaveBeenCalledTimes(2));
      expect(screen.getByText("FRIA")).toBeInTheDocument();
    });

    it("tells the note when the check failed and when the use case is organizational", async () => {
      euAiActWorkMock.mockRejectedValue(new Error("Network Error"));
      searchParamsMock.value = "projectId=1&tab=fria";
      showUseCase([EU_AI_ACT_ORGANIZATION], { is_organizational: true });
      renderWithProviders(<VWProjectView />, { route: "/project-view?projectId=1&tab=fria" });

      const note = await screen.findByTestId("eu-ai-act-only-note");
      expect(note).toHaveAttribute("data-organizational", "true");
      expect(note).toHaveAttribute("data-confirmed", "false");
    });

    it("keeps a linked tab on a skeleton while the check runs", () => {
      euAiActWorkMock.mockReturnValue(new Promise(() => {}));
      searchParamsMock.value = "projectId=1&tab=fria";
      showUseCase([ISO_42001]);
      renderWithProviders(<VWProjectView />, { route: "/project-view?projectId=1&tab=fria" });

      expect(screen.getByText("FRIA")).toBeInTheDocument();
      expect(screen.queryByTestId("project-overview")).not.toBeInTheDocument();
      expect(screen.queryByTestId("fria")).not.toBeInTheDocument();
    });
  });
});
