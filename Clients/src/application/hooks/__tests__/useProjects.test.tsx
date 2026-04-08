import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useProjects, projectQueryKeys } from "../useProjects";
import * as projectRepository from "../../repository/project.repository";

const mockGetAllProjects = projectRepository.getAllProjects as jest.Mock;

vi.mock("../../repository/project.repository", () => ({
  getAllProjects: vi.fn(),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useProjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should start with loading true and no data", async () => {
      mockGetAllProjects.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useProjects(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });
  });

  describe("successful fetch", () => {
    it("should return all projects on successful fetch", async () => {
      const mockProjects = [
        { id: 1, name: "Project A", has_pending_approval: false },
        { id: 2, name: "Project B", has_pending_approval: false },
      ];

      mockGetAllProjects.mockResolvedValue({ data: mockProjects });

      const { result } = renderHook(() => useProjects(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockProjects);
      expect(result.current.error).toBeNull();
    });

    it("should filter out pending approval projects", async () => {
      const mockProjects = [
        { id: 1, name: "Project A", has_pending_approval: false, approval_status: "approved" },
        { id: 2, name: "Project B", has_pending_approval: true, approval_status: "pending" },
        { id: 3, name: "Project C", has_pending_approval: false, approval_status: "rejected" },
        { id: 4, name: "Project D", has_pending_approval: false, approval_status: "approved" },
      ];

      mockGetAllProjects.mockResolvedValue({ data: mockProjects });

      const { result } = renderHook(() => useProjects(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.approvedProjects).toHaveLength(2);
      expect(result.current.approvedProjects.map((p) => p.name)).toEqual([
        "Project A",
        "Project D",
      ]);
    });

    it("should return empty approvedProjects when no data", async () => {
      mockGetAllProjects.mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useProjects(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.approvedProjects).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("should set error on fetch failure", async () => {
      mockGetAllProjects.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useProjects(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
    });

    it("should handle empty response", async () => {
      mockGetAllProjects.mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useProjects(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
      expect(result.current.approvedProjects).toEqual([]);
    });
  });

  describe("queryKeys", () => {
    it("should have correct query key structure", () => {
      expect(projectQueryKeys.all).toEqual(["projects"]);
      expect(projectQueryKeys.lists()).toEqual(["projects", "list"]);
      expect(projectQueryKeys.list()).toEqual(["projects", "list"]);
      expect(projectQueryKeys.details()).toEqual(["projects", "detail"]);
      expect(projectQueryKeys.detail("1")).toEqual(["projects", "detail", "1"]);
    });
  });
});
