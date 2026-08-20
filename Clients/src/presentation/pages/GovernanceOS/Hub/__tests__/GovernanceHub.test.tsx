import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

const mockNavigate = vi.fn();

vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

let mockContextValue: any = {
  projects: [],
  currentProjectId: null,
};

vi.mock("../../../../../application/contexts/VerifyWise.context", () => ({
  VerifyWiseContext: {
    get _currentValue() {
      return mockContextValue;
    },
    Provider: ({ children }: any) => children,
    Consumer: ({ children }: any) => children(mockContextValue),
  },
}));

let mockMappings: any[] = [];
let mockScenarios: any[] = [];
let mockPreferences: any = null;
let mockCoverage: any[] | undefined = undefined;

vi.mock("../../../../../application/hooks/useGovernanceOs", () => ({
  useMappings: () => ({ data: mockMappings }),
  useScenarios: () => ({ data: mockScenarios }),
  useGovernancePreferences: () => ({ data: mockPreferences }),
  useCoverage: () => ({ data: mockCoverage }),
}));

import GovernanceHub from "../index";

describe("GovernanceHub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContextValue = { projects: [], currentProjectId: null };
    mockMappings = [];
    mockScenarios = [];
    mockPreferences = null;
    mockCoverage = undefined;
  });

  it("renders the module cards", () => {
    renderWithProviders(<GovernanceHub />, { route: "/governance" });

    expect(screen.getByText("Modules")).toBeInTheDocument();
    expect(screen.getAllByText("Framework Mapper").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Scenario Builder").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unified Insights").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Evidence Hub").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Knowledge Graph").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Regulatory Radar").length).toBeGreaterThan(0);
  });

  it("shows 'No active scenario selected' when there is no active scenario", () => {
    renderWithProviders(<GovernanceHub />, { route: "/governance" });

    expect(screen.getByText("No active scenario selected")).toBeInTheDocument();
  });

  it("shows the active scenario banner with framework chips when a scenario is selected", () => {
    mockScenarios = [
      {
        id: 5,
        name: "EU High Risk",
        description: "For EU high risk systems",
        priority_order: { primary: 1, secondary: [2], supplementary: [3] },
      },
    ];
    mockPreferences = { selected_scenario_id: 5 };

    renderWithProviders(<GovernanceHub />, { route: "/governance" });

    expect(screen.getByText("Active governance scenario")).toBeInTheDocument();
    expect(screen.getByText("EU High Risk")).toBeInTheDocument();
    expect(screen.getByText("For EU high risk systems")).toBeInTheDocument();
    expect(screen.getByText("EU AI Act")).toBeInTheDocument();
    expect(screen.getByText("ISO 42001")).toBeInTheDocument();
    expect(screen.getByText("ISO 27001")).toBeInTheDocument();
  });

  it("shows placeholder stat cards when there is no coverage data", () => {
    renderWithProviders(<GovernanceHub />, { route: "/governance" });

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows live coverage stats and gap hotspots when coverage data is present", () => {
    mockContextValue = { projects: [], currentProjectId: "3" };
    mockCoverage = [
      {
        framework_id: 1,
        framework_name: "EU AI Act",
        total_controls: 10,
        mapped_controls: 4,
        coverage_percentage: 40,
        gap_details: { unmapped_controls: ["A1", "A2"] },
        synergy_details: { multi_framework_controls: [] },
      },
      {
        framework_id: 2,
        framework_name: "ISO 42001",
        total_controls: 10,
        mapped_controls: 8,
        coverage_percentage: 80,
        gap_details: { unmapped_controls: ["B1"] },
        synergy_details: { multi_framework_controls: [] },
      },
    ];

    renderWithProviders(<GovernanceHub />, { route: "/governance" });

    expect(screen.getByText("Avg Coverage")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("Total Gaps")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Gap Hotspots")).toBeInTheDocument();
  });

  it("shows mappings count and top domain substat", () => {
    mockMappings = [
      { id: 1, domain_tag: "privacy", mapping_strength: "direct" },
      { id: 2, domain_tag: "privacy", mapping_strength: "partial" },
      { id: 3, domain_tag: "security", mapping_strength: "related" },
    ];

    renderWithProviders(<GovernanceHub />, { route: "/governance" });

    expect(screen.getByText("3 mappings")).toBeInTheDocument();
    expect(screen.getByText(/Top domain: privacy \(2\)/)).toBeInTheDocument();
  });

  it("navigates to the framework mapper when its module card is clicked", () => {
    renderWithProviders(<GovernanceHub />, { route: "/governance" });

    const [, moduleCardTitle] = screen.getAllByText("Framework Mapper");
    fireEvent.click(moduleCardTitle);
    expect(mockNavigate).toHaveBeenCalledWith("/governance/framework-mapper");
  });

  it("does not navigate when a disabled module card is clicked", () => {
    renderWithProviders(<GovernanceHub />, { route: "/governance" });

    const [, moduleCardTitle] = screen.getAllByText("Evidence Hub");
    fireEvent.click(moduleCardTitle);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("navigates to scenarios via the quick action buttons", () => {
    renderWithProviders(<GovernanceHub />, { route: "/governance" });

    fireEvent.click(screen.getByRole("button", { name: "Get Recommendations" }));
    expect(mockNavigate).toHaveBeenCalledWith("/governance/scenarios");
  });

  it("navigates to insights via the 'Run Coverage Analysis' quick action", () => {
    renderWithProviders(<GovernanceHub />, { route: "/governance" });

    fireEvent.click(screen.getByRole("button", { name: "Run Coverage Analysis" }));
    expect(mockNavigate).toHaveBeenCalledWith("/governance/insights");
  });

  it("navigates using 'Choose scenario' when no scenario is active", () => {
    renderWithProviders(<GovernanceHub />, { route: "/governance" });

    fireEvent.click(screen.getByRole("button", { name: "Choose scenario" }));
    expect(mockNavigate).toHaveBeenCalledWith("/governance/scenarios");
  });
});
