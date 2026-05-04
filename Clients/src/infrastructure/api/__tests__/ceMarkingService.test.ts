import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../customAxios", () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

import { ceMarkingService } from "../ceMarkingService";
import CustomAxios from "../customAxios";

const mockAxios = vi.mocked(CustomAxios, { deep: true });

describe("ceMarkingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getCEMarking fetches by project ID", async () => {
    const mockData = { projectId: "1", isHighRiskAISystem: true };
    mockAxios.get.mockResolvedValue({ data: mockData });
    const result = await ceMarkingService.getCEMarking("1");
    expect(mockAxios.get).toHaveBeenCalledWith("/ce-marking/1");
    expect(result).toEqual(mockData);
  });

  it("updateCEMarking puts data for project", async () => {
    const updateData = { isHighRiskAISystem: false };
    mockAxios.put.mockResolvedValue({ data: { ...updateData, projectId: "1" } });
    const result = await ceMarkingService.updateCEMarking("1", updateData);
    expect(mockAxios.put).toHaveBeenCalledWith("/ce-marking/1", updateData);
    expect(result).toEqual({ ...updateData, projectId: "1" });
  });

  it("updateConformityStep delegates to updateCEMarking", async () => {
    mockAxios.put.mockResolvedValue({ data: {} });
    await ceMarkingService.updateConformityStep("proj-1", 2, { status: "done" });
    expect(mockAxios.put).toHaveBeenCalledWith(
      "/ce-marking/proj-1",
      expect.objectContaining({
        conformitySteps: [{ id: 2, status: "done" }],
      }),
    );
  });

  it("updateClassificationAndScope delegates to updateCEMarking", async () => {
    mockAxios.put.mockResolvedValue({ data: {} });
    await ceMarkingService.updateClassificationAndScope("p1", { isHighRiskAISystem: true });
    expect(mockAxios.put).toHaveBeenCalledWith("/ce-marking/p1", { isHighRiskAISystem: true });
  });

  it("updateDeclaration delegates to updateCEMarking", async () => {
    mockAxios.put.mockResolvedValue({ data: {} });
    await ceMarkingService.updateDeclaration("p1", { declarationStatus: "signed" });
    expect(mockAxios.put).toHaveBeenCalledWith("/ce-marking/p1", { declarationStatus: "signed" });
  });

  it("updateRegistration delegates to updateCEMarking", async () => {
    mockAxios.put.mockResolvedValue({ data: {} });
    await ceMarkingService.updateRegistration("p1", { registrationStatus: "complete" });
    expect(mockAxios.put).toHaveBeenCalledWith("/ce-marking/p1", {
      registrationStatus: "complete",
    });
  });

  it("getAllPolicies extracts data.data", async () => {
    mockAxios.get.mockResolvedValue({ data: { message: "OK", data: [{ id: 1 }] } });
    const result = await ceMarkingService.getAllPolicies();
    expect(mockAxios.get).toHaveBeenCalledWith("/policies");
    expect(result).toEqual([{ id: 1 }]);
  });

  it("getAllPolicies falls back to array response", async () => {
    mockAxios.get.mockResolvedValue({ data: [{ id: 2 }] });
    const result = await ceMarkingService.getAllPolicies();
    expect(result).toEqual([{ id: 2 }]);
  });

  it("getAllEvidences returns array directly", async () => {
    mockAxios.get.mockResolvedValue({ data: [{ id: 1, name: "file.pdf" }] });
    const result = await ceMarkingService.getAllEvidences();
    expect(mockAxios.get).toHaveBeenCalledWith("/files");
    expect(result).toEqual([{ id: 1, name: "file.pdf" }]);
  });

  it("updateLinkedPolicies sends policy IDs", async () => {
    mockAxios.put.mockResolvedValue({ data: {} });
    await ceMarkingService.updateLinkedPolicies("p1", [1, 2, 3]);
    expect(mockAxios.put).toHaveBeenCalledWith("/ce-marking/p1", {
      linkedPolicies: [1, 2, 3],
      policiesLinked: 3,
    });
  });

  it("updateLinkedEvidences sends evidence IDs", async () => {
    mockAxios.put.mockResolvedValue({ data: {} });
    await ceMarkingService.updateLinkedEvidences("p1", [5, 6]);
    expect(mockAxios.put).toHaveBeenCalledWith("/ce-marking/p1", {
      linkedEvidences: [5, 6],
      evidenceLinked: 2,
    });
  });

  it("getAllIncidents extracts data.data", async () => {
    mockAxios.get.mockResolvedValue({ data: { message: "OK", data: [{ id: 10 }] } });
    const result = await ceMarkingService.getAllIncidents();
    expect(mockAxios.get).toHaveBeenCalledWith("/ai-incident-managements");
    expect(result).toEqual([{ id: 10 }]);
  });

  it("updateLinkedIncidents sends incident IDs", async () => {
    mockAxios.put.mockResolvedValue({ data: {} });
    await ceMarkingService.updateLinkedIncidents("p1", [7, 8]);
    expect(mockAxios.put).toHaveBeenCalledWith("/ce-marking/p1", {
      linkedIncidents: [7, 8],
      totalIncidents: 2,
    });
  });
});
