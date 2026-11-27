import { rememberMcpAuthorization, takeMcpAuthorizationReturn } from "../mcpAuthorizeReturn";

describe("mcpAuthorizeReturn", () => {
  beforeEach(() => sessionStorage.clear());

  it("returns the remembered consent page once", () => {
    rememberMcpAuthorization("/mcp/authorize?request=abc");
    expect(takeMcpAuthorizationReturn()).toBe("/mcp/authorize?request=abc");
    expect(takeMcpAuthorizationReturn()).toBeNull();
  });

  /** Only ever a path to the consent page, never somewhere a stored value could send the user. */
  it("ignores anything other than the consent page", () => {
    sessionStorage.setItem("mcp_authorize_return", "https://evil.example.com/");
    expect(takeMcpAuthorizationReturn()).toBeNull();
  });
});
