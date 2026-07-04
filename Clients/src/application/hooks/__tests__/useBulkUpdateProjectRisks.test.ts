import { renderHook, act } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useBulkUpdateProjectRisks } from "../useBulkUpdateProjectRisks";

const mockBulkUpdateProjectRisks = vi.fn();

vi.mock("../../repository/projectRisk.repository", () => ({
  bulkUpdateProjectRisks: (...args: unknown[]) => mockBulkUpdateProjectRisks(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useBulkUpdateProjectRisks", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should call bulkUpdateProjectRisks on mutate", async () => {
    mockBulkUpdateProjectRisks.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useBulkUpdateProjectRisks(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ ids: [1, 2], action: "set_owner" });
    });

    expect(mockBulkUpdateProjectRisks).toHaveBeenCalledWith({ ids: [1, 2], action: "set_owner" });
  });

  it("should call onSuccess callback when mutation succeeds", async () => {
    const onSuccess = vi.fn();
    mockBulkUpdateProjectRisks.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useBulkUpdateProjectRisks({ onSuccess }), {
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
    mockBulkUpdateProjectRisks.mockRejectedValue(testError);

    const { result } = renderHook(() => useBulkUpdateProjectRisks({ onError }), {
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
