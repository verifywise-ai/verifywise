import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import { createTraining } from "../trainingregistar.repository";

vi.mock("../../../infrastructure/api/networkServices", () => {
  return {
    apiServices: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

describe("trainingregistar.repository", () => {
  beforeEach(vi.clearAllMocks);
  afterEach(vi.clearAllMocks);

  describe("createTraining", () => {
    it("should make POST request to routeUrl with training data", async () => {
      const mockResponse = {
        data: {
          id: 1,
          name: "Security Training",
          completed_at: "2024-01-01T00:00:00Z",
        },
        status: 201,
        statusText: "Created",
      };

      const data = {
        name: "Security Training",
        description: "Annual security awareness training",
        duration_hours: 2,
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await createTraining("/training", data);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith("/training", data);
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: "Invalid training data" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(
        createTraining("/training", { name: "" }),
      ).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      await expect(
        createTraining("/training", { name: "Test Training" }),
      ).rejects.toThrow("Network timeout");
    });
  });
});
