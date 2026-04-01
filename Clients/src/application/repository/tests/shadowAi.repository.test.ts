import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  deleteApiKey,
  getInsightsSummary,
  getToolsByEvents,
  getToolsByUsers,
  getUsersByDepartment,
  getTrend,
  getUsers,
  getUserDetail,
  getDepartmentActivity,
  getTools,
  getToolById,
  updateToolStatus,
  startGovernance,
  getRules,
  createRule,
  updateRule,
  deleteRule,
  getAlertHistory,
  getSyslogConfigs,
  createSyslogConfig,
  updateSyslogConfig,
  deleteSyslogConfig,
  getSettingsConfig,
  updateSettingsConfig,
} from "../shadowAi.repository";
import {
  IShadowAiApiKey,
  IShadowAiApiKeyCreated,
  IShadowAiTool,
  IShadowAiRule,
  IShadowAiSyslogConfig,
  ShadowAiInsightsSummary,
  ShadowAiToolByEvents,
  ShadowAiToolByUsers,
  ShadowAiUsersByDepartment,
  ShadowAiTrendPoint,
  ShadowAiUserActivity,
  ShadowAiDepartmentActivity,
  IShadowAiAlertHistory,
  ShadowAiGovernanceRequest,
  ShadowAiGovernanceResult,
  ShadowAiToolStatus,
  IShadowAiSettings,
} from "../../../domain/interfaces/i.shadowAi";

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

describe("shadowAi.repository", () => {
  beforeEach(vi.clearAllMocks);
  afterEach(vi.clearAllMocks);

  // ============================================================================
  // API Keys
  // ============================================================================

  describe("createApiKey", () => {
    it("should make POST request to /shadow-ai/api-keys with label", async () => {
      const mockResponse = {
        data: {
          data: {
            id: 1,
            key: "sk-test-1234567890",
            key_prefix: "sk-test-",
            label: "Test Key",
            created_by: 1,
            is_active: true,
            created_at: "2024-01-01T00:00:00Z",
          } as IShadowAiApiKeyCreated,
        },
        status: 201,
        statusText: "Created",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await createApiKey("Test Key");

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith(
        "/shadow-ai/api-keys",
        { label: "Test Key" },
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Internal Server Error" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(createApiKey("Test Key")).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      await expect(createApiKey("Test Key")).rejects.toThrow("Network timeout");
    });
  });

  describe("listApiKeys", () => {
    it("should make GET request to /shadow-ai/api-keys", async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 1,
              key_prefix: "sk-test-",
              label: "Key 1",
              created_by: 1,
              is_active: true,
              created_at: "2024-01-01T00:00:00Z",
            } as IShadowAiApiKey,
            {
              id: 2,
              key_prefix: "sk-prod-",
              label: "Key 2",
              created_by: 1,
              is_active: true,
              created_at: "2024-01-02T00:00:00Z",
            } as IShadowAiApiKey,
          ],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await listApiKeys();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/shadow-ai/api-keys");
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Not Found" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(listApiKeys()).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(listApiKeys()).rejects.toThrow("Connection refused");
    });
  });

  describe("revokeApiKey", () => {
    it("should make DELETE request to /shadow-ai/api-keys/:id", async () => {
      const mockResponse = {
        data: {},
        status: 204,
        statusText: "No Content",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      await revokeApiKey(1);

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith("/shadow-ai/api-keys/1");
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Not Found" },
        },
      };

      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(revokeApiKey(1)).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.delete).mockRejectedValue(networkError);

      await expect(revokeApiKey(1)).rejects.toThrow("Network timeout");
    });
  });

  describe("deleteApiKey", () => {
    it("should make DELETE request to /shadow-ai/api-keys/:id/permanent", async () => {
      const mockResponse = {
        data: {},
        status: 204,
        statusText: "No Content",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      await deleteApiKey(1);

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith(
        "/shadow-ai/api-keys/1/permanent",
      );
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Not Found" },
        },
      };

      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(deleteApiKey(1)).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.delete).mockRejectedValue(networkError);

      await expect(deleteApiKey(1)).rejects.toThrow("Network timeout");
    });
  });

  // ============================================================================
  // Insights
  // ============================================================================

  describe("getInsightsSummary", () => {
    it("should make GET request to /shadow-ai/insights/summary without params", async () => {
      const mockResponse = {
        data: {
          data: {
            unique_apps: 100,
            total_ai_users: 50,
            highest_risk_tool: { name: "RiskyTool", risk_score: 85 },
            most_active_department: "Engineering",
            departments_using_ai: 10,
          } as ShadowAiInsightsSummary,
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getInsightsSummary();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/insights/summary",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should make GET request with period param", async () => {
      const mockResponse = {
        data: {
          data: {
            unique_apps: 50,
            total_ai_users: 25,
            highest_risk_tool: null,
            most_active_department: "Marketing",
            departments_using_ai: 5,
          } as ShadowAiInsightsSummary,
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getInsightsSummary("7d");

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/insights/summary?period=7d",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Internal Server Error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getInsightsSummary()).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getInsightsSummary()).rejects.toThrow("Network timeout");
    });
  });

  describe("getToolsByEvents", () => {
    it("should make GET request to /shadow-ai/insights/tools-by-events without params", async () => {
      const mockResponse = {
        data: {
          data: [
            { tool_name: "ChatGPT", event_count: 100 },
            { tool_name: "Claude", event_count: 80 },
          ] as ShadowAiToolByEvents[],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getToolsByEvents();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/insights/tools-by-events",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should make GET request with period param", async () => {
      const mockResponse = {
        data: {
          data: [{ tool_name: "ChatGPT", event_count: 50 }] as ShadowAiToolByEvents[],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getToolsByEvents("7d");

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/insights/tools-by-events?period=7d",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should make GET request with period and limit params", async () => {
      const mockResponse = {
        data: {
          data: [{ tool_name: "ChatGPT", event_count: 50 }] as ShadowAiToolByEvents[],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getToolsByEvents("7d", 10);

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/insights/tools-by-events?period=7d&limit=10",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Internal Server Error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getToolsByEvents()).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getToolsByEvents()).rejects.toThrow("Connection refused");
    });
  });

  describe("getToolsByUsers", () => {
    it("should make GET request to /shadow-ai/insights/tools-by-users without params", async () => {
      const mockResponse = {
        data: {
          data: [
            { tool_name: "ChatGPT", user_count: 25 },
            { tool_name: "Claude", user_count: 20 },
          ] as ShadowAiToolByUsers[],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getToolsByUsers();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/insights/tools-by-users",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should make GET request with period param", async () => {
      const mockResponse = {
        data: {
          data: [{ tool_name: "ChatGPT", user_count: 10 }] as ShadowAiToolByUsers[],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getToolsByUsers("30d");

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/insights/tools-by-users?period=30d",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should make GET request with period and limit params", async () => {
      const mockResponse = {
        data: {
          data: [{ tool_name: "ChatGPT", user_count: 10 }] as ShadowAiToolByUsers[],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getToolsByUsers("30d", 5);

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/insights/tools-by-users?period=30d&limit=5",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Internal Server Error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getToolsByUsers()).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getToolsByUsers()).rejects.toThrow("Network timeout");
    });
  });

  describe("getUsersByDepartment", () => {
    it("should make GET request to /shadow-ai/insights/users-by-department without params", async () => {
      const mockResponse = {
        data: {
          data: [
            { department: "Engineering", user_count: 50 },
            { department: "Marketing", user_count: 20 },
          ] as ShadowAiUsersByDepartment[],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getUsersByDepartment();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/insights/users-by-department",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should make GET request with period param", async () => {
      const mockResponse = {
        data: {
          data: [{ department: "Engineering", user_count: 25 }] as ShadowAiUsersByDepartment[],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getUsersByDepartment("7d");

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/insights/users-by-department?period=7d",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Internal Server Error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getUsersByDepartment()).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getUsersByDepartment()).rejects.toThrow(
        "Connection refused",
      );
    });
  });

  describe("getTrend", () => {
    it("should make GET request to /shadow-ai/insights/trend without params", async () => {
      const mockResponse = {
        data: {
          data: [
            { date: "2024-01-01", total_events: 100, unique_users: 20, new_tools: 2 },
            { date: "2024-01-02", total_events: 120, unique_users: 25, new_tools: 1 },
          ] as ShadowAiTrendPoint[],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getTrend();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/shadow-ai/insights/trend");
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should make GET request with period param", async () => {
      const mockResponse = {
        data: {
          data: [
            { date: "2024-01-01", total_events: 50, unique_users: 10, new_tools: 1 },
          ] as ShadowAiTrendPoint[],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getTrend("7d");

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/insights/trend?period=7d",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should make GET request with period and granularity params", async () => {
      const mockResponse = {
        data: {
          data: [
            { date: "2024-01-01", total_events: 50, unique_users: 10, new_tools: 1 },
          ] as ShadowAiTrendPoint[],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getTrend("30d", "daily");

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/insights/trend?period=30d&granularity=daily",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Internal Server Error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getTrend()).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getTrend()).rejects.toThrow("Network timeout");
    });
  });

  // ============================================================================
  // User Activity
  // ============================================================================

  describe("getUsers", () => {
    it("should make GET request to /shadow-ai/users without params", async () => {
      const mockResponse = {
        data: {
          data: {
            users: [
              {
                user_email: "user1@test.com",
                department: "Engineering",
                total_prompts: 100,
                risk_score: 25,
              } as ShadowAiUserActivity,
            ],
            total: 1,
            page: 1,
            limit: 10,
          },
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getUsers();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/shadow-ai/users");
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should make GET request with page and limit params", async () => {
      const mockResponse = {
        data: {
          data: {
            users: [
              {
                user_email: "user1@test.com",
                department: "Engineering",
                total_prompts: 100,
                risk_score: 25,
              } as ShadowAiUserActivity,
            ],
            total: 100,
            page: 2,
            limit: 20,
          },
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getUsers({ page: 2, limit: 20 });

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/users?page=2&limit=20",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should make GET request with all params", async () => {
      const mockResponse = {
        data: {
          data: {
            users: [
              {
                user_email: "user1@test.com",
                department: "Engineering",
                total_prompts: 100,
                risk_score: 25,
              } as ShadowAiUserActivity,
            ],
            total: 50,
            page: 1,
            limit: 10,
          },
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getUsers({
        page: 1,
        limit: 10,
        period: "30d",
        department: "Engineering",
        sort_by: "event_count",
        order: "desc",
      });

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/users?page=1&limit=10&period=30d&department=Engineering&sort_by=event_count&order=desc",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Internal Server Error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getUsers()).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getUsers()).rejects.toThrow("Connection refused");
    });
  });

  describe("getUserDetail", () => {
    it("should make GET request to /shadow-ai/users/:email/activity without params", async () => {
      const mockResponse = {
        data: {
          data: {
            email: "user@test.com",
            department: "Engineering",
            tools: [
              { tool_name: "ChatGPT", event_count: 50, last_used: "2024-01-01" },
            ],
            total_prompts: 100,
          },
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getUserDetail("user@test.com");

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/users/user%40test.com/activity",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should make GET request with period param", async () => {
      const mockResponse = {
        data: {
          data: {
            email: "user@test.com",
            department: "Engineering",
            tools: [
              { tool_name: "ChatGPT", event_count: 25, last_used: "2024-01-01" },
            ],
            total_prompts: 50,
          },
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getUserDetail("user@test.com", "7d");

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/users/user%40test.com/activity?period=7d",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should encode email with special characters", async () => {
      const mockResponse = {
        data: {
          data: {
            email: "user+tag@test.com",
            department: "Engineering",
            tools: [],
            total_prompts: 0,
          },
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getUserDetail("user+tag@test.com");

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/users/user%2Btag%40test.com/activity",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "User Not Found" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getUserDetail("user@test.com")).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getUserDetail("user@test.com")).rejects.toThrow(
        "Network timeout",
      );
    });
  });

  describe("getDepartmentActivity", () => {
    it("should make GET request to /shadow-ai/departments without params", async () => {
      const mockResponse = {
        data: {
          data: [
            {
              department: "Engineering",
              users: 50,
              total_prompts: 1000,
              top_tool: "ChatGPT",
              risk_score: 35,
            } as ShadowAiDepartmentActivity,
          ],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getDepartmentActivity();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/shadow-ai/departments");
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should make GET request with period param", async () => {
      const mockResponse = {
        data: {
          data: [
            {
              department: "Engineering",
              users: 25,
              total_prompts: 500,
              top_tool: "Claude",
              risk_score: 20,
            } as ShadowAiDepartmentActivity,
          ],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getDepartmentActivity("7d");

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/departments?period=7d",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Internal Server Error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getDepartmentActivity()).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getDepartmentActivity()).rejects.toThrow(
        "Connection refused",
      );
    });
  });

  // ============================================================================
  // Tools
  // ============================================================================

  describe("getTools", () => {
    it("should make GET request to /shadow-ai/tools without params", async () => {
      const mockResponse = {
        data: {
          data: {
            tools: [
              {
                id: 1,
                name: "ChatGPT",
                status: "detected",
                total_users: 10,
                total_events: 100,
                domains: ["openai.com"],
              } as IShadowAiTool,
            ],
            total: 1,
            page: 1,
            limit: 10,
          },
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getTools();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/shadow-ai/tools");
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should make GET request with page and limit params", async () => {
      const mockResponse = {
        data: {
          data: {
            tools: [
              {
                id: 1,
                name: "ChatGPT",
                status: "detected",
                total_users: 10,
                total_events: 100,
                domains: ["openai.com"],
              } as IShadowAiTool,
            ],
            total: 100,
            page: 2,
            limit: 20,
          },
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getTools({ page: 2, limit: 20 });

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/tools?page=2&limit=20",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should make GET request with all params including status", async () => {
      const mockResponse = {
        data: {
          data: {
            tools: [
              {
                id: 1,
                name: "ChatGPT",
                status: "blocked",
                total_users: 10,
                total_events: 100,
                domains: ["openai.com"],
              } as IShadowAiTool,
            ],
            total: 50,
            page: 1,
            limit: 10,
          },
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getTools({
        page: 1,
        limit: 10,
        status: "blocked" as ShadowAiToolStatus,
        sort_by: "event_count",
        order: "desc",
      });

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/tools?page=1&limit=10&status=blocked&sort_by=event_count&order=desc",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Internal Server Error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getTools()).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getTools()).rejects.toThrow("Network timeout");
    });
  });

  describe("getToolById", () => {
    it("should make GET request to /shadow-ai/tools/:id", async () => {
      const mockResponse = {
        data: {
          data: {
            id: 1,
            name: "ChatGPT",
            status: "detected",
            total_users: 10,
            total_events: 100,
            domains: ["openai.com"],
            departments: [{ department: "Engineering", user_count: 10 }],
            top_users: [{ user_email: "user@test.com", event_count: 50 }],
          } as IShadowAiTool & {
            departments: { department: string; user_count: number }[];
            top_users: { user_email: string; event_count: number }[];
          },
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getToolById(1);

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/shadow-ai/tools/1");
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Tool Not Found" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getToolById(999)).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getToolById(1)).rejects.toThrow("Connection refused");
    });
  });

  describe("updateToolStatus", () => {
    it("should make PATCH request to /shadow-ai/tools/:id/status", async () => {
      const mockResponse = {
        data: {
          data: {
            id: 1,
            name: "ChatGPT",
            status: "blocked" as ShadowAiToolStatus,
            total_users: 10,
            total_events: 100,
            domains: ["openai.com"],
          } as IShadowAiTool,
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const result = await updateToolStatus(1, "blocked");

      expect(apiServices.patch).toHaveBeenCalledTimes(1);
      expect(apiServices.patch).toHaveBeenCalledWith(
        "/shadow-ai/tools/1/status",
        { status: "blocked" },
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: "Invalid Status" },
        },
      };

      vi.mocked(apiServices.patch).mockRejectedValue(mockError);

      await expect(updateToolStatus(1, "invalid" as ShadowAiToolStatus)).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.patch).mockRejectedValue(networkError);

      await expect(updateToolStatus(1, "blocked")).rejects.toThrow(
        "Network timeout",
      );
    });
  });

  describe("startGovernance", () => {
    it("should make POST request to /shadow-ai/tools/:id/start-governance", async () => {
      const mockResponse = {
        data: {
          data: {
            model_inventory_id: 123,
            risk_entry_id: 456,
            lifecycle_started: true,
          } as ShadowAiGovernanceResult,
        },
        status: 202,
        statusText: "Accepted",
      };

      const governanceRequest: ShadowAiGovernanceRequest = {
        model_inventory: {
          provider: "OpenAI",
          model: "GPT-4",
          version: "v1.0",
          status: "under_review",
        },
        governance_owner_id: 1,
        risk_assessment: {
          data_sensitivity: "high",
          description: "Customer data may be processed",
        },
        start_lifecycle: true,
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await startGovernance(1, governanceRequest);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith(
        "/shadow-ai/tools/1/start-governance",
        governanceRequest,
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Internal Server Error" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      const governanceRequest: ShadowAiGovernanceRequest = {
        model_inventory: {
          provider: "OpenAI",
          model: "GPT-4",
        },
        governance_owner_id: 1,
      };

      await expect(startGovernance(1, governanceRequest)).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      const governanceRequest: ShadowAiGovernanceRequest = {
        model_inventory: {
          provider: "OpenAI",
          model: "GPT-4",
        },
        governance_owner_id: 1,
      };

      await expect(startGovernance(1, governanceRequest)).rejects.toThrow(
        "Connection refused",
      );
    });
  });

  // ============================================================================
  // Rules
  // ============================================================================

  describe("getRules", () => {
    it("should make GET request to /shadow-ai/rules", async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 1,
              name: "Block ChatGPT",
              is_active: true,
              trigger_type: "new_tool_detected",
              trigger_config: {},
              actions: [{ type: "send_alert" }],
              created_by: 1,
              created_at: "2024-01-01T00:00:00Z",
              updated_at: "2024-01-01T00:00:00Z",
            } as IShadowAiRule,
          ],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getRules();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/shadow-ai/rules");
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Internal Server Error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getRules()).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getRules()).rejects.toThrow("Network timeout");
    });
  });

  describe("createRule", () => {
    it("should make POST request to /shadow-ai/rules with rule data", async () => {
      const mockResponse = {
        data: {
          data: {
            id: 1,
            name: "Block ChatGPT",
            is_active: true,
            trigger_type: "new_tool_detected" as const,
            trigger_config: {},
            actions: [{ type: "send_alert" as const }],
            created_by: 1,
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          } as IShadowAiRule,
        },
        status: 200,
        statusText: "OK",
      };

      const ruleData = {
        name: "Block ChatGPT",
        is_active: true,
        trigger_type: "new_tool_detected" as const,
        trigger_config: { threshold: 5 },
        actions: [{ type: "send_alert" as const, assign_to: 1 }],
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await createRule(ruleData);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith("/shadow-ai/rules", ruleData);
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: "Invalid Rule" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(
        createRule({
          name: "Invalid Rule",
          is_active: true,
          trigger_type: "new_tool_detected" as const,
          trigger_config: {},
          actions: [],
        }),
      ).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      await expect(
        createRule({
          name: "Block ChatGPT",
          is_active: true,
          trigger_type: "new_tool_detected" as const,
          trigger_config: {},
          actions: [{ type: "send_alert" as const }],
        }),
      ).rejects.toThrow("Connection refused");
    });
  });

  describe("updateRule", () => {
    it("should make PATCH request to /shadow-ai/rules/:id with partial rule data", async () => {
      const mockResponse = {
        data: {
          data: {
            id: 1,
            name: "Updated Rule",
            is_active: false,
            trigger_type: "usage_threshold_exceeded" as const,
            trigger_config: { threshold: 10 },
            actions: [{ type: "create_task" as const }],
            created_by: 1,
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-02T00:00:00Z",
          } as IShadowAiRule,
        },
        status: 200,
        statusText: "OK",
      };

      const updates = {
        name: "Updated Rule",
        is_active: false,
      };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const result = await updateRule(1, updates);

      expect(apiServices.patch).toHaveBeenCalledTimes(1);
      expect(apiServices.patch).toHaveBeenCalledWith(
        "/shadow-ai/rules/1",
        updates,
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Rule Not Found" },
        },
      };

      vi.mocked(apiServices.patch).mockRejectedValue(mockError);

      await expect(updateRule(999, { name: "Test" })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.patch).mockRejectedValue(networkError);

      await expect(updateRule(1, { name: "Test" })).rejects.toThrow(
        "Network timeout",
      );
    });
  });

  describe("deleteRule", () => {
    it("should make DELETE request to /shadow-ai/rules/:id", async () => {
      const mockResponse = {
        data: {},
        status: 204,
        statusText: "No Content",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      await deleteRule(1);

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith("/shadow-ai/rules/1");
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Rule Not Found" },
        },
      };

      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(deleteRule(999)).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.delete).mockRejectedValue(networkError);

      await expect(deleteRule(1)).rejects.toThrow("Network timeout");
    });
  });

  describe("getAlertHistory", () => {
    it("should make GET request to /shadow-ai/rules/alert-history without params", async () => {
      const mockResponse = {
        data: {
          data: {
            alerts: [
              {
                id: 1,
                rule_id: 1,
                rule_name: "Test Rule",
                trigger_type: "new_tool_detected",
                trigger_data: {},
                actions_taken: {},
                fired_at: "2024-01-01T00:00:00Z",
              } as IShadowAiAlertHistory,
            ],
            total: 1,
          },
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getAlertHistory();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/rules/alert-history",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should make GET request with page and limit params", async () => {
      const mockResponse = {
        data: {
          data: {
            alerts: [
              {
                id: 1,
                rule_id: 1,
                rule_name: "Test Rule",
                trigger_type: "new_tool_detected",
                trigger_data: {},
                actions_taken: {},
                fired_at: "2024-01-01T00:00:00Z",
              } as IShadowAiAlertHistory,
            ],
            total: 100,
          },
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getAlertHistory(2, 20);

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/shadow-ai/rules/alert-history?page=2&limit=20",
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Internal Server Error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getAlertHistory()).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getAlertHistory()).rejects.toThrow("Connection refused");
    });
  });

  // ============================================================================
  // Config
  // ============================================================================

  describe("getSyslogConfigs", () => {
    it("should make GET request to /shadow-ai/config/syslog", async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 1,
              source_identifier: "syslog_server",
              parser_type: "zscaler",
              is_active: true,
              created_at: "2024-01-01T00:00:00Z",
            } as IShadowAiSyslogConfig,
          ],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getSyslogConfigs();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/shadow-ai/config/syslog");
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Internal Server Error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getSyslogConfigs()).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getSyslogConfigs()).rejects.toThrow("Network timeout");
    });
  });

  describe("createSyslogConfig", () => {
    it("should make POST request to /shadow-ai/config/syslog with config data", async () => {
      const mockResponse = {
        data: {
          data: {
            id: 1,
            source_identifier: "new_server",
            parser_type: "netskope" as const,
            is_active: true,
            created_at: "2024-01-01T00:00:00Z",
          } as IShadowAiSyslogConfig,
        },
        status: 201,
        statusText: "Created",
      };

      const configData = {
        source_identifier: "new_server",
        parser_type: "netskope" as const,
        is_active: true,
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await createSyslogConfig(configData);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith(
        "/shadow-ai/config/syslog",
        configData,
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: "Invalid Config" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(
        createSyslogConfig({
          source_identifier: "",
          parser_type: "squid" as const,
          is_active: true,
        }),
      ).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      await expect(
        createSyslogConfig({
          source_identifier: "server",
          parser_type: "generic_kv" as const,
          is_active: true,
        }),
      ).rejects.toThrow("Connection refused");
    });
  });

  describe("updateSyslogConfig", () => {
    it("should make PATCH request to /shadow-ai/config/syslog/:id with updates", async () => {
      const mockResponse = {
        data: {
          data: {
            id: 1,
            source_identifier: "updated_server",
            parser_type: "squid" as const,
            is_active: false,
            created_at: "2024-01-01T00:00:00Z",
          } as IShadowAiSyslogConfig,
        },
        status: 200,
        statusText: "OK",
      };

      const updates = {
        source_identifier: "updated_server",
        parser_type: "squid" as const,
        is_active: false,
      };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const result = await updateSyslogConfig(1, updates);

      expect(apiServices.patch).toHaveBeenCalledTimes(1);
      expect(apiServices.patch).toHaveBeenCalledWith(
        "/shadow-ai/config/syslog/1",
        updates,
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Config Not Found" },
        },
      };

      vi.mocked(apiServices.patch).mockRejectedValue(mockError);

      await expect(
        updateSyslogConfig(999, { is_active: true }),
      ).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.patch).mockRejectedValue(networkError);

      await expect(
        updateSyslogConfig(1, { is_active: true }),
      ).rejects.toThrow("Network timeout");
    });
  });

  describe("deleteSyslogConfig", () => {
    it("should make DELETE request to /shadow-ai/config/syslog/:id", async () => {
      const mockResponse = {
        data: {},
        status: 204,
        statusText: "No Content",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      await deleteSyslogConfig(1);

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith(
        "/shadow-ai/config/syslog/1",
      );
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Config Not Found" },
        },
      };

      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(deleteSyslogConfig(999)).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.delete).mockRejectedValue(networkError);

      await expect(deleteSyslogConfig(1)).rejects.toThrow("Network timeout");
    });
  });

  // ============================================================================
  // Settings
  // ============================================================================

  describe("getSettingsConfig", () => {
    it("should make GET request to /shadow-ai/settings", async () => {
      const mockResponse = {
        data: {
          data: {
            id: 1,
            rate_limit_max_events_per_hour: 1000,
            retention_events_days: 90,
            retention_daily_rollups_days: 365,
            retention_alert_history_days: 30,
            updated_at: "2024-01-01T00:00:00Z",
            updated_by: 1,
          } as IShadowAiSettings,
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getSettingsConfig();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/shadow-ai/settings");
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Internal Server Error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getSettingsConfig()).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getSettingsConfig()).rejects.toThrow("Connection refused");
    });
  });

  describe("updateSettingsConfig", () => {
    it("should make PATCH request to /shadow-ai/settings with updates", async () => {
      const mockResponse = {
        data: {
          data: {
            id: 1,
            rate_limit_max_events_per_hour: 2000,
            retention_events_days: 180,
            retention_daily_rollups_days: 730,
            retention_alert_history_days: 60,
            updated_at: "2024-01-02T00:00:00Z",
            updated_by: 1,
          } as IShadowAiSettings,
        },
        status: 200,
        statusText: "OK",
      };

      const updates = {
        rate_limit_max_events_per_hour: 2000,
        retention_events_days: 180,
      };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const result = await updateSettingsConfig(updates);

      expect(apiServices.patch).toHaveBeenCalledTimes(1);
      expect(apiServices.patch).toHaveBeenCalledWith(
        "/shadow-ai/settings",
        updates,
      );
      expect(result).toEqual(mockResponse.data.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: "Invalid Settings" },
        },
      };

      vi.mocked(apiServices.patch).mockRejectedValue(mockError);

      await expect(
        updateSettingsConfig({ retention_events_days: -1 }),
      ).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.patch).mockRejectedValue(networkError);

      await expect(
        updateSettingsConfig({ retention_events_days: 180 }),
      ).rejects.toThrow("Network timeout");
    });
  });
});
