import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/task.repository", () => ({
  getAllTasks: vi.fn(),
}));

import { useTasks, taskQueryKeys } from "../useTasks";
import { getAllTasks } from "../../repository/task.repository";

const mockGetAllTasks = vi.mocked(getAllTasks);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useTasks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches tasks with default sorting and no archived filter", async () => {
    mockGetAllTasks.mockResolvedValue({ data: { tasks: [{ id: 1 }] } } as any);

    const { result } = renderHook(() => useTasks(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGetAllTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        include_archived: undefined,
        sort_by: "created_at",
        sort_order: "DESC",
      }),
    );
    expect(result.current.data).toEqual([{ id: 1 }]);
  });

  it("passes includeArchived through to the repository call", async () => {
    mockGetAllTasks.mockResolvedValue({ data: { tasks: [] } } as any);

    renderHook(() => useTasks({ includeArchived: true }), { wrapper: createWrapper() });

    await waitFor(() =>
      expect(mockGetAllTasks).toHaveBeenCalledWith(
        expect.objectContaining({ include_archived: true }),
      ),
    );
  });

  it("returns an empty array when the response has no tasks", async () => {
    mockGetAllTasks.mockResolvedValue({ data: {} } as any);

    const { result } = renderHook(() => useTasks(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });
});

describe("taskQueryKeys", () => {
  it("builds hierarchical query keys", () => {
    expect(taskQueryKeys.all).toEqual(["tasks"]);
    expect(taskQueryKeys.lists()).toEqual(["tasks", "list"]);
    expect(taskQueryKeys.list({ includeArchived: true })).toEqual([
      "tasks",
      "list",
      { includeArchived: true },
    ]);
    expect(taskQueryKeys.details()).toEqual(["tasks", "detail"]);
    expect(taskQueryKeys.detail(3)).toEqual(["tasks", "detail", 3]);
  });
});
