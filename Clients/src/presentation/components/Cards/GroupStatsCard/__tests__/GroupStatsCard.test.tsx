import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { GroupStatsCard } from "../index";

vi.mock("../../../ProjectCard/ProgressBar", () => ({
  default: ({ progress }: { progress: string }) => (
    <div data-testid="progress-bar" data-progress={progress} />
  ),
}));

describe("GroupStatsCard", () => {
  const defaultProps = {
    title: ["tasks", "reports"],
    completed: [5, 3],
    total: [10, 6],
    progressbarColor: "#4caf50",
  };

  it("renders stats for each group", () => {
    renderWithProviders(<GroupStatsCard {...defaultProps} />);
    expect(screen.getByText("5 tasks out of 10 is completed")).toBeInTheDocument();
    expect(screen.getByText("3 reports out of 6 is completed")).toBeInTheDocument();
    const pcts = screen.getAllByText("50%");
    expect(pcts).toHaveLength(2);
  });

  it("renders progress bars", () => {
    renderWithProviders(<GroupStatsCard {...defaultProps} />);
    const bars = screen.getAllByTestId("progress-bar");
    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveAttribute("data-progress", "5/10");
    expect(bars[1]).toHaveAttribute("data-progress", "3/6");
  });

  it("handles single item", () => {
    renderWithProviders(
      <GroupStatsCard title={["tasks"]} completed={[8]} total={[10]} progressbarColor="#4caf50" />,
    );
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("8 tasks out of 10 is completed")).toBeInTheDocument();
  });

  it("handles NaN and negative values gracefully", () => {
    renderWithProviders(
      <GroupStatsCard title={["bad"]} completed={[NaN]} total={[-1]} progressbarColor="#4caf50" />,
    );
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("0 bad out of 0 is completed")).toBeInTheDocument();
  });

  it("handles zero totals", () => {
    renderWithProviders(
      <GroupStatsCard title={["zero"]} completed={[0]} total={[0]} progressbarColor="#4caf50" />,
    );
    const percentages = screen.getAllByText("0%");
    expect(percentages.length).toBeGreaterThanOrEqual(1);
  });
});
