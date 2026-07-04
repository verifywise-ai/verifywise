import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useOptimisticListMutation,
  useOptimisticDetailMutation,
  patchListItemById,
  patchListItemsByIds,
} from "../optimisticMutation";

interface TestItem {
  id: number;
  name: string;
  status: string;
}

const TEST_LIST_KEY = ["test", "list"] as const;
const TEST_DETAIL_KEY = ["test", "detail", 1] as const;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

describe("patchListItemById", () => {
  it("patches the matching item and leaves others unchanged", () => {
    const list: TestItem[] = [
      { id: 1, name: "A", status: "old" },
      { id: 2, name: "B", status: "old" },
    ];
    const result = patchListItemById(list, 1, { status: "new" });
    expect(result).toEqual([
      { id: 1, name: "A", status: "new" },
      { id: 2, name: "B", status: "old" },
    ]);
  });

  it("returns undefined when list is undefined", () => {
    expect(patchListItemById<TestItem>(undefined, 1, { status: "new" })).toBeUndefined();
  });
});

describe("patchListItemsByIds", () => {
  it("patches multiple items by id", () => {
    const list: TestItem[] = [
      { id: 1, name: "A", status: "old" },
      { id: 2, name: "B", status: "old" },
      { id: 3, name: "C", status: "old" },
    ];
    const result = patchListItemsByIds(list, [1, 3], { status: "new" });
    expect(result).toEqual([
      { id: 1, name: "A", status: "new" },
      { id: 2, name: "B", status: "old" },
      { id: 3, name: "C", status: "new" },
    ]);
  });
});

describe("useOptimisticListMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the list cache immediately and invalidates it on settle", async () => {
    let resolveMutation: (value: { updated: boolean }) => void = () => {};
    const mutationFn = vi.fn().mockImplementation(
      () =>
        new Promise<{ updated: boolean }>((resolve) => {
          resolveMutation = resolve;
        }),
    );
    const invalidateKeys = vi.fn().mockReturnValue([["other", "key"]] as const);
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData<TestItem[]>(TEST_LIST_KEY, [
      { id: 1, name: "A", status: "old" },
      { id: 2, name: "B", status: "old" },
    ]);

    const { result } = renderHook(
      () =>
        useOptimisticListMutation<
          TestItem,
          { updated: boolean },
          Error,
          { id: number; status: string }
        >({
          mutationFn,
          queryKey: () => TEST_LIST_KEY,
          updateItem: (vars) => (item) =>
            item.id === vars.id ? { ...item, status: vars.status } : item,
          invalidateKeys,
        }),
      { wrapper },
    );

    act(() => {
      result.current.mutate({ id: 1, status: "new" });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData<TestItem[]>(TEST_LIST_KEY)).toEqual([
        { id: 1, name: "A", status: "new" },
        { id: 2, name: "B", status: "old" },
      ]),
    );

    act(() => {
      resolveMutation({ updated: true });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mutationFn).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, status: "new" }),
      expect.anything(),
    );
    expect(invalidateKeys).toHaveBeenCalledWith({ id: 1, status: "new" });
  });

  it("rolls back the list cache when the mutation fails", async () => {
    let rejectMutation: (error: Error) => void = () => {};
    const mutationFn = vi.fn().mockImplementation(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectMutation = reject;
        }),
    );
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData<TestItem[]>(TEST_LIST_KEY, [{ id: 1, name: "A", status: "old" }]);

    const { result } = renderHook(
      () =>
        useOptimisticListMutation<
          TestItem,
          { updated: boolean },
          Error,
          { id: number; status: string }
        >({
          mutationFn,
          queryKey: () => TEST_LIST_KEY,
          updateItem: (vars) => (item) =>
            item.id === vars.id ? { ...item, status: vars.status } : item,
        }),
      { wrapper },
    );

    act(() => {
      result.current.mutate({ id: 1, status: "new" });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData<TestItem[]>(TEST_LIST_KEY)).toEqual([
        { id: 1, name: "A", status: "new" },
      ]),
    );

    act(() => {
      rejectMutation(new Error("Network error"));
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<TestItem[]>(TEST_LIST_KEY)).toEqual([
      { id: 1, name: "A", status: "old" },
    ]);
  });
});

describe("useOptimisticDetailMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the detail cache immediately and rolls back on error", async () => {
    let rejectMutation: (error: Error) => void = () => {};
    const mutationFn = vi.fn().mockImplementation(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectMutation = reject;
        }),
    );
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData<TestItem>(TEST_DETAIL_KEY, { id: 1, name: "A", status: "old" });

    const { result } = renderHook(
      () =>
        useOptimisticDetailMutation<TestItem, Error, { status: string }>({
          mutationFn,
          queryKey: () => TEST_DETAIL_KEY,
          updateData: (old, vars) => (old ? { ...old, status: vars.status } : old),
        }),
      { wrapper },
    );

    act(() => {
      result.current.mutate({ status: "new" });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData<TestItem>(TEST_DETAIL_KEY)).toEqual({
        id: 1,
        name: "A",
        status: "new",
      }),
    );

    act(() => {
      rejectMutation(new Error("Server error"));
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<TestItem>(TEST_DETAIL_KEY)).toEqual({
      id: 1,
      name: "A",
      status: "old",
    });
  });

  it("invalidates target keys on success", async () => {
    let resolveMutation: (value: { updated: boolean }) => void = () => {};
    const mutationFn = vi.fn().mockImplementation(
      () =>
        new Promise<{ updated: boolean }>((resolve) => {
          resolveMutation = resolve;
        }),
    );
    const invalidateKeys = vi.fn().mockReturnValue([["list", "key"]] as const);
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData<TestItem>(TEST_DETAIL_KEY, { id: 1, name: "A", status: "old" });

    const { result } = renderHook(
      () =>
        useOptimisticDetailMutation<TestItem, Error, { status: string }>({
          mutationFn,
          queryKey: () => TEST_DETAIL_KEY,
          updateData: (old, vars) => (old ? { ...old, status: vars.status } : old),
          invalidateKeys,
        }),
      { wrapper },
    );

    act(() => {
      result.current.mutate({ status: "new" });
    });

    await waitFor(() => expect(mutationFn).toHaveBeenCalled());

    act(() => {
      resolveMutation({ updated: true });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateKeys).toHaveBeenCalledWith({ status: "new" });
  });
});
