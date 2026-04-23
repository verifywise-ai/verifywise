import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../customAxios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import {
  evaluationLogsService,
  metricsService,
  modelValidationService,
  experimentsService,
  monitoringService,
} from "../evaluationLogsService";
import CustomAxios from "../customAxios";

const mockAxios = vi.mocked(CustomAxios, { deep: true });

describe("evaluationLogsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createLog posts log data", async () => {
    mockAxios.post.mockResolvedValue({ data: { id: "log1" } });
    const result = await evaluationLogsService.createLog({ project_id: "p1" });
    expect(mockAxios.post).toHaveBeenCalledWith("/deepeval/logs", { project_id: "p1" });
    expect(result.id).toBe("log1");
  });

  it("getLogs fetches with params and timeout", async () => {
    mockAxios.get.mockResolvedValue({ data: { logs: [] } });
    await evaluationLogsService.getLogs({ project_id: "p1", limit: 10 });
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/logs", { params: { project_id: "p1", limit: 10 }, timeout: 60000 });
  });

  it("getLog fetches by ID", async () => {
    mockAxios.get.mockResolvedValue({ data: { id: "log1" } });
    const result = await evaluationLogsService.getLog("log1");
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/logs/log1");
    expect(result.id).toBe("log1");
  });

  it("getTraceLogs fetches by trace ID", async () => {
    mockAxios.get.mockResolvedValue({ data: { logs: [] } });
    await evaluationLogsService.getTraceLogs("trace-1");
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/logs/trace/trace-1");
  });
});

describe("metricsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createMetric posts metric data", async () => {
    mockAxios.post.mockResolvedValue({ data: { id: "m1" } });
    await metricsService.createMetric({ project_id: "p1", metric_name: "accuracy" } as any);
    expect(mockAxios.post).toHaveBeenCalledWith("/deepeval/metrics", expect.any(Object));
  });

  it("getMetrics fetches with params", async () => {
    mockAxios.get.mockResolvedValue({ data: { metrics: [] } });
    await metricsService.getMetrics({ project_id: "p1" });
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/metrics", { params: { project_id: "p1" } });
  });

  it("getMetricAggregates fetches aggregates", async () => {
    mockAxios.get.mockResolvedValue({ data: { average: 0.9 } });
    await metricsService.getMetricAggregates({ project_id: "p1", metric_name: "accuracy" });
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/metrics/aggregates", { params: { project_id: "p1", metric_name: "accuracy" } });
  });
});

describe("modelValidationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validateModel posts model info", async () => {
    mockAxios.post.mockResolvedValue({ data: { valid: true, model_name: "gpt-4" } });
    const result = await modelValidationService.validateModel("gpt-4", "openai");
    expect(mockAxios.post).toHaveBeenCalledWith("/deepeval/models/validate", { model_name: "gpt-4", provider: "openai" });
    expect(result.valid).toBe(true);
  });
});

describe("experimentsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createExperiment posts experiment data", async () => {
    mockAxios.post.mockResolvedValue({ data: { id: "e1" } });
    await experimentsService.createExperiment({ project_id: "p1", name: "Test", config: {} });
    expect(mockAxios.post).toHaveBeenCalledWith("/deepeval/experiments", expect.any(Object));
  });

  it("getExperiments fetches with timeout", async () => {
    mockAxios.get.mockResolvedValue({ data: { experiments: [] } });
    await experimentsService.getExperiments({ project_id: "p1" });
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/experiments", { params: { project_id: "p1" }, timeout: 60000 });
  });

  it("getExperiment fetches by ID", async () => {
    mockAxios.get.mockResolvedValue({ data: { id: "e1" } });
    await experimentsService.getExperiment("e1");
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/experiments/e1");
  });

  it("updateExperiment patches experiment", async () => {
    mockAxios.patch.mockResolvedValue({ data: { id: "e1" } });
    await experimentsService.updateExperiment("e1", { name: "Updated" });
    expect(mockAxios.patch).toHaveBeenCalledWith("/deepeval/experiments/e1", { name: "Updated" });
  });

  it("updateExperimentStatus puts status", async () => {
    mockAxios.put.mockResolvedValue({ data: { id: "e1" } });
    await experimentsService.updateExperimentStatus("e1", { status: "completed" });
    expect(mockAxios.put).toHaveBeenCalledWith("/deepeval/experiments/e1/status", { status: "completed" });
  });

  it("deleteExperiment calls DELETE", async () => {
    mockAxios.delete.mockResolvedValue({ data: { message: "deleted" } });
    await experimentsService.deleteExperiment("e1");
    expect(mockAxios.delete).toHaveBeenCalledWith("/deepeval/experiments/e1");
  });
});

describe("monitoringService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getDashboard fetches dashboard data", async () => {
    mockAxios.get.mockResolvedValue({ data: { data: { project_id: "p1" } } });
    const result = await monitoringService.getDashboard("p1", { start_date: "2024-01-01" });
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/projects/p1/monitor/dashboard", { params: { start_date: "2024-01-01" } });
    expect(result.data.project_id).toBe("p1");
  });
});
