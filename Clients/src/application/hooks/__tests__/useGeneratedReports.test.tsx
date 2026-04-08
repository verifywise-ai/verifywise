import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import useGeneratedReports from "../useGeneratedReports";
import * as entityRepository from "../../repository/entity.repository";

vi.mock("../../repository/entity.repository", () => ({
  getEntityById: vi.fn(),
}));

const mockGetEntityById = entityRepository.getEntityById as jest.Mock;

describe("useGeneratedReports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should set loading to false when projects array is empty", async () => {
    mockGetEntityById.mockResolvedValue({ data: [] });

    const { result } = renderHook(() =>
      useGeneratedReports({
        projectId: 1,
        projects: [],
        refreshKey: 0,
      })
    );

    await waitFor(() => {
      expect(result.current.loadingReports).toBe(false);
    });
    expect(result.current.generatedReports).toEqual([]);
    expect(mockGetEntityById).not.toHaveBeenCalled();
  });

  it("should fetch reports when projects array has items", async () => {
    const mockReports = [
      { id: 1, name: "Report 1", createdAt: "2024-01-01" },
      { id: 2, name: "Report 2", createdAt: "2024-01-02" },
    ];
    mockGetEntityById.mockResolvedValue({ data: mockReports });

    const { result } = renderHook(() =>
      useGeneratedReports({
        projectId: 1,
        projects: [{ id: 1, name: "Project 1" }],
        refreshKey: 0,
      })
    );

    await waitFor(() => {
      expect(result.current.loadingReports).toBe(false);
    });

    expect(result.current.generatedReports).toEqual(mockReports);
  });

  it("should handle fetch error", async () => {
    mockGetEntityById.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() =>
      useGeneratedReports({
        projectId: 1,
        projects: [{ id: 1, name: "Project 1" }],
        refreshKey: 0,
      })
    );

    await waitFor(() => {
      expect(result.current.loadingReports).toBe(false);
    });

    expect(result.current.error).toBe("Request failed: Network error");
  });

  it("should handle abort error gracefully", async () => {
    mockGetEntityById.mockRejectedValue(new DOMException("Aborted", "AbortError"));

    const { result } = renderHook(() =>
      useGeneratedReports({
        projectId: 1,
        projects: [{ id: 1, name: "Project 1" }],
        refreshKey: 0,
      })
    );

    await waitFor(() => {
      expect(result.current.loadingReports).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });
});
