import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../../repository/fria.repository", () => ({
  friaRepository: {
    getFria: vi.fn(),
    updateFria: vi.fn(),
    updateRights: vi.fn(),
    addRiskItem: vi.fn(),
    updateRiskItem: vi.fn(),
    deleteRiskItem: vi.fn(),
    linkModel: vi.fn(),
    unlinkModel: vi.fn(),
    submitFria: vi.fn(),
  },
}));

import { useFria } from "../useFria";
import { friaRepository } from "../../repository/fria.repository";

const mockGetFria = vi.mocked(friaRepository.getFria);

describe("useFria", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches FRIA data on mount", async () => {
    mockGetFria.mockResolvedValue({
      assessment: { id: 1, project_id: 5, status: "draft" },
      rights: [{ id: 1, right_key: "dignity", flagged: true }],
      riskItems: [],
      modelLinks: [],
    });

    vi.useRealTimers();
    const { result } = renderHook(() => useFria("5"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.assessment?.id).toBe(1);
    expect(result.current.rights).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("handles error on fetch", async () => {
    mockGetFria.mockRejectedValue(new Error("Not found"));

    vi.useRealTimers();
    const { result } = renderHook(() => useFria("99"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("Not found");
  });

  it("does not fetch when projectId is empty", async () => {
    vi.useRealTimers();
    renderHook(() => useFria(""));

    expect(mockGetFria).not.toHaveBeenCalled();
  });
});
