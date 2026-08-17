import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
}));

import MockDashboard from "./MockDashboard";

describe("MockDashboard", () => {
  it("renders the stat cards with static demo values", () => {
    renderWithProviders(<MockDashboard />);

    expect(screen.getByText("Total cost")).toBeInTheDocument();
    expect(screen.getByText("$47.82")).toBeInTheDocument();
    expect(screen.getByText("Total requests")).toBeInTheDocument();
    expect(screen.getByText("1,247")).toBeInTheDocument();
    expect(screen.getByText("Total tokens")).toBeInTheDocument();
    expect(screen.getByText("892,340")).toBeInTheDocument();
    expect(screen.getByText("Avg latency")).toBeInTheDocument();
    expect(screen.getByText("245ms")).toBeInTheDocument();
  });

  it("renders the cost-over-time chart section", () => {
    renderWithProviders(<MockDashboard />);
    expect(screen.getByText("Cost over time")).toBeInTheDocument();
  });

  it("renders cost-by-model rows with request/token counts and cost", () => {
    renderWithProviders(<MockDashboard />);

    expect(screen.getByText("Cost by model")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
    expect(screen.getByText("621 req")).toBeInTheDocument();
    expect(screen.getByText("498,200 tok")).toBeInTheDocument();
    expect(screen.getByText("$28.41")).toBeInTheDocument();
    expect(screen.getByText("claude-sonnet-3-5")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o-mini")).toBeInTheDocument();
  });

  it("renders cost-by-endpoint rows with request counts and cost", () => {
    renderWithProviders(<MockDashboard />);

    expect(screen.getByText("Cost by endpoint")).toBeInTheDocument();
    expect(screen.getByText("prod-gpt4o")).toBeInTheDocument();
    expect(screen.getByText("847 req")).toBeInTheDocument();
    expect(screen.getByText("$35.15")).toBeInTheDocument();
    expect(screen.getByText("staging-claude")).toBeInTheDocument();
    // $12.67 also happens to be claude-sonnet-3-5's cost in the model table.
    expect(screen.getAllByText("$12.67").length).toBeGreaterThan(0);
  });
});
