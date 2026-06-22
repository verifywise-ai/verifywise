import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import AIContentStats from "../index";

const mockData = {
  total: 50,
  reviewed: 30,
  unreviewed: 20,
  review_rate: 60,
  by_badge_type: {
    generated: 20,
    assisted: 15,
    reviewed: 10,
    suggested: 5,
  },
  by_review_action: {
    approved: 15,
    modified: 10,
    rejected: 5,
  },
  avg_confidence: 82,
};

describe("AIContentStats", () => {
  it("renders loading state", () => {
    renderWithProviders(<AIContentStats data={null} isLoading />);
    expect(document.querySelector(".MuiLinearProgress-root")).toBeInTheDocument();
  });

  it("renders empty state when data is null", () => {
    renderWithProviders(<AIContentStats data={null} />);
    expect(screen.getByText("No AI-generated content tracked yet.")).toBeInTheDocument();
  });

  it("renders empty state when total is 0", () => {
    renderWithProviders(
      <AIContentStats
        data={{
          total: 0,
          reviewed: 0,
          unreviewed: 0,
          review_rate: 0,
          by_badge_type: { generated: 0, assisted: 0, reviewed: 0, suggested: 0 },
          by_review_action: { approved: 0, modified: 0, rejected: 0 },
          avg_confidence: null,
        }}
      />,
    );
    expect(screen.getByText("No AI-generated content tracked yet.")).toBeInTheDocument();
  });

  it("renders normal data with all stats", () => {
    renderWithProviders(<AIContentStats data={mockData} />);
    expect(screen.getByText("AI content transparency")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
  });

  it("does not show avg_confidence when null", () => {
    renderWithProviders(<AIContentStats data={{ ...mockData, avg_confidence: null }} />);
    expect(screen.queryByText("82%")).not.toBeInTheDocument();
  });

  it("renders badge type breakdown labels", () => {
    renderWithProviders(<AIContentStats data={mockData} />);
    expect(screen.getByText("AI-generated")).toBeInTheDocument();
    expect(screen.getByText("AI-assisted")).toBeInTheDocument();
    expect(screen.getByText("AI-reviewed")).toBeInTheDocument();
    expect(screen.getByText("AI-suggested")).toBeInTheDocument();
  });

  it("renders review action chips when values > 0", () => {
    renderWithProviders(<AIContentStats data={mockData} />);
    expect(screen.getByText("15 Approved")).toBeInTheDocument();
    expect(screen.getByText("10 Modified")).toBeInTheDocument();
    expect(screen.getByText("5 Rejected")).toBeInTheDocument();
  });

  it("does not render review action section when all zero", () => {
    renderWithProviders(
      <AIContentStats
        data={{
          ...mockData,
          by_review_action: { approved: 0, modified: 0, rejected: 0 },
        }}
      />,
    );
    expect(screen.queryByText("Review outcomes")).not.toBeInTheDocument();
  });

  it("shows review progress bar with correct values", () => {
    renderWithProviders(<AIContentStats data={mockData} />);
    expect(screen.getByText("30/50")).toBeInTheDocument();
  });

  it("renders by type section heading", () => {
    renderWithProviders(<AIContentStats data={mockData} />);
    expect(screen.getByText("By type")).toBeInTheDocument();
  });

  it("shows percentages for badge types", () => {
    renderWithProviders(<AIContentStats data={mockData} />);
    expect(screen.getByText("20 (40%)")).toBeInTheDocument();
    expect(screen.getByText("15 (30%)")).toBeInTheDocument();
  });
});
