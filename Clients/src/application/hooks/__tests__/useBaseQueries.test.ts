import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  useGetAllEntities,
  useGetEntityById,
  useCreateEntity,
  useUpdateEntity,
  useDeleteEntity,
  useArchivedEntity,
} from "../useBaseQueries";

vi.mock("../../repository/entity.repository", () => ({
  getAllEntities: vi.fn(),
  getEntityById: vi.fn(),
  createNewUser: vi.fn(),
  updateEntityById: vi.fn(),
  deleteEntityById: vi.fn(),
  archiveIncidentById: vi.fn(),
}));

vi.mock("../../config/queryClient", () => ({
  invalidateQueries: vi.fn(),
}));

import {
  getAllEntities,
  getEntityById,
  createNewUser,
  updateEntityById,
  deleteEntityById,
  archiveIncidentById,
} from "../../repository/entity.repository";

import { invalidateQueries } from "../../config/queryClient";

type MockFn = ReturnType<typeof vi.fn>;

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe("useBaseQueries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("useGetAllEntities: fetches data with default options (enabled true, default staleTime path)", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    (getAllEntities as unknown as MockFn).mockResolvedValueOnce({ data: ["x"] });

    const { result } = renderHook(() => useGetAllEntities("/users"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getAllEntities).toHaveBeenCalledTimes(1);
    expect(getAllEntities).toHaveBeenCalledWith({ routeUrl: "/users" });
    expect(result.current.data).toEqual({ data: ["x"] });
  });

  it("useGetAllEntities: does not run query when enabled is false (covers enabled ?? true branch)", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(
      () => useGetAllEntities("/users", { enabled: false, staleTime: 123 }),
      { wrapper: createWrapper(queryClient) }
    );

    // When disabled, query should stay idle and repo must not be called
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(getAllEntities).not.toHaveBeenCalled();
  });

  it("useGetEntityById: uses routeUrl/id and fetches (covers default staleTime path)", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    (getEntityById as unknown as MockFn).mockResolvedValueOnce({ data: { id: 7 } });

    const { result } = renderHook(() => useGetEntityById("/projects", 7), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getEntityById).toHaveBeenCalledTimes(1);
    expect(getEntityById).toHaveBeenCalledWith({ routeUrl: "/projects/7" });
    expect(result.current.data).toEqual({ data: { id: 7 } });
  });

  it("useGetEntityById: enabled false prevents request (covers enabled option branch)", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(
      () => useGetEntityById("/projects", 7, { enabled: false, staleTime: 123 }),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(getEntityById).not.toHaveBeenCalled();
  });

  it("useCreateEntity: onSuccess invalidates custom keys + entities list (covers invalidateKeys branch true)", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    (createNewUser as unknown as MockFn).mockResolvedValueOnce({ ok: true });

    const invalidateKeys = [["a"], ["b", "c"]];
    const { result } = renderHook(() => useCreateEntity("/users", invalidateKeys), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({ name: "John" });

    expect(createNewUser).toHaveBeenCalledWith({ routeUrl: "/users", body: { name: "John" } });

    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith(invalidateKeys);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["entities", "/users"] });
  });

  it("useCreateEntity: onSuccess only invalidates entities list when invalidateKeys not provided", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    (createNewUser as unknown as MockFn).mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useCreateEntity("/users"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({ name: "Ana" });

    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["entities", "/users"] });
  });

  it("useUpdateEntity: onSuccess invalidates custom keys + entity + entities list", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    (updateEntityById as unknown as MockFn).mockResolvedValueOnce({ ok: true });

    const invalidateKeys = [["x"]];
    const { result } = renderHook(() => useUpdateEntity("/projects", invalidateKeys), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({ id: 9, body: { title: "New" } });

    expect(updateEntityById).toHaveBeenCalledWith({ routeUrl: "/projects/9", body: { title: "New" } });

    expect(invalidateQueries).toHaveBeenCalledWith(invalidateKeys);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["entity", "/projects", 9] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["entities", "/projects"] });
  });

  it("useDeleteEntity: onSuccess removes entity cache and invalidates list (covers removeQueries + invalidateKeys false)", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const removeSpy = vi.spyOn(queryClient, "removeQueries");
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    (deleteEntityById as unknown as MockFn).mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useDeleteEntity("/projects"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync(10);

    expect(deleteEntityById).toHaveBeenCalledWith({ routeUrl: "/projects/10" });
    expect(invalidateQueries).not.toHaveBeenCalled();

    expect(removeSpy).toHaveBeenCalledWith({ queryKey: ["entity", "/projects", 10] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["entities", "/projects"] });
  });

  it("useArchivedEntity: calls archive with body {archived:true}, removes entity cache, invalidates list and custom keys", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const removeSpy = vi.spyOn(queryClient, "removeQueries");
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    (archiveIncidentById as unknown as MockFn).mockResolvedValueOnce({ ok: true });

    const invalidateKeys = [["k1"], ["k2"]];
    const { result } = renderHook(() => useArchivedEntity("/incidents", invalidateKeys), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync(77);

    expect(archiveIncidentById).toHaveBeenCalledWith({
      routeUrl: "/incidents/77",
      body: { archived: true },
    });

    expect(invalidateQueries).toHaveBeenCalledWith(invalidateKeys);

    expect(removeSpy).toHaveBeenCalledWith({ queryKey: ["entity", "/incidents", 77] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["entities", "/incidents"] });
  });

  it("useDeleteEntity: onSuccess invalidates custom keys when invalidateKeys is provided (covers lines 85-86)", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    (deleteEntityById as unknown as MockFn).mockResolvedValueOnce({ ok: true });

    const invalidateKeys = [["custom"], ["another", "key"]];

    const { result } = renderHook(() => useDeleteEntity("/projects", invalidateKeys), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync(123);

    expect(deleteEntityById).toHaveBeenCalledWith({ routeUrl: "/projects/123" });

    // ✅ this is what covers lines 85-86
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith(invalidateKeys);
  });
});
