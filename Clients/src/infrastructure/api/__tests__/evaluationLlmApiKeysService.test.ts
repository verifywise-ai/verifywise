import { describe, it, expect } from "vitest";
import { server } from "../../../test/mocks/server";
import { http, HttpResponse } from "msw";

import { evaluationLlmApiKeysService } from "../evaluationLlmApiKeysService";

describe("evaluationLlmApiKeysService", () => {
  describe("getAllKeys", () => {
    it("fetches from /ai-gateway/keys and maps active rows", async () => {
      server.use(
        http.get("/api/ai-gateway/keys", () =>
          HttpResponse.json({
            data: [
              {
                id: 1,
                provider: "openai",
                key_name: "Openai Evals Key",
                masked_key: "sk-***",
                is_active: true,
                created_at: "2024-01-01T00:00:00Z",
                updated_at: "2024-01-01T00:00:00Z",
              },
            ],
          }),
        ),
      );
      const result = await evaluationLlmApiKeysService.getAllKeys();
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe("openai");
      expect(result[0].id).toBe(1);
    });

    it("filters out inactive rows", async () => {
      server.use(
        http.get("/api/ai-gateway/keys", () =>
          HttpResponse.json({
            data: [
              {
                id: 1,
                provider: "openai",
                key_name: "Openai Evals Key",
                masked_key: "sk-***",
                is_active: false,
                created_at: "2024-01-01T00:00:00Z",
                updated_at: "2024-01-01T00:00:00Z",
              },
            ],
          }),
        ),
      );
      const result = await evaluationLlmApiKeysService.getAllKeys();
      expect(result).toHaveLength(0);
    });

    it("maps gemini provider to google", async () => {
      server.use(
        http.get("/api/ai-gateway/keys", () =>
          HttpResponse.json({
            data: [
              {
                id: 2,
                provider: "gemini",
                key_name: "Gemini Key",
                masked_key: "gm-***",
                is_active: true,
                created_at: "2024-01-01T00:00:00Z",
                updated_at: "2024-01-01T00:00:00Z",
              },
            ],
          }),
        ),
      );
      const result = await evaluationLlmApiKeysService.getAllKeys();
      expect(result[0].provider).toBe("google");
    });

    it("throws on network error", async () => {
      server.use(http.get("/api/ai-gateway/keys", () => HttpResponse.error()));
      await expect(evaluationLlmApiKeysService.getAllKeys()).rejects.toThrow();
    });
  });

  describe("addKey", () => {
    it("posts to /ai-gateway/keys with gateway payload", async () => {
      server.use(
        http.post("/api/ai-gateway/keys", async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            data: {
              id: 1,
              provider: body.provider,
              key_name: body.key_name,
              masked_key: "sk-***",
              is_active: true,
              created_at: "2024-01-01T00:00:00Z",
              updated_at: "2024-01-01T00:00:00Z",
            },
          });
        }),
      );
      const result = await evaluationLlmApiKeysService.addKey({
        provider: "openai",
        apiKey: "sk-real-key",
      });
      expect(result.provider).toBe("openai");
      expect(result.maskedKey).toBe("sk-***");
    });

    it("maps google provider to gemini for gateway call", async () => {
      server.use(
        http.post("/api/ai-gateway/keys", async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          expect(body.provider).toBe("gemini");
          return HttpResponse.json({
            data: {
              id: 2,
              provider: "gemini",
              key_name: "Gemini Evals Key",
              masked_key: "gm-***",
              is_active: true,
              created_at: "2024-01-01T00:00:00Z",
              updated_at: "2024-01-01T00:00:00Z",
            },
          });
        }),
      );
      await evaluationLlmApiKeysService.addKey({ provider: "google", apiKey: "key" });
    });
  });

  describe("deleteKey", () => {
    it("deletes by numeric ID at /ai-gateway/keys/:id", async () => {
      let deleted = false;
      server.use(
        http.delete("/api/ai-gateway/keys/:id", () => {
          deleted = true;
          return HttpResponse.json({ success: true });
        }),
      );
      await evaluationLlmApiKeysService.deleteKey("openai", 42);
      expect(deleted).toBe(true);
    });

    it("throws when no ID is provided", async () => {
      await expect(evaluationLlmApiKeysService.deleteKey("openai")).rejects.toThrow(
        "Cannot delete key: key ID not found",
      );
    });
  });

  describe("hasKey", () => {
    it("returns true when key exists for provider", async () => {
      server.use(
        http.get("/api/ai-gateway/keys", () =>
          HttpResponse.json({
            data: [
              {
                id: 1,
                provider: "openai",
                key_name: "Openai Evals Key",
                masked_key: "sk-***",
                is_active: true,
                created_at: "2024-01-01T00:00:00Z",
                updated_at: "2024-01-01T00:00:00Z",
              },
            ],
          }),
        ),
      );
      const result = await evaluationLlmApiKeysService.hasKey("openai");
      expect(result).toBe(true);
    });

    it("returns false when no key for provider", async () => {
      server.use(http.get("/api/ai-gateway/keys", () => HttpResponse.json({ data: [] })));
      const result = await evaluationLlmApiKeysService.hasKey("anthropic");
      expect(result).toBe(false);
    });

    it("returns false on error", async () => {
      server.use(http.get("/api/ai-gateway/keys", () => HttpResponse.error()));
      const result = await evaluationLlmApiKeysService.hasKey("openai");
      expect(result).toBe(false);
    });
  });

  describe("verifyKey", () => {
    it("returns valid:true when gateway confirms valid key", async () => {
      server.use(
        http.post("/api/ai-gateway/keys/verify", () =>
          HttpResponse.json({ data: { valid: true, message: "OK" } }),
        ),
      );
      const result = await evaluationLlmApiKeysService.verifyKey({
        provider: "openai",
        apiKey: "sk-test",
      });
      expect(result).toEqual({ valid: true, error: undefined });
    });

    it("returns error message when gateway says invalid", async () => {
      server.use(
        http.post("/api/ai-gateway/keys/verify", () =>
          HttpResponse.json({ data: { valid: false, message: "Invalid key" } }),
        ),
      );
      const result = await evaluationLlmApiKeysService.verifyKey({
        provider: "openai",
        apiKey: "bad-key",
      });
      expect(result).toEqual({ valid: false, error: "Invalid key" });
    });

    it("returns valid:true when verification request fails (fail open)", async () => {
      server.use(http.post("/api/ai-gateway/keys/verify", () => HttpResponse.error()));
      const result = await evaluationLlmApiKeysService.verifyKey({
        provider: "openai",
        apiKey: "sk-test",
      });
      expect(result).toEqual({ valid: true });
    });
  });
});
