import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

vi.mock("../../../components/Skeletons", () => ({
  default: () => <div data-testid="skeleton" />,
}));

import { apiServices } from "../../../../infrastructure/api/networkServices";
import MCPAgentKeysPage from "./index";

const mockKeys = [
  {
    id: 1,
    key_prefix: "vw_abc123",
    name: "Production agent key",
    description: "Used by prod orchestrator",
    allowed_tools: ["search", "get_weather"],
    blocked_tools: [],
    rate_limit_rpm: 60,
    expires_at: null,
    is_active: true,
    revoked_at: null,
    created_by_name: "Jane Doe",
    created_at: "2025-06-01T12:00:00Z",
  },
  {
    id: 2,
    key_prefix: "vw_def456",
    name: "Revoked key",
    description: null,
    allowed_tools: [],
    blocked_tools: ["drop_table"],
    rate_limit_rpm: null,
    expires_at: null,
    is_active: false,
    revoked_at: "2025-06-05T12:00:00Z",
    created_by_name: "John Smith",
    created_at: "2025-05-01T12:00:00Z",
  },
];

describe("MCPAgentKeysPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a skeleton while loading", () => {
    (apiServices.get as any).mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<MCPAgentKeysPage />);
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
  });

  it("shows an error state and retries on click", async () => {
    (apiServices.get as any).mockRejectedValue(new Error("network error"));
    renderWithProviders(<MCPAgentKeysPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load agent keys. Please try again.")).toBeInTheDocument();
    });

    (apiServices.get as any).mockResolvedValue({ data: { data: [] } });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(apiServices.get).toHaveBeenCalledTimes(2);
    });
  });

  it("shows an empty state with tips when there are no keys", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: [] } });
    renderWithProviders(<MCPAgentKeysPage />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Issue scoped API keys for AI agents to authenticate with MCP servers through the gateway.",
        ),
      ).toBeInTheDocument();
    });

    expect(screen.getAllByTestId("empty-state-tip")).toHaveLength(2);
  });

  it("renders a table of agent keys with derived status labels", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: mockKeys } });
    renderWithProviders(<MCPAgentKeysPage />);

    await waitFor(() => {
      expect(screen.getByText("Production agent key")).toBeInTheDocument();
    });

    expect(screen.getByText("Used by prod orchestrator")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Revoked")).toBeInTheDocument();
    expect(screen.getByText("60 RPM")).toBeInTheDocument();
    expect(screen.getByText("2 allowed")).toBeInTheDocument();
    expect(screen.getByText("1 blocked")).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
    expect(screen.getByText("vw_abc123")).toBeInTheDocument();
  });

  it("shows an expired status when the expiry date has passed", async () => {
    (apiServices.get as any).mockResolvedValue({
      data: {
        data: [
          {
            ...mockKeys[0],
            is_active: true,
            revoked_at: null,
            expires_at: "2000-01-01T00:00:00Z",
          },
        ],
      },
    });
    renderWithProviders(<MCPAgentKeysPage />);

    await waitFor(() => {
      expect(screen.getByText("Expired")).toBeInTheDocument();
    });
  });

  it("shows 'All' tools label when no allowed/blocked tools are set", async () => {
    (apiServices.get as any).mockResolvedValue({
      data: { data: [{ ...mockKeys[0], allowed_tools: [], blocked_tools: [] }] },
    });
    renderWithProviders(<MCPAgentKeysPage />);

    await waitFor(() => {
      expect(screen.getByText("All")).toBeInTheDocument();
    });
  });

  it("validates that a name is required before creating a key", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: [] } });
    const user = userEvent.setup();
    renderWithProviders(<MCPAgentKeysPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Create agent key/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Create agent key/i }));
    expect(screen.getByRole("heading", { name: "Create agent key" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(apiServices.post).not.toHaveBeenCalled();
  });

  it("creates an agent key, parses tool lists, and opens the key display modal", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: [] } });
    (apiServices.post as any).mockResolvedValue({
      data: { data: { id: 5, plain_key: "vw_plaintext_secret" } },
    });
    const user = userEvent.setup();
    renderWithProviders(<MCPAgentKeysPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Create agent key/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Create agent key/i }));

    await user.type(screen.getByLabelText(/^Name/), "My new key");
    await user.type(screen.getByLabelText("Allowed tools"), "search, get_weather");
    await user.type(screen.getByLabelText("Blocked tools"), "drop_table");
    await user.type(screen.getByLabelText("Rate limit (requests per minute)"), "30");

    await user.click(screen.getByRole("button", { name: "Create key" }));

    await waitFor(() => {
      expect(apiServices.post).toHaveBeenCalledWith("/ai-gateway/mcp/agent-keys", {
        name: "My new key",
        allowed_tools: ["search", "get_weather"],
        blocked_tools: ["drop_table"],
        rate_limit_rpm: 30,
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Agent key created")).toBeInTheDocument();
    });
    expect(screen.getByText("vw_plaintext_secret")).toBeInTheDocument();
  });

  it("copies the newly created key to the clipboard", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: [] } });
    (apiServices.post as any).mockResolvedValue({
      data: { data: { id: 5, plain_key: "vw_plaintext_secret" } },
    });
    // userEvent.setup() attaches its own real (non-mocked) Clipboard stub to
    // `navigator.clipboard` — defining our own property before this point
    // would just get overwritten. Set up user-event first, then spy on the
    // stub's writeText method so we can assert on it.
    const user = userEvent.setup();
    const writeTextSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    renderWithProviders(<MCPAgentKeysPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Create agent key/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Create agent key/i }));
    await user.type(screen.getByLabelText(/^Name/), "My new key");
    await user.click(screen.getByRole("button", { name: "Create key" }));

    await waitFor(() => {
      expect(screen.getByText("Agent key created")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Copy key" }));

    expect(writeTextSpy).toHaveBeenCalledWith("vw_plaintext_secret");
  });

  it("shows a create error message returned by the API", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: [] } });
    (apiServices.post as any).mockRejectedValue({
      response: { data: { detail: "Name already taken" } },
    });
    const user = userEvent.setup();
    renderWithProviders(<MCPAgentKeysPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Create agent key/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Create agent key/i }));
    await user.type(screen.getByLabelText(/^Name/), "Duplicate");
    await user.click(screen.getByRole("button", { name: "Create key" }));

    await waitFor(() => {
      expect(screen.getByText("Name already taken")).toBeInTheDocument();
    });
  });

  it("revokes an active key via the confirmation modal", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: mockKeys } });
    (apiServices.post as any).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderWithProviders(<MCPAgentKeysPage />);

    await waitFor(() => {
      expect(screen.getByText("Production agent key")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Revoke key" }));

    expect(
      screen.getByText(/Are you sure you want to revoke "Production agent key"/),
    ).toBeInTheDocument();

    const revokeButtons = screen.getAllByRole("button", { name: "Revoke key" });
    await user.click(revokeButtons[revokeButtons.length - 1]);

    await waitFor(() => {
      expect(apiServices.post).toHaveBeenCalledWith("/ai-gateway/mcp/agent-keys/1/revoke");
    });
  });

  it("deletes an inactive key directly", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: mockKeys } });
    (apiServices.delete as any).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderWithProviders(<MCPAgentKeysPage />);

    await waitFor(() => {
      expect(screen.getByText("Revoked key")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Delete key" }));

    await waitFor(() => {
      expect(apiServices.delete).toHaveBeenCalledWith("/ai-gateway/mcp/agent-keys/2");
    });
  });

  it("closes the create modal via cancel without submitting", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: [] } });
    const user = userEvent.setup();
    renderWithProviders(<MCPAgentKeysPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Create agent key/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Create agent key/i }));
    expect(screen.getByRole("heading", { name: "Create agent key" })).toBeInTheDocument();

    const cancelButtons = screen.getAllByRole("button", { name: "Cancel" });
    await user.click(cancelButtons[0]);

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Create agent key" })).not.toBeInTheDocument();
    });
    expect(apiServices.post).not.toHaveBeenCalled();
  });
});
