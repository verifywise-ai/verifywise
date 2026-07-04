import { renderHook, act } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useBulkUpdateTasks } from "../useBulkUpdateTasks";

const mockBulkUpdateTasks = vi.fn();

vi.mock("../../repository/task.repository", () => ({
  bulkUpdateTasks: (...args: unknown[]) => mockBulkUpdateTasks(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useBulkUpdateTasks", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should call bulkUpdateTasks on mutate", async () => {
    mockBulkUpdateTasks.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useBulkUpdateTasks(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ ids: [1, 2], action: "mark_complete" });
    });

    expect(mockBulkUpdateTasks).toHaveBeenCalledWith({ ids: [1, 2], action: "mark_complete" });
  });

  it("should call onSuccess callback when mutation succeeds", async () => {
    const onSuccess = vi.fn();
    mockBulkUpdateTasks.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useBulkUpdateTasks({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ ids: [1, 2], action: "mark_complete" });
    });

    expect(onSuccess).toHaveBeenCalledWith({ ids: [1, 2], action: "mark_complete" });
  });

  it("should call onError callback when mutation fails", async () => {
    const onError = vi.fn();
    const testError = new Error("Network error");
    mockBulkUpdateTasks.mockRejectedValue(testError);

    const { result } = renderHook(() => useBulkUpdateTasks({ onError }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({ ids: [1], action: "mark_complete" });
      } catch {
        // expected
      }
    });

    expect(onError).toHaveBeenCalledWith(testError, { ids: [1], action: "mark_complete" });
  });
});
