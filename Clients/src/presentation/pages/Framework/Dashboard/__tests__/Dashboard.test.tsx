import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockGetEntityById = vi.fn();
vi.mock("../../../../../application/repository/entity.repository", () => ({
  getEntityById: (...args: any[]) => mockGetEntityById(...args),
}));

const mockGetComponentsForSlot = vi.fn(() => []);
vi.mock("../../../../../application/contexts/PluginRegistry.context", () => ({
  usePluginRegistry: () => ({
    getComponentsForSlot: mockGetComponentsForSlot,
  }),
}));

vi.mock("../../../../components/PluginSlot", () => ({
  PluginSlot: () => <div data-testid="plugin-slot" />,
}));

vi.mock("../FrameworkProgressCard", () => ({
  default: () => <div data-testid="framework-progress-card" />,
}));
vi.mock("../AssignmentStatusCard", () => ({
  default: () => <div data-testid="assignment-status-card" />,
}));
vi.mock("../StatusBreakdownCard", () => ({
  default: () => <div data-testid="status-breakdown-card" />,
}));
vi.mock("../ControlCategoriesCard", () => ({
  default: ({ onNavigate }: any) => (
    <button data-testid="control-categories-card" onClick={() => onNavigate("ISO 42001", "clauses")}>
      control-categories
    </button>
  ),
}));
vi.mock("../AnnexOverviewCard", () => ({
  default: ({ onNavigate }: any) => (
    <button data-testid="annex-overview-card" onClick={() => onNavigate("ISO 27001", "annexes")}>
      annex-overview
    </button>
  ),
}));
vi.mock("../NISTFunctionsOverviewCard", () => ({
  default: ({ onNavigate }: any) => (
    <button data-testid="nist-functions-card" onClick={() => onNavigate("NIST AI RMF", "govern")}>
      nist-functions
    </button>
  ),
}));

import FrameworkDashboard from "../index";

const baseProject: any = {
  id: 1,
  project_title: "Org project",
  framework: [
    { project_framework_id: 100, framework_id: 2, name: "ISO 42001" },
    { project_framework_id: 200, framework_id: 3, name: "ISO 27001" },
  ],
};

const iso42001FilteredFramework: any = {
  id: "2",
  is_demo: false,
  project_id: "1",
  framework_id: "2",
  name: "ISO 42001",
  description: "",
  is_organizational: true,
};

const iso27001FilteredFramework: any = {
  ...iso42001FilteredFramework,
  id: "3",
  framework_id: "3",
  name: "ISO 27001",
};

const nistFilteredFramework: any = {
  ...iso42001FilteredFramework,
  id: "4",
  framework_id: "4",
  name: "NIST AI RMF",
};

describe("FrameworkDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGetComponentsForSlot.mockReturnValue([]);
    mockGetEntityById.mockResolvedValue({ data: {} });
  });

  it("shows a message when there are no enabled frameworks", async () => {
    renderWithProviders(
      <FrameworkDashboard organizationalProject={baseProject} filteredFrameworks={[]} />,
    );
    await waitFor(() => {
      expect(screen.getByText("No frameworks enabled for this organization.")).toBeInTheDocument();
    });
  });

  it("renders the plugin slot instead of the empty message when a custom dashboard is registered", async () => {
    mockGetComponentsForSlot.mockReturnValue([{}]);
    renderWithProviders(
      <FrameworkDashboard organizationalProject={baseProject} filteredFrameworks={[]} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("plugin-slot")).toBeInTheDocument();
    });
    expect(
      screen.queryByText("No frameworks enabled for this organization."),
    ).not.toBeInTheDocument();
  });

  it("renders tabs and summary cards for ISO 42001 and ISO 27001 frameworks", async () => {
    renderWithProviders(
      <FrameworkDashboard
        organizationalProject={baseProject}
        filteredFrameworks={[iso42001FilteredFramework, iso27001FilteredFramework]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("framework-progress-card")).toBeInTheDocument();
    });
    expect(screen.getByTestId("assignment-status-card")).toBeInTheDocument();
    expect(screen.getByTestId("status-breakdown-card")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "ISO 42001" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "ISO 27001" })).toBeInTheDocument();
  });

  it("switches tabs and persists the active tab index to localStorage", async () => {
    renderWithProviders(
      <FrameworkDashboard
        organizationalProject={baseProject}
        filteredFrameworks={[iso42001FilteredFramework, iso27001FilteredFramework]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "ISO 27001" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("tab", { name: "ISO 27001" }));
    await waitFor(() => {
      expect(localStorage.getItem("verifywise_dashboard_active_tab")).toBe("1");
    });
  });

  it("renders the NIST AI RMF tab content", async () => {
    renderWithProviders(
      <FrameworkDashboard
        organizationalProject={baseProject}
        filteredFrameworks={[nistFilteredFramework]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "NIST AI RMF" })).toBeInTheDocument();
    });
    expect(screen.getByTestId("nist-functions-card")).toBeInTheDocument();
  });

  it("navigates to controls and stores tab selection when a card triggers onNavigate", async () => {
    renderWithProviders(
      <FrameworkDashboard
        organizationalProject={baseProject}
        filteredFrameworks={[iso42001FilteredFramework, iso27001FilteredFramework]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("control-categories-card")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("control-categories-card"));
    expect(mockNavigate).toHaveBeenCalledWith("/framework/controls");
    expect(localStorage.getItem("verifywise_iso42001_tab")).toBe("clauses");
  });

  it("handles framework data fetch errors gracefully", async () => {
    mockGetEntityById.mockRejectedValue(new Error("network error"));
    renderWithProviders(
      <FrameworkDashboard
        organizationalProject={baseProject}
        filteredFrameworks={[iso42001FilteredFramework]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("framework-progress-card")).toBeInTheDocument();
    });
  });
});
