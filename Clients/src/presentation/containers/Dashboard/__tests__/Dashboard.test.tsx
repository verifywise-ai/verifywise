import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import Dashboard from "../index";

// --- Mock dependencies ---

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userRoleName: "Admin",
    isSuperAdmin: false,
  }),
}));

vi.mock("../../../../application/hooks/useActiveModule", () => ({
  useActiveModule: () => ({
    activeModule: "governance",
    setActiveModule: vi.fn(),
  }),
}));

vi.mock("../../../../application/hooks/useDashboard", () => ({
  useDashboard: () => ({
    dashboard: { projects_list: [] },
    fetchDashboard: vi.fn(),
  }),
}));

vi.mock("../../../../application/contexts/VerifyWise.context", async () => {
  const React = await import("react");
  const contextValue = {
    setDashboardValues: vi.fn(),
    setProjects: vi.fn(),
    dashboardValues: {},
    projects: [],
  };
  const VerifyWiseContext = React.createContext(contextValue);
  return { VerifyWiseContext };
});

vi.mock("../../../../application/repository/project.repository", () => ({
  getAllProjects: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock("../../../../application/repository/entity.repository", () => ({
  postAutoDrivers: vi.fn().mockResolvedValue({ status: 200 }),
  deleteAutoDrivers: vi.fn().mockResolvedValue({ status: 200 }),
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock("../../../../application/tools/log.engine", () => ({
  logEngine: vi.fn(),
}));

// Mock sidebar context providers as passthrough wrappers
vi.mock("../../../../application/contexts/EvalsSidebar.context", () => ({
  EvalsSidebarProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../../../../application/contexts/AIDetectionSidebar.context", () => ({
  AIDetectionSidebarProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../../../../application/contexts/ShadowAISidebar.context", () => ({
  ShadowAISidebarProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../../../../application/contexts/AIGatewaySidebar.context", () => ({
  AIGatewaySidebarProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../../../../application/contexts/AITrustIndexSidebar.context", () => ({
  AITrustIndexSidebarProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock child components as stub divs
vi.mock("../../../components/AppSwitcher", () => ({
  default: () => <div data-testid="app-switcher" />,
}));
vi.mock("../../../components/ContextSidebar", () => ({
  ContextSidebar: (props: Record<string, unknown>) => (
    <div
      data-testid="context-sidebar"
      data-show-demo={String(props.showDemoDataButton)}
      data-has-demo={String(props.hasDemoData)}
    />
  ),
}));
vi.mock("../../../components/ChangeNotice", () => ({
  default: () => <div data-testid="change-notice-mount" />,
}));
vi.mock("../../../components/DemoBanner/DemoAppBanner", () => ({
  default: () => <div data-testid="demo-app-banner" />,
}));
vi.mock("../../../components/Modals/StandardModal", () => ({
  default: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
    isOpen ? <div data-testid="standard-modal">{children}</div> : null,
}));
vi.mock("../../../components/Toast", () => ({
  default: ({ title }: { title: string }) => <div data-testid="toast">{title}</div>,
}));
vi.mock("../../../components/Alert", () => ({
  default: () => <div data-testid="alert" />,
}));

// Mock CSS import
vi.mock("../index.css", () => ({}));

// react-router Outlet
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    Outlet: () => <div data-testid="outlet" />,
    useLocation: () => ({ pathname: "/overview" }),
  };
});

describe("Dashboard container", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders without crashing", () => {
    renderWithProviders(<Dashboard reloadTrigger={false} />);
  });

  it("mounts the change notice once", () => {
    renderWithProviders(<Dashboard reloadTrigger={false} />);
    expect(screen.getAllByTestId("change-notice-mount")).toHaveLength(1);
  });

  it("renders no AppSwitcher in the phase 1 look", () => {
    renderWithProviders(<Dashboard reloadTrigger={false} />);
    expect(screen.queryByTestId("app-switcher")).not.toBeInTheDocument();
  });

  it("renders AppSwitcher and ContextSidebar in the classic look", async () => {
    // The look is read once when uiStyle loads: load the layout afresh.
    vi.resetModules();
    localStorage.setItem("vw-ui-style", "classic");
    const fresh = await import("../../../../test/renderWithProviders");
    const { default: ClassicDashboard } = await import("../index");
    fresh.renderWithProviders(<ClassicDashboard reloadTrigger={false} />);
    expect(screen.getByTestId("app-switcher")).toBeInTheDocument();
    expect(screen.getByTestId("context-sidebar")).toBeInTheDocument();
  });

  it("renders ContextSidebar (which holds the unified sidebar in phase 1)", () => {
    renderWithProviders(<Dashboard reloadTrigger={false} />);
    expect(screen.getByTestId("context-sidebar")).toBeInTheDocument();
  });

  it("renders Outlet for nested routes", () => {
    renderWithProviders(<Dashboard reloadTrigger={false} />);
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });

  it("calls getAllProjects on mount", async () => {
    const { getAllProjects } =
      await import("../../../../application/repository/project.repository");
    renderWithProviders(<Dashboard reloadTrigger={false} />);
    await waitFor(() => {
      expect(getAllProjects).toHaveBeenCalled();
    });
  });

  it("passes showDemoDataButton=true by default", () => {
    renderWithProviders(<Dashboard reloadTrigger={false} />);
    const sidebar = screen.getByTestId("context-sidebar");
    expect(sidebar.getAttribute("data-show-demo")).toBe("true");
  });

  it("passes showDemoDataButton=false when localStorage has hideDemoDataButton", () => {
    localStorage.setItem("hideDemoDataButton", "true");
    renderWithProviders(<Dashboard reloadTrigger={false} />);
    const sidebar = screen.getByTestId("context-sidebar");
    expect(sidebar.getAttribute("data-show-demo")).toBe("false");
  });
});
