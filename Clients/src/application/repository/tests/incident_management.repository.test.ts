import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import { createIncidentManagement } from "../incident_management.repository";

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

describe("Test Incident Management Repository", () => {
  describe("createIncidentManagement", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    const routeUrl = "/incident-management";
    const incidentData = {
      title: "Test Incident",
      description: "An incident occurred",
      severity: "high",
    };

    it("should make a POST request to the provided route URL with the given data", async () => {
      const mockResponse = {
        data: { id: 1, ...incidentData },
        status: 201,
        statusText: "Created",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await createIncidentManagement(routeUrl, incidentData);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith(routeUrl, incidentData);
    });

    it("should return the response data on successful API call", async () => {
      const mockResponse = {
        data: { id: 1, ...incidentData },
        status: 201,
        statusText: "Created",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await createIncidentManagement(routeUrl, incidentData);

      expect(result).toEqual(mockResponse.data);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Internal Server Error" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(
        createIncidentManagement(routeUrl, incidentData),
      ).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      await expect(
        createIncidentManagement(routeUrl, incidentData),
      ).rejects.toThrow("Network timeout");
    });

    it("should use the exact routeUrl provided without modification", async () => {
      const customUrl = "/projects/123/incident-management";
      const mockResponse = {
        data: { id: 2, ...incidentData },
        status: 201,
        statusText: "Created",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await createIncidentManagement(customUrl, incidentData);

      expect(apiServices.post).toHaveBeenCalledWith(customUrl, incidentData);
    });
  });
});
