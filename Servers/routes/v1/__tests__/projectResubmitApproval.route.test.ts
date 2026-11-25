import request from "supertest";
import express from "express";

// x-role / x-org stand in for the token's claims; no Authorization header is a
// 401, as with the real middleware.
jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ message: "Unauthorized" });
    req.userId = 9;
    req.organizationId = Number(req.headers["x-org"] ?? 42);
    req.role = req.headers["x-role"] ?? "Admin";
    req.t = (key: string, vars?: Record<string, string>) =>
      key.replace(/\{(\w+)\}/g, (_m, name) => vars?.[name] ?? `{${name}}`);
    next();
  },
}));
jest.mock("../../../utils/roleMap", () => ({
  getRoleByName: jest.fn(async (_orgId: number | null, name: string) =>
    ["Admin", "Editor", "Reviewer", "Auditor"].includes(name)
      ? { id: 1, name, organizationId: null }
      : undefined,
  ),
}));
jest.mock("../../../utils/project.utils", () => ({
  ...jest.requireActual("../../../utils/project.utils"),
  getProjectAccessQuery: jest.fn(async () => "allowed"),
  getProjectReadAccessQuery: jest.fn(async () => "allowed"),
  lockUseCaseWorkflowQuery: jest.fn(),
  getProjectByIdQuery: jest.fn(),
}));
jest.mock("../../../utils/approvalRequest.utils", () => ({
  ...jest.requireActual("../../../utils/approvalRequest.utils"),
  getApprovalStatusQuery: jest.fn(),
}));
jest.mock("../../../services/projects/approvalRequest.service", () => ({
  ...jest.requireActual("../../../services/projects/approvalRequest.service"),
  getUsableUseCaseWorkflow: jest.fn(),
  createUseCaseApprovalRequest: jest.fn(),
}));
jest.mock("../../../services/useCaseNotifications.service", () => ({
  ...jest.requireActual("../../../services/useCaseNotifications.service"),
  notifyUseCaseApprovalOutcome: jest.fn(),
}));
jest.mock("../../../utils/changeHistory.base.utils", () => ({
  ...jest.requireActual("../../../utils/changeHistory.base.utils"),
  recordEntityChange: jest.fn(async () => undefined),
}));
jest.mock("../../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(async () => undefined),
  logFailure: jest.fn(async () => undefined),
}));

import routes from "../projects.route";
import { sequelize } from "../../../database/db";
import {
  getProjectAccessQuery,
  getProjectByIdQuery,
  getProjectReadAccessQuery,
  lockUseCaseWorkflowQuery,
} from "../../../utils/project.utils";
import { getApprovalStatusQuery } from "../../../utils/approvalRequest.utils";
import {
  createUseCaseApprovalRequest,
  getUsableUseCaseWorkflow,
} from "../../../services/projects/approvalRequest.service";
import { notifyUseCaseApprovalOutcome } from "../../../services/useCaseNotifications.service";
import { recordEntityChange } from "../../../utils/changeHistory.base.utils";
import { ValidationException } from "../../../domain.layer/exceptions/custom.exception";

const accessQuery = getProjectAccessQuery as jest.Mock;
const readAccessQuery = getProjectReadAccessQuery as jest.Mock;
const lockQuery = lockUseCaseWorkflowQuery as jest.Mock;
const projectQuery = getProjectByIdQuery as jest.Mock;
const statusQuery = getApprovalStatusQuery as jest.Mock;
const usableWorkflow = getUsableUseCaseWorkflow as jest.Mock;
const createRequest = createUseCaseApprovalRequest as jest.Mock;
const notifyOutcome = notifyUseCaseApprovalOutcome as jest.Mock;
const recordChange = recordEntityChange as jest.Mock;

const transaction = {
  commit: jest.fn(async () => undefined),
  rollback: jest.fn(async () => undefined),
};

const app = express();
app.use(express.json());
app.use("/api/v1/projects", routes);

const ROUTE = "/api/v1/projects/12/resubmit-approval";
const post = (role = "Editor", org = "42") =>
  request(app).post(ROUTE).set("Authorization", "Bearer t").set("x-role", role).set("x-org", org);

const PROJECT = {
  id: 12,
  project_title: "Support chatbot",
  owner: 3,
  ai_risk_classification: "limited risk",
  approval_workflow_id: 4,
};
const USABLE = { workflow: { id: 4, workflow_title: "Model risk review" }, steps: [] };

describe("POST /api/v1/projects/:id/resubmit-approval", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(sequelize, "transaction").mockResolvedValue(transaction as any);
    accessQuery.mockResolvedValue("allowed");
    readAccessQuery.mockResolvedValue("allowed");
    lockQuery.mockResolvedValue({ approval_workflow_id: 4 });
    projectQuery.mockResolvedValue(PROJECT);
    statusQuery.mockResolvedValue("rejected");
    usableWorkflow.mockResolvedValue(USABLE);
    createRequest.mockResolvedValue({
      request: { id: 77, request_name: "Use Case: Support chatbot" },
      autoApproved: false,
      workflowTitle: "Model risk review",
      steps: [],
    });
  });

  it("answers 401 without a token", async () => {
    expect((await request(app).post(ROUTE)).status).toBe(401);
    expect(lockQuery).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a positive integer", async () => {
    const res = await request(app)
      .post("/api/v1/projects/abc/resubmit-approval")
      .set("Authorization", "Bearer t");
    expect(res.status).toBe(400);
    expect(lockQuery).not.toHaveBeenCalled();
  });

  it.each(["Reviewer", "Auditor"])("refuses a %s, who has no useCase.edit", async (role) => {
    const res = await post(role);
    expect(res.status).toBe(403);
    expect(lockQuery).not.toHaveBeenCalled();
    expect(createRequest).not.toHaveBeenCalled();
  });

  it("refuses an editor without write access to this use case", async () => {
    accessQuery.mockResolvedValue("denied");
    const res = await post("Editor");
    expect(res.status).toBe(403);
    expect(accessQuery).toHaveBeenCalledWith(12, { userId: 9, role: "Editor" }, 42);
    expect(readAccessQuery).not.toHaveBeenCalled();
    expect(lockQuery).not.toHaveBeenCalled();
  });

  it("answers 404 for a use case in another organization", async () => {
    // The guard passes a use case it cannot find in the caller's organization
    // on; the organization-scoped lock then finds nothing.
    accessQuery.mockResolvedValue("not_found");
    lockQuery.mockResolvedValue(null);
    const res = await post("Admin", "7");
    expect(res.status).toBe(404);
    expect(lockQuery).toHaveBeenCalledWith(12, 7, transaction);
    expect(statusQuery).not.toHaveBeenCalled();
    expect(createRequest).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
  });

  it("answers 409 while a request is already pending", async () => {
    statusQuery.mockResolvedValue("pending");
    const res = await post();
    expect(res.status).toBe(409);
    expect(res.body.data).toBe("This use case is already waiting for approval");
    expect(createRequest).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it("answers 409 when the use case was never sent for approval, or was approved", async () => {
    // getApprovalStatusQuery reads both as null: only pending and rejected
    // are reported.
    statusQuery.mockResolvedValue(null);
    const res = await post();
    expect(res.status).toBe(409);
    expect(res.body.data).toBe("Only a rejected use case can be resubmitted for approval");
    expect(createRequest).not.toHaveBeenCalled();
  });

  it("answers 400 when no workflow is attached", async () => {
    lockQuery.mockResolvedValue({ approval_workflow_id: null });
    const res = await post();
    expect(res.status).toBe(400);
    expect(res.body.data).toBe(
      "This use case has no approval workflow. Attach one to send it for approval.",
    );
    expect(usableWorkflow).not.toHaveBeenCalled();
    expect(createRequest).not.toHaveBeenCalled();
  });

  it("answers 400 and asks for an admin when the attached workflow is unusable", async () => {
    usableWorkflow.mockRejectedValue(
      new ValidationException(
        "The selected approval workflow is no longer active",
        "approval_workflow_id",
        4,
        { i18nKey: "The selected approval workflow is no longer active" },
      ),
    );
    const res = await post();
    expect(res.status).toBe(400);
    expect(res.body.data).toBe(
      "The selected approval workflow is no longer active. Ask an approval workflow admin to change this use case's approval workflow.",
    );
    expect(usableWorkflow).toHaveBeenCalledWith(4, 42, transaction);
    expect(createRequest).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it("opens a request under the locked row, records it and notifies the approvers", async () => {
    const res = await post("Editor", "42");
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      approval_request_id: 77,
      status: "pending",
      auto_approved: false,
    });

    // The row lock comes first, in the same transaction as everything else,
    // so a second resubmit waits and then sees this one's pending request.
    expect(lockQuery).toHaveBeenCalledWith(12, 42, transaction);
    expect(lockQuery.mock.invocationCallOrder[0]).toBeLessThan(
      statusQuery.mock.invocationCallOrder[0],
    );
    expect(statusQuery).toHaveBeenCalledWith(12, "use_case", 42, transaction);

    // createUseCaseApprovalRequest moves planned to in review.
    expect(createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 12,
        approval_workflow_id: 4,
        project_title: "Support chatbot",
      }),
      9,
      42,
      transaction,
      USABLE,
    );
    expect(recordChange).toHaveBeenCalledWith(
      "use_case",
      12,
      "updated",
      9,
      42,
      "approval_status",
      "Rejected",
      "Pending",
      transaction,
    );
    expect(transaction.commit).toHaveBeenCalled();
    expect(transaction.rollback).not.toHaveBeenCalled();
    expect(notifyOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ id: 12 }),
      expect.objectContaining({ request: expect.objectContaining({ id: 77 }) }),
      9,
      42,
      "Update",
      expect.anything(),
    );
    // Notices go out only once the request is committed.
    expect(transaction.commit.mock.invocationCallOrder[0]).toBeLessThan(
      notifyOutcome.mock.invocationCallOrder[0],
    );
  });

  it("reports an auto-approved resubmission", async () => {
    createRequest.mockResolvedValue({
      request: { id: 78, request_name: "Use Case: Support chatbot" },
      autoApproved: true,
      riskLevel: "limited risk",
      threshold: "limited risk",
      workflowTitle: "Model risk review",
      steps: [],
    });
    const res = await post();
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      approval_request_id: 78,
      status: "approved",
      auto_approved: true,
    });
    expect(recordChange).toHaveBeenCalledWith(
      "use_case",
      12,
      "updated",
      9,
      42,
      "approval_status",
      "Rejected",
      "Approved",
      transaction,
    );
  });

  it("rolls back and answers 500 when opening the request fails", async () => {
    createRequest.mockRejectedValue(new Error("db down"));
    const res = await post();
    expect(res.status).toBe(500);
    expect(transaction.rollback).toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(notifyOutcome).not.toHaveBeenCalled();
  });
});
