import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  AdvisorMessage,
  getConversationAPI,
  saveConversationAPI,
} from "../advisor.repository";

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

describe("Test Advisor Repository", () => {
  describe("getConversationAPI", () => {
    beforeEach(vi.clearAllMocks);

    afterEach(vi.clearAllMocks);
    it("should add the domain to the url and make a GET request", async () => {
      const mockResponse = {
        data: {
          domain: "test-domain",
          messages: [],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getConversationAPI("test-domain");

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        `/advisor/conversations/test-domain`,
      );
    });
    it("should throw an error with status and data if the API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Not Found" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getConversationAPI("test-domain")).rejects.toThrow();

      try {
        await getConversationAPI("test-domain");
      } catch (error) {
        expect(error).toEqual({
          ...mockError,
          status: 404,
          data: { message: "Not Found" },
        });
      }
    });
    it("should return the response data on successful API call", async () => {
      const mockResponse = {
        data: {
          domain: "test-domain",
          messages: [],
        },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getConversationAPI("test-domain");
      expect(result).toEqual(mockResponse);
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getConversationAPI("test-domain")).rejects.toThrow(
        "Network timeout",
      );
    });
  });
  describe("saveConversationAPI", () => {
    beforeEach(vi.clearAllMocks);

    afterEach(vi.clearAllMocks);
    const messages = [
      {
        id: "1",
        role: "user",
        content: "Test message",
        createdAt: "2024-01-01T00:00:00Z",
        chartData: undefined,
      },
    ];

    it("should add the domain to the url and make a POST request with messages", async () => {
      const mockResponse = {
        data: {
          domain: "test-domain",
          messages: [],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await saveConversationAPI("test-domain", messages as AdvisorMessage[]);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith(
        `/advisor/conversations/test-domain`,
        { messages },
      );
    });
    it("should throw an error with status and data if the API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Internal Server Error" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(
        saveConversationAPI("test-domain", messages as AdvisorMessage[]),
      ).rejects.toThrow();

      try {
        await saveConversationAPI("test-domain", messages as AdvisorMessage[]);
      } catch (error) {
        expect(error).toEqual({
          ...mockError,
          status: 500,
          data: { message: "Internal Server Error" },
        });
      }
    });
    it("should return the response data on successful API call", async () => {
      const mockResponse = {
        data: {
          domain: "test-domain",
          messages: [],
        },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await saveConversationAPI(
        "test-domain",
        messages as AdvisorMessage[],
      );
      expect(result).toEqual(mockResponse);
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      await expect(
        saveConversationAPI("test-domain", messages as AdvisorMessage[]),
      ).rejects.toThrow("Connection refused");
    });
  });
});
