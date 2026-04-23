import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../useAuth", () => ({
  useAuth: () => ({ userId: 1 }),
}));

vi.mock("../../repository/userPreferences.repository", () => ({
  getUserPreferencesByUserId: vi.fn(),
}));

import useUserPreferences from "../useUserPreferences";
import { getUserPreferencesByUserId } from "../../repository/userPreferences.repository";

const mockGetPrefs = vi.mocked(getUserPreferencesByUserId);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useUserPreferences", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches user preferences", async () => {
    mockGetPrefs.mockResolvedValue({ data: { date_format: "MM/DD/YYYY" } });

    const { result } = renderHook(() => useUserPreferences(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.userPreferences.date_format).toBe("MM/DD/YYYY");
    expect(result.current.isDefault).toBe(false);
  });

  it("returns defaults on error", async () => {
    mockGetPrefs.mockRejectedValue(new Error("Not found"));

    const { result } = renderHook(() => useUserPreferences(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isDefault).toBe(true);
    expect(result.current.userPreferences.date_format).toBeDefined();
  });
});
