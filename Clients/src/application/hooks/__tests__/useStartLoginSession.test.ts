import { renderHook } from "@testing-library/react";

const navigate = vi.fn();
vi.mock("react-router", () => ({ useNavigate: () => navigate }));
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }));
vi.mock("../../utils/clearSession", () => ({ startSession: vi.fn() }));
vi.mock("../../tools/log.engine", () => ({ logEngine: vi.fn() }));
let tokenOrganizationId: string | undefined;
vi.mock("../../tools/extractToken", () => ({
  extractUserToken: () => ({ organizationId: tokenOrganizationId }),
}));

import { useStartLoginSession } from "../useStartLoginSession";
import { rememberMcpAuthorization } from "../../utils/mcpAuthorizeReturn";

const session = { token: "t", isSuperAdmin: false } as Parameters<
  ReturnType<typeof useStartLoginSession>
>[0];

describe("useStartLoginSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    tokenOrganizationId = "3";
  });

  it("lands on the home page", () => {
    renderHook(() => useStartLoginSession()).result.current(session, false);
    expect(navigate).toHaveBeenCalledWith("/");
  });

  /** Logging in to answer an MCP client's sign-in goes back to the consent page. */
  it("returns to a pending MCP consent page", () => {
    rememberMcpAuthorization("/mcp/authorize?request=abc");
    renderHook(() => useStartLoginSession()).result.current(session, false);
    expect(navigate).toHaveBeenCalledWith("/mcp/authorize?request=abc");
  });

  it("returns a super admin without an organization there too, not to /super-admin", () => {
    tokenOrganizationId = undefined;
    rememberMcpAuthorization("/mcp/authorize?request=abc");
    renderHook(() => useStartLoginSession()).result.current(
      { ...session, isSuperAdmin: true },
      false,
    );
    expect(navigate).toHaveBeenCalledWith("/mcp/authorize?request=abc");
  });
});
