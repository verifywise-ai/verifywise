import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

// Auth identity now comes from the useAuth hook (Redux JWT), not the legacy context.
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1, organizationId: 1 }),
}));

vi.mock("../../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ data: [], isLoading: false }),
}));

vi.mock("../../../../../application/hooks/useGovernanceOs", () => ({
  useCoverage: () => ({ data: undefined, isLoading: false }),
  useRefreshCoverage: () => ({ mutate: vi.fn(), isPending: false }),
  useScenarios: () => ({ data: [] }),
  useGovernancePreferences: () => ({ data: null }),
}));

vi.mock("../../../../components/GovernanceOS/CoverageChart", () => ({
  default: () => <div data-testid="coverage-chart" />,
}));

vi.mock("../../../../components/GovernanceOS/MappingStatsPanel", () => ({
  default: () => <div data-testid="mapping-stats-panel" />,
}));

vi.mock("../../../../components/Modals/CreateTask", () => ({
  default: () => null,
}));

import UnifiedInsightsModule from "../index";

describe("UnifiedInsightsModule", () => {
  it("renders the governance layout with the unified insights title and content", () => {
    renderWithProviders(<UnifiedInsightsModule />, { route: "/governance/insights" });

    expect(screen.getAllByText("Unified Insights").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/View cross-framework coverage analysis per project/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Select a project to view its cross-framework coverage analysis."),
    ).toBeInTheDocument();
  });

  it("marks the insights tab as active", () => {
    renderWithProviders(<UnifiedInsightsModule />, { route: "/governance/insights" });

    const tab = screen.getByRole("tab", { name: /Unified Insights/i });
    expect(tab).toHaveAttribute("aria-selected", "true");
  });
});
