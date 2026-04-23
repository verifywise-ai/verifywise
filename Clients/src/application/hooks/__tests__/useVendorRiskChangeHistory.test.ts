import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/changeHistory.repository", () => ({
  getEntityChangeHistory: vi.fn(),
}));

import { useVendorRiskChangeHistory } from "../useVendorRiskChangeHistory";
import { getEntityChangeHistory } from "../../repository/changeHistory.repository";

const mockGetHistory = vi.mocked(getEntityChangeHistory);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useVendorRiskChangeHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls useEntityChangeHistory with 'vendor_risk' type", async () => {
    mockGetHistory.mockResolvedValue({
      data: [{ id: 1, action: "deleted", changed_by_user_id: 3, changed_at: "2024-02-01" }],
      hasMore: false,
      total: 1,
    });

    const { result } = renderHook(() => useVendorRiskChangeHistory(7), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetHistory).toHaveBeenCalledWith("vendor_risk", 7, 100, 0);
  });

  it("does not fetch when vendorRiskId is undefined", () => {
    const { result } = renderHook(() => useVendorRiskChangeHistory(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });
});
