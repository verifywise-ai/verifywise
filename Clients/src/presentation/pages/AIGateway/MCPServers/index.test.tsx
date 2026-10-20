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
import MCPServersPage from "./index";
import CustomException from "../../../../infrastructure/exceptions/customeException";

const mockGet = apiServices.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiServices.post as unknown as ReturnType<typeof vi.fn>;
const mockPatch = apiServices.patch as unknown as ReturnType<typeof vi.fn>;
const mockDelete = apiServices.delete as unknown as ReturnType<typeof vi.fn>;

function makeServer(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    name: "Search Server",
    slug: "search-server",
    url: "https://mcp.example.com",
    auth_type: "none",
    description: "Exposes search tools",
    is_active: true,
    health_status: "healthy",
    tool_count: 4,
    created_by_name: "Jane Doe",
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("MCPServersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading skeleton initially", () => {
    mockGet.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });

    expect(document.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
  });

  it("shows an error state with a working retry button", async () => {
    mockGet.mockRejectedValueOnce(new Error("network down"));
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });

    await waitFor(() => {
      expect(screen.getByText("Failed to load MCP servers. Please try again.")).toBeInTheDocument();
    });

    mockGet.mockResolvedValueOnce({ data: { servers: [makeServer()] } });
    fireEvent.click(screen.getByText("Retry"));

    await waitFor(() => {
      expect(screen.getByText("Search Server")).toBeInTheDocument();
    });
  });

  it("shows an empty state with tips when there are no servers", async () => {
    mockGet.mockResolvedValue({ data: { servers: [] } });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });

    await waitFor(() => {
      expect(screen.getByText(/No MCP servers registered yet/)).toBeInTheDocument();
    });

    expect(screen.getByText("Connect external tool servers")).toBeInTheDocument();
    expect(screen.getByText("Tool discovery")).toBeInTheDocument();
  });

  it("renders server rows with health, tools, endpoint and created-by info", async () => {
    mockGet.mockResolvedValue({
      data: {
        servers: [
          makeServer({ health_status: "unhealthy", tool_count: 0 }),
          makeServer({ id: 2, name: "Second", health_status: "pending", auth_type: "bearer" }),
        ],
      },
    });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });

    await waitFor(() => {
      expect(screen.getByText("Search Server")).toBeInTheDocument();
    });

    expect(screen.getByText("Unhealthy")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getAllByText("https://mcp.example.com")).toHaveLength(2);
    expect(screen.getAllByText(/Jane Doe/).length).toBeGreaterThan(0);
    expect(screen.getByText(/bearer/)).toBeInTheDocument();
  });

  it("toggles server active state and reloads", async () => {
    mockGet.mockResolvedValue({ data: { servers: [makeServer({ is_active: true })] } });
    mockPatch.mockResolvedValue({ data: {} });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });

    await waitFor(() => {
      expect(screen.getByText("Search Server")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/ai-gateway/mcp/servers/1", { is_active: false });
    });

    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("opens the create modal, auto-slugifies the name, and submits a new server", async () => {
    mockGet.mockResolvedValue({ data: { servers: [] } });
    mockPost.mockResolvedValue({ data: {} });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });

    await waitFor(() => {
      expect(screen.getByText(/No MCP servers registered yet/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    expect(screen.getByText("Add MCP server")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Server name/), {
      target: { value: "My New Server!!" },
    });

    expect(screen.getByText("my-new-server")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^URL/), {
      target: { value: "https://new.example.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/ai-gateway/mcp/servers", {
        name: "My New Server!!",
        url: "https://new.example.com",
        auth_type: "none",
        description: null,
        slug: "my-new-server",
      });
    });
  });

  it("shows a validation error when name or URL is missing", async () => {
    mockGet.mockResolvedValue({ data: { servers: [] } });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });

    await waitFor(() => {
      expect(screen.getByText(/No MCP servers registered yet/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add server" }));
    // Submit button in the modal has the same accessible name as the header trigger;
    // scope to the last one rendered (the modal's submit button).
    const submitButtons = screen.getAllByRole("button", { name: "Add server" });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    expect(await screen.findByText("Name and URL are required")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("shows a slug validation error when the name cannot produce a slug", async () => {
    mockGet.mockResolvedValue({ data: { servers: [] } });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });

    await waitFor(() => {
      expect(screen.getByText(/No MCP servers registered yet/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    fireEvent.change(screen.getByLabelText(/^Server name/), { target: { value: "!!!" } });
    fireEvent.change(screen.getByLabelText(/^URL/), {
      target: { value: "https://new.example.com" },
    });

    const submitButtons = screen.getAllByRole("button", { name: "Add server" });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    expect(
      await screen.findByText("Could not generate a valid slug from the name provided"),
    ).toBeInTheDocument();
  });

  it("includes bearer auth_config in the payload when a token is entered", async () => {
    mockGet.mockResolvedValue({ data: { servers: [] } });
    mockPost.mockResolvedValue({ data: {} });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });

    await waitFor(() => {
      expect(screen.getByText(/No MCP servers registered yet/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add server" }));
    fireEvent.change(screen.getByLabelText(/^Server name/), { target: { value: "Bearer Srv" } });
    fireEvent.change(screen.getByLabelText(/^URL/), { target: { value: "https://b.example.com" } });

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Bearer token" }));

    fireEvent.change(screen.getByLabelText(/^Bearer token/), { target: { value: "secret-token" } });

    const submitButtons = screen.getAllByRole("button", { name: "Add server" });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/ai-gateway/mcp/servers",
        expect.objectContaining({
          auth_type: "bearer",
          auth_config: { token: "secret-token" },
        }),
      );
    });
  });

  it("includes api_key auth_config with the default header name when left blank", async () => {
    mockGet.mockResolvedValue({ data: { servers: [] } });
    mockPost.mockResolvedValue({ data: {} });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });

    await waitFor(() => {
      expect(screen.getByText(/No MCP servers registered yet/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add server" }));
    fireEvent.change(screen.getByLabelText(/^Server name/), { target: { value: "Key Srv" } });
    fireEvent.change(screen.getByLabelText(/^URL/), { target: { value: "https://k.example.com" } });

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "API key" }));

    fireEvent.change(screen.getByLabelText(/^API key/), { target: { value: "abc123" } });

    const submitButtons = screen.getAllByRole("button", { name: "Add server" });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/ai-gateway/mcp/servers",
        expect.objectContaining({
          auth_type: "api_key",
          auth_config: { header: "X-API-Key", key: "abc123" },
        }),
      );
    });
  });

  it("opens the edit modal pre-filled and submits an update via patch", async () => {
    mockGet.mockResolvedValue({ data: { servers: [makeServer()] } });
    mockPatch.mockResolvedValue({ data: {} });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });

    await waitFor(() => {
      expect(screen.getByText("Search Server")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Search Server"));

    expect(screen.getByText("Edit server")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Server name/)).toHaveValue("Search Server");
    expect(screen.getByText("search-server")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith(
        "/ai-gateway/mcp/servers/1",
        expect.objectContaining({ name: "Search Server", url: "https://mcp.example.com" }),
      );
    });
  });

  it("shows the server-provided error message when submit fails", async () => {
    mockGet.mockResolvedValue({ data: { servers: [] } });
    mockPost.mockRejectedValue(
      new CustomException("Conflict", 409, { detail: "Slug already taken" }),
    );
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });

    await waitFor(() => {
      expect(screen.getByText(/No MCP servers registered yet/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add server" }));
    fireEvent.change(screen.getByLabelText(/^Server name/), { target: { value: "Dup Server" } });
    fireEvent.change(screen.getByLabelText(/^URL/), { target: { value: "https://d.example.com" } });

    const submitButtons = screen.getAllByRole("button", { name: "Add server" });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    expect(await screen.findByText("Slug already taken")).toBeInTheDocument();
  });

  it("deletes a server after confirming in the delete modal", async () => {
    mockGet.mockResolvedValue({ data: { servers: [makeServer()] } });
    mockDelete.mockResolvedValue({ data: {} });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });

    await waitFor(() => {
      expect(screen.getByText("Search Server")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete server" }));

    expect(screen.getByText("Delete server")).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete "Search Server"/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("/ai-gateway/mcp/servers/1");
    });
  });

  it("runs discovery from the row and reports the tool count", async () => {
    mockGet.mockResolvedValue({ data: { servers: [makeServer()] } });
    mockPost.mockResolvedValue({ data: { status: "success", tools_discovered: 7 } });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Search Server")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Discover tools" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/ai-gateway/mcp/servers/1/discover");
      expect(screen.getByText("7 tools found")).toBeInTheDocument();
    });
  });

  it("shows the gateway's reason when row discovery fails", async () => {
    mockGet.mockResolvedValue({ data: { servers: [makeServer()] } });
    mockPost.mockRejectedValue(
      new CustomException("Bad Request", 400, {
        detail: "Could not connect to the server address",
      }),
    );
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Search Server")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Discover tools" }));

    await waitFor(() => {
      expect(screen.getByText("Could not connect to the server address")).toBeInTheDocument();
    });
  });

  it("reports the discovery result after saving a new server", async () => {
    mockGet.mockResolvedValue({ data: { servers: [] } });
    mockPost.mockResolvedValue({
      data: {
        server: makeServer(),
        discovery: {
          status: "failed",
          tools_discovered: 0,
          error: "The server rejected the credentials (HTTP 401)",
        },
      },
    });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Add server")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Add server" }));
    fireEvent.change(screen.getByPlaceholderText("e.g., Production Search Server"), {
      target: { value: "Search Server" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g., https://mcp-server.example.com"), {
      target: { value: "https://mcp.example.com" },
    });
    const submitButtons = screen.getAllByRole("button", { name: "Add server" });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("Server saved, but discovery failed")).toBeInTheDocument();
      expect(
        screen.getByText("The server rejected the credentials (HTTP 401)"),
      ).toBeInTheDocument();
    });
  });

  it("says the server offered no tools when discovery finds none", async () => {
    mockGet.mockResolvedValue({ data: { servers: [makeServer()] } });
    mockPost.mockResolvedValue({ data: { status: "success", tools_discovered: 0 } });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Search Server")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Discover tools" }));

    await waitFor(() =>
      expect(screen.getByText("The server offered no tools")).toBeInTheDocument(),
    );
  });

  it("shows the discovery result when a server is switched on", async () => {
    mockGet.mockResolvedValue({ data: { servers: [makeServer({ is_active: false })] } });
    mockPatch.mockResolvedValue({
      data: {
        server: makeServer(),
        discovery: { status: "success", tools_discovered: 2, error: null },
      },
    });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Search Server")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => expect(screen.getByText("Server switched on")).toBeInTheDocument());
    expect(screen.getByText("2 tools found")).toBeInTheDocument();
  });

  it("explains an unhealthy status on hover", async () => {
    mockGet.mockResolvedValue({
      data: {
        servers: [
          makeServer({
            health_status: "unhealthy",
            last_discovery_error: "The server returned HTTP 500",
          }),
        ],
      },
    });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Unhealthy")).toBeInTheDocument());

    fireEvent.mouseOver(screen.getByText("Unhealthy"));

    await waitFor(() =>
      expect(screen.getByText("The server returned HTTP 500")).toBeInTheDocument(),
    );
  });

  it("keeps the stored key when editing with the key left blank", async () => {
    mockGet.mockResolvedValue({
      data: {
        servers: [
          makeServer({ auth_type: "api_key", auth_header: "X-K", auth_secret_hint: "abcd...wxyz" }),
        ],
      },
    });
    mockPatch.mockResolvedValue({
      data: {
        server: makeServer(),
        discovery: { status: "skipped", tools_discovered: 0, error: null },
      },
    });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Search Server")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Edit server" }));
    expect(
      screen.getByText("Current key: abcd...wxyz. Leave blank to keep it."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      const payload = mockPatch.mock.calls[0][1];
      expect(payload.auth_config).toBeUndefined();
    });
  });

  it("requires a new key and hides the current-key hint when the auth type changed", async () => {
    mockGet.mockResolvedValue({
      data: {
        servers: [makeServer({ auth_type: "bearer", auth_secret_hint: "abcd...wxyz" })],
      },
    });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Search Server")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Edit server" }));
    expect(
      screen.getByText("Current token: abcd...wxyz. Leave blank to keep it."),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Bearer token/, { selector: "label" }).textContent).not.toContain("*");

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "API key" }));

    expect(screen.queryByText(/Leave blank to keep it/)).not.toBeInTheDocument();
    expect(screen.getByText(/^API key/, { selector: "label" }).textContent).toContain("*");
  });

  it("sends only the header when the header changes and the key is left blank", async () => {
    mockGet.mockResolvedValue({
      data: {
        servers: [
          makeServer({ auth_type: "api_key", auth_header: "X-K", auth_secret_hint: "abcd...wxyz" }),
        ],
      },
    });
    mockPatch.mockResolvedValue({
      data: {
        server: makeServer(),
        discovery: { status: "skipped", tools_discovered: 0, error: null },
      },
    });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Search Server")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Edit server" }));
    fireEvent.change(screen.getByLabelText(/^Header name/), { target: { value: "X-New" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockPatch.mock.calls[0][1].auth_config).toEqual({ header: "X-New" });
    });
  });

  it("falls back to a generic error message when the API error has no detail/message", async () => {
    mockGet.mockResolvedValue({ data: { servers: [] } });
    mockPost.mockRejectedValue(new Error("boom"));
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });

    await waitFor(() => {
      expect(screen.getByText(/No MCP servers registered yet/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add server" }));
    fireEvent.change(screen.getByLabelText(/^Server name/), { target: { value: "Err Server" } });
    fireEvent.change(screen.getByLabelText(/^URL/), { target: { value: "https://e.example.com" } });

    const submitButtons = screen.getAllByRole("button", { name: "Add server" });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    expect(await screen.findByText("Failed to create server")).toBeInTheDocument();
  });
});
