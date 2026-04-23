import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../../repository/entity.repository", () => ({
  getEntityById: vi.fn(),
}));

import useGeneratedReports from "../useGeneratedReports";
import { getEntityById } from "../../repository/entity.repository";

const mockGetEntity = vi.mocked(getEntityById);

describe("useGeneratedReports", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches generated reports", async () => {
    mockGetEntity.mockResolvedValue({ data: [{ id: 1, name: "Q1 Report" }] });

    const { result } = renderHook(() =>
      useGeneratedReports({ projectId: "1", projects: [{ id: 1 }] as any, refreshKey: 0 })
    );

    await waitFor(() => expect(result.current.loadingReports).toBe(false));
    expect(result.current.generatedReports).toHaveLength(1);
    expect(result.current.error).toBe(false);
  });

  it("does not fetch when projects is empty", async () => {
    const { result } = renderHook(() =>
      useGeneratedReports({ projectId: "1", projects: [], refreshKey: 0 })
    );

    await waitFor(() => expect(result.current.loadingReports).toBe(false));
    expect(mockGetEntity).not.toHaveBeenCalled();
  });

  it("handles error", async () => {
    mockGetEntity.mockRejectedValue(new Error("Server error"));

    const { result } = renderHook(() =>
      useGeneratedReports({ projectId: "1", projects: [{ id: 1 }] as any, refreshKey: 0 })
    );

    await waitFor(() => expect(result.current.loadingReports).toBe(false));
    expect(result.current.error).toContain("Request failed");
  });
});
