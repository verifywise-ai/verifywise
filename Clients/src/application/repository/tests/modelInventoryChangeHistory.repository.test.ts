import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import { getModelInventoryChangeHistory } from "../modelInventoryChangeHistory.repository";

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

describe("Test Model Inventory Change History Repository", () => {
  describe("getModelInventoryChangeHistory", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a GET request to the correct URL with the model inventory ID", async () => {
      const mockResponse = { data: [], status: 200, statusText: "OK" };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getModelInventoryChangeHistory(5);

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/modelInventoryChangeHistory/5",
      );
    });

    it("should return the response data on successful API call", async () => {
      const mockHistory = [
        {
          id: 1,
          model_inventory_id: 5,
          field_name: "risk_level",
          old_value: "low",
          new_value: "high",
          changed_by: 10,
          changed_at: "2026-03-01T00:00:00Z",
        },
      ];
      const mockResponse = { data: mockHistory, status: 200, statusText: "OK" };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getModelInventoryChangeHistory(5);

      expect(result).toEqual(mockHistory);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Model inventory not found" },
        },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getModelInventoryChangeHistory(99)).rejects.toEqual(
        mockError,
      );
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.get).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(getModelInventoryChangeHistory(5)).rejects.toThrow(
        "Network timeout",
      );
    });
  });
});
