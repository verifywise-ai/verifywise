import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/project.repository", () => ({
  getAllProjects: vi.fn(),
}));

import { useProjects, projectQueryKeys } from "../useProjects";
import { getAllProjects } from "../../repository/project.repository";

const mockGetAllProjects = vi.mocked(getAllProjects);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useProjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and returns projects", async () => {
    const projects = [
      { id: 1, name: "P1" },
      { id: 2, name: "P2" },
    ];
    mockGetAllProjects.mockResolvedValue({ data: projects });

    const { result } = renderHook(() => useProjects(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(projects);
  });

  it("filters out pending/rejected projects in approvedProjects", async () => {
    const projects = [
      { id: 1, name: "Approved" },
      { id: 2, name: "Pending", has_pending_approval: true, approval_status: "pending" },
      { id: 3, name: "Rejected", approval_status: "rejected" },
    ];
    mockGetAllProjects.mockResolvedValue({ data: projects });

    const { result } = renderHook(() => useProjects(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.approvedProjects).toHaveLength(1);
    expect((result.current.approvedProjects[0] as any).name).toBe("Approved");
  });

  it("returns empty array when response has no data", async () => {
    mockGetAllProjects.mockResolvedValue({ data: null });

    const { result } = renderHook(() => useProjects(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });
});

describe("projectQueryKeys", () => {
  it("generates correct query keys", () => {
    expect(projectQueryKeys.all).toEqual(["projects"]);
    expect(projectQueryKeys.list()).toEqual(["projects", "list"]);
    expect(projectQueryKeys.detail("5")).toEqual(["projects", "detail", "5"]);
  });
});
