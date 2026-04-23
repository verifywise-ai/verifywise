import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/taskEntityLink.repository", () => ({
  getTaskEntityLinks: vi.fn(),
  addTaskEntityLink: vi.fn(),
  removeTaskEntityLink: vi.fn(),
}));

import { useTaskEntityLinks, useAddTaskEntityLink, useRemoveTaskEntityLink } from "../useTaskEntityLinks";
import { getTaskEntityLinks, addTaskEntityLink, removeTaskEntityLink } from "../../repository/taskEntityLink.repository";

const mockGetLinks = vi.mocked(getTaskEntityLinks);
const mockAddLink = vi.mocked(addTaskEntityLink);
const mockRemoveLink = vi.mocked(removeTaskEntityLink);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useTaskEntityLinks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches links for a task", async () => {
    mockGetLinks.mockResolvedValue([{ id: 1, task_id: 5, entity_id: 10, entity_type: "project" }] as any);

    const { result } = renderHook(() => useTaskEntityLinks(5), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });

  it("does not fetch when taskId is undefined", () => {
    const { result } = renderHook(() => useTaskEntityLinks(undefined), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useAddTaskEntityLink", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adds a link", async () => {
    mockAddLink.mockResolvedValue({ id: 2 } as any);

    const { result } = renderHook(() => useAddTaskEntityLink(), { wrapper: createWrapper() });
    result.current.mutate({ taskId: 5, entityId: 10, entityType: "project" as any });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockAddLink).toHaveBeenCalledWith(5, 10, "project");
  });
});

describe("useRemoveTaskEntityLink", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes a link", async () => {
    mockRemoveLink.mockResolvedValue(undefined);

    const { result } = renderHook(() => useRemoveTaskEntityLink(), { wrapper: createWrapper() });
    result.current.mutate({ taskId: 5, linkId: 2 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockRemoveLink).toHaveBeenCalledWith(5, 2);
  });
});
