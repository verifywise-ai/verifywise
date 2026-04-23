import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../customAxios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

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
import CustomAxios from "../customAxios";

const mockAxios = vi.mocked(CustomAxios, { deep: true });

describe("postMarketMonitoringService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Configuration
  it("getConfigByProjectId fetches config", async () => {
    mockAxios.get.mockResolvedValue({ data: { data: { id: 1 } } });
    const result = await getConfigByProjectId(1);
    expect(mockAxios.get).toHaveBeenCalledWith("/pmm/config/1");
    expect(result.id).toBe(1);
  });

  it("createConfig posts config data", async () => {
    mockAxios.post.mockResolvedValue({ data: { data: { id: 2 } } });
    const result = await createConfig({ project_id: 1 } as any);
    expect(mockAxios.post).toHaveBeenCalledWith("/pmm/config", { project_id: 1 });
    expect(result.id).toBe(2);
  });

  it("updateConfig puts config data", async () => {
    mockAxios.put.mockResolvedValue({ data: { data: { id: 1 } } });
    await updateConfig(1, { frequency: "monthly" } as any);
    expect(mockAxios.put).toHaveBeenCalledWith("/pmm/config/1", { frequency: "monthly" });
  });

  it("deleteConfig calls DELETE", async () => {
    mockAxios.delete.mockResolvedValue({});
    await deleteConfig(1);
    expect(mockAxios.delete).toHaveBeenCalledWith("/pmm/config/1");
  });

  // Questions
  it("getQuestions fetches by config ID", async () => {
    mockAxios.get.mockResolvedValue({ data: { data: [{ id: 1 }] } });
    const result = await getQuestions(5);
    expect(mockAxios.get).toHaveBeenCalledWith("/pmm/config/5/questions");
    expect(result).toHaveLength(1);
  });

  it("getOrgQuestions fetches org questions", async () => {
    mockAxios.get.mockResolvedValue({ data: { data: [] } });
    await getOrgQuestions();
    expect(mockAxios.get).toHaveBeenCalledWith("/pmm/org/questions");
  });

  it("addQuestion posts question", async () => {
    mockAxios.post.mockResolvedValue({ data: { data: { id: 10 } } });
    await addQuestion(1, { question_text: "test" } as any);
    expect(mockAxios.post).toHaveBeenCalledWith("/pmm/config/1/questions", { question_text: "test" });
  });

  it("updateQuestion puts question data", async () => {
    mockAxios.put.mockResolvedValue({ data: { data: { id: 10 } } });
    await updateQuestion(10, { question_text: "updated" } as any);
    expect(mockAxios.put).toHaveBeenCalledWith("/pmm/questions/10", { question_text: "updated" });
  });

  it("deleteQuestion calls DELETE", async () => {
    mockAxios.delete.mockResolvedValue({});
    await deleteQuestion(10);
    expect(mockAxios.delete).toHaveBeenCalledWith("/pmm/questions/10");
  });

  it("reorderQuestions posts orders", async () => {
    mockAxios.post.mockResolvedValue({});
    await reorderQuestions([{ id: 1, display_order: 0 }]);
    expect(mockAxios.post).toHaveBeenCalledWith("/pmm/questions/reorder", { orders: [{ id: 1, display_order: 0 }] });
  });

  // Cycles
  it("getActiveCycle fetches active cycle", async () => {
    mockAxios.get.mockResolvedValue({ data: { data: { id: 1 } } });
    const result = await getActiveCycle(1);
    expect(mockAxios.get).toHaveBeenCalledWith("/pmm/active-cycle/1");
    expect(result?.id).toBe(1);
  });

  it("getActiveCycle returns null on 404", async () => {
    mockAxios.get.mockRejectedValue({ response: { status: 404 } });
    const result = await getActiveCycle(1);
    expect(result).toBeNull();
  });

  it("getCycleById fetches cycle", async () => {
    mockAxios.get.mockResolvedValue({ data: { data: { id: 5 } } });
    const result = await getCycleById(5);
    expect(mockAxios.get).toHaveBeenCalledWith("/pmm/cycles/5");
    expect(result.id).toBe(5);
  });

  it("getResponses fetches cycle responses", async () => {
    mockAxios.get.mockResolvedValue({ data: { data: [] } });
    await getResponses(5);
    expect(mockAxios.get).toHaveBeenCalledWith("/pmm/cycles/5/responses");
  });

  it("saveResponses posts responses", async () => {
    mockAxios.post.mockResolvedValue({});
    await saveResponses(5, [{ question_id: 1, response_value: "yes" }] as any);
    expect(mockAxios.post).toHaveBeenCalledWith("/pmm/cycles/5/responses", { responses: [{ question_id: 1, response_value: "yes" }] });
  });

  it("submitCycle posts submission", async () => {
    mockAxios.post.mockResolvedValue({ data: { data: { message: "ok", report_generated: true } } });
    const result = await submitCycle(5, {} as any);
    expect(mockAxios.post).toHaveBeenCalledWith("/pmm/cycles/5/submit", {});
    expect(result.report_generated).toBe(true);
  });

  it("flagConcern posts flag data", async () => {
    mockAxios.post.mockResolvedValue({});
    await flagConcern(5, 1, true);
    expect(mockAxios.post).toHaveBeenCalledWith("/pmm/cycles/5/flag", { question_id: 1, response_value: true });
  });

  // Reports
  it("getReports fetches with filter params", async () => {
    mockAxios.get.mockResolvedValue({ data: { data: { reports: [] } } });
    await getReports({ project_id: 1, flagged_only: true });
    expect(mockAxios.get).toHaveBeenCalledWith(expect.stringContaining("/pmm/reports?"));
    expect(mockAxios.get).toHaveBeenCalledWith(expect.stringContaining("project_id=1"));
    expect(mockAxios.get).toHaveBeenCalledWith(expect.stringContaining("flagged_only=true"));
  });

  // Admin
  it("reassignStakeholder posts reassignment", async () => {
    mockAxios.post.mockResolvedValue({});
    await reassignStakeholder(5, 10);
    expect(mockAxios.post).toHaveBeenCalledWith("/pmm/cycles/5/reassign", { stakeholder_id: 10 });
  });

  it("startNewCycle posts to start cycle", async () => {
    mockAxios.post.mockResolvedValue({ data: { data: { id: 6 } } });
    const result = await startNewCycle(1);
    expect(mockAxios.post).toHaveBeenCalledWith("/pmm/projects/1/start-cycle");
    expect(result.id).toBe(6);
  });
});
