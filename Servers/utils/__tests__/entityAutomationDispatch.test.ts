/**
 * Entity events run every action of every active automation of their trigger
 * (audit I-L5); an automation flagged legacy_first_action_only keeps only the
 * event's first action, as before. The actions are enqueued only once the
 * write's transaction commits.
 * Model, use case and incident-updated events are covered in their own tests.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
  logStructuredError: jest.fn(),
}));
jest.mock("../vendorRisk.utils", () => ({
  deleteVendorRisksForVendorQuery: jest.fn(async () => undefined),
}));
jest.mock("../changeHistory.base.utils", () => ({
  recordEntityDeletion: jest.fn(async () => undefined),
}));
jest.mock("../approvalRequest.utils", () => ({
  withdrawApprovalRequestQuery: jest.fn(async () => undefined),
}));
jest.mock("../project.utils", () => ({
  getUserProjects: jest.fn(async () => []),
  updateProjectUpdatedByIdQuery: jest.fn(async () => undefined),
}));

import { sequelize } from "../../database/db";
import { enqueueAutomationAction } from "../../services/automations/automationProducer";
import {
  createNewTrainingRegistarQuery,
  deleteTrainingRegistarByIdQuery,
  updateTrainingRegistarByIdQuery,
} from "../trainingRegistar.utils";
import { createNewTaskQuery } from "../task.utils";
import { createNewIncidentQuery, deleteIncidentByIdQuery } from "../incidentManagement.utils";
import { deleteVendorByIdQuery } from "../vendor.utils";
import { TaskPriority } from "../../domain.layer/enums/task-priority.enum";
import { TaskStatus } from "../../domain.layer/enums/task-status.enum";

const mockQuery = sequelize.query as unknown as jest.Mock<(...args: any[]) => Promise<any>>;
const mockEnqueue = enqueueAutomationAction as unknown as jest.Mock<
  (...args: any[]) => Promise<any>
>;

const actionRow = (automationId: number, order: number, legacy = false) => ({
  automation_id: automationId,
  action_key: order === 1 ? "send_email" : "send_slack",
  params: { subject: `${automationId}-${order}`, body: "b" },
  order,
  legacy_first_action_only: legacy,
});
/** Two actions of automation 3 and one of automation 8. */
const ALL_NEW = [actionRow(3, 1), actionRow(3, 2), actionRow(8, 1)];
/** Automation 3 is flagged legacy; automation 8 is new. */
const LEGACY_AND_NEW = [actionRow(3, 1, true), actionRow(3, 2, true), actionRow(8, 1)];

let automationRows: ReturnType<typeof actionRow>[] = [];
const subjects = () => mockEnqueue.mock.calls.map(([, data]) => (data as any).subject);
const settle = () => new Promise((resolve) => setImmediate(resolve));

function fakeTx() {
  const hooks: Array<() => unknown> = [];
  return {
    hooks,
    afterCommit: jest.fn((hook: () => unknown) => {
      hooks.push(hook);
    }),
    commit: () => hooks.forEach((hook) => hook()),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnqueue.mockResolvedValue(undefined);
  automationRows = ALL_NEW;
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM automation_triggers")) return automationRows;
    if (
      /INSERT INTO trainingregistar|UPDATE trainingregistar|DELETE FROM trainingregistar/.test(sql)
    )
      return [{ id: 5, training_name: "T", dataValues: { id: 5, training_name: "T" } }];
    if (sql.includes("INSERT INTO tasks")) {
      return [{ id: 700, title: "T", creator_id: 2, dataValues: { id: 700, creator_id: 2 } }];
    }
    if (sql.includes("AS full_name FROM users")) return [[{ full_name: "Ada Owner" }], 1];
    if (sql.includes("INSERT INTO ai_incident_managements")) {
      return [{ id: 9, dataValues: { id: 9, status: "Open" } }];
    }
    if (sql.includes("DELETE FROM ai_incident_managements")) return [[{ id: 9 }], 1];
    if (sql.includes("SELECT id FROM vendors")) return [{ id: 4 }];
    if (sql.startsWith("DELETE FROM vendors WHERE")) return [{ id: 4, vendor_name: "V" }];
    return [];
  });
});

type Event = {
  key: string;
  run: (tx: any) => Promise<unknown>;
};

const EVENTS: Event[] = [
  {
    key: "training_added",
    run: (tx) => createNewTrainingRegistarQuery({ training_name: "T" } as any, 1, tx),
  },
  {
    key: "training_updated",
    run: (tx) =>
      updateTrainingRegistarByIdQuery(5, { status: "Done" } as any, 1, tx, {
        id: 5,
        training_name: "T",
      } as any),
  },
  {
    key: "training_deleted",
    run: (tx) => deleteTrainingRegistarByIdQuery(5, 1, tx),
  },
  {
    key: "task_added",
    run: (tx) =>
      createNewTaskQuery(
        {
          title: "T",
          creator_id: 2,
          priority: TaskPriority.HIGH,
          status: TaskStatus.OPEN,
        },
        1,
        tx,
        [{ user_id: 5 }],
      ),
  },
  {
    key: "incident_added",
    run: (tx) => createNewIncidentQuery({ description: "Something happened" } as any, 1, tx),
  },
  {
    key: "incident_deleted",
    run: (tx) => deleteIncidentByIdQuery(9, 1, tx),
  },
  {
    key: "vendor_deleted",
    run: (tx) => deleteVendorByIdQuery(4, 1, tx, 2),
  },
];

describe.each(EVENTS)("$key", ({ key, run }) => {
  it("reads the trigger's actions inside the transaction", async () => {
    const tx = fakeTx();
    await run(tx);
    const lookup = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("FROM automation_triggers"),
    );
    expect(lookup?.[1]).toMatchObject({
      replacements: { organizationId: 1, triggerKey: key },
      transaction: tx,
    });
  });

  it("enqueues every action of every active automation, in order", async () => {
    const tx = fakeTx();
    await run(tx);
    tx.commit();
    await settle();
    expect(subjects()).toEqual(["3-1", "3-2", "8-1"]);
    expect(mockEnqueue).toHaveBeenCalledWith(
      "send_email",
      expect.objectContaining({ automation_id: 3, organizationId: 1 }),
    );
  });

  it("keeps a legacy-flagged automation to the event's first action", async () => {
    automationRows = LEGACY_AND_NEW;
    const tx = fakeTx();
    await run(tx);
    tx.commit();
    await settle();
    expect(subjects()).toEqual(["3-1", "8-1"]);
  });

  it("enqueues only once the transaction commits", async () => {
    const tx = fakeTx();
    await run(tx);
    await settle();
    expect(mockEnqueue).not.toHaveBeenCalled();
    tx.commit();
    await settle();
    expect(mockEnqueue).toHaveBeenCalledTimes(3);
  });

  it("one failed enqueue never stops the others or the write", async () => {
    mockEnqueue.mockRejectedValueOnce(new Error("queue down"));
    const tx = fakeTx();
    await expect(run(tx)).resolves.toBeTruthy();
    tx.commit();
    await settle();
    expect(subjects()).toEqual(["3-1", "3-2", "8-1"]);
  });

  it("reads nothing more when there is no automation", async () => {
    automationRows = [];
    const tx = fakeTx();
    await run(tx);
    tx.commit();
    await settle();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(
      mockQuery.mock.calls.some(([sql]) => String(sql).includes("AS full_name FROM users")),
    ).toBe(false);
  });
});
