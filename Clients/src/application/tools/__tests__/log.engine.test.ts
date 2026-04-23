import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../extractToken", () => ({
  extractUserToken: vi.fn(),
}));

vi.mock("../../redux/store", () => ({
  store: {
    getState: vi.fn(),
  },
}));

import { logEngine } from "../log.engine";
import { extractUserToken } from "../extractToken";
import { store } from "../../redux/store";

const mockStore = vi.mocked(store);
const mockExtractToken = vi.mocked(extractUserToken);

describe("logEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.getState.mockReturnValue({ auth: { authToken: null } } as any);
  });

  it("logs info messages with console.info", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logEngine({ type: "info", message: "test info" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("[INFO]");
    expect(spy.mock.calls[0][0]).toContain("test info");
    spy.mockRestore();
  });

  it("logs error messages with console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logEngine({ type: "error", message: "test error" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("[ERROR]");
    spy.mockRestore();
  });

  it("logs event messages with console.log", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logEngine({ type: "event", message: "test event" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("[EVENT]");
    spy.mockRestore();
  });

  it("includes user details from token when available", () => {
    mockStore.getState.mockReturnValue({ auth: { authToken: "some-token" } } as any);
    mockExtractToken.mockReturnValue({
      id: "5",
      email: "user@test.com",
      name: "Alice",
      surname: "Wonder",
      roleId: "1",
      expire: "99999",
      iat: "11111",
      roleName: "Admin",
      organizationId: "1",
      tenantId: "t1",
    });

    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logEngine({ type: "info", message: "check user" });
    expect(spy.mock.calls[0][0]).toContain("ID: 5");
    expect(spy.mock.calls[0][0]).toContain("EMAIL: user@test.com");
    spy.mockRestore();
  });

  it("shows N/A for user fields when no token", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logEngine({ type: "info", message: "no user" });
    expect(spy.mock.calls[0][0]).toContain("ID: N/A");
    expect(spy.mock.calls[0][0]).toContain("EMAIL: N/A");
    spy.mockRestore();
  });
});
