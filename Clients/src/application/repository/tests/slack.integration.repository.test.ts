import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  getSlackIntegrations,
  getSlackIntegrationById,
  createSlackIntegration,
  updateSlackIntegration,
  sendSlackMessage,
  deleteSlackIntegration,
} from "../slack.integration.repository";

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

describe("slack.integration.repository", () => {
  beforeEach(vi.clearAllMocks);
  afterEach(vi.clearAllMocks);

  describe("getSlackIntegrations", () => {
    it("should make GET request to /slackWebhooks with userId", async () => {
      const mockResponse = {
        data: [
          {
            id: 1,
            channel: "#general",
            webhook_url: "https://hooks.slack.com/xxx",
            created_at: "2024-01-01T00:00:00Z",
          },
          {
            id: 2,
            channel: "#alerts",
            webhook_url: "https://hooks.slack.com/yyy",
            created_at: "2024-01-02T00:00:00Z",
          },
        ],
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getSlackIntegrations({ id: 1 });

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/slackWebhooks", {
        userId: 1,
        channel: undefined,
        signal: undefined,
        responseType: "json",
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should make GET request with channel param", async () => {
      const mockResponse = {
        data: [
          {
            id: 1,
            channel: "#alerts",
            webhook_url: "https://hooks.slack.com/xxx",
            created_at: "2024-01-01T00:00:00Z",
          },
        ],
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getSlackIntegrations({ id: 1, channel: "#alerts" });

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/slackWebhooks", {
        userId: 1,
        channel: "#alerts",
        signal: undefined,
        responseType: "json",
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Internal Server Error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getSlackIntegrations({ id: 1 })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getSlackIntegrations({ id: 1 })).rejects.toThrow("Network timeout");
    });
  });

  describe("getSlackIntegrationById", () => {
    it("should make GET request to /slackWebhooks/:id", async () => {
      const mockResponse = {
        data: {
          id: 1,
          channel: "#general",
          webhook_url: "https://hooks.slack.com/xxx",
          is_active: true,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getSlackIntegrationById({ id: 1 });

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/slackWebhooks/1", {
        signal: undefined,
        responseType: "json",
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Integration not found" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getSlackIntegrationById({ id: 999 })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getSlackIntegrationById({ id: 1 })).rejects.toThrow("Connection refused");
    });
  });

  describe("createSlackIntegration", () => {
    it("should make POST request to /slackWebhooks with body", async () => {
      const mockResponse = {
        data: {
          id: 1,
          channel: "#new-channel",
          webhook_url: "https://hooks.slack.com/new",
          is_active: true,
          created_at: "2024-01-01T00:00:00Z",
        },
        status: 201,
        statusText: "Created",
      };

      const body = {
        channel: "#new-channel",
        webhook_url: "https://hooks.slack.com/new",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await createSlackIntegration({ body });

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith("/slackWebhooks", body);
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: "Invalid webhook URL" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      const body = {
        channel: "#test",
        webhook_url: "invalid-url",
      };

      await expect(createSlackIntegration({ body })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      const body = {
        channel: "#test",
        webhook_url: "https://hooks.slack.com/test",
      };

      await expect(createSlackIntegration({ body })).rejects.toThrow("Network timeout");
    });
  });

  describe("updateSlackIntegration", () => {
    it("should make PATCH request to /slackWebhooks/:id with body", async () => {
      const mockResponse = {
        data: {
          id: 1,
          channel: "#updated-channel",
          webhook_url: "https://hooks.slack.com/updated",
          is_active: false,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
        },
        status: 200,
        statusText: "OK",
      };

      const body = {
        channel: "#updated-channel",
        is_active: false,
      };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const result = await updateSlackIntegration({ id: 1, body });

      expect(apiServices.patch).toHaveBeenCalledTimes(1);
      expect(apiServices.patch).toHaveBeenCalledWith("/slackWebhooks/1", body);
      expect(result).toEqual(mockResponse);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Integration not found" },
        },
      };

      vi.mocked(apiServices.patch).mockRejectedValue(mockError);

      const body = {
        channel: "#test",
      };

      await expect(updateSlackIntegration({ id: 999, body })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.patch).mockRejectedValue(networkError);

      const body = {
        is_active: true,
      };

      await expect(updateSlackIntegration({ id: 1, body })).rejects.toThrow("Connection refused");
    });
  });

  describe("sendSlackMessage", () => {
    it("should make POST request to /slackWebhooks/:id/send with default message", async () => {
      const mockResponse = {
        data: {
          success: true,
          message: "Message sent successfully",
          timestamp: "2024-01-01T00:00:00Z",
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await sendSlackMessage({ id: 1 });

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith("/slackWebhooks/1/send", {
        title: "Welcome to Verifywise",
        message: "This is a test message from VerifyWise.",
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Failed to send message" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(sendSlackMessage({ id: 1 })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      await expect(sendSlackMessage({ id: 1 })).rejects.toThrow("Network timeout");
    });
  });

  describe("deleteSlackIntegration", () => {
    it("should make DELETE request to /slackWebhooks/:id", async () => {
      const mockResponse = {
        data: {
          message: "Integration deleted successfully",
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const result = await deleteSlackIntegration({ id: 1 });

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith("/slackWebhooks/1");
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Integration not found" },
        },
      };

      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(deleteSlackIntegration({ id: 999 })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.delete).mockRejectedValue(networkError);

      await expect(deleteSlackIntegration({ id: 1 })).rejects.toThrow("Network timeout");
    });
  });
});
