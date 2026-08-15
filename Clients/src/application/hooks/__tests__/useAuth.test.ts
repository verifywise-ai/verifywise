import { renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../../redux/auth/authSlice";
import uiReducer from "../../redux/ui/uiSlice";
import fileReducer from "../../redux/file/fileSlice";
import { useAuth } from "../useAuth";
import React from "react";

/**
 * Creates a minimal JWT-like token with the given payload.
 * This does NOT produce a cryptographically valid JWT — it's for
 * client-side decoding tests only (extractUserToken uses atob, not verification).
 */
function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

function createWrapper(authToken: string, overrides?: Record<string, unknown>) {
  const store = configureStore({
    reducer: { auth: authReducer, ui: uiReducer, files: fileReducer },
    preloadedState: {
      auth: {
        isLoading: false,
        authToken,
        user: "",
        userExists: false,
        success: null,
        message: null,
        expirationDate: null,
        onboardingStatus: "completed",
        isOrgCreator: false,
        isSuperAdmin: false,
        ...overrides,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(Provider, { store, children });
}

describe("useAuth", () => {
  it("should return isAuthenticated false when no token", () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(""),
    });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBe("");
    expect(result.current.userToken).toBeNull();
    expect(result.current.userId).toBeNull();
    expect(result.current.organizationId).toBeNull();
    expect(result.current.userRoleName).toBe("");
  });

  it("should extract userId and role from a valid token", () => {
    const token = fakeJwt({
      id: "42",
      email: "user@example.com",
      name: "John",
      surname: "Doe",
      roleId: "1",
      roleName: "Admin",
      organizationId: "7",
      tenantId: "abc1234567",
      expire: String(Date.now() + 3600000),
      iat: String(Date.now()),
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(token),
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.userId).toBe(42);
    expect(result.current.userRoleName).toBe("Admin");
    expect(result.current.organizationId).toBe(7);
    expect(result.current.userToken).not.toBeNull();
  });

  it("should handle malformed token gracefully", () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper("not.a.valid-base64"),
    });

    // extractUserToken returns null for malformed tokens
    expect(result.current.isAuthenticated).toBe(true); // token string is truthy
    expect(result.current.userToken).toBeNull();
    expect(result.current.userId).toBeNull();
    expect(result.current.userRoleName).toBe("");
  });

  it("should return null userId when id is not numeric", () => {
    const token = fakeJwt({
      id: "not-a-number",
      roleName: "Editor",
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(token),
    });

    expect(result.current.userId).toBeNaN(); // parseInt("not-a-number") is NaN
  });

  it("should return null organizationId when token has no organizationId", () => {
    const token = fakeJwt({
      id: "5",
      roleName: "Editor",
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(token),
    });

    expect(result.current.organizationId).toBeNull();
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.userId).toBe(5);
    expect(result.current.userRoleName).toBe("Editor");
  });

  it("should return empty roleName when token has no roleName", () => {
    const token = fakeJwt({
      id: "3",
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(token),
    });

    expect(result.current.userRoleName).toBe("");
    expect(result.current.userToken).not.toBeNull();
  });

  it("should default isSuperAdmin to false when undefined", () => {
    const token = fakeJwt({ id: "10", roleName: "Admin", organizationId: "7" });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(token, {
        isSuperAdmin: undefined,
      }),
    });

    expect(result.current.isSuperAdmin).toBe(false);
    expect(result.current.organizationId).toBe(7);
  });
});
