import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../customAxios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../deepEvalOrgsService", () => ({
  deepEvalOrgsService: {
    getCurrentOrg: vi.fn().mockResolvedValue({ org: { id: "org-1" } }),
    getAllOrgs: vi.fn().mockResolvedValue({ orgs: [{ id: "org-1" }] }),
    setCurrentOrg: vi.fn(),
  },
}));

import { deepEvalScorersService } from "../deepEvalScorersService";
import CustomAxios from "../customAxios";

const mockAxios = vi.mocked(CustomAxios, { deep: true });

describe("deepEvalScorersService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("list fetches scorers with params", async () => {
    mockAxios.get.mockResolvedValue({ data: { scorers: [{ id: "s1" }] } });
    const result = await deepEvalScorersService.list({ org_id: "org-1" });
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/scorers", {
      params: { org_id: "org-1" },
    });
    expect(result.scorers).toHaveLength(1);
  });

  it("create posts scorer with orgId", async () => {
    mockAxios.post.mockResolvedValue({ data: { id: "s1", name: "Test", metricKey: "m1" } });
    const result = await deepEvalScorersService.create({
      name: "Test",
      metricKey: "m1",
      orgId: "org-1",
    });
    expect(mockAxios.post).toHaveBeenCalledWith(
      "/deepeval/scorers",
      expect.objectContaining({ name: "Test", orgId: "org-1" }),
    );
    expect(result.id).toBe("s1");
  });

  it("update puts scorer data", async () => {
    mockAxios.put.mockResolvedValue({ data: { id: "s1", name: "Updated" } });
    const result = await deepEvalScorersService.update("s1", { name: "Updated" });
    expect(mockAxios.put).toHaveBeenCalledWith("/deepeval/scorers/s1", { name: "Updated" });
    expect(result.name).toBe("Updated");
  });

  it("delete removes scorer", async () => {
    mockAxios.delete.mockResolvedValue({ data: { message: "deleted", id: "s1" } });
    const result = await deepEvalScorersService.delete("s1");
    expect(mockAxios.delete).toHaveBeenCalledWith("/deepeval/scorers/s1");
    expect(result.message).toBe("deleted");
  });

  it("test sends test payload", async () => {
    mockAxios.post.mockResolvedValue({ data: { scorerId: "s1", score: 0.9, passed: true } });
    const result = await deepEvalScorersService.test("s1", { input: "hi", output: "hello" });
    expect(mockAxios.post).toHaveBeenCalledWith("/deepeval/scorers/s1/test", {
      input: "hi",
      output: "hello",
    });
    expect(result.passed).toBe(true);
  });
});
