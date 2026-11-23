jest.setTimeout(60000);

/**
 * The critical incident response workflow against the real schema
 * (incidents PR D: I-M6, I-L9 / Decision 8, Decision 9).
 *
 *  - The run finds its incident by id, however many newer incidents exist.
 *  - It starts when an incident is created critical, and when an update
 *    raises an existing incident into the critical tier; never a second
 *    run for the same incident.
 *  - Approving the first gate creates ONE remediation task for the owner;
 *    approving the second notifies every Admin in the app and by email; a
 *    repeated execution creates and sends nothing more.
 *
 * Redis, email and automation queues are stubbed; the workflow engine, the
 * approval gateway and every query run for real.
 */

jest.mock("../../database/redis", () => ({
  __esModule: true,
  default: {
    publish: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue("OK"),
    del: jest.fn().mockResolvedValue(1),
    on: jest.fn().mockReturnThis(),
    quit: jest.fn().mockResolvedValue("OK"),
    disconnect: jest.fn(),
  },
  REDIS_URL: "redis://localhost:6379/0",
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestIncident } from "../factories/test-entities.factory";
import { register } from "../../services/workflows/registry";
import { incidentResponseWorkflow } from "../../services/workflows/definitions/incidentResponse.workflow";
import * as triggers from "../../services/workflows/triggers";
import { loadRun } from "../../services/workflows/engine";
import { approveAction } from "../../advisor/approval/approvalGateway";
import * as aiAuditTrail from "../../services/aiAuditTrail.service";
import { notificationService } from "../../services/notificationService";
import { createIncident, updateIncident } from "../../services/incidentManagement.service";
import {
  createRemediationTask,
  loadIncidentForResponse,
  notifyAdminsOfCriticalIncident,
} from "../../services/workflows/incidentResponseActions";
import type { WorkflowContext } from "../../services/workflows/types";

const FULL_ACCESS = { canEdit: true, canApprove: true };

// Triggers and audit writes run fire-and-forget; collect and await them so
// assertions see their effects and cleanup never races them.
let pending: Promise<unknown>[] = [];
async function settle(): Promise<void> {
  while (pending.length > 0) {
    const batch = pending;
    pending = [];
    await Promise.allSettled(batch);
  }
}

async function runsFor(orgId: number, incidentId: number) {
  return (await sequelize.query(
    `SELECT id, state, awaiting_approval_id FROM ai_workflow_runs
      WHERE organization_id = :orgId AND workflow_type = 'incident_response'
        AND trigger_payload->>'incidentId' = :incidentId
      ORDER BY id`,
    { replacements: { orgId, incidentId: String(incidentId) }, type: QueryTypes.SELECT },
  )) as Array<{ id: number; state: string; awaiting_approval_id: string | null }>;
}

async function tasksIn(orgId: number) {
  return (await sequelize.query(
    `SELECT t.id, t.title, t.priority, t.creator_id,
            ARRAY(SELECT ta.user_id FROM task_assignees ta WHERE ta.task_id = t.id ORDER BY ta.user_id) AS assignees
       FROM tasks t WHERE t.organization_id = :orgId ORDER BY t.id`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  )) as Array<{
    id: number;
    title: string;
    priority: string;
    creator_id: number;
    assignees: number[];
  }>;
}

async function escalationNotices(orgId: number) {
  return (await sequelize.query(
    `SELECT user_id, title, action_url, metadata FROM notifications
      WHERE organization_id = :orgId AND metadata->>'workflow_action' = 'incident_critical_escalation'
      ORDER BY user_id`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  )) as Array<{ user_id: number; title: string; action_url: string; metadata: any }>;
}

const incidentInput = (overrides: Record<string, unknown> = {}) => ({
  ai_project: "Credit scoring",
  type: "Security breach",
  severity: "Very serious",
  status: "Open",
  occurred_date: "2026-06-23",
  date_detected: "2026-06-23",
  reporter: "Ada Lovelace",
  categories_of_harm: ["Safety"],
  description: "Customer data was exposed by the model",
  ...overrides,
});

describe("critical incident response workflow", () => {
  let orgId: number;
  let adminId: number;
  let secondAdminId: number;
  let ownerId: number;
  let emails: jest.SpyInstance;

  beforeAll(() => {
    register(incidentResponseWorkflow);
    const originalTrigger = triggers.triggerIncidentResponse;
    jest.spyOn(triggers, "triggerIncidentResponse").mockImplementation((...args) => {
      const p = originalTrigger(...args);
      pending.push(p);
      return p;
    });
    const originalAudit = aiAuditTrail.logStateHistory;
    jest.spyOn(aiAuditTrail, "logStateHistory").mockImplementation((...args) => {
      const p = originalAudit(...args);
      pending.push(p);
      return p;
    });
  });

  beforeEach(async () => {
    await settle();
    await cleanupDatabase();
    emails = jest.spyOn(notificationService, "sendEmailWithTemplate").mockResolvedValue();
    const stamp = Date.now();
    orgId = await createTestOrganization("Critical org");
    adminId = await createTestUser(orgId, 1, `crit-admin-${stamp}@test.com`, "Password123!");
    secondAdminId = await createTestUser(orgId, 1, `crit-admin2-${stamp}@test.com`, "Password123!");
    ownerId = await createTestUser(orgId, 3, `crit-owner-${stamp}@test.com`, "Password123!");
  });

  afterEach(() => {
    emails.mockRestore();
  });

  afterAll(async () => {
    await settle();
    jest.restoreAllMocks();
    await cleanupDatabase();
    await sequelize.close();
  });

  it("finds its incident directly, even with more than 50 newer incidents (I-M6)", async () => {
    const oldest = await createTestIncident(orgId, ownerId);
    for (let i = 0; i < 55; i++) await createTestIncident(orgId, ownerId);

    await updateIncident(orgId, oldest, { severity: "Very serious" }, adminId, {
      access: FULL_ACCESS,
    });
    await settle();

    const runs = await runsFor(orgId, oldest);
    expect(runs).toHaveLength(1);
    // classify_incident found it, so the run went on to the first gate.
    expect(runs[0].state).toBe("awaiting_approval");
    const run = await loadRun(runs[0].id, orgId);
    expect(run?.results.find((r) => r.stepId === "classify_incident")?.status).toBe("completed");
  });

  it("looks the incident up only in the run's organization", async () => {
    const otherOrg = await createTestOrganization("Other org");
    const otherUser = await createTestUser(otherOrg, 1, `crit-other-${Date.now()}@test.com`, "x");
    const foreign = await createTestIncident(otherOrg, otherUser);

    expect(await loadIncidentForResponse(orgId, foreign)).toBeNull();
    expect(await loadIncidentForResponse(otherOrg, foreign)).toMatchObject({ id: foreign });
  });

  it("starts on escalation once per incident (Decision 8)", async () => {
    const incidentId = await createTestIncident(orgId, ownerId); // Minor
    const escalate = (severity: string) =>
      updateIncident(orgId, incidentId, { severity }, adminId, { access: FULL_ACCESS });

    await escalate("Serious");
    await settle();
    expect(await runsFor(orgId, incidentId)).toHaveLength(0);

    await escalate("Very serious");
    await settle();
    expect(await runsFor(orgId, incidentId)).toHaveLength(1);

    // critical -> critical, critical -> lower, and a second escalation.
    await escalate("Very serious");
    await escalate("Minor");
    await escalate("Very serious");
    await settle();
    expect(await runsFor(orgId, incidentId)).toHaveLength(1);
  });

  it("an incident created critical and escalated later has one run", async () => {
    const created = await createIncident(orgId, incidentInput({ assignee_id: ownerId }), {
      userId: adminId,
      canApprove: true,
    });
    await settle();
    expect(await runsFor(orgId, created.id!)).toHaveLength(1);

    await updateIncident(orgId, created.id!, { severity: "Serious" }, adminId, {
      access: FULL_ACCESS,
    });
    await updateIncident(orgId, created.id!, { severity: "Very serious" }, adminId, {
      access: FULL_ACCESS,
    });
    await settle();
    expect(await runsFor(orgId, created.id!)).toHaveLength(1);
  });

  it("concurrent escalations of one incident start one run", async () => {
    const incidentId = await createTestIncident(orgId, ownerId);

    await Promise.all([
      triggers.triggerIncidentResponse(orgId, incidentId, "Very serious"),
      triggers.triggerIncidentResponse(orgId, incidentId, "Very serious"),
      triggers.triggerIncidentResponse(orgId, incidentId, "Very serious"),
    ]);
    await settle();

    expect(await runsFor(orgId, incidentId)).toHaveLength(1);
  });

  it("approving the gates creates one task for the owner and notifies every Admin (Decision 9)", async () => {
    const created = await createIncident(orgId, incidentInput({ assignee_id: ownerId }), {
      userId: adminId,
      canApprove: true,
    });
    await settle();
    const [run] = await runsFor(orgId, created.id!);
    expect(run.state).toBe("awaiting_approval");

    // Nothing is written before approval.
    expect(await tasksIn(orgId)).toHaveLength(0);

    const first = await approveAction(orgId, run.awaiting_approval_id!, secondAdminId);
    await settle();
    expect(first.success).toBe(true);

    const tasks = await tasksIn(orgId);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      priority: "High",
      creator_id: secondAdminId,
      assignees: [ownerId],
    });
    expect(tasks[0].title).toContain("Respond to critical incident");
    // The first approval alone notifies no Admin.
    expect(await escalationNotices(orgId)).toHaveLength(0);

    const [afterFirst] = await runsFor(orgId, created.id!);
    expect(afterFirst.state).toBe("awaiting_approval");
    const second = await approveAction(orgId, afterFirst.awaiting_approval_id!, adminId);
    await settle();
    expect(second.success).toBe(true);

    const notices = await escalationNotices(orgId);
    expect(notices.map((n) => n.user_id)).toEqual([adminId, secondAdminId].sort((a, b) => a - b));
    expect(notices[0].title).toBe("Critical incident needs a response");
    expect(notices[0].action_url).toBe(`/ai-incident-managements?incidentId=${created.id}`);
    expect(notices[0].metadata).toMatchObject({ workflow_run_id: run.id, incident_id: created.id });
    const escalationEmails = emails.mock.calls.filter(
      ([, , template]) => template === "incident-critical-escalation.mjml",
    );
    expect(escalationEmails).toHaveLength(2);

    expect((await runsFor(orgId, created.id!))[0].state).toBe("completed");

    // Running either write again for the same run creates and sends nothing.
    const ctx: WorkflowContext = {
      workflowRunId: run.id,
      organizationId: orgId,
      triggerPayload: { incidentId: created.id },
      results: {},
      resumedApprovalId: run.awaiting_approval_id,
    };
    const incident = (await loadIncidentForResponse(orgId, created.id!))!;
    const retriedTask = await createRemediationTask(ctx, incident);
    const retriedNotice = await notifyAdminsOfCriticalIncident(ctx, incident);
    await settle();

    expect(retriedTask).toMatchObject({ taskId: tasks[0].id, alreadyCreated: true });
    expect(retriedNotice.notified).toEqual([]);
    expect(await tasksIn(orgId)).toHaveLength(1);
    expect(await escalationNotices(orgId)).toHaveLength(2);
    expect(
      emails.mock.calls.filter(
        ([, , template]) => template === "incident-critical-escalation.mjml",
      ),
    ).toHaveLength(2);
  });

  it("concurrent executions of the task step create one task", async () => {
    const created = await createIncident(orgId, incidentInput({ assignee_id: ownerId }), {
      userId: adminId,
      canApprove: true,
    });
    await settle();
    const [run] = await runsFor(orgId, created.id!);
    const ctx: WorkflowContext = {
      workflowRunId: run.id,
      organizationId: orgId,
      triggerPayload: { incidentId: created.id },
      results: {},
      resumedApprovalId: null,
    };
    const incident = (await loadIncidentForResponse(orgId, created.id!))!;

    const outcomes = await Promise.all([
      createRemediationTask(ctx, incident),
      createRemediationTask(ctx, incident),
    ]);
    await settle();

    expect(await tasksIn(orgId)).toHaveLength(1);
    expect(outcomes.filter((o) => !o.alreadyCreated)).toHaveLength(1);
  });

  it("assigns the incident's creator when the incident has no owner", async () => {
    const created = await createIncident(orgId, incidentInput(), {
      userId: ownerId,
      canApprove: false,
    });
    await settle();
    const [run] = await runsFor(orgId, created.id!);

    const result = await approveAction(orgId, run.awaiting_approval_id!, adminId);
    await settle();
    expect(result.success).toBe(true);

    const tasks = await tasksIn(orgId);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].assignees).toEqual([ownerId]);
    expect(tasks[0].creator_id).toBe(adminId);
  });
});
