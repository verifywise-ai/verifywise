import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useCreateTask, useUpdateTask, useArchiveTask } from "../useTaskMutations";
import { taskQueryKeys } from "../useTasks";
import { TaskStatus, TaskPriority } from "../../../domain/enums/task.enum";
import type { ITask } from "../../../domain/interfaces/i.task";

vi.mock("../../repository/task.repository", () => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));

vi.mock("../../tools/alertUtils", () => ({
  showAlert: vi.fn(),
}));

import { createTask, updateTask, deleteTask } from "../../repository/task.repository";
import { showAlert } from "../../tools/alertUtils";

const mockCreateTask = vi.mocked(createTask);
const mockUpdateTask = vi.mocked(updateTask);
const mockDeleteTask = vi.mocked(deleteTask);
const mockShowAlert = vi.mocked(showAlert);

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

function makeTask(id: number, overrides: Partial<ITask> = {}): ITask {
  return {
    id,
    title: `Task ${id}`,
    creator_id: 1,
    status: TaskStatus.OPEN,
    priority: TaskPriority.MEDIUM,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Returns the invalidateQueries call keys (as arrays) for assertions.
function invalidatedKeys(spy: { mock: { calls: unknown[][] } }): unknown[][] {
  return spy.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey);
}

describe("useCreateTask", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts an optimistic temp task before the server responds, then swaps in the server entity", async () => {
    const serverTask = makeTask(42, { title: "Server Task" });
    const d = deferred<unknown>();
    mockCreateTask.mockImplementation(() => d.promise as Promise<any>);

    const queryKey = taskQueryKeys.list({});
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData<ITask[]>(queryKey, [makeTask(1)]);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateTask(), { wrapper });

    act(() => {
      result.current.mutate({ body: { title: "Optimistic Task" } });
    });

    // Optimistic temp item is visible before the repository promise resolves.
    await waitFor(() => {
      const data = queryClient.getQueryData<ITask[]>(queryKey);
      expect(data).toHaveLength(2);
      expect(data?.[0].title).toBe("Optimistic Task");
      expect(data?.[0].id).toBeLessThan(0);
    });
    expect(mockCreateTask).toHaveBeenCalledWith({ body: { title: "Optimistic Task" } });

    // Repository returns the response body: { message, data: <entity> }.
    act(() => {
      d.resolve({ message: "Created", data: serverTask });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Temp item is replaced by the authoritative server entity.
    const data = queryClient.getQueryData<ITask[]>(queryKey);
    expect(data?.[0]).toEqual(serverTask);

    // Only derived queries are invalidated — never the tasks list.
    const keys = invalidatedKeys(invalidateSpy);
    expect(keys).toContainEqual(["deadlineWarnings"]);
    expect(keys).toContainEqual(["dashboard"]);
    expect(keys.every((key) => key[0] !== "tasks")).toBe(true);
  });

  it("rolls back and toasts on a 4xx error", async () => {
    const d = deferred<never>();
    mockCreateTask.mockImplementation(() => d.promise as Promise<any>);

    const queryKey = taskQueryKeys.list({});
    const { queryClient, wrapper } = createWrapper();
    const original = [makeTask(1)];
    queryClient.setQueryData<ITask[]>(queryKey, original);

    const { result } = renderHook(() => useCreateTask(), { wrapper });

    act(() => {
      result.current.mutate({ body: { title: "Doomed" } });
    });

    await waitFor(() => expect(queryClient.getQueryData<ITask[]>(queryKey)).toHaveLength(2));

    act(() => {
      d.reject({ response: { status: 400 }, message: "Bad request" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<ITask[]>(queryKey)).toEqual(original);
    expect(mockShowAlert).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });

  it("does not toast on 5xx errors (already covered by the axios interceptor)", async () => {
    mockCreateTask.mockRejectedValue({ response: { status: 500 }, message: "Server error" });

    const queryKey = taskQueryKeys.list({});
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData<ITask[]>(queryKey, [makeTask(1)]);

    const { result } = renderHook(() => useCreateTask(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ body: { title: "Doomed" } })).rejects.toBeTruthy();
    });

    expect(queryClient.getQueryData<ITask[]>(queryKey)).toEqual([makeTask(1)]);
    expect(mockShowAlert).not.toHaveBeenCalled();
  });
});

describe("useUpdateTask", () => {
  beforeEach(() => vi.clearAllMocks());

  it("merges fields optimistically in every cached list variant, then applies the server entity", async () => {
    const serverTask = makeTask(1, { title: "Server Title", status: TaskStatus.IN_PROGRESS });
    const d = deferred<unknown>();
    mockUpdateTask.mockImplementation(() => d.promise as Promise<any>);

    const keyDefault = taskQueryKeys.list({});
    const keyArchived = taskQueryKeys.list({ includeArchived: true });
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData<ITask[]>(keyDefault, [
      makeTask(1, { entity_links: [{ entity_id: 7, entity_type: "vendor" }] } as any),
      makeTask(2),
    ]);
    queryClient.setQueryData<ITask[]>(keyArchived, [makeTask(1), makeTask(2)]);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateTask(), { wrapper });

    act(() => {
      result.current.mutate({ id: 1, body: { title: "Optimistic Title" } });
    });

    // Both cached list variants patched before the server responds.
    await waitFor(() => {
      expect(queryClient.getQueryData<ITask[]>(keyDefault)?.[0].title).toBe("Optimistic Title");
      expect(queryClient.getQueryData<ITask[]>(keyArchived)?.[0].title).toBe("Optimistic Title");
    });
    expect(mockUpdateTask).toHaveBeenCalledWith({ id: 1, body: { title: "Optimistic Title" } });

    act(() => {
      d.resolve({ message: "Updated", data: serverTask });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Server entity wins; client-only fields from the optimistic item survive.
    const updated = queryClient.getQueryData<ITask[]>(keyDefault)?.[0] as any;
    expect(updated.title).toBe("Server Title");
    expect(updated.status).toBe(TaskStatus.IN_PROGRESS);
    expect(updated.entity_links).toEqual([{ entity_id: 7, entity_type: "vendor" }]);

    const keys = invalidatedKeys(invalidateSpy);
    expect(keys).toContainEqual(["deadlineWarnings"]);
    expect(keys).toContainEqual(["dashboard"]);
    expect(keys.every((key) => key[0] !== "tasks")).toBe(true);
  });

  it("rolls back every variant on failure", async () => {
    const d = deferred<never>();
    mockUpdateTask.mockImplementation(() => d.promise as Promise<any>);

    const keyDefault = taskQueryKeys.list({});
    const keyArchived = taskQueryKeys.list({ includeArchived: true });
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData<ITask[]>(keyDefault, [makeTask(1)]);
    queryClient.setQueryData<ITask[]>(keyArchived, [makeTask(1)]);

    const { result } = renderHook(() => useUpdateTask(), { wrapper });

    act(() => {
      result.current.mutate({ id: 1, body: { title: "Changed" } });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData<ITask[]>(keyDefault)?.[0].title).toBe("Changed"),
    );

    act(() => {
      d.reject({ response: { status: 409 }, message: "Conflict" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<ITask[]>(keyDefault)).toEqual([makeTask(1)]);
    expect(queryClient.getQueryData<ITask[]>(keyArchived)).toEqual([makeTask(1)]);
  });
});

describe("useArchiveTask", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes the task from non-archived variants and marks it deleted in archived ones", async () => {
    const d = deferred<unknown>();
    mockDeleteTask.mockImplementation(() => d.promise as Promise<any>);

    const keyDefault = taskQueryKeys.list({});
    const keyArchived = taskQueryKeys.list({ includeArchived: true });
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData<ITask[]>(keyDefault, [makeTask(1), makeTask(2)]);
    queryClient.setQueryData<ITask[]>(keyArchived, [makeTask(1), makeTask(2)]);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useArchiveTask(), { wrapper });

    act(() => {
      result.current.mutate({ id: 1 });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<ITask[]>(keyDefault)).toEqual([makeTask(2)]);
      expect(queryClient.getQueryData<ITask[]>(keyArchived)?.[0].status).toBe(TaskStatus.DELETED);
    });
    expect(mockDeleteTask).toHaveBeenCalledWith({ id: 1 });

    act(() => {
      d.resolve({ message: "Archived" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidatedKeys(invalidateSpy);
    expect(keys).toContainEqual(["deadlineWarnings"]);
    expect(keys).toContainEqual(["dashboard"]);
    expect(keys.every((key) => key[0] !== "tasks")).toBe(true);
  });

  it("restores all variants when archiving fails", async () => {
    const d = deferred<never>();
    mockDeleteTask.mockImplementation(() => d.promise as Promise<any>);

    const keyDefault = taskQueryKeys.list({});
    const { queryClient, wrapper } = createWrapper();
    const original = [makeTask(1), makeTask(2)];
    queryClient.setQueryData<ITask[]>(keyDefault, original);

    const { result } = renderHook(() => useArchiveTask(), { wrapper });

    act(() => {
      result.current.mutate({ id: 1 });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData<ITask[]>(keyDefault)).toEqual([makeTask(2)]),
    );

    act(() => {
      d.reject({ response: { status: 403 }, message: "Forbidden" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<ITask[]>(keyDefault)).toEqual(original);
    expect(mockShowAlert).toHaveBeenCalled();
  });
});
