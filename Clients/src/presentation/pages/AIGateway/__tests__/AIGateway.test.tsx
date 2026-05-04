import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock network services (API calls)
vi.mock("../../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock chart components from recharts
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  PieChart: ({ children }: any) => <div>{children}</div>,
  Pie: () => <div />,
  Cell: () => <div />,
  AreaChart: ({ children }: any) => <div>{children}</div>,
  Area: () => <div />,
  Legend: () => <div />,
}));

// Mock chart enhancements
vi.mock("../../../components/Charts/chartEnhancements", () => ({
  GradientDef: () => <div />,
  DonutCenterLabel: () => <div />,
  chartTooltipStyle: {},
  getProviderColor: () => "#000",
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

// Mock EmptyState
vi.mock("../../../components/EmptyState", () => ({
  EmptyState: ({ message }: any) => <div data-testid="empty-state">{message}</div>,
}));

vi.mock("../../../components/EmptyState/EmptyStateTip", () => ({
  default: () => <div data-testid="empty-state-tip" />,
}));

// Mock shared utilities
vi.mock("../shared", () => ({
  sectionTitleSx: {},
  useCardSx: () => ({}),
  GUARDRAIL_ACTION_COLORS: {},
  formatEntityType: (v: string) => v,
}));

// Mock UserGuideSidebarContext
vi.mock("../../../components/UserGuide/UserGuideSidebarContext", () => ({
  useUserGuideSidebarContext: () => ({
    open: vi.fn(),
    openTab: vi.fn(),
  }),
}));

// Mock MockDashboard and OnboardingOverlay
vi.mock("../SpendDashboard/MockDashboard", () => ({
  default: () => <div data-testid="mock-dashboard" />,
}));

vi.mock("../SpendDashboard/OnboardingOverlay", () => ({
  default: () => <div data-testid="onboarding-overlay" />,
}));

import SpendDashboardPage from "../SpendDashboard";

describe("AIGateway - SpendDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    renderWithProviders(<SpendDashboardPage />, { route: "/ai-gateway/dashboard" });

    expect(screen.getByTestId("page-header")).toBeInTheDocument();
  });
});
