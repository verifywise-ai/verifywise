import { renderHook, act } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router";
import authReducer from "../../redux/auth/authSlice";
import uiReducer from "../../redux/ui/uiSlice";
import fileReducer from "../../redux/file/fileSlice";
import { queryClient } from "../../config/queryClient";
import useLogout from "../useLogout";
import React from "react";

const mockNavigate = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

function createWrapper() {
  const store = configureStore({
    reducer: { auth: authReducer, ui: uiReducer, files: fileReducer },
    preloadedState: {
      auth: {
        isLoading: false,
        authToken: "some-token",
        user: "user-data",
        userExists: true,
        success: true,
        message: null,
        expirationDate: Date.now() + 3600000,
        onboardingStatus: "completed",
        isOrgCreator: false,
        isSuperAdmin: false,
      },
    },
  });

  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(Provider, {
      store,
      children: React.createElement(MemoryRouter, null, children),
    });

  return { Wrapper, store };
}

describe("useLogout", () => {
  const originalLocation = window.location;
  const mockAssign = vi.fn();

  beforeEach(() => {
    mockNavigate.mockClear();
    mockAssign.mockClear();
    // jsdom cannot navigate; record the full page load instead.
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...originalLocation, assign: mockAssign },
    });
  });

  afterEach(() => {
    queryClient.clear();
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it("should clear auth state and load /login as a new page", async () => {
    const { Wrapper, store } = createWrapper();

    const { result } = renderHook(() => useLogout(), { wrapper: Wrapper });

    await act(async () => {
      await result.current();
    });

    // Auth state should be cleared
    const authState = store.getState().auth;
    expect(authState.authToken).toBe("");
    expect(authState.user).toBe("");
    expect(authState.expirationDate).toBeNull();

    // A full page load, so app-level providers (Advisor conversation,
    // VerifyWise context) do not carry this session's state to the next.
    expect(mockAssign).toHaveBeenCalledWith("/login");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("should clear the query cache so the next user sees no cached data", async () => {
    const { Wrapper } = createWrapper();
    queryClient.setQueryData(["projects"], [{ id: 1, name: "Previous user's project" }]);

    const { result } = renderHook(() => useLogout(), { wrapper: Wrapper });

    await act(async () => {
      await result.current();
    });

    expect(queryClient.getQueryData(["projects"])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
