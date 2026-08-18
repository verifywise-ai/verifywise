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

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title, actionButton }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {actionButton}
      {children}
    </div>
  ),
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
}));

vi.mock("../../../components/Charts/chartEnhancements", () => ({
  chartTooltipStyle: {},
}));

vi.mock("../MCPInvocationDrawer", () => ({
  default: ({ open, logId }: any) =>
    open ? <div data-testid="invocation-drawer">log {logId}</div> : null,
}));

import { apiServices } from "../../../../infrastructure/api/networkServices";
import MCPAuditLogPage from "./index";

const mockGet = apiServices.get as unknown as ReturnType<typeof vi.fn>;

const mockStats = {
  total_calls: 120,
  error_count: 6,
  avg_latency_ms: 245.6,
  unique_tools: 4,
  unique_agents: 2,
};

const mockToolStats = [
  { tool_name: "search", count: 80, avg_latency_ms: 200 },
  { tool_name: "get_weather", count: 40, avg_latency_ms: 300 },
];

const mockLogs = [
  {
    id: 1,
    agent_key_id: 5,
    agent_key_name: "Prod agent",
    tool_name: "search",
    result_status: "success",
    result_summary: "Found 3 results",
    is_error: false,
    latency_ms: 210,
    created_at: "2025-06-01T12:00:00Z",
  },
  {
    id: 2,
    agent_key_id: 6,
    tool_name: "drop_table",
    result_status: "blocked",
    result_summary: null,
    is_error: true,
    latency_ms: 5,
    created_at: "2025-06-02T12:00:00Z",
  },
];

function mockLoad(
  overrides: {
    stats?: any;
    toolStats?: any[];
    logs?: any[];
    total?: number;
  } = {},
) {
  mockGet.mockImplementation((url: string) => {
    if (url.includes("/audit/stats/by-tool")) {
      return Promise.resolve({ data: { data: overrides.toolStats ?? mockToolStats } });
    }
    if (url.includes("/audit/stats")) {
      return Promise.resolve({ data: { data: overrides.stats ?? mockStats } });
    }
    if (url.includes("/audit/logs")) {
      const logs = overrides.logs ?? mockLogs;
      return Promise.resolve({ data: { data: logs, total: overrides.total ?? logs.length } });
    }
    return Promise.resolve({ data: {} });
  });
}

describe("MCPAuditLogPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading skeleton initially", () => {
    mockGet.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<MCPAuditLogPage />);
    expect(document.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
  });

  it("shows an error state with a working retry button", async () => {
    mockGet.mockRejectedValue(new Error("boom"));
    renderWithProviders(<MCPAuditLogPage />);

    await waitFor(() => {
      // Two independent effects (stats + logs) can each set the error
      // message; either is a valid outcome depending on resolution order.
      expect(screen.getByText(/Failed to load audit/)).toBeInTheDocument();
    });

    mockLoad();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByText("search")).toBeInTheDocument();
    });
  });

  it("shows a first-time empty state when there are no logs and no historical stats", async () => {
    mockLoad({ stats: { ...mockStats, total_calls: 0 }, toolStats: [], logs: [], total: 0 });
    renderWithProviders(<MCPAuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText("No audit logs yet")).toBeInTheDocument();
    });
    expect(screen.getByText("How to generate audit logs")).toBeInTheDocument();
  });

  it("renders stat cards, tool charts, and the recent calls table", async () => {
    mockLoad();
    renderWithProviders(<MCPAuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText("search")).toBeInTheDocument();
    });

    expect(screen.getByText("120")).toBeInTheDocument(); // total calls
    expect(screen.getByText("5.0%")).toBeInTheDocument(); // error rate 6/120
    expect(screen.getByText("246ms")).toBeInTheDocument(); // avg latency rounded
    expect(screen.getByText("4")).toBeInTheDocument(); // unique tools
    expect(screen.getByText("Top 10 tools by calls")).toBeInTheDocument();
    expect(screen.getByText("blocked")).toBeInTheDocument();
    expect(screen.getByText("Found 3 results")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument(); // null summary fallback
    expect(screen.getByText("Prod agent")).toBeInTheDocument();
    expect(screen.getByText("Key #6")).toBeInTheDocument();
  });

  it("shows a no-results empty state when filters produce zero logs but history exists", async () => {
    mockLoad({ logs: [], total: 0 });
    renderWithProviders(<MCPAuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText("120")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Filter by tool"), {
      target: { value: "nonexistent" },
    });

    await waitFor(() => {
      expect(screen.getByText("No results matching the current filters.")).toBeInTheDocument();
    });
  });

  it("opens the invocation drawer when a row is clicked", async () => {
    mockLoad();
    renderWithProviders(<MCPAuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText("search")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("search"));

    expect(screen.getByTestId("invocation-drawer")).toHaveTextContent("log 1");
  });

  it("paginates using Previous/Next, disabling at the boundaries", async () => {
    const manyLogs = Array.from({ length: 20 }, (_, i) => ({
      ...mockLogs[0],
      id: i + 1,
      tool_name: `tool_${i}`,
    }));
    mockLoad({ logs: manyLogs, total: 45 });
    renderWithProviders(<MCPAuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText("Showing 1–20 of 45")).toBeInTheDocument();
    });

    const prevButton = screen.getByRole("button", { name: "Previous" });
    const nextButton = screen.getByRole("button", { name: "Next" });
    expect(prevButton).toBeDisabled();
    expect(nextButton).not.toBeDisabled();

    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining("offset=20"));
    });
  });
});
