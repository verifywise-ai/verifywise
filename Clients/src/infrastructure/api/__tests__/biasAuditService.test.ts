import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../customAxios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}));

import { biasAuditService } from "../biasAuditService";
import CustomAxios from "../customAxios";

const mockAxios = vi.mocked(CustomAxios, { deep: true });

describe("biasAuditService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listPresets fetches presets", async () => {
    mockAxios.get.mockResolvedValue({ data: { presets: [{ id: "p1", name: "NYC LL144" }] } });
    const result = await biasAuditService.listPresets();
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/bias-audits/presets");
    expect(result[0].name).toBe("NYC LL144");
  });

  it("getPreset fetches single preset", async () => {
    mockAxios.get.mockResolvedValue({ data: { preset: { id: "p1", name: "Test" } } });
    const result = await biasAuditService.getPreset("p1");
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/bias-audits/presets/p1");
    expect(result.id).toBe("p1");
  });

  it("runAudit sends FormData", async () => {
    mockAxios.post.mockResolvedValue({ data: { auditId: "a1", status: "running" } });
    const file = new File(["csv"], "data.csv");
    const config = { presetId: "p1", orgId: "org1", outcomeColumn: "hired", columnMapping: {} };
    const result = await biasAuditService.runAudit(file, config as any);
    expect(mockAxios.post).toHaveBeenCalledWith(
      "/deepeval/bias-audits/run",
      expect.any(FormData),
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    expect(result.auditId).toBe("a1");
  });

  it("getStatus fetches audit status", async () => {
    mockAxios.get.mockResolvedValue({ data: { auditId: "a1", status: "completed" } });
    const result = await biasAuditService.getStatus("a1");
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/bias-audits/a1/status");
    expect(result.status).toBe("completed");
  });

  it("getResults fetches audit results", async () => {
    mockAxios.get.mockResolvedValue({ data: { auditId: "a1", status: "completed", results: {} } });
    const result = await biasAuditService.getResults("a1");
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/bias-audits/a1/results");
    expect(result.auditId).toBe("a1");
  });

  it("listAudits fetches with params", async () => {
    mockAxios.get.mockResolvedValue({ data: { audits: [] } });
    const result = await biasAuditService.listAudits({ org_id: "org1" });
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/bias-audits", { params: { org_id: "org1" } });
    expect(result).toEqual([]);
  });

  it("deleteAudit removes audit", async () => {
    mockAxios.delete.mockResolvedValue({ data: { message: "deleted", auditId: "a1" } });
    const result = await biasAuditService.deleteAudit("a1");
    expect(mockAxios.delete).toHaveBeenCalledWith("/deepeval/bias-audits/a1");
    expect(result.message).toBe("deleted");
  });

  it("updateAuditName patches audit", async () => {
    mockAxios.patch.mockResolvedValue({ data: { auditId: "a1", systemName: "New Name" } });
    const result = await biasAuditService.updateAuditName("a1", "New Name");
    expect(mockAxios.patch).toHaveBeenCalledWith("/deepeval/bias-audits/a1", { systemName: "New Name" });
    expect(result.systemName).toBe("New Name");
  });

  it("downloadReport fetches blob", async () => {
    const blob = new Blob(["pdf"]);
    mockAxios.get.mockResolvedValue({ data: blob });
    const result = await biasAuditService.downloadReport("a1");
    expect(mockAxios.get).toHaveBeenCalledWith("/deepeval/bias-audits/a1/report.pdf", { responseType: "blob" });
    expect(result).toBe(blob);
  });

  it("parseHeaders sends file and returns headers", async () => {
    mockAxios.post.mockResolvedValue({ data: { headers: ["name", "age", "hired"] } });
    const file = new File(["csv"], "data.csv");
    const result = await biasAuditService.parseHeaders(file);
    expect(mockAxios.post).toHaveBeenCalledWith(
      "/deepeval/bias-audits/parse-headers",
      expect.any(FormData),
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    expect(result).toEqual(["name", "age", "hired"]);
  });
});
