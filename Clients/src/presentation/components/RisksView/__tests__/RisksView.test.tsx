import { vi } from "vitest";

vi.mock("../../Cards/StatusTileCards", () => ({
  StatusTileCards: () => <div data-testid="status-tiles" />,
}));
vi.mock("../../RiskVisualization/RiskVisualizationTabs", () => ({
  default: () => <div data-testid="risk-viz-tabs" />,
}));
vi.mock("../../RiskVisualization/RiskFilters", () => ({
  default: () => <div data-testid="risk-filters" />,
}));
vi.mock("../../Table/VWProjectRisksTable", () => ({
  default: () => <div data-testid="risks-table" />,
}));
vi.mock("../../AddNewRiskForm", () => ({
  default: () => <div data-testid="add-risk-form" />,
}));
vi.mock("../../Popup", () => ({
  default: () => null,
}));
vi.mock("../../../../application/tools/alertUtils", () => ({
  handleAlert: vi.fn(),
}));
vi.mock("../../Alert", () => ({
  default: () => null,
}));
vi.mock("../../../../application/repository/entity.repository", () => ({
  deleteEntityById: vi.fn(),
}));
vi.mock("../../Toast", () => ({
  default: () => null,
}));
vi.mock("../../Skeletons", () => ({
  default: () => <div data-testid="skeleton" />,
}));
vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [], loading: false }),
}));

import { renderWithProviders } from "../../../../test/renderWithProviders";
import RisksView from "../index";

describe("RisksView", () => {
  const defaultProps = {
    fetchRisks: vi.fn().mockResolvedValue([]),
    title: "Project Risks",
  };

  it("renders without crashing", () => {
    renderWithProviders(<RisksView {...defaultProps} />);
    expect(document.body).toBeTruthy();
  });
});
