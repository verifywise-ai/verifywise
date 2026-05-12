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

/** Helper: a valid AI Gateway key row */
const makeGatewayRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  provider: "openai",
  key_name: "Openai Evals Key",
  masked_key: "sk-***",
  is_active: true,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  ...overrides,
});

describe("evaluationLlmApiKeysService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAllKeys", () => {
    it("fetches from /ai-gateway/keys and maps active rows", async () => {
      const rows = [makeGatewayRow()];
      mockAxios.get.mockResolvedValue({ data: { data: rows } });
      const result = await evaluationLlmApiKeysService.getAllKeys();
      expect(mockAxios.get).toHaveBeenCalledWith("/ai-gateway/keys");
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe("openai");
      expect(result[0].id).toBe(1);
    });

    it("filters out inactive rows", async () => {
      const rows = [makeGatewayRow({ is_active: false })];
      mockAxios.get.mockResolvedValue({ data: { data: rows } });
      const result = await evaluationLlmApiKeysService.getAllKeys();
      expect(result).toHaveLength(0);
    });

    it("maps gemini provider to google", async () => {
      const rows = [makeGatewayRow({ provider: "gemini" })];
      mockAxios.get.mockResolvedValue({ data: { data: rows } });
      const result = await evaluationLlmApiKeysService.getAllKeys();
      expect(result[0].provider).toBe("google");
    });

    it("throws on network error", async () => {
      mockAxios.get.mockRejectedValue(new Error("Network error"));
      await expect(evaluationLlmApiKeysService.getAllKeys()).rejects.toThrow("Network error");
    });
  });

  describe("addKey", () => {
    it("posts to /ai-gateway/keys with gateway payload", async () => {
      const row = makeGatewayRow();
      mockAxios.post.mockResolvedValue({ data: { data: row } });
      const result = await evaluationLlmApiKeysService.addKey({
        provider: "openai",
        apiKey: "sk-real-key",
      });
      expect(mockAxios.post).toHaveBeenCalledWith("/ai-gateway/keys", {
        provider: "openai",
        key_name: "Openai Evals Key",
        api_key: "sk-real-key",
      });
      expect(result.provider).toBe("openai");
      expect(result.maskedKey).toBe("sk-***");
    });

    it("maps google provider to gemini for gateway call", async () => {
      const row = makeGatewayRow({ provider: "gemini" });
      mockAxios.post.mockResolvedValue({ data: { data: row } });
      await evaluationLlmApiKeysService.addKey({ provider: "google", apiKey: "key" });
      expect(mockAxios.post).toHaveBeenCalledWith(
        "/ai-gateway/keys",
        expect.objectContaining({ provider: "gemini" }),
      );
    });
  });

  describe("deleteKey", () => {
    it("deletes by numeric ID at /ai-gateway/keys/:id", async () => {
      mockAxios.delete.mockResolvedValue({ data: { success: true } });
      await evaluationLlmApiKeysService.deleteKey("openai", 42);
      expect(mockAxios.delete).toHaveBeenCalledWith("/ai-gateway/keys/42");
    });

    it("throws when no ID is provided", async () => {
      await expect(evaluationLlmApiKeysService.deleteKey("openai")).rejects.toThrow(
        "Cannot delete key: key ID not found",
      );
    });
  });

  describe("hasKey", () => {
    it("returns true when key exists for provider", async () => {
      mockAxios.get.mockResolvedValue({ data: { data: [makeGatewayRow()] } });
      const result = await evaluationLlmApiKeysService.hasKey("openai");
      expect(result).toBe(true);
    });

    it("returns false when no key for provider", async () => {
      mockAxios.get.mockResolvedValue({ data: { data: [] } });
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
    it("returns valid:true when gateway confirms valid key", async () => {
      mockAxios.post.mockResolvedValue({
        data: { data: { valid: true, message: "OK" } },
      });
      const result = await evaluationLlmApiKeysService.verifyKey({
        provider: "openai",
        apiKey: "sk-test",
      });
      expect(result).toEqual({ valid: true, error: undefined });
    });

    it("returns error message when gateway says invalid", async () => {
      mockAxios.post.mockResolvedValue({
        data: { data: { valid: false, message: "Invalid key" } },
      });
      const result = await evaluationLlmApiKeysService.verifyKey({
        provider: "openai",
        apiKey: "bad-key",
      });
      expect(result).toEqual({ valid: false, error: "Invalid key" });
    });

    it("returns valid:true when verification request fails (fail open)", async () => {
      mockAxios.post.mockRejectedValue(new Error("Network error"));
      const result = await evaluationLlmApiKeysService.verifyKey({
        provider: "openai",
        apiKey: "sk-test",
      });
      expect(result).toEqual({ valid: true });
    });
  });
});
