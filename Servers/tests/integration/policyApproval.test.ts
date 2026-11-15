jest.setTimeout(60000);

/**
 * Policy approval through the approval workflows (Risks + Policies audit,
 * PR G), against a real database and the real middleware chain.
 *
 * Covers: the seeded "Policy Approval" workflow (a step, no approvers) is not
 * usable, so an Admin approves directly; an organization with a usable
 * workflow submits, and the approver's approve or reject moves the policy;
 * withdraw, and withdraw after a decision; the hand-set status gate on the
 * legacy PUT; the v1 routes deny another organization; deleting a policy or a
 * file rejects its pending request.
 */

import { Agent } from "supertest";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { createTestApp, testRequest } from "./setup";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";

const ADMIN = 1;
const EDITOR = 3;

interface OrgSeed {
  orgId: number;
  adminId: number;
  editorId: number;
  admin: Agent;
  editor: Agent;
}

let seedCounter = 0;

async function agentFor(orgId: number, userId: number, role: string): Promise<Agent> {
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role },
  });
  return testRequest(app);
}

/** One organization with an Admin and an Editor, each with their own agent. */
async function seedOrg(): Promise<OrgSeed> {
  const suffix = `${Date.now()}-${++seedCounter}`;
  const orgId = await createTestOrganization(`Policy approval ${suffix}`);
  const adminId = await createTestUser(orgId, ADMIN, `pa-admin-${suffix}@test.com`, "Password1!");
  const editorId = await createTestUser(
    orgId,
    EDITOR,
    `pa-editor-${suffix}@test.com`,
    "Password1!",
  );
  return {
    orgId,
    adminId,
    editorId,
    admin: await agentFor(orgId, adminId, "Admin"),
    editor: await agentFor(orgId, editorId, "Editor"),
  };
}

/**
 * The workflow migration 20260413175412 seeds for every organization: active,
 * entity_type 'policy', one "Admin Approval" step and no approvers.
 */
async function seedEmptyPolicyWorkflow(orgId: number): Promise<number> {
  const [workflow] = await sequelize.query<{ id: number }>(
    `INSERT INTO approval_workflows
       (organization_id, workflow_title, entity_type, description, is_active, created_at, updated_at)
     VALUES (:orgId, 'Policy Approval', 'policy',
       'Default approval workflow for policy operations', true, NOW(), NOW())
     RETURNING id`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  );
  await sequelize.query(
    `INSERT INTO approval_workflow_steps
       (organization_id, workflow_id, step_number, step_name, description, requires_all_approvers, created_at)
     VALUES (:orgId, :workflowId, 1, 'Admin Approval', 'Requires admin approval', false, NOW())`,
    { replacements: { orgId, workflowId: workflow.id } },
  );
  return workflow.id;
}

/** A one-step workflow with one approver, created through the API. */
async function createWorkflow(
  admin: Agent,
  approverId: number,
  entityType: "policy" | "file" = "policy",
): Promise<number> {
  const res = await admin.post("/api/approval-workflows").send({
    workflow_title: `${entityType} sign-off`,
    entity_type: entityType,
    steps: [{ step_name: "Review", approver_ids: [approverId], requires_all_approvers: false }],
  });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

async function createPolicy(agent: Agent, extra: Record<string, unknown> = {}): Promise<number> {
  const res = await agent.post("/api/policies").send({
    title: `Approval policy ${Date.now()}`,
    content_html: "<p>Body</p>",
    tags: ["Privacy"],
    next_review_date: "2030-01-15",
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

async function submit(agent: Agent, policyId: number): Promise<number> {
  const res = await agent.post(`/api/v1/policies/${policyId}/submit-for-approval`).send({});
  expect(res.status).toBe(201);
  return res.body.data.request_id;
}

interface PolicyRow {
  status: string;
  review_status: string | null;
  review_comment: string | null;
  reviewed_by: number | null;
}

async function readPolicy(policyId: number): Promise<PolicyRow> {
  const [row] = await sequelize.query<PolicyRow>(
    `SELECT status, review_status, review_comment, reviewed_by
     FROM policy_manager WHERE id = :policyId`,
    { replacements: { policyId }, type: QueryTypes.SELECT },
  );
  return row;
}

async function requestStatus(requestId: number): Promise<string> {
  const [row] = await sequelize.query<{ status: string }>(
    `SELECT status FROM approval_requests WHERE id = :requestId`,
    { replacements: { requestId }, type: QueryTypes.SELECT },
  );
  return row.status;
}

/** Pending requests on one entity, in any organization. */
async function pendingRequests(entityType: string, entityId: number): Promise<number> {
  const [row] = await sequelize.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM approval_requests
     WHERE entity_type = :entityType AND entity_id = :entityId AND status = 'Pending'`,
    { replacements: { entityType, entityId }, type: QueryTypes.SELECT },
  );
  return row.count;
}

/** The approver rows of a request, after any decision or delete. */
async function approverResults(
  requestId: number,
): Promise<Array<{ approval_result: string; comments: string | null }>> {
  return sequelize.query(
    `SELECT arsa.approval_result, arsa.comments
     FROM approval_request_step_approvals arsa
     JOIN approval_request_steps ars ON ars.id = arsa.request_step_id
     WHERE ars.request_id = :requestId`,
    { replacements: { requestId }, type: QueryTypes.SELECT },
  );
}

/** Status changes after creation; the history stores the field's label. */
async function statusHistory(
  policyId: number,
): Promise<Array<{ old_value: string; new_value: string; changed_by_user_id: number }>> {
  return sequelize.query(
    `SELECT old_value, new_value, changed_by_user_id
     FROM policy_change_history
     WHERE policy_id = :policyId AND action = 'updated' AND field_name = 'Status'
     ORDER BY id`,
    { replacements: { policyId }, type: QueryTypes.SELECT },
  );
}

describe("Policy approval through approval workflows", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("organization with only the seeded policy workflow", () => {
    it("ignores the workflow with no approvers: submit is 409 and an Admin approves directly", async () => {
      const org = await seedOrg();
      await seedEmptyPolicyWorkflow(org.orgId);
      const policyId = await createPolicy(org.editor);

      const state = await org.admin.get(`/api/v1/policies/${policyId}/approval`);
      expect(state.status).toBe(200);
      expect(state.body.data.usable_workflows).toEqual([]);
      expect(state.body.data.can_submit).toBe(false);
      expect(state.body.data.can_approve_directly).toBe(true);

      const editorState = await org.editor.get(`/api/v1/policies/${policyId}/approval`);
      expect(editorState.body.data.can_approve_directly).toBe(false);

      const submitted = await org.editor
        .post(`/api/v1/policies/${policyId}/submit-for-approval`)
        .send({});
      expect(submitted.status).toBe(409);
      expect(submitted.body.data).toBe(
        "This organization has no policy approval workflow. An Admin can approve the policy directly.",
      );
      expect(await pendingRequests("policy", policyId)).toBe(0);

      const byEditor = await org.editor.post(`/api/v1/policies/${policyId}/approve`).send({});
      expect(byEditor.status).toBe(403);

      const approved = await org.admin
        .post(`/api/v1/policies/${policyId}/approve`)
        .send({ comment: "Reviewed with legal" });
      expect(approved.status).toBe(200);
      expect(approved.body.data.status).toBe("Approved");

      expect(await readPolicy(policyId)).toMatchObject({
        status: "Approved",
        review_status: "approved",
        review_comment: "Reviewed with legal",
        reviewed_by: org.adminId,
      });
      expect(await statusHistory(policyId)).toEqual([
        { old_value: "Draft", new_value: "Approved", changed_by_user_id: org.adminId },
      ]);

      // Approving again is refused: the policy is no longer Draft or Under Review.
      const again = await org.admin.post(`/api/v1/policies/${policyId}/approve`).send({});
      expect(again.status).toBe(409);

      // Published by hand, only now that it is Approved.
      const published = await org.editor
        .put(`/api/policies/${policyId}`)
        .send({ status: "Published" });
      expect(published.status).toBe(202);
      expect((await readPolicy(policyId)).status).toBe("Published");
    });
  });

  describe("organization with a usable one-step policy workflow", () => {
    it("submits, then the approver's approval makes the policy Approved", async () => {
      const org = await seedOrg();
      await seedEmptyPolicyWorkflow(org.orgId);
      const workflowId = await createWorkflow(org.admin, org.adminId);
      const policyId = await createPolicy(org.editor);

      const before = await org.editor.get(`/api/v1/policies/${policyId}/approval`);
      expect(before.status).toBe(200);
      expect(before.body.data.usable_workflows).toEqual([
        { id: workflowId, workflow_title: "policy sign-off", step_count: 1 },
      ]);
      expect(before.body.data.can_submit).toBe(true);

      // With a usable workflow the Admin cannot skip it.
      const direct = await org.admin.post(`/api/v1/policies/${policyId}/approve`).send({});
      expect(direct.status).toBe(409);
      expect(direct.body.data).toBe("Use the approval workflow");

      // A numeric string is not a workflow id.
      const stringId = await org.editor
        .post(`/api/v1/policies/${policyId}/submit-for-approval`)
        .send({ workflow_id: String(workflowId) });
      expect(stringId.status).toBe(400);
      expect(stringId.body.data.errors[0].field).toBe("workflow_id");

      const submitted = await org.editor
        .post(`/api/v1/policies/${policyId}/submit-for-approval`)
        .send({ workflow_id: workflowId });
      expect(submitted.status).toBe(201);
      expect(submitted.body.data.policy.status).toBe("Under Review");
      const requestId = submitted.body.data.request_id;

      const [request] = await sequelize.query<{
        status: string;
        entity_type: string;
        entity_id: number;
        workflow_id: number;
        requested_by: number;
        organization_id: number;
      }>(
        `SELECT status, entity_type, entity_id, workflow_id, requested_by, organization_id
         FROM approval_requests WHERE id = :requestId`,
        { replacements: { requestId }, type: QueryTypes.SELECT },
      );
      expect(request).toEqual({
        status: "Pending",
        entity_type: "policy",
        entity_id: policyId,
        workflow_id: workflowId,
        requested_by: org.editorId,
        organization_id: org.orgId,
      });
      expect(await readPolicy(policyId)).toMatchObject({
        status: "Under Review",
        review_status: "pending_review",
      });

      const twice = await org.editor
        .post(`/api/v1/policies/${policyId}/submit-for-approval`)
        .send({});
      expect(twice.status).toBe(409);
      expect(twice.body.data).toBe("This policy already has a pending approval request");

      const pending = await org.editor.get(`/api/v1/policies/${policyId}/approval`);
      expect(pending.body.data.pending_request).toMatchObject({
        id: requestId,
        workflow_id: workflowId,
        current_step: 1,
        total_steps: 1,
        requested_by: org.editorId,
      });
      expect(pending.body.data.can_submit).toBe(false);
      expect(pending.body.data.can_withdraw).toBe(true);

      const decided = await org.admin
        .post(`/api/approval-requests/${requestId}/approve`)
        .send({ comments: "Fine to publish" });
      expect(decided.status).toBe(200);

      expect(await requestStatus(requestId)).toBe("Approved");
      expect(await readPolicy(policyId)).toMatchObject({
        status: "Approved",
        review_status: "approved",
        review_comment: "Fine to publish",
        reviewed_by: org.adminId,
      });
      expect(await statusHistory(policyId)).toEqual([
        { old_value: "Draft", new_value: "Under Review", changed_by_user_id: org.editorId },
        { old_value: "Under Review", new_value: "Approved", changed_by_user_id: org.adminId },
      ]);

      // A decided request cannot be withdrawn, so the policy stays Approved.
      const withdrawn = await org.editor.post(`/api/approval-requests/${requestId}/withdraw`);
      expect(withdrawn.status).toBe(409);
      expect(await requestStatus(requestId)).toBe("Approved");
      expect((await readPolicy(policyId)).status).toBe("Approved");
    });

    it("rejecting the request sends the policy back to Draft with the comment", async () => {
      const org = await seedOrg();
      await createWorkflow(org.admin, org.adminId);
      const policyId = await createPolicy(org.editor);
      const requestId = await submit(org.editor, policyId);

      const rejected = await org.admin
        .post(`/api/approval-requests/${requestId}/reject`)
        .send({ comments: "Add a retention section" });
      expect(rejected.status).toBe(200);

      expect(await requestStatus(requestId)).toBe("Rejected");
      expect(await readPolicy(policyId)).toMatchObject({
        status: "Draft",
        review_status: "changes_requested",
        review_comment: "Add a retention section",
        reviewed_by: org.adminId,
      });

      const state = await org.editor.get(`/api/v1/policies/${policyId}/approval`);
      expect(state.body.data.pending_request).toBeNull();
      expect(state.body.data.review_status).toBe("changes_requested");
      expect(state.body.data.can_submit).toBe(true);

      // The author edits and sends it again.
      const resubmitted = await org.editor
        .post(`/api/v1/policies/${policyId}/submit-for-approval`)
        .send({});
      expect(resubmitted.status).toBe(201);
      expect((await readPolicy(policyId)).review_comment).toBeNull();
    });

    it("withdrawing the request sends the policy back to Draft", async () => {
      const org = await seedOrg();
      await createWorkflow(org.admin, org.adminId);
      const policyId = await createPolicy(org.editor);
      const requestId = await submit(org.editor, policyId);

      // Only the requester withdraws.
      const byAdmin = await org.admin.post(`/api/approval-requests/${requestId}/withdraw`);
      expect(byAdmin.status).toBe(403);

      const withdrawn = await org.editor.post(`/api/approval-requests/${requestId}/withdraw`);
      expect(withdrawn.status).toBe(200);

      expect(await requestStatus(requestId)).toBe("Withdrawn");
      expect(await readPolicy(policyId)).toMatchObject({ status: "Draft", review_status: null });

      const again = await org.editor.post(`/api/approval-requests/${requestId}/withdraw`);
      expect(again.status).toBe(409);
    });

    it("refuses a policy request opened through the generic approval request endpoint", async () => {
      const org = await seedOrg();
      const workflowId = await createWorkflow(org.admin, org.adminId);
      const policyId = await createPolicy(org.editor);

      const res = await org.editor.post("/api/approval-requests").send({
        request_name: "Sneaky",
        workflow_id: workflowId,
        entity_type: "policy",
        entity_id: policyId,
      });
      expect(res.status).toBe(400);
      expect(await pendingRequests("policy", policyId)).toBe(0);
      expect((await readPolicy(policyId)).status).toBe("Draft");
    });
  });

  describe("hand-set status gate on the legacy policy endpoints", () => {
    it("rejects Under Review, Approved and Published set by an Editor", async () => {
      const org = await seedOrg();
      const policyId = await createPolicy(org.editor);

      for (const status of ["Under Review", "Approved", "Published"]) {
        const res = await org.editor.put(`/api/policies/${policyId}`).send({ status });
        expect(res.status).toBe(400);
        expect(res.body.data.errors[0].field).toBe("status");
      }
      expect((await readPolicy(policyId)).status).toBe("Draft");

      // The editor sends the status on every save; the same status is not a change.
      const unchanged = await org.editor
        .put(`/api/policies/${policyId}`)
        .send({ status: "Draft", tags: ["Security"] });
      expect(unchanged.status).toBe(202);

      for (const status of ["Under Review", "Approved", "Published"]) {
        const created = await org.editor.post("/api/policies").send({
          title: `Created as ${status}`,
          content_html: "<p>x</p>",
          status,
        });
        expect(created.status).toBe(400);
        expect(created.body.data.errors[0].field).toBe("status");
      }

      // Draft, Archived and Deprecated stay settable by hand.
      const archived = await org.editor
        .put(`/api/policies/${policyId}`)
        .send({ status: "Archived" });
      expect(archived.status).toBe(202);
      expect((await readPolicy(policyId)).status).toBe("Archived");
    });

    it("blocks a status change while a request is pending, single and bulk", async () => {
      const org = await seedOrg();
      await createWorkflow(org.admin, org.adminId);
      const policyId = await createPolicy(org.editor);
      await submit(org.editor, policyId);

      const changed = await org.editor
        .put(`/api/policies/${policyId}`)
        .send({ status: "Archived" });
      expect(changed.status).toBe(400);
      expect(changed.body.data.errors[0]).toMatchObject({
        field: "status",
        message: "Withdraw the approval request before changing the status",
      });

      const sameStatus = await org.editor
        .put(`/api/policies/${policyId}`)
        .send({ status: "Under Review", tags: ["Security"] });
      expect(sameStatus.status).toBe(202);

      const bulk = await org.editor
        .patch("/api/policies/bulk")
        .send({ ids: [policyId], action: "archive" });
      expect(bulk.status).toBe(400);

      expect((await readPolicy(policyId)).status).toBe("Under Review");
      expect(await pendingRequests("policy", policyId)).toBe(1);
    });
  });

  describe("another organization", () => {
    it("gets 404 from the approval state, submit and approve routes", async () => {
      const owner = await seedOrg();
      const attacker = await seedOrg();
      // A usable workflow in the attacker's organization, so a leak past the
      // organization check would open a request instead of failing.
      await createWorkflow(attacker.admin, attacker.adminId);
      const policyId = await createPolicy(owner.editor);

      const ownerState = await owner.admin.get(`/api/v1/policies/${policyId}/approval`);
      expect(ownerState.status).toBe(200);

      const state = await attacker.admin.get(`/api/v1/policies/${policyId}/approval`);
      expect(state.status).toBe(404);

      const submitted = await attacker.admin
        .post(`/api/v1/policies/${policyId}/submit-for-approval`)
        .send({});
      expect(submitted.status).toBe(404);

      const approved = await attacker.admin
        .post(`/api/v1/policies/${policyId}/approve`)
        .send({ comment: "Not mine" });
      expect(approved.status).toBe(404);

      expect(await readPolicy(policyId)).toMatchObject({
        status: "Draft",
        review_status: null,
        reviewed_by: null,
      });
      expect(await pendingRequests("policy", policyId)).toBe(0);
    });
  });

  describe("deleting the entity", () => {
    it("rejects the pending request of a deleted policy", async () => {
      const org = await seedOrg();
      await createWorkflow(org.admin, org.adminId);
      const policyId = await createPolicy(org.editor);
      const requestId = await submit(org.editor, policyId);

      const deleted = await org.editor.delete(`/api/policies/${policyId}`);
      expect(deleted.status).toBe(202);

      expect(await requestStatus(requestId)).toBe("Rejected");
      expect(await pendingRequests("policy", policyId)).toBe(0);
      expect(await approverResults(requestId)).toEqual([
        { approval_result: "Rejected", comments: "The policy was deleted." },
      ]);
    });

    it("rejects the pending request of a deleted file", async () => {
      const org = await seedOrg();
      const workflowId = await createWorkflow(org.admin, org.adminId, "file");

      const uploaded = await org.admin
        .post("/api/file-manager")
        .field("approval_workflow_id", String(workflowId))
        .attach("file", Buffer.from("col_a,col_b\n1,2\n"), {
          filename: "evidence.csv",
          contentType: "text/csv",
        });
      expect(uploaded.status).toBe(201);
      const fileId = uploaded.body.data.id;

      const [file] = await sequelize.query<{ approval_request_id: number | null }>(
        `SELECT approval_request_id FROM files WHERE id = :fileId`,
        { replacements: { fileId }, type: QueryTypes.SELECT },
      );
      expect(file.approval_request_id).not.toBeNull();
      const requestId = Number(file.approval_request_id);
      expect(await requestStatus(requestId)).toBe("Pending");

      const deleted = await org.admin.delete(`/api/file-manager/${fileId}`);
      expect(deleted.status).toBe(200);

      expect(await requestStatus(requestId)).toBe("Rejected");
      expect(await pendingRequests("file", fileId)).toBe(0);
      const approvers = await approverResults(requestId);
      expect(approvers).toHaveLength(1);
      expect(approvers[0].approval_result).toBe("Rejected");
    });
  });
});
