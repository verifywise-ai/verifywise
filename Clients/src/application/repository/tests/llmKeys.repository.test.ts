import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LLMKeysModel } from "../../../domain/models/Common/llmKeys/llmKeys.model";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  createLLMKey,
  deleteLLMKey,
  editLLMKey,
  getLLMKey,
  getLLMKeys,
  getLLMKeyStatus,
  type LLMKeyStatus,
} from "../llmKeys.repository";

vi.mock("../../../infrastructure/api/networkServices", () => {
  return {
    apiServices: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const mockLLMKey: Partial<LLMKeysModel> = {
  name: "OpenAI",
  key: "sk-test-key-123",
  model: "gpt-4",
};

const mockLLMKeyResponse = {
  id: 1,
  name: "OpenAI",
  key: "sk-test-key-123",
  model: "gpt-4",
  created_at: "2026-03-01T00:00:00Z",
};

// ─── createLLMKey ─────────────────────────────────────────────────────────────

describe("Test LLM Keys Repository", () => {
  describe("createLLMKey", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a POST request to the correct URL with the provided body", async () => {
      const mockResponse = {
        data: mockLLMKeyResponse,
        status: 201,
        statusText: "Created",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await createLLMKey({ body: mockLLMKey });

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith("/llm-keys", mockLLMKey);
    });

    it("should return the full response on successful API call", async () => {
      const mockResponse = {
        data: mockLLMKeyResponse,
        status: 201,
        statusText: "Created",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await createLLMKey({ body: mockLLMKey });

      expect(result).toEqual(mockResponse);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 422, data: { message: "Validation error" } },
      };
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(createLLMKey({ body: mockLLMKey })).rejects.toEqual(
        mockError,
      );
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.post).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(createLLMKey({ body: mockLLMKey })).rejects.toThrow(
        "Network timeout",
      );
    });
  });

  // ─── editLLMKey ─────────────────────────────────────────────────────────────

  describe("editLLMKey", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    const updateBody: Partial<LLMKeysModel> = { model: "gpt-4o" };

    it("should make a PATCH request to the correct URL with the provided body", async () => {
      const mockResponse = {
        data: { ...mockLLMKeyResponse, model: "gpt-4o" },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      await editLLMKey({ id: "1", body: updateBody });

      expect(apiServices.patch).toHaveBeenCalledTimes(1);
      expect(apiServices.patch).toHaveBeenCalledWith("/llm-keys/1", updateBody);
    });

    it("should return the full response on successful API call", async () => {
      const mockResponse = {
        data: { ...mockLLMKeyResponse, model: "gpt-4o" },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const result = await editLLMKey({ id: "1", body: updateBody });

      expect(result).toEqual(mockResponse);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 404, data: { message: "LLM key not found" } },
      };
      vi.mocked(apiServices.patch).mockRejectedValue(mockError);

      await expect(editLLMKey({ id: "99", body: updateBody })).rejects.toEqual(
        mockError,
      );
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.patch).mockRejectedValue(
        new Error("Connection refused"),
      );

      await expect(editLLMKey({ id: "1", body: updateBody })).rejects.toThrow(
        "Connection refused",
      );
    });
  });

  // ─── getLLMKeys ──────────────────────────────────────────────────────────────

  describe("getLLMKeys", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a GET request to the correct URL", async () => {
      const mockResponse = {
        data: { data: [mockLLMKeyResponse] },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getLLMKeys();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/llm-keys");
    });

    it("should return the full response on successful API call", async () => {
      const mockResponse = {
        data: { data: [mockLLMKeyResponse] },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getLLMKeys();

      expect(result).toEqual(mockResponse);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 403, data: { message: "Forbidden" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getLLMKeys()).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.get).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(getLLMKeys()).rejects.toThrow("Network timeout");
    });
  });

  // ─── getLLMKey ────────────────────────────────────────────────────────────────

  describe("getLLMKey", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a GET request to the correct URL with the name", async () => {
      const mockResponse = {
        data: { data: mockLLMKeyResponse },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getLLMKey("OpenAI");

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/llm-keys/OpenAI");
    });

    it("should return the full response on successful API call", async () => {
      const mockResponse = {
        data: { data: mockLLMKeyResponse },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getLLMKey("OpenAI");

      expect(result).toEqual(mockResponse);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 404, data: { message: "LLM key not found" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getLLMKey("UnknownProvider")).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.get).mockRejectedValue(
        new Error("Connection refused"),
      );

      await expect(getLLMKey("OpenAI")).rejects.toThrow("Connection refused");
    });
  });

  // ─── deleteLLMKey ─────────────────────────────────────────────────────────────

  describe("deleteLLMKey", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a DELETE request to the correct URL with the ID", async () => {
      const mockResponse = { data: {}, status: 200, statusText: "OK" };
      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      await deleteLLMKey("1");

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith("/llm-keys/1");
    });

    it("should return the full response on successful API call", async () => {
      const mockResponse = { data: {}, status: 200, statusText: "OK" };
      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const result = await deleteLLMKey("1");

      expect(result).toEqual(mockResponse);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 404, data: { message: "LLM key not found" } },
      };
      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(deleteLLMKey("99")).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.delete).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(deleteLLMKey("1")).rejects.toThrow("Network timeout");
    });
  });

  // ─── getLLMKeyStatus ──────────────────────────────────────────────────────────

  describe("getLLMKeyStatus", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    const mockStatus: LLMKeyStatus = {
      hasKeys: true,
      keyCount: 2,
      providers: ["OpenAI", "Anthropic"],
    };

    it("should make a GET request to the correct URL", async () => {
      const mockResponse = {
        data: { data: mockStatus },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getLLMKeyStatus();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/llm-keys/status");
    });

    it("should return only the nested data object on successful API call", async () => {
      const mockResponse = {
        data: { data: mockStatus },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getLLMKeyStatus();

      expect(result).toEqual(mockStatus);
    });

    it("should return status with no keys when none are configured", async () => {
      const noKeysStatus: LLMKeyStatus = {
        hasKeys: false,
        keyCount: 0,
        providers: [],
      };
      const mockResponse = {
        data: { data: noKeysStatus },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getLLMKeyStatus();

      expect(result.hasKeys).toBe(false);
      expect(result.keyCount).toBe(0);
      expect(result.providers).toEqual([]);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 500, data: { message: "Internal Server Error" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getLLMKeyStatus()).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.get).mockRejectedValue(
        new Error("Connection refused"),
      );

      await expect(getLLMKeyStatus()).rejects.toThrow("Connection refused");
    });
  });
});
