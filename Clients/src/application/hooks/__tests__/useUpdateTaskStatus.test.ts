import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useUpdateTaskStatus } from "../useUpdateTaskStatus";
import { taskQueryKeys } from "../useTasks";
import { TaskStatus } from "../../../domain/enums/task.enum";

vi.mock("../../repository/task.repository", () => ({
  updateTaskStatus: vi.fn(),
}));

import { updateTaskStatus } from "../../repository/task.repository";

const mockUpdateTaskStatus = vi.mocked(updateTaskStatus);

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

describe("useUpdateTaskStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("optimistically updates the task status in the list cache", async () => {
    let resolveMutation: () => void = () => {};
    mockUpdateTaskStatus.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );

    const filters = { includeArchived: false };
    const queryKey = taskQueryKeys.list(filters);
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(queryKey, [
      { id: 1, title: "Task 1", status: TaskStatus.OPEN },
      { id: 2, title: "Task 2", status: TaskStatus.OPEN },
    ]);

    const { result } = renderHook(() => useUpdateTaskStatus(), { wrapper });

    act(() => {
      result.current.mutate({ id: 1, status: TaskStatus.IN_PROGRESS, filters });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData(queryKey)).toEqual([
        { id: 1, title: "Task 1", status: TaskStatus.IN_PROGRESS },
        { id: 2, title: "Task 2", status: TaskStatus.OPEN },
      ]),
    );

    act(() => {
      resolveMutation();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpdateTaskStatus).toHaveBeenCalledWith({ id: 1, status: TaskStatus.IN_PROGRESS });
  });

  it("rolls back the optimistic update when the mutation fails", async () => {
    let rejectMutation: (error: Error) => void = () => {};
    mockUpdateTaskStatus.mockImplementation(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectMutation = reject;
        }),
    );

    const filters = { includeArchived: false };
    const queryKey = taskQueryKeys.list(filters);
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(queryKey, [{ id: 1, title: "Task 1", status: TaskStatus.OPEN }]);

    const { result } = renderHook(() => useUpdateTaskStatus(), { wrapper });

    act(() => {
      result.current.mutate({ id: 1, status: TaskStatus.COMPLETED, filters });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData(queryKey)).toEqual([
        { id: 1, title: "Task 1", status: TaskStatus.COMPLETED },
      ]),
    );

    act(() => {
      rejectMutation(new Error("Failed"));
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(queryKey)).toEqual([
      { id: 1, title: "Task 1", status: TaskStatus.OPEN },
    ]);
  });
});
