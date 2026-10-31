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

    expect(screen.getByText("Events")).toBeInTheDocument();
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

    mockGet.mockResolvedValue({
      data: { data: { ...baseDetail, id: 99, tool_name: "other_tool" } },
    });
    rerender(<MCPInvocationDrawer logId={99} open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith("/ai-gateway/mcp/audit/logs/99");
    });
  });

  describe("monitor only rows", () => {
    it("names the rule a call would have been blocked by", async () => {
      mockGet.mockResolvedValue({
        data: {
          data: { ...baseDetail, result_status: "would_block", matched_rule_name: "No emails" },
        },
      });
      renderWithProviders(<MCPInvocationDrawer logId={42} open onClose={vi.fn()} />);

      expect(await screen.findByText("Would have been blocked by No emails")).toBeInTheDocument();
      expect(screen.getByText("Would block")).toBeInTheDocument();
    });

    const wouldEvent = (type: string, source: string, detail = "matched") => ({
      type,
      at: "2025-01-01T10:00:01Z",
      detail,
      source,
    });

    it("names the key's tool list only when the event says it came from one", async () => {
      mockGet.mockResolvedValue({
        data: {
          data: {
            ...baseDetail,
            result_status: "would_block",
            matched_rule_name: null,
            events: [wouldEvent("would_block", "tool_acl", "Agent key blocks tool: delete_repo")],
          },
        },
      });
      renderWithProviders(<MCPInvocationDrawer logId={42} open onClose={vi.fn()} />);

      expect(
        await screen.findByText("Would have been blocked by this key's tool list"),
      ).toBeInTheDocument();
    });

    it("falls back to a guardrail when a would block row has no rule and no source", async () => {
      mockGet.mockResolvedValue({
        data: { data: { ...baseDetail, result_status: "would_block", matched_rule_name: null } },
      });
      renderWithProviders(<MCPInvocationDrawer logId={42} open onClose={vi.fn()} />);

      expect(await screen.findByText("Would have been blocked by a guardrail")).toBeInTheDocument();
      expect(
        screen.queryByText("Would have been blocked by this key's tool list"),
      ).not.toBeInTheDocument();
    });

    it("explains a would need approval by rule, by tool flag and with neither", async () => {
      mockGet.mockResolvedValue({
        data: {
          data: {
            ...baseDetail,
            result_status: "would_need_approval",
            matched_rule_name: "Approve rm",
          },
        },
      });
      const first = renderWithProviders(<MCPInvocationDrawer logId={42} open onClose={vi.fn()} />);
      expect(await screen.findByText("Would have needed approval: Approve rm")).toBeInTheDocument();
      first.unmount();

      mockGet.mockResolvedValue({
        data: {
          data: {
            ...baseDetail,
            result_status: "would_need_approval",
            matched_rule_name: null,
            events: [wouldEvent("would_need_approval", "tool_requires_approval")],
          },
        },
      });
      const second = renderWithProviders(<MCPInvocationDrawer logId={42} open onClose={vi.fn()} />);
      expect(
        await screen.findByText("Would have needed approval (tool requires approval)"),
      ).toBeInTheDocument();
      second.unmount();

      mockGet.mockResolvedValue({
        data: {
          data: { ...baseDetail, result_status: "would_need_approval", matched_rule_name: null },
        },
      });
      renderWithProviders(<MCPInvocationDrawer logId={42} open onClose={vi.fn()} />);
      expect(await screen.findByText("Would have needed approval")).toBeInTheDocument();
    });

    it("labels would events in the timeline like the status chip", async () => {
      mockGet.mockResolvedValue({
        data: {
          data: {
            ...baseDetail,
            result_status: "would_block",
            matched_rule_name: "No emails",
            events: [
              { type: "received", at: "2025-01-01T10:00:00Z" },
              wouldEvent("would_block", "guardrail", "PII detected"),
              wouldEvent(
                "would_need_approval",
                "approval_rule",
                "rule 'Approve rm' requires approval",
              ),
            ],
          },
        },
      });
      renderWithProviders(<MCPInvocationDrawer logId={42} open onClose={vi.fn()} />);

      await screen.findByText("Would have been blocked by No emails");
      expect(screen.getByText("Would block")).toBeInTheDocument(); // status chip
      expect(screen.getByText("Would block · PII detected")).toBeInTheDocument();
      expect(
        screen.getByText("Would need approval · rule 'Approve rm' requires approval"),
      ).toBeInTheDocument();
      expect(screen.queryByText(/would_block/)).not.toBeInTheDocument();
      expect(screen.getByText("received")).toBeInTheDocument();
    });

    it("keeps the blocked by rule label for enforced rows", async () => {
      mockGet.mockResolvedValue({
        data: { data: { ...baseDetail, result_status: "blocked", matched_rule_name: "No emails" } },
      });
      renderWithProviders(<MCPInvocationDrawer logId={42} open onClose={vi.fn()} />);

      expect(await screen.findByText("Blocked by rule")).toBeInTheDocument();
      expect(screen.getByText("No emails")).toBeInTheDocument();
    });
  });
});
