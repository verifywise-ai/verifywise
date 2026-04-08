import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import { createModelInventory } from "../modelInventory.repository";

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

describe("Test Model Inventory Repository", () => {
  describe("createModelInventory", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    const routeUrl = "/model-inventory";
    const modelData = {
      name: "GPT-4 Risk Classifier",
      version: "1.0",
      type: "classification",
      risk_level: "high",
    };

    it("should make a POST request to the provided route URL with the given data", async () => {
      const mockResponse = {
        data: { id: 1, ...modelData },
        status: 201,
        statusText: "Created",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await createModelInventory(routeUrl, modelData);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith(routeUrl, modelData);
    });

    it("should return the response data on successful API call", async () => {
      const mockResponse = {
        data: { id: 1, ...modelData },
        status: 201,
        statusText: "Created",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await createModelInventory(routeUrl, modelData);

      expect(result).toEqual(mockResponse.data);
    });

    it("should use the exact routeUrl provided without modification", async () => {
      const customUrl = "/projects/99/model-inventory";
      const mockResponse = {
        data: { id: 2, ...modelData },
        status: 201,
        statusText: "Created",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await createModelInventory(customUrl, modelData);

      expect(apiServices.post).toHaveBeenCalledWith(customUrl, modelData);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 422, data: { message: "Validation error" } },
      };
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(createModelInventory(routeUrl, modelData)).rejects.toEqual(
        mockError,
      );
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.post).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(createModelInventory(routeUrl, modelData)).rejects.toThrow(
        "Network timeout",
      );
    });
  });
});
