import { screen, fireEvent } from "@testing-library/react";
import { Routes, Route } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockNavigate = vi.fn();

vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../../../components/UserGuide/UserGuideSidebarContext", () => ({
  useUserGuideSidebarContext: () => ({ open: vi.fn(), openTab: vi.fn() }),
  DEFAULT_CONTENT_WIDTH: 400,
}));

let mockMappings: any[] = [];
let mockScenarios: any[] = [];
let mockPreferences: any = null;
const mockUpdatePreferencesMutate = vi.fn();

vi.mock("../../../../application/hooks/useGovernanceOs", () => ({
  useMappings: () => ({ data: mockMappings }),
  useScenarios: () => ({ data: mockScenarios }),
  useGovernancePreferences: () => ({ data: mockPreferences }),
  useUpdatePreferences: () => ({ mutate: mockUpdatePreferencesMutate, isPending: false }),
}));

vi.mock("../FrameworkMapper", () => ({
  default: () => <div data-testid="framework-mapper-tab" />,
}));
vi.mock("../ScenarioBuilder", () => ({
  default: () => <div data-testid="scenario-builder-tab" />,
}));
vi.mock("../UnifiedInsights", () => ({
  default: () => <div data-testid="unified-insights-tab" />,
}));

import GovernanceOS from "../index";

describe("GovernanceOS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMappings = [];
    mockScenarios = [];
    mockPreferences = null;
  });

  it("shows the enable CTA when the module is not enabled", () => {
    renderWithProviders(<GovernanceOS />, { route: "/governance-os" });

    expect(screen.getAllByText("Core Governance OS").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Enable Governance Intelligence" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("framework-mapper-tab")).not.toBeInTheDocument();
  });

  it("shows the tabbed interface with summary cards when enabled", () => {
    mockPreferences = { is_enabled: true };
    mockMappings = [
      { id: 1, mapping_strength: "direct", domain_tag: "privacy" },
      { id: 2, mapping_strength: "partial", domain_tag: "security" },
    ];
    mockScenarios = [{ id: 1, name: "Scenario 1" }];

    renderWithProviders(<GovernanceOS />, { route: "/governance-os" });

    expect(screen.getByText("Total Mappings")).toBeInTheDocument();
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getByText("Direct Mappings")).toBeInTheDocument();
    expect(screen.getByText("Governance Domains")).toBeInTheDocument();
    expect(screen.getByText("Scenarios")).toBeInTheDocument();
    expect(screen.getByTestId("framework-mapper-tab")).toBeInTheDocument();
  });

  it("switches tabs and navigates when a tab is clicked", () => {
    mockPreferences = { is_enabled: true };

    renderWithProviders(<GovernanceOS />, { route: "/governance-os" });

    fireEvent.click(screen.getByRole("tab", { name: /Scenario Builder/i }));

    expect(mockNavigate).toHaveBeenCalledWith("/governance-os/scenarios", { replace: true });
    expect(screen.getByTestId("scenario-builder-tab")).toBeInTheDocument();
  });

  it("initializes the active tab from the route param", () => {
    mockPreferences = { is_enabled: true };

    renderWithProviders(
      <Routes>
        <Route path="/governance-os/:tab" element={<GovernanceOS />} />
      </Routes>,
      { route: "/governance-os/insights" },
    );

    expect(screen.getByTestId("unified-insights-tab")).toBeInTheDocument();
  });
});
