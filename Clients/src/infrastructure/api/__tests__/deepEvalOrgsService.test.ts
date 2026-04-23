import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../customAxios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { deepEvalOrgsService } from "../deepEvalOrgsService";
import CustomAxios from "../customAxios";

const mockAxios = vi.mocked(CustomAxios, { deep: true });

describe("deepEvalOrgsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("getAllOrgs fetches orgs", async () => {
    mockAxios.get.mockResolvedValue({ data: { orgs: [{ id: "1", name: "Org" }] } });
    const result = await deepEvalOrgsService.getAllOrgs();
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/orgs");
    expect(result.orgs).toHaveLength(1);
  });

  it("getAllOrgs returns empty array on 404", async () => {
    mockAxios.get.mockRejectedValue({ response: { status: 404 } });
    const result = await deepEvalOrgsService.getAllOrgs();
    expect(result.orgs).toEqual([]);
  });

  it("getAllOrgs rethrows non-404 errors", async () => {
    mockAxios.get.mockRejectedValue({ response: { status: 500 } });
    await expect(deepEvalOrgsService.getAllOrgs()).rejects.toEqual({ response: { status: 500 } });
  });

  it("createOrg posts name and member_ids", async () => {
    mockAxios.post.mockResolvedValue({ data: { org: { id: "new", name: "New Org" } } });
    const result = await deepEvalOrgsService.createOrg("New Org", [1, 2]);
    expect(mockAxios.post).toHaveBeenCalledWith("/deepeval/orgs", { name: "New Org", member_ids: [1, 2] });
    expect(result.org.name).toBe("New Org");
  });

  it("updateOrg puts updated data", async () => {
    mockAxios.put.mockResolvedValue({ data: { org: { id: "1", name: "Updated" } } });
    const result = await deepEvalOrgsService.updateOrg("1", "Updated", [3]);
    expect(mockAxios.put).toHaveBeenCalledWith("/deepeval/orgs/1", { name: "Updated", member_ids: [3] });
    expect(result.org.name).toBe("Updated");
  });

  it("deleteOrg calls DELETE and clears current if matching", async () => {
    mockAxios.delete.mockResolvedValue({});
    localStorage.setItem("vw_evals_current_org", "org-1");
    await deepEvalOrgsService.deleteOrg("org-1");
    expect(mockAxios.delete).toHaveBeenCalledWith("/deepeval/orgs/org-1");
    expect(localStorage.getItem("vw_evals_current_org")).toBeNull();
  });

  it("getProjectsForOrg fetches project IDs", async () => {
    mockAxios.get.mockResolvedValue({ data: { projectIds: ["p1", "p2"] } });
    const result = await deepEvalOrgsService.getProjectsForOrg("org-1");
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/orgs/org-1/projects");
    expect(result).toEqual(["p1", "p2"]);
  });

  it("setCurrentOrg and getCurrentOrg work together", async () => {
    mockAxios.get.mockResolvedValue({ data: { orgs: [{ id: "org-x", name: "X" }] } });
    await deepEvalOrgsService.setCurrentOrg("org-x");
    const result = await deepEvalOrgsService.getCurrentOrg();
    expect(result.org).toEqual({ id: "org-x", name: "X" });
  });

  it("getCurrentOrg returns null when no org set", async () => {
    const result = await deepEvalOrgsService.getCurrentOrg();
    expect(result.org).toBeNull();
  });

  it("clearCurrentOrg removes from localStorage", async () => {
    localStorage.setItem("vw_evals_current_org", "org-1");
    await deepEvalOrgsService.clearCurrentOrg();
    expect(localStorage.getItem("vw_evals_current_org")).toBeNull();
  });
});
