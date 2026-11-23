/**
 * incident_response reads and writes (I-M6, Decision 9):
 *  - loadIncidentForResponse reads the incident by id in the organization;
 *  - createRemediationTask creates ONE task per run (the audit marker written
 *    with it makes a retry return the same task), assigned to the owner, else
 *    the incident's creator, else the approving Admin;
 *  - notifyAdminsOfCriticalIncident notifies each Admin once per run.
 * Both writes take the run's row lock first.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockTx = { id: "tx" };
jest.mock("../../../database/db", () => ({
  sequelize: {
    transaction: jest.fn(async (callback: any) => callback(mockTx)),
    query: jest.fn(),
  },
}));
jest.mock("../../../utils/incidentManagement.utils", () => ({
  getIncidentByIdQuery: jest.fn(),
}));
jest.mock("../../../utils/task.utils", () => ({
  createNewTaskQuery: jest.fn(),
}));
jest.mock("../../../utils/changeHistory.base.utils", () => ({
  recordEntityCreation: jest.fn(),
}));
jest.mock("../../inAppNotification.service", () => ({
  CRITICAL_INCIDENT_ESCALATION_ACTION: "incident_critical_escalation",
  notifyCriticalIncidentEscalation: jest.fn(),
  notifyTaskAssigned: jest.fn(),
}));

import { sequelize } from "../../../database/db";
import { getIncidentByIdQuery } from "../../../utils/incidentManagement.utils";
import { createNewTaskQuery } from "../../../utils/task.utils";
import { recordEntityCreation } from "../../../utils/changeHistory.base.utils";
import {
  notifyCriticalIncidentEscalation,
  notifyTaskAssigned,
} from "../../inAppNotification.service";
import {
  createRemediationTask,
  loadIncidentForResponse,
  notifyAdminsOfCriticalIncident,
  REMEDIATION_TASK_CREATED_RULE,
  ResponseIncident,
} from "../incidentResponseActions";
import type { WorkflowContext } from "../types";

const mockQuery = sequelize.query as unknown as jest.Mock<any>;
const mockGetIncident = getIncidentByIdQuery as unknown as jest.Mock<any>;
const mockCreateTask = createNewTaskQuery as unknown as jest.Mock<any>;
const mockRecordCreation = recordEntityCreation as unknown as jest.Mock<any>;
const mockNotifyEscalation = notifyCriticalIncidentEscalation as unknown as jest.Mock<any>;
const mockNotifyTask = notifyTaskAssigned as unknown as jest.Mock<any>;

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
  useCase: "Credit scoring",
  severity: "Very serious",
  type: "Security breach",
  assigneeId: 5,
  ownerName: "Ada Owner",
  ...overrides,
});

/**
 * A small in-memory stand-in for the tables the actions touch, answering
 * each query by its SQL.
 */
interface FakeDb {
  members: number[];
  admins: number[];
  creatorId: number | null;
  approverId: number | null;
  marker: Record<string, unknown> | null;
  notifiedAdmins: number[];
}
let db: FakeDb;

function routeQueries() {
  mockQuery.mockImplementation(async (sql: string, opts: any = {}) => {
    const r = opts.replacements ?? {};
    if (sql.includes("FROM ai_workflow_runs") && sql.includes("FOR NO KEY UPDATE")) {
      return [{ id: r.runId }];
    }
    if (sql.includes("FROM ai_action_audit_log")) {
      return db.marker ? [{ metadata: db.marker }] : [];
    }
    if (sql.includes("INSERT INTO ai_action_audit_log")) {
      db.marker = JSON.parse(r.metadata);
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
    if (sql.includes("FROM notifications")) {
      return db.notifiedAdmins.map((user_id) => ({ user_id }));
    }
    if (sql.includes("FROM users")) {
      return [{ full_name: "Grace Admin" }];
    }
    throw new Error(`unexpected query: ${sql}`);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  db = {
    members: [5, 6, 9],
    admins: [9],
    creatorId: 6,
    approverId: 9,
    marker: null,
    notifiedAdmins: [],
  };
  routeQueries();
  let nextTaskId = 700;
  mockCreateTask.mockImplementation(async () => ({ id: nextTaskId++ }));
  mockNotifyEscalation.mockImplementation(async (_org: number, adminId: number) => {
    db.notifiedAdmins.push(adminId);
  });
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
      },
    });

    const result = await loadIncidentForResponse(42, 99);

    expect(mockGetIncident).toHaveBeenCalledWith(99, 42);
    expect(result).toEqual({
      id: 99,
      reference: "INC-99",
      useCase: "Credit scoring",
      severity: "Very serious",
      type: "Misuse",
      assigneeId: 5,
      ownerName: "Ada Owner",
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

  it("falls back to #id without a display id, and to no owner", async () => {
    mockGetIncident.mockResolvedValue({
      dataValues: { id: 99, ai_project: "X", severity: "Very serious", type: "Misuse" },
    });

    const result = await loadIncidentForResponse(42, 99);

    expect(result).toMatchObject({ reference: "#99", assigneeId: null, ownerName: null });
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
    // History as a system change, on the same transaction.
    expect(mockRecordCreation).toHaveBeenCalledWith(
      "task",
      700,
      null,
      42,
      expect.any(Object),
      mockTx,
      true,
    );
    // The marker is written on the task's transaction.
    const markerCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO ai_action_audit_log"),
    ) as any[];
    expect(markerCall[1]).toMatchObject({
      transaction: mockTx,
      replacements: { rule: REMEDIATION_TASK_CREATED_RULE, runId: 11, approvalId: "appr-1" },
    });
    expect(mockNotifyTask).toHaveBeenCalledTimes(1);
    expect(mockNotifyTask).toHaveBeenCalledWith(
      42,
      5,
      expect.objectContaining({ id: 700, priority: "High" }),
      "Grace Admin",
      expect.any(String),
    );
  });

  it("takes the run's row lock before checking for an earlier task", async () => {
    await createRemediationTask(ctx(), incident());

    const first = mockQuery.mock.calls[0] as any[];
    expect(first[0]).toContain("FOR NO KEY UPDATE");
    expect(first[1]).toMatchObject({ replacements: { runId: 11, organizationId: 42 } });
  });

  it("creates the task once when the step runs again for the same run", async () => {
    const first = await createRemediationTask(ctx(), incident());
    const again = await createRemediationTask(ctx(), incident());

    expect(mockCreateTask).toHaveBeenCalledTimes(1);
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

  it("assigns the approving Admin when neither owner nor creator is available", async () => {
    db.creatorId = null;

    const outcome = await createRemediationTask(ctx(), incident({ assigneeId: null }));

    expect(mockCreateTask.mock.calls[0][3]).toEqual([{ user_id: 9 }]);
    expect(outcome.assigneeSource).toBe("approver");
  });

  it("creates an unassigned task when nobody qualifies, and tells no one", async () => {
    db.creatorId = null;
    db.approverId = null;

    const outcome = await createRemediationTask(ctx(), incident({ assigneeId: null }));

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
  it("notifies every Admin in the app and by email", async () => {
    db.admins = [9, 10];

    const outcome = await notifyAdminsOfCriticalIncident(ctx(), incident());

    expect(mockNotifyEscalation).toHaveBeenCalledTimes(2);
    expect(mockNotifyEscalation).toHaveBeenCalledWith(
      42,
      9,
      expect.objectContaining({ id: 99, reference: "INC-99" }),
      11,
      expect.any(String),
    );
    expect(outcome).toEqual({ notified: [9, 10], alreadyNotified: [], failed: [] });
  });

  it("notifies each Admin once when the step runs again for the same run", async () => {
    db.admins = [9, 10];

    await notifyAdminsOfCriticalIncident(ctx(), incident());
    const again = await notifyAdminsOfCriticalIncident(ctx(), incident());

    expect(mockNotifyEscalation).toHaveBeenCalledTimes(2);
    expect(again).toEqual({ notified: [], alreadyNotified: [9, 10], failed: [] });
  });

  it("looks up earlier notices by this run and action, under the run lock", async () => {
    await notifyAdminsOfCriticalIncident(ctx(), incident());

    expect((mockQuery.mock.calls[0] as any[])[0]).toContain("FOR NO KEY UPDATE");
    const lookup = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("FROM notifications"),
    ) as any[];
    expect(lookup[1].replacements).toEqual({
      organizationId: 42,
      action: "incident_critical_escalation",
      runId: "11",
    });
  });

  it("carries on past an Admin whose notice fails, and reaches only them on a retry", async () => {
    db.admins = [9, 10, 12];
    mockNotifyEscalation.mockImplementation(async (_org: number, adminId: number) => {
      if (adminId === 10 && !db.notifiedAdmins.includes(-1)) {
        db.notifiedAdmins.push(-1); // fail the first attempt only
        throw new Error("redis down");
      }
      db.notifiedAdmins.push(adminId);
    });

    const first = await notifyAdminsOfCriticalIncident(ctx(), incident());
    const retry = await notifyAdminsOfCriticalIncident(ctx(), incident());

    expect(first).toEqual({ notified: [9, 12], alreadyNotified: [], failed: [10] });
    expect(retry).toEqual({ notified: [10], alreadyNotified: [9, 12], failed: [] });
  });
});
