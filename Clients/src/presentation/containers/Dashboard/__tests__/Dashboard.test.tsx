import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import Dashboard from "../index";

// --- Mock dependencies ---

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userRoleName: "Admin",
    isSuperAdmin: false,
    activeOrganizationId: 1,
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

vi.mock("../../../../application/repository/superAdmin.repository", () => ({
  getOrganizations: vi.fn().mockResolvedValue({ data: { data: [] } }),
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
vi.mock("../../../components/ReadOnlyBanner", () => ({
  default: () => <div data-testid="read-only-banner" />,
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

  it("renders AppSwitcher", () => {
    renderWithProviders(<Dashboard reloadTrigger={false} />);
    expect(screen.getByTestId("app-switcher")).toBeInTheDocument();
  });

  it("renders ContextSidebar", () => {
    renderWithProviders(<Dashboard reloadTrigger={false} />);
    expect(screen.getByTestId("context-sidebar")).toBeInTheDocument();
  });

  it("renders ReadOnlyBanner", () => {
    renderWithProviders(<Dashboard reloadTrigger={false} />);
    expect(screen.getByTestId("read-only-banner")).toBeInTheDocument();
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
