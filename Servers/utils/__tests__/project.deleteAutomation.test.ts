import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../automation/project.automation.utils", () => ({
  buildProjectReplacements: jest.fn(() => ({})),
  buildProjectUpdateReplacements: jest.fn(() => ({})),
}));
jest.mock("../customField.utils", () => ({
  deleteAllCustomFieldValuesForEntityQuery: jest.fn(),
  fetchCustomFieldsForEntities: jest.fn(),
}));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
  logStructuredError: jest.fn(),
}));

import { deleteProjectByIdQuery } from "../project.utils";
import { sequelize } from "../../database/db";
import { enqueueAutomationAction } from "../../services/automations/automationProducer";
import logger from "../logger/fileLogger";

const query = sequelize.query as unknown as jest.Mock<(...args: any[]) => Promise<any>>;
/** The SQL statements run, in order. */
const statements = () => query.mock.calls.map(([sql]) => String(sql));
const indexOf = (re: RegExp) => statements().findIndex((sql) => re.test(sql));
const enqueue = enqueueAutomationAction as unknown as jest.Mock<(...args: any[]) => Promise<any>>;

/** A transaction double that collects afterCommit hooks so a test can fire them. */
function fakeTransaction() {
  const hooks: Array<() => unknown> = [];
  return {
    hooks,
    afterCommit: jest.fn((hook: () => unknown) => {
      hooks.push(hook);
    }),
  };
}

/** The project_deleted action rows the trigger lookup answers with. */
let automationRows: Record<string, unknown>[] = [];
const actionRow = (automationId: number, order: number, legacy = false) => ({
  automation_id: automationId,
  action_key: order === 1 ? "send_email" : "send_slack",
  params: { subject: `${automationId}-${order}`, body: "" },
  order,
  legacy_first_action_only: legacy,
});

beforeEach(() => {
  jest.clearAllMocks();
  automationRows = [actionRow(1, 1)];
  enqueue.mockResolvedValue(undefined);
  query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("DELETE FROM projects WHERE")) return [{ id: 111, owner: 3 }];
    if (sql.includes("FROM automation_triggers")) return automationRows;
    if (sql.includes("AS full_name")) return [[{ full_name: "A B" }], 0];
    return [];
  });
});

describe("deleteProjectByIdQuery lock order", () => {
  it("locks the project row first, before any child row is read or deleted", async () => {
    const tx = fakeTransaction();

    await deleteProjectByIdQuery(111, 5, tx as any);

    const [firstSql, firstOptions] = query.mock.calls[0] as [string, any];
    expect(firstSql).toMatch(
      /^SELECT id FROM projects WHERE id = :id AND organization_id = :organizationId FOR UPDATE/,
    );
    expect(firstOptions).toMatchObject({
      replacements: { id: 111, organizationId: 5 },
      transaction: tx,
    });
    const statements = query.mock.calls.map(([sql]) => String(sql));
    const projectDelete = statements.findIndex((sql) => sql.startsWith("DELETE FROM projects"));
    expect(projectDelete).toBeGreaterThan(0);
    // Every child-row statement comes after the lock.
    expect(statements.slice(1).some((sql) => sql.includes("FOR UPDATE"))).toBe(false);
  });
});

describe("deleteProjectByIdQuery project_deleted automation", () => {
  /** Deletes project 111 and fires the commit hooks; returns the enqueued subjects. */
  const deleteAndCommit = async () => {
    const tx = fakeTransaction();
    await expect(deleteProjectByIdQuery(111, 5, tx as any)).resolves.toBe(true);
    tx.hooks.forEach((hook) => hook());
    await new Promise((resolve) => setImmediate(resolve));
    return enqueue.mock.calls.map(([, data]) => (data as any).subject);
  };

  it("queues the automation only when the transaction commits", async () => {
    const tx = fakeTransaction();

    await deleteProjectByIdQuery(111, 5, tx as any);

    // Nothing is queued while the transaction can still roll back.
    expect(enqueue).not.toHaveBeenCalled();
    expect(tx.hooks).toHaveLength(1);

    await tx.hooks[0]();
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][1]).toMatchObject({ organizationId: 5, automation_id: 1 });
  });

  it("never throws from the after-commit hook when queueing fails, and still runs the rest", async () => {
    automationRows = [actionRow(1, 1), actionRow(1, 2)];
    enqueue.mockRejectedValueOnce(new Error("redis down"));

    expect(await deleteAndCommit()).toEqual(["1-1", "1-2"]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("project_deleted, project 111"),
    );
  });

  it("queues every action of every active automation, in order", async () => {
    automationRows = [actionRow(1, 1), actionRow(1, 2), actionRow(4, 1)];
    expect(await deleteAndCommit()).toEqual(["1-1", "1-2", "4-1"]);
  });

  it("keeps a legacy-flagged automation to the event's first action", async () => {
    automationRows = [
      actionRow(1, 1, true),
      actionRow(1, 2, true),
      actionRow(4, 1),
      actionRow(4, 2),
    ];
    expect(await deleteAndCommit()).toEqual(["1-1", "4-1", "4-2"]);
  });

  it("reads the actions and the owner's name in a savepoint of the transaction", async () => {
    const tx = fakeTransaction();
    await deleteProjectByIdQuery(111, 5, tx as any);
    const lookup = query.mock.calls.find(([sql]) =>
      String(sql).includes("FROM automation_triggers"),
    );
    expect(lookup?.[1]).toMatchObject({
      replacements: { organizationId: 5, triggerKey: "project_deleted" },
      transaction: tx,
    });
    const open = indexOf(/^SAVEPOINT automation_lookup_\d+$/);
    expect(open).toBeGreaterThan(indexOf(/^DELETE FROM projects WHERE/));
    expect(open).toBeLessThan(indexOf(/FROM automation_triggers/));
    expect(indexOf(/AS full_name/)).toBeLessThan(indexOf(/^RELEASE SAVEPOINT automation_lookup_/));
    expect(indexOf(/^ROLLBACK TO SAVEPOINT/)).toBe(-1);
  });

  it("contains a failed lookup: the delete succeeds and nothing is queued", async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("DELETE FROM projects WHERE")) return [{ id: 111, owner: 3 }];
      if (sql.includes("FROM automation_triggers")) throw new Error("relation missing");
      return [];
    });

    expect(await deleteAndCommit()).toEqual([]);
    // Rolled back to the savepoint, so the delete's transaction can still commit.
    expect(indexOf(/^ROLLBACK TO SAVEPOINT automation_lookup_/)).toBeGreaterThan(
      indexOf(/FROM automation_triggers/),
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("project_deleted lookup failed"),
    );
  });
});
