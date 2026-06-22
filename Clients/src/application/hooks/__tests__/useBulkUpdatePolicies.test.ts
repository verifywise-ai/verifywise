import { renderHook, act } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useBulkUpdatePolicies } from "../useBulkUpdatePolicies";

const mockBulkUpdatePolicies = vi.fn();

vi.mock("../../repository/policy.repository", () => ({
  bulkUpdatePolicies: (...args: unknown[]) => mockBulkUpdatePolicies(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useBulkUpdatePolicies", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should call bulkUpdatePolicies on mutate", async () => {
    mockBulkUpdatePolicies.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useBulkUpdatePolicies(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ ids: [1, 2], action: "archive" });
    });

    expect(mockBulkUpdatePolicies).toHaveBeenCalledWith({ ids: [1, 2], action: "archive" });
  });

  it("should call onSuccess callback when mutation succeeds", async () => {
    const onSuccess = vi.fn();
    mockBulkUpdatePolicies.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useBulkUpdatePolicies({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ ids: [1], action: "archive" });
    });

    expect(onSuccess).toHaveBeenCalledWith({ ids: [1], action: "archive" });
  });

  it("should call onError callback when mutation fails", async () => {
    const onError = vi.fn();
    const testError = new Error("Network error");
    mockBulkUpdatePolicies.mockRejectedValue(testError);

    const { result } = renderHook(() => useBulkUpdatePolicies({ onError }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({ ids: [1], action: "archive" });
      } catch {
        // expected
      }
    });

    expect(onError).toHaveBeenCalledWith(testError, { ids: [1], action: "archive" });
  });
});
