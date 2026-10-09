import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../test/renderWithProviders";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { apiServices } from "../../../infrastructure/api/networkServices";
import AgentActivityDrawer from "./AgentActivityDrawer";

const mockGet = apiServices.get as unknown as ReturnType<typeof vi.fn>;

const activity = (overrides: Record<string, unknown> = {}) => ({
  summary: {
    total_calls: 3,
    denied: 1,
    approvals: 0,
    errors: 2,
    runs: 1,
    avg_latency_ms: 41,
    last_active: "2026-10-09T10:00:00Z",
    ...overrides,
  },
  by_tool: [{ tool_name: "Bash", count: 3, denied: 1 }],
  recent: [
    {
      id: 1,
      tool_name: "Bash",
      result_status: "approval_required",
      matched_rule_name: "Approve deploys",
      latency_ms: 12,
      created_at: "2026-10-09T10:00:00Z",
    },
  ],
});

describe("AgentActivityDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fetch when closed", () => {
    renderWithProviders(
      <AgentActivityDrawer agentKeyId={5} agentKeyName="A" open={false} onClose={vi.fn()} />,
    );
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("requests the window it shows in the subtitle", () => {
    mockGet.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(
      <AgentActivityDrawer agentKeyId={5} agentKeyName="Agent A" open onClose={vi.fn()} />,
    );
    expect(mockGet).toHaveBeenCalledWith("/ai-gateway/mcp/audit/agent/5", { days: 30 });
    expect(screen.getByText("Agent A · last 30 days")).toBeInTheDocument();
  });

  it("shows the skeleton, not an empty state, until the first response", () => {
    mockGet.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<AgentActivityDrawer agentKeyId={5} open onClose={vi.fn()} />);

    expect(document.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
    expect(screen.queryByText("No activity recorded for this agent yet")).not.toBeInTheDocument();
  });

  it("shows errors, last active, formatted statuses and the matched rule", async () => {
    mockGet.mockResolvedValue({ data: { data: activity() } });
    renderWithProviders(<AgentActivityDrawer agentKeyId={5} open onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Errors")).toBeInTheDocument());
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/^Last active /)).toBeInTheDocument();
    expect(screen.getByText("approval required")).toBeInTheDocument();
    expect(screen.getByText("Rule: Approve deploys")).toBeInTheDocument();
  });

  it("shows the empty state when the agent has no calls", async () => {
    mockGet.mockResolvedValue({ data: { data: activity({ total_calls: 0 }) } });
    renderWithProviders(<AgentActivityDrawer agentKeyId={5} open onClose={vi.fn()} />);

    expect(await screen.findByText("No activity recorded for this agent yet")).toBeInTheDocument();
  });

  it("shows an error state when the request fails", async () => {
    mockGet.mockRejectedValue(new Error("boom"));
    renderWithProviders(<AgentActivityDrawer agentKeyId={5} open onClose={vi.fn()} />);

    expect(await screen.findByText("Failed to load agent activity")).toBeInTheDocument();
  });

  it("never shows the previous agent's numbers for a new agent", async () => {
    mockGet.mockResolvedValueOnce({ data: { data: activity({ total_calls: 777 }) } });
    const { rerender } = renderWithProviders(
      <AgentActivityDrawer agentKeyId={5} open onClose={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText("777")).toBeInTheDocument());

    mockGet.mockImplementation(() => new Promise(() => {}));
    rerender(<AgentActivityDrawer agentKeyId={6} open onClose={vi.fn()} />);

    expect(screen.queryByText("777")).not.toBeInTheDocument();
    expect(document.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
  });

  it("ignores a response for an agent it has switched away from", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    mockGet.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)));
    const { rerender } = renderWithProviders(
      <AgentActivityDrawer agentKeyId={5} open onClose={vi.fn()} />,
    );

    mockGet.mockResolvedValueOnce({ data: { data: activity({ total_calls: 12 }) } });
    rerender(<AgentActivityDrawer agentKeyId={6} open onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("12")).toBeInTheDocument());

    resolveFirst({ data: { data: activity({ total_calls: 999 }) } });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("999")).not.toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });
});
