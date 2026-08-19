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

import { apiServices } from "../../../../infrastructure/api/networkServices";
import RunDetailDrawer from "./RunDetailDrawer";

const mockGet = apiServices.get as unknown as ReturnType<typeof vi.fn>;

const runId = "run-1234567890abcdef";

const modelEntry = {
  kind: "model",
  created_at: "2025-01-01T10:00:00Z",
  model: "gpt-4",
  provider: "openai",
  total_tokens: 120,
  cost_usd: 0.02,
  latency_ms: 340,
  request_messages: [{ role: "user", content: "Hello" }],
  response_text: "Hi there!",
};

const toolEntry = {
  kind: "tool",
  created_at: "2025-01-01T10:00:05Z",
  model: "search_docs",
  provider: null,
  total_tokens: null,
  cost_usd: null,
  latency_ms: 50,
  request_messages: { query: "hello" },
  response_text: null,
};

describe("RunDetailDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading skeleton while fetching", () => {
    mockGet.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<RunDetailDrawer runId={runId} onClose={vi.fn()} />);

    expect(document.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
  });

  it("shows the truncated run id in the title", async () => {
    mockGet.mockResolvedValue({ data: { data: { entries: [] } } });
    renderWithProviders(<RunDetailDrawer runId={runId} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(`Run ${runId.slice(0, 12)}…`)).toBeInTheDocument();
    });

    expect(mockGet).toHaveBeenCalledWith(`/ai-gateway/mcp/runs/${encodeURIComponent(runId)}`);
  });

  it("renders a model call entry with prompt and response sections", async () => {
    mockGet.mockResolvedValue({ data: { data: { entries: [modelEntry] } } });
    renderWithProviders(<RunDetailDrawer runId={runId} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Model call")).toBeInTheDocument();
    });

    expect(screen.getByText("Prompt")).toBeInTheDocument();
    expect(screen.getByText("Response")).toBeInTheDocument();
    expect(screen.getByText(/"role": "user"/)).toBeInTheDocument();
    expect(screen.getByText("Hi there!")).toBeInTheDocument();
    expect(screen.getByText("gpt-4")).toBeInTheDocument();
  });

  it("renders a tool call entry with a single request block and no Prompt/Response labels", async () => {
    mockGet.mockResolvedValue({ data: { data: { entries: [toolEntry] } } });
    renderWithProviders(<RunDetailDrawer runId={runId} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Tool call")).toBeInTheDocument();
    });

    expect(screen.queryByText("Prompt")).not.toBeInTheDocument();
    expect(screen.queryByText("Response")).not.toBeInTheDocument();
    expect(screen.getByText(/"query": "hello"/)).toBeInTheDocument();
  });

  it("shows placeholder text when request_messages / response_text are missing", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          entries: [{ ...modelEntry, request_messages: null, response_text: null }],
        },
      },
    });
    renderWithProviders(<RunDetailDrawer runId={runId} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getAllByText("(no content captured)").length).toBe(2);
    });
  });

  it("renders multiple entries in order", async () => {
    mockGet.mockResolvedValue({ data: { data: { entries: [modelEntry, toolEntry] } } });
    renderWithProviders(<RunDetailDrawer runId={runId} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Model call")).toBeInTheDocument();
      expect(screen.getByText("Tool call")).toBeInTheDocument();
    });
  });

  it("shows an error state with a retry button that reloads the run", async () => {
    mockGet.mockRejectedValueOnce(new Error("boom"));
    renderWithProviders(<RunDetailDrawer runId={runId} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Could not load this run.")).toBeInTheDocument();
    });

    mockGet.mockResolvedValueOnce({ data: { data: { entries: [modelEntry] } } });
    fireEvent.click(screen.getByText("Retry"));

    await waitFor(() => {
      expect(screen.getByText("Model call")).toBeInTheDocument();
    });

    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("renders an empty stack when there are no entries", async () => {
    mockGet.mockResolvedValue({ data: { data: { entries: [] } } });
    renderWithProviders(<RunDetailDrawer runId={runId} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(`Run ${runId.slice(0, 12)}…`)).toBeInTheDocument();
    });

    expect(screen.queryByText("Model call")).not.toBeInTheDocument();
    expect(screen.queryByText("Tool call")).not.toBeInTheDocument();
  });

  it("calls onClose when escape is pressed", async () => {
    mockGet.mockResolvedValue({ data: { data: { entries: [] } } });
    const onClose = vi.fn();
    renderWithProviders(<RunDetailDrawer runId={runId} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText(`Run ${runId.slice(0, 12)}…`)).toBeInTheDocument();
    });

    fireEvent.keyDown(document.activeElement || document.body, { key: "Escape", code: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
