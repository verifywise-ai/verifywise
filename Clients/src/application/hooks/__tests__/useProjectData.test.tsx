import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import useProjectData from "../useProjectData";
import * as projectRepository from "../../repository/project.repository";

vi.mock("../../repository/project.repository", () => ({
  getProjectById: vi.fn(),
}));

vi.mock("../useUsers", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: vi.fn(() => ({
      users: [],
      loading: false,
      error: null,
    })),
  };
});

const mockGetProjectById = projectRepository.getProjectById as unknown as ReturnType<typeof vi.fn>;

describe("useProjectData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("should return error when projectId is empty", async () => {
      const { result } = renderHook(() => useProjectData({ projectId: "" }));

      expect(result.current.project).toBeNull();
      expect(result.current.projectOwner).toBeNull();
      expect(result.current.error).toBe("No project ID provided");
      expect(result.current.isLoading).toBe(false);
      expect(result.current.projectRisks).toBeNull();
    });
  });

  describe("fetching project data", () => {
    it("should fetch project when projectId is provided", async () => {
      const mockProject = {
        id: "project-123",
        name: "Test Project",
        owner: 1,
        risks: [{ id: 1, name: "Risk 1" }],
      };
      mockGetProjectById.mockResolvedValue({ data: mockProject });

      const { result } = renderHook(() => useProjectData({ projectId: "project-123" }));

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.project).toEqual(mockProject);
      expect(result.current.projectRisks).toEqual([{ id: 1, name: "Risk 1" }]);
      expect(result.current.error).toBeNull();
    });

    it("should not fetch when projectId is empty", async () => {
      const { result } = renderHook(() => useProjectData({ projectId: "" }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe("No project ID provided");
      expect(mockGetProjectById).not.toHaveBeenCalled();
    });

    it("should handle fetch error", async () => {
      mockGetProjectById.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useProjectData({ projectId: "project-123" }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.project).toBeNull();
      expect(result.current.error).toContain("Failed to fetch project");
    });

    it("should be called with correct parameters", () => {
      mockGetProjectById.mockResolvedValue({
        data: { id: "project-123", name: "Project" },
      });

      renderHook(() => useProjectData({ projectId: "project-123" }));

      expect(mockGetProjectById).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "project-123",
          signal: expect.any(AbortSignal),
        })
      );
    });
  });

  describe("setProject", () => {
    it("should allow setting project directly", async () => {
      mockGetProjectById.mockResolvedValue({
        data: { id: "project-123", name: "Original" },
      });

      const { result } = renderHook(() => useProjectData({ projectId: "project-123" }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const newProject = { id: "project-123", name: "Updated" };
      act(() => {
        result.current.setProject(newProject);
      });

      expect(result.current.project).toEqual(newProject);
    });
  });
});
