import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

let mockAuth: { isAuthenticated: boolean; userToken: { email: string } | null };
let mockRequest: { data?: object; error: Error | null; isLoading: boolean };
const navigate = vi.fn();
const decide = vi.fn();

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => navigate,
}));
vi.mock("../../../../application/hooks/useAuth", () => ({ useAuth: () => mockAuth }));
vi.mock("../../../../application/hooks/useMcpOAuth", () => ({
  useMcpAuthorizationRequest: () => mockRequest,
}));
vi.mock("../../../../application/hooks/useMcpTools", () => ({
  useMcpTools: () => ({ data: [{ name: "list_risks" }, { name: "list_policies" }] }),
}));
vi.mock("../../../../application/repository/mcpOAuth.repository", () => ({
  decideMcpAuthorizationRequest: (...args: unknown[]) => decide(...args),
}));

import McpAuthorize from "..";
import { takeMcpAuthorizationReturn } from "../../../../application/utils/mcpAuthorizeReturn";

const ROUTE = "/mcp/authorize?request=req-token";
const assign = vi.fn();

describe("McpAuthorize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockAuth = { isAuthenticated: true, userToken: { email: "admin@acme.io" } };
    mockRequest = {
      data: {
        clientName: "Claude Code",
        redirectHost: "localhost:4567",
        organizationName: "Acme",
        canAllow: true,
      },
      error: null,
      isLoading: false,
    };
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign },
      configurable: true,
    });
  });

  it("sends a signed-out user to log in and remembers to come back", () => {
    mockAuth = { isAuthenticated: false, userToken: null };
    renderWithProviders(<McpAuthorize />, { route: ROUTE });
    expect(navigate).toHaveBeenCalledWith("/login", { replace: true });
    expect(takeMcpAuthorizationReturn()).toBe(ROUTE);
  });

  /** The MCP authorization spec requires the redirect host to be shown before the user answers. */
  it("shows who is asking, for which account and organization, and where the browser goes", () => {
    renderWithProviders(<McpAuthorize />, { route: ROUTE });
    expect(screen.getByText(/Allow Claude Code/)).toHaveTextContent(
      "Allow Claude Codeto use VerifyWise",
    );
    expect(screen.getByText("admin@acme.io")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("localhost:4567")).toBeInTheDocument();
    expect(screen.getByText(/Use the 2 VerifyWise tools your account has/)).toBeInTheDocument();
  });

  it("sends the browser to the client with the answer when allowed", async () => {
    decide.mockResolvedValue("http://localhost:4567/callback?code=c");
    renderWithProviders(<McpAuthorize />, { route: ROUTE });
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("http://localhost:4567/callback?code=c"),
    );
    expect(decide).toHaveBeenCalledWith("req-token", true);
  });

  it("only lets a user who cannot connect decline", async () => {
    mockRequest = {
      ...mockRequest,
      data: { ...(mockRequest.data as object), canAllow: false },
    };
    decide.mockResolvedValue("http://localhost:4567/callback?error=access_denied");
    renderWithProviders(<McpAuthorize />, { route: ROUTE });
    expect(screen.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument();
    expect(screen.getByText(/Only Admins and super admins can connect/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(decide).toHaveBeenCalledWith("req-token", false));
  });

  it("says why an invalid or expired request cannot be used", () => {
    mockRequest = {
      data: undefined,
      error: new Error("This sign-in request has expired."),
      isLoading: false,
    };
    renderWithProviders(<McpAuthorize />, { route: ROUTE });
    expect(screen.getByText("This sign-in request has expired.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument();
  });

  it("asks for a request when opened without one", () => {
    renderWithProviders(<McpAuthorize />, { route: "/mcp/authorize" });
    expect(screen.getByText(/needs a sign-in request/)).toBeInTheDocument();
  });
});
