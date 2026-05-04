import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock hooks
vi.mock("../../../../application/hooks/useMultipleOnScreen", () => ({
  default: () => ({
    refs: [{ current: null }],
    allVisible: false,
  }),
}));

vi.mock("../../../../application/hooks/useFrameworks", () => ({
  default: () => ({
    allFrameworks: [],
    loading: false,
    error: null,
    refreshFilteredFrameworks: vi.fn(),
  }),
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [],
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

vi.mock("../../../../application/contexts/PluginRegistry.context", () => ({
  usePluginRegistry: () => ({
    getComponentsForSlot: () => [],
  }),
}));

// Mock repositories
vi.mock("../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock("../../../../application/repository/project.repository", () => ({
  deleteProject: vi.fn().mockResolvedValue({ status: 200 }),
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
  default: () => <div data-testid="add-framework-modal" />,
}));
vi.mock("../../../components/Dialogs/ConfirmationModal", () => ({
  default: () => <div data-testid="confirmation-modal" />,
}));
vi.mock("../../../components/Modals/StandardModal", () => ({
  default: ({ children }: any) => <div data-testid="standard-modal">{children}</div>,
}));
vi.mock("../../../components/NoProject/NoProject", () => ({
  default: ({ message }: any) => <div data-testid="no-project">{message}</div>,
}));
vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children }: any) => <div data-testid="page-header">{children}</div>,
}));
vi.mock("../../../components/button-toggle", () => ({
  ButtonToggle: () => <div data-testid="button-toggle" />,
}));
vi.mock("../../../components/PageTour", () => ({
  default: () => null,
}));
vi.mock("../../../components/TabBar", () => ({
  default: () => <div data-testid="tab-bar" />,
}));
vi.mock("../../../components/PluginSlot", () => ({
  PluginSlot: () => <div data-testid="plugin-slot" />,
}));
vi.mock("../../../components/button/customizable-button", () => ({
  CustomizableButton: ({ text }: any) => <button>{text}</button>,
}));

// Mock react-router-dom
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({}),
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

vi.mock("../../../../domain/constants/pluginSlots", () => ({
  PLUGIN_SLOTS: { CONTROLS_CUSTOM_FRAMEWORK: "controls-custom-framework" },
}));

vi.mock("../../../components/Forms/ProjectForm/constants", () => ({
  FrameworkTypeEnum: { OrganizationWide: "organization_wide" },
}));

import Framework from "../index";

describe("Framework", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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
});
