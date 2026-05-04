import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/changeHistory.repository", () => ({
  getEntityChangeHistory: vi.fn(),
}));

import { useEntityChangeHistory } from "../useEntityChangeHistory";
import { getEntityChangeHistory } from "../../repository/changeHistory.repository";

const mockGetHistory = vi.mocked(getEntityChangeHistory);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useEntityChangeHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches change history for a valid entity", async () => {
    mockGetHistory.mockResolvedValue({
      data: [{ id: 1, action: "created", changed_by_user_id: 1, changed_at: "2024-01-01" }],
      hasMore: false,
      total: 1,
    });

    const { result } = renderHook(() => useEntityChangeHistory("model_inventory", 5), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGetHistory).toHaveBeenCalledWith("model_inventory", 5, 100, 0);
    expect(result.current.data?.pages[0].data).toHaveLength(1);
  });

  it("does not fetch when entityId is undefined", () => {
    const { result } = renderHook(() => useEntityChangeHistory("policy", undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockGetHistory).not.toHaveBeenCalled();
  });

  it("does not fetch when entityType is undefined", () => {
    const { result } = renderHook(() => useEntityChangeHistory(undefined, 1), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockGetHistory).not.toHaveBeenCalled();
  });
});
