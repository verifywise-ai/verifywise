import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { SmallStatsCard } from "../index";

vi.mock("../../../ProjectCard/ProgressBar", () => ({
  default: ({ progress }: { progress: string }) => (
    <div data-testid="progress-bar" data-progress={progress} />
  ),
}));

describe("SmallStatsCard", () => {
  it("renders with default props", () => {
    renderWithProviders(<SmallStatsCard />);
    expect(screen.getByText("Compliance tracker completion rate")).toBeInTheDocument();
    expect(screen.getByText("6000%")).toBeInTheDocument();
    expect(screen.getByTestId("progress-bar")).toBeInTheDocument();
  });

  it("renders with custom props", () => {
    renderWithProviders(
      <SmallStatsCard attributeTitle="Risk score" rate={0.85} progress="85/100" />,
    );
    expect(screen.getByText("Risk score completion rate")).toBeInTheDocument();
    expect(screen.getByText("85%")).toBeInTheDocument();
  });

  it("renders progress bar with custom progress", () => {
    renderWithProviders(<SmallStatsCard progress="50/100" />);
    expect(screen.getByTestId("progress-bar")).toHaveAttribute("data-progress", "50/100");
  });

  it("has small-stats-card class on the stack", () => {
    const { container } = renderWithProviders(<SmallStatsCard />);
    expect(container.querySelector(".small-stats-card")).toBeInTheDocument();
  });
});
