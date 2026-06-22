import { describe, it, expect } from "vitest";
import { server } from "../../../test/mocks/server";
import { http, HttpResponse } from "msw";

import { deepEvalArenaService } from "../deepEvalArenaService";

describe("deepEvalArenaService", () => {
  it("createComparison posts to /deepeval/arena/compare", async () => {
    const payload = {
      name: "Test",
      contestants: [],
      metric: { name: "m", criteria: "c", evaluationParams: [] as any },
    };
    server.use(
      http.post("/api/deepeval/arena/compare", () =>
        HttpResponse.json({ id: "abc", status: "pending", message: "ok", contestants: [] }),
      ),
    );
    const result = await deepEvalArenaService.createComparison(payload as any);
    expect(result.id).toBe("abc");
  });

  it("listComparisons fetches with timeout", async () => {
    const result = await deepEvalArenaService.listComparisons({ org_id: "org1" });
    expect(result.comparisons).toEqual([{ id: 1, status: "completed" }]);
  });

  it("getComparisonStatus fetches by ID", async () => {
    const result = await deepEvalArenaService.getComparisonStatus("x");
    expect(result.status).toBe("completed");
  });

  it("getComparisonResults fetches results", async () => {
    const result = await deepEvalArenaService.getComparisonResults("y");
    expect(result.id).toBe("y");
  });

  it("deleteComparison deletes by ID", async () => {
    server.use(
      http.delete("/api/deepeval/arena/comparisons/:id", () =>
        HttpResponse.json({ message: "deleted", id: "z" }),
      ),
    );
    const result = await deepEvalArenaService.deleteComparison("z");
    expect(result.message).toBe("deleted");
  });
});
