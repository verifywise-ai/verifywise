/**
 * incident_response reads and writes (I-M6, Decision 9, review fixes):
 *  - loadIncidentForResponse reads the incident by id in the organization;
 *  - createRemediationTask creates ONE task per run: its id is stored on the
 *    run row in the task's transaction, so a retry returns the same task; the
 *    assignee is the owner, else the incident's creator, else the approver;
 *    the creator is never null while anyone qualifies;
 *  - notifyAdminsOfCriticalIncident claims each Admin's notice under the run
 *    lock, delivers after commit, and marks it sent only after delivery, so a
 *    retry reaches only Admins who were missed;
 *  - the remediation task is linked to its incident (task_entity_links) in
 *    the task's transaction;
 *  - nothing inside a locked transaction uses a second connection.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockTx = { id: "tx" };
let inLock = false;
const lockViolations: string[] = [];

jest.mock("../../../database/db", () => ({
  sequelize: {
    transaction: jest.fn(async (callback: any) => {
      inLock = true;
      try {
        return await callback(mockTx);
      } finally {
        inLock = false;
      }
    }),
    query: jest.fn(),
  },
}));
jest.mock("../../../utils/incidentManagement.utils", () => ({
  getIncidentByIdQuery: jest.fn(),
}));
jest.mock("../../../utils/notification.utils", () => ({
  createNotificationQuery: jest.fn(),
}));
jest.mock("../../../utils/task.utils", () => ({
  createNewTaskQuery: jest.fn(),
}));
jest.mock("../../../utils/taskEntityLink.utils", () => ({
  createTaskEntityLinkQuery: jest.fn(),
  incidentLinkName: jest.requireActual("../../../utils/taskEntityLink.utils").incidentLinkName,
}));
jest.mock("../../../utils/changeHistory.base.utils", () => ({
  recordEntityCreation: jest.fn(),
}));
jest.mock("../../notificationService", () => ({
  notificationService: { sendEmailWithTemplate: jest.fn() },
}));
jest.mock("../../inAppNotification.service", () => ({
  CRITICAL_INCIDENT_ESCALATION_ACTION: "incident_critical_escalation",
  buildCriticalIncidentEscalation: jest.fn(),
  notifyTaskAssigned: jest.fn(),
  publishInAppNotification: jest.fn(),
}));

import { sequelize } from "../../../database/db";
import { getIncidentByIdQuery } from "../../../utils/incidentManagement.utils";
import { createNotificationQuery } from "../../../utils/notification.utils";
import { createNewTaskQuery } from "../../../utils/task.utils";
import { createTaskEntityLinkQuery } from "../../../utils/taskEntityLink.utils";
import { recordEntityCreation } from "../../../utils/changeHistory.base.utils";
import { notificationService } from "../../notificationService";
import {
  buildCriticalIncidentEscalation,
  notifyTaskAssigned,
  publishInAppNotification,
} from "../../inAppNotification.service";
import {
  createRemediationTask,
  ESCALATION_CLAIM_LEASE_MINUTES,
  loadIncidentForResponse,
  notifyAdminsOfCriticalIncident,
  ResponseIncident,
} from "../incidentResponseActions";
import type { WorkflowContext } from "../types";

const mockQuery = sequelize.query as unknown as jest.Mock<any>;
const mockGetIncident = getIncidentByIdQuery as unknown as jest.Mock<any>;
const mockCreateNotification = createNotificationQuery as unknown as jest.Mock<any>;
const mockCreateTask = createNewTaskQuery as unknown as jest.Mock<any>;
const mockCreateLink = createTaskEntityLinkQuery as unknown as jest.Mock<any>;
const mockRecordCreation = recordEntityCreation as unknown as jest.Mock<any>;
const mockSendEmail = notificationService.sendEmailWithTemplate as unknown as jest.Mock<any>;
const mockBuild = buildCriticalIncidentEscalation as unknown as jest.Mock<any>;
const mockNotifyTask = notifyTaskAssigned as unknown as jest.Mock<any>;
const mockPublish = publishInAppNotification as unknown as jest.Mock<any>;

const ctx = (overrides: Partial<WorkflowContext> = {}): WorkflowContext => ({
  workflowRunId: 11,
  organizationId: 42,
  triggerPayload: { incidentId: 99 },
  results: {},
  resumedApprovalId: "appr-1",
  ...overrides,
});

const incident = (overrides: Partial<ResponseIncident> = {}): ResponseIncident => ({
  id: 99,
  reference: "INC-99",
  displayId: "INC-99",
  useCase: "Credit scoring",
  severity: "Very serious",
  type: "Security breach",
  assigneeId: 5,
  ownerName: "Ada Owner",
  archived: false,
  ...overrides,
});

interface Notice {
  id: number;
  user_id: number;
  sent: boolean;
  claimed_at: string | null;
}

/** An in-memory stand-in for the rows the actions touch. */
interface FakeDb {
  members: number[];
  admins: number[];
  creatorId: number | null;
  approverId: number | null;
  payload: Record<string, any>;
  notices: Notice[];
}
let db: FakeDb;

function routeQueries() {
  mockQuery.mockImplementation(async (sql: string, opts: any = {}) => {
    if (inLock && opts.transaction !== mockTx) lockViolations.push(sql);
    const r = opts.replacements ?? {};
    if (sql.includes("FROM ai_workflow_runs") && sql.includes("FOR NO KEY UPDATE")) {
      return [{ trigger_payload: db.payload }];
    }
    if (sql.includes("UPDATE ai_workflow_runs")) {
      db.payload = {
        ...db.payload,
        _effects: { ...(db.payload._effects ?? {}), remediation_task: JSON.parse(r.effect) },
      };
      return [];
    }
    if (sql.includes("FROM ai_action_approvals")) {
      return db.approverId === null ? [] : [{ approved_by: db.approverId }];
    }
    if (sql.includes("FROM incident_change_history")) {
      return db.creatorId === null ? [] : [{ changed_by_user_id: db.creatorId }];
    }
    if (sql.includes("FROM organization_members") && sql.includes("role_id")) {
      return db.admins.map((user_id) => ({ user_id }));
    }
    if (sql.includes("FROM organization_members")) {
      return (r.ids as number[])
        .filter((id) => db.members.includes(id))
        .map((user_id) => ({ user_id }));
    }
    if (sql.includes("FROM notifications") && sql.includes("workflow_action")) {
      const leaseMs = r.lease * 60_000;
      return db.notices.map((n) => ({
        id: n.id,
        user_id: n.user_id,
        sent: n.sent,
        claimed_recently: n.claimed_at !== null && Date.now() - Date.parse(n.claimed_at) < leaseMs,
      }));
    }
    if (sql.includes("metadata - 'claimed_at'")) {
      db.notices.find((n) => n.id === r.id)!.claimed_at = null;
      return [];
    }
    if (sql.includes("UPDATE notifications") && sql.includes("claimed_at")) {
      db.notices.find((n) => n.id === r.id)!.claimed_at = r.claimedAt;
      return [];
    }
    if (sql.includes("UPDATE notifications") && sql.includes('"sent": true')) {
      db.notices.find((n) => n.id === r.id)!.sent = true;
      return [];
    }
    if (sql.includes("SELECT * FROM notifications")) {
      return db.notices.filter((n) => n.id === r.id);
    }
    if (sql.includes("FROM users")) {
      return [{ full_name: "Grace Admin" }];
    }
    throw new Error(`unexpected query: ${sql}`);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  lockViolations.length = 0;
  db = {
    members: [5, 6, 9],
    admins: [9],
    creatorId: 6,
    approverId: 9,
    payload: { incidentId: 99 },
    notices: [],
  };
  routeQueries();
  let nextTaskId = 700;
  mockCreateTask.mockImplementation(async () => ({ id: nextTaskId++ }));
  let nextNoticeId = 1;
  mockCreateNotification.mockImplementation(async (n: any, _org: number, tx: unknown) => {
    if (tx !== mockTx) lockViolations.push("createNotificationQuery without the lock transaction");
    const row = {
      id: nextNoticeId++,
      user_id: n.user_id,
      sent: n.metadata.sent,
      claimed_at: n.metadata.claimed_at,
    };
    db.notices.push(row);
    return row;
  });
  mockBuild.mockImplementation(async (adminId: number) => ({
    notification: {
      user_id: adminId,
      type: "system",
      title: "Critical incident needs a response",
      message: "m",
      metadata: { workflow_action: "incident_critical_escalation", workflow_run_id: 11 },
    },
    email: {
      to: `admin${adminId}@example.com`,
      subject: "Critical incident: INC-99",
      template: "incident-critical-escalation.mjml",
      variables: {},
    },
  }));
  mockSendEmail.mockResolvedValue(undefined);
  mockPublish.mockResolvedValue(undefined);
});

describe("loadIncidentForResponse (I-M6)", () => {
  it("reads the incident by id in the organization", async () => {
    mockGetIncident.mockResolvedValue({
      dataValues: {
        id: 99,
        incident_id: "INC-99",
        ai_project: "Credit scoring",
        severity: "Very serious",
        type: "Misuse",
        assignee_id: 5,
        assignee_name: "Ada Owner",
        archived: true,
      },
    });

    const result = await loadIncidentForResponse(42, 99);

    expect(mockGetIncident).toHaveBeenCalledWith(99, 42);
    expect(result).toEqual({
      id: 99,
      reference: "INC-99",
      displayId: "INC-99",
      useCase: "Credit scoring",
      severity: "Very serious",
      type: "Misuse",
      assigneeId: 5,
      ownerName: "Ada Owner",
      archived: true,
    });
  });

  it("returns null when the incident is not in the organization", async () => {
    mockGetIncident.mockResolvedValue(null);
    expect(await loadIncidentForResponse(42, 99)).toBeNull();
  });

  it("never queries for an invalid id", async () => {
    expect(await loadIncidentForResponse(42, Number.NaN)).toBeNull();
    expect(await loadIncidentForResponse(42, 0)).toBeNull();
    expect(mockGetIncident).not.toHaveBeenCalled();
  });

  it("falls back to #id without a display id, to no owner, and to not archived", async () => {
    mockGetIncident.mockResolvedValue({
      dataValues: { id: 99, ai_project: "X", severity: "Very serious", type: "Misuse" },
    });

    const result = await loadIncidentForResponse(42, 99);

    expect(result).toMatchObject({
      reference: "#99",
      displayId: null,
      assigneeId: null,
      ownerName: null,
      archived: false,
    });
  });
});

describe("createRemediationTask (Decision 9b)", () => {
  it("creates one High task for the owner, created by the approving Admin", async () => {
    const outcome = await createRemediationTask(ctx(), incident());

    expect(mockCreateTask).toHaveBeenCalledTimes(1);
    const [task, orgId, tx, assignees] = mockCreateTask.mock.calls[0] as any[];
    expect(task).toMatchObject({
      title: "Respond to critical incident INC-99",
      creator_id: 9,
      priority: "High",
      status: "Open",
    });
    expect(task.description).toContain("/ai-incident-managements?incidentId=99");
    expect(orgId).toBe(42);
    expect(tx).toBe(mockTx);
    expect(assignees).toEqual([{ user_id: 5 }]);
    expect(outcome).toEqual({
      taskId: 700,
      assigneeId: 5,
      assigneeSource: "owner",
      alreadyCreated: false,
    });
    expect(mockRecordCreation).toHaveBeenCalledWith(
      "task",
      700,
      null,
      42,
      expect.any(Object),
      mockTx,
      true,
    );
    expect(mockNotifyTask).toHaveBeenCalledWith(
      42,
      5,
      expect.objectContaining({ id: 700, priority: "High" }),
      "Grace Admin",
      expect.any(String),
    );
    expect(lockViolations).toEqual([]);
  });

  it("stores the task on the run row, in the task's transaction (not in pruned audit tables)", async () => {
    await createRemediationTask(ctx(), incident());

    expect(db.payload._effects.remediation_task).toEqual({
      taskId: 700,
      assigneeId: 5,
      assigneeSource: "owner",
    });
    const write = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE ai_workflow_runs"),
    ) as any[];
    expect(write[1].transaction).toBe(mockTx);
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("ai_action_audit_log"))).toBe(
      false,
    );
  });

  it("links the task to its incident in the task's transaction", async () => {
    await createRemediationTask(ctx(), incident());

    expect(mockCreateLink).toHaveBeenCalledTimes(1);
    expect(mockCreateLink).toHaveBeenCalledWith(
      {
        task_id: 700,
        entity_id: 99,
        entity_type: "incident",
        entity_name: "INC-99 · Credit scoring",
      },
      42,
      mockTx,
    );
  });

  it("names the link by the incident reference alone when it has no use case", async () => {
    await createRemediationTask(ctx(), incident({ useCase: "" }));

    expect(mockCreateLink.mock.calls[0][0]).toMatchObject({ entity_name: "INC-99" });
  });

  it("names the link INC-<id> like every incident link when there is no display id", async () => {
    await createRemediationTask(ctx(), incident({ reference: "#99", displayId: null }));

    expect(mockCreateLink.mock.calls[0][0]).toMatchObject({
      entity_name: "INC-99 · Credit scoring",
    });
  });

  it("does not link the task when creating it fails", async () => {
    mockCreateTask.mockRejectedValueOnce(new Error("insert failed"));

    await expect(createRemediationTask(ctx(), incident())).rejects.toThrow("insert failed");
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it("creates the task once when the step runs again for the same run", async () => {
    const first = await createRemediationTask(ctx(), incident());
    const again = await createRemediationTask(ctx(), incident());

    expect(mockCreateTask).toHaveBeenCalledTimes(1);
    expect(mockCreateLink).toHaveBeenCalledTimes(1);
    expect(mockNotifyTask).toHaveBeenCalledTimes(1);
    expect(again).toEqual({ ...first, alreadyCreated: true });
  });

  it("assigns the incident's creator when the incident has no owner", async () => {
    const outcome = await createRemediationTask(ctx(), incident({ assigneeId: null }));

    expect(mockCreateTask.mock.calls[0][3]).toEqual([{ user_id: 6 }]);
    expect(outcome.assigneeSource).toBe("creator");
  });

  it("skips an owner who has left the organization", async () => {
    db.members = [6, 9];

    const outcome = await createRemediationTask(ctx(), incident({ assigneeId: 5 }));

    expect(outcome).toMatchObject({ assigneeId: 6, assigneeSource: "creator" });
  });

  it("falls through to the approver when the creation history was pruned", async () => {
    db.creatorId = null;

    const outcome = await createRemediationTask(ctx(), incident({ assigneeId: null }));

    expect(mockCreateTask.mock.calls[0][3]).toEqual([{ user_id: 9 }]);
    expect(outcome.assigneeSource).toBe("approver");
  });

  it("keeps a non-null creator: the approver even after they left the organization", async () => {
    db.members = [5];

    await createRemediationTask(ctx(), incident());

    expect((mockCreateTask.mock.calls[0][0] as any).creator_id).toBe(9);
  });

  it("uses the first Admin as creator when there is no approver and no assignee", async () => {
    db.creatorId = null;
    db.approverId = null;
    db.members = [];
    db.admins = [3, 9];

    const outcome = await createRemediationTask(
      ctx({ resumedApprovalId: null }),
      incident({ assigneeId: null }),
    );

    expect((mockCreateTask.mock.calls[0][0] as any).creator_id).toBe(3);
    expect(mockCreateTask.mock.calls[0][3]).toEqual([]);
    expect(outcome).toMatchObject({ assigneeId: null, assigneeSource: "none" });
    expect(mockNotifyTask).not.toHaveBeenCalled();
  });

  it("keeps the task when the assignment notice fails", async () => {
    mockNotifyTask.mockRejectedValueOnce(new Error("smtp down"));

    const outcome = await createRemediationTask(ctx(), incident());

    expect(outcome.taskId).toBe(700);
  });
});

describe("notifyAdminsOfCriticalIncident (Decision 9a)", () => {
  it("notifies every Admin in the app and by email, then marks each sent", async () => {
    db.admins = [9, 10];

    const outcome = await notifyAdminsOfCriticalIncident(ctx(), incident());

    expect(mockBuild).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ id: 99 }),
      11,
      expect.any(String),
    );
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    expect(mockPublish).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledWith(
      "admin9@example.com",
      "Critical incident: INC-99",
      "incident-critical-escalation.mjml",
      {},
    );
    expect(db.notices.map((n) => n.sent)).toEqual([true, true]);
    expect(outcome).toEqual({ notified: [9, 10], alreadyNotified: [], inFlight: [], failed: [] });
  });

  it("delivers after the claim transaction commits, never while holding the lock", async () => {
    db.admins = [9, 10];
    const deliveredInLock: boolean[] = [];
    mockPublish.mockImplementation(async () => {
      deliveredInLock.push(inLock);
    });
    mockSendEmail.mockImplementation(async () => {
      deliveredInLock.push(inLock);
    });

    await notifyAdminsOfCriticalIncident(ctx(), incident());

    expect(deliveredInLock).toEqual([false, false, false, false]);
    expect(lockViolations).toEqual([]);
  });

  it("notifies each Admin once when the step runs again for the same run", async () => {
    db.admins = [9, 10];

    await notifyAdminsOfCriticalIncident(ctx(), incident());
    const again = await notifyAdminsOfCriticalIncident(ctx(), incident());

    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(again).toEqual({ notified: [], alreadyNotified: [9, 10], inFlight: [], failed: [] });
  });

  it("leaves an Admin unsent when the real-time publish fails, so no email is lost", async () => {
    db.admins = [9, 10];
    mockPublish.mockImplementationOnce(async () => {
      throw new Error("redis down");
    });

    const outcome = await notifyAdminsOfCriticalIncident(ctx(), incident());

    expect(outcome.failed).toEqual([9]);
    expect(outcome.notified).toEqual([10]);
    expect(db.notices.find((n) => n.user_id === 9)!.sent).toBe(false);
    // The failed Admin's email was not sent, and is not marked as if it were.
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it("leaves an Admin unsent when the email fails", async () => {
    mockSendEmail.mockRejectedValueOnce(new Error("smtp down"));

    const outcome = await notifyAdminsOfCriticalIncident(ctx(), incident());

    expect(outcome.failed).toEqual([9]);
    expect(db.notices[0].sent).toBe(false);
  });

  it("a retry reaches only the missed Admin at once, reusing their notice row", async () => {
    db.admins = [9, 10, 12];
    let failOnce = true;
    mockSendEmail.mockImplementation(async (to: string) => {
      if (to === "admin10@example.com" && failOnce) {
        failOnce = false;
        throw new Error("smtp down");
      }
    });

    const first = await notifyAdminsOfCriticalIncident(ctx(), incident());
    // The failed claim was released: no waiting out the lease.
    expect(db.notices.find((n) => n.user_id === 10)!.claimed_at).toBeNull();
    const retry = await notifyAdminsOfCriticalIncident(ctx(), incident());

    expect(first).toEqual({ notified: [9, 12], alreadyNotified: [], inFlight: [], failed: [10] });
    expect(retry).toEqual({ notified: [10], alreadyNotified: [9, 12], inFlight: [], failed: [] });
    expect(mockCreateNotification).toHaveBeenCalledTimes(3);
    expect(db.notices.every((n) => n.sent)).toBe(true);
  });

  it("re-delivers an unsent notice whose claim is older than the lease", async () => {
    db.notices.push({
      id: 50,
      user_id: 9,
      sent: false,
      claimed_at: new Date(
        Date.now() - (ESCALATION_CLAIM_LEASE_MINUTES + 1) * 60_000,
      ).toISOString(),
    });

    const outcome = await notifyAdminsOfCriticalIncident(ctx(), incident());

    expect(outcome.notified).toEqual([9]);
    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(db.notices[0].sent).toBe(true);
  });

  it("does not deliver a notice another execution claimed within the lease", async () => {
    db.notices.push({ id: 50, user_id: 9, sent: false, claimed_at: new Date().toISOString() });

    const outcome = await notifyAdminsOfCriticalIncident(ctx(), incident());

    expect(outcome).toEqual({ notified: [], alreadyNotified: [], inFlight: [9], failed: [] });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("marks an Admin without an email address sent after the in-app notice", async () => {
    mockBuild.mockImplementationOnce(async (adminId: number) => ({
      notification: { user_id: adminId, type: "system", title: "t", message: "m", metadata: {} },
      email: { to: null, subject: "s", template: "t", variables: {} },
    }));

    const outcome = await notifyAdminsOfCriticalIncident(ctx(), incident());

    expect(outcome.notified).toEqual([9]);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(db.notices[0].sent).toBe(true);
  });
});
