import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useDashboard } from "../useDashboard";

const mockGetAllEntities = vi.fn();

vi.mock("../../repository/entity.repository", () => ({
  getAllEntities: (...args: unknown[]) => mockGetAllEntities(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return null dashboard while loading", () => {
    mockGetAllEntities.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });
    expect(result.current.dashboard).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it("should return dashboard data after successful fetch", async () => {
    const mockData = {
      projects: 5,
      trainings: 3,
      models: 2,
      reports: 1,
      task_radar: { overdue: 1, due: 2, upcoming: 3 },
      projects_list: [{ id: 1, project_title: "Test Project" }],
    };
    mockGetAllEntities.mockResolvedValue({ data: mockData });

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.dashboard).toEqual(mockData);
    expect(mockGetAllEntities).toHaveBeenCalledWith({
      routeUrl: "/dashboard",
    });
  });

  it("should provide fetchDashboard function for cache invalidation", async () => {
    mockGetAllEntities.mockResolvedValue({ data: { projects: 0 } });

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(typeof result.current.fetchDashboard).toBe("function");
  });

  it("should handle API error gracefully", async () => {
    mockGetAllEntities.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.dashboard).toBeNull();
  });
});
