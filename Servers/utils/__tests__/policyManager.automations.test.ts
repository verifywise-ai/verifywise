jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../customField.utils", () => ({
  deleteAllCustomFieldValuesForEntityQuery: jest.fn().mockResolvedValue(undefined),
  fetchCustomFieldsForEntities: jest.fn(),
}));
jest.mock("../user.utils", () => ({
  findUsersNotInOrganization: jest.fn().mockResolvedValue([]),
  parseReferencedIds: jest.fn((ids: unknown[]) => ids.filter(Boolean).map(Number)),
}));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { sequelize } from "../../database/db";
import { enqueueAutomationAction } from "../../services/automations/automationProducer";
import {
  createPolicyQuery,
  deletePolicyByIdQuery,
  updatePolicyByIdQuery,
} from "../policyManager.utils";

const mockQuery = sequelize.query as jest.Mock;
const mockEnqueue = enqueueAutomationAction as jest.Mock;

/** A transaction that keeps its afterCommit callbacks until commit() or rollback(). */
function makeTransaction() {
  let callbacks: Array<() => unknown> = [];
  return {
    afterCommit: jest.fn((cb: () => unknown) => {
      callbacks.push(cb);
    }),
    commit: () => {
      callbacks.forEach((cb) => cb());
      callbacks = [];
    },
    rollback: () => {
      callbacks = [];
    },
  };
}

/** Two active automations with two actions each, in a.id, order order (P-L12). */
const FOUR_ACTIONS = [
  { automation_id: 1, action_key: "send_email", params: { subject: "1a {{policy.title}}" } },
  {
    automation_id: 1,
    action_key: "send_slack",
    params: { subject: "1b", body: "Reviewers: {{policy.reviewers}}" },
  },
  { automation_id: 2, action_key: "send_email", params: { subject: "2a {{policy.title}}" } },
  { automation_id: 2, action_key: "send_slack", params: { subject: "2b" } },
];

const POLICY = { id: 9, title: "Acceptable use", status: "Draft", assigned_reviewer_ids: [3] };

/** Stored policy 9 with reviewer 3, and FOUR_ACTIONS for `trigger`. */
function arrange(trigger: string) {
  mockQuery.mockImplementation(async (sql: string, options: any) => {
    if (sql.includes("FROM automation_triggers")) {
      return options.replacements.triggerKey === trigger ? FOUR_ACTIONS : [];
    }
    if (sql.includes("FROM policy_manager pm")) return [{ ...POLICY }];
    if (sql.includes("INSERT INTO policy_manager AS pm")) return [[{ ...POLICY }], 1];
    if (sql.includes("FROM users")) return [{ full_name: "Ann Lee" }];
    return [[], 0];
  });
}

const enqueued = () => mockEnqueue.mock.calls.map(([key, data]) => [key, data.automation_id]);
const IN_ORDER = [
  ["send_email", 1],
  ["send_slack", 1],
  ["send_email", 2],
  ["send_slack", 2],
];
const userQueries = () =>
  mockQuery.mock.calls.filter(([sql]) => String(sql).includes("FROM users"));

beforeEach(() => {
  mockQuery.mockReset();
  mockEnqueue.mockReset();
  mockEnqueue.mockResolvedValue(undefined);
});

describe("policy automations", () => {
  it("runs every action of every policy_added automation, in order, after commit", async () => {
    arrange("policy_added");
    const tx = makeTransaction();

    await createPolicyQuery(
      { title: "Acceptable use", assigned_reviewer_ids: [3] } as never,
      4,
      1,
      tx as never,
    );
    expect(mockEnqueue).not.toHaveBeenCalled();
    // Reviewer names are read once for the event, not per action.
    expect(userQueries()).toHaveLength(1);

    tx.commit();
    expect(enqueued()).toEqual(IN_ORDER);
    expect(mockEnqueue.mock.calls[0][1]).toEqual({
      subject: "1a Acceptable use",
      body: "",
      automation_id: 1,
      organizationId: 4,
    });
    expect(mockEnqueue.mock.calls[1][1].body).toBe("Reviewers: Ann Lee");
  });

  it("runs every action of every policy_updated automation after commit", async () => {
    arrange("policy_updated");
    const tx = makeTransaction();

    await updatePolicyByIdQuery(9, { title: "Renamed" }, 4, 1, tx as never);
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(userQueries()).toHaveLength(1);

    tx.commit();
    expect(enqueued()).toEqual(IN_ORDER);
  });

  it("runs every action of every policy_deleted automation after commit", async () => {
    arrange("policy_deleted");
    const tx = makeTransaction();

    await expect(deletePolicyByIdQuery(4, 9, tx as never)).resolves.toBe(true);
    expect(mockEnqueue).not.toHaveBeenCalled();

    tx.commit();
    expect(enqueued()).toEqual(IN_ORDER);
    expect(mockEnqueue.mock.calls[2][1].subject).toBe("2a Acceptable use");
  });

  it("enqueues nothing when the policy write rolls back", async () => {
    arrange("policy_updated");
    const tx = makeTransaction();

    await updatePolicyByIdQuery(9, { title: "Renamed" }, 4, 1, tx as never);
    tx.rollback();

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("still enqueues the other actions when one enqueue fails", async () => {
    arrange("policy_deleted");
    mockEnqueue.mockRejectedValueOnce(new Error("redis down"));
    const tx = makeTransaction();

    await deletePolicyByIdQuery(4, 9, tx as never);
    expect(() => tx.commit()).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    expect(enqueued()).toEqual(IN_ORDER);
  });

  it("reads no reviewer names and enqueues nothing without an active automation", async () => {
    arrange("policy_deleted");
    const tx = makeTransaction();

    await createPolicyQuery({ title: "Acceptable use" } as never, 4, 1, tx as never);

    expect(userQueries()).toHaveLength(0);
    expect(tx.afterCommit).not.toHaveBeenCalled();
  });
});
