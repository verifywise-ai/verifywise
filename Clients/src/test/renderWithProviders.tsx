/**
 * Test utility that wraps components in all required providers:
 * Redux store, React Router, MUI ThemeProvider, React Query.
 *
 * Usage:
 *   import { renderWithProviders } from "@/test/renderWithProviders";
 *   renderWithProviders(<MyComponent />, { route: "/vendors" });
 */
import React, { type PropsWithChildren } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { light } from "../presentation/themes";
import authReducer from "../application/redux/auth/authSlice";
import uiSlice from "../application/redux/ui/uiSlice";
import fileReducer from "../application/redux/file/fileSlice";

// ---- Types ----

interface PreloadedAuthState {
  isLoading?: boolean;
  authToken?: string;
  user?: string;
  userExists?: boolean;
  success?: boolean | null;
  message?: string | null;
  expirationDate?: number | null;
  onboardingStatus?: string;
  isOrgCreator?: boolean;
}

interface ExtendedRenderOptions extends Omit<RenderOptions, "queries"> {
  /** Initial route for MemoryRouter (default: "/") */
  route?: string;
  /** Partial auth state to pre-populate */
  preloadedAuth?: PreloadedAuthState;
  /** Full preloaded state for the store */
  preloadedState?: Record<string, unknown>;
}

// ---- Helpers ----

const defaultAuth: PreloadedAuthState = {
  isLoading: false,
  authToken: "",
  user: "",
  userExists: false,
  success: null,
  message: null,
  expirationDate: null,
  onboardingStatus: "completed",
  isOrgCreator: false,
};

function createTestStore(preloadedAuth?: PreloadedAuthState) {
  return configureStore({
    reducer: combineReducers({
      ui: uiSlice,
      auth: authReducer,
      files: fileReducer,
    }),
    preloadedState: {
      auth: { ...defaultAuth, ...preloadedAuth } as ReturnType<typeof authReducer>,
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

// ---- Main export ----

export function renderWithProviders(
  ui: React.ReactElement,
  { route = "/", preloadedAuth, ...renderOptions }: ExtendedRenderOptions = {},
) {
  const store = createTestStore(preloadedAuth);
  const queryClient = createTestQueryClient();

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider theme={light}>
            <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
          </ThemeProvider>
        </QueryClientProvider>
      </Provider>
    );
  }

  return {
    store,
    queryClient,
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
}
