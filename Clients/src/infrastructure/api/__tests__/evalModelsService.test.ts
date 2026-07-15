import { describe, it, expect } from "vitest";
import { server } from "../../../test/mocks/server";
import { http, HttpResponse } from "msw";

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

    it("throws on error", async () => {
      server.use(http.get("/api/deepeval/models", () => HttpResponse.error()));
      await expect(evalModelsService.listModels()).rejects.toThrow();
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

    it("throws on error", async () => {
      server.use(http.post("/api/deepeval/models", () => HttpResponse.error()));
      await expect(evalModelsService.createModel({ name: "X", provider: "y" })).rejects.toThrow();
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

    it("throws on error", async () => {
      server.use(http.put("/api/deepeval/models/:id", () => HttpResponse.error()));
      await expect(evalModelsService.updateModel("m1", { name: "X" })).rejects.toThrow();
    });
  });

  describe("deleteModel", () => {
    it("resolves on success", async () => {
      server.use(
        http.delete("/api/deepeval/models/:id", () => HttpResponse.json({ message: "deleted" })),
      );
      await expect(evalModelsService.deleteModel("m1")).resolves.toBeUndefined();
    });

    it("throws on error", async () => {
      server.use(http.delete("/api/deepeval/models/:id", () => HttpResponse.error()));
      await expect(evalModelsService.deleteModel("m1")).rejects.toThrow();
    });
  });
});
