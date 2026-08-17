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

import { apiServices } from "../../../../infrastructure/api/networkServices";
import MCPRuns from "./index";

const mockGet = apiServices.get as unknown as ReturnType<typeof vi.fn>;

function makeRun(overrides: Record<string, any> = {}) {
  return {
    agent_run_id: "run-abcdefghijklmnop",
    agent_key_name: "agent-1",
    model_count: 3,
    tool_count: 2,
    denied_count: 0,
    total_tokens: 1000,
    total_cost: 0.5,
    started_at: "2025-01-01T10:00:00Z",
    last_at: "2025-01-01T10:05:00Z",
    ...overrides,
  };
}

describe("MCPRuns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading skeleton initially", () => {
    mockGet.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<MCPRuns />, { route: "/ai-gateway/mcp/runs" });

    expect(document.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
  });

  it("requests the runs endpoint with limit/offset", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    renderWithProviders(<MCPRuns />, { route: "/ai-gateway/mcp/runs" });

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith("/ai-gateway/mcp/runs?limit=50&offset=0");
    });
  });

  it("shows an empty state when there are no runs", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    renderWithProviders(<MCPRuns />, { route: "/ai-gateway/mcp/runs" });

    await waitFor(() => {
      expect(screen.getByText("No agent runs yet")).toBeInTheDocument();
    });
  });

  it("shows an error state with a retry button that reloads", async () => {
    mockGet.mockRejectedValueOnce(new Error("network down"));
    renderWithProviders(<MCPRuns />, { route: "/ai-gateway/mcp/runs" });

    await waitFor(() => {
      expect(screen.getByText("Failed to load agent runs. Please try again.")).toBeInTheDocument();
    });

    mockGet.mockResolvedValueOnce({ data: { data: [makeRun()] } });
    fireEvent.click(screen.getByText("Retry"));

    await waitFor(() => {
      expect(screen.getByText("agent-1")).toBeInTheDocument();
    });

    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("renders run rows with formatted cells", async () => {
    const run = makeRun({ agent_key_name: null, denied_count: 5 });
    mockGet.mockResolvedValue({ data: { data: [run] } });
    renderWithProviders(<MCPRuns />, { route: "/ai-gateway/mcp/runs" });

    await waitFor(() => {
      expect(screen.getByText(run.agent_run_id.slice(0, 12) + "…")).toBeInTheDocument();
    });

    // agent_key_name null falls back to em dash
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("shows an em dash for denied_count when it is zero", async () => {
    mockGet.mockResolvedValue({ data: { data: [makeRun({ denied_count: 0 })] } });
    renderWithProviders(<MCPRuns />, { route: "/ai-gateway/mcp/runs" });

    await waitFor(() => {
      expect(screen.getByText("agent-1")).toBeInTheDocument();
    });

    const cells = screen.getAllByText("—");
    expect(cells.length).toBeGreaterThan(0);
  });

  it("does not show the '50 runs' caption when under the limit", async () => {
    mockGet.mockResolvedValue({ data: { data: [makeRun()] } });
    renderWithProviders(<MCPRuns />, { route: "/ai-gateway/mcp/runs" });

    await waitFor(() => {
      expect(screen.getByText("agent-1")).toBeInTheDocument();
    });

    expect(screen.queryByText("Showing the most recent 50 runs.")).not.toBeInTheDocument();
  });

  it("shows the '50 runs' caption when the result set is at the limit", async () => {
    const runs = Array.from({ length: 50 }, (_, i) =>
      makeRun({ agent_run_id: `run-${i}`, agent_key_name: `agent-${i}` }),
    );
    mockGet.mockResolvedValue({ data: { data: runs } });
    renderWithProviders(<MCPRuns />, { route: "/ai-gateway/mcp/runs" });

    await waitFor(() => {
      expect(screen.getByText("Showing the most recent 50 runs.")).toBeInTheDocument();
    });
  });

  it("opens the run detail drawer when a row is clicked and fetches its details", async () => {
    const run = makeRun();
    mockGet.mockImplementation((url: string) => {
      if (url.includes(`/ai-gateway/mcp/runs/${run.agent_run_id}`)) {
        return Promise.resolve({ data: { data: { entries: [] } } });
      }
      return Promise.resolve({ data: { data: [run] } });
    });

    renderWithProviders(<MCPRuns />, { route: "/ai-gateway/mcp/runs" });

    await waitFor(() => {
      expect(screen.getByText("agent-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("agent-1"));

    await waitFor(() => {
      expect(screen.getByText(`Run ${run.agent_run_id.slice(0, 12)}…`)).toBeInTheDocument();
    });

    expect(mockGet).toHaveBeenCalledWith(
      `/ai-gateway/mcp/runs/${encodeURIComponent(run.agent_run_id)}`,
    );
  });
});
