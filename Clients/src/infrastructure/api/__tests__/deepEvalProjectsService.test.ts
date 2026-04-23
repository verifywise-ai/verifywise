import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../customAxios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { deepEvalProjectsService } from "../deepEvalProjectsService";
import CustomAxios from "../customAxios";

const mockAxios = vi.mocked(CustomAxios, { deep: true });

describe("deepEvalProjectsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createProject posts project data", async () => {
    mockAxios.post.mockResolvedValue({ data: { project: { id: "p1" }, message: "created" } });
    const result = await deepEvalProjectsService.createProject({ name: "New" } as any);
    expect(mockAxios.post).toHaveBeenCalledWith("/deepeval/projects", { name: "New" });
    expect(result.project.id).toBe("p1");
  });

  it("getAllProjects fetches all projects", async () => {
    mockAxios.get.mockResolvedValue({ data: { projects: [{ id: "p1" }] } });
    const result = await deepEvalProjectsService.getAllProjects();
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/projects");
    expect(result.projects).toHaveLength(1);
  });

  it("getProject fetches single project", async () => {
    mockAxios.get.mockResolvedValue({ data: { project: { id: "p1", name: "Test" } } });
    const result = await deepEvalProjectsService.getProject("p1");
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/projects/p1");
    expect(result.project.name).toBe("Test");
  });

  it("updateProject puts updated data", async () => {
    mockAxios.put.mockResolvedValue({ data: { project: { id: "p1" }, message: "updated" } });
    const result = await deepEvalProjectsService.updateProject("p1", { name: "Updated" } as any);
    expect(mockAxios.put).toHaveBeenCalledWith("/deepeval/projects/p1", { name: "Updated" });
    expect(result.message).toBe("updated");
  });

  it("deleteProject calls DELETE", async () => {
    mockAxios.delete.mockResolvedValue({ data: { message: "deleted", projectId: "p1" } });
    const result = await deepEvalProjectsService.deleteProject("p1");
    expect(mockAxios.delete).toHaveBeenCalledWith("/deepeval/projects/p1");
    expect(result.message).toBe("deleted");
  });

  it("getProjectStats fetches stats", async () => {
    const stats = { projectId: "p1", totalExperiments: 5, lastRunDate: null, avgMetrics: {} };
    mockAxios.get.mockResolvedValue({ data: { stats } });
    const result = await deepEvalProjectsService.getProjectStats("p1");
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/projects/p1/stats");
    expect(result.stats.totalExperiments).toBe(5);
  });
});
