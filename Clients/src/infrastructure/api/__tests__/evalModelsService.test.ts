import { describe, it, expect } from "vitest";
import { server } from "../../../test/mocks/server";
import { http, HttpResponse } from "msw/http";

import { evalModelsService } from "../evalModelsService";

describe("evalModelsService", () => {
  describe("listModels", () => {
    it("fetches models with orgId param", async () => {
      server.use(
        http.get("/api/deepeval/models", () =>
          HttpResponse.json({
            models: [{ id: "m1", name: "GPT-4", provider: "openai" }],
          }),
        ),
      );
      const result = await evalModelsService.listModels("org-1");
      expect(result).toEqual([{ id: "m1", name: "GPT-4", provider: "openai" }]);
    });

    it("returns empty array on error", async () => {
      server.use(http.get("/api/deepeval/models", () => HttpResponse.error()));
      const result = await evalModelsService.listModels();
      expect(result).toEqual([]);
    });
  });

  describe("createModel", () => {
    it("posts model and returns it", async () => {
      server.use(
        http.post("/api/deepeval/models", async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            model: { id: "m1", name: body.name, provider: body.provider },
          });
        }),
      );
      const result = await evalModelsService.createModel({ name: "Claude", provider: "anthropic" });
      expect(result?.name).toBe("Claude");
    });

    it("returns null on error", async () => {
      server.use(http.post("/api/deepeval/models", () => HttpResponse.error()));
      const result = await evalModelsService.createModel({ name: "X", provider: "y" });
      expect(result).toBeNull();
    });
  });

  describe("updateModel", () => {
    it("puts updated data", async () => {
      server.use(
        http.put("/api/deepeval/models/:id", async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            model: { id: "m1", name: body.name },
          });
        }),
      );
      const result = await evalModelsService.updateModel("m1", { name: "Updated" });
      expect(result?.name).toBe("Updated");
    });

    it("returns null on error", async () => {
      server.use(http.put("/api/deepeval/models/:id", () => HttpResponse.error()));
      const result = await evalModelsService.updateModel("m1", { name: "X" });
      expect(result).toBeNull();
    });
  });

  describe("deleteModel", () => {
    it("returns true on success", async () => {
      server.use(
        http.delete("/api/deepeval/models/:id", () => HttpResponse.json({ message: "deleted" })),
      );
      const result = await evalModelsService.deleteModel("m1");
      expect(result).toBe(true);
    });

    it("returns false on error", async () => {
      server.use(http.delete("/api/deepeval/models/:id", () => HttpResponse.error()));
      const result = await evalModelsService.deleteModel("m1");
      expect(result).toBe(false);
    });
  });

  describe("getGatewayModelsForProvider", () => {
    it("returns the provider's current chat models with prices, context and retirement date", async () => {
      server.use(
        http.get("/api/ai-gateway/models/catalog", () =>
          HttpResponse.json({
            data: {
              models: [
                {
                  id: "gemini/gemini-3.8-flash",
                  provider: "gemini",
                  mode: "chat",
                  max_input_tokens: 1048576,
                  input_cost_per_million: 0.75,
                  output_cost_per_million: 3.75,
                  deprecation_date: "2999-01-01",
                },
                {
                  id: "gemini/gemini-old",
                  provider: "gemini",
                  mode: "chat",
                  deprecation_date: "2001-01-01",
                },
                { id: "gemini/text-embedding", provider: "gemini", mode: "embedding" },
                {
                  id: "gemini/unpriced",
                  provider: "gemini",
                  mode: "chat",
                  input_cost_per_million: 0,
                  output_cost_per_million: 0,
                },
                { id: "gpt-4o", provider: "openai", mode: "chat" },
              ],
            },
          }),
        ),
      );

      const result = await evalModelsService.getGatewayModelsForProvider("google");

      expect(result).toEqual([
        {
          id: "gemini-3.8-flash",
          name: "gemini-3.8-flash",
          inputCost: 0.75,
          outputCost: 3.75,
          contextWindow: 1048576,
          deprecationDate: "2999-01-01",
        },
        {
          id: "unpriced",
          name: "unpriced",
          inputCost: undefined,
          outputCost: undefined,
          contextWindow: undefined,
          deprecationDate: undefined,
        },
      ]);
    });

    it("returns nothing for a provider without a catalog", async () => {
      expect(await evalModelsService.getGatewayModelsForProvider("ollama")).toEqual([]);
    });
  });
});
