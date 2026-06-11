import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../utils/shadowAiInsights.utils", () => ({
  getInsightsSummaryQuery: jest.fn(),
  getToolsByEventsQuery: jest.fn(),
  getToolsByUsersQuery: jest.fn(),
  getUsersByDepartmentQuery: jest.fn(),
  getTrendQuery: jest.fn(),
  getUserActivityQuery: jest.fn(),
  getUserDetailQuery: jest.fn(),
  getDepartmentActivityQuery: jest.fn(),
}));
jest.mock("../../utils/shadowAiTools.utils", () => ({
  getAllToolsQuery: jest.fn(),
  getToolByIdQuery: jest.fn(),
  getToolDepartmentsQuery: jest.fn(),
  getToolTopUsersQuery: jest.fn(),
  updateToolStatusQuery: jest.fn(),
  linkToolToModelInventoryQuery: jest.fn(),
}));
jest.mock("../../utils/shadowAiRules.utils", () => ({
  getAllRulesQuery: jest.fn(),
  createRuleQuery: jest.fn(),
  updateRuleQuery: jest.fn(),
  deleteRuleQuery: jest.fn(),
  getAlertHistoryQuery: jest.fn(),
}));
jest.mock("../../utils/shadowAiConfig.utils", () => ({
  getSyslogConfigsQuery: jest.fn(),
  createSyslogConfigQuery: jest.fn(),
  updateSyslogConfigQuery: jest.fn(),
  deleteSyslogConfigQuery: jest.fn(),
  getSettingsQuery: jest.fn(),
  updateSettingsQuery: jest.fn(),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_req: any, error: any) => (error as Error).message),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    201: (d: any) => ({ message: "Created", data: d }),
    400: (d: any) => ({ message: "Bad Request", data: d }),
    403: (d: any) => ({ message: "Forbidden", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
  },
}));
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn<any>().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }),
    query: jest.fn<any>().mockResolvedValue([[]]),
  },
}));

import { sequelize } from "../../database/db";
import {
  createSyslogConfigQuery,
  deleteSyslogConfigQuery,
  getSettingsQuery,
  getSyslogConfigsQuery,
  updateSettingsQuery,
  updateSyslogConfigQuery,
} from "../../utils/shadowAiConfig.utils";
import {
  getDepartmentActivityQuery,
  getInsightsSummaryQuery,
  getToolsByEventsQuery,
  getToolsByUsersQuery,
  getTrendQuery,
  getUserActivityQuery,
  getUserDetailQuery,
  getUsersByDepartmentQuery,
} from "../../utils/shadowAiInsights.utils";
import {
  createRuleQuery,
  deleteRuleQuery,
  getAlertHistoryQuery,
  getAllRulesQuery,
  updateRuleQuery,
} from "../../utils/shadowAiRules.utils";
import {
  getAllToolsQuery,
  getToolByIdQuery,
  getToolDepartmentsQuery,
  getToolTopUsersQuery,
  linkToolToModelInventoryQuery,
  updateToolStatusQuery,
} from "../../utils/shadowAiTools.utils";
import {
  createRule,
  createSyslogConfig,
  deleteRule,
  deleteSyslogConfig,
  getAlertHistory,
  getDepartmentActivity,
  getInsightsSummary,
  getRules,
  getSettings,
  getSyslogConfigs,
  getToolById,
  getTools,
  getToolsByEvents,
  getToolsByUsers,
  getTrend,
  getUserDetail,
  getUsers,
  getUsersByDepartment,
  startGovernance,
  updateRule,
  updateSettings,
  updateSyslogConfig,
  updateToolStatus,
} from "../shadowAi.ctrl";

const mockGetInsightsSummary = getInsightsSummaryQuery as jest.MockedFunction<any>;
const mockGetToolsByEvents = getToolsByEventsQuery as jest.MockedFunction<any>;
const mockGetToolsByUsers = getToolsByUsersQuery as jest.MockedFunction<any>;
const mockGetUsersByDept = getUsersByDepartmentQuery as jest.MockedFunction<any>;
const mockGetTrend = getTrendQuery as jest.MockedFunction<any>;
const mockGetUserActivity = getUserActivityQuery as jest.MockedFunction<any>;
const mockGetUserDetail = getUserDetailQuery as jest.MockedFunction<any>;
const mockGetDeptActivity = getDepartmentActivityQuery as jest.MockedFunction<any>;
const mockGetAllTools = getAllToolsQuery as jest.MockedFunction<any>;
const mockGetToolById = getToolByIdQuery as jest.MockedFunction<any>;
const mockGetToolDepts = getToolDepartmentsQuery as jest.MockedFunction<any>;
const mockGetToolTopUsers = getToolTopUsersQuery as jest.MockedFunction<any>;
const mockUpdateToolStatus = updateToolStatusQuery as jest.MockedFunction<any>;
const mockLinkTool = linkToolToModelInventoryQuery as jest.MockedFunction<any>;
const mockGetAllRules = getAllRulesQuery as jest.MockedFunction<any>;
const mockCreateRule = createRuleQuery as jest.MockedFunction<any>;
const mockUpdateRule = updateRuleQuery as jest.MockedFunction<any>;
const mockDeleteRule = deleteRuleQuery as jest.MockedFunction<any>;
const mockGetAlertHistory = getAlertHistoryQuery as jest.MockedFunction<any>;
const mockGetSyslogConfigs = getSyslogConfigsQuery as jest.MockedFunction<any>;
const mockCreateSyslogConfig = createSyslogConfigQuery as jest.MockedFunction<any>;
const mockUpdateSyslogConfig = updateSyslogConfigQuery as jest.MockedFunction<any>;
const mockDeleteSyslogConfig = deleteSyslogConfigQuery as jest.MockedFunction<any>;
const mockGetSettings = getSettingsQuery as jest.MockedFunction<any>;
const mockUpdateSettings = updateSettingsQuery as jest.MockedFunction<any>;
const mockSequelizeQuery = sequelize.query as jest.MockedFunction<any>;
const mockTransaction = sequelize.transaction as jest.MockedFunction<any>;

function createReq(overrides?: Record<string, any>): any {
  return {
    userId: 1,
    organizationId: 1,
    tenantId: "t1",
    role: "Admin",
    t: (k: string) => k,
    body: {},
    params: {},
    query: {},
    file: undefined,
    headers: {},
    ...overrides,
  };
}
function createRes(): any {
  const res: any = {};
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  res.send = jest.fn<any>().mockReturnValue(res);
  res.setHeader = jest.fn<any>().mockReturnValue(res);
  res.end = jest.fn<any>().mockReturnValue(res);
  return res;
}

describe("shadowAi.ctrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getInsightsSummary", () => {
    it("should return 200 with summary using default period", async () => {
      mockGetInsightsSummary.mockResolvedValue({ total_tools: 10 });
      const req = createReq();
      const res = createRes();
      await getInsightsSummary(req, res);
      expect(mockGetInsightsSummary).toHaveBeenCalledWith("t1", 30);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 200 with summary using custom period", async () => {
      mockGetInsightsSummary.mockResolvedValue({ total_tools: 10 });
      const req = createReq({ query: { period: "60d" } });
      const res = createRes();
      await getInsightsSummary(req, res);
      expect(mockGetInsightsSummary).toHaveBeenCalledWith("t1", 60);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetInsightsSummary.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getInsightsSummary(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getToolsByEvents", () => {
    it("should return 200 with data", async () => {
      mockGetToolsByEvents.mockResolvedValue([{ name: "Tool A" }]);
      const req = createReq();
      const res = createRes();
      await getToolsByEvents(req, res);
      expect(mockGetToolsByEvents).toHaveBeenCalledWith("t1", 30, 6);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 200 with custom period and limit", async () => {
      mockGetToolsByEvents.mockResolvedValue([]);
      const req = createReq({ query: { period: "7d", limit: "10" } });
      const res = createRes();
      await getToolsByEvents(req, res);
      expect(mockGetToolsByEvents).toHaveBeenCalledWith("t1", 7, 10);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetToolsByEvents.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getToolsByEvents(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getToolsByUsers", () => {
    it("should return 200 with data", async () => {
      mockGetToolsByUsers.mockResolvedValue([{ user: "test@test.com", count: 5 }]);
      const req = createReq();
      const res = createRes();
      await getToolsByUsers(req, res);
      expect(mockGetToolsByUsers).toHaveBeenCalledWith("t1", 30, 6);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetToolsByUsers.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getToolsByUsers(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getUsersByDepartment", () => {
    it("should return 200 with data", async () => {
      mockGetUsersByDept.mockResolvedValue([{ department: "Engineering", count: 15 }]);
      const req = createReq();
      const res = createRes();
      await getUsersByDepartment(req, res);
      expect(mockGetUsersByDept).toHaveBeenCalledWith("t1", 30);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetUsersByDept.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getUsersByDepartment(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getTrend", () => {
    it("should return 200 with default granularity", async () => {
      mockGetTrend.mockResolvedValue({ daily: [] });
      const req = createReq();
      const res = createRes();
      await getTrend(req, res);
      expect(mockGetTrend).toHaveBeenCalledWith("t1", 30, "daily");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 200 with daily granularity", async () => {
      mockGetTrend.mockResolvedValue({ daily: [] });
      const req = createReq({ query: { granularity: "daily" } });
      const res = createRes();
      await getTrend(req, res);
      expect(mockGetTrend).toHaveBeenCalledWith("t1", 30, "daily");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 200 with weekly granularity", async () => {
      mockGetTrend.mockResolvedValue({ weekly: [] });
      const req = createReq({ query: { granularity: "weekly" } });
      const res = createRes();
      await getTrend(req, res);
      expect(mockGetTrend).toHaveBeenCalledWith("t1", 30, "weekly");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 200 with monthly granularity", async () => {
      mockGetTrend.mockResolvedValue({ monthly: [] });
      const req = createReq({ query: { granularity: "monthly" } });
      const res = createRes();
      await getTrend(req, res);
      expect(mockGetTrend).toHaveBeenCalledWith("t1", 30, "monthly");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should fallback to daily for invalid granularity", async () => {
      mockGetTrend.mockResolvedValue({ daily: [] });
      const req = createReq({ query: { granularity: "yearly" } });
      const res = createRes();
      await getTrend(req, res);
      expect(mockGetTrend).toHaveBeenCalledWith("t1", 30, "daily");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetTrend.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getTrend(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getUsers", () => {
    it("should return 200 with default pagination", async () => {
      mockGetUserActivity.mockResolvedValue({ users: [], total: 0 });
      const req = createReq();
      const res = createRes();
      await getUsers(req, res);
      expect(mockGetUserActivity).toHaveBeenCalledWith("t1", {
        page: 1,
        limit: 20,
        sort: undefined,
        department: undefined,
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 200 with query params", async () => {
      mockGetUserActivity.mockResolvedValue({ users: [{ email: "a@b.com" }], total: 1 });
      const req = createReq({
        query: { page: "2", limit: "10", sort: "email", department: "Engineering" },
      });
      const res = createRes();
      await getUsers(req, res);
      expect(mockGetUserActivity).toHaveBeenCalledWith("t1", {
        page: 2,
        limit: 10,
        sort: "email",
        department: "Engineering",
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetUserActivity.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getUsers(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getUserDetail", () => {
    it("should return 200 with user detail", async () => {
      mockGetUserDetail.mockResolvedValue([{ tool_name: "ChatGPT", event_count: "10" }]);
      mockSequelizeQuery.mockResolvedValue([[{ department: "Engineering" }]]);
      const req = createReq({ params: { email: "test%40example.com" }, query: { period: "30d" } });
      const res = createRes();
      await getUserDetail(req, res);
      expect(mockGetUserDetail).toHaveBeenCalledWith("t1", "test@example.com", 30);
      expect(mockSequelizeQuery).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should use Unknown department when query returns empty", async () => {
      mockGetUserDetail.mockResolvedValue([]);
      mockSequelizeQuery.mockResolvedValue([[]]);
      const req = createReq({ params: { email: "test%40example.com" } });
      const res = createRes();
      await getUserDetail(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetUserDetail.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { email: "test@test.com" } });
      const res = createRes();
      await getUserDetail(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getDepartmentActivity", () => {
    it("should return 200 with data", async () => {
      mockGetDeptActivity.mockResolvedValue([{ department: "Eng", event_count: 50 }]);
      const req = createReq();
      const res = createRes();
      await getDepartmentActivity(req, res);
      expect(mockGetDeptActivity).toHaveBeenCalledWith("t1");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetDeptActivity.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getDepartmentActivity(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getTools", () => {
    it("should return 200 with default pagination", async () => {
      mockGetAllTools.mockResolvedValue({ tools: [], total: 0 });
      const req = createReq();
      const res = createRes();
      await getTools(req, res);
      expect(mockGetAllTools).toHaveBeenCalledWith("t1", {
        status: undefined,
        sort: undefined,
        page: 1,
        limit: 20,
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 200 with status filter", async () => {
      mockGetAllTools.mockResolvedValue({ tools: [{ id: 1, status: "detected" }], total: 1 });
      const req = createReq({ query: { status: "detected", sort: "name" } });
      const res = createRes();
      await getTools(req, res);
      expect(mockGetAllTools).toHaveBeenCalledWith("t1", {
        status: "detected",
        sort: "name",
        page: 1,
        limit: 20,
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetAllTools.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getTools(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getToolById", () => {
    it("should return 400 for invalid id", async () => {
      const req = createReq({ params: { id: "abc" } });
      const res = createRes();
      await getToolById(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when tool not found", async () => {
      mockGetToolById.mockResolvedValue(null);
      const req = createReq({ params: { id: "999" } });
      const res = createRes();
      await getToolById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 with tool details", async () => {
      mockGetToolById.mockResolvedValue({ id: 1, name: "ChatGPT" });
      mockGetToolDepts.mockResolvedValue([{ department: "Engineering" }]);
      mockGetToolTopUsers.mockResolvedValue([{ email: "a@b.com", count: 5 }]);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getToolById(req, res);
      expect(mockGetToolDepts).toHaveBeenCalledWith("t1", 1);
      expect(mockGetToolTopUsers).toHaveBeenCalledWith("t1", 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetToolById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getToolById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateToolStatus", () => {
    it("should return 403 for non-write role", async () => {
      const req = createReq({ role: "Auditor", params: { id: "1" }, body: { status: "approved" } });
      const res = createRes();
      await updateToolStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 400 for invalid id", async () => {
      const req = createReq({ params: { id: "abc" }, body: { status: "approved" } });
      const res = createRes();
      await updateToolStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 for invalid status", async () => {
      const req = createReq({ params: { id: "1" }, body: { status: "invalid" } });
      const res = createRes();
      await updateToolStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when tool not found", async () => {
      mockUpdateToolStatus.mockResolvedValue(null);
      const req = createReq({ params: { id: "1" }, body: { status: "approved" } });
      const res = createRes();
      await updateToolStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 on success", async () => {
      mockUpdateToolStatus.mockResolvedValue({ id: 1, status: "approved" });
      const req = createReq({ params: { id: "1" }, body: { status: "approved" } });
      const res = createRes();
      await updateToolStatus(req, res);
      expect(mockUpdateToolStatus).toHaveBeenCalledWith("t1", 1, "approved");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockUpdateToolStatus.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" }, body: { status: "approved" } });
      const res = createRes();
      await updateToolStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("startGovernance", () => {
    it("should return 403 for non-write role", async () => {
      const req = createReq({ role: "Auditor", params: { id: "1" }, body: {} });
      const res = createRes();
      await startGovernance(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 400 for invalid id", async () => {
      const req = createReq({ params: { id: "abc" }, body: {} });
      const res = createRes();
      await startGovernance(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when tool not found", async () => {
      mockGetToolById.mockResolvedValue(null);
      const req = createReq({ params: { id: "1" }, body: {} });
      const res = createRes();
      await startGovernance(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 400 when required fields missing", async () => {
      mockGetToolById.mockResolvedValue({ id: 1 });
      const req = createReq({
        params: { id: "1" },
        body: { model_inventory: { provider: "OpenAI" } },
      });
      const res = createRes();
      await startGovernance(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when governance_owner_id is not a positive integer", async () => {
      mockGetToolById.mockResolvedValue({ id: 1 });
      const req = createReq({
        params: { id: "1" },
        body: {
          model_inventory: { provider: "OpenAI", model: "GPT-4" },
          governance_owner_id: "abc",
        },
      });
      const res = createRes();
      await startGovernance(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 201 on success", async () => {
      mockGetToolById.mockResolvedValue({ id: 1, name: "ChatGPT" });
      mockLinkTool.mockResolvedValue(undefined);
      mockSequelizeQuery
        .mockResolvedValueOnce([[{ id: 10 }]]) // INSERT INTO model_inventories RETURNING id
        .mockResolvedValueOnce(undefined); // UPDATE shadow_ai_tools
      const req = createReq({
        params: { id: "1" },
        body: {
          model_inventory: {
            provider: "OpenAI",
            model: "GPT-4",
            version: "1.0",
            status: "Pending",
          },
          governance_owner_id: "2",
        },
      });
      const res = createRes();
      await startGovernance(req, res);
      expect(mockLinkTool).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should return 201 with lifecycle initialization", async () => {
      mockGetToolById.mockResolvedValue({ id: 1, name: "ChatGPT" });
      mockLinkTool.mockResolvedValue(undefined);
      mockSequelizeQuery
        .mockResolvedValueOnce([[{ id: 10 }]]) // INSERT INTO model_inventories RETURNING id
        .mockResolvedValueOnce(undefined) // UPDATE shadow_ai_tools
        .mockResolvedValueOnce(undefined) // SAVEPOINT lifecycle_init
        .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]) // SELECT active lifecycle items
        .mockResolvedValueOnce(undefined) // INSERT INTO model_lifecycle_values
        .mockResolvedValueOnce(undefined); // RELEASE SAVEPOINT lifecycle_init
      const req = createReq({
        params: { id: "1" },
        body: {
          model_inventory: { provider: "OpenAI", model: "GPT-4" },
          governance_owner_id: "2",
          start_lifecycle: true,
        },
      });
      const res = createRes();
      await startGovernance(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should return 500 on error", async () => {
      mockGetToolById.mockRejectedValue(new Error("DB error"));
      const req = createReq({
        params: { id: "1" },
        body: {
          model_inventory: { provider: "OpenAI", model: "GPT-4" },
          governance_owner_id: "2",
        },
      });
      const res = createRes();
      await startGovernance(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getRules", () => {
    it("should return 200 with rules", async () => {
      mockGetAllRules.mockResolvedValue([{ id: 1, name: "Rule 1" }]);
      const req = createReq();
      const res = createRes();
      await getRules(req, res);
      expect(mockGetAllRules).toHaveBeenCalledWith("t1");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetAllRules.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getRules(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("createRule", () => {
    it("should return 403 for non-write role", async () => {
      const req = createReq({ role: "Auditor", body: { name: "Rule 1" } });
      const res = createRes();
      await createRule(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 400 when required fields missing", async () => {
      const req = createReq({ body: { name: "Rule 1" } });
      const res = createRes();
      await createRule(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 201 on success", async () => {
      mockCreateRule.mockResolvedValue({ id: 1, name: "Rule 1" });
      const req = createReq({
        body: {
          name: "Rule 1",
          description: "desc",
          trigger_type: "threshold",
          actions: ["notify"],
          trigger_config: { threshold: 100 },
          cooldown_minutes: 60,
          is_active: true,
          notification_user_ids: [1, 2],
        },
      });
      const res = createRes();
      await createRule(req, res);
      expect(mockCreateRule).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should return 500 on error", async () => {
      mockCreateRule.mockRejectedValue(new Error("DB error"));
      const req = createReq({
        body: { name: "Rule 1", trigger_type: "threshold", actions: ["notify"] },
      });
      const res = createRes();
      await createRule(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateRule", () => {
    it("should return 403 for non-write role", async () => {
      const req = createReq({ role: "Auditor", params: { id: "1" } });
      const res = createRes();
      await updateRule(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 400 for invalid id", async () => {
      const req = createReq({ params: { id: "abc" } });
      const res = createRes();
      await updateRule(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when rule not found", async () => {
      mockUpdateRule.mockResolvedValue(null);
      const req = createReq({ params: { id: "999" } });
      const res = createRes();
      await updateRule(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 on success", async () => {
      mockUpdateRule.mockResolvedValue({ id: 1, name: "Updated" });
      const req = createReq({ params: { id: "1" }, body: { name: "Updated" } });
      const res = createRes();
      await updateRule(req, res);
      expect(mockUpdateRule).toHaveBeenCalledWith("t1", 1, { name: "Updated" });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockUpdateRule.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await updateRule(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("deleteRule", () => {
    it("should return 403 for non-write role", async () => {
      const req = createReq({ role: "Auditor", params: { id: "1" } });
      const res = createRes();
      await deleteRule(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 400 for invalid id", async () => {
      const req = createReq({ params: { id: "abc" } });
      const res = createRes();
      await deleteRule(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when rule not found", async () => {
      mockDeleteRule.mockResolvedValue(null);
      const req = createReq({ params: { id: "999" } });
      const res = createRes();
      await deleteRule(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 on success", async () => {
      mockDeleteRule.mockResolvedValue(true);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteRule(req, res);
      expect(mockDeleteRule).toHaveBeenCalledWith("t1", 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockDeleteRule.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteRule(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getAlertHistory", () => {
    it("should return 200 with default pagination", async () => {
      mockGetAlertHistory.mockResolvedValue({ alerts: [], total: 0 });
      const req = createReq();
      const res = createRes();
      await getAlertHistory(req, res);
      expect(mockGetAlertHistory).toHaveBeenCalledWith("t1", {
        page: 1,
        limit: 20,
        ruleId: undefined,
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 200 with ruleId filter", async () => {
      mockGetAlertHistory.mockResolvedValue({ alerts: [{ id: 1 }], total: 1 });
      const req = createReq({ query: { ruleId: "5", page: "2", limit: "10" } });
      const res = createRes();
      await getAlertHistory(req, res);
      expect(mockGetAlertHistory).toHaveBeenCalledWith("t1", { page: 2, limit: 10, ruleId: 5 });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetAlertHistory.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getAlertHistory(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getSyslogConfigs", () => {
    it("should return 403 for non-admin", async () => {
      const req = createReq({ role: "Editor" });
      const res = createRes();
      await getSyslogConfigs(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 200 for admin", async () => {
      mockGetSyslogConfigs.mockResolvedValue([{ id: 1, source_identifier: "fw-01" }]);
      const req = createReq();
      const res = createRes();
      await getSyslogConfigs(req, res);
      expect(mockGetSyslogConfigs).toHaveBeenCalledWith("t1");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 200 for super admin", async () => {
      mockGetSyslogConfigs.mockResolvedValue([]);
      const req = createReq({ role: "SuperAdmin" });
      const res = createRes();
      await getSyslogConfigs(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetSyslogConfigs.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getSyslogConfigs(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("createSyslogConfig", () => {
    it("should return 403 for non-admin", async () => {
      const req = createReq({
        role: "Editor",
        body: { source_identifier: "fw-01", parser_type: "zscaler" },
      });
      const res = createRes();
      await createSyslogConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 400 when required fields missing", async () => {
      const req = createReq({ body: { source_identifier: "fw-01" } });
      const res = createRes();
      await createSyslogConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 for invalid parser_type", async () => {
      const req = createReq({ body: { source_identifier: "fw-01", parser_type: "invalid" } });
      const res = createRes();
      await createSyslogConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 201 on success", async () => {
      mockCreateSyslogConfig.mockResolvedValue({
        id: 1,
        source_identifier: "fw-01",
        parser_type: "zscaler",
      });
      const req = createReq({
        body: { source_identifier: "fw-01", parser_type: "zscaler", is_active: true },
      });
      const res = createRes();
      await createSyslogConfig(req, res);
      expect(mockCreateSyslogConfig).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should return 500 on error", async () => {
      mockCreateSyslogConfig.mockRejectedValue(new Error("DB error"));
      const req = createReq({ body: { source_identifier: "fw-01", parser_type: "zscaler" } });
      const res = createRes();
      await createSyslogConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateSyslogConfig", () => {
    it("should return 403 for non-admin", async () => {
      const req = createReq({ role: "Editor", params: { id: "1" } });
      const res = createRes();
      await updateSyslogConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 400 for invalid id", async () => {
      const req = createReq({ params: { id: "abc" } });
      const res = createRes();
      await updateSyslogConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 for invalid parser_type", async () => {
      const req = createReq({
        params: { id: "1" },
        body: { parser_type: "invalid" },
      });
      const res = createRes();
      await updateSyslogConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when config not found", async () => {
      mockUpdateSyslogConfig.mockResolvedValue(null);
      const req = createReq({ params: { id: "1" }, body: { source_identifier: "fw-01" } });
      const res = createRes();
      await updateSyslogConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 on success", async () => {
      mockUpdateSyslogConfig.mockResolvedValue({ id: 1, source_identifier: "fw-01-updated" });
      const req = createReq({ params: { id: "1" }, body: { source_identifier: "fw-01-updated" } });
      const res = createRes();
      await updateSyslogConfig(req, res);
      expect(mockUpdateSyslogConfig).toHaveBeenCalledWith("t1", 1, {
        source_identifier: "fw-01-updated",
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockUpdateSyslogConfig.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" }, body: {} });
      const res = createRes();
      await updateSyslogConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("deleteSyslogConfig", () => {
    it("should return 403 for non-admin", async () => {
      const req = createReq({ role: "Editor", params: { id: "1" } });
      const res = createRes();
      await deleteSyslogConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 400 for invalid id", async () => {
      const req = createReq({ params: { id: "abc" } });
      const res = createRes();
      await deleteSyslogConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when config not found", async () => {
      mockDeleteSyslogConfig.mockResolvedValue(null);
      const req = createReq({ params: { id: "999" } });
      const res = createRes();
      await deleteSyslogConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 on success", async () => {
      mockDeleteSyslogConfig.mockResolvedValue(true);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteSyslogConfig(req, res);
      expect(mockDeleteSyslogConfig).toHaveBeenCalledWith("t1", 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockDeleteSyslogConfig.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteSyslogConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getSettings", () => {
    it("should return 200 with settings", async () => {
      mockGetSettings.mockResolvedValue({ rate_limit_max_events_per_hour: 1000 });
      const req = createReq();
      const res = createRes();
      await getSettings(req, res);
      expect(mockGetSettings).toHaveBeenCalledWith("t1");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetSettings.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getSettings(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateSettings", () => {
    it("should return 403 for non-admin", async () => {
      const req = createReq({ role: "Editor" });
      const res = createRes();
      await updateSettings(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 200 on success", async () => {
      mockUpdateSettings.mockResolvedValue({ rate_limit_max_events_per_hour: 2000 });
      const req = createReq({
        body: {
          rate_limit_max_events_per_hour: 2000,
          retention_events_days: 90,
          retention_daily_rollups_days: 365,
          retention_alert_history_days: 30,
        },
      });
      const res = createRes();
      await updateSettings(req, res);
      expect(mockUpdateSettings).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockUpdateSettings.mockRejectedValue(new Error("DB error"));
      const req = createReq({ body: {} });
      const res = createRes();
      await updateSettings(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
