import { describe, it, expect } from "vitest";
import { server } from "../../../test/mocks/server";
import { http, HttpResponse } from "msw";

import { deepEvalDatasetsService } from "../deepEvalDatasetsService";

describe("deepEvalDatasetsService", () => {
  it("list fetches datasets", async () => {
    const datasets = { chatbot: [], rag: [], agent: [] };
    server.use(http.get("/api/deepeval/datasets/list", () => HttpResponse.json({ datasets })));
    const result = await deepEvalDatasetsService.list();
    expect(result).toEqual(datasets);
  });

  it("read fetches dataset by path", async () => {
    server.use(
      http.get("/api/deepeval/datasets/read", ({ request }) => {
        const url = new URL(request.url);
        return HttpResponse.json({ path: url.searchParams.get("path"), prompts: [] });
      }),
    );
    const result = await deepEvalDatasetsService.read("test.json");
    expect(result.path).toBe("test.json");
  });

  it("listUploads fetches uploads", async () => {
    server.use(
      http.get("/api/deepeval/datasets/uploads", () =>
        HttpResponse.json({ uploads: [{ name: "f.json", path: "/p", size: 100, modifiedAt: 0 }] }),
      ),
    );
    const result = await deepEvalDatasetsService.listUploads();
    expect(result.uploads).toHaveLength(1);
  });

  it("listMy fetches user datasets", async () => {
    server.use(http.get("/api/deepeval/datasets/user", () => HttpResponse.json({ datasets: [] })));
    const result = await deepEvalDatasetsService.listMy();
    expect(result.datasets).toEqual([]);
  });

  it("deleteDatasets sends paths in request body", async () => {
    server.use(
      http.delete("/api/deepeval/datasets/user", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ message: "ok", deleted: (body.paths as string[]).length });
      }),
    );
    const result = await deepEvalDatasetsService.deleteDatasets(["a.json", "b.json"]);
    expect(result.deleted).toBe(2);
  });

  it("uploadDataset sends FormData with org_id", async () => {
    const result = await deepEvalDatasetsService.uploadDataset(
      new File(["content"], "data.json", { type: "application/json" }),
      "chatbot",
      "single-turn",
      "org-1",
    );
    expect(result.message).toBe("Uploaded");
  });
});
