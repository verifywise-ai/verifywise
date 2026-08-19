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
import MCPToolCatalogPage from "./index";

const mockGet = apiServices.get as unknown as ReturnType<typeof vi.fn>;
const mockPatch = apiServices.patch as unknown as ReturnType<typeof vi.fn>;

function makeTool(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    server_id: 10,
    server_name: "Search Server",
    tool_name: "search_docs",
    description: "Search internal documentation",
    risk_level: "low",
    requires_approval: false,
    input_schema: null,
    is_active: true,
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

const defaultServers = [{ id: 10, name: "Search Server" }];

function mockLoad(tools: any[], servers: any[] = defaultServers) {
  mockGet.mockImplementation((url: string) => {
    if (url.includes("/ai-gateway/mcp/tools")) {
      return Promise.resolve({ data: { tools } });
    }
    if (url.includes("/ai-gateway/mcp/servers")) {
      return Promise.resolve({ data: { servers } });
    }
    return Promise.resolve({ data: {} });
  });
}

describe("MCPToolCatalogPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading skeleton initially", () => {
    mockGet.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<MCPToolCatalogPage />, { route: "/ai-gateway/mcp/tools" });

    expect(document.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
  });

  it("shows an error state with a working retry button", async () => {
    mockGet.mockRejectedValueOnce(new Error("boom"));
    renderWithProviders(<MCPToolCatalogPage />, { route: "/ai-gateway/mcp/tools" });

    await waitFor(() => {
      expect(screen.getByText("Failed to load MCP tools. Please try again.")).toBeInTheDocument();
    });

    mockLoad([makeTool()]);
    fireEvent.click(screen.getByText("Retry"));

    await waitFor(() => {
      expect(screen.getByText("search_docs")).toBeInTheDocument();
    });
  });

  it("shows an empty state with tips and no filters when there are no tools", async () => {
    mockLoad([]);
    renderWithProviders(<MCPToolCatalogPage />, { route: "/ai-gateway/mcp/tools" });

    await waitFor(() => {
      expect(screen.getByText(/No MCP tools discovered yet/)).toBeInTheDocument();
    });

    expect(screen.getByText("Manage tool risk levels")).toBeInTheDocument();
    expect(screen.getByText("Approval workflows")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("groups tools by server and shows a pluralized tool count", async () => {
    mockLoad([
      makeTool({ id: 1, tool_name: "search_docs" }),
      makeTool({ id: 2, tool_name: "search_web" }),
      makeTool({ id: 3, server_id: 20, server_name: "Other Server", tool_name: "solo_tool" }),
    ]);
    renderWithProviders(<MCPToolCatalogPage />, { route: "/ai-gateway/mcp/tools" });

    await waitFor(() => {
      expect(screen.getByText("search_docs")).toBeInTheDocument();
    });

    expect(screen.getByText("Search Server")).toBeInTheDocument();
    expect(screen.getByText("(2 tools)")).toBeInTheDocument();
    expect(screen.getByText("Other Server")).toBeInTheDocument();
    expect(screen.getByText("(1 tool)")).toBeInTheDocument();
  });

  it("falls back to the server map / server id when tool.server_name is missing", async () => {
    mockLoad(
      [makeTool({ server_name: undefined, server_id: 10 })],
      [{ id: 10, name: "Mapped Server" }],
    );
    renderWithProviders(<MCPToolCatalogPage />, { route: "/ai-gateway/mcp/tools" });

    await waitFor(() => {
      expect(screen.getByText("Mapped Server")).toBeInTheDocument();
    });
  });

  it("renders a dash for tools with no description", async () => {
    mockLoad([makeTool({ description: null })]);
    renderWithProviders(<MCPToolCatalogPage />, { route: "/ai-gateway/mcp/tools" });

    await waitFor(() => {
      expect(screen.getByText("search_docs")).toBeInTheDocument();
    });

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("filters tools by server", async () => {
    mockLoad(
      [
        makeTool({ id: 1, tool_name: "search_docs", server_id: 10, server_name: "Search Server" }),
        makeTool({ id: 2, tool_name: "other_tool", server_id: 20, server_name: "Other Server" }),
      ],
      [
        { id: 10, name: "Search Server" },
        { id: 20, name: "Other Server" },
      ],
    );
    renderWithProviders(<MCPToolCatalogPage />, { route: "/ai-gateway/mcp/tools" });

    await waitFor(() => {
      expect(screen.getByText("search_docs")).toBeInTheDocument();
      expect(screen.getByText("other_tool")).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Filter by server" }));
    fireEvent.click(screen.getByRole("option", { name: "Search Server" }));

    await waitFor(() => {
      expect(screen.queryByText("other_tool")).not.toBeInTheDocument();
    });
    expect(screen.getByText("search_docs")).toBeInTheDocument();
  });

  it("filters tools by risk level and shows a no-match state", async () => {
    mockLoad([
      makeTool({ id: 1, tool_name: "low_tool", risk_level: "low" }),
      makeTool({ id: 2, tool_name: "high_tool", risk_level: "high" }),
    ]);
    renderWithProviders(<MCPToolCatalogPage />, { route: "/ai-gateway/mcp/tools" });

    await waitFor(() => {
      expect(screen.getByText("low_tool")).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Filter by risk" }));
    fireEvent.click(screen.getByRole("option", { name: "Medium" }));

    await waitFor(() => {
      expect(screen.getByText("No tools match the selected filters.")).toBeInTheDocument();
    });
  });

  it("toggles requires_approval and reloads", async () => {
    mockLoad([makeTool({ requires_approval: false })]);
    mockPatch.mockResolvedValue({ data: {} });
    renderWithProviders(<MCPToolCatalogPage />, { route: "/ai-gateway/mcp/tools" });

    await waitFor(() => {
      expect(screen.getByText("search_docs")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/ai-gateway/mcp/tools/1", {
        requires_approval: true,
      });
    });
  });

  it("opens the edit modal pre-filled and submits changes via patch", async () => {
    mockLoad([makeTool({ risk_level: "medium", requires_approval: true })]);
    mockPatch.mockResolvedValue({ data: {} });
    renderWithProviders(<MCPToolCatalogPage />, { route: "/ai-gateway/mcp/tools" });

    await waitFor(() => {
      expect(screen.getByText("search_docs")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit tool" }));

    expect(screen.getByText("Edit tool settings")).toBeInTheDocument();
    expect(
      screen.getByText(/Configure risk level and approval for "search_docs"/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/ai-gateway/mcp/tools/1", {
        risk_level: "medium",
        requires_approval: true,
      });
    });
  });

  it("shows a high-risk warning banner only when risk is high and approval is not required", async () => {
    mockLoad([makeTool({ risk_level: "low", requires_approval: false })]);
    renderWithProviders(<MCPToolCatalogPage />, { route: "/ai-gateway/mcp/tools" });

    await waitFor(() => {
      expect(screen.getByText("search_docs")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit tool" }));

    expect(screen.queryByText(/This tool is marked as high risk/)).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "High" }));

    expect(screen.getByText(/This tool is marked as high risk/)).toBeInTheDocument();

    // Toggling "Requires approval" on should hide the warning again.
    const approvalToggle = screen.getByRole("switch");
    fireEvent.click(approvalToggle);

    expect(screen.queryByText(/This tool is marked as high risk/)).not.toBeInTheDocument();
  });

  it("shows the server-provided error message when the update fails", async () => {
    mockLoad([makeTool()]);
    mockPatch.mockRejectedValue({ response: { data: { message: "Update rejected" } } });
    renderWithProviders(<MCPToolCatalogPage />, { route: "/ai-gateway/mcp/tools" });

    await waitFor(() => {
      expect(screen.getByText("search_docs")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit tool" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Update rejected")).toBeInTheDocument();
  });
});
