import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useUpdateTaskPriority } from "../useUpdateTaskPriority";
import { taskQueryKeys } from "../useTasks";
import { TaskPriority } from "../../../domain/enums/task.enum";

vi.mock("../../repository/task.repository", () => ({
  updateTaskPriority: vi.fn(),
}));

import { updateTaskPriority } from "../../repository/task.repository";

const mockUpdateTaskPriority = vi.mocked(updateTaskPriority);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

describe("useUpdateTaskPriority", () => {
  beforeEach(() => vi.clearAllMocks());

  it("optimistically updates the task priority in the list cache", async () => {
    let resolveMutation: () => void = () => {};
    mockUpdateTaskPriority.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );

    const filters = { includeArchived: false };
    const queryKey = taskQueryKeys.list(filters);
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(queryKey, [
      { id: 1, title: "Task 1", priority: TaskPriority.LOW },
      { id: 2, title: "Task 2", priority: TaskPriority.MEDIUM },
    ]);

    const { result } = renderHook(() => useUpdateTaskPriority(), { wrapper });

    act(() => {
      result.current.mutate({ id: 1, priority: TaskPriority.HIGH, filters });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData(queryKey)).toEqual([
        { id: 1, title: "Task 1", priority: TaskPriority.HIGH },
        { id: 2, title: "Task 2", priority: TaskPriority.MEDIUM },
      ]),
    );

    act(() => {
      resolveMutation();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpdateTaskPriority).toHaveBeenCalledWith({ id: 1, priority: TaskPriority.HIGH });
  });

  it("rolls back the optimistic update when the mutation fails", async () => {
    let rejectMutation: (error: Error) => void = () => {};
    mockUpdateTaskPriority.mockImplementation(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectMutation = reject;
        }),
    );

    const filters = { includeArchived: false };
    const queryKey = taskQueryKeys.list(filters);
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(queryKey, [{ id: 1, title: "Task 1", priority: TaskPriority.LOW }]);

    const { result } = renderHook(() => useUpdateTaskPriority(), { wrapper });

    act(() => {
      result.current.mutate({ id: 1, priority: TaskPriority.HIGH, filters });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData(queryKey)).toEqual([
        { id: 1, title: "Task 1", priority: TaskPriority.HIGH },
      ]),
    );

    act(() => {
      rejectMutation(new Error("Failed"));
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(queryKey)).toEqual([
      { id: 1, title: "Task 1", priority: TaskPriority.LOW },
    ]);
  });
});
