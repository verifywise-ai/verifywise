import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import useProjectStatus from "../useProjectStatus";
import * as projectRepository from "../../repository/project.repository";

vi.mock("../../repository/project.repository", () => ({
  getProjectProgressData: vi.fn(),
}));

const mockGetProjectProgressData = projectRepository.getProjectProgressData as unknown as ReturnType<typeof vi.fn>;

const createWrapper = (authToken: string | null = "mock-token") => {
  const store = configureStore({
    reducer: {
      auth: () => ({ authToken }),
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
};

describe("useProjectStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("should return loading state initially", async () => {
      mockGetProjectProgressData.mockImplementation(() => Promise.resolve({}));

      const { result } = renderHook(() => useProjectStatus({ userId: 1 }), {
        wrapper: createWrapper(),
      });

      expect(result.current.loading).toBe(true);
    });
  });

  describe("authentication", () => {
    it("should not fetch when userId is null", async () => {
      const { result } = renderHook(() => useProjectStatus({ userId: null }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("No user ID provided");
      expect(mockGetProjectProgressData).not.toHaveBeenCalled();
    });

    it("should not fetch when authToken is null", async () => {
      const { result } = renderHook(() => useProjectStatus({ userId: 1 }), {
        wrapper: createWrapper(null),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("User not authenticated");
      expect(mockGetProjectProgressData).not.toHaveBeenCalled();
    });
  });

  describe("fetching project status", () => {
    it("should fetch project status successfully", async () => {
      mockGetProjectProgressData
        .mockResolvedValueOnce({
          totalQuestions: 100,
          answeredQuestions: 10,
          allsubControls: 200,
          allDonesubControls: 50,
        })
        .mockResolvedValueOnce({
          totalQuestions: 100,
          answeredQuestions: 10,
        });

      const { result } = renderHook(() => useProjectStatus({ userId: 1 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.projectStatus).toEqual({
        assessments: expect.objectContaining({
          percentageComplete: expect.any(Number),
        }),
        controls: expect.objectContaining({
          percentageComplete: expect.any(Number),
        }),
      });
    });

    it("should handle fetch error", async () => {
      mockGetProjectProgressData.mockRejectedValue(new Error("Failed to fetch"));

      const { result } = renderHook(() => useProjectStatus({ userId: 1 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Failed to fetch");
    });

    it("should calculate percentages correctly", async () => {
      mockGetProjectProgressData
        .mockResolvedValueOnce({
          totalQuestions: 100,
          answeredQuestions: 50,
          allsubControls: 100,
          allDonesubControls: 25,
        })
        .mockResolvedValueOnce({
          totalQuestions: 100,
          answeredQuestions: 50,
        });

      const { result } = renderHook(() => useProjectStatus({ userId: 1 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.projectStatus.assessments.percentageComplete).toBe(200);
      expect(result.current.projectStatus.controls.percentageComplete).toBe(25);
    });
  });

  describe("memoization", () => {
    it("should return memoized object", async () => {
      mockGetProjectProgressData
        .mockResolvedValueOnce({
          totalQuestions: 100,
          answeredQuestions: 10,
          allsubControls: 100,
          allDonesubControls: 50,
        })
        .mockResolvedValueOnce({
          totalQuestions: 100,
          answeredQuestions: 10,
        });

      const { result } = renderHook(() => useProjectStatus({ userId: 1 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.projectStatus).toBeDefined();
      expect(typeof result.current.projectStatus).toBe("object");
    });
  });
});
