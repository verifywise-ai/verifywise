import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

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
  useGetAllEntities,
  useGetEntityById,
  useCreateEntity,
  useUpdateEntity,
  useDeleteEntity,
  useArchivedEntity,
} from "../useBaseQueries";
import {
  getAllEntities,
  getEntityById,
  createNewUser,
  updateEntityById,
  deleteEntityById,
  archiveIncidentById,
} from "../../repository/entity.repository";
import { invalidateQueries } from "../../config/queryClient";

const mockGetAll = vi.mocked(getAllEntities);
const mockGetById = vi.mocked(getEntityById);
const mockCreate = vi.mocked(createNewUser);
const mockUpdate = vi.mocked(updateEntityById);
const mockDelete = vi.mocked(deleteEntityById);
const mockArchive = vi.mocked(archiveIncidentById);
const mockInvalidateKeys = vi.mocked(invalidateQueries);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useGetAllEntities", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches all entities", async () => {
    mockGetAll.mockResolvedValue({ data: [{ id: 1 }, { id: 2 }] });

    const { result } = renderHook(() => useGetAllEntities("/users"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetAll).toHaveBeenCalledWith({ routeUrl: "/users" });
  });

  it("respects enabled option", () => {
    renderHook(() => useGetAllEntities("/users", { enabled: false }), {
      wrapper: createWrapper(),
    });

    expect(mockGetAll).not.toHaveBeenCalled();
  });

  it("respects custom staleTime", async () => {
    mockGetAll.mockResolvedValue({ data: [] });

    const { result } = renderHook(() => useGetAllEntities("/users", { staleTime: 0 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useGetEntityById", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches entity by ID", async () => {
    mockGetById.mockResolvedValue({ data: { id: 5, name: "Test" } });

    const { result } = renderHook(() => useGetEntityById("/users", 5), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetById).toHaveBeenCalledWith({ routeUrl: "/users/5" });
  });

  it("respects enabled option", () => {
    renderHook(() => useGetEntityById("/users", 5, { enabled: false }), {
      wrapper: createWrapper(),
    });

    expect(mockGetById).not.toHaveBeenCalled();
  });
});

describe("useCreateEntity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates entity", async () => {
    mockCreate.mockResolvedValue({ data: { id: 3 } });

    const { result } = renderHook(() => useCreateEntity("/users"), { wrapper: createWrapper() });
    result.current.mutate({ name: "New User" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCreate).toHaveBeenCalledWith({ routeUrl: "/users", body: { name: "New User" } });
  });

  it("calls invalidateQueries when invalidateKeys provided", async () => {
    mockCreate.mockResolvedValue({ data: { id: 4 } });

    const { result } = renderHook(() => useCreateEntity("/users", [["related", "key"]]), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ name: "Test" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInvalidateKeys).toHaveBeenCalledWith([["related", "key"]]);
  });
});

describe("useUpdateEntity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates entity", async () => {
    mockUpdate.mockResolvedValue({ data: { id: 5 } });

    const { result } = renderHook(() => useUpdateEntity("/users"), { wrapper: createWrapper() });
    result.current.mutate({ id: 5, body: { name: "Updated" } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpdate).toHaveBeenCalledWith({ routeUrl: "/users/5", body: { name: "Updated" } });
  });

  it("calls invalidateQueries when invalidateKeys provided", async () => {
    mockUpdate.mockResolvedValue({ data: { id: 5 } });

    const { result } = renderHook(() => useUpdateEntity("/users", [["related", "key"]]), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ id: 5, body: { name: "Test" } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInvalidateKeys).toHaveBeenCalledWith([["related", "key"]]);
  });
});

describe("useDeleteEntity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes entity", async () => {
    mockDelete.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useDeleteEntity("/users"), { wrapper: createWrapper() });
    result.current.mutate(5);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDelete).toHaveBeenCalledWith({ routeUrl: "/users/5" });
  });

  it("calls invalidateQueries when invalidateKeys provided", async () => {
    mockDelete.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useDeleteEntity("/users", [["related", "key"]]), {
      wrapper: createWrapper(),
    });
    result.current.mutate(5);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInvalidateKeys).toHaveBeenCalledWith([["related", "key"]]);
  });
});

describe("useArchivedEntity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("archives entity", async () => {
    mockArchive.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useArchivedEntity("/incidents"), {
      wrapper: createWrapper(),
    });
    result.current.mutate(3);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockArchive).toHaveBeenCalledWith({
      routeUrl: "/incidents/3",
      body: { archived: true },
    });
  });

  it("calls invalidateQueries when invalidateKeys provided", async () => {
    mockArchive.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useArchivedEntity("/incidents", [["related", "key"]]), {
      wrapper: createWrapper(),
    });
    result.current.mutate(3);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInvalidateKeys).toHaveBeenCalledWith([["related", "key"]]);
  });
});
