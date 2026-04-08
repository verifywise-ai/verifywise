import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import { getAllLogs } from "../logs.repository";

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

describe("Test Logs Repository", () => {
  describe("getAllLogs", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a GET request to the provided route URL", async () => {
      const mockResponse = { data: [], status: 200, statusText: "OK" };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getAllLogs({ routeUrl: "/logs" });

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/logs");
    });

    it("should return the response data on successful API call", async () => {
      const mockLogs = [
        {
          id: 1,
          message: "User logged in",
          level: "info",
          created_at: "2026-03-01T00:00:00Z",
        },
        {
          id: 2,
          message: "Record updated",
          level: "info",
          created_at: "2026-03-02T00:00:00Z",
        },
      ];
      const mockResponse = { data: mockLogs, status: 200, statusText: "OK" };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getAllLogs({ routeUrl: "/logs" });

      expect(result).toEqual(mockLogs);
    });

    it("should use the exact routeUrl provided without modification", async () => {
      const mockResponse = { data: [], status: 200, statusText: "OK" };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getAllLogs({ routeUrl: "/projects/42/logs" });

      expect(apiServices.get).toHaveBeenCalledWith("/projects/42/logs");
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 500, data: { message: "Internal Server Error" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getAllLogs({ routeUrl: "/logs" })).rejects.toEqual(
        mockError,
      );
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.get).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(getAllLogs({ routeUrl: "/logs" })).rejects.toThrow(
        "Network timeout",
      );
    });
  });
});
