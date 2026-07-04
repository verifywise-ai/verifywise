import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { TaskRadarCard } from "../index";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: ({ children }: { children?: React.ReactNode }) => <div data-testid="bar">{children}</div>,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="chart-tooltip" />,
  Cell: ({ children }: { children?: React.ReactNode }) => <div data-testid="cell">{children}</div>,
}));

describe("TaskRadarCard", () => {
  it("renders title and chart", () => {
    renderWithProviders(<TaskRadarCard overdue={2} due={3} upcoming={5} />);
    expect(screen.getByText("Task radar")).toBeInTheDocument();
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
  });

  it("renders zero values", () => {
    renderWithProviders(<TaskRadarCard overdue={0} due={0} upcoming={0} />);
    expect(screen.getByText("Task radar")).toBeInTheDocument();
  });

  it("renders with different data values", () => {
    renderWithProviders(<TaskRadarCard overdue={10} due={20} upcoming={30} />);
    expect(screen.getByText("Task radar")).toBeInTheDocument();
  });
});
