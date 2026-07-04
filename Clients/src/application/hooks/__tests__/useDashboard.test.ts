import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useDashboard } from "../useDashboard";

// Mock the entity repository
vi.mock("../../repository/entity.repository", () => ({
  getAllEntities: vi.fn(),
}));

import { getAllEntities } from "../../repository/entity.repository";

const mockGetAllEntities = vi.mocked(getAllEntities);

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
    mockGetAllEntities.mockImplementation(() => new Promise(() => {})); // never resolves
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

  it("should handle API error gracefully", async () => {
    mockGetAllEntities.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Dashboard stays null on error
    expect(result.current.dashboard).toBeNull();
  });

  it("should invalidate cache and refetch when fetchDashboard is called", async () => {
    const initialData = { projects: 0 };
    const freshData = { projects: 10 };
    mockGetAllEntities.mockResolvedValue({ data: initialData });

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.dashboard).toEqual(initialData);

    // Update mock to return fresh data
    mockGetAllEntities.mockResolvedValue({ data: freshData });

    // Call fetchDashboard to invalidate cache
    await result.current.fetchDashboard();

    await waitFor(() => {
      expect(mockGetAllEntities).toHaveBeenCalledTimes(2);
    });

    // Data should now be the fresh values
    await waitFor(() => {
      expect(result.current.dashboard).toEqual(freshData);
    });
  });

  it("should handle fetchDashboard being called before initial data loads", async () => {
    // Keep the initial promise pending
    mockGetAllEntities.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: { projects: 1 } }), 100)),
    );

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    // fetchDashboard returns a promise even when called during loading
    const fetchPromise = result.current.fetchDashboard();
    expect(fetchPromise).toBeInstanceOf(Promise);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("should provide fetchDashboard as a function", () => {
    mockGetAllEntities.mockResolvedValue({ data: { projects: 0 } });

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.fetchDashboard).toBe("function");
  });
});
