/**
 * createNewTaskQuery with a `task_added` automation and a task that has no
 * creator (creator_id is nullable: a system-created task, or a creator who
 * was deleted). The creator-name lookup finds no row; the task is still
 * created and the automation enqueued with an empty creator name, instead of
 * throwing on `creator_name[0][0].full_name`.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));

import { sequelize } from "../../database/db";
import { enqueueAutomationAction } from "../../services/automations/automationProducer";
import { createNewTaskQuery } from "../task.utils";
import { TaskPriority } from "../../domain.layer/enums/task-priority.enum";
import { TaskStatus } from "../../domain.layer/enums/task-status.enum";

const mockQuery = sequelize.query as unknown as jest.Mock<any>;
const mockEnqueue = enqueueAutomationAction as unknown as jest.Mock<any>;
const tx = { id: "tx" } as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("INSERT INTO tasks")) {
      return [{ id: 700, title: "T", creator_id: null, dataValues: { id: 700, creator_id: null } }];
    }
    if (sql.includes("INSERT INTO task_assignees")) return [[], 1];
    if (sql.includes("automation_triggers")) {
      return [
        {
          action_key: "send_email",
          automation_id: 3,
          params: { subject: "New task {{task.creator}}", body: "b" },
          order: 1,
          legacy_first_action_only: false,
        },
      ];
    }
    // The creator-name lookup: no user for a NULL creator_id.
    if (sql.includes("AS full_name FROM users WHERE id = :creator_id")) return [[], 0];
    if (sql.includes("AS full_name FROM users")) return [[{ full_name: "Ada Owner" }], 1];
    throw new Error(`unexpected query: ${sql}`);
  });
});

describe("createNewTaskQuery without a creator", () => {
  it("creates the task and enqueues task_added with an empty creator name", async () => {
    const task = await createNewTaskQuery(
      {
        title: "T",
        creator_id: null as unknown as number,
        priority: TaskPriority.HIGH,
        status: TaskStatus.OPEN,
      },
      42,
      tx,
      [{ user_id: 5 }],
    );

    expect(task.id).toBe(700);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith(
      "send_email",
      expect.objectContaining({ organizationId: 42, automation_id: 3 }),
    );
  });
});
