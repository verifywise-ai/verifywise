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
 *  - Review fixes: many concurrent triggers finish without exhausting the
 *    pool; a run for an incident that no longer qualifies ends without any
 *    approval; failed and stale pending runs do not block; an Admin whose
 *    email failed is retried through a new approval; a task_added automation
 *    and a task without a creator do not break task creation.
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
import { createRun, loadRun } from "../../services/workflows/engine";
import { createNewTaskQuery } from "../../utils/task.utils";
import { TaskPriority } from "../../domain.layer/enums/task-priority.enum";
import { TaskStatus } from "../../domain.layer/enums/task-status.enum";
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

async function taskLinksIn(orgId: number) {
  return (await sequelize.query(
    `SELECT task_id, entity_type, entity_id FROM task_entity_links
      WHERE organization_id = :orgId ORDER BY id`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  )) as Array<{ task_id: number; entity_type: string; entity_id: number }>;
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
    // The task is linked to its incident, written with the task.
    expect(await taskLinksIn(orgId)).toEqual([
      { task_id: tasks[0].id, entity_type: "incident", entity_id: created.id },
    ]);
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
    expect(await taskLinksIn(orgId)).toHaveLength(1);
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
    expect(await taskLinksIn(orgId)).toHaveLength(1);
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

  it("many concurrent triggers finish well inside the pool's acquire timeout, one run each", async () => {
    const incidents: number[] = [];
    for (let i = 0; i < 8; i++) incidents.push(await createTestIncident(orgId, ownerId));
    await sequelize.query(
      `UPDATE ai_incident_managements SET severity = 'Very serious' WHERE id IN (:ids)`,
      { replacements: { ids: incidents } },
    );

    const started = Date.now();
    // 8 incidents, each triggered twice at once: 16 concurrent triggers on a
    // pool of 5 connections.
    await Promise.all(
      incidents.flatMap((id) => [
        triggers.triggerIncidentResponse(orgId, id, "Very serious"),
        triggers.triggerIncidentResponse(orgId, id, "Very serious"),
      ]),
    );
    await settle();
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(20000);
    for (const id of incidents) {
      const runs = await runsFor(orgId, id);
      expect(runs).toHaveLength(1);
      expect(runs[0].state).toBe("awaiting_approval");
    }
  });

  it("a run for an incident that is not critical ends at once and requests no approval", async () => {
    const incidentId = await createTestIncident(orgId, ownerId); // Minor

    await triggers.triggerIncidentResponse(orgId, incidentId, "Very serious");
    await settle();

    const [run] = await runsFor(orgId, incidentId);
    expect(run.state).toBe("completed");
    const loaded = await loadRun(run.id, orgId);
    expect(loaded?.results.map((r) => r.stepId)).toEqual(["classify_incident"]);
    const approvals = (await sequelize.query(
      `SELECT id FROM ai_action_approvals WHERE organization_id = :orgId`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    )) as unknown[];
    expect(approvals).toHaveLength(0);
  });

  it("approving after the incident was archived ends the run without a task", async () => {
    const created = await createIncident(orgId, incidentInput({ assignee_id: ownerId }), {
      userId: adminId,
      canApprove: true,
    });
    await settle();
    const [run] = await runsFor(orgId, created.id!);
    await sequelize.query(`UPDATE ai_incident_managements SET archived = true WHERE id = :id`, {
      replacements: { id: created.id },
    });

    await approveAction(orgId, run.awaiting_approval_id!, adminId);
    await settle();

    expect(await tasksIn(orgId)).toHaveLength(0);
    const [after] = await runsFor(orgId, created.id!);
    expect(after.state).toBe("completed");
    expect(after.awaiting_approval_id).toBeNull();
  });

  it("approving after severity was lowered ends the run without a task", async () => {
    const created = await createIncident(orgId, incidentInput({ assignee_id: ownerId }), {
      userId: adminId,
      canApprove: true,
    });
    await settle();
    const [run] = await runsFor(orgId, created.id!);
    await updateIncident(orgId, created.id!, { severity: "Serious" }, adminId, {
      access: FULL_ACCESS,
    });

    await approveAction(orgId, run.awaiting_approval_id!, adminId);
    await settle();

    expect(await tasksIn(orgId)).toHaveLength(0);
    expect((await runsFor(orgId, created.id!))[0].state).toBe("completed");
  });

  it("a failed or stale pending run does not block a new one; a fresh pending run does", async () => {
    const insertRun = async (incidentId: number, state: string, ageMinutes: number) =>
      sequelize.query(
        `INSERT INTO ai_workflow_runs
           (organization_id, workflow_type, trigger_name, trigger_payload, state, created_at)
         VALUES (:orgId, 'incident_response', 'incident.critical',
                 jsonb_build_object('incidentId', CAST(:incidentId AS int)), :state,
                 NOW() - make_interval(mins => :age))`,
        { replacements: { orgId, incidentId, state, age: ageMinutes } },
      );

    const failed = await createTestIncident(orgId, ownerId, { ai_project: "f" });
    await insertRun(failed, "failed", 1);
    const stale = await createTestIncident(orgId, ownerId, { ai_project: "s" });
    await insertRun(stale, "pending", triggers.INCIDENT_RESPONSE_STALE_PENDING_MINUTES + 5);
    const fresh = await createTestIncident(orgId, ownerId, { ai_project: "p" });
    await insertRun(fresh, "pending", 1);
    for (const id of [failed, stale, fresh]) {
      await sequelize.query(
        `UPDATE ai_incident_managements SET severity = 'Very serious' WHERE id = :id`,
        { replacements: { id } },
      );
      await triggers.triggerIncidentResponse(orgId, id, "Very serious");
    }
    await settle();

    expect(await runsFor(orgId, failed)).toHaveLength(2);
    expect(await runsFor(orgId, stale)).toHaveLength(2);
    expect(await runsFor(orgId, fresh)).toHaveLength(1);
  });

  it("createRun on a caller's transaction rolls back with it", async () => {
    const incidentId = await createTestIncident(orgId, ownerId);
    await expect(
      sequelize.transaction(async (transaction) => {
        await createRun(
          incidentResponseWorkflow,
          { organizationId: orgId, triggerPayload: { incidentId } },
          transaction,
        );
        throw new Error("roll back");
      }),
    ).rejects.toThrow("roll back");

    expect(await runsFor(orgId, incidentId)).toHaveLength(0);
  });

  it("an Admin whose email failed is retried through a new approval, and only they", async () => {
    const created = await createIncident(orgId, incidentInput({ assignee_id: ownerId }), {
      userId: adminId,
      canApprove: true,
    });
    await settle();
    const [run] = await runsFor(orgId, created.id!);
    await approveAction(orgId, run.awaiting_approval_id!, adminId);
    await settle();

    // The second Admin's email fails on the first attempt.
    const secondEmail = (
      (await sequelize.query(`SELECT email FROM users WHERE id = :id`, {
        replacements: { id: secondAdminId },
        type: QueryTypes.SELECT,
      })) as Array<{ email: string }>
    )[0].email;
    let failOnce = true;
    emails.mockImplementation(async (to: string) => {
      if (to === secondEmail && failOnce) {
        failOnce = false;
        throw new Error("smtp down");
      }
    });

    const [gate2] = await runsFor(orgId, created.id!);
    await approveAction(orgId, gate2.awaiting_approval_id!, adminId);
    await settle();

    const [retryGate] = await runsFor(orgId, created.id!);
    expect(retryGate.state).toBe("awaiting_approval");
    expect(retryGate.awaiting_approval_id).not.toBe(gate2.awaiting_approval_id);
    let notices = await escalationNotices(orgId);
    expect(notices).toHaveLength(2);
    expect(notices.find((n) => n.user_id === adminId)!.metadata.sent).toBe(true);
    expect(notices.find((n) => n.user_id === secondAdminId)!.metadata.sent).toBe(false);

    // The failed claim was released, so the retry needs no wait.
    expect(notices.find((n) => n.user_id === secondAdminId)!.metadata.claimed_at).toBeUndefined();
    const before = emails.mock.calls.length;
    await approveAction(orgId, retryGate.awaiting_approval_id!, adminId);
    await settle();

    expect((await runsFor(orgId, created.id!))[0].state).toBe("completed");
    const retried = emails.mock.calls.slice(before).map(([to]) => to);
    expect(retried).toEqual([secondEmail]);
    notices = await escalationNotices(orgId);
    expect(notices).toHaveLength(2);
    expect(notices.every((n) => n.metadata.sent === true)).toBe(true);
  });

  it("the run records its task on the run row", async () => {
    const created = await createIncident(orgId, incidentInput({ assignee_id: ownerId }), {
      userId: adminId,
      canApprove: true,
    });
    await settle();
    const [run] = await runsFor(orgId, created.id!);
    await approveAction(orgId, run.awaiting_approval_id!, adminId);
    await settle();

    const loaded = await loadRun(run.id, orgId);
    const [task] = await tasksIn(orgId);
    expect((loaded?.triggerPayload as any)._effects.remediation_task).toMatchObject({
      taskId: task.id,
      assigneeId: ownerId,
      assigneeSource: "owner",
    });
  });

  it("task creation survives a task_added automation, with and without a creator", async () => {
    const [{ id: automationId }] = (await sequelize.query(
      `INSERT INTO automations (organization_id, name, trigger_id, is_active)
       SELECT :orgId, 'On task', id, true FROM automation_triggers WHERE key = 'task_added'
       RETURNING id`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    )) as Array<{ id: number }>;
    await sequelize.query(
      `INSERT INTO automation_actions_data (organization_id, automation_id, action_type_id, params, "order")
       SELECT :orgId, :automationId, id, '{"subject":"s","body":"b"}'::jsonb, 1
         FROM automation_actions ORDER BY id LIMIT 1`,
      { replacements: { orgId, automationId } },
    );

    for (const creator of [adminId, null]) {
      await sequelize.transaction(async (transaction) =>
        createNewTaskQuery(
          {
            title: `Task by ${creator ?? "system"}`,
            creator_id: creator as number,
            priority: TaskPriority.HIGH,
            status: TaskStatus.OPEN,
          },
          orgId,
          transaction,
          [{ user_id: ownerId }],
        ),
      );
    }

    expect(await tasksIn(orgId)).toHaveLength(2);

    // And through the workflow, with the automation present.
    const created = await createIncident(orgId, incidentInput({ assignee_id: ownerId }), {
      userId: adminId,
      canApprove: true,
    });
    await settle();
    const [run] = await runsFor(orgId, created.id!);
    const result = await approveAction(orgId, run.awaiting_approval_id!, adminId);
    await settle();
    expect(result.success).toBe(true);
    expect(await tasksIn(orgId)).toHaveLength(3);
  });
});
