import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../customAxios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import { evaluationLlmApiKeysService } from "../evaluationLlmApiKeysService";
import CustomAxios from "../customAxios";

const mockAxios = vi.mocked(CustomAxios, { deep: true });

describe("evaluationLlmApiKeysService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAllKeys", () => {
    it("fetches and returns keys data", async () => {
      const keys = [{ provider: "openai", maskedKey: "sk-***", createdAt: "", updatedAt: "" }];
      mockAxios.get.mockResolvedValue({ data: { success: true, data: keys } });
      const result = await evaluationLlmApiKeysService.getAllKeys();
      expect(mockAxios.get).toHaveBeenCalledWith("/evaluation-llm-keys");
      expect(result).toEqual(keys);
    });

    it("throws on error", async () => {
      mockAxios.get.mockRejectedValue(new Error("Network error"));
      await expect(evaluationLlmApiKeysService.getAllKeys()).rejects.toThrow("Network error");
    });
  });

  describe("addKey", () => {
    it("posts key and returns data", async () => {
      const newKey = { provider: "openai" as const, maskedKey: "sk-***", createdAt: "", updatedAt: "" };
      mockAxios.post.mockResolvedValue({ data: { success: true, data: newKey } });
      const result = await evaluationLlmApiKeysService.addKey({
        provider: "openai",
        apiKey: "sk-real-key",
      });
      expect(mockAxios.post).toHaveBeenCalledWith("/evaluation-llm-keys", {
        provider: "openai",
        apiKey: "sk-real-key",
      });
      expect(result).toEqual(newKey);
    });
  });

  describe("deleteKey", () => {
    it("deletes key by provider", async () => {
      mockAxios.delete.mockResolvedValue({ data: { success: true } });
      await evaluationLlmApiKeysService.deleteKey("anthropic");
      expect(mockAxios.delete).toHaveBeenCalledWith("/evaluation-llm-keys/anthropic");
    });
  });

  describe("hasKey", () => {
    it("returns true when key exists for provider", async () => {
      mockAxios.get.mockResolvedValue({
        data: { success: true, data: [{ provider: "openai", maskedKey: "sk-***", createdAt: "", updatedAt: "" }] },
      });
      const result = await evaluationLlmApiKeysService.hasKey("openai");
      expect(result).toBe(true);
    });

    it("returns false when key does not exist", async () => {
      mockAxios.get.mockResolvedValue({ data: { success: true, data: [] } });
      const result = await evaluationLlmApiKeysService.hasKey("anthropic");
      expect(result).toBe(false);
    });

    it("returns false on error", async () => {
      mockAxios.get.mockRejectedValue(new Error("fail"));
      const result = await evaluationLlmApiKeysService.hasKey("openai");
      expect(result).toBe(false);
    });
  });

  describe("verifyKey", () => {
    it("returns valid result", async () => {
      mockAxios.post.mockResolvedValue({
        data: { success: true, valid: true, message: "OK" },
      });
      const result = await evaluationLlmApiKeysService.verifyKey({
        provider: "openai",
        apiKey: "sk-test",
      });
      expect(result).toEqual({ valid: true, error: undefined });
    });

    it("returns error message when invalid", async () => {
      mockAxios.post.mockResolvedValue({
        data: { success: true, valid: false, message: "Invalid key" },
      });
      const result = await evaluationLlmApiKeysService.verifyKey({
        provider: "openai",
        apiKey: "bad-key",
      });
      expect(result).toEqual({ valid: false, error: "Invalid key" });
    });

    it("returns valid:true when verification request fails", async () => {
      mockAxios.post.mockRejectedValue(new Error("Network error"));
      const result = await evaluationLlmApiKeysService.verifyKey({
        provider: "openai",
        apiKey: "sk-test",
      });
      expect(result).toEqual({ valid: true });
    });
  });
});
