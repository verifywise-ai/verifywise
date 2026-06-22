import { describe, it, expect } from "vitest";

import { deepEvalProjectsService } from "../deepEvalProjectsService";

describe("deepEvalProjectsService", () => {
  it("createProject posts project data", async () => {
    const result = await deepEvalProjectsService.createProject({ name: "New" } as any);
    expect(result.project.id).toBe(2);
    expect(result.message).toBe("Created");
  });

  it("getAllProjects fetches all projects", async () => {
    const result = await deepEvalProjectsService.getAllProjects();
    expect(result.projects).toHaveLength(1);
  });

  it("getProject fetches single project", async () => {
    const result = await deepEvalProjectsService.getProject("p1");
    expect(result.project.name).toBe("Eval Project");
  });

  it("updateProject puts updated data", async () => {
    const result = await deepEvalProjectsService.updateProject("p1", { name: "Updated" } as any);
    expect(result.message).toBe("Updated");
  });

  it("deleteProject calls DELETE", async () => {
    const result = await deepEvalProjectsService.deleteProject("p1");
    expect(result.message).toBe("deleted");
  });

  it("getProjectStats fetches stats", async () => {
    const result = await deepEvalProjectsService.getProjectStats("p1");
    expect(result.stats.totalExperiments).toBe(100);
  });
});
