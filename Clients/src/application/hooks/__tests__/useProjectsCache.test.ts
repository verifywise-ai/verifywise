import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/project.repository", () => ({
  getAllProjects: vi.fn(),
}));

import { useProjectsCache } from "../useProjectsCache";
import { projectQueryKeys } from "../useProjects";
import type { Project } from "../../../domain/types/Project";

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  const { result } = renderHook(() => useProjectsCache(), { wrapper });
  return { queryClient, result };
}

const project = (id: number, extra: object = {}) => ({ id, ...extra }) as unknown as Project;

describe("useProjectsCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies an updater to the loaded list and invalidates it", () => {
    const { queryClient, result } = setup();
    queryClient.setQueryData(projectQueryKeys.list(), [project(1), project(2)]);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    act(() => result.current.setProjectsCache((prev) => prev.filter((p) => p.id !== 1)));

    expect(queryClient.getQueryData(projectQueryKeys.list())).toEqual([project(2)]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectQueryKeys.list() });
    expect(queryClient.getQueryState(projectQueryKeys.list())?.isInvalidated).toBe(true);
  });

  it("takes a plain array as the next list", () => {
    const { queryClient, result } = setup();
    queryClient.setQueryData(projectQueryKeys.list(), [project(1)]);

    act(() => result.current.setProjectsCache([project(3)]));

    expect(queryClient.getQueryData(projectQueryKeys.list())).toEqual([project(3)]);
  });

  it("writes nothing while the list has not loaded, so no partial list is left", () => {
    const { queryClient, result } = setup();

    act(() => result.current.setProjectsCache((prev) => [...prev, project(9)]));
    act(() => result.current.setProjectsCache([]));

    expect(queryClient.getQueryData(projectQueryKeys.list())).toBeUndefined();
  });

  it("refetches the list, inactive or not, and resolves when it is done", async () => {
    const { queryClient, result } = setup();
    const refetch = vi.spyOn(queryClient, "refetchQueries");

    await act(() => result.current.refreshProjects());

    expect(refetch).toHaveBeenCalledWith({ queryKey: projectQueryKeys.list(), type: "all" });
  });
});
