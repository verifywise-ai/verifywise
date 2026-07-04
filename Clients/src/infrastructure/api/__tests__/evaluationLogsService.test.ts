import { describe, it, expect } from "vitest";
import { server } from "../../../test/mocks/server";
import { http, HttpResponse } from "msw";

import {
  evaluationLogsService,
  metricsService,
  modelValidationService,
  experimentsService,
  monitoringService,
} from "../evaluationLogsService";

describe("evaluationLogsService", () => {
  it("createLog posts log data", async () => {
    server.use(
      http.post("/api/deepeval/logs", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "log1", project_id: body.project_id });
      }),
    );
    const result = await evaluationLogsService.createLog({ project_id: "p1" });
    expect(result.id).toBe("log1");
  });

  it("getLogs fetches with params and timeout", async () => {
    server.use(http.get("/api/deepeval/logs", () => HttpResponse.json({ logs: [] })));
    const result = await evaluationLogsService.getLogs({ project_id: "p1", limit: 10 });
    expect(result.logs).toEqual([]);
  });

  it("getLog fetches by ID", async () => {
    const result = await evaluationLogsService.getLog("log1");
    expect(result.id).toBe("log1");
  });

  it("getTraceLogs fetches by trace ID", async () => {
    const result = await evaluationLogsService.getTraceLogs("trace-1");
    expect(result.logs).toHaveLength(1);
  });
});

describe("metricsService", () => {
  it("createMetric posts metric data", async () => {
    server.use(http.post("/api/deepeval/metrics", () => HttpResponse.json({ id: "m1" })));
    const result = await metricsService.createMetric({
      project_id: "p1",
      metric_name: "accuracy",
    } as any);
    expect(result.id).toBe("m1");
  });

  it("getMetrics fetches with params", async () => {
    const result = await metricsService.getMetrics({ project_id: "p1" });
    expect(result.metrics).toHaveLength(1);
  });

  it("getMetricAggregates fetches aggregates", async () => {
    const result = await metricsService.getMetricAggregates({
      project_id: "p1",
      metric_name: "accuracy",
    });
    expect(result.average).toBe(0.85);
  });
});

describe("modelValidationService", () => {
  it("validateModel posts model info", async () => {
    const result = await modelValidationService.validateModel("gpt-4", "openai");
    expect(result.valid).toBe(true);
  });
});

describe("experimentsService", () => {
  it("createExperiment posts experiment data", async () => {
    server.use(http.post("/api/deepeval/experiments", () => HttpResponse.json({ id: "e1" })));
    const result = await experimentsService.createExperiment({
      project_id: "p1",
      name: "Test",
      config: {},
    });
    expect(result.id).toBe("e1");
  });

  it("getExperiments fetches with timeout", async () => {
    const result = await experimentsService.getExperiments({ project_id: "p1" });
    expect(result.experiments).toHaveLength(1);
  });

  it("getExperiment fetches by ID", async () => {
    const result = await experimentsService.getExperiment("e1");
    expect(result.id).toBe("e1");
  });

  it("updateExperiment patches experiment", async () => {
    server.use(http.patch("/api/deepeval/experiments/:id", () => HttpResponse.json({ id: "e1" })));
    const result = await experimentsService.updateExperiment("e1", { name: "Updated" });
    expect(result.id).toBe("e1");
  });

  it("updateExperimentStatus puts status", async () => {
    server.use(
      http.put("/api/deepeval/experiments/:id/status", () => HttpResponse.json({ id: "e1" })),
    );
    const result = await experimentsService.updateExperimentStatus("e1", { status: "completed" });
    expect(result.id).toBe("e1");
  });

  it("deleteExperiment calls DELETE", async () => {
    server.use(
      http.delete("/api/deepeval/experiments/:id", () => HttpResponse.json({ message: "deleted" })),
    );
    const result = await experimentsService.deleteExperiment("e1");
    expect(result.message).toBe("deleted");
  });
});

describe("monitoringService", () => {
  it("getDashboard fetches dashboard data", async () => {
    const result = await monitoringService.getDashboard("p1", { start_date: "2024-01-01" });
    expect(result.data.project_id).toBe("p1");
  });
});
