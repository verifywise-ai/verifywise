import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockNavigate = vi.fn();

vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

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

  it("says what changed when row discovery updates the tool list", async () => {
    mockGet.mockResolvedValue({ data: { servers: [makeServer()] } });
    mockPost.mockResolvedValue({
      data: {
        status: "success",
        tools_discovered: 8,
        changes: { added: 2, removed: 1, changed: 1, unchanged: 5 },
      },
    });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Search Server")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Discover tools" }));

    await waitFor(() => expect(screen.getByText("Tools updated")).toBeInTheDocument());
    expect(screen.getByText("2 new, 1 removed, 1 changed")).toBeInTheDocument();
  });

  it("says no changes when discovery finds the same tools", async () => {
    mockGet.mockResolvedValue({ data: { servers: [makeServer()] } });
    mockPost.mockResolvedValue({
      data: {
        status: "success",
        tools_discovered: 7,
        changes: { added: 0, removed: 0, changed: 0, unchanged: 7 },
      },
    });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Search Server")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Discover tools" }));

    await waitFor(() => expect(screen.getByText("No changes")).toBeInTheDocument());
    expect(screen.getByText("7 tools found")).toBeInTheDocument();
  });

  it("links the discovery toast to that server's tools", async () => {
    mockGet.mockResolvedValue({ data: { servers: [makeServer({ id: 3 })] } });
    mockPost.mockResolvedValue({ data: { status: "success", tools_discovered: 7 } });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Search Server")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Discover tools" }));
    fireEvent.click(await screen.findByRole("button", { name: "View tools" }));

    expect(mockNavigate).toHaveBeenCalledWith("/ai-gateway/mcp/tools?server=3", {
      state: { from: "mcp-servers" },
    });
  });

  it("opens the server's tools from the tools count without opening the editor", async () => {
    mockGet.mockResolvedValue({ data: { servers: [makeServer({ id: 3, tool_count: 4 })] } });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Search Server")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "View 4 tools" }));

    expect(mockNavigate).toHaveBeenCalledWith("/ai-gateway/mcp/tools?server=3", {
      state: { from: "mcp-servers" },
    });
    expect(screen.queryByText("Edit server")).not.toBeInTheDocument();
  });

  it("names a single tool in the count link's label", async () => {
    mockGet.mockResolvedValue({ data: { servers: [makeServer({ id: 3, tool_count: 1 })] } });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    expect(await screen.findByRole("button", { name: "View one tool" })).toBeInTheDocument();
  });

  it("offers no tools link when discovery only removed tools", async () => {
    mockGet.mockResolvedValue({ data: { servers: [makeServer({ id: 3, tool_count: 0 })] } });
    mockPost.mockResolvedValue({
      data: {
        status: "success",
        tools_discovered: 0,
        changes: { added: 0, removed: 2, changed: 0, unchanged: 0 },
      },
    });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Search Server")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Discover tools" }));

    await waitFor(() => expect(screen.getByText("2 removed")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "View tools" })).not.toBeInTheDocument();
  });

  it("keeps each row's spinner until its own discovery finishes", async () => {
    mockGet.mockResolvedValue({
      data: { servers: [makeServer({ id: 1 }), makeServer({ id: 2, name: "Other Server" })] },
    });
    const finish: Array<(v: unknown) => void> = [];
    mockPost.mockImplementation(() => new Promise((resolve) => finish.push(resolve)));
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Other Server")).toBeInTheDocument());

    const [first, second] = screen.getAllByRole("button", { name: "Discover tools" });
    fireEvent.click(first);
    fireEvent.click(second);
    await waitFor(() => expect(finish).toHaveLength(2));

    finish[0]({ data: { status: "success", tools_discovered: 4 } });
    await waitFor(() => expect(first).toHaveAttribute("aria-busy", "false"));
    expect(second).toHaveAttribute("aria-busy", "true");

    finish[1]({ data: { status: "success", tools_discovered: 4 } });
    await waitFor(() => expect(second).toHaveAttribute("aria-busy", "false"));
  });

  it("keeps the table and spins the discover button while discovery runs", async () => {
    mockGet.mockResolvedValue({ data: { servers: [makeServer()] } });
    let finish: (v: unknown) => void = () => {};
    mockPost.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Search Server")).toBeInTheDocument());

    const button = screen.getByRole("button", { name: "Discover tools" });
    fireEvent.click(button);

    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
    expect(button.querySelector(".MuiCircularProgress-root")).toBeInTheDocument();

    finish({ data: { status: "success", tools_discovered: 4 } });
    await waitFor(() => expect(screen.getByText("4 tools found")).toBeInTheDocument());
    // The reload after discovery must not swap the table for the skeleton.
    expect(screen.getByText("Search Server")).toBeInTheDocument();
    expect(document.querySelector(".MuiSkeleton-root")).not.toBeInTheDocument();
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(document.querySelector(".MuiSkeleton-root")).not.toBeInTheDocument();
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

  it("reports changes, not the total, when re-saving a server changes its tools", async () => {
    mockGet.mockResolvedValue({ data: { servers: [makeServer({ is_active: false })] } });
    mockPatch.mockResolvedValue({
      data: {
        server: makeServer(),
        discovery: {
          status: "success",
          tools_discovered: 4,
          changes: { added: 1, removed: 0, changed: 0, unchanged: 3 },
          error: null,
        },
      },
    });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Search Server")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => expect(screen.getByText("Server switched on")).toBeInTheDocument());
    expect(screen.getByText("1 new")).toBeInTheDocument();
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

  describe("OAuth and AWS IAM authentication", () => {
    async function openCreateForm(url: string) {
      mockGet.mockResolvedValue({ data: { servers: [] } });
      renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
      await waitFor(() => {
        expect(screen.getByText(/No MCP servers registered yet/)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: "Add server" }));
      fireEvent.change(screen.getByLabelText(/^Server name/), { target: { value: "Auth Srv" } });
      fireEvent.change(screen.getByLabelText(/^URL/), { target: { value: url } });
    }

    async function chooseAuth(name: string) {
      fireEvent.mouseDown(screen.getByRole("combobox"));
      fireEvent.click(await screen.findByRole("option", { name }));
    }

    function submit() {
      const submitButtons = screen.getAllByRole("button", { name: /^(Add server|Save changes)$/ });
      fireEvent.click(submitButtons[submitButtons.length - 1]);
    }

    const discoverCalls = () =>
      mockPost.mock.calls.filter((c) => c[0] === "/ai-gateway/mcp/servers/discover-oauth");

    it("submits an OAuth server with client credentials", async () => {
      mockPost.mockResolvedValue({ data: {} });
      await openCreateForm("https://o.example.com");
      await chooseAuth("OAuth (client credentials)");

      fireEvent.change(screen.getByLabelText(/^Client ID/), { target: { value: "cid" } });
      fireEvent.change(screen.getByLabelText(/^Client secret/), { target: { value: "csecret" } });
      fireEvent.change(screen.getByLabelText(/^Scope \(optional\)/), { target: { value: "read" } });
      fireEvent.change(screen.getByLabelText(/^Token URL/), {
        target: { value: "https://auth.example.com/token" },
      });
      submit();

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          "/ai-gateway/mcp/servers",
          expect.objectContaining({
            auth_type: "oauth",
            auth_config: {
              client_id: "cid",
              client_secret: "csecret",
              token_url: "https://auth.example.com/token",
              token_url_source: "manual",
              scope: "read",
              auth_method: "client_secret_basic",
            },
          }),
        );
      });
    });

    it("finds the token URL and marks it discovered", async () => {
      mockPost.mockImplementation((url: string) =>
        url === "/ai-gateway/mcp/servers/discover-oauth"
          ? Promise.resolve({
              data: {
                token_url: "https://auth.example.com/token",
                auth_method: "client_secret_post",
                issuer: "https://auth.example.com",
              },
            })
          : Promise.resolve({ data: {} }),
      );
      await openCreateForm("https://o.example.com");
      await chooseAuth("OAuth (client credentials)");
      fireEvent.change(screen.getByLabelText(/^Client ID/), { target: { value: "cid" } });
      fireEvent.change(screen.getByLabelText(/^Client secret/), { target: { value: "csecret" } });

      fireEvent.click(screen.getByText("Find token URL"));

      await waitFor(() => {
        expect(screen.getByLabelText(/^Token URL/)).toHaveValue("https://auth.example.com/token");
      });
      expect(screen.getByText(/Found at auth\.example\.com\./)).toBeInTheDocument();
      expect(discoverCalls()[0][1]).toEqual({ url: "https://o.example.com" });

      submit();
      await waitFor(() => {
        const call = mockPost.mock.calls.find((c) => c[0] === "/ai-gateway/mcp/servers");
        expect(call?.[1].auth_config).toMatchObject({
          token_url_source: "discovered",
          auth_method: "client_secret_post",
        });
      });
    });

    it("marks the token URL manual again when it is edited after discovery", async () => {
      mockPost.mockImplementation((url: string) =>
        url === "/ai-gateway/mcp/servers/discover-oauth"
          ? Promise.resolve({
              data: {
                token_url: "https://auth.example.com/token",
                auth_method: "client_secret_post",
              },
            })
          : Promise.resolve({ data: {} }),
      );
      await openCreateForm("https://o.example.com");
      await chooseAuth("OAuth (client credentials)");
      fireEvent.change(screen.getByLabelText(/^Client ID/), { target: { value: "cid" } });
      fireEvent.change(screen.getByLabelText(/^Client secret/), { target: { value: "csecret" } });
      fireEvent.click(screen.getByText("Find token URL"));
      await waitFor(() => {
        expect(screen.getByLabelText(/^Token URL/)).toHaveValue("https://auth.example.com/token");
      });

      fireEvent.change(screen.getByLabelText(/^Token URL/), {
        target: { value: "https://auth.example.com/other" },
      });
      submit();

      await waitFor(() => {
        const call = mockPost.mock.calls.find((c) => c[0] === "/ai-gateway/mcp/servers");
        expect(call?.[1].auth_config).toMatchObject({
          token_url: "https://auth.example.com/other",
          token_url_source: "manual",
        });
      });
    });

    it("shows the API message when finding the token URL fails", async () => {
      mockPost.mockRejectedValue(
        new CustomException("Bad Request", 400, { detail: "No OAuth metadata found" }),
      );
      await openCreateForm("https://o.example.com");
      await chooseAuth("OAuth (client credentials)");

      fireEvent.click(screen.getByText("Find token URL"));

      expect(await screen.findByText("No OAuth metadata found")).toBeInTheDocument();
    });

    it("runs token URL discovery when OAuth is chosen and the URL is filled", async () => {
      mockPost.mockResolvedValue({
        data: { token_url: "https://auth.example.com/token", auth_method: "client_secret_basic" },
      });
      await openCreateForm("https://o.example.com");
      await chooseAuth("OAuth (client credentials)");

      await waitFor(() => expect(discoverCalls()).toHaveLength(1), { timeout: 3000 });
      await waitFor(() =>
        expect(screen.getByLabelText(/^Token URL/)).toHaveValue("https://auth.example.com/token"),
      );
      expect(discoverCalls()[0][1]).toEqual({ url: "https://o.example.com" });
      // Settled: filling the token URL must not trigger a second lookup.
      await new Promise((r) => setTimeout(r, 800));
      expect(discoverCalls()).toHaveLength(1);
    });

    it("prefills the AWS region from an aws-mcp URL", async () => {
      mockPost.mockResolvedValue({ data: {} });
      await openCreateForm("https://aws-mcp.eu-central-1.api.aws/mcp");
      await chooseAuth("AWS IAM");

      expect(screen.getByLabelText(/^Region/)).toHaveValue("eu-central-1");
      fireEvent.change(screen.getByLabelText(/^Access key ID/), { target: { value: "AKIA1" } });
      fireEvent.change(screen.getByLabelText(/^Secret access key/), { target: { value: "sek" } });
      submit();

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          "/ai-gateway/mcp/servers",
          expect.objectContaining({
            auth_type: "aws_iam",
            auth_config: {
              region: "eu-central-1",
              access_key_id: "AKIA1",
              secret_access_key: "sek",
            },
          }),
        );
      });
    });

    it("keeps the stored secret when the field is left blank on edit", async () => {
      mockGet.mockResolvedValue({
        data: {
          servers: [
            makeServer({
              auth_type: "oauth",
              oauth_client_id: "cid",
              oauth_token_url: "https://auth.example.com/token",
              oauth_token_url_source: "discovered",
              oauth_scope: "read",
              auth_secret_hint: "abcd...wxyz",
            }),
          ],
        },
      });
      mockPatch.mockResolvedValue({
        data: { server: makeServer(), discovery: { status: "skipped", tools_discovered: 0 } },
      });
      renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
      await waitFor(() => expect(screen.getByText("Search Server")).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: "Edit server" }));

      expect(screen.getByLabelText(/^Client ID/)).toHaveValue("cid");
      expect(
        screen.getByText("Current secret: abcd...wxyz. Leave blank to keep it."),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => {
        const payload = mockPatch.mock.calls[0][1];
        expect(payload.auth_config).toEqual({
          client_id: "cid",
          token_url: "https://auth.example.com/token",
          token_url_source: "discovered",
          scope: "read",
        });
        expect(payload.auth_config).not.toHaveProperty("client_secret");
      });
      // Editing a saved server never re-runs discovery on its own.
      expect(discoverCalls()).toHaveLength(0);
    });

    it("labels OAuth and AWS IAM servers in the list", async () => {
      mockGet.mockResolvedValue({
        data: {
          servers: [
            makeServer({ id: 1, name: "Oauth Srv", auth_type: "oauth" }),
            makeServer({ id: 2, name: "Aws Srv", auth_type: "aws_iam" }),
          ],
        },
      });
      renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });

      expect(await screen.findByText(/^OAuth · \/search-server$/)).toBeInTheDocument();
      expect(screen.getByText(/^AWS IAM · \/search-server$/)).toBeInTheDocument();
    });

    it("ignores a token URL found for a URL the admin has since changed", async () => {
      const resolvers: Record<string, (v: unknown) => void> = {};
      mockPost.mockImplementation((url: string, body: any) => {
        if (url !== "/ai-gateway/mcp/servers/discover-oauth") return Promise.resolve({ data: {} });
        return new Promise((resolve) => (resolvers[body.url] = resolve));
      });
      await openCreateForm("https://a.example.com");
      await chooseAuth("OAuth (client credentials)");
      await waitFor(() => expect(resolvers["https://a.example.com"]).toBeDefined(), {
        timeout: 3000,
      });

      fireEvent.change(screen.getByLabelText(/^URL/), {
        target: { value: "https://b.example.com" },
      });
      resolvers["https://a.example.com"]({
        data: { token_url: "https://auth-a.example.com/token", auth_method: "client_secret_post" },
      });
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.getByLabelText(/^Token URL/)).toHaveValue("");

      await waitFor(() => expect(resolvers["https://b.example.com"]).toBeDefined(), {
        timeout: 3000,
      });
      resolvers["https://b.example.com"]({
        data: { token_url: "https://auth-b.example.com/token", auth_method: "client_secret_basic" },
      });
      await waitFor(() =>
        expect(screen.getByLabelText(/^Token URL/)).toHaveValue("https://auth-b.example.com/token"),
      );
    });

    it("clears the found-at note when the token URL is edited by hand", async () => {
      mockPost.mockResolvedValue({
        data: { token_url: "https://auth.example.com/token", auth_method: "client_secret_basic" },
      });
      await openCreateForm("https://o.example.com");
      await chooseAuth("OAuth (client credentials)");
      fireEvent.click(screen.getByText("Find token URL"));
      expect(await screen.findByText(/Found at auth\.example\.com\./)).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/^Token URL/), {
        target: { value: "https://x.test/t" },
      });

      expect(screen.queryByText(/Found at/)).not.toBeInTheDocument();
    });

    it("says so when Find token URL returns nothing", async () => {
      mockPost.mockResolvedValue({ data: {} });
      await openCreateForm("https://o.example.com");
      await chooseAuth("OAuth (client credentials)");

      fireEvent.click(screen.getByText("Find token URL"));

      expect(await screen.findByText("Could not find the token URL")).toBeInTheDocument();
    });

    it("exposes the Advanced toggle state", async () => {
      mockPost.mockResolvedValue({ data: {} });
      await openCreateForm("https://o.example.com");
      await chooseAuth("OAuth (client credentials)");

      const toggle = screen.getByRole("button", { name: "Advanced" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText("Resource (optional)")).toBeInTheDocument();
    });

    it("keeps the stored AWS key on edit and names it a key", async () => {
      mockGet.mockResolvedValue({
        data: {
          servers: [
            makeServer({
              auth_type: "aws_iam",
              aws_region: "us-east-1",
              aws_access_key_id: "AKIA1",
              auth_secret_hint: "abcd...wxyz",
            }),
          ],
        },
      });
      mockPatch.mockResolvedValue({
        data: { server: makeServer(), discovery: { status: "skipped", tools_discovered: 0 } },
      });
      renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
      await waitFor(() => expect(screen.getByText("Search Server")).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: "Edit server" }));

      expect(
        screen.getByText("Current key: abcd...wxyz. Leave blank to keep it."),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() => {
        expect(mockPatch.mock.calls[0][1].auth_config).toEqual({
          region: "us-east-1",
          access_key_id: "AKIA1",
        });
      });
    });
  });
});
