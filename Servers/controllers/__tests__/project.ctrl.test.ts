import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/project.utils", () => ({
  getAllProjectsQuery: jest.fn(),
  getProjectByIdQuery: jest.fn(),
  createNewProjectQuery: jest.fn(),
  updateProjectByIdQuery: jest.fn(),
  deleteProjectByIdQuery: jest.fn(),
  getCurrentProjectMembers: jest.fn(),
  hasPendingApprovalQuery: jest.fn(),
  calculateProjectRisks: jest.fn(),
  calculateVendirRisks: jest.fn(),
  countAnswersByProjectId: jest.fn(),
  countSubControlsByProjectId: jest.fn(),
}));
jest.mock("../../utils/user.utils", () => ({
  getUserByIdQuery: jest.fn(),
}));
jest.mock("../../utils/controlCategory.utils", () => ({
  getControlCategoryByProjectIdQuery: jest.fn(),
}));
jest.mock("../../utils/control.utils", () => ({
  getAllControlsByControlGroupQuery: jest.fn(),
}));
jest.mock("../../utils/subControl.utils", () => ({
  getAllSubcontrolsByControlIdQuery: jest.fn(),
}));
jest.mock("../../utils/eu.utils", () => ({
  createEUFrameworkQuery: jest.fn(),
}));
jest.mock("../../utils/iso42001.utils", () => ({
  createISOFrameworkQuery: jest.fn(),
}));
jest.mock("../../utils/iso27001.utils", () => ({
  createISO27001FrameworkQuery: jest.fn(),
}));
jest.mock("../../utils/nistAiRmfCorrect.utils", () => ({
  createNISTAI_RMFFrameworkQuery: jest.fn(),
}));
jest.mock("../../utils/approvalWorkflow.utils", () => ({
  getApprovalWorkflowByIdQuery: jest.fn(),
}));
jest.mock("../../utils/approvalRequest.utils", () => ({
  createApprovalRequestQuery: jest.fn(),
  hasPendingApprovalQuery: jest.fn(),
  getPendingApprovalRequestIdQuery: jest.fn(),
  withdrawApprovalRequestQuery: jest.fn(),
  getApprovalStatusQuery: jest.fn(),
}));
jest.mock("../../utils/useCaseChangeHistory.utils", () => ({
  recordUseCaseCreation: jest.fn().mockResolvedValue(undefined),
  trackUseCaseChanges: jest.fn().mockResolvedValue([]),
  recordMultipleFieldChanges: jest.fn().mockResolvedValue(undefined),
  recordUseCaseDeletion: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/plugin/pluginService", () => ({
  PluginService: {
    getDataFromProviders: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock("../../services/userNotification/projectNotifications", () => ({
  sendProjectCreatedNotification: jest.fn().mockResolvedValue(undefined),
  sendUserAddedToProjectNotification: jest.fn().mockResolvedValue(undefined),
  ProjectRole: {},
}));
jest.mock("../../services/slack/slackNotificationService", () => ({
  sendSlackNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/inAppNotification.service", () => ({
  notifyUserAssigned: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    201: (d: any) => ({ message: "Created", data: d }),
    202: (d: any) => ({ message: "Accepted", data: d }),
    204: (d: any) => ({ message: "No Content", data: d }),
    400: (d: any) => ({ message: "Bad Request", data: d }),
    401: (d: any) => ({ message: "Unauthorized", data: d }),
    403: (d: any) => ({ message: "Forbidden", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
    503: (d: any) => ({ message: "Service Unavailable", data: d }),
  },
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_, err) => (err as Error).message),
}));
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }),
    query: jest.fn().mockResolvedValue([[]]),
  },
}));
jest.mock("../../domain.layer/models/project/project.model", () => ({
  ProjectModel: jest.fn(),
}));
jest.mock("../../domain.layer/exceptions/custom.exception", () => ({
  ValidationException: class ValidationException extends Error {},
  BusinessLogicException: class BusinessLogicException extends Error {},
}));

import {
  getAllProjects,
  getProjectById,
  createProject,
  updateProjectById,
  deleteProjectById,
  getProjectStatsById,
} from "../project.ctrl";
import {
  getAllProjectsQuery,
  getProjectByIdQuery,
  createNewProjectQuery,
  updateProjectByIdQuery,
  deleteProjectByIdQuery,
  getCurrentProjectMembers,
  hasPendingApprovalQuery,
} from "../../utils/project.utils";
import { getUserByIdQuery } from "../../utils/user.utils";
import {
  getPendingApprovalRequestIdQuery,
  withdrawApprovalRequestQuery,
} from "../../utils/approvalRequest.utils";

const mockGetAll = getAllProjectsQuery as jest.MockedFunction<typeof getAllProjectsQuery>;
const mockGetById = getProjectByIdQuery as jest.MockedFunction<typeof getProjectByIdQuery>;
const mockCreate = createNewProjectQuery as jest.MockedFunction<typeof createNewProjectQuery>;
const mockUpdate = updateProjectByIdQuery as jest.MockedFunction<typeof updateProjectByIdQuery>;
const mockDelete = deleteProjectByIdQuery as jest.MockedFunction<typeof deleteProjectByIdQuery>;
const mockGetMembers = getCurrentProjectMembers as jest.MockedFunction<
  typeof getCurrentProjectMembers
>;
const mockHasPending = hasPendingApprovalQuery as jest.MockedFunction<
  typeof hasPendingApprovalQuery
>;
const mockGetUser = getUserByIdQuery as jest.MockedFunction<typeof getUserByIdQuery>;
const mockGetPendingApproval = getPendingApprovalRequestIdQuery as jest.MockedFunction<
  typeof getPendingApprovalRequestIdQuery
>;
const mockWithdrawApproval = withdrawApprovalRequestQuery as jest.MockedFunction<
  typeof withdrawApprovalRequestQuery
>;

function createReq(overrides?: Partial<Request>): any {
  return {
    userId: 1,
    organizationId: 1,
    role: "Admin",
    t: (k: string) => k,
    body: {},
    params: {},
    query: {},
    ...overrides,
  };
}
function createRes(): any {
  const res: any = {};
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  return res;
}

describe("project.ctrl", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  describe("getAllProjects", () => {
    it("should return 401 when userId or role is missing", async () => {
      const req = createReq({ userId: undefined, role: undefined });
      const res = createRes();
      await getAllProjects(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
    it("should return 200 with projects", async () => {
      const projects = [{ id: 1, project_title: "P1", dataValues: {} }];
      mockGetAll.mockResolvedValue(projects as any);
      mockHasPending.mockResolvedValue(false as any);
      const req = createReq();
      const res = createRes();
      await getAllProjects(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
    });
    it("should return 500 on error", async () => {
      mockGetAll.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getAllProjects(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getProjectById", () => {
    it("should return 200 when project is found", async () => {
      const project = { id: 1, project_title: "P1", dataValues: {} };
      mockGetById.mockResolvedValue(project as any);
      mockHasPending.mockResolvedValue(false as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: project }));
    });
    it("should return 404 when project is not found", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await getProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("createProject", () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ id: 1, name: "A", surname: "B" } as any);
    });
    it("should return 201 when project is created successfully", async () => {
      const project = {
        id: 1,
        project_title: "P1",
        owner: 1,
        approval_workflow_id: null,
        members: [],
      };
      mockCreate.mockResolvedValue(project as any);
      const req = createReq({
        body: {
          project_title: "P1",
          owner: 1,
          framework: [],
          members: [],
          enable_ai_data_insertion: false,
        },
      });
      const res = createRes();
      await createProject(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ project }) }),
      );
    });
    it("should return 500 when creation returns null due to premature access on null", async () => {
      mockCreate.mockResolvedValue(null as any);
      const req = createReq({
        body: { project_title: "P1", owner: 1, framework: [], members: [] },
      });
      const res = createRes();
      await createProject(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
    it("should return 500 on unexpected error", async () => {
      mockCreate.mockRejectedValue(new Error("boom"));
      const req = createReq({
        body: { project_title: "P1", owner: 1, framework: [], members: [] },
      });
      const res = createRes();
      await createProject(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateProjectById", () => {
    it("should return 401 when userId or role is missing", async () => {
      const req = createReq({
        params: { id: "1" },
        body: { project_title: "P2" },
        userId: undefined,
        role: undefined,
      });
      const res = createRes();
      await updateProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
    it("should return 404 when project is not found", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" }, body: { project_title: "P2" } });
      const res = createRes();
      await updateProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 202 when project is updated", async () => {
      const existing = { id: 1, project_title: "P1", owner: 1 };
      const updated = { id: 1, project_title: "P2", owner: 1, members: [] };
      mockGetById.mockResolvedValue(existing as any);
      mockGetMembers.mockResolvedValue([] as any);
      mockUpdate.mockResolvedValue(updated as any);
      mockGetUser.mockResolvedValue({ id: 1, name: "A", surname: "B", role_id: 1 } as any);
      const req = createReq({ params: { id: "1" }, body: { project_title: "P2", members: [] } });
      const res = createRes();
      await updateProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: updated }));
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" }, body: { project_title: "P2" } });
      const res = createRes();
      await updateProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("deleteProjectById", () => {
    it("should return 202 when project is deleted", async () => {
      const project = { id: 1, project_title: "P1" };
      mockGetPendingApproval.mockResolvedValue(null as any);
      mockDelete.mockResolvedValue(project as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: project }));
    });
    it("should return 404 when project is not found", async () => {
      mockGetPendingApproval.mockResolvedValue(null as any);
      mockDelete.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await deleteProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 500 on error", async () => {
      mockGetPendingApproval.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getProjectStatsById", () => {
    it("should return 202 with project stats", async () => {
      const project = { id: 1, owner: 1, last_updated: new Date(), last_updated_by: 1 };
      mockGetById.mockResolvedValue(project as any);
      mockGetUser.mockResolvedValue({ id: 1, name: "A", surname: "B", email: "a@b.com" } as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getProjectStatsById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getProjectStatsById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
