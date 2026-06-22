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
    renderWithProviders(
      <StatsCard title="tasks" completed={5} total={10} progressbarColor="#4caf50" />,
    );
    expect(screen.getByText("5 tasks out of 10 is completed")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("renders 0% when total is 0", () => {
    renderWithProviders(
      <StatsCard title="items" completed={0} total={0} progressbarColor="#4caf50" />,
    );
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("0 items out of 0 is completed")).toBeInTheDocument();
  });

  it("handles NaN completed gracefully", () => {
    renderWithProviders(
      <StatsCard title="tasks" completed={NaN} total={10} progressbarColor="#4caf50" />,
    );
    expect(screen.getByText("0 tasks out of 10 is completed")).toBeInTheDocument();
  });

  it("handles negative values gracefully", () => {
    renderWithProviders(
      <StatsCard title="tasks" completed={-5} total={10} progressbarColor="#4caf50" />,
    );
    expect(screen.getByText("0 tasks out of 10 is completed")).toBeInTheDocument();
  });

  it("renders progress bar with correct progress", () => {
    renderWithProviders(
      <StatsCard title="tests" completed={7} total={10} progressbarColor="#4caf50" />,
    );
    expect(screen.getByTestId("progress-bar")).toHaveAttribute("data-progress", "7/10");
  });
});
