import { renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../../redux/auth/authSlice";
import uiReducer from "../../redux/ui/uiSlice";
import fileReducer from "../../redux/file/fileSlice";
import { useIsAdmin, useUserRole } from "../useIsAdmin";
import React from "react";

function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

function createWrapper(authToken: string) {
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
        activeOrganizationId: null,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(Provider, { store, children });
}

describe("useIsAdmin", () => {
  it("should return true for Admin role", () => {
    const token = fakeJwt({ id: "1", roleName: "Admin" });
    const { result } = renderHook(() => useIsAdmin(), {
      wrapper: createWrapper(token),
    });
    expect(result.current).toBe(true);
  });

  it.each(["Reviewer", "Editor", "Auditor"])(
    "should return false for %s role",
    (role) => {
      const token = fakeJwt({ id: "1", roleName: role });
      const { result } = renderHook(() => useIsAdmin(), {
        wrapper: createWrapper(token),
      });
      expect(result.current).toBe(false);
    }
  );

  it("should return false when no token", () => {
    const { result } = renderHook(() => useIsAdmin(), {
      wrapper: createWrapper(""),
    });
    expect(result.current).toBe(false);
  });
});

describe("useUserRole", () => {
  it.each(["Admin", "Reviewer", "Editor", "Auditor"])(
    "should return %s for matching token",
    (role) => {
      const token = fakeJwt({ id: "1", roleName: role });
      const { result } = renderHook(() => useUserRole(), {
        wrapper: createWrapper(token),
      });
      expect(result.current).toBe(role);
    }
  );

  it("should return null when no token", () => {
    const { result } = renderHook(() => useUserRole(), {
      wrapper: createWrapper(""),
    });
    expect(result.current).toBeNull();
  });
});
