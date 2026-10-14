import { createTestApp, testRequest } from "./setup";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";
import { createTestProject } from "../factories";
import { sequelize } from "../../database/db";

const ADMIN_EMAIL = "approval-admin@test.com";
const ADMIN_PASSWORD = "ApprovalAdmin1!";

const setProjectRiskClassification = async (
  organizationId: number,
  projectId: number,
  risk: string | null,
) => {
  await sequelize.query(
    `UPDATE projects SET ai_risk_classification = :risk
     WHERE organization_id = :organizationId AND id = :projectId`,
    { replacements: { organizationId, projectId, risk } },
  );
};

describe("Approval Workflows API", () => {
  let orgId: number;
  let userId: number;

  beforeEach(async () => {
    orgId = await createTestOrganization();
    userId = await createTestUser(orgId, 1, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("POST /api/approval-workflows", () => {
    const validWorkflowPayload = {
      workflow_title: "Test Approval Workflow",
      entity_type: "vendor",
      description: "A test workflow for integration tests",
      steps: [
        {
          step_name: "Review",
          approver_ids: [1],
          requires_all_approvers: true,
        },
      ],
    };

    it("creates an approval workflow with bypassAuth (201)", async () => {
      const app = await createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      const res = await testRequest(app).post("/api/approval-workflows").send(validWorkflowPayload);

      expect(res.status).toBe(201);
      expect(res.body.data.workflow_title).toBe("Test Approval Workflow");
      expect(res.body.data.entity_type).toBe("vendor");
    });

    it("returns 400 for missing workflow title", async () => {
      const app = await createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      const { workflow_title, ...incompletePayload } = validWorkflowPayload;
      const res = await testRequest(app).post("/api/approval-workflows").send(incompletePayload);

      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid entity_type", async () => {
      const app = await createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      const res = await testRequest(app)
        .post("/api/approval-workflows")
        .send({ ...validWorkflowPayload, entity_type: "invalid_type" });

      expect(res.status).toBe(400);
    });

    it("returns 403 for non-admin user", async () => {
      const app = await createTestApp();
      const nonAdminOrgId = await createTestOrganization();
      await createTestUser(nonAdminOrgId, 3, "editor@test.com", "EditorPass1!");

      const loginRes = await testRequest(app)
        .post("/api/users/login")
        .send({ email: "editor@test.com", password: "EditorPass1!" });
      expect(loginRes.status).toBe(202);
      const token = loginRes.body.data.token;

      const res = await testRequest(app)
        .post("/api/approval-workflows")
        .set("Authorization", `Bearer ${token}`)
        .send(validWorkflowPayload);

      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/approval-requests", () => {
    it("creates an approval request referencing a workflow (201)", async () => {
      const app = await createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      // First create a workflow
      const workflowRes = await testRequest(app)
        .post("/api/approval-workflows")
        .send({
          workflow_title: "Request Test Workflow",
          entity_type: "vendor",
          steps: [
            {
              step_name: "Approve",
              approver_ids: [userId],
              requires_all_approvers: false,
            },
          ],
        });
      expect(workflowRes.status).toBe(201);
      const workflowId = workflowRes.body.data.id;

      // Create an approval request referencing that workflow
      const requestRes = await testRequest(app)
        .post("/api/approval-requests")
        .send({ request_name: "Test Approval Request", workflow_id: workflowId });

      expect(requestRes.status).toBe(201);
      expect(requestRes.body.data.request_name).toBe("Test Approval Request");
    });

    it("returns 400 for missing request name", async () => {
      const app = await createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      const res = await testRequest(app).post("/api/approval-requests").send({ workflow_id: 999 });

      expect(res.status).toBe(400);
    });

    it("returns 404 for nonexistent workflow", async () => {
      const app = await createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      const res = await testRequest(app)
        .post("/api/approval-requests")
        .send({ request_name: "Ghost Request", workflow_id: 99999 });

      expect(res.status).toBe(404);
    });
  });

  describe("SLA, escalation, and risk-based auto-approval", () => {
    const appFor = () =>
      createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

    it("stores sla_hours and escalation_user_id on workflow steps (201)", async () => {
      const app = await appFor();

      const res = await testRequest(app)
        .post("/api/approval-workflows")
        .send({
          workflow_title: "SLA Workflow",
          entity_type: "vendor",
          steps: [
            {
              step_name: "Review",
              approver_ids: [userId],
              requires_all_approvers: false,
              sla_hours: 48,
              escalation_user_id: userId,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.steps[0].sla_hours).toBe(48);
      expect(res.body.data.steps[0].escalation_user_id).toBe(userId);
    });

    it("accepts auto_approve_max_risk on use_case workflows (201)", async () => {
      const app = await appFor();

      const res = await testRequest(app)
        .post("/api/approval-workflows")
        .send({
          workflow_title: "Auto-approve Workflow",
          entity_type: "use_case",
          auto_approve_max_risk: "Limited risk",
          steps: [{ step_name: "Review", approver_ids: [userId], requires_all_approvers: false }],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.auto_approve_max_risk).toBe("Limited risk");
    });

    it("rejects auto_approve_max_risk on non-use_case workflows (400)", async () => {
      const app = await appFor();

      const res = await testRequest(app)
        .post("/api/approval-workflows")
        .send({
          workflow_title: "Vendor Auto-approve",
          entity_type: "vendor",
          auto_approve_max_risk: "Minimal risk",
          steps: [{ step_name: "Review", approver_ids: [userId], requires_all_approvers: false }],
        });

      expect(res.status).toBe(400);
    });

    it("rejects unsupported threshold values like GPAI (400)", async () => {
      const app = await appFor();

      const res = await testRequest(app)
        .post("/api/approval-workflows")
        .send({
          workflow_title: "Bad Threshold",
          entity_type: "use_case",
          auto_approve_max_risk: "GPAI",
          steps: [{ step_name: "Review", approver_ids: [userId], requires_all_approvers: false }],
        });

      expect(res.status).toBe(400);
    });

    it("rejects non-positive sla_hours (400)", async () => {
      const app = await appFor();

      const res = await testRequest(app)
        .post("/api/approval-workflows")
        .send({
          workflow_title: "Bad SLA",
          entity_type: "vendor",
          steps: [
            {
              step_name: "Review",
              approver_ids: [userId],
              requires_all_approvers: false,
              sla_hours: 0,
            },
          ],
        });

      expect(res.status).toBe(400);
    });

    it("rejects an escalation user outside the organization (400)", async () => {
      const app = await appFor();
      const otherOrgId = await createTestOrganization();
      const outsiderId = await createTestUser(otherOrgId, 1, "outsider@test.com", "Outsider1!");

      const res = await testRequest(app)
        .post("/api/approval-workflows")
        .send({
          workflow_title: "Bad Escalation Target",
          entity_type: "vendor",
          steps: [
            {
              step_name: "Review",
              approver_ids: [userId],
              requires_all_approvers: false,
              escalation_user_id: outsiderId,
            },
          ],
        });

      expect(res.status).toBe(400);
    });

    it("sets due_at on the active step only when steps have an SLA", async () => {
      const app = await appFor();

      const workflowRes = await testRequest(app)
        .post("/api/approval-workflows")
        .send({
          workflow_title: "Two-step SLA Workflow",
          entity_type: "vendor",
          steps: [
            {
              step_name: "First",
              approver_ids: [userId],
              requires_all_approvers: false,
              sla_hours: 24,
            },
            {
              step_name: "Second",
              approver_ids: [userId],
              requires_all_approvers: false,
              sla_hours: 48,
            },
          ],
        });
      expect(workflowRes.status).toBe(201);

      const requestRes = await testRequest(app)
        .post("/api/approval-requests")
        .send({ request_name: "SLA Request", workflow_id: workflowRes.body.data.id });
      expect(requestRes.status).toBe(201);

      const detailRes = await testRequest(app).get(
        `/api/approval-requests/${requestRes.body.data.id}`,
      );
      expect(detailRes.status).toBe(200);
      const steps = detailRes.body.data.steps;
      const step1 = steps.find((s: any) => s.step_number === 1);
      const step2 = steps.find((s: any) => s.step_number === 2);
      expect(step1.due_at).toBeTruthy();
      expect(step1.sla_hours).toBe(24);
      expect(step2.due_at).toBeNull();
    });

    it("auto-approves a use case whose server-side risk is at or below the threshold", async () => {
      const app = await appFor();

      const workflowRes = await testRequest(app)
        .post("/api/approval-workflows")
        .send({
          workflow_title: "Auto Workflow",
          entity_type: "use_case",
          auto_approve_max_risk: "Limited risk",
          steps: [{ step_name: "Review", approver_ids: [userId], requires_all_approvers: false }],
        });
      expect(workflowRes.status).toBe(201);

      const projectId = await createTestProject(orgId, userId, {});
      await setProjectRiskClassification(orgId, projectId, "Minimal risk");

      const requestRes = await testRequest(app).post("/api/approval-requests").send({
        request_name: "Auto-approved Request",
        workflow_id: workflowRes.body.data.id,
        entity_id: projectId,
        entity_type: "use_case",
      });

      expect(requestRes.status).toBe(201);
      expect(requestRes.body.data.status).toBe("Approved");
      expect(requestRes.body.data.auto_approved_at).toBeTruthy();
      expect(requestRes.body.data.auto_approval_risk_level).toBe("Minimal risk");

      // Audit trail: steps completed with a system note, approver rows resolved
      const detailRes = await testRequest(app).get(
        `/api/approval-requests/${requestRes.body.data.id}`,
      );
      const steps = detailRes.body.data.steps;
      expect(steps.every((s: any) => s.status === "Completed")).toBe(true);
      expect(steps[0].step_details.auto_approved).toBe(true);
      expect(steps[0].step_details.actor).toBe("system");
      expect(steps[0].approvals[0].approval_result).toBe("Approved");
    });

    it("never trusts client-supplied entity_data for the risk decision", async () => {
      const app = await appFor();

      const workflowRes = await testRequest(app)
        .post("/api/approval-workflows")
        .send({
          workflow_title: "Spoof Target Workflow",
          entity_type: "use_case",
          auto_approve_max_risk: "Limited risk",
          steps: [{ step_name: "Review", approver_ids: [userId], requires_all_approvers: false }],
        });
      expect(workflowRes.status).toBe(201);

      const projectId = await createTestProject(orgId, userId, {});
      await setProjectRiskClassification(orgId, projectId, "High risk");

      const requestRes = await testRequest(app)
        .post("/api/approval-requests")
        .send({
          request_name: "Spoofed Request",
          workflow_id: workflowRes.body.data.id,
          entity_id: projectId,
          entity_type: "use_case",
          // Client claims Minimal risk; the project row says High risk
          entity_data: { ai_risk_classification: "Minimal risk" },
        });

      expect(requestRes.status).toBe(201);
      expect(requestRes.body.data.status).toBe("Pending");
      expect(requestRes.body.data.auto_approved_at).toBeNull();
    });

    it("does not auto-approve unsupported classifications (GPAI)", async () => {
      const app = await appFor();

      const workflowRes = await testRequest(app)
        .post("/api/approval-workflows")
        .send({
          workflow_title: "GPAI Workflow",
          entity_type: "use_case",
          auto_approve_max_risk: "Prohibited",
          steps: [{ step_name: "Review", approver_ids: [userId], requires_all_approvers: false }],
        });
      expect(workflowRes.status).toBe(201);

      const projectId = await createTestProject(orgId, userId, {});
      await setProjectRiskClassification(orgId, projectId, "GPAI");

      const requestRes = await testRequest(app).post("/api/approval-requests").send({
        request_name: "GPAI Request",
        workflow_id: workflowRes.body.data.id,
        entity_id: projectId,
        entity_type: "use_case",
      });

      expect(requestRes.status).toBe(201);
      expect(requestRes.body.data.status).toBe("Pending");
      expect(requestRes.body.data.auto_approved_at).toBeNull();
    });
  });
});
