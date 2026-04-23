import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../customAxios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../deepEvalOrgsService", () => ({
  deepEvalOrgsService: {
    getCurrentOrg: vi.fn().mockResolvedValue({ org: { id: "org-1" } }),
    getAllOrgs: vi.fn().mockResolvedValue({ orgs: [{ id: "org-1" }] }),
    setCurrentOrg: vi.fn(),
  },
}));

import { deepEvalDatasetsService } from "../deepEvalDatasetsService";
import CustomAxios from "../customAxios";

const mockAxios = vi.mocked(CustomAxios, { deep: true });

describe("deepEvalDatasetsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("list fetches datasets", async () => {
    const datasets = { chatbot: [], rag: [], agent: [] };
    mockAxios.get.mockResolvedValue({ data: { datasets } });
    const result = await deepEvalDatasetsService.list();
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/datasets/list");
    expect(result).toEqual(datasets);
  });

  it("read fetches dataset by path", async () => {
    mockAxios.get.mockResolvedValue({ data: { path: "test.json", prompts: [] } });
    const result = await deepEvalDatasetsService.read("test.json");
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/datasets/read", { params: { path: "test.json" } });
    expect(result.path).toBe("test.json");
  });

  it("listUploads fetches uploads", async () => {
    mockAxios.get.mockResolvedValue({ data: { uploads: [{ name: "f.json", path: "/p", size: 100, modifiedAt: 0 }] } });
    const result = await deepEvalDatasetsService.listUploads();
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/datasets/uploads");
    expect(result.uploads).toHaveLength(1);
  });

  it("listMy fetches user datasets", async () => {
    mockAxios.get.mockResolvedValue({ data: { datasets: [] } });
    const result = await deepEvalDatasetsService.listMy();
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/datasets/user");
    expect(result.datasets).toEqual([]);
  });

  it("deleteDatasets sends paths in request body", async () => {
    mockAxios.delete.mockResolvedValue({ data: { message: "ok", deleted: 2 } });
    const result = await deepEvalDatasetsService.deleteDatasets(["a.json", "b.json"]);
    expect(mockAxios.delete).toHaveBeenCalledWith("/deepeval/datasets/user", { data: { paths: ["a.json", "b.json"] } });
    expect(result.deleted).toBe(2);
  });

  it("uploadDataset sends FormData with org_id", async () => {
    mockAxios.post.mockResolvedValue({ data: { message: "ok", path: "p", filename: "f", size: 100, tenant: "t" } });
    const file = new File(["content"], "data.json", { type: "application/json" });
    const result = await deepEvalDatasetsService.uploadDataset(file, "chatbot", "single-turn", "org-1");
    expect(mockAxios.post).toHaveBeenCalledWith(
      "/deepeval/datasets/upload",
      expect.any(FormData),
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    expect(result.message).toBe("ok");
  });
});
