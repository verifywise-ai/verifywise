import { screen, waitFor, fireEvent } from "@testing-library/react";
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
import MCPInvocationDrawer from "./MCPInvocationDrawer";

const mockGet = apiServices.get as unknown as ReturnType<typeof vi.fn>;

const baseDetail = {
  id: 42,
  tool_name: "search_docs",
  agent_key_name: "agent-key-1",
  result_status: "success",
  result_summary: "ok",
  tool_use_id: "tool-use-abc123",
  session_id: "session-xyz",
  arguments: { query: "hello" },
  result_response: { hits: 3 },
  result_truncated: false,
  events: [
    { type: "queued", at: "2025-01-01T10:00:00Z" },
    { type: "completed", at: "2025-01-01T10:00:05Z", detail: "200 OK" },
  ],
  created_at: "2025-01-01T09:59:00Z",
};

describe("MCPInvocationDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fetch when closed", () => {
    renderWithProviders(<MCPInvocationDrawer logId={42} open={false} onClose={vi.fn()} />);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("does not fetch when logId is null", () => {
    renderWithProviders(<MCPInvocationDrawer logId={null} open onClose={vi.fn()} />);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("shows placeholder text when there is no row and it isn't loading/erroring", () => {
    renderWithProviders(<MCPInvocationDrawer logId={null} open onClose={vi.fn()} />);
    expect(screen.getByText("Select a log to view details.")).toBeInTheDocument();
  });

  it("shows a loading skeleton while fetching", () => {
    mockGet.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<MCPInvocationDrawer logId={42} open onClose={vi.fn()} />);

    expect(document.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
  });

  it("renders invocation details on successful load", async () => {
    mockGet.mockResolvedValue({ data: { data: baseDetail } });
    renderWithProviders(<MCPInvocationDrawer logId={42} open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("search_docs")).toBeInTheDocument();
    });

    expect(mockGet).toHaveBeenCalledWith("/ai-gateway/mcp/audit/logs/42");
    expect(screen.getByText("success")).toBeInTheDocument();
    expect(screen.getByText("tool-use-abc123")).toBeInTheDocument();
    expect(screen.getByText("agent-key-1 · session-xyz")).toBeInTheDocument();
    expect(screen.getByText(/"query": "hello"/)).toBeInTheDocument();
    expect(screen.getByText(/"hits": 3/)).toBeInTheDocument();
    expect(screen.getByText("queued")).toBeInTheDocument();
    expect(screen.getByText("completed · 200 OK")).toBeInTheDocument();
  });

  it("falls back to em dashes when tool_use_id / agent_key_name / session_id are missing", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: { ...baseDetail, tool_use_id: null, agent_key_name: null, session_id: null },
      },
    });
    renderWithProviders(<MCPInvocationDrawer logId={42} open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("search_docs")).toBeInTheDocument();
    });

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("— · —")).toBeInTheDocument();
  });

  it("shows the 'no result captured' message when result_response is absent", async () => {
    mockGet.mockResolvedValue({
      data: { data: { ...baseDetail, result_response: null } },
    });
    renderWithProviders(<MCPInvocationDrawer logId={42} open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByText("No result captured (older adapter, or the tool did not report back)."),
      ).toBeInTheDocument();
    });
  });

  it("appends the truncated marker when result_truncated is true", async () => {
    mockGet.mockResolvedValue({
      data: { data: { ...baseDetail, result_truncated: true } },
    });
    renderWithProviders(<MCPInvocationDrawer logId={42} open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/… \(truncated\)/)).toBeInTheDocument();
    });
  });

  it("toggles raw JSON visibility when the show/hide button is clicked", async () => {
    mockGet.mockResolvedValue({ data: { data: baseDetail } });
    renderWithProviders(<MCPInvocationDrawer logId={42} open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("search_docs")).toBeInTheDocument();
    });

    expect(screen.queryByText(/"result_status": "success"/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Show raw JSON"));
    expect(screen.getByText("Hide raw JSON")).toBeInTheDocument();
    expect(screen.getByText(/"result_status": "success"/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Hide raw JSON"));
    expect(screen.getByText("Show raw JSON")).toBeInTheDocument();
    expect(screen.queryByText(/"result_status": "success"/)).not.toBeInTheDocument();
  });

  it("shows an error state and retries on failure", async () => {
    mockGet.mockRejectedValueOnce(new Error("network error"));
    renderWithProviders(<MCPInvocationDrawer logId={42} open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load invocation details.")).toBeInTheDocument();
    });

    mockGet.mockResolvedValueOnce({ data: { data: baseDetail } });
    fireEvent.click(screen.getByText("Retry"));

    await waitFor(() => {
      expect(screen.getByText("search_docs")).toBeInTheDocument();
    });

    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("calls onClose when the close icon button is clicked", async () => {
    mockGet.mockResolvedValue({ data: { data: baseDetail } });
    const onClose = vi.fn();
    renderWithProviders(<MCPInvocationDrawer logId={42} open onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("search_docs")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders without events when the events array is empty", async () => {
    mockGet.mockResolvedValue({ data: { data: { ...baseDetail, events: [] } } });
    renderWithProviders(<MCPInvocationDrawer logId={42} open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("search_docs")).toBeInTheDocument();
    });

    expect(screen.getByText("EVENTS")).toBeInTheDocument();
    expect(screen.queryByText("queued")).not.toBeInTheDocument();
  });

  it("refetches when logId changes while open", async () => {
    mockGet.mockResolvedValue({ data: { data: baseDetail } });
    const { rerender } = renderWithProviders(
      <MCPInvocationDrawer logId={42} open onClose={vi.fn()} />,
    );

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith("/ai-gateway/mcp/audit/logs/42");
    });

    mockGet.mockResolvedValue({ data: { data: { ...baseDetail, id: 99, tool_name: "other_tool" } } });
    rerender(<MCPInvocationDrawer logId={99} open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith("/ai-gateway/mcp/audit/logs/99");
    });
  });
});
