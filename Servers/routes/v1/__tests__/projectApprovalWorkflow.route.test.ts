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
    req.t = (key: string) => key;
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
  getUseCaseApprovalWorkflowQuery: jest.fn(),
}));
jest.mock("../../../utils/approvalRequest.utils", () => ({
  ...jest.requireActual("../../../utils/approvalRequest.utils"),
  getApprovalStatusQuery: jest.fn(),
}));
jest.mock("../../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(async () => undefined),
  logFailure: jest.fn(async () => undefined),
}));

import routes from "../projects.route";
import {
  getProjectAccessQuery,
  getProjectReadAccessQuery,
  getUseCaseApprovalWorkflowQuery,
} from "../../../utils/project.utils";
import { getApprovalStatusQuery } from "../../../utils/approvalRequest.utils";

const accessQuery = getProjectAccessQuery as jest.Mock;
const readAccessQuery = getProjectReadAccessQuery as jest.Mock;
const workflowQuery = getUseCaseApprovalWorkflowQuery as jest.Mock;
const statusQuery = getApprovalStatusQuery as jest.Mock;

const app = express();
app.use(express.json());
app.use("/api/v1/projects", routes);

const ROUTE = "/api/v1/projects/12/approval-workflow";
const get = (role = "Editor", org = "42") =>
  request(app).get(ROUTE).set("Authorization", "Bearer t").set("x-role", role).set("x-org", org);

describe("GET /api/v1/projects/:id/approval-workflow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    accessQuery.mockResolvedValue("allowed");
    readAccessQuery.mockResolvedValue("allowed");
    statusQuery.mockResolvedValue(null);
  });

  it("answers 401 without a token", async () => {
    expect((await request(app).get(ROUTE)).status).toBe(401);
    expect(workflowQuery).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a positive integer", async () => {
    const res = await request(app)
      .get("/api/v1/projects/abc/approval-workflow")
      .set("Authorization", "Bearer t");
    expect(res.status).toBe(400);
    expect(workflowQuery).not.toHaveBeenCalled();
  });

  it("refuses someone who may not read the use case", async () => {
    readAccessQuery.mockResolvedValue("denied");
    const res = await get("Editor");
    expect(res.status).toBe(403);
    expect(readAccessQuery).toHaveBeenCalledWith(12, { userId: 9, role: "Editor" }, 42);
    expect(workflowQuery).not.toHaveBeenCalled();
  });

  it("uses the read rule, so an Auditor who can read the use case gets it", async () => {
    workflowQuery.mockResolvedValue({
      approval_workflow_id: null,
      workflow_title: null,
      workflow_is_active: null,
    });
    // Read access only (a workflow approver or task assignee): the guard lets
    // the read through, and the write rule refuses.
    accessQuery.mockResolvedValue("denied");
    const res = await get("Auditor");
    expect(res.status).toBe(200);
    expect(readAccessQuery).toHaveBeenCalledWith(12, { userId: 9, role: "Auditor" }, 42);
    // The write rule runs once, in the controller for the flag, never as the guard.
    expect(accessQuery).toHaveBeenCalledTimes(1);
    expect(res.body.data.viewer_can_write).toBe(false);
  });

  it("still answers with viewer_can_write false when the write-access lookup fails", async () => {
    workflowQuery.mockResolvedValue({
      approval_workflow_id: 4,
      workflow_title: "Model risk review",
      workflow_is_active: true,
    });
    statusQuery.mockResolvedValue("rejected");
    accessQuery.mockRejectedValue(new Error("db timeout"));
    const res = await get("Editor");
    expect(res.status).toBe(200);
    expect(res.body.data.approval_status).toBe("rejected");
    expect(res.body.data.viewer_can_write).toBe(false);
  });

  it('sets viewer_can_write by the write rule requireProjectAccess(..., "write") applies', async () => {
    // getProjectAccessQuery is the rule the resubmit route's guard uses; it is
    // "allowed" for an Admin, the owner, a member, or a member of a group
    // attached to the use case.
    workflowQuery.mockResolvedValue({
      approval_workflow_id: 4,
      workflow_title: "Model risk review",
      workflow_is_active: true,
    });
    statusQuery.mockResolvedValue("rejected");
    const res = await get("Editor", "7");
    expect(res.status).toBe(200);
    expect(res.body.data.viewer_can_write).toBe(true);
    expect(accessQuery).toHaveBeenCalledWith(12, { userId: 9, role: "Editor" }, 7);
  });

  it("answers viewer_can_write false for a reader the write rule refuses", async () => {
    workflowQuery.mockResolvedValue({
      approval_workflow_id: 4,
      workflow_title: "Model risk review",
      workflow_is_active: true,
    });
    statusQuery.mockResolvedValue("rejected");
    accessQuery.mockResolvedValue("denied");
    const res = await get("Reviewer");
    expect(res.status).toBe(200);
    expect(res.body.data.viewer_can_write).toBe(false);
  });

  it("answers 404 for a use case in another organization", async () => {
    // The guard passes a use case it cannot find in the caller's organization
    // on; the organization-scoped query then finds nothing.
    readAccessQuery.mockResolvedValue("not_found");
    workflowQuery.mockResolvedValue(null);
    const res = await get("Admin", "7");
    expect(res.status).toBe(404);
    expect(workflowQuery).toHaveBeenCalledWith(12, 7);
    expect(statusQuery).not.toHaveBeenCalled();
    expect(accessQuery).not.toHaveBeenCalled();
  });

  it("returns the attached workflow and the approval status, scoped to the organization", async () => {
    workflowQuery.mockResolvedValue({
      approval_workflow_id: 4,
      workflow_title: "Model risk review",
      workflow_is_active: true,
    });
    statusQuery.mockResolvedValue("pending");
    const res = await get("Editor", "7");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      approval_workflow_id: 4,
      workflow_title: "Model risk review",
      workflow_is_active: true,
      approval_status: "pending",
      viewer_can_write: true,
    });
    expect(workflowQuery).toHaveBeenCalledWith(12, 7);
    expect(statusQuery).toHaveBeenCalledWith(12, "use_case", 7);
  });

  it("says when the attached workflow is archived", async () => {
    workflowQuery.mockResolvedValue({
      approval_workflow_id: 4,
      workflow_title: "Old review",
      workflow_is_active: false,
    });
    statusQuery.mockResolvedValue("rejected");
    const res = await get();
    expect(res.body.data).toEqual({
      approval_workflow_id: 4,
      workflow_title: "Old review",
      workflow_is_active: false,
      approval_status: "rejected",
      viewer_can_write: true,
    });
  });

  it("returns nulls for a use case without a workflow", async () => {
    workflowQuery.mockResolvedValue({
      approval_workflow_id: null,
      workflow_title: null,
      workflow_is_active: null,
    });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      approval_workflow_id: null,
      workflow_title: null,
      workflow_is_active: null,
      approval_status: null,
      viewer_can_write: true,
    });
  });

  it("answers 500 when the query fails", async () => {
    workflowQuery.mockRejectedValue(new Error("db down"));
    expect((await get()).status).toBe(500);
  });
});
