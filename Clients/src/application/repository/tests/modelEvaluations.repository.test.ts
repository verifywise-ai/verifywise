import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import { getAllModelEvaluations } from "../modelEvaluations.repository";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
  },
}));

describe("Test Model Evaluations Repository", () => {
  describe("getAllModelEvaluations", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    const mockData = {
      experiments: [
        {
          id: "exp-1",
          name: "Accuracy Test",
          status: "completed",
          config: { model: "gpt-4" },
          created_at: "2026-04-01T00:00:00Z",
          eval_type: "experiment" as const,
        },
      ],
      biasAudits: [
        {
          id: "ba-1",
          name: "Gender Bias Audit",
          status: "completed",
          config: { preset: "gender" },
          created_at: "2026-04-02T00:00:00Z",
          eval_type: "bias_audit" as const,
        },
      ],
    };

    it("should make a GET request to /modelInventory/evaluations", async () => {
      const mockResponse = { data: mockData, status: 200, statusText: "OK" };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getAllModelEvaluations();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/modelInventory/evaluations");
    });

    it("should return the response data on successful fetch", async () => {
      const mockResponse = { data: mockData, status: 200, statusText: "OK" };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getAllModelEvaluations();

      expect(result).toEqual(mockData);
      expect(result.experiments).toHaveLength(1);
      expect(result.biasAudits).toHaveLength(1);
    });

    it("should return empty arrays when no evaluations exist", async () => {
      const emptyData = { experiments: [], biasAudits: [] };
      const mockResponse = { data: emptyData, status: 200, statusText: "OK" };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getAllModelEvaluations();

      expect(result.experiments).toEqual([]);
      expect(result.biasAudits).toEqual([]);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 500, data: { message: "Internal server error" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getAllModelEvaluations()).rejects.toEqual(mockError);
    });

    it("should throw an error on network failure", async () => {
      vi.mocked(apiServices.get).mockRejectedValue(new Error("Network Error"));

      await expect(getAllModelEvaluations()).rejects.toThrow("Network Error");
    });
  });
});
