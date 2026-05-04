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
  useDeleteEntity,
} from "../useBaseQueries";
import {
  getAllEntities,
  getEntityById,
  createNewUser,
  deleteEntityById,
} from "../../repository/entity.repository";

const mockGetAll = vi.mocked(getAllEntities);
const mockGetById = vi.mocked(getEntityById);
const mockCreate = vi.mocked(createNewUser);
const mockDelete = vi.mocked(deleteEntityById);

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
});
