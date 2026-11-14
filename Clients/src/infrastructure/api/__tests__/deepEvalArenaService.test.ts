import { describe, it, expect, vi } from "vitest";
import { server } from "../../../test/mocks/server";
import { http, HttpResponse } from "msw/http";

import CustomAxios from "../customAxios";
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

  it("getSetting reads the organization's Arena setting", async () => {
    const result = await deepEvalArenaService.getSetting();
    expect(result).toEqual({ enabled: true, configured: true });
  });

  it("getSetting asks without the global error toast when silent", async () => {
    const get = vi.spyOn(CustomAxios, "get");
    try {
      await deepEvalArenaService.getSetting({ silent: true });
      expect(get).toHaveBeenLastCalledWith("/deepeval/settings/arena", {
        suppressGlobalErrorToast: true,
      });
      await deepEvalArenaService.getSetting();
      expect(get).toHaveBeenLastCalledWith("/deepeval/settings/arena", undefined);
    } finally {
      get.mockRestore();
    }
  });

  it("updateSetting puts { enabled } to /deepeval/settings/arena", async () => {
    let received: unknown;
    server.use(
      http.put("/api/deepeval/settings/arena", async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ enabled: false, configured: true });
      }),
    );
    const result = await deepEvalArenaService.updateSetting(false);
    expect(received).toEqual({ enabled: false });
    expect(result).toEqual({ enabled: false, configured: true });
  });
});
