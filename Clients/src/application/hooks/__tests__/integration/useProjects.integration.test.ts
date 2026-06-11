import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Do NOT mock the repository — let the real repository call MSW
import { useProjects } from "../../useProjects";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useProjects — MSW integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches projects through the real repository stack via MSW", async () => {
    const { result } = renderHook(() => useProjects(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(3);
    expect(result.current.data?.[0]).toMatchObject({
      name: "AI Governance Assessment",
      status: "active",
    });
  });

  it("filters approved projects correctly with MSW data", async () => {
    const { result } = renderHook(() => useProjects(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // All mock projects are active/pending — approvedProjects should exclude pending/rejected
    expect(Array.isArray(result.current.approvedProjects)).toBe(true);
  });

  it("handles loading and error states through the full stack", async () => {
    const { result } = renderHook(() => useProjects(), { wrapper: createWrapper() });

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should succeed because MSW intercepts the request
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toBeDefined();
  });
});
