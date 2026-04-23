import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../customAxios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { evalModelsService } from "../evalModelsService";
import CustomAxios from "../customAxios";

const mockAxios = vi.mocked(CustomAxios, { deep: true });

describe("evalModelsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listModels", () => {
    it("fetches models with orgId param", async () => {
      mockAxios.get.mockResolvedValue({ data: { models: [{ id: "m1", name: "GPT-4" }] } });
      const result = await evalModelsService.listModels("org-1");
      expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/models", { params: { org_id: "org-1" } });
      expect(result).toEqual([{ id: "m1", name: "GPT-4" }]);
    });

    it("returns empty array on error", async () => {
      mockAxios.get.mockRejectedValue(new Error("fail"));
      const result = await evalModelsService.listModels();
      expect(result).toEqual([]);
    });
  });

  describe("createModel", () => {
    it("posts model and returns it", async () => {
      mockAxios.post.mockResolvedValue({ data: { model: { id: "m1", name: "Claude" } } });
      const result = await evalModelsService.createModel({ name: "Claude", provider: "anthropic" });
      expect(mockAxios.post).toHaveBeenCalledWith("/deepeval/models", { name: "Claude", provider: "anthropic" });
      expect(result?.name).toBe("Claude");
    });

    it("returns null on error", async () => {
      mockAxios.post.mockRejectedValue(new Error("fail"));
      const result = await evalModelsService.createModel({ name: "X", provider: "y" });
      expect(result).toBeNull();
    });
  });

  describe("updateModel", () => {
    it("puts updated data", async () => {
      mockAxios.put.mockResolvedValue({ data: { model: { id: "m1", name: "Updated" } } });
      const result = await evalModelsService.updateModel("m1", { name: "Updated" });
      expect(mockAxios.put).toHaveBeenCalledWith("/deepeval/models/m1", { name: "Updated" });
      expect(result?.name).toBe("Updated");
    });

    it("returns null on error", async () => {
      mockAxios.put.mockRejectedValue(new Error("fail"));
      const result = await evalModelsService.updateModel("m1", { name: "X" });
      expect(result).toBeNull();
    });
  });

  describe("deleteModel", () => {
    it("returns true on success", async () => {
      mockAxios.delete.mockResolvedValue({ data: { message: "deleted" } });
      const result = await evalModelsService.deleteModel("m1");
      expect(mockAxios.delete).toHaveBeenCalledWith("/deepeval/models/m1");
      expect(result).toBe(true);
    });

    it("returns false on error", async () => {
      mockAxios.delete.mockRejectedValue(new Error("fail"));
      const result = await evalModelsService.deleteModel("m1");
      expect(result).toBe(false);
    });
  });
});
