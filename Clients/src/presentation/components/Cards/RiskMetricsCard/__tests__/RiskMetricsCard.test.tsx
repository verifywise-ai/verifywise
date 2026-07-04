import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { RiskMetricsCard } from "../index";
import type { RiskMetrics } from "../../../../../domain/interfaces/i.riskSummary";

const baseMetrics: RiskMetrics = {
  riskVelocity: 3,
  mitigationProgress: 65,
  overdueCount: 5,
  totalFinancialImpact: 150000,
};

describe("RiskMetricsCard", () => {
  it("renders Risk Intelligence title", () => {
    renderWithProviders(<RiskMetricsCard metrics={baseMetrics} />);
    expect(screen.getByText("Risk Intelligence")).toBeInTheDocument();
  });

  it("renders risk velocity with direction", () => {
    renderWithProviders(<RiskMetricsCard metrics={baseMetrics} />);
    expect(screen.getByText(/↗/)).toBeInTheDocument();
  });

  it("renders negative risk velocity", () => {
    renderWithProviders(<RiskMetricsCard metrics={{ ...baseMetrics, riskVelocity: -2 }} />);
    expect(screen.getByText(/↘/)).toBeInTheDocument();
  });

  it("renders zero risk velocity as stable", () => {
    renderWithProviders(<RiskMetricsCard metrics={{ ...baseMetrics, riskVelocity: 0 }} />);
    expect(screen.getByText(/→/)).toBeInTheDocument();
  });

  it("renders mitigation progress percentage", () => {
    renderWithProviders(<RiskMetricsCard metrics={baseMetrics} />);
    expect(screen.getByText("65%")).toBeInTheDocument();
  });

  it("renders velocity data when provided", () => {
    renderWithProviders(
      <RiskMetricsCard
        metrics={baseMetrics}
        velocity={{ newRisksThisWeek: 4, resolvedRisksThisWeek: 2, overdueRisks: 5 }}
      />,
    );
    expect(screen.getByText("New This Week")).toBeInTheDocument();
    expect(screen.getByText("Resolved This Week")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("does not render velocity sections when velocity prop absent", () => {
    renderWithProviders(<RiskMetricsCard metrics={baseMetrics} />);
    expect(screen.queryByText("New This Week")).not.toBeInTheDocument();
    expect(screen.queryByText("Resolved This Week")).not.toBeInTheDocument();
  });
});
