import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/project.utils", () => ({
  getAllProjectsQuery: jest.fn(),
  getProjectByIdQuery: jest.fn(),
  createNewProjectQuery: jest.fn(),
  updateProjectByIdQuery: jest.fn(),
  canViewProjectQuery: jest.fn(),
  lockUseCaseWorkflowQuery: jest.fn(),
  deleteProjectByIdQuery: jest.fn(),
  lockProjectForDelete: jest.fn(),
  getCurrentProjectMembers: jest.fn(),
  hasPendingApprovalQuery: jest.fn(),
  calculateProjectRisks: jest.fn(),
  calculateVendirRisks: jest.fn(),
  countAnswersByProjectId: jest.fn(),
  countSubControlsByProjectId: jest.fn(),
  // Pure column check: keep the real rule so the stamping tests exercise it.
  hasProjectColumnUpdate: jest.requireActual<any>("../../utils/project.utils")
    .hasProjectColumnUpdate,
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
  createPendingFrameworksForApprovedUseCase: jest.fn(),
}));
jest.mock("../../utils/useCaseChangeHistory.utils", () => ({
  recordUseCaseCreation: jest.fn().mockResolvedValue(undefined),
  trackUseCaseChanges: jest.fn().mockResolvedValue([]),
  recordMultipleFieldChanges: jest.fn().mockResolvedValue(undefined),
  recordUseCaseDeletion: jest.fn().mockResolvedValue(undefined),
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
  notifyApprovalAutoApproved: jest.fn().mockResolvedValue(undefined),
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
  ForbiddenException: class ForbiddenException extends Error {},
}));
jest.mock("../../services/projects/approvalRequest.service", () => ({
  ...jest.requireActual("../../services/projects/approvalRequest.service"),
  createUseCaseApprovalRequest: jest.fn().mockResolvedValue(null),
  getUsableUseCaseWorkflow: jest.fn().mockResolvedValue({ workflow: {}, steps: [] }),
  notifyUseCaseApprovalRequested: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../utils/rolePermissions.utils", () => ({
  roleHasPermission: jest.fn(async (_org: unknown, role: string) => role === "Admin"),
}));

import { buildProject, buildManyProject } from "../../tests/factories/project.factory";
import { sequelize } from "../../database/db";

/** The transaction the handler under test opened (the mock hands out one shared object). */
async function openedTransaction(): Promise<any> {
  const results = (sequelize.transaction as unknown as jest.Mock).mock.results;
  return results[results.length - 1].value;
}
import {
  getAllProjects,
  getProjectById,
  createProject,
  updateProjectById,
  updateProjectStatus,
  deleteProjectById,
  getProjectStatsById,
} from "../project.ctrl";
import { lockProjectForDelete } from "../../utils/project.utils";
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
import { trackUseCaseChanges } from "../../utils/useCaseChangeHistory.utils";
import { createUseCaseApprovalRequest } from "../../services/projects/approvalRequest.service";
import { notifyUseCaseApprovalRequested } from "../../services/projects/approvalRequest.service";
import { notifyApprovalAutoApproved } from "../../services/inAppNotification.service";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";
import { sendSlackNotification } from "../../services/slack/slackNotificationService";
import {
  createPendingFrameworksForApprovedUseCase,
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
const mockTrackChanges = trackUseCaseChanges as jest.MockedFunction<typeof trackUseCaseChanges>;
const mockGetPendingApproval = getPendingApprovalRequestIdQuery as jest.MockedFunction<
  typeof getPendingApprovalRequestIdQuery
>;
const mockWithdrawApproval = withdrawApprovalRequestQuery as jest.MockedFunction<
  typeof withdrawApprovalRequestQuery
>;
const mockCreatePendingFrameworks =
  createPendingFrameworksForApprovedUseCase as jest.MockedFunction<
    typeof createPendingFrameworksForApprovedUseCase
  >;
const mockCreateApproval = createUseCaseApprovalRequest as jest.MockedFunction<
  typeof createUseCaseApprovalRequest
>;
const mockNotifyApprovers = notifyUseCaseApprovalRequested as jest.MockedFunction<
  typeof notifyUseCaseApprovalRequested
>;
const mockNotifyAutoApproved = notifyApprovalAutoApproved as jest.MockedFunction<
  typeof notifyApprovalAutoApproved
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
  beforeEach(() => {
    jest.clearAllMocks();
    // Rejection/return values set per test must never leak into the next one.
    mockCreateApproval.mockReset();
    mockCreateApproval.mockResolvedValue(null);
  });
  afterEach(() => jest.restoreAllMocks());

  describe("getAllProjects", () => {
    it("should return 401 when userId or role is missing", async () => {
      const req = createReq({ userId: undefined, role: undefined });
      const res = createRes();
      await getAllProjects(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
    it("should return 200 with projects", async () => {
      const projects = [{ ...buildProject(), dataValues: {} }];
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
      const project = { ...buildProject(), dataValues: {} };
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
      const project = { ...buildProject(), owner: 1, approval_workflow_id: null, members: [] };
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
    it("sends the Slack notice for the request's organization and actor", async () => {
      const project = { ...buildProject(), owner: 1, approval_workflow_id: null, members: [] };
      mockCreate.mockResolvedValue(project as any);
      const req = createReq({
        organizationId: 7,
        body: { project_title: "P1", owner: 1, framework: [], members: [] },
      } as any);
      await createProject(req, createRes());
      expect(sendSlackNotification).toHaveBeenCalledWith(
        { organizationId: 7, userId: 1, routingType: "Projects and organizations" },
        expect.objectContaining({ title: "Project created" }),
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

    it("stores the role list normalised and drops the legacy field", async () => {
      mockCreate.mockResolvedValue({ ...buildProject(), owner: 1, members: [] } as any);
      const req = createReq({
        body: {
          project_title: "P1",
          owner: 1,
          framework: [],
          high_risk_roles: ["Deployer", "Provider"],
        },
      });
      await createProject(req, createRes());
      const stored = mockCreate.mock.calls[0][0] as any;
      expect(stored.high_risk_roles).toEqual(["Provider", "Deployer"]);
      expect(stored).not.toHaveProperty("type_of_high_risk_role");
    });

    it("turns a legacy single role into a one-item list", async () => {
      mockCreate.mockResolvedValue({ ...buildProject(), owner: 1, members: [] } as any);
      const req = createReq({
        body: { project_title: "P1", owner: 1, framework: [], type_of_high_risk_role: "Deployer" },
      });
      await createProject(req, createRes());
      expect((mockCreate.mock.calls[0][0] as any).high_risk_roles).toEqual(["Deployer"]);
    });

    it("rejects a legacy role that disagrees with the list, writing nothing", async () => {
      const req = createReq({
        body: {
          project_title: "P1",
          owner: 1,
          framework: [],
          high_risk_roles: ["Provider"],
          type_of_high_risk_role: "Deployer",
        },
      });
      const res = createRes();
      await createProject(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockCreate).not.toHaveBeenCalled();
    });
    it("notifies step-1 approvers when a created use case starts an approval request (#4905)", async () => {
      const project = { ...buildProject(), owner: 1, approval_workflow_id: 5, members: [] };
      mockCreate.mockResolvedValue(project as any);
      mockCreateApproval.mockResolvedValue({
        request: { id: 44, request_name: "Use Case: P1" },
        autoApproved: false,
      } as any);
      const req = createReq({
        body: { project_title: "P1", owner: 1, framework: [], members: [] },
      });
      const res = createRes();
      await createProject(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockNotifyApprovers).toHaveBeenCalledWith(
        project,
        expect.objectContaining({ request: expect.objectContaining({ id: 44 }) }),
        1,
        1,
      );
    });
    it("notifies nobody when the use case has no approval workflow", async () => {
      mockCreate.mockResolvedValue({ ...buildProject(), owner: 1, members: [] } as any);
      mockCreateApproval.mockResolvedValue(null);
      const req = createReq({
        body: { project_title: "P1", owner: 1, framework: [], members: [] },
      });
      const res = createRes();
      await createProject(req, res);
      expect(mockNotifyApprovers).not.toHaveBeenCalled();
    });
    it("returns 400 and rolls the use case back when the workflow is rejected", async () => {
      mockCreate.mockResolvedValue({ ...buildProject(), owner: 1, members: [] } as any);
      mockCreateApproval.mockRejectedValue(
        new ValidationException("The selected approval workflow is no longer active"),
      );
      const req = createReq({
        body: {
          project_title: "P1",
          owner: 1,
          framework: [],
          members: [],
          approval_workflow_id: 5,
        },
      });
      const res = createRes();
      await createProject(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect((await openedTransaction()).rollback).toHaveBeenCalled();
      expect(mockNotifyApprovers).not.toHaveBeenCalled();
    });
    it("skips approver notification when the request is auto-approved (#4905)", async () => {
      const project = { ...buildProject(), owner: 1, approval_workflow_id: 5, members: [] };
      mockCreate.mockResolvedValue(project as any);
      mockCreateApproval.mockResolvedValue({
        request: { id: 44, request_name: "Use Case: P1" },
        autoApproved: true,
        riskLevel: "Minimal risk",
        threshold: "High",
      } as any);
      const req = createReq({
        body: { project_title: "P1", owner: 1, framework: [], members: [] },
      });
      const res = createRes();
      await createProject(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockNotifyApprovers).not.toHaveBeenCalled();
    });
  });

  describe("updateProjectById", () => {
    const mockCanView = jest.requireMock<any>("../../utils/project.utils").canViewProjectQuery;
    const mockLockWorkflow = jest.requireMock<any>("../../utils/project.utils")
      .lockUseCaseWorkflowQuery as jest.Mock<any>;

    beforeEach(() => {
      mockCanView.mockResolvedValue(true);
      // By default the locked row holds what the unlocked read returned.
      mockLockWorkflow.mockImplementation(async (id: number, org: number) => {
        const row: any = await (mockGetById as jest.Mock<any>)(id, org);
        return row ? { approval_workflow_id: row.approval_workflow_id ?? null } : null;
      });
    });

    // Two saves that both attach a workflow each read "no workflow" outside
    // the transaction and each opened a pending request. The stored workflow
    // is now read under a row lock inside the transaction, so the second save
    // waits and sees the first one's workflow.
    it("decides a workflow change on the row read under a lock in the transaction", async () => {
      const existing = { ...buildProject(), owner: 1, approval_workflow_id: null };
      mockGetById.mockResolvedValue(existing as any);
      mockGetMembers.mockResolvedValue([] as any);
      mockUpdate.mockResolvedValue({ ...existing, approval_workflow_id: 5, members: [] } as any);
      mockGetUser.mockResolvedValue({ id: 1, name: "A", surname: "B", role_id: 1 } as any);
      // A concurrent save committed workflow 5 after the unlocked read.
      mockLockWorkflow.mockResolvedValue({ approval_workflow_id: 5 });
      const req = createReq({ params: { id: "1" }, body: { approval_workflow_id: 5 } });
      const res = createRes();
      await updateProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
      expect(mockLockWorkflow).toHaveBeenCalledWith(1, 1, await openedTransaction());
      expect(mockCreateApproval).not.toHaveBeenCalled();
    });

    it("takes no lock when the body does not carry the workflow", async () => {
      const existing = { ...buildProject(), owner: 1, approval_workflow_id: 5 };
      mockGetById.mockResolvedValue(existing as any);
      mockGetMembers.mockResolvedValue([] as any);
      mockUpdate.mockResolvedValue({ ...existing, members: [] } as any);
      mockGetUser.mockResolvedValue({ id: 1, name: "A", surname: "B", role_id: 1 } as any);
      const req = createReq({ params: { id: "1" }, body: { project_title: "Renamed" } });
      const res = createRes();
      await updateProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
      expect(mockLockWorkflow).not.toHaveBeenCalled();
    });

    it("answers 404 when the use case is gone by the time it is locked", async () => {
      mockGetById.mockResolvedValue({
        ...buildProject(),
        owner: 1,
        approval_workflow_id: null,
      } as any);
      mockLockWorkflow.mockResolvedValue(null);
      const req = createReq({ params: { id: "1" }, body: { approval_workflow_id: 5 } });
      const res = createRes();
      await updateProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect((await openedTransaction()).rollback).toHaveBeenCalled();
    });

    it("returns 403 and writes nothing when the caller cannot see the use case", async () => {
      mockCanView.mockResolvedValue(false);
      mockGetById.mockResolvedValue({ ...buildProject(), owner: 1 } as any);
      const req = createReq({ params: { id: "1" }, body: { members: [2] } });
      const res = createRes();
      await updateProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

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
      const existing = { ...buildProject(), owner: 1 };
      const updated = { ...buildProject({ project_title: "P2" }), owner: 1, members: [] };
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
    it("leaves members unchanged when the body has no members (partial update)", async () => {
      const existing = { ...buildProject(), owner: 1 };
      const updated = { ...existing, ai_risk_classification: "Minimal risk", members: [7, 6] };
      mockGetById.mockResolvedValue(existing as any);
      mockGetMembers.mockResolvedValue([7, 6] as any);
      mockUpdate.mockResolvedValue(updated as any);
      mockGetUser.mockResolvedValue({ id: 1, name: "A", surname: "B", role_id: 1 } as any);
      // Exactly what the EU AI Act risk wizard sends
      const req = createReq({
        params: { id: "1" },
        body: { id: "1", ai_risk_classification: "Minimal risk" },
      });
      const res = createRes();
      await updateProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
      expect(mockUpdate).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ ai_risk_classification: "Minimal risk" }),
        undefined,
        1,
        expect.anything(),
        { requireOwner: false },
      );
    });
    it("sets last_updated and last_updated_by itself, ignoring the body (U-M4)", async () => {
      const existing = { ...buildProject(), owner: 1 };
      mockGetById.mockResolvedValue(existing as any);
      mockGetMembers.mockResolvedValue([] as any);
      mockUpdate.mockResolvedValue({ ...existing, members: [] } as any);
      const before = Date.now();
      const req = createReq({
        params: { id: "1" },
        userId: 4,
        body: {
          description: "New",
          last_updated: "2001-01-01T00:00:00.000Z",
          last_updated_by: 99,
        },
      });
      const res = createRes();
      await updateProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
      const written = mockUpdate.mock.calls[0][1] as any;
      expect(written.last_updated_by).toBe(4);
      expect(written.last_updated).toBeInstanceOf(Date);
      expect(written.last_updated.getTime()).toBeGreaterThanOrEqual(before);
    });
    it("diffs the stored values, so framework fields it never writes are not history (U-M3)", async () => {
      const existing = { ...buildProject({ description: "Old" }), owner: 1 };
      const stored = { ...existing, description: "New", members: [] };
      mockGetById.mockResolvedValue(existing as any);
      mockGetMembers.mockResolvedValue([] as any);
      mockUpdate.mockResolvedValue(stored as any);
      const req = createReq({
        params: { id: "1" },
        body: {
          description: "New",
          framework: [1],
          monitored_regulations_and_standards: ["EU AI Act"],
        },
      });
      const res = createRes();
      await updateProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
      const diffed = mockTrackChanges.mock.calls[0][1] as Record<string, unknown>;
      expect(diffed).toMatchObject({ description: "New" });
      expect(diffed).not.toHaveProperty("framework");
      expect(diffed).not.toHaveProperty("monitored_regulations_and_standards");
    });
    it("rolls back its transaction when the row is gone at update time", async () => {
      mockGetById.mockResolvedValue({ ...buildProject(), owner: 1 } as any);
      mockGetMembers.mockResolvedValue([] as any);
      mockUpdate.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "1" }, body: { project_title: "P2" } });
      const res = createRes();
      await updateProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect((await openedTransaction()).rollback).toHaveBeenCalled();
    });
    it("rolls back its transaction on 401", async () => {
      const req = createReq({
        params: { id: "1" },
        body: { project_title: "P2" },
        userId: undefined,
        role: undefined,
      });
      const res = createRes();
      await updateProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect((await openedTransaction()).rollback).toHaveBeenCalled();
    });
    it("treats members: null as clearing the list, as before", async () => {
      const existing = { ...buildProject(), owner: 1 };
      mockGetById.mockResolvedValue(existing as any);
      mockGetMembers.mockResolvedValue([7] as any);
      mockUpdate.mockResolvedValue({ ...existing, members: [] } as any);
      mockGetUser.mockResolvedValue({ id: 1, name: "A", surname: "B", role_id: 1 } as any);
      const req = createReq({ params: { id: "1" }, body: { project_title: "P2", members: null } });
      const res = createRes();
      await updateProjectById(req, res);
      expect(mockUpdate).toHaveBeenCalledWith(1, expect.anything(), [], 1, expect.anything(), {
        requireOwner: false,
      });
    });
    it("passes an explicit empty members list through, so members can still be cleared", async () => {
      const existing = { ...buildProject(), owner: 1 };
      mockGetById.mockResolvedValue(existing as any);
      mockGetMembers.mockResolvedValue([7] as any);
      mockUpdate.mockResolvedValue({ ...existing, members: [] } as any);
      mockGetUser.mockResolvedValue({ id: 1, name: "A", surname: "B", role_id: 1 } as any);
      const req = createReq({ params: { id: "1" }, body: { project_title: "P2", members: [] } });
      const res = createRes();
      await updateProjectById(req, res);
      expect(mockUpdate).toHaveBeenCalledWith(1, expect.anything(), [], 1, expect.anything(), {
        requireOwner: false,
      });
    });
    it("records member changes in the use case history, ignoring order", async () => {
      const existing = { ...buildProject(), owner: 1 };
      mockGetById.mockResolvedValue(existing as any);
      mockGetMembers.mockResolvedValue([7] as any);
      mockUpdate.mockResolvedValue({ ...existing, members: [7, 6] } as any);
      mockGetUser.mockResolvedValue({ id: 6, name: "A", surname: "B", role_id: 3 } as any);
      const req = createReq({ params: { id: "1" }, body: { members: [7, 6] } });
      const res = createRes();
      await updateProjectById(req, res);
      expect(mockTrackChanges).toHaveBeenCalledWith({ members: [7] }, { members: [6, 7] });
    });
    it("does not compare members when the body has none", async () => {
      const existing = { ...buildProject(), owner: 1 };
      mockGetById.mockResolvedValue(existing as any);
      mockGetMembers.mockResolvedValue([7] as any);
      mockUpdate.mockResolvedValue({ ...existing, project_title: "P2", members: [7] } as any);
      const req = createReq({ params: { id: "1" }, body: { project_title: "P2" } });
      const res = createRes();
      await updateProjectById(req, res);
      expect(mockTrackChanges).toHaveBeenCalledTimes(1);
      // The context lets the workflow formatter read names in this organization.
      expect(mockTrackChanges).toHaveBeenCalledWith(
        existing,
        expect.objectContaining({ project_title: "P2" }),
        expect.objectContaining({ organizationId: 1 }),
      );
    });
    it("looks up added members within the organization only", async () => {
      const existing = { ...buildProject(), owner: 1 };
      mockGetById.mockResolvedValue(existing as any);
      mockGetMembers.mockResolvedValue([] as any);
      mockUpdate.mockResolvedValue({ ...existing, members: [6] } as any);
      mockGetUser.mockResolvedValue({ id: 6, name: "A", surname: "B", role_id: 3 } as any);
      const req = createReq({ params: { id: "1" }, body: { members: [6] } });
      const res = createRes();
      await updateProjectById(req, res);
      expect(mockGetUser).toHaveBeenCalledWith(6, null, 1);
    });
    it("starts an approval request when a workflow is newly attached on edit (#4904)", async () => {
      const existing = { ...buildProject(), owner: 1, approval_workflow_id: null };
      const updated = { ...existing, approval_workflow_id: 5, members: [] };
      mockGetById.mockResolvedValue(existing as any);
      mockGetMembers.mockResolvedValue([] as any);
      mockUpdate.mockResolvedValue(updated as any);
      mockGetUser.mockResolvedValue({ id: 1, name: "A", surname: "B", role_id: 1 } as any);
      mockCreateApproval.mockResolvedValue({
        request: { id: 44, request_name: "Use Case: P1" },
        autoApproved: false,
      } as any);
      const req = createReq({ params: { id: "1" }, body: { approval_workflow_id: 5 } });
      const res = createRes();
      await updateProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
      expect(mockCreateApproval).toHaveBeenCalled();
      // The notifier must get the UPDATED row: it builds the approver's link
      // from project.id, so passing anything else sends them to the wrong page.
      expect(mockNotifyApprovers).toHaveBeenCalledWith(
        expect.objectContaining({ id: updated.id, approval_workflow_id: 5 }),
        expect.objectContaining({ request: expect.objectContaining({ id: 44 }) }),
        1,
        1,
      );
    });
    it("withdraws the previous pending request when the workflow is replaced", async () => {
      const existing = { ...buildProject(), owner: 1, approval_workflow_id: 3 };
      const updated = { ...existing, approval_workflow_id: 5, members: [] };
      mockGetById.mockResolvedValue(existing as any);
      mockGetMembers.mockResolvedValue([] as any);
      mockUpdate.mockResolvedValue(updated as any);
      mockGetUser.mockResolvedValue({ id: 1, name: "A", surname: "B", role_id: 1 } as any);
      mockGetPendingApproval.mockResolvedValue(77 as any);
      mockCreateApproval.mockResolvedValue({
        request: { id: 44, request_name: "Use Case: P1" },
        autoApproved: false,
      } as any);
      const req = createReq({ params: { id: "1" }, body: { approval_workflow_id: 5 } });
      const res = createRes();
      await updateProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
      expect(mockGetPendingApproval).toHaveBeenCalledWith(1, "use_case", 1, expect.anything());
      expect(mockWithdrawApproval).toHaveBeenCalledWith(77, 1, expect.anything(), {
        changedBy: 1,
      });
      expect(mockCreateApproval).toHaveBeenCalled();
    });
    it("notifies the requester when the edit-time request is auto-approved", async () => {
      const existing = { ...buildProject(), owner: 1, approval_workflow_id: null };
      const updated = { ...existing, approval_workflow_id: 5, members: [] };
      mockGetById.mockResolvedValue(existing as any);
      mockGetMembers.mockResolvedValue([] as any);
      mockUpdate.mockResolvedValue(updated as any);
      mockGetUser.mockResolvedValue({ id: 1, name: "A", surname: "B", role_id: 1 } as any);
      mockCreateApproval.mockResolvedValue({
        request: { id: 44, request_name: "Use Case: P1" },
        autoApproved: true,
        riskLevel: "Minimal risk",
        threshold: "High",
      } as any);
      const req = createReq({ params: { id: "1" }, body: { approval_workflow_id: 5 } });
      const res = createRes();
      await updateProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
      expect(mockNotifyAutoApproved).toHaveBeenCalled();
      expect(mockNotifyApprovers).not.toHaveBeenCalled();
    });
    // Review: an omitted field is not a cleared workflow. The update query
    // skips omitted columns, so treating it as null withdrew the request
    // while the use case kept its workflow.
    it("leaves the workflow and its pending request alone when the body omits it", async () => {
      const existing = { ...buildProject(), owner: 1, approval_workflow_id: 3 };
      const updated = { ...existing, name: "Renamed", members: [] };
      mockGetById.mockResolvedValue(existing as any);
      mockGetMembers.mockResolvedValue([] as any);
      mockUpdate.mockResolvedValue(updated as any);
      mockGetUser.mockResolvedValue({ id: 1, name: "A", surname: "B", role_id: 1 } as any);
      mockGetPendingApproval.mockResolvedValue(77 as any);
      const req = createReq({ params: { id: "1" }, body: { name: "Renamed" } });
      const res = createRes();
      await updateProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
      expect(mockWithdrawApproval).not.toHaveBeenCalled();
      expect(mockCreateApproval).not.toHaveBeenCalled();
      expect(mockCreatePendingFrameworks).not.toHaveBeenCalled();
    });
    // Review: frameworks chosen at creation wait for approval. Clearing the
    // workflow withdraws that approval, so they are created now instead of
    // never.
    it("creates the deferred frameworks when the workflow is cleared", async () => {
      const existing = { ...buildProject(), owner: 1, approval_workflow_id: 3 };
      const updated = { ...existing, approval_workflow_id: null, members: [] };
      mockGetById.mockResolvedValue(existing as any);
      mockGetMembers.mockResolvedValue([] as any);
      mockUpdate.mockResolvedValue(updated as any);
      mockGetUser.mockResolvedValue({ id: 1, name: "A", surname: "B", role_id: 1 } as any);
      mockGetPendingApproval.mockResolvedValue(77 as any);
      const req = createReq({ params: { id: "1" }, body: { approval_workflow_id: null } });
      const res = createRes();
      await updateProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
      expect(mockWithdrawApproval).toHaveBeenCalledWith(77, 1, expect.anything(), {
        changedBy: 1,
      });
      expect(mockCreatePendingFrameworks).toHaveBeenCalledWith(1, 1, expect.anything(), 1);
      expect(mockCreateApproval).not.toHaveBeenCalled();
    });
    // Audit U-H2: clearing or replacing the workflow under review skipped it.
    describe("workflow changes while the approval is pending or rejected", () => {
      const approvalStatus = jest.requireMock<any>("../../utils/approvalRequest.utils")
        .getApprovalStatusQuery as jest.Mock<any>;
      const usableWorkflow = jest.requireMock<any>(
        "../../services/projects/approvalRequest.service",
      ).getUsableUseCaseWorkflow as jest.Mock<any>;

      function arrange(status: "pending" | "rejected" | null, workflowId: number | null = 3) {
        const existing = { ...buildProject(), owner: 1, approval_workflow_id: workflowId };
        mockGetById.mockResolvedValue(existing as any);
        mockGetMembers.mockResolvedValue([] as any);
        mockUpdate.mockResolvedValue({
          ...existing,
          approval_workflow_id: null,
          members: [],
        } as any);
        mockGetUser.mockResolvedValue({ id: 1, name: "A", surname: "B", role_id: 3 } as any);
        approvalStatus.mockResolvedValue(status);
      }

      afterEach(() => approvalStatus.mockReset());

      it.each([
        ["pending", null],
        ["pending", 8],
        ["rejected", null],
        ["rejected", 8],
      ] as const)(
        "refuses an Editor (%s, to %s) with 403 and writes nothing",
        async (status, next) => {
          arrange(status);
          const req = createReq({
            role: "Editor",
            params: { id: "1" },
            body: { approval_workflow_id: next },
          });
          const res = createRes();
          await updateProjectById(req, res);
          expect(res.status).toHaveBeenCalledWith(403);
          expect(mockUpdate).not.toHaveBeenCalled();
          expect(mockWithdrawApproval).not.toHaveBeenCalled();
          expect(mockCreatePendingFrameworks).not.toHaveBeenCalled();
          expect((await openedTransaction()).rollback).toHaveBeenCalled();
        },
      );

      it("lets an Editor send the saved workflow again, as a string", async () => {
        arrange("pending");
        const req = createReq({
          role: "Editor",
          params: { id: "1" },
          body: { approval_workflow_id: "3" },
        });
        const res = createRes();
        await updateProjectById(req, res);
        expect(res.status).toHaveBeenCalledWith(202);
        expect(approvalStatus).not.toHaveBeenCalled();
        expect(mockWithdrawApproval).not.toHaveBeenCalled();
      });

      it("lets an approval workflow admin clear a pending review", async () => {
        arrange("pending");
        approvalStatus.mockResolvedValueOnce("pending").mockResolvedValueOnce(null);
        mockGetPendingApproval.mockResolvedValue(77 as any);
        const req = createReq({ params: { id: "1" }, body: { approval_workflow_id: null } });
        const res = createRes();
        await updateProjectById(req, res);
        expect(res.status).toHaveBeenCalledWith(202);
        expect(mockWithdrawApproval).toHaveBeenCalled();
        expect(mockCreatePendingFrameworks).toHaveBeenCalled();
      });

      it("never attaches the frameworks when an admin clears a rejected use case", async () => {
        arrange("rejected");
        mockGetPendingApproval.mockResolvedValue(null as any);
        const req = createReq({ params: { id: "1" }, body: { approval_workflow_id: null } });
        const res = createRes();
        await updateProjectById(req, res);
        expect(res.status).toHaveBeenCalledWith(202);
        expect(mockCreatePendingFrameworks).not.toHaveBeenCalled();
      });

      it("keeps a re-review's rejection when the admin withdraws the re-review", async () => {
        arrange("pending");
        approvalStatus.mockResolvedValueOnce("pending").mockResolvedValueOnce("rejected");
        mockGetPendingApproval.mockResolvedValue(77 as any);
        const req = createReq({ params: { id: "1" }, body: { approval_workflow_id: null } });
        const res = createRes();
        await updateProjectById(req, res);
        expect(res.status).toHaveBeenCalledWith(202);
        expect(mockWithdrawApproval).toHaveBeenCalled();
        expect(mockCreatePendingFrameworks).not.toHaveBeenCalled();
      });

      // The workflow checked before the write is the one the request is
      // opened under; it used to be loaded a second time.
      it("opens the request with the workflow it already checked", async () => {
        arrange(null, null);
        const checked = { workflow: { id: 8 }, steps: [] };
        usableWorkflow.mockResolvedValueOnce(checked);
        mockUpdate.mockResolvedValue({
          ...buildProject(),
          approval_workflow_id: 8,
          members: [],
        } as any);
        const req = createReq({ params: { id: "1" }, body: { approval_workflow_id: 8 } });
        const res = createRes();
        await updateProjectById(req, res);
        expect(res.status).toHaveBeenCalledWith(202);
        expect(usableWorkflow).toHaveBeenCalledTimes(1);
        expect(mockCreateApproval).toHaveBeenCalledWith(
          expect.objectContaining({ approval_workflow_id: 8 }),
          1,
          1,
          expect.anything(),
          checked,
        );
      });

      const unusable = () =>
        Object.assign(new ValidationException("The selected approval workflow does not exist"), {
          metadata: { field: "approval_workflow_id" },
        });

      // The legacy /api/projects contract is frozen: its 400 body stays the
      // plain message. Only /api/v1 answers in the field-error shape.
      it("answers an unusable workflow on the legacy route with the plain message", async () => {
        arrange(null, null);
        usableWorkflow.mockRejectedValueOnce(unusable());
        const req = createReq({ params: { id: "1" }, body: { approval_workflow_id: 99 } });
        const res = createRes();
        await updateProjectById(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          message: "Bad Request",
          data: "The selected approval workflow does not exist",
        });
        expect(mockUpdate).not.toHaveBeenCalled();
      });

      it("answers an unusable workflow on v1 as a field error and writes nothing", async () => {
        arrange(null, null);
        usableWorkflow.mockRejectedValueOnce(unusable());
        const req = createReq({ params: { id: "1" }, body: { approval_workflow_id: 99 } });
        const res = createRes();
        res.locals = { acceptsExternalOwner: true };
        await updateProjectById(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          message: "Bad Request",
          data: {
            errors: [
              {
                field: "approval_workflow_id",
                message: "The selected approval workflow does not exist",
                location: "body",
              },
            ],
          },
        });
        expect(mockUpdate).not.toHaveBeenCalled();
      });
    });
    it("starts no request when the attached workflow is unchanged (#4904)", async () => {
      const existing = { ...buildProject(), owner: 1, approval_workflow_id: 5 };
      const updated = { ...existing, members: [] };
      mockGetById.mockResolvedValue(existing as any);
      mockGetMembers.mockResolvedValue([] as any);
      mockUpdate.mockResolvedValue(updated as any);
      mockGetUser.mockResolvedValue({ id: 1, name: "A", surname: "B", role_id: 1 } as any);
      const req = createReq({ params: { id: "1" }, body: { approval_workflow_id: 5 } });
      const res = createRes();
      await updateProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
      expect(mockCreateApproval).not.toHaveBeenCalled();
    });
    it("returns 400 when the attached workflow is inactive or not a use-case workflow (#4906)", async () => {
      const existing = { ...buildProject(), owner: 1, approval_workflow_id: null };
      const updated = { ...existing, approval_workflow_id: 9, members: [] };
      mockGetById.mockResolvedValue(existing as any);
      mockGetMembers.mockResolvedValue([] as any);
      mockUpdate.mockResolvedValue(updated as any);
      mockCreateApproval.mockRejectedValue(
        new ValidationException("The selected approval workflow has been deactivated."),
      );
      const req = createReq({ params: { id: "1" }, body: { approval_workflow_id: 9 } });
      const res = createRes();
      await updateProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect((await openedTransaction()).rollback).toHaveBeenCalled();
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" }, body: { project_title: "P2" } });
      const res = createRes();
      await updateProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    const updateWith = async (body: object, stored: string[]) => {
      mockGetById.mockResolvedValue({
        ...buildProject(),
        owner: 1,
        high_risk_roles: stored,
      } as any);
      mockGetMembers.mockResolvedValue([] as any);
      mockUpdate.mockResolvedValue({ ...buildProject(), owner: 1, members: [] } as any);
      const res = createRes();
      await updateProjectById(createReq({ params: { id: "1" }, body }), res);
      return res;
    };

    it("keeps both roles when an older client writes back the derived role", async () => {
      await updateWith({ type_of_high_risk_role: "Provider" }, ["Provider", "Deployer"]);
      expect((mockUpdate.mock.calls[0][1] as any).high_risk_roles).toEqual([
        "Provider",
        "Deployer",
      ]);
    });

    it("replaces the list when the legacy role is not in it", async () => {
      await updateWith({ type_of_high_risk_role: "Deployer" }, ["Provider"]);
      expect((mockUpdate.mock.calls[0][1] as any).high_risk_roles).toEqual(["Deployer"]);
    });

    it("clears the list when the legacy role is null", async () => {
      await updateWith({ type_of_high_risk_role: null }, ["Provider"]);
      expect((mockUpdate.mock.calls[0][1] as any).high_risk_roles).toEqual([]);
    });

    it("replaces the list with high_risk_roles and never passes the legacy field on", async () => {
      await updateWith({ high_risk_roles: ["Deployer", "Provider"] }, ["Provider"]);
      const passed = mockUpdate.mock.calls[0][1] as any;
      expect(passed.high_risk_roles).toEqual(["Provider", "Deployer"]);
      expect(passed).not.toHaveProperty("type_of_high_risk_role");
    });

    it("leaves the roles alone when neither field is sent", async () => {
      await updateWith({ project_title: "P2" }, ["Provider"]);
      expect(mockUpdate.mock.calls[0][1]).not.toHaveProperty("high_risk_roles");
    });

    it("returns 400 and rolls back when the two fields disagree", async () => {
      const res = await updateWith(
        { high_risk_roles: ["Provider"], type_of_high_risk_role: "Deployer" },
        ["Provider"],
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect((await openedTransaction()).rollback).toHaveBeenCalled();
    });
  });

  describe("updateProjectStatus", () => {
    it("returns 404 and rolls back when the row is gone at update time", async () => {
      mockGetById.mockResolvedValue({ ...buildProject(), owner: 1 } as any);
      mockUpdate.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "1" }, body: { status: "In progress" } });
      const res = createRes();
      await updateProjectStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect((await openedTransaction()).rollback).toHaveBeenCalled();
    });
    it("rolls back its transaction when the use case does not exist", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "999" }, body: { status: "In progress" } });
      const res = createRes();
      await updateProjectStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect((await openedTransaction()).rollback).toHaveBeenCalled();
    });
    it("changes the status without touching members", async () => {
      const existing = { ...buildProject(), owner: 1, status: "Not started" };
      mockGetById.mockResolvedValue(existing as any);
      mockUpdate.mockResolvedValue({ ...existing, status: "In progress", members: [7, 6] } as any);
      const req = createReq({ params: { id: "1" }, body: { status: "In progress" } });
      const res = createRes();
      await updateProjectStatus(req, res);
      expect(mockUpdate).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ status: "In progress" }),
        undefined,
        1,
        expect.anything(),
      );
    });
  });

  describe("deleteProjectById", () => {
    it("should return 202 when project is deleted", async () => {
      const project = buildProject();
      (lockProjectForDelete as jest.MockedFunction<typeof lockProjectForDelete>).mockResolvedValue(
        true,
      );
      mockGetPendingApproval.mockResolvedValue(null as any);
      mockDelete.mockResolvedValue(project as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteProjectById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: project }));
    });
    it("locks the project first, before the approval withdrawal and the delete", async () => {
      const project = buildProject();
      mockGetPendingApproval.mockResolvedValue(42 as any);
      mockDelete.mockResolvedValue(project as any);
      const lock = lockProjectForDelete as jest.MockedFunction<typeof lockProjectForDelete>;
      lock.mockResolvedValue(true);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await deleteProjectById(req, res);

      expect(lock).toHaveBeenCalledWith(1, expect.anything(), expect.anything());
      const lockedAt = lock.mock.invocationCallOrder[0];
      expect(lockedAt).toBeLessThan(mockGetPendingApproval.mock.invocationCallOrder[0]);
      expect(lockedAt).toBeLessThan(mockWithdrawApproval.mock.invocationCallOrder[0]);
      expect(lockedAt).toBeLessThan(mockDelete.mock.invocationCallOrder[0]);
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
      const project = { ...buildProject(), owner: 1, last_updated: new Date(), last_updated_by: 1 };
      mockGetById.mockResolvedValue(project as any);
      mockGetUser.mockResolvedValue({ id: 1, name: "A", surname: "B", email: "a@b.com" } as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getProjectStatsById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
    });
    it("reads the owner within this organization", async () => {
      const project = { ...buildProject(), owner: 4, last_updated_by: null };
      mockGetById.mockResolvedValue(project as any);
      mockGetUser.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "1" }, organizationId: 8 });
      const res = createRes();
      await getProjectStatsById(req, res);
      expect(mockGetUser).toHaveBeenCalledWith(4, null, 8);
    });
    it("returns the user who last updated it, read in this organization (U-L2)", async () => {
      const project = {
        ...buildProject(),
        owner: null,
        last_updated: new Date(),
        last_updated_by: 3,
      };
      mockGetById.mockResolvedValue(project as any);
      mockGetUser.mockResolvedValue({
        id: 3,
        name: "Ada",
        surname: "Lovelace",
        email: "ada@example.com",
        password_hash: "secret",
      } as any);
      const req = createReq({ params: { id: "1" }, organizationId: 8 });
      const res = createRes();
      await getProjectStatsById(req, res);
      expect(mockGetUser).toHaveBeenCalledWith(3, null, 8);
      const body = res.json.mock.calls[0][0];
      expect(body.data.user.userWhoUpdated).toEqual({
        id: 3,
        name: "Ada",
        surname: "Lovelace",
        email: "ada@example.com",
      });
    });
    it("returns null for the updater when none is recorded", async () => {
      const project = { ...buildProject(), owner: null, last_updated_by: null };
      mockGetById.mockResolvedValue(project as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getProjectStatsById(req, res);
      expect(mockGetUser).not.toHaveBeenCalled();
      expect(res.json.mock.calls[0][0].data.user.userWhoUpdated).toBeNull();
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
