import { renderHook, act } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router-dom";
import authReducer from "../../redux/auth/authSlice";
import uiReducer from "../../redux/ui/uiSlice";
import fileReducer from "../../redux/file/fileSlice";
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
        activeOrganizationId: null,
      },
    },
  });

  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      Provider,
      { store, children: React.createElement(MemoryRouter, null, children) },
    );

  return { Wrapper, store };
}

describe("useLogout", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("should clear auth state and navigate to /login", async () => {
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

    // Should navigate to login
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });
});
