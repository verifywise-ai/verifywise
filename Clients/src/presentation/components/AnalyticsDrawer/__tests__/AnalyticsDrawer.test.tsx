import { vi } from "vitest";

vi.mock("../../Charts/ModelInventoryHistoryChart", () => ({
  ModelInventoryHistoryChart: () => <div data-testid="model-chart" />,
}));

vi.mock("../../Charts/RiskHistoryChart", () => ({
  RiskHistoryChart: () => <div data-testid="risk-chart" />,
}));

vi.mock("../../button-toggle", () => ({
  ButtonToggle: ({ options }: any) => (
    <div data-testid="button-toggle">
      {options?.map((o: any) => (
        <span key={o.value}>{o.label}</span>
      ))}
    </div>
  ),
}));

import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import AnalyticsDrawer from "../index";

describe("AnalyticsDrawer", () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    title: "Analytics & Trends",
    description: "Track history over time",
    entityName: "Model",
    availableParameters: [
      { value: "status", label: "Status" },
      { value: "type", label: "Type" },
    ],
  };

  it("renders drawer with title when open", () => {
    renderWithProviders(<AnalyticsDrawer {...defaultProps} />);
    expect(screen.getByText("Analytics & Trends")).toBeInTheDocument();
  });

  it("renders description", () => {
    renderWithProviders(<AnalyticsDrawer {...defaultProps} />);
    expect(screen.getByText("Track history over time")).toBeInTheDocument();
  });

  it("does not show content when closed", () => {
    renderWithProviders(<AnalyticsDrawer {...defaultProps} open={false} />);
    expect(screen.queryByText("Analytics & Trends")).not.toBeInTheDocument();
  });
});
