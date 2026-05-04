import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../customAxios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import { deepEvalArenaService } from "../deepEvalArenaService";
import CustomAxios from "../customAxios";

const mockAxios = vi.mocked(CustomAxios, { deep: true });

describe("deepEvalArenaService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createComparison posts to /deepeval/arena/compare", async () => {
    const payload = {
      name: "Test",
      contestants: [],
      metric: { name: "m", criteria: "c", evaluationParams: [] as any },
    };
    mockAxios.post.mockResolvedValue({
      data: { id: "abc", status: "pending", message: "ok", contestants: [] },
    });
    const result = await deepEvalArenaService.createComparison(payload as any);
    expect(mockAxios.post).toHaveBeenCalledWith("/deepeval/arena/compare", payload);
    expect(result.id).toBe("abc");
  });

  it("listComparisons fetches with timeout", async () => {
    mockAxios.get.mockResolvedValue({ data: { comparisons: [] } });
    const result = await deepEvalArenaService.listComparisons({ org_id: "org1" });
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/arena/comparisons", {
      params: { org_id: "org1" },
      timeout: 60000,
    });
    expect(result.comparisons).toEqual([]);
  });

  it("getComparisonStatus fetches by ID", async () => {
    mockAxios.get.mockResolvedValue({ data: { id: "x", status: "completed", contestants: [] } });
    const result = await deepEvalArenaService.getComparisonStatus("x");
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/arena/comparisons/x", { timeout: 60000 });
    expect(result.status).toBe("completed");
  });

  it("getComparisonResults fetches results", async () => {
    mockAxios.get.mockResolvedValue({
      data: { id: "y", results: { winner: "A", winCounts: {}, detailedResults: [] } },
    });
    const result = await deepEvalArenaService.getComparisonResults("y");
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/arena/comparisons/y/results", {
      timeout: 60000,
    });
    expect(result.id).toBe("y");
  });

  it("deleteComparison deletes by ID", async () => {
    mockAxios.delete.mockResolvedValue({ data: { message: "deleted", id: "z" } });
    const result = await deepEvalArenaService.deleteComparison("z");
    expect(mockAxios.delete).toHaveBeenCalledWith("/deepeval/arena/comparisons/z", {
      timeout: 60000,
    });
    expect(result.message).toBe("deleted");
  });
});
