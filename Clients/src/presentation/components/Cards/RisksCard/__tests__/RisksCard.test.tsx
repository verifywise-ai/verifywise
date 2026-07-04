import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { RisksCard } from "../index";
import type { EnhancedRiskSummary } from "../../../../../domain/interfaces/i.riskSummary";

const baseSummary: EnhancedRiskSummary = {
  total: 100,
  veryHighRisks: 10,
  highRisks: 20,
  mediumRisks: 30,
  lowRisks: 25,
  veryLowRisks: 15,
};

describe("RisksCard", () => {
  it("renders all risk levels", () => {
    renderWithProviders(<RisksCard risksSummary={baseSummary} />);
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Very high")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("Low")).toBeInTheDocument();
    expect(screen.getByText("Very low")).toBeInTheDocument();
  });

  it("renders correct values", () => {
    renderWithProviders(<RisksCard risksSummary={baseSummary} />);
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("handles NaN values gracefully", () => {
    renderWithProviders(<RisksCard risksSummary={{ ...baseSummary, veryHighRisks: NaN }} />);
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("handles click on Total tile when onCardClick provided", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<RisksCard risksSummary={baseSummary} onCardClick={handleClick} />);
    await user.click(screen.getByText("Total"));
    expect(handleClick).toHaveBeenCalledWith("");
  });

  it("handles click on risk level tile", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<RisksCard risksSummary={baseSummary} onCardClick={handleClick} />);
    await user.click(screen.getByText("High"));
    expect(handleClick).toHaveBeenCalledWith("High");
  });

  it("clears filter when clicking already selected level", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <RisksCard risksSummary={baseSummary} onCardClick={handleClick} selectedLevel="High" />,
    );
    await user.click(screen.getByText("High"));
    expect(handleClick).toHaveBeenCalledWith("");
  });

  it("renders trend indicators when trends provided", () => {
    renderWithProviders(
      <RisksCard
        risksSummary={{
          ...baseSummary,
          trends: {
            veryHighTrend: { direction: "up", change: 3, period: "week" },
            highTrend: { direction: "down", change: 2, period: "week" },
            mediumTrend: { direction: "stable", change: 0, period: "week" },
            lowTrend: { direction: "up", change: 1, period: "month" },
            veryLowTrend: { direction: "down", change: 5, period: "month" },
          },
        }}
      />,
    );
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("shows selected state on a tile", () => {
    renderWithProviders(<RisksCard risksSummary={baseSummary} selectedLevel="Medium" />);
    expect(screen.getByText("Medium")).toBeInTheDocument();
  });
});
