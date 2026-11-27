import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

let mockTools: { data?: { name: string }[]; isLoading: boolean; isError: boolean };

vi.mock("../../../../application/hooks/useMcpTools", () => ({
  useMcpTools: () => mockTools,
}));
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 8 }),
}));

let mockConnections: { data?: object[]; isLoading: boolean };
const revokeConnection = vi.fn();
vi.mock("../../../../application/hooks/useMcpOAuth", () => ({
  useMcpConnections: () => mockConnections,
  useRevokeMcpConnection: () => ({ mutate: revokeConnection, isPending: false }),
}));

const getApiTokens = vi.fn();
const createApiToken = vi.fn();
const revokeApiToken = vi.fn();
vi.mock("../../../../application/repository/tokens.repository", () => ({
  getApiTokens: (...args: unknown[]) => getApiTokens(...args),
  createApiToken: (...args: unknown[]) => createApiToken(...args),
  revokeApiToken: (...args: unknown[]) => revokeApiToken(...args),
}));

import McpConnect from "../McpConnect";

const writeText = vi.fn();
Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

describe("McpConnect", () => {
  beforeEach(() => {
    mockConnections = { data: [], isLoading: false };
  });

  /** Browser sign-in needs no token: the command only names the server. */
  it("gives a sign-in command without a token", () => {
    mockTools = { data: [], isLoading: false, isError: false };
    renderWithProviders(<McpConnect />);
    expect(screen.getByTestId("mcp-sign-in-command")).toHaveTextContent(
      `claude mcp add --transport http --scope user verifywise ${window.location.origin}/api/mcp`,
    );
    expect(screen.getByTestId("mcp-remove-command")).toHaveTextContent(
      "claude mcp remove verifywise -s user",
    );
    expect(screen.getByTestId("mcp-sign-in-command")).not.toHaveTextContent("Authorization");
    expect(screen.getByText("No clients signed in yet.")).toBeInTheDocument();
  });

  it("lists the signed-in clients and disconnects one", () => {
    mockTools = { data: [], isLoading: false, isError: false };
    mockConnections = {
      data: [
        {
          id: 11,
          client_name: "Claude Code",
          organization_name: "Acme",
          created_at: new Date().toISOString(),
          last_used_at: null,
        },
      ],
      isLoading: false,
    };
    renderWithProviders(<McpConnect />);
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText(/^Acme · signed in/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /disconnect/i }));
    expect(revokeConnection).toHaveBeenCalledWith(11);
  });

  /** The server decides each user's tools, so the page shows its answer, not a fixed list. */
  it("lists the tools the server gives this user", () => {
    mockTools = {
      data: [{ name: "list_organizations" }, { name: "update_user_role" }, { name: "list_risks" }],
      isLoading: false,
      isError: false,
    };
    renderWithProviders(<McpConnect />);
    expect(screen.getByText("3 tools for your account")).toBeInTheDocument();
    expect(screen.getByText("update_user_role")).toBeInTheDocument();
    expect(screen.getByText("list_risks")).toBeInTheDocument();
  });

  it("says the list is loading until the server answers", () => {
    mockTools = { data: undefined, isLoading: true, isError: false };
    renderWithProviders(<McpConnect />);
    expect(screen.getByText("Loading the tools…")).toBeInTheDocument();
  });

  it("says the list could not be loaded when the request fails", () => {
    mockTools = { data: undefined, isLoading: false, isError: true };
    renderWithProviders(<McpConnect />);
    expect(
      screen.getByText("Couldn't load the tool list. Reload the page to try again."),
    ).toBeInTheDocument();
  });

  it("shows the reason and turns token creation off when given one", () => {
    mockTools = { data: [], isLoading: false, isError: false };
    renderWithProviders(<McpConnect disabledReason="Use the other tab." />);
    expect(screen.getByText("Use the other tab.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create command/i })).toBeDisabled();
  });

  /** Only this user's earlier MCP tokens are revoked: not hand-made keys, not another admin's. */
  it("revokes this user's previous MCP token, then shows a command carrying the new one", async () => {
    mockTools = { data: [], isLoading: false, isError: false };
    getApiTokens.mockResolvedValue({
      data: {
        data: [
          { id: 1, name: "Claude Code MCP 2026-11-01 10:00:00", created_by: 8, revoked: false },
          { id: 2, name: "Claude Code MCP 2026-11-02 10:00:00", created_by: 9, revoked: false },
          { id: 3, name: "CI key", created_by: 8, revoked: false },
          { id: 4, name: "Claude Code MCP 2026-10-01 10:00:00", created_by: 8, revoked: true },
        ],
      },
    });
    revokeApiToken.mockResolvedValue({});
    createApiToken.mockResolvedValue({ data: { data: { token: "vw_secret" } } });

    renderWithProviders(<McpConnect />);
    expect(screen.queryByTestId("mcp-add-command")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /create command/i }));

    const command = await screen.findByTestId("mcp-add-command");
    expect(revokeApiToken).toHaveBeenCalledTimes(1);
    expect(revokeApiToken).toHaveBeenCalledWith({ routeUrl: "/tokens/1/revoke" });
    expect(createApiToken).toHaveBeenCalledWith({
      routeUrl: "/tokens",
      body: { name: expect.stringMatching(/^Claude Code MCP /), expires_in_days: 90 },
    });
    expect(command).toHaveTextContent(
      `claude mcp add --transport http --scope user verifywise ${window.location.origin}/api/mcp --header "Authorization: Bearer vw_secret"`,
    );
    fireEvent.click(screen.getByTestId("mcp-add-command-copy"));
    expect(writeText).toHaveBeenCalledWith(
      `claude mcp add --transport http --scope user verifywise ${window.location.origin}/api/mcp --header "Authorization: Bearer vw_secret"`,
    );
  });

  it("still issues the token when listing earlier ones fails", async () => {
    mockTools = { data: [], isLoading: false, isError: false };
    getApiTokens.mockRejectedValue(new Error("down"));
    createApiToken.mockResolvedValue({ data: { data: { token: "vw_secret" } } });

    renderWithProviders(<McpConnect />);
    fireEvent.click(screen.getByRole("button", { name: /create command/i }));

    expect(await screen.findByTestId("mcp-add-command")).toHaveTextContent("vw_secret");
  });

  it("shows the server's error and no command when the token cannot be created", async () => {
    mockTools = { data: [], isLoading: false, isError: false };
    getApiTokens.mockResolvedValue({ data: { data: [] } });
    createApiToken.mockRejectedValue({ response: { data: { data: "Token limit reached" } } });

    renderWithProviders(<McpConnect />);
    fireEvent.click(screen.getByRole("button", { name: /create command/i }));

    await waitFor(() => expect(screen.getByText("Token limit reached")).toBeInTheDocument());
    expect(screen.queryByTestId("mcp-add-command")).not.toBeInTheDocument();
  });
});
