import { describe, it, expect } from "vitest";
import { server } from "../../../test/mocks/server";
import { http, HttpResponse } from "msw";

import {
  getConfigByProjectId,
  createConfig,
  updateConfig,
  deleteConfig,
  getQuestions,
  getOrgQuestions,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  getActiveCycle,
  getCycleById,
  getResponses,
  saveResponses,
  submitCycle,
  flagConcern,
  getReports,
  reassignStakeholder,
  startNewCycle,
} from "../postMarketMonitoringService";

describe("postMarketMonitoringService", () => {
  // Configuration
  it("getConfigByProjectId fetches config", async () => {
    const result = await getConfigByProjectId(1);
    expect(result.id).toBe("1");
  });

  it("createConfig posts config data", async () => {
    server.use(
      http.post("/api/pmm/config", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: { id: 2, ...body } }, { status: 201 });
      }),
    );
    const result = await createConfig({ project_id: 1 } as any);
    expect(result.id).toBe(2);
  });

  it("updateConfig puts config data", async () => {
    server.use(
      http.put("/api/pmm/config/:id", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: { id: 1, ...body } });
      }),
    );
    await updateConfig(1, { frequency: "monthly" } as any);
  });

  it("deleteConfig calls DELETE", async () => {
    await deleteConfig(1);
  });

  // Questions
  it("getQuestions fetches by config ID", async () => {
    const result = await getQuestions(5);
    expect(result).toHaveLength(1);
  });

  it("getOrgQuestions fetches org questions", async () => {
    const result = await getOrgQuestions();
    expect(result).toHaveLength(1);
  });

  it("addQuestion posts question", async () => {
    server.use(
      http.post("/api/pmm/config/:id/questions", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: { id: 10, ...body } }, { status: 201 });
      }),
    );
    await addQuestion(1, { question_text: "test" } as any);
  });

  it("updateQuestion puts question data", async () => {
    server.use(
      http.put("/api/pmm/questions/:id", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: { id: 10, ...body } });
      }),
    );
    await updateQuestion(10, { question_text: "updated" } as any);
  });

  it("deleteQuestion calls DELETE", async () => {
    await deleteQuestion(10);
  });

  it("reorderQuestions posts orders", async () => {
    await reorderQuestions([{ id: 1, display_order: 0 }]);
  });

  // Cycles
  it("getActiveCycle fetches active cycle", async () => {
    const result = await getActiveCycle(1);
    expect(result?.id).toBe("1");
  });

  it("getActiveCycle returns null on 404", async () => {
    server.use(
      http.get("/api/pmm/active-cycle/:id", () => new HttpResponse(null, { status: 404 })),
    );
    const result = await getActiveCycle(1);
    expect(result).toBeNull();
  });

  it("getCycleById fetches cycle", async () => {
    const result = await getCycleById(5);
    expect(result.id).toBe("5");
  });

  it("getResponses fetches cycle responses", async () => {
    const result = await getResponses(5);
    expect(result).toHaveLength(1);
  });

  it("saveResponses posts responses", async () => {
    await saveResponses(5, [{ question_id: 1, response_value: "yes" }] as any);
  });

  it("submitCycle posts submission", async () => {
    const result = await submitCycle(5, {} as any);
    expect(result.report_generated).toBe(true);
  });

  it("flagConcern posts flag data", async () => {
    await flagConcern(5, 1, true);
  });

  // Reports
  it("getReports fetches with filter params", async () => {
    const result = await getReports({ project_id: 1, flagged_only: true });
    expect(result.reports).toHaveLength(1);
  });

  // Admin
  it("reassignStakeholder posts reassignment", async () => {
    await reassignStakeholder(5, 10);
  });

  it("startNewCycle posts to start cycle", async () => {
    const result = await startNewCycle(1);
    expect(result.id).toBe(1);
  });
});
