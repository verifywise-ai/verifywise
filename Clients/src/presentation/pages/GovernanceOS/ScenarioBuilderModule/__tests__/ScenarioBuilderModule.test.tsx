import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

vi.mock("../../../../../application/hooks/useGovernanceOs", () => ({
  useScenarios: () => ({ data: [], isLoading: false }),
  useGovernancePreferences: () => ({ data: null }),
  useUpdatePreferences: () => ({ mutate: vi.fn(), isPending: false }),
  useGovernanceRecommendations: () => ({ mutate: vi.fn(), data: undefined, isPending: false }),
  useCreateScenario: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateScenario: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteScenario: () => ({ mutate: vi.fn(), isPending: false }),
  useActivateScenario: () => ({ mutate: vi.fn(), isPending: false }),
  useSimulateScenario: () => ({ mutate: vi.fn(), data: undefined, isPending: false, error: null }),
}));

vi.mock("../../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ approvedProjects: [], isLoading: false }),
}));

vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [], loading: false }),
}));

vi.mock("../../../../components/GovernanceOS/ActivationWizard", () => ({
  default: () => null,
}));
vi.mock("../../../../components/GovernanceOS/WhatIfSimulator", () => ({
  default: () => <div data-testid="what-if-simulator" />,
}));
vi.mock("../../../../components/GovernanceOS/ScenarioComparison", () => ({
  default: () => <div data-testid="scenario-comparison" />,
}));
vi.mock("../../../../components/GovernanceOS/ActiveScenarioPanel", () => ({
  default: () => <div data-testid="active-scenario-panel" />,
}));
vi.mock("../../../../components/GovernanceOS/ActivationHistory", () => ({
  default: () => <div data-testid="activation-history" />,
}));

import ScenarioBuilderModule from "../index";

describe("ScenarioBuilderModule", () => {
  it("renders the governance layout with the scenario builder title and content", () => {
    renderWithProviders(<ScenarioBuilderModule />, { route: "/governance/scenarios" });

    expect(screen.getAllByText("Scenario Builder").length).toBeGreaterThan(0);
    expect(screen.getByText(/Get framework recommendations based on your organization context/)).toBeInTheDocument();
    expect(screen.getByText("All Governance Scenarios")).toBeInTheDocument();
  });

  it("marks the scenarios tab as active", () => {
    renderWithProviders(<ScenarioBuilderModule />, { route: "/governance/scenarios" });

    const tab = screen.getByRole("tab", { name: /Scenario Builder/i });
    expect(tab).toHaveAttribute("aria-selected", "true");
  });
});
