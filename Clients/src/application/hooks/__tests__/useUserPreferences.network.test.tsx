/**
 * useUserPreferences — network-backed (Settings group).
 *
 * Covers the `/users/me/preferences` half of the settings group. Like
 * frameworks, this uses the STATUS_CODE `{ message, data }` envelope: the
 * repository returns the whole body and the hook reads `.data`, merging it over
 * its defaults.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../test/mocks/server";
import { mockUserPreferences } from "../../../test/mocks/data/settings";
import { settingsErrors } from "../../../test/mocks/errorHandlers";

vi.mock("../useAuth", () => ({
  useAuth: () => ({ userId: 1 }),
}));

import useUserPreferences from "../useUserPreferences";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useUserPreferences (network-backed)", () => {
  it("returns the preferences from the API", async () => {
    const { result } = renderHook(() => useUserPreferences(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.userPreferences?.date_format).toBe(mockUserPreferences.date_format);
    expect(result.current.userPreferences?.language).toBe("en");
  });

  // On failure the hook does not expose an error flag of its own: it reports
  // `isDefault` and falls back to the built-in defaults, so the UI stays
  // configured. Assert both, since falling back silently is the actual contract.
  it("falls back to defaults and reports an error on 500", async () => {
    server.use(settingsErrors.preferences.serverError());

    const { result } = renderHook(() => useUserPreferences(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isDefault).toBe(true);
    expect(result.current.error).toBeTruthy();
    expect(result.current.userPreferences?.language).toBe("en");
  });

  it("falls back to defaults on 403", async () => {
    server.use(settingsErrors.preferences.forbidden());

    const { result } = renderHook(() => useUserPreferences(), { wrapper });

    // isDefault is already true on first render (data is undefined), so waiting
    // on it would resolve before the request fails. Wait for the query to settle.
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isDefault).toBe(true);
    expect(result.current.error).toBeTruthy();
  });

  it("falls back to defaults on a transport failure", async () => {
    server.use(settingsErrors.preferences.transport());

    const { result } = renderHook(() => useUserPreferences(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isDefault).toBe(true);
    expect(result.current.error).toBeTruthy();
  });
});
