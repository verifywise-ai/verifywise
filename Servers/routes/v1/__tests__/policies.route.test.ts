import request from "supertest";
import express from "express";

jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ message: "Unauthorized" });
    req.userId = Number(req.headers["x-user"] ?? 9);
    req.organizationId = Number(req.headers["x-org"] ?? 42);
    req.role = (req.headers["x-role"] as string) ?? "Admin";
    req.t = (key: string) => `t:${key}`;
    next();
  },
}));
// The real middleware checks the role's permission; a header stands in for a
// role without policy.edit.
jest.mock("../../../middleware/accessControl.middleware", () => ({
  __esModule: true,
  default: jest.fn(
    (permission: string) => (req: any, res: any, next: any) =>
      permission === "policy.edit" && req.headers["x-no-edit"]
        ? res.status(403).json({ message: "Forbidden" })
        : next(),
  ),
}));
jest.mock("../../../services/policies/policyApproval.service", () => ({
  submitPolicyForApproval: jest.fn(),
  approvePolicyDirectly: jest.fn(),
  getPolicyApprovalState: jest.fn(),
  POLICY_APPROVAL_MESSAGES: {
    unusableWorkflow: "Choose an approval workflow with an approver on every step",
  },
}));
// policy.ctrl is imported for its 400 body helper; keep its DB-backed
// dependencies inert.
jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(async () => undefined),
  logFailure: jest.fn(async () => undefined),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));

import { sequelize } from "../../../database/db";
import routes from "../policies.route";
import * as service from "../../../services/policies/policyApproval.service";
import { logFailure } from "../../../utils/logger/logHelper";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from "../../../domain.layer/exceptions/custom.exception";

const submit = service.submitPolicyForApproval as jest.Mock;
const approve = service.approvePolicyDirectly as jest.Mock;
const getState = service.getPolicyApprovalState as jest.Mock;

const app = express();
app.use(express.json());
app.use("/api/v1/policies", routes);

const BASE = "/api/v1/policies";
const auth = { Authorization: "Bearer t" };

const STATE = {
  usable_workflows: [{ id: 3, workflow_title: "Legal sign-off", step_count: 2 }],
  pending_request: null,
  review_status: null,
  review_comment: null,
  reviewed_by: null,
  reviewed_by_name: null,
  reviewed_at: null,
  can_submit: true,
  can_approve_directly: false,
  can_withdraw: false,
};

describe("/api/v1/policies approval endpoints", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("authentication", () => {
    it("answers 401 without a token on every endpoint", async () => {
      expect((await request(app).get(`${BASE}/5/approval`)).status).toBe(401);
      expect((await request(app).post(`${BASE}/5/submit-for-approval`).send({})).status).toBe(401);
      expect((await request(app).post(`${BASE}/5/approve`).send({})).status).toBe(401);
      expect(submit).not.toHaveBeenCalled();
      expect(approve).not.toHaveBeenCalled();
      expect(getState).not.toHaveBeenCalled();
    });
  });

  describe("invalid ids", () => {
    it.each(["abc", "0", "-1", "5x", "1.5"])("answers 400 for id %s", async (id) => {
      const res = await request(app).get(`${BASE}/${id}/approval`).set(auth);
      expect(res.status).toBe(400);
      expect(res.body.data).toBe("t:Invalid policy ID");
      expect((await request(app).post(`${BASE}/${id}/submit-for-approval`).set(auth)).status).toBe(
        400,
      );
      expect((await request(app).post(`${BASE}/${id}/approve`).set(auth)).status).toBe(400);
      expect(getState).not.toHaveBeenCalled();
    });
  });

  describe("GET /:id/approval", () => {
    it("returns the approval state for the caller's organization, user and role", async () => {
      getState.mockResolvedValue(STATE);
      const res = await request(app)
        .get(`${BASE}/5/approval`)
        .set(auth)
        .set("x-role", "Auditor")
        .set("x-no-edit", "1");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: "OK", data: STATE });
      expect(getState).toHaveBeenCalledWith({ orgId: 42, policyId: 5, userId: 9, role: "Auditor" });
    });

    it("answers 404 for a policy in another organization", async () => {
      getState.mockRejectedValue(new NotFoundException("Policy not found", "policy", 5));
      const res = await request(app).get(`${BASE}/5/approval`).set(auth).set("x-org", "77");
      expect(res.status).toBe(404);
      expect(res.body.data).toBe("t:Policy not found");
      expect(getState).toHaveBeenCalledWith(expect.objectContaining({ orgId: 77 }));
    });

    it("answers 500 and logs an unexpected failure", async () => {
      getState.mockRejectedValue(new Error("db down"));
      const res = await request(app).get(`${BASE}/5/approval`).set(auth);
      expect(res.status).toBe(500);
      expect(logFailure).toHaveBeenCalled();
    });
  });

  describe("POST /:id/submit-for-approval", () => {
    it("opens a request and answers 201 with the request id and policy", async () => {
      const policy = { id: 5, status: "Under Review" };
      submit.mockResolvedValue({ request_id: 11, policy });
      const res = await request(app)
        .post(`${BASE}/5/submit-for-approval`)
        .set(auth)
        .send({ workflow_id: 3, organization_id: 99 });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ message: "Created", data: { request_id: 11, policy } });
      // The organization always comes from the token, never the body.
      expect(submit).toHaveBeenCalledWith({ orgId: 42, policyId: 5, userId: 9, workflowId: 3 });
    });

    it("lets the service pick the workflow when none is given", async () => {
      submit.mockResolvedValue({ request_id: 11, policy: {} });
      const res = await request(app).post(`${BASE}/5/submit-for-approval`).set(auth).send({});
      expect(res.status).toBe(201);
      expect(submit).toHaveBeenCalledWith({
        orgId: 42,
        policyId: 5,
        userId: 9,
        workflowId: undefined,
      });
    });

    it("needs policy.edit", async () => {
      const res = await request(app)
        .post(`${BASE}/5/submit-for-approval`)
        .set(auth)
        .set("x-no-edit", "1")
        .send({});
      expect(res.status).toBe(403);
      expect(submit).not.toHaveBeenCalled();
    });

    it.each([["3"], [0], [-2], [1.5], [true], [{}]])(
      "answers 400 on field workflow_id for workflow_id %p",
      async (workflowId) => {
        const res = await request(app)
          .post(`${BASE}/5/submit-for-approval`)
          .set(auth)
          .send({ workflow_id: workflowId });
        expect(res.status).toBe(400);
        expect(res.body.data.errors).toEqual([
          {
            field: "workflow_id",
            message: "t:Choose an approval workflow with an approver on every step",
          },
        ]);
        expect(submit).not.toHaveBeenCalled();
      },
    );

    it("maps the service's field error to a 400 field body", async () => {
      submit.mockRejectedValue(
        new ValidationException("Choose an approval workflow", "workflow_id"),
      );
      const res = await request(app).post(`${BASE}/5/submit-for-approval`).set(auth).send({});
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        message: "Bad Request",
        data: {
          message: "t:Choose an approval workflow",
          errors: [{ field: "workflow_id", message: "t:Choose an approval workflow" }],
        },
      });
    });

    it("answers 404 for a policy in another organization", async () => {
      submit.mockRejectedValue(new NotFoundException("Policy not found", "policy", 5));
      const res = await request(app)
        .post(`${BASE}/5/submit-for-approval`)
        .set(auth)
        .set("x-org", "77")
        .send({});
      expect(res.status).toBe(404);
      expect(submit).toHaveBeenCalledWith(expect.objectContaining({ orgId: 77 }));
    });

    it.each([
      "This policy already has a pending approval request",
      "Only a draft or under review policy can be submitted or approved",
      "This organization has no policy approval workflow. An Admin can approve the policy directly.",
    ])("answers 409 with the translated message: %s", async (message) => {
      submit.mockRejectedValue(new ConflictException(message, "policy"));
      const res = await request(app).post(`${BASE}/5/submit-for-approval`).set(auth).send({});
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ message: "Conflict", data: `t:${message}` });
      expect(logFailure).not.toHaveBeenCalled();
    });

    it("answers 500 and logs an unexpected failure", async () => {
      submit.mockRejectedValue(new Error("db down"));
      const res = await request(app).post(`${BASE}/5/submit-for-approval`).set(auth).send({});
      expect(res.status).toBe(500);
      expect(logFailure).toHaveBeenCalled();
    });
  });

  describe("POST /:id/approve", () => {
    it("approves and answers 200 with the policy", async () => {
      const policy = { id: 5, status: "Approved" };
      approve.mockResolvedValue(policy);
      const res = await request(app)
        .post(`${BASE}/5/approve`)
        .set(auth)
        .send({ comment: "Looks good" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: "OK", data: policy });
      expect(approve).toHaveBeenCalledWith({
        orgId: 42,
        policyId: 5,
        userId: 9,
        role: "Admin",
        comment: "Looks good",
      });
    });

    it("needs policy.edit", async () => {
      const res = await request(app)
        .post(`${BASE}/5/approve`)
        .set(auth)
        .set("x-no-edit", "1")
        .send({});
      expect(res.status).toBe(403);
      expect(approve).not.toHaveBeenCalled();
    });

    it("answers 403 when the service refuses a non-admin", async () => {
      approve.mockRejectedValue(
        new ForbiddenException("Only an Admin can approve a policy directly", "policy", "approve"),
      );
      const res = await request(app)
        .post(`${BASE}/5/approve`)
        .set(auth)
        .set("x-role", "Editor")
        .send({});
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        message: "Forbidden",
        data: "t:Only an Admin can approve a policy directly",
      });
      expect(approve).toHaveBeenCalledWith(expect.objectContaining({ role: "Editor" }));
    });

    it("answers 400 on field comment for a comment that is too long", async () => {
      approve.mockRejectedValue(
        new ValidationException("Comment must be 2000 characters or fewer", "comment"),
      );
      const res = await request(app)
        .post(`${BASE}/5/approve`)
        .set(auth)
        .send({ comment: "x".repeat(2001) });
      expect(res.status).toBe(400);
      expect(res.body.data.errors).toEqual([
        { field: "comment", message: "t:Comment must be 2000 characters or fewer" },
      ]);
    });

    it("answers 404 for a policy in another organization", async () => {
      approve.mockRejectedValue(new NotFoundException("Policy not found", "policy", 5));
      const res = await request(app)
        .post(`${BASE}/5/approve`)
        .set(auth)
        .set("x-org", "77")
        .send({});
      expect(res.status).toBe(404);
      expect(approve).toHaveBeenCalledWith(expect.objectContaining({ orgId: 77 }));
    });

    it("answers 409 when the organization has a usable workflow", async () => {
      approve.mockRejectedValue(
        new ConflictException("Use the approval workflow", "approval_workflow"),
      );
      const res = await request(app).post(`${BASE}/5/approve`).set(auth).send({});
      expect(res.status).toBe(409);
      expect(res.body.data).toBe("t:Use the approval workflow");
    });
  });
});

describe("GET /api/v1/policies/folder-counts", () => {
  const query = sequelize.query as jest.Mock;
  beforeEach(() => jest.clearAllMocks());

  it("answers 401 without a token", async () => {
    expect((await request(app).get(`${BASE}/folder-counts`)).status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it("returns the counts keyed by folder id, scoped to the caller's organization", async () => {
    query.mockResolvedValueOnce([
      { folder_id: 3, policy_count: 2 },
      { folder_id: 7, policy_count: 1 },
    ]);
    const res = await request(app).get(`${BASE}/folder-counts`).set(auth).set("x-org", "42");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ "3": 2, "7": 1 });
    expect(query.mock.calls[0][1].replacements).toEqual({ organizationId: 42 });
    // Not read as a policy id by the /:id/approval route
    expect(getState).not.toHaveBeenCalled();
  });

  it("returns an empty object when no folder holds a policy", async () => {
    query.mockResolvedValueOnce([]);
    const res = await request(app).get(`${BASE}/folder-counts`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({});
  });

  it("answers 500 when the query fails", async () => {
    query.mockRejectedValueOnce(new Error("db down"));
    const res = await request(app).get(`${BASE}/folder-counts`).set(auth);
    expect(res.status).toBe(500);
  });
});
