import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock the Shadow AI repository (all async calls)
vi.mock("../../../../application/repository/shadowAi.repository", () => ({
  getInsightsSummary: vi.fn().mockResolvedValue({
    total_tools: 0,
    total_users: 0,
    high_risk_tools: 0,
    departments: 0,
  }),
  getToolsByEvents: vi.fn().mockResolvedValue([]),
  getToolsByUsers: vi.fn().mockResolvedValue([]),
  getUsersByDepartment: vi.fn().mockResolvedValue([]),
  getTools: vi.fn().mockResolvedValue([]),
}));

// Mock chart components
vi.mock("../../../components/Charts/VWCharts", () => ({
  VWBarChart: () => <div data-testid="bar-chart" />,
  VWDonutChart: () => <div data-testid="donut-chart" />,
}));

// Mock PageHeaderExtended
vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

// Mock StatCard
vi.mock("../../../components/Cards/StatCard", () => ({
  StatCard: ({ title }: any) => <div data-testid={`stat-${title}`} />,
}));

// Mock DashboardCard
vi.mock("../../../components/Cards/DashboardCard", () => ({
  DashboardCard: ({ title, children }: any) => (
    <div data-testid={`dashboard-card-${title}`}>{children}</div>
  ),
}));

// Mock onboarding modal
vi.mock("../../../components/Modals/ShadowAIOnboarding", () => ({
  default: () => <div data-testid="shadow-ai-onboarding" />,
}));

import InsightsPage from "../InsightsPage";

describe("ShadowAI - InsightsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    renderWithProviders(<InsightsPage />, { route: "/shadow-ai/insights" });

    expect(screen.getByTestId("page-header")).toBeInTheDocument();
  });
});
