import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../utils/postMarketMonitoring.utils", () => ({
  getPMMConfigByProjectIdQuery: jest.fn(),
  createPMMConfigQuery: jest.fn(),
  updatePMMConfigQuery: jest.fn(),
  deletePMMConfigQuery: jest.fn(),
  getPMMQuestionsQuery: jest.fn(),
  addPMMQuestionQuery: jest.fn(),
  updatePMMQuestionQuery: jest.fn(),
  deletePMMQuestionQuery: jest.fn(),
  reorderPMMQuestionsQuery: jest.fn(),
  getActiveCycleByProjectIdQuery: jest.fn(),
  getCycleByIdQuery: jest.fn(),
  savePMMResponsesQuery: jest.fn(),
  completeCycleQuery: jest.fn(),
  getPMMResponsesQuery: jest.fn(),
  getPMMReportsQuery: jest.fn(),
  getContextSnapshotQuery: jest.fn(),
  createPMMReportQuery: jest.fn(),
  getLatestCycleNumberQuery: jest.fn(),
  createPMMCycleQuery: jest.fn(),
  getAssignedStakeholderQuery: jest.fn(),
}));
jest.mock("../../services/postMarketMonitoring/defaultQuestions", () => ({
  seedDefaultQuestions: jest.fn(),
}));
jest.mock("../../services/postMarketMonitoring/pmmPdfGenerator", () => ({
  buildPMMReportData: jest.fn(),
  generateAndUploadPMMReport: jest.fn(),
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
    404: (d: any) => ({ message: "Not Found", data: d }),
    409: (d: any) => ({ message: "Conflict", data: d }),
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
import { seedDefaultQuestions } from "../../services/postMarketMonitoring/defaultQuestions";
import {
  buildPMMReportData,
  generateAndUploadPMMReport,
} from "../../services/postMarketMonitoring/pmmPdfGenerator";
import {
  addPMMQuestionQuery,
  completeCycleQuery,
  createPMMConfigQuery,
  createPMMCycleQuery,
  createPMMReportQuery,
  deletePMMConfigQuery,
  deletePMMQuestionQuery,
  getActiveCycleByProjectIdQuery,
  getAssignedStakeholderQuery,
  getContextSnapshotQuery,
  getCycleByIdQuery,
  getLatestCycleNumberQuery,
  getPMMConfigByProjectIdQuery,
  getPMMQuestionsQuery,
  getPMMReportsQuery,
  getPMMResponsesQuery,
  reorderPMMQuestionsQuery,
  savePMMResponsesQuery,
  updatePMMConfigQuery,
  updatePMMQuestionQuery,
} from "../../utils/postMarketMonitoring.utils";
import {
  addQuestion,
  createConfig,
  deleteConfig,
  deleteQuestion,
  downloadReport,
  flagConcern,
  getActiveCycle,
  getConfigByProjectId,
  getCycleById,
  getQuestions,
  getReports,
  getResponses,
  reassignStakeholder,
  reorderQuestions,
  saveResponses,
  startNewCycle,
  submitCycle,
  updateConfig,
  updateQuestion,
} from "../postMarketMonitoring.ctrl";

const mockGetConfig = getPMMConfigByProjectIdQuery as jest.MockedFunction<any>;
const mockCreateConfig = createPMMConfigQuery as jest.MockedFunction<any>;
const mockUpdateConfig = updatePMMConfigQuery as jest.MockedFunction<any>;
const mockDeleteConfig = deletePMMConfigQuery as jest.MockedFunction<any>;
const mockGetQuestions = getPMMQuestionsQuery as jest.MockedFunction<any>;
const mockAddQuestion = addPMMQuestionQuery as jest.MockedFunction<any>;
const mockUpdateQuestion = updatePMMQuestionQuery as jest.MockedFunction<any>;
const mockDeleteQuestion = deletePMMQuestionQuery as jest.MockedFunction<any>;
const mockReorderQuestions = reorderPMMQuestionsQuery as jest.MockedFunction<any>;
const mockGetActiveCycle = getActiveCycleByProjectIdQuery as jest.MockedFunction<any>;
const mockGetCycleById = getCycleByIdQuery as jest.MockedFunction<any>;
const mockSaveResponses = savePMMResponsesQuery as jest.MockedFunction<any>;
const mockCompleteCycle = completeCycleQuery as jest.MockedFunction<any>;
const mockGetResponses = getPMMResponsesQuery as jest.MockedFunction<any>;
const mockGetReports = getPMMReportsQuery as jest.MockedFunction<any>;
const mockGetContextSnapshot = getContextSnapshotQuery as jest.MockedFunction<any>;
const mockCreateReport = createPMMReportQuery as jest.MockedFunction<any>;
const mockGetLatestCycleNumber = getLatestCycleNumberQuery as jest.MockedFunction<any>;
const mockCreateCycle = createPMMCycleQuery as jest.MockedFunction<any>;
const mockGetStakeholder = getAssignedStakeholderQuery as jest.MockedFunction<any>;
const mockSeedDefaults = seedDefaultQuestions as jest.MockedFunction<any>;
const mockBuildReportData = buildPMMReportData as jest.MockedFunction<any>;
const mockGenerateReport = generateAndUploadPMMReport as jest.MockedFunction<any>;
const mockSequelizeQuery = sequelize.query as jest.MockedFunction<any>;
const mockTransaction = sequelize.transaction as jest.MockedFunction<any>;

function createReq(overrides?: Record<string, any>): any {
  return {
    userId: 1,
    organizationId: 1,
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
  res.redirect = jest.fn<any>().mockReturnValue(res);
  return res;
}

describe("postMarketMonitoring.ctrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getConfigByProjectId", () => {
    it("should return 400 for invalid project id", async () => {
      const req = createReq({ params: { projectId: "abc" } });
      const res = createRes();
      await getConfigByProjectId(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when config not found", async () => {
      mockGetConfig.mockResolvedValue(null);
      const req = createReq({ params: { projectId: "1" } });
      const res = createRes();
      await getConfigByProjectId(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 with config", async () => {
      mockGetConfig.mockResolvedValue({ id: 1, project_id: 1 });
      const req = createReq({ params: { projectId: "1" } });
      const res = createRes();
      await getConfigByProjectId(req, res);
      expect(mockGetConfig).toHaveBeenCalledWith(1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetConfig.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { projectId: "1" } });
      const res = createRes();
      await getConfigByProjectId(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("createConfig", () => {
    it("should return 400 when project_id missing", async () => {
      const req = createReq({ body: {} });
      const res = createRes();
      await createConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 409 when config already exists", async () => {
      mockGetConfig.mockResolvedValue({ id: 1 });
      const req = createReq({ body: { project_id: 1 } });
      const res = createRes();
      await createConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it("should return 201 on success", async () => {
      mockGetConfig.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 1, project_id: 1 });
      mockCreateConfig.mockResolvedValue({ id: 1 });
      const req = createReq({ body: { project_id: 1 } });
      const res = createRes();
      await createConfig(req, res);
      expect(mockCreateConfig).toHaveBeenCalled();
      expect(mockSeedDefaults).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should return 500 on error", async () => {
      mockGetConfig.mockResolvedValue(null);
      mockCreateConfig.mockRejectedValue(new Error("DB error"));
      const req = createReq({ body: { project_id: 1 } });
      const res = createRes();
      await createConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateConfig", () => {
    it("should return 400 for invalid config id", async () => {
      const req = createReq({ params: { configId: "abc" } });
      const res = createRes();
      await updateConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when config not found", async () => {
      mockUpdateConfig.mockResolvedValue(null);
      const req = createReq({ params: { configId: "1" }, body: {} });
      const res = createRes();
      await updateConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 on success", async () => {
      mockUpdateConfig.mockResolvedValue({ id: 1, is_active: true });
      const req = createReq({ params: { configId: "1" }, body: { is_active: false } });
      const res = createRes();
      await updateConfig(req, res);
      expect(mockUpdateConfig).toHaveBeenCalledWith(1, { is_active: false }, 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockUpdateConfig.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { configId: "1" }, body: {} });
      const res = createRes();
      await updateConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("deleteConfig", () => {
    it("should return 400 for invalid config id", async () => {
      const req = createReq({ params: { configId: "abc" } });
      const res = createRes();
      await deleteConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when config not found", async () => {
      mockDeleteConfig.mockResolvedValue(null);
      const req = createReq({ params: { configId: "1" } });
      const res = createRes();
      await deleteConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 on success", async () => {
      mockDeleteConfig.mockResolvedValue(true);
      const req = createReq({ params: { configId: "1" } });
      const res = createRes();
      await deleteConfig(req, res);
      expect(mockDeleteConfig).toHaveBeenCalledWith(1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockDeleteConfig.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { configId: "1" } });
      const res = createRes();
      await deleteConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getQuestions", () => {
    it("should return 200 with questions using configId", async () => {
      mockGetQuestions.mockResolvedValue([{ id: 1, question_text: "Q1" }]);
      const req = createReq({ params: { configId: "1" } });
      const res = createRes();
      await getQuestions(req, res);
      expect(mockGetQuestions).toHaveBeenCalledWith(1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 200 with questions without configId", async () => {
      mockGetQuestions.mockResolvedValue([]);
      const req = createReq();
      const res = createRes();
      await getQuestions(req, res);
      expect(mockGetQuestions).toHaveBeenCalledWith(null, 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetQuestions.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getQuestions(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("addQuestion", () => {
    it("should return 400 when required fields missing", async () => {
      const req = createReq({ body: { question_text: "Q?" } });
      const res = createRes();
      await addQuestion(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 for invalid question type", async () => {
      const req = createReq({ body: { question_text: "Q?", question_type: "invalid" } });
      const res = createRes();
      await addQuestion(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 201 on success", async () => {
      mockAddQuestion.mockResolvedValue({ id: 1, question_text: "Q?" });
      const req = createReq({ body: { question_text: "Q?", question_type: "yes_no" } });
      const res = createRes();
      await addQuestion(req, res);
      expect(mockAddQuestion).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should return 500 on error", async () => {
      mockAddQuestion.mockRejectedValue(new Error("DB error"));
      const req = createReq({ body: { question_text: "Q?", question_type: "yes_no" } });
      const res = createRes();
      await addQuestion(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateQuestion", () => {
    it("should return 400 for invalid question id", async () => {
      const req = createReq({ params: { questionId: "abc" } });
      const res = createRes();
      await updateQuestion(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 for invalid question type", async () => {
      const req = createReq({ params: { questionId: "1" }, body: { question_type: "invalid" } });
      const res = createRes();
      await updateQuestion(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when question not found", async () => {
      mockUpdateQuestion.mockResolvedValue(null);
      const req = createReq({ params: { questionId: "999" }, body: { question_text: "Updated" } });
      const res = createRes();
      await updateQuestion(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 on success", async () => {
      mockUpdateQuestion.mockResolvedValue({ id: 1, question_text: "Updated" });
      const req = createReq({ params: { questionId: "1" }, body: { question_text: "Updated" } });
      const res = createRes();
      await updateQuestion(req, res);
      expect(mockUpdateQuestion).toHaveBeenCalledWith(1, { question_text: "Updated" }, 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockUpdateQuestion.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { questionId: "1" }, body: {} });
      const res = createRes();
      await updateQuestion(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("deleteQuestion", () => {
    it("should return 400 for invalid question id", async () => {
      const req = createReq({ params: { questionId: "abc" } });
      const res = createRes();
      await deleteQuestion(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when question not found", async () => {
      mockDeleteQuestion.mockResolvedValue(null);
      const req = createReq({ params: { questionId: "999" } });
      const res = createRes();
      await deleteQuestion(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 on success", async () => {
      mockDeleteQuestion.mockResolvedValue(true);
      const req = createReq({ params: { questionId: "1" } });
      const res = createRes();
      await deleteQuestion(req, res);
      expect(mockDeleteQuestion).toHaveBeenCalledWith(1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockDeleteQuestion.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { questionId: "1" } });
      const res = createRes();
      await deleteQuestion(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("reorderQuestions", () => {
    it("should return 400 when orders missing", async () => {
      const req = createReq({ body: {} });
      const res = createRes();
      await reorderQuestions(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when orders is empty", async () => {
      const req = createReq({ body: { orders: [] } });
      const res = createRes();
      await reorderQuestions(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when order item has invalid fields", async () => {
      const req = createReq({
        body: { orders: [{ id: "abc", display_order: 1 }] },
      });
      const res = createRes();
      await reorderQuestions(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 200 on success", async () => {
      const req = createReq({
        body: {
          orders: [
            { id: 1, display_order: 2 },
            { id: 2, display_order: 1 },
          ],
        },
      });
      const res = createRes();
      await reorderQuestions(req, res);
      expect(mockReorderQuestions).toHaveBeenCalledWith(
        [
          { id: 1, display_order: 2 },
          { id: 2, display_order: 1 },
        ],
        1,
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockReorderQuestions.mockRejectedValue(new Error("DB error"));
      const req = createReq({
        body: { orders: [{ id: 1, display_order: 1 }] },
      });
      const res = createRes();
      await reorderQuestions(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getActiveCycle", () => {
    it("should return 400 for invalid project id", async () => {
      const req = createReq({ params: { projectId: "abc" } });
      const res = createRes();
      await getActiveCycle(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when no active cycle", async () => {
      mockGetActiveCycle.mockResolvedValue(null);
      const req = createReq({ params: { projectId: "1" } });
      const res = createRes();
      await getActiveCycle(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 with active cycle", async () => {
      mockGetActiveCycle.mockResolvedValue({ id: 1, status: "active" });
      const req = createReq({ params: { projectId: "1" } });
      const res = createRes();
      await getActiveCycle(req, res);
      expect(mockGetActiveCycle).toHaveBeenCalledWith(1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetActiveCycle.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { projectId: "1" } });
      const res = createRes();
      await getActiveCycle(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getCycleById", () => {
    it("should return 400 for invalid cycle id", async () => {
      const req = createReq({ params: { cycleId: "abc" } });
      const res = createRes();
      await getCycleById(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when cycle not found", async () => {
      mockGetCycleById.mockResolvedValue(null);
      const req = createReq({ params: { cycleId: "999" } });
      const res = createRes();
      await getCycleById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 with cycle", async () => {
      mockGetCycleById.mockResolvedValue({ id: 1, status: "active" });
      const req = createReq({ params: { cycleId: "1" } });
      const res = createRes();
      await getCycleById(req, res);
      expect(mockGetCycleById).toHaveBeenCalledWith(1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetCycleById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { cycleId: "1" } });
      const res = createRes();
      await getCycleById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getResponses", () => {
    it("should return 400 for invalid cycle id", async () => {
      const req = createReq({ params: { cycleId: "abc" } });
      const res = createRes();
      await getResponses(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when cycle not found", async () => {
      mockGetCycleById.mockResolvedValue(null);
      const req = createReq({ params: { cycleId: "999" } });
      const res = createRes();
      await getResponses(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 with responses", async () => {
      mockGetCycleById.mockResolvedValue({ id: 1 });
      mockGetResponses.mockResolvedValue([{ question_id: 1, response_value: "Yes" }]);
      const req = createReq({ params: { cycleId: "1" } });
      const res = createRes();
      await getResponses(req, res);
      expect(mockGetResponses).toHaveBeenCalledWith(1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetCycleById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { cycleId: "1" } });
      const res = createRes();
      await getResponses(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("saveResponses", () => {
    it("should return 400 for invalid cycle id", async () => {
      const req = createReq({ params: { cycleId: "abc" } });
      const res = createRes();
      await saveResponses(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when responses missing", async () => {
      const req = createReq({ params: { cycleId: "1" }, body: {} });
      const res = createRes();
      await saveResponses(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when responses is empty", async () => {
      const req = createReq({ params: { cycleId: "1" }, body: { responses: [] } });
      const res = createRes();
      await saveResponses(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when cycle not found", async () => {
      mockGetCycleById.mockResolvedValue(null);
      const req = createReq({
        params: { cycleId: "999" },
        body: { responses: [{ question_id: 1, response_value: "Yes" }] },
      });
      const res = createRes();
      await saveResponses(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 409 when cycle is completed", async () => {
      mockGetCycleById.mockResolvedValue({ id: 1, status: "completed" });
      const req = createReq({
        params: { cycleId: "1" },
        body: { responses: [{ question_id: 1, response_value: "Yes" }] },
      });
      const res = createRes();
      await saveResponses(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it("should return 200 on success", async () => {
      mockGetCycleById.mockResolvedValue({ id: 1, status: "active" });
      mockSaveResponses.mockResolvedValue([{ question_id: 1, response_value: "Yes" }]);
      const req = createReq({
        params: { cycleId: "1" },
        body: { responses: [{ question_id: 1, response_value: "Yes" }] },
      });
      const res = createRes();
      await saveResponses(req, res);
      expect(mockSaveResponses).toHaveBeenCalledWith(
        1,
        [{ question_id: 1, response_value: "Yes" }],
        1,
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetCycleById.mockRejectedValue(new Error("DB error"));
      const req = createReq({
        params: { cycleId: "1" },
        body: { responses: [{ question_id: 1, response_value: "Yes" }] },
      });
      const res = createRes();
      await saveResponses(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("submitCycle", () => {
    it("should return 400 for invalid cycle id", async () => {
      const req = createReq({ params: { cycleId: "abc" } });
      const res = createRes();
      await submitCycle(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when cycle not found", async () => {
      mockGetCycleById.mockResolvedValue(null);
      const req = createReq({ params: { cycleId: "999" }, body: {} });
      const res = createRes();
      await submitCycle(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 409 when cycle is completed", async () => {
      mockGetCycleById.mockResolvedValue({ id: 1, status: "completed" });
      const req = createReq({ params: { cycleId: "1" }, body: {} });
      const res = createRes();
      await submitCycle(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it("should return 200 on success", async () => {
      const cycle = {
        id: 1,
        status: "active",
        project_id: 1,
        project_title: "Test Project",
        cycle_number: 2,
      };
      mockGetCycleById.mockResolvedValue(cycle);
      mockSaveResponses.mockResolvedValue(undefined);
      mockCompleteCycle.mockResolvedValue(undefined);
      mockGetContextSnapshot.mockResolvedValue({ summary: "ok" });
      mockGetResponses.mockResolvedValue([{ question_id: 1, response_value: "Yes" }]);
      mockSequelizeQuery
        .mockResolvedValueOnce([[{ name: "John", surname: "Doe" }]]) // user query
        .mockResolvedValueOnce([[{ name: "Acme Corp" }]]); // org query
      mockBuildReportData.mockReturnValue({ report: "data" });
      mockGenerateReport.mockResolvedValue({ success: true, fileId: 10, filename: "report.pdf" });
      mockCreateReport.mockResolvedValue(undefined);
      const req = createReq({
        params: { cycleId: "1" },
        body: { responses: [{ question_id: 1, response_value: "Yes" }] },
      });
      const res = createRes();
      await submitCycle(req, res);
      expect(mockCompleteCycle).toHaveBeenCalledWith(1, 1, 1, expect.any(Object));
      expect(mockGenerateReport).toHaveBeenCalled();
      expect(mockCreateReport).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 200 on success without responses", async () => {
      const cycle = {
        id: 1,
        status: "active",
        project_id: 1,
        project_title: "Test Project",
        cycle_number: 2,
      };
      mockGetCycleById.mockResolvedValue(cycle);
      mockCompleteCycle.mockResolvedValue(undefined);
      mockGetContextSnapshot.mockResolvedValue({ summary: "ok" });
      mockGetResponses.mockResolvedValue([]);
      mockSequelizeQuery
        .mockResolvedValueOnce([[{ name: "John", surname: "Doe" }]])
        .mockResolvedValueOnce([[{ name: "Acme Corp" }]]);
      mockBuildReportData.mockReturnValue({ report: "data" });
      mockGenerateReport.mockResolvedValue({ success: true, fileId: 10, filename: "report.pdf" });
      mockCreateReport.mockResolvedValue(undefined);
      const req = createReq({ params: { cycleId: "1" }, body: {} });
      const res = createRes();
      await submitCycle(req, res);
      expect(mockSaveResponses).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetCycleById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { cycleId: "1" }, body: {} });
      const res = createRes();
      await submitCycle(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("flagConcern", () => {
    it("should return 400 for invalid cycle id", async () => {
      const req = createReq({ params: { cycleId: "abc" } });
      const res = createRes();
      await flagConcern(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when question_id missing", async () => {
      const req = createReq({ params: { cycleId: "1" }, body: {} });
      const res = createRes();
      await flagConcern(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when cycle not found", async () => {
      mockGetCycleById.mockResolvedValue(null);
      const req = createReq({
        params: { cycleId: "999" },
        body: { question_id: 1, response_value: "No" },
      });
      const res = createRes();
      await flagConcern(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 on success", async () => {
      mockGetCycleById.mockResolvedValue({ id: 1 });
      const req = createReq({
        params: { cycleId: "1" },
        body: { question_id: 1, response_value: "No" },
      });
      const res = createRes();
      await flagConcern(req, res);
      expect(mockSaveResponses).toHaveBeenCalledWith(
        1,
        [{ question_id: 1, response_value: "No", is_flagged: true }],
        1,
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetCycleById.mockRejectedValue(new Error("DB error"));
      const req = createReq({
        params: { cycleId: "1" },
        body: { question_id: 1 },
      });
      const res = createRes();
      await flagConcern(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getReports", () => {
    it("should return 200 with default filters", async () => {
      mockGetReports.mockResolvedValue({ reports: [], total: 0 });
      const req = createReq();
      const res = createRes();
      await getReports(req, res);
      expect(mockGetReports).toHaveBeenCalledWith(
        {
          projectId: undefined,
          startDate: undefined,
          endDate: undefined,
          completedBy: undefined,
          flaggedOnly: false,
          page: 1,
          limit: 10,
        },
        1,
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 200 with custom filters", async () => {
      mockGetReports.mockResolvedValue({ reports: [{ id: 1 }], total: 1 });
      const req = createReq({
        query: {
          project_id: "1",
          start_date: "2024-01-01",
          end_date: "2024-12-31",
          completed_by: "2",
          flagged_only: "true",
          page: "2",
          limit: "5",
        },
      });
      const res = createRes();
      await getReports(req, res);
      expect(mockGetReports).toHaveBeenCalledWith(
        {
          projectId: 1,
          startDate: "2024-01-01",
          endDate: "2024-12-31",
          completedBy: 2,
          flaggedOnly: true,
          page: 2,
          limit: 5,
        },
        1,
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should clamp invalid pagination values", async () => {
      mockGetReports.mockResolvedValue({ reports: [], total: 0 });
      const req = createReq({ query: { page: "0", limit: "200" } });
      const res = createRes();
      await getReports(req, res);
      expect(mockGetReports).toHaveBeenCalledWith(
        expect.objectContaining({ page: 0, limit: 10 }),
        1,
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetReports.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getReports(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("downloadReport", () => {
    it("should return 400 for invalid report id", async () => {
      const req = createReq({ params: { reportId: "abc" } });
      const res = createRes();
      await downloadReport(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when report not found", async () => {
      mockSequelizeQuery.mockResolvedValue([[]]);
      const req = createReq({ params: { reportId: "999" } });
      const res = createRes();
      await downloadReport(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 404 when report has no file_id", async () => {
      mockSequelizeQuery.mockResolvedValue([[{ id: 1, file_id: null }]]);
      const req = createReq({ params: { reportId: "1" } });
      const res = createRes();
      await downloadReport(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should redirect to file download on success", async () => {
      mockSequelizeQuery.mockResolvedValue([[{ id: 1, file_id: 5 }]]);
      const req = createReq({ params: { reportId: "1" } });
      const res = createRes();
      await downloadReport(req, res);
      expect(res.redirect).toHaveBeenCalledWith("/api/files/5/download");
    });

    it("should return 500 on error", async () => {
      mockSequelizeQuery.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { reportId: "1" } });
      const res = createRes();
      await downloadReport(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("reassignStakeholder", () => {
    it("should return 400 for invalid cycle id", async () => {
      const req = createReq({ params: { cycleId: "abc" } });
      const res = createRes();
      await reassignStakeholder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when stakeholder_id missing", async () => {
      const req = createReq({ params: { cycleId: "1" }, body: {} });
      const res = createRes();
      await reassignStakeholder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when stakeholder_id is not a number", async () => {
      const req = createReq({ params: { cycleId: "1" }, body: { stakeholder_id: "abc" } });
      const res = createRes();
      await reassignStakeholder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when cycle not found", async () => {
      mockGetCycleById.mockResolvedValue(null);
      const req = createReq({ params: { cycleId: "999" }, body: { stakeholder_id: 2 } });
      const res = createRes();
      await reassignStakeholder(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 on success", async () => {
      mockGetCycleById.mockResolvedValue({ id: 1 });
      mockSequelizeQuery.mockResolvedValue([[]]);
      const req = createReq({ params: { cycleId: "1" }, body: { stakeholder_id: 2 } });
      const res = createRes();
      await reassignStakeholder(req, res);
      expect(mockSequelizeQuery).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetCycleById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { cycleId: "1" }, body: { stakeholder_id: 2 } });
      const res = createRes();
      await reassignStakeholder(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("startNewCycle", () => {
    it("should return 400 for invalid project id", async () => {
      const req = createReq({ params: { projectId: "abc" } });
      const res = createRes();
      await startNewCycle(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when config not found", async () => {
      mockGetConfig.mockResolvedValue(null);
      const req = createReq({ params: { projectId: "1" } });
      const res = createRes();
      await startNewCycle(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 409 when active cycle exists", async () => {
      mockGetConfig.mockResolvedValue({ id: 1, frequency_unit: "months", frequency_value: 3 });
      mockGetActiveCycle.mockResolvedValue({ id: 5, status: "active" });
      const req = createReq({ params: { projectId: "1" } });
      const res = createRes();
      await startNewCycle(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it("should return 201 on success with months frequency", async () => {
      mockGetConfig.mockResolvedValue({ id: 1, frequency_unit: "months", frequency_value: 3 });
      mockGetActiveCycle.mockResolvedValue(null);
      mockGetLatestCycleNumber.mockResolvedValue(2);
      mockGetStakeholder.mockResolvedValue({ id: 5 });
      mockCreateCycle.mockResolvedValue({ id: 10, cycle_number: 3 });
      const req = createReq({ params: { projectId: "1" } });
      const res = createRes();
      await startNewCycle(req, res);
      expect(mockCreateCycle).toHaveBeenCalledWith(
        1,
        3,
        expect.any(Date),
        5,
        1,
        expect.any(Object),
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should return 201 on success with days frequency", async () => {
      mockGetConfig.mockResolvedValue({ id: 2, frequency_unit: "days", frequency_value: 30 });
      mockGetActiveCycle.mockResolvedValue(null);
      mockGetLatestCycleNumber.mockResolvedValue(0);
      mockGetStakeholder.mockResolvedValue(null);
      mockCreateCycle.mockResolvedValue({ id: 11, cycle_number: 1 });
      const req = createReq({ params: { projectId: "2" } });
      const res = createRes();
      await startNewCycle(req, res);
      expect(mockCreateCycle).toHaveBeenCalledWith(
        2,
        1,
        expect.any(Date),
        null,
        1,
        expect.any(Object),
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should return 500 on error", async () => {
      mockGetConfig.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { projectId: "1" } });
      const res = createRes();
      await startNewCycle(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
