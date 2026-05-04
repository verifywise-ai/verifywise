import { vi } from "vitest";

vi.mock("../../../../application/repository/modelInventoryHistory.repository", () => ({
  getModelInventoryTimeseries: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock("../../button-toggle", () => ({
  ButtonToggle: () => <div data-testid="button-toggle" />,
}));
vi.mock("../../Skeletons", () => ({
  default: () => <div data-testid="skeleton" />,
}));
vi.mock("../../EmptyState", () => ({
  EmptyState: () => <div data-testid="empty-state" />,
}));
vi.mock("../VWCharts", () => ({
  VWLineChart: () => <div data-testid="line-chart" />,
}));

import { renderWithProviders } from "../../../../test/renderWithProviders";
import { ModelInventoryHistoryChart } from "../ModelInventoryHistoryChart";

describe("ModelInventoryHistoryChart", () => {
  it("renders without crashing", () => {
    renderWithProviders(<ModelInventoryHistoryChart />);
    expect(document.body).toBeTruthy();
  });

  it("renders with custom props", () => {
    renderWithProviders(<ModelInventoryHistoryChart parameter="risk_level" height={300} />);
    expect(document.body).toBeTruthy();
  });
});
