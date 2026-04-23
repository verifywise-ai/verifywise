import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  AdvisorMessage,
  listConversationsAPI,
  getConversationByIdAPI,
  createConversationAPI,
  updateConversationAPI,
  deleteConversationAPI,
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
  describe("listConversationsAPI", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should GET /advisor/conversations/:domain", async () => {
      const mockResponse = {
        data: {
          domain: "test-domain",
          conversations: [],
        },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await listConversationsAPI("test-domain");

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        `/advisor/conversations/test-domain`,
      );
    });

    it("should throw an error with status and data if the API call fails", async () => {
      const mockError = {
        response: { status: 500, data: { message: "Server Error" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(listConversationsAPI("test-domain")).rejects.toEqual(
        expect.objectContaining({
          status: 500,
          data: { message: "Server Error" },
        }),
      );
    });

    it("should return the response data on success", async () => {
      const mockResponse = {
        data: {
          domain: "test-domain",
          conversations: [
            {
              id: 1,
              title: "First chat",
              last_message_at: "2026-04-08T00:00:00Z",
              message_count: 4,
              created_at: "2026-04-08T00:00:00Z",
              updated_at: "2026-04-08T00:00:00Z",
            },
          ],
        },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await listConversationsAPI("test-domain");
      expect(result).toEqual(mockResponse);
    });

    it("should propagate network errors", async () => {
      vi.mocked(apiServices.get).mockRejectedValue(new Error("Network timeout"));
      await expect(listConversationsAPI("test-domain")).rejects.toThrow(
        "Network timeout",
      );
    });
  });

  describe("getConversationByIdAPI", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should GET /advisor/conversations/:domain/:id", async () => {
      const mockResponse = {
        data: {
          domain: "test-domain",
          conversation: {
            id: 42,
            title: "My chat",
            messages: [],
            last_message_at: null,
            created_at: "2026-04-08T00:00:00Z",
            updated_at: "2026-04-08T00:00:00Z",
          },
        },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getConversationByIdAPI("test-domain", 42);

      expect(apiServices.get).toHaveBeenCalledWith(
        `/advisor/conversations/test-domain/42`,
      );
    });

    it("should surface a 404 as a thrown error", async () => {
      vi.mocked(apiServices.get).mockRejectedValue({
        response: { status: 404, data: { error: "Conversation not found" } },
      });

      await expect(
        getConversationByIdAPI("test-domain", 42),
      ).rejects.toEqual(
        expect.objectContaining({ status: 404 }),
      );
    });
  });

  describe("createConversationAPI", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should POST /advisor/conversations/:domain with an empty body", async () => {
      const mockResponse = {
        data: {
          domain: "test-domain",
          conversation: {
            id: 7,
            title: null,
            messages: [],
            last_message_at: null,
            created_at: "2026-04-08T00:00:00Z",
            updated_at: "2026-04-08T00:00:00Z",
          },
        },
        status: 201,
        statusText: "Created",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await createConversationAPI("test-domain");

      expect(apiServices.post).toHaveBeenCalledWith(
        `/advisor/conversations/test-domain`,
        {},
      );
    });
  });

  describe("updateConversationAPI", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    const messages: AdvisorMessage[] = [
      {
        id: "1",
        role: "user",
        content: "Hello",
        createdAt: "2026-04-08T00:00:00Z",
      },
    ];

    it("should PUT /advisor/conversations/:domain/:id with the messages array", async () => {
      const mockResponse = {
        data: {
          domain: "test-domain",
          conversation: {
            id: 7,
            title: "Hello",
            messages,
            last_message_at: "2026-04-08T00:01:00Z",
            created_at: "2026-04-08T00:00:00Z",
            updated_at: "2026-04-08T00:01:00Z",
          },
        },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.put).mockResolvedValue(mockResponse);

      await updateConversationAPI("test-domain", 7, messages);

      expect(apiServices.put).toHaveBeenCalledWith(
        `/advisor/conversations/test-domain/7`,
        { messages },
      );
    });

    it("should propagate a 500 error with its data", async () => {
      vi.mocked(apiServices.put).mockRejectedValue({
        response: { status: 500, data: { message: "Server Error" } },
      });

      await expect(
        updateConversationAPI("test-domain", 7, messages),
      ).rejects.toEqual(
        expect.objectContaining({
          status: 500,
          data: { message: "Server Error" },
        }),
      );
    });
  });

  describe("deleteConversationAPI", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should DELETE /advisor/conversations/:domain/:id", async () => {
      const mockResponse = { data: undefined, status: 204, statusText: "No Content" };
      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      await deleteConversationAPI("test-domain", 3);

      expect(apiServices.delete).toHaveBeenCalledWith(
        `/advisor/conversations/test-domain/3`,
      );
    });
  });
});
