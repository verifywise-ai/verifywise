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

import { deleteProjectByIdQuery } from "../project.utils";
import { sequelize } from "../../database/db";
import { enqueueAutomationAction } from "../../services/automations/automationProducer";

const query = sequelize.query as unknown as jest.Mock<(...args: any[]) => Promise<any>>;
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

beforeEach(() => {
  jest.clearAllMocks();
  enqueue.mockResolvedValue(undefined);
  query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("DELETE FROM projects WHERE")) return [{ id: 111, owner: 3 }];
    if (sql.includes("FROM automation_triggers")) {
      return [
        [
          {
            trigger_key: "project_deleted",
            action_key: "send_email",
            automation_id: 1,
            params: { subject: "", body: "" },
          },
        ],
        0,
      ];
    }
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
  it("queues the automation at once by default (core path unchanged)", async () => {
    const tx = fakeTransaction();

    await expect(deleteProjectByIdQuery(111, 5, tx as any)).resolves.toBe(true);

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(tx.afterCommit).not.toHaveBeenCalled();
  });

  it("with enqueueAutomationAfterCommit, queues it only when the transaction commits", async () => {
    const tx = fakeTransaction();

    await deleteProjectByIdQuery(111, 5, tx as any, { enqueueAutomationAfterCommit: true });

    // Nothing is queued while the transaction can still roll back.
    expect(enqueue).not.toHaveBeenCalled();
    expect(tx.hooks).toHaveLength(1);

    await tx.hooks[0]();
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][1]).toMatchObject({ organizationId: 5, automation_id: 1 });
  });

  it("never throws from the after-commit hook when queueing fails", async () => {
    const tx = fakeTransaction();
    enqueue.mockRejectedValueOnce(new Error("redis down"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await deleteProjectByIdQuery(111, 5, tx as any, { enqueueAutomationAfterCommit: true });
    expect(() => tx.hooks[0]()).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
