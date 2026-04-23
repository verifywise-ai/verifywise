import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/changeHistory.repository", () => ({
  getEntityChangeHistory: vi.fn(),
}));

import { useModelInventoryChangeHistory } from "../useModelInventoryChangeHistory";
import { getEntityChangeHistory } from "../../repository/changeHistory.repository";

const mockGetHistory = vi.mocked(getEntityChangeHistory);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useModelInventoryChangeHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls useEntityChangeHistory with 'model_inventory' type", async () => {
    mockGetHistory.mockResolvedValue({
      data: [{ id: 1, action: "created", changed_by_user_id: 1, changed_at: "2024-01-01" }],
      hasMore: false,
      total: 1,
    });

    const { result } = renderHook(() => useModelInventoryChangeHistory(42), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetHistory).toHaveBeenCalledWith("model_inventory", 42, 100, 0);
  });

  it("does not fetch when modelInventoryId is undefined", () => {
    const { result } = renderHook(() => useModelInventoryChangeHistory(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });
});
