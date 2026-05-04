import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CustomAxios from "../../../infrastructure/api/customAxios";
import { friaRepository } from "../fria.repository";

vi.mock("../../../infrastructure/api/customAxios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockResponse = (data: unknown) => ({ data: { data } });

describe("fria.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==================== getFria ====================

  describe("getFria", () => {
    it("should call GET /fria/{projectId} and return data", async () => {
      const mockData = { id: 1, project_id: 10, status: "draft" };
      vi.mocked(CustomAxios.get).mockResolvedValue(mockResponse(mockData));

      const result = await friaRepository.getFria(10);

      expect(CustomAxios.get).toHaveBeenCalledWith("/fria/10");
      expect(result).toEqual(mockData);
    });

    it("should handle string projectId", async () => {
      const mockData = { id: 1, project_id: "5" };
      vi.mocked(CustomAxios.get).mockResolvedValue(mockResponse(mockData));

      const result = await friaRepository.getFria("5");

      expect(CustomAxios.get).toHaveBeenCalledWith("/fria/5");
      expect(result).toEqual(mockData);
    });

    it("should throw on network error", async () => {
      vi.mocked(CustomAxios.get).mockRejectedValue(new Error("Network error"));

      await expect(friaRepository.getFria(10)).rejects.toThrow("Network error");
    });
  });

  // ==================== updateFria ====================

  describe("updateFria", () => {
    it("should call PUT /fria/{projectId} with data and return result", async () => {
      const updateData = { status: "in_progress" };
      const mockData = { id: 1, project_id: 10, status: "in_progress" };
      vi.mocked(CustomAxios.put).mockResolvedValue(mockResponse(mockData));

      const result = await friaRepository.updateFria(10, updateData as any);

      expect(CustomAxios.put).toHaveBeenCalledWith("/fria/10", updateData);
      expect(result).toEqual(mockData);
    });

    it("should handle string projectId", async () => {
      vi.mocked(CustomAxios.put).mockResolvedValue(mockResponse({ id: 1 }));

      await friaRepository.updateFria("7", {} as any);

      expect(CustomAxios.put).toHaveBeenCalledWith("/fria/7", {});
    });

    it("should throw on error", async () => {
      vi.mocked(CustomAxios.put).mockRejectedValue(new Error("Not found"));

      await expect(friaRepository.updateFria(999, {} as any)).rejects.toThrow("Not found");
    });
  });

  // ==================== updateRights ====================

  describe("updateRights", () => {
    it("should call PUT /fria/{friaId}/rights with rights payload", async () => {
      const rights = [{ id: 1, impact_level: "high" }];
      const mockData = { updated: true };
      vi.mocked(CustomAxios.put).mockResolvedValue(mockResponse(mockData));

      const result = await friaRepository.updateRights(1, rights as any);

      expect(CustomAxios.put).toHaveBeenCalledWith("/fria/1/rights", {
        rights,
      });
      expect(result).toEqual(mockData);
    });

    it("should handle empty rights array", async () => {
      vi.mocked(CustomAxios.put).mockResolvedValue(mockResponse([]));

      const result = await friaRepository.updateRights(1, []);

      expect(CustomAxios.put).toHaveBeenCalledWith("/fria/1/rights", {
        rights: [],
      });
      expect(result).toEqual([]);
    });

    it("should throw on error", async () => {
      vi.mocked(CustomAxios.put).mockRejectedValue(new Error("Validation failed"));

      await expect(friaRepository.updateRights(1, [])).rejects.toThrow("Validation failed");
    });
  });

  // ==================== addRiskItem ====================

  describe("addRiskItem", () => {
    it("should call POST /fria/{friaId}/risk-items with data", async () => {
      const itemData = { description: "Risk item 1", severity: "high" };
      const mockData = { id: 10, ...itemData };
      vi.mocked(CustomAxios.post).mockResolvedValue(mockResponse(mockData));

      const result = await friaRepository.addRiskItem(1, itemData as any);

      expect(CustomAxios.post).toHaveBeenCalledWith("/fria/1/risk-items", itemData);
      expect(result).toEqual(mockData);
    });

    it("should throw on validation error", async () => {
      vi.mocked(CustomAxios.post).mockRejectedValue(new Error("Validation failed"));

      await expect(friaRepository.addRiskItem(1, {} as any)).rejects.toThrow("Validation failed");
    });
  });

  // ==================== updateRiskItem ====================

  describe("updateRiskItem", () => {
    it("should call PATCH /fria/{friaId}/risk-items/{itemId} with data", async () => {
      const updateData = { severity: "low" };
      const mockData = { id: 5, severity: "low" };
      vi.mocked(CustomAxios.patch).mockResolvedValue(mockResponse(mockData));

      const result = await friaRepository.updateRiskItem(1, 5, updateData as any);

      expect(CustomAxios.patch).toHaveBeenCalledWith("/fria/1/risk-items/5", updateData);
      expect(result).toEqual(mockData);
    });

    it("should throw on not found", async () => {
      vi.mocked(CustomAxios.patch).mockRejectedValue(new Error("Risk item not found"));

      await expect(friaRepository.updateRiskItem(1, 999, {} as any)).rejects.toThrow(
        "Risk item not found",
      );
    });
  });

  // ==================== deleteRiskItem ====================

  describe("deleteRiskItem", () => {
    it("should call DELETE /fria/{friaId}/risk-items/{itemId}", async () => {
      const mockData = { deleted: true };
      vi.mocked(CustomAxios.delete).mockResolvedValue(mockResponse(mockData));

      const result = await friaRepository.deleteRiskItem(1, 5);

      expect(CustomAxios.delete).toHaveBeenCalledWith("/fria/1/risk-items/5");
      expect(result).toEqual(mockData);
    });

    it("should throw on not found", async () => {
      vi.mocked(CustomAxios.delete).mockRejectedValue(new Error("Risk item not found"));

      await expect(friaRepository.deleteRiskItem(1, 999)).rejects.toThrow("Risk item not found");
    });
  });

  // ==================== getModelLinks ====================

  describe("getModelLinks", () => {
    it("should call GET /fria/{friaId}/models and return data", async () => {
      const mockData = [
        { id: 1, model_id: 10 },
        { id: 2, model_id: 20 },
      ];
      vi.mocked(CustomAxios.get).mockResolvedValue(mockResponse(mockData));

      const result = await friaRepository.getModelLinks(1);

      expect(CustomAxios.get).toHaveBeenCalledWith("/fria/1/models");
      expect(result).toEqual(mockData);
    });

    it("should return empty array when no links", async () => {
      vi.mocked(CustomAxios.get).mockResolvedValue(mockResponse([]));

      const result = await friaRepository.getModelLinks(1);

      expect(result).toEqual([]);
    });

    it("should throw on error", async () => {
      vi.mocked(CustomAxios.get).mockRejectedValue(new Error("Network error"));

      await expect(friaRepository.getModelLinks(1)).rejects.toThrow("Network error");
    });
  });

  // ==================== linkModel ====================

  describe("linkModel", () => {
    it("should call POST /fria/{friaId}/models/{modelId}", async () => {
      const mockData = { id: 1, fria_id: 1, model_id: 10 };
      vi.mocked(CustomAxios.post).mockResolvedValue(mockResponse(mockData));

      const result = await friaRepository.linkModel(1, 10);

      expect(CustomAxios.post).toHaveBeenCalledWith("/fria/1/models/10");
      expect(result).toEqual(mockData);
    });

    it("should throw on duplicate link", async () => {
      vi.mocked(CustomAxios.post).mockRejectedValue(new Error("Model already linked"));

      await expect(friaRepository.linkModel(1, 10)).rejects.toThrow("Model already linked");
    });
  });

  // ==================== unlinkModel ====================

  describe("unlinkModel", () => {
    it("should call DELETE /fria/{friaId}/models/{modelId}", async () => {
      const mockData = { deleted: true };
      vi.mocked(CustomAxios.delete).mockResolvedValue(mockResponse(mockData));

      const result = await friaRepository.unlinkModel(1, 10);

      expect(CustomAxios.delete).toHaveBeenCalledWith("/fria/1/models/10");
      expect(result).toEqual(mockData);
    });

    it("should throw on not found", async () => {
      vi.mocked(CustomAxios.delete).mockRejectedValue(new Error("Link not found"));

      await expect(friaRepository.unlinkModel(1, 999)).rejects.toThrow("Link not found");
    });
  });

  // ==================== submitFria ====================

  describe("submitFria", () => {
    it("should call POST /fria/{friaId}/submit with reason", async () => {
      const mockData = { id: 1, status: "submitted" };
      vi.mocked(CustomAxios.post).mockResolvedValue(mockResponse(mockData));

      const result = await friaRepository.submitFria(1, "Ready for review");

      expect(CustomAxios.post).toHaveBeenCalledWith("/fria/1/submit", {
        reason: "Ready for review",
      });
      expect(result).toEqual(mockData);
    });

    it("should call POST /fria/{friaId}/submit without reason", async () => {
      const mockData = { id: 1, status: "submitted" };
      vi.mocked(CustomAxios.post).mockResolvedValue(mockResponse(mockData));

      const result = await friaRepository.submitFria(1);

      expect(CustomAxios.post).toHaveBeenCalledWith("/fria/1/submit", {
        reason: undefined,
      });
      expect(result).toEqual(mockData);
    });

    it("should throw on error", async () => {
      vi.mocked(CustomAxios.post).mockRejectedValue(new Error("Assessment incomplete"));

      await expect(friaRepository.submitFria(1)).rejects.toThrow("Assessment incomplete");
    });
  });

  // ==================== getVersions ====================

  describe("getVersions", () => {
    it("should call GET /fria/{friaId}/versions and return data", async () => {
      const mockData = [
        { id: 1, version: 1, created_at: "2026-01-01" },
        { id: 2, version: 2, created_at: "2026-02-01" },
      ];
      vi.mocked(CustomAxios.get).mockResolvedValue(mockResponse(mockData));

      const result = await friaRepository.getVersions(1);

      expect(CustomAxios.get).toHaveBeenCalledWith("/fria/1/versions");
      expect(result).toEqual(mockData);
    });

    it("should return empty array when no versions", async () => {
      vi.mocked(CustomAxios.get).mockResolvedValue(mockResponse([]));

      const result = await friaRepository.getVersions(1);

      expect(result).toEqual([]);
    });

    it("should throw on error", async () => {
      vi.mocked(CustomAxios.get).mockRejectedValue(new Error("Not found"));

      await expect(friaRepository.getVersions(999)).rejects.toThrow("Not found");
    });
  });

  // ==================== getEvidence ====================

  describe("getEvidence", () => {
    it("should call GET /fria/{friaId}/evidence without section", async () => {
      const mockData = [{ id: 1, file_name: "doc.pdf" }];
      vi.mocked(CustomAxios.get).mockResolvedValue(mockResponse(mockData));

      const result = await friaRepository.getEvidence(1);

      expect(CustomAxios.get).toHaveBeenCalledWith("/fria/1/evidence");
      expect(result).toEqual(mockData);
    });

    it("should call GET /fria/{friaId}/evidence with section param", async () => {
      const mockData = [{ id: 2, file_name: "report.pdf" }];
      vi.mocked(CustomAxios.get).mockResolvedValue(mockResponse(mockData));

      const result = await friaRepository.getEvidence(1, "rights");

      expect(CustomAxios.get).toHaveBeenCalledWith("/fria/1/evidence?section=rights");
      expect(result).toEqual(mockData);
    });

    it("should return empty array when no evidence", async () => {
      vi.mocked(CustomAxios.get).mockResolvedValue(mockResponse([]));

      const result = await friaRepository.getEvidence(1);

      expect(result).toEqual([]);
    });

    it("should throw on error", async () => {
      vi.mocked(CustomAxios.get).mockRejectedValue(new Error("Network error"));

      await expect(friaRepository.getEvidence(1)).rejects.toThrow("Network error");
    });
  });

  // ==================== linkEvidence ====================

  describe("linkEvidence", () => {
    it("should call POST /fria/{friaId}/evidence with file_id and entity_type", async () => {
      const mockData = { id: 1, fria_id: 1, file_id: 5 };
      vi.mocked(CustomAxios.post).mockResolvedValue(mockResponse(mockData));

      const result = await friaRepository.linkEvidence(1, 5, "risk_item");

      expect(CustomAxios.post).toHaveBeenCalledWith("/fria/1/evidence", {
        file_id: 5,
        entity_type: "risk_item",
      });
      expect(result).toEqual(mockData);
    });

    it("should handle different entity types", async () => {
      vi.mocked(CustomAxios.post).mockResolvedValue(mockResponse({ id: 2 }));

      await friaRepository.linkEvidence(1, 10, "right");

      expect(CustomAxios.post).toHaveBeenCalledWith("/fria/1/evidence", {
        file_id: 10,
        entity_type: "right",
      });
    });

    it("should throw on error", async () => {
      vi.mocked(CustomAxios.post).mockRejectedValue(new Error("File not found"));

      await expect(friaRepository.linkEvidence(1, 999, "risk_item")).rejects.toThrow(
        "File not found",
      );
    });
  });

  // ==================== unlinkEvidence ====================

  describe("unlinkEvidence", () => {
    it("should call DELETE /fria/{friaId}/evidence/{linkId}", async () => {
      const mockData = { deleted: true };
      vi.mocked(CustomAxios.delete).mockResolvedValue(mockResponse(mockData));

      const result = await friaRepository.unlinkEvidence(1, 5);

      expect(CustomAxios.delete).toHaveBeenCalledWith("/fria/1/evidence/5");
      expect(result).toEqual(mockData);
    });

    it("should throw on not found", async () => {
      vi.mocked(CustomAxios.delete).mockRejectedValue(new Error("Evidence link not found"));

      await expect(friaRepository.unlinkEvidence(1, 999)).rejects.toThrow(
        "Evidence link not found",
      );
    });
  });
});
