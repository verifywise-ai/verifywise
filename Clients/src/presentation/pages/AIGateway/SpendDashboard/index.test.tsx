import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

vi.mock("../../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
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

vi.mock("../../../components/Charts/chartEnhancements", () => ({
  GradientDef: () => <div />,
  DonutCenterLabel: ({ value }: any) => <div data-testid="donut-center-label">{value}</div>,
  chartTooltipStyle: {},
  getProviderColor: () => "#000",
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title, actionButton, summaryCards }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <div data-testid="action-button">{actionButton}</div>
      <div data-testid="summary-cards">{summaryCards}</div>
      {children}
    </div>
  ),
}));

vi.mock("../../../components/Cards/StatCard", () => ({
  StatCard: ({ title, value }: any) => (
    <div data-testid={`stat-${title}`}>
      {title}: {value}
    </div>
  ),
}));

vi.mock("../../../components/EmptyState", () => ({
  EmptyState: ({ message, children }: any) => (
    <div data-testid="empty-state">
      <span>{message}</span>
      {children}
    </div>
  ),
}));
vi.mock("../../../components/EmptyState/EmptyStateTip", () => ({
  default: ({ title }: any) => <div data-testid="empty-state-tip">{title}</div>,
}));

vi.mock("../../../components/UserGuide/UserGuideSidebarContext", () => ({
  useUserGuideSidebarContext: () => ({ open: vi.fn(), close: vi.fn() }),
}));

let capturedOnboardingProps: any = null;
vi.mock("./MockDashboard", () => ({
  default: () => <div data-testid="mock-dashboard" />,
}));
vi.mock("./OnboardingOverlay", () => ({
  default: (props: any) => {
    capturedOnboardingProps = props;
    return <div data-testid="onboarding-overlay" />;
  },
}));

import { apiServices } from "../../../../infrastructure/api/networkServices";
import SpendDashboardPage from "./index";

const mockGet = apiServices.get as unknown as ReturnType<typeof vi.fn>;

const mockSpendData = {
  summary: { total_cost: 12.3456, total_requests: 500, total_tokens: 123456, avg_latency_ms: 245.6 },
  by_day: [{ day: "2025-01-01", total_cost: 5 }],
  by_model: [
    { group_key: "gpt-4o", total_cost: 8, total_requests: 300, total_tokens: 90000 },
    { group_key: "gpt-4o-mini", total_cost: 4.3456, total_requests: 200, total_tokens: 33456 },
  ],
  by_provider: [{ group_key: "openai", total_cost: 12.3456 }],
  error_rate_by_day: [{ day: "2025-01-01", error_rate: 2 }],
  tokens_per_endpoint: [{ endpoint: "prod", avg_tokens_per_request: 300 }],
};

function mockNonFirstTime(overrides: {
  spend?: any;
  byEndpoint?: any[];
  byUser?: any[];
  guardrails?: any;
  cache?: any;
} = {}) {
  mockGet.mockImplementation((url: string) => {
    if (url.includes("/ai-gateway/spend/logs?limit=1")) {
      return Promise.resolve({ data: { total: 1 } });
    }
    if (url.includes("/ai-gateway/spend/by-endpoint")) {
      return Promise.resolve({ data: { data: overrides.byEndpoint ?? [] } });
    }
    if (url.includes("/ai-gateway/spend/by-user")) {
      return Promise.resolve({
        data: {
          data: overrides.byUser ?? [
            { group_key: "jane@example.com", total_requests: 100, total_tokens: 5000, total_cost: 3.5 },
          ],
        },
      });
    }
    if (url.includes("/ai-gateway/guardrails/stats")) {
      return Promise.resolve({
        data: overrides.guardrails ?? {
          summary: { blocked: 3, masked: 2, total: 5 },
          byType: [{ guardrail_type: "email_address", action_taken: "blocked", count: 3 }],
          byDay: [{ day: "2025-01-01", blocked: 1, masked: 1 }],
          byEndpoint: [{ endpoint_name: "prod", blocked: 2, masked: 1, count: 3 }],
        },
      });
    }
    if (url.includes("/ai-gateway/cache/stats")) {
      return Promise.resolve({ data: { stats: overrides.cache ?? null } });
    }
    if (url.includes("/ai-gateway/spend")) {
      return Promise.resolve({ data: overrides.spend ?? mockSpendData });
    }
    return Promise.resolve({ data: {} });
  });
}

function mockFirstTime(setup: { keys?: any[]; endpoints?: any[]; vkeys?: any[] } = {}) {
  mockGet.mockImplementation((url: string) => {
    if (url.includes("/ai-gateway/spend/logs?limit=1")) {
      return Promise.resolve({ data: { total: 0 } });
    }
    if (url.includes("/ai-gateway/keys")) {
      return Promise.resolve({ data: { data: setup.keys ?? [] } });
    }
    if (url.includes("/ai-gateway/endpoints")) {
      return Promise.resolve({ data: { endpoints: setup.endpoints ?? [] } });
    }
    if (url.includes("/ai-gateway/virtual-keys")) {
      return Promise.resolve({ data: { data: setup.vkeys ?? [] } });
    }
    return Promise.resolve({ data: {} });
  });
}

describe("AIGateway - SpendDashboard (index)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    capturedOnboardingProps = null;
  });

  it("shows the first-time onboarding overlay over a blurred mock dashboard when there are no logs", async () => {
    mockFirstTime({ keys: [{ id: 1 }], endpoints: [], vkeys: [] });
    renderWithProviders(<SpendDashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-overlay")).toBeInTheDocument();
    });
    expect(screen.getByTestId("mock-dashboard")).toBeInTheDocument();
    expect(capturedOnboardingProps.setupStatus).toEqual({
      hasApiKey: true,
      hasEndpoint: false,
      hasVirtualKey: false,
      hasRequests: false,
    });
  });

  it("renders stat cards with formatted totals once real data loads", async () => {
    mockNonFirstTime();
    renderWithProviders(<SpendDashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("stat-Total cost")).toHaveTextContent("$12.3456");
    });
    expect(screen.getByTestId("stat-Total requests")).toHaveTextContent("500");
    expect(screen.getByTestId("stat-Total tokens")).toHaveTextContent("123,456");
    expect(screen.getByTestId("stat-Avg latency")).toHaveTextContent("246ms");
  });

  it("shows cache stat cards only when cache has entries", async () => {
    mockNonFirstTime({ cache: { total_entries: 10, hit_rate_pct: 42, total_cost_saved: 3.21 } });
    renderWithProviders(<SpendDashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("stat-Cache hit rate")).toHaveTextContent("42%");
    });
    expect(screen.getByTestId("stat-Cost saved")).toHaveTextContent("$3.21");
  });

  it("does not show cache stat cards when there are no cache entries", async () => {
    mockNonFirstTime({ cache: { total_entries: 0 } });
    renderWithProviders(<SpendDashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("stat-Total cost")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("stat-Cache hit rate")).not.toBeInTheDocument();
  });

  it("renders the cost-by-model, top users, and guardrail activity sections", async () => {
    mockNonFirstTime();
    renderWithProviders(<SpendDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Cost by model")).toBeInTheDocument();
    });
    // "gpt-4o" appears in both the "Cost by model" and "Cost per request" lists.
    expect(screen.getAllByText("gpt-4o").length).toBeGreaterThan(0);
    expect(screen.getByText("Top users")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByText("Guardrails activity")).toBeInTheDocument();
    expect(screen.getByText("blocked")).toBeInTheDocument();
    expect(screen.getByText("masked")).toBeInTheDocument();
    expect(screen.getByText("5 total")).toBeInTheDocument();
    expect(screen.getByText("email address")).toBeInTheDocument(); // formatEntityType
  });

  it("shows an empty state when there is no analytics data for the period", async () => {
    mockNonFirstTime({
      spend: { summary: { total_cost: 0, total_requests: 0, total_tokens: 0, avg_latency_ms: 0 } },
    });
    renderWithProviders(<SpendDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/No analytics data for this period/)).toBeInTheDocument();
    });
  });

  it("falls back to a non-first-time empty state when the main spend fetch fails", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/ai-gateway/spend/logs?limit=1")) {
        return Promise.resolve({ data: { total: 1 } });
      }
      if (url.includes("/ai-gateway/spend")) {
        return Promise.reject(new Error("boom"));
      }
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<SpendDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/No analytics data for this period/)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("onboarding-overlay")).not.toBeInTheDocument();
  });

  it("changes the analytics period and persists it to storage", async () => {
    mockNonFirstTime();
    renderWithProviders(<SpendDashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("stat-Total cost")).toBeInTheDocument();
    });

    const combo = screen.getByRole("combobox");
    fireEvent.mouseDown(combo);
    fireEvent.click(screen.getByRole("option", { name: "7 days" }));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining("period=7d"));
    });
    expect(window.localStorage.getItem("verifywise_ai_gateway_analytics_period")).toBe("7d");
  });
});
