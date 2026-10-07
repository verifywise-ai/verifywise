import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { StatsCard } from "../index";

vi.mock("../../../ProjectCard/ProgressBar", () => ({
  default: ({ progress }: { progress: string }) => (
    <div data-testid="progress-bar" data-progress={progress} />
  ),
}));

describe("StatsCard", () => {
  it("renders completed out of total", () => {
    renderWithProviders(<StatsCard title="Tasks" completed={5} total={10} />);
    expect(screen.getByText("Tasks: 5 of 10 completed")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByTestId("progress-bar")).toHaveAttribute("data-progress", "5/10");
  });

  // Callers pass undefined/null until their progress request returns, so a
  // 0 is never shown (or read as "nothing connected") before the data says so.
  it.each([undefined, null])("shows a skeleton while total is %p", (total) => {
    renderWithProviders(<StatsCard title="Clauses" completed={undefined} total={total} />);
    expect(screen.queryByText(/no regulation connected/i)).not.toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.queryByTestId("progress-bar")).not.toBeInTheDocument();
  });

  it("renders the empty state once loaded with a total of 0", () => {
    renderWithProviders(<StatsCard title="Clauses" completed={0} total={0} />);
    expect(screen.getByText(/no regulation connected/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "link a framework to track progress" }),
    ).toHaveAttribute("href", "/framework");
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.queryByTestId("progress-bar")).not.toBeInTheDocument();
  });

  it("handles NaN completed gracefully", () => {
    renderWithProviders(<StatsCard title="Tasks" completed={NaN} total={10} />);
    expect(screen.getByText("Tasks: 0 of 10 completed")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("clamps negative completed to 0", () => {
    renderWithProviders(<StatsCard title="Tasks" completed={-5} total={10} />);
    expect(screen.getByText("Tasks: 0 of 10 completed")).toBeInTheDocument();
  });

  it("floors the percentage", () => {
    renderWithProviders(<StatsCard title="Tests" completed={7} total={9} />);
    expect(screen.getByText("77%")).toBeInTheDocument();
  });
});
