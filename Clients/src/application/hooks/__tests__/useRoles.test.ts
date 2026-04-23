import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/entity.repository", () => ({
  getEntityById: vi.fn(),
}));

import { useRoles } from "../useRoles";
import { getEntityById } from "../../repository/entity.repository";

const mockGetEntity = vi.mocked(getEntityById);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useRoles", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches roles", async () => {
    mockGetEntity.mockResolvedValue({ data: [{ id: 1, name: "Admin", description: "Full access" }] });

    const { result } = renderHook(() => useRoles(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.roles).toHaveLength(1);
    expect(result.current.roles[0].name).toBe("Admin");
  });

  it("handles error", async () => {
    mockGetEntity.mockRejectedValue(new Error("Unauthorized"));

    const { result } = renderHook(() => useRoles(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
  });

  it("provides refreshRoles function", async () => {
    mockGetEntity.mockResolvedValue({ data: [] });

    const { result } = renderHook(() => useRoles(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.refreshRoles).toBe("function");
  });
});
