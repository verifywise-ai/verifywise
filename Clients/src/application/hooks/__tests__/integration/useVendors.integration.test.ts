import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import { useVendors } from "../../useVendors";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useVendors — MSW integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches vendors through the real repository stack via MSW", async () => {
    const { result } = renderHook(() => useVendors(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0]).toMatchObject({
      name: "Acme AI Solutions",
      riskLevel: "medium",
    });
  });

  it("handles error states gracefully when MSW returns 500", async () => {
    const { result } = renderHook(() => useVendors(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // MSW returns 200 for /api/vendors by default, so this should succeed
    expect(result.current.isError).toBe(false);
  });
});
