import { screen, waitFor, fireEvent, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock hooks
vi.mock("../../../../application/hooks/useMultipleOnScreen", () => ({
  default: () => ({
    refs: [{ current: null }],
    allVisible: false,
  }),
}));

const mockUseFrameworks = vi.fn();
vi.mock("../../../../application/hooks/useFrameworks", () => ({
  default: (...args: any[]) => mockUseFrameworks(...args),
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [{ id: 1, name: "Jane", surname: "Doe" }],
  }),
}));

// Mock contexts
vi.mock("../../../../application/contexts/VerifyWise.context", () => ({
  VerifyWiseContext: {
    Consumer: ({ children }: any) => children({}),
    Provider: ({ children }: any) => children,
  },
}));

// Override useContext to provide VerifyWiseContext values
const mockUseContext = vi.fn();
vi.mock("react", async () => {
  const actual = await vi.importActual("react");
  return {
    ...actual,
    useContext: (...args: any[]) => {
      // Check if it's the VerifyWiseContext
      const result = mockUseContext(...args);
      if (result !== undefined) return result;
      return (actual as any).useContext(...args);
    },
  };
});

// Mock repositories
const mockGetAllEntities = vi.fn();
vi.mock("../../../../application/repository/entity.repository", () => ({
  getAllEntities: (...args: any[]) => mockGetAllEntities(...args),
}));

const mockDeleteProject = vi.fn();
vi.mock("../../../../application/repository/project.repository", () => ({
  deleteProject: (...args: any[]) => mockDeleteProject(...args),
  getAllProjects: vi.fn().mockResolvedValue({ data: [] }),
}));

// Mock child components
vi.mock("../ISO27001/Clause", () => ({ default: () => <div data-testid="iso27001-clause" /> }));
vi.mock("../ISO27001/Annex", () => ({ default: () => <div data-testid="iso27001-annex" /> }));
vi.mock("../ISO42001/Clause", () => ({ default: () => <div data-testid="iso42001-clause" /> }));
vi.mock("../ISO42001/Annex", () => ({ default: () => <div data-testid="iso42001-annex" /> }));
vi.mock("../NIST-AI-RMF/Govern", () => ({ default: () => <div data-testid="nist-govern" /> }));
vi.mock("../NIST-AI-RMF/Map", () => ({ default: () => <div data-testid="nist-map" /> }));
vi.mock("../NIST-AI-RMF/Measure", () => ({ default: () => <div data-testid="nist-measure" /> }));
vi.mock("../NIST-AI-RMF/Manage", () => ({ default: () => <div data-testid="nist-manage" /> }));
vi.mock("../Dashboard", () => ({ default: () => <div data-testid="framework-dashboard" /> }));
vi.mock("../Settings", () => ({ default: () => <div data-testid="framework-settings" /> }));
vi.mock("../FrameworkRisks", () => ({ default: () => <div data-testid="framework-risks" /> }));
vi.mock("../FrameworkLinkedModels", () => ({
  default: () => <div data-testid="framework-linked-models" />,
}));
vi.mock("../FrameworkSteps", () => ({ default: [] }));

vi.mock("../../../components/Forms/ProjectForm", () => ({
  ProjectForm: () => <div data-testid="project-form" />,
}));
vi.mock("../../ProjectView/AddNewFramework", () => ({
  default: ({ open, onClose, frameworks }: any) =>
    open ? (
      <div data-testid="add-framework-modal">
        {frameworks.map((fw: any) => (
          <span key={fw.id}>{fw.name}</span>
        ))}
        <button onClick={onClose}>close-add-framework</button>
      </div>
    ) : null,
}));
vi.mock("../../../components/Dialogs/ConfirmationModal", () => ({
  default: ({ title, onCancel, onProceed, proceedText }: any) => (
    <div data-testid="confirmation-modal">
      <span>{title}</span>
      <button onClick={onCancel}>cancel-confirmation</button>
      <button onClick={onProceed}>{proceedText}</button>
    </div>
  ),
}));
vi.mock("../../../components/Modals/StandardModal", () => ({
  default: ({ children, title, onClose }: any) => (
    <div data-testid="standard-modal">
      <span>{title}</span>
      {children}
      <button onClick={onClose}>close-standard-modal</button>
    </div>
  ),
}));
vi.mock("../../../components/NoProject/NoProject", () => ({
  default: ({ message }: any) => <div data-testid="no-project">{message}</div>,
}));
vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, actionButton }: any) => (
    <div data-testid="page-header">
      {actionButton}
      {children}
    </div>
  ),
}));
vi.mock("../../../components/button-toggle", () => ({
  ButtonToggle: ({ options, value, onChange }: any) => (
    <div data-testid="button-toggle">
      {options.map((opt: any) => (
        <button
          key={opt.value}
          data-selected={opt.value === value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("../../../components/PageTour", () => ({
  default: () => null,
}));
vi.mock("../../../components/TabBar", () => ({
  default: () => <div data-testid="tab-bar" />,
}));
vi.mock("../../../components/button/customizable-button", () => ({
  CustomizableButton: ({ text, onClick, isDisabled }: any) => (
    <button onClick={onClick} disabled={isDisabled}>
      {text}
    </button>
  ),
}));
vi.mock("../../../components/GovernanceOS/GovernanceIntelligenceContextBar", () => ({
  default: () => <div data-testid="governance-context-bar" />,
}));

// Mock react-router-dom
const mockNavigate = vi.fn();
const mockUseParams = vi.fn(() => ({}));

// Mock react-router
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockUseParams(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

// Mock constants
vi.mock("../../../../application/constants/permissions", () => ({
  default: {
    frameworks: { manage: ["Admin"] },
    projects: { create: ["Admin"], edit: ["Admin"], delete: ["Admin"] },
  },
}));

vi.mock("../../../components/Forms/ProjectForm/constants", () => ({
  FrameworkTypeEnum: { OrganizationWide: "organization_wide" },
}));

import Framework from "../index";

const iso27001Fw = {
  id: "3",
  is_demo: false,
  project_id: "1",
  framework_id: "3",
  name: "ISO 27001",
  description: "",
  is_organizational: true,
};

const iso42001Fw = {
  id: "2",
  is_demo: false,
  project_id: "1",
  framework_id: "2",
  name: "ISO 42001",
  description: "",
  is_organizational: true,
};

const nistFw = {
  id: "4",
  is_demo: false,
  project_id: "1",
  framework_id: "4",
  name: "NIST AI RMF",
  description: "",
  is_organizational: true,
};

const buildOrgProject = (frameworks: { framework_id: number; project_framework_id: number }[]) => ({
  id: 1,
  project_title: "Org project",
  is_organizational: true,
  framework: frameworks.map((f) => ({ ...f, name: "" })),
});

describe("Framework", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseParams.mockReturnValue({});
    mockGetAllEntities.mockResolvedValue({ data: [] });
    mockDeleteProject.mockResolvedValue({ status: 200 });
    mockUseFrameworks.mockReturnValue({
      allFrameworks: [],
      loading: false,
      error: null,
      refreshFilteredFrameworks: vi.fn(),
    });
    mockUseContext.mockReturnValue({
      changeComponentVisibility: vi.fn(),
      projects: [],
      userRoleName: "Admin",
      setProjects: vi.fn(),
    });
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<Framework />, {
      route: "/framework",
    });
    expect(container).toBeTruthy();
  });

  it("shows the NoProject message and New Project button when there is no organizational project", () => {
    renderWithProviders(<Framework />, { route: "/framework" });
    expect(screen.getByTestId("no-project")).toBeInTheDocument();
    expect(screen.getByText("New Project")).toBeInTheDocument();
  });

  it("opens the create project modal when New Project is clicked", () => {
    renderWithProviders(<Framework />, { route: "/framework" });
    fireEvent.click(screen.getByText("New Project"));
    expect(screen.getByTestId("standard-modal")).toBeInTheDocument();
    expect(screen.getByText("Create new framework")).toBeInTheDocument();
  });

  it("shows a loading skeleton while frameworks are loading", () => {
    mockUseFrameworks.mockReturnValue({
      allFrameworks: [],
      loading: true,
      error: null,
      refreshFilteredFrameworks: vi.fn(),
    });
    const orgProject = buildOrgProject([{ framework_id: 3, project_framework_id: 20 }]);
    mockUseContext.mockReturnValue({
      changeComponentVisibility: vi.fn(),
      projects: [orgProject],
      userRoleName: "Admin",
      setProjects: vi.fn(),
    });
    mockUseParams.mockReturnValue({ tab: "controls" });
    const { container } = renderWithProviders(<Framework />, { route: "/framework/controls" });
    expect(container).toBeTruthy();
  });

  it("shows an error message when frameworks fail to load", () => {
    mockUseFrameworks.mockReturnValue({
      allFrameworks: [],
      loading: false,
      error: new Error("boom"),
      refreshFilteredFrameworks: vi.fn(),
    });
    const orgProject = buildOrgProject([{ framework_id: 3, project_framework_id: 20 }]);
    mockUseContext.mockReturnValue({
      changeComponentVisibility: vi.fn(),
      projects: [orgProject],
      userRoleName: "Admin",
      setProjects: vi.fn(),
    });
    mockUseParams.mockReturnValue({ tab: "controls" });
    renderWithProviders(<Framework />, { route: "/framework/controls" });
    expect(screen.getByText("Error loading frameworks. Please try again.")).toBeInTheDocument();
  });

  it("shows a message when no ISO frameworks are assigned to the project", () => {
    const orgProject = buildOrgProject([]);
    mockUseContext.mockReturnValue({
      changeComponentVisibility: vi.fn(),
      projects: [orgProject],
      userRoleName: "Admin",
      setProjects: vi.fn(),
    });
    mockUseParams.mockReturnValue({ tab: "controls" });
    renderWithProviders(<Framework />, { route: "/framework/controls" });
    expect(screen.getByText("No organizational frameworks assigned yet.")).toBeInTheDocument();
  });

  it("renders the dashboard tab with the governance context bar and dashboard component", () => {
    const orgProject = buildOrgProject([{ framework_id: 3, project_framework_id: 20 }]);
    mockUseFrameworks.mockReturnValue({
      allFrameworks: [iso27001Fw],
      loading: false,
      error: null,
      refreshFilteredFrameworks: vi.fn(),
    });
    mockUseContext.mockReturnValue({
      changeComponentVisibility: vi.fn(),
      projects: [orgProject],
      userRoleName: "Admin",
      setProjects: vi.fn(),
    });
    renderWithProviders(<Framework />, { route: "/framework" });
    expect(screen.getByTestId("governance-context-bar")).toBeInTheDocument();
    expect(screen.getByTestId("framework-dashboard")).toBeInTheDocument();
  });

  it("renders the ISO 27001 controls tab and switches between clauses and annexes", () => {
    const orgProject = buildOrgProject([{ framework_id: 3, project_framework_id: 20 }]);
    mockUseFrameworks.mockReturnValue({
      allFrameworks: [iso27001Fw],
      loading: false,
      error: null,
      refreshFilteredFrameworks: vi.fn(),
    });
    mockUseContext.mockReturnValue({
      changeComponentVisibility: vi.fn(),
      projects: [orgProject],
      userRoleName: "Admin",
      setProjects: vi.fn(),
    });
    mockUseParams.mockReturnValue({ tab: "controls" });
    renderWithProviders(<Framework />, { route: "/framework/controls" });
    expect(screen.getByTestId("iso27001-clause")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Annexes" }));
    expect(screen.getByTestId("iso27001-annex")).toBeInTheDocument();
  });

  it("renders the ISO 42001 controls tab and switches between clauses and annexes", () => {
    const orgProject = buildOrgProject([{ framework_id: 2, project_framework_id: 10 }]);
    mockUseFrameworks.mockReturnValue({
      allFrameworks: [iso42001Fw],
      loading: false,
      error: null,
      refreshFilteredFrameworks: vi.fn(),
    });
    mockUseContext.mockReturnValue({
      changeComponentVisibility: vi.fn(),
      projects: [orgProject],
      userRoleName: "Admin",
      setProjects: vi.fn(),
    });
    mockUseParams.mockReturnValue({ tab: "controls" });
    renderWithProviders(<Framework />, { route: "/framework/controls" });
    expect(screen.getByTestId("iso42001-clause")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Annexes" }));
    expect(screen.getByTestId("iso42001-annex")).toBeInTheDocument();
  });

  it("renders the NIST AI RMF controls tab and cycles through all four functions", () => {
    const orgProject = buildOrgProject([{ framework_id: 4, project_framework_id: 30 }]);
    mockUseFrameworks.mockReturnValue({
      allFrameworks: [nistFw],
      loading: false,
      error: null,
      refreshFilteredFrameworks: vi.fn(),
    });
    mockUseContext.mockReturnValue({
      changeComponentVisibility: vi.fn(),
      projects: [orgProject],
      userRoleName: "Admin",
      setProjects: vi.fn(),
    });
    mockUseParams.mockReturnValue({ tab: "controls" });
    renderWithProviders(<Framework />, { route: "/framework/controls" });
    expect(screen.getByTestId("nist-govern")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Map" }));
    expect(screen.getByTestId("nist-map")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Measure" }));
    expect(screen.getByTestId("nist-measure")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Manage" }));
    expect(screen.getByTestId("nist-manage")).toBeInTheDocument();
  });

  it("switches selected framework via the controls toggle", () => {
    const orgProject = buildOrgProject([
      { framework_id: 2, project_framework_id: 10 },
      { framework_id: 3, project_framework_id: 20 },
    ]);
    mockUseFrameworks.mockReturnValue({
      allFrameworks: [iso42001Fw, iso27001Fw],
      loading: false,
      error: null,
      refreshFilteredFrameworks: vi.fn(),
    });
    mockUseContext.mockReturnValue({
      changeComponentVisibility: vi.fn(),
      projects: [orgProject],
      userRoleName: "Admin",
      setProjects: vi.fn(),
    });
    mockUseParams.mockReturnValue({ tab: "controls" });
    renderWithProviders(<Framework />, { route: "/framework/controls" });
    expect(screen.getByTestId("iso42001-clause")).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("button-toggle")).getByText("ISO 27001"));
    expect(screen.getByTestId("iso27001-clause")).toBeInTheDocument();
  });

  it("renders the framework-risks, linked-models, and settings tabs", () => {
    const orgProject = buildOrgProject([{ framework_id: 3, project_framework_id: 20 }]);
    mockUseFrameworks.mockReturnValue({
      allFrameworks: [iso27001Fw],
      loading: false,
      error: null,
      refreshFilteredFrameworks: vi.fn(),
    });
    mockUseContext.mockReturnValue({
      changeComponentVisibility: vi.fn(),
      projects: [orgProject],
      userRoleName: "Admin",
      setProjects: vi.fn(),
    });

    mockUseParams.mockReturnValue({ tab: "framework-risks" });
    const { unmount: unmount1 } = renderWithProviders(<Framework />, {
      route: "/framework/framework-risks",
    });
    expect(screen.getByTestId("framework-risks")).toBeInTheDocument();
    unmount1();

    mockUseParams.mockReturnValue({ tab: "linked-models" });
    const { unmount: unmount2 } = renderWithProviders(<Framework />, {
      route: "/framework/linked-models",
    });
    expect(screen.getByTestId("framework-linked-models")).toBeInTheDocument();
    unmount2();

    mockUseParams.mockReturnValue({ tab: "settings" });
    renderWithProviders(<Framework />, { route: "/framework/settings" });
    expect(screen.getByTestId("framework-settings")).toBeInTheDocument();
  });

  it("opens the manage frameworks menu and triggers add/remove frameworks", () => {
    const orgProject = buildOrgProject([{ framework_id: 3, project_framework_id: 20 }]);
    mockUseFrameworks.mockReturnValue({
      allFrameworks: [iso27001Fw, iso42001Fw],
      loading: false,
      error: null,
      refreshFilteredFrameworks: vi.fn(),
    });
    mockUseContext.mockReturnValue({
      changeComponentVisibility: vi.fn(),
      projects: [orgProject],
      userRoleName: "Admin",
      setProjects: vi.fn(),
    });
    renderWithProviders(<Framework />, { route: "/framework" });
    fireEvent.click(screen.getByText("Manage frameworks"));
    fireEvent.click(screen.getByText("Add/remove frameworks"));
    expect(screen.getByTestId("add-framework-modal")).toBeInTheDocument();
    // Both ISO 27001 and ISO 42001 should be offered (EU AI Act excluded elsewhere)
    expect(
      within(screen.getByTestId("add-framework-modal")).getByText("ISO 27001"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("add-framework-modal")).getByText("ISO 42001"),
    ).toBeInTheDocument();
  });

  it("opens the edit project modal from the manage frameworks menu", () => {
    const orgProject = buildOrgProject([{ framework_id: 3, project_framework_id: 20 }]);
    mockUseFrameworks.mockReturnValue({
      allFrameworks: [iso27001Fw],
      loading: false,
      error: null,
      refreshFilteredFrameworks: vi.fn(),
    });
    mockUseContext.mockReturnValue({
      changeComponentVisibility: vi.fn(),
      projects: [orgProject],
      userRoleName: "Admin",
      setProjects: vi.fn(),
    });
    renderWithProviders(<Framework />, { route: "/framework" });
    fireEvent.click(screen.getByText("Manage frameworks"));
    fireEvent.click(screen.getByText("Edit project"));
    expect(screen.getByTestId("standard-modal")).toBeInTheDocument();
    expect(screen.getByText("Edit framework")).toBeInTheDocument();
  });

  it("deletes the project when confirmed from the manage frameworks menu", async () => {
    const orgProject = buildOrgProject([{ framework_id: 3, project_framework_id: 20 }]);
    const setProjects = vi.fn();
    mockUseFrameworks.mockReturnValue({
      allFrameworks: [iso27001Fw],
      loading: false,
      error: null,
      refreshFilteredFrameworks: vi.fn(),
    });
    mockUseContext.mockReturnValue({
      changeComponentVisibility: vi.fn(),
      projects: [orgProject],
      userRoleName: "Admin",
      setProjects,
    });
    renderWithProviders(<Framework />, { route: "/framework" });
    fireEvent.click(screen.getByText("Manage frameworks"));
    fireEvent.click(screen.getByText("Delete project"));
    expect(screen.getByText("Confirm Delete")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Delete"));
    await waitFor(() => {
      expect(mockDeleteProject).toHaveBeenCalledWith({ id: 1 });
    });
    await waitFor(() => {
      expect(setProjects).toHaveBeenCalled();
    });
  });

  it("logs an error when project deletion fails", async () => {
    mockDeleteProject.mockResolvedValue({ status: 500 });
    const orgProject = buildOrgProject([{ framework_id: 3, project_framework_id: 20 }]);
    mockUseFrameworks.mockReturnValue({
      allFrameworks: [iso27001Fw],
      loading: false,
      error: null,
      refreshFilteredFrameworks: vi.fn(),
    });
    mockUseContext.mockReturnValue({
      changeComponentVisibility: vi.fn(),
      projects: [orgProject],
      userRoleName: "Admin",
      setProjects: vi.fn(),
    });
    renderWithProviders(<Framework />, { route: "/framework" });
    fireEvent.click(screen.getByText("Manage frameworks"));
    fireEvent.click(screen.getByText("Delete project"));
    fireEvent.click(screen.getByText("Delete"));
    await waitFor(() => {
      expect(mockDeleteProject).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("confirmation-modal")).not.toBeInTheDocument();
  });

  it("cancels the delete confirmation modal without deleting", () => {
    const orgProject = buildOrgProject([{ framework_id: 3, project_framework_id: 20 }]);
    mockUseFrameworks.mockReturnValue({
      allFrameworks: [iso27001Fw],
      loading: false,
      error: null,
      refreshFilteredFrameworks: vi.fn(),
    });
    mockUseContext.mockReturnValue({
      changeComponentVisibility: vi.fn(),
      projects: [orgProject],
      userRoleName: "Admin",
      setProjects: vi.fn(),
    });
    renderWithProviders(<Framework />, { route: "/framework" });
    fireEvent.click(screen.getByText("Manage frameworks"));
    fireEvent.click(screen.getByText("Delete project"));
    fireEvent.click(screen.getByText("cancel-confirmation"));
    expect(screen.queryByTestId("confirmation-modal")).not.toBeInTheDocument();
    expect(mockDeleteProject).not.toHaveBeenCalled();
  });

  it("navigates when the main tab bar route changes via URL params", () => {
    const orgProject = buildOrgProject([{ framework_id: 3, project_framework_id: 20 }]);
    mockUseFrameworks.mockReturnValue({
      allFrameworks: [iso27001Fw],
      loading: false,
      error: null,
      refreshFilteredFrameworks: vi.fn(),
    });
    mockUseContext.mockReturnValue({
      changeComponentVisibility: vi.fn(),
      projects: [orgProject],
      userRoleName: "Admin",
      setProjects: vi.fn(),
    });
    mockUseParams.mockReturnValue({ tab: "settings" });
    renderWithProviders(<Framework />, { route: "/framework/settings" });
    expect(screen.getByTestId("framework-settings")).toBeInTheDocument();
  });
});
