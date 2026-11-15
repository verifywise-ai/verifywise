/**
 * Automations that existed before every-action dispatch keep running only the
 * event's first action (legacy_first_action_only) on risk and policy events,
 * while new automations run every action. Saving an automation in the editor
 * clears the flag; the active toggle does not.
 */
jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../history/riskHistory.utils", () => ({
  recordSnapshotIfChanged: jest.fn().mockResolvedValue(undefined),
}));
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
jest.mock("../projectRiskChangeHistory.utils", () => ({
  recordProjectRiskDeletion: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { sequelize } from "../../database/db";
import { enqueueAutomationAction } from "../../services/automations/automationProducer";
import { enqueueBulkRiskAutomation, updateRiskByIdQuery } from "../risk.utils";
import { createPolicyQuery } from "../policyManager.utils";
import { updateAutomationByIdQuery } from "../automation.utils";
import {
  getActiveAutomationActionsQuery,
  IAutomationActionRow,
  keepLegacyFirstActionOnly,
} from "../automation/automationActions.utils";

const mockQuery = sequelize.query as jest.Mock;
const mockEnqueue = enqueueAutomationAction as jest.Mock;
const settle = () => new Promise((resolve) => setImmediate(resolve));

const action = (
  automationId: number,
  order: number,
  legacy: boolean,
  key = order === 1 ? "send_email" : "send_slack",
): IAutomationActionRow => ({
  automation_id: automationId,
  action_key: key,
  params: { subject: `${automationId}-${order}` },
  order,
  legacy_first_action_only: legacy,
});

/** Two legacy automations, two actions each; automation 5 holds the lowest order. */
const TWO_LEGACY = [action(3, 2, true), action(3, 3, true), action(5, 1, true), action(5, 2, true)];
/** A legacy automation and a new one, two actions each, in a.id, order order. */
const LEGACY_AND_NEW = [
  action(3, 1, true),
  action(3, 2, true),
  action(5, 1, false),
  action(5, 2, false),
];

const enqueued = () => mockEnqueue.mock.calls.map(([, data]) => data.subject);

/** Answers the trigger lookup with `rows` for `trigger`; minimal rows for the rest. */
function arrange(trigger: string, rows: IAutomationActionRow[]) {
  mockQuery.mockImplementation(async (sql: string, options: any) => {
    if (sql.includes("FROM automation_triggers")) {
      return options.replacements.triggerKey === trigger ? rows : [];
    }
    if (sql.startsWith("SELECT * FROM risks")) return [[{ id: 7 }], 1];
    if (sql.startsWith("UPDATE risks SET")) {
      return [{ id: 7, dataValues: { id: 7, risk_name: "Risk 7", risk_owner: 2 } }];
    }
    if (sql.includes("INSERT INTO policy_manager AS pm")) return [[{ id: 9, title: "P" }], 1];
    if (sql.includes("FROM users")) return [];
    return [[], 0];
  });
}

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
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockEnqueue.mockReset();
  mockEnqueue.mockResolvedValue(undefined);
});

describe("keepLegacyFirstActionOnly", () => {
  it("keeps only the first legacy row of the event, by order and then automation id", () => {
    expect(keepLegacyFirstActionOnly(TWO_LEGACY)).toEqual([action(5, 1, true)]);
    expect(
      keepLegacyFirstActionOnly([action(5, 1, true), action(3, 1, true)]).map(
        (row) => row.automation_id,
      ),
    ).toEqual([3]);
  });

  it("keeps every row of new automations, in the given order", () => {
    expect(keepLegacyFirstActionOnly(LEGACY_AND_NEW)).toEqual([
      action(3, 1, true),
      action(5, 1, false),
      action(5, 2, false),
    ]);
    expect(keepLegacyFirstActionOnly([action(5, 1, false), action(5, 2, false)])).toHaveLength(2);
  });
});

describe("risk and policy events", () => {
  it("risk_updated: two legacy automations with two actions each enqueue exactly one", async () => {
    arrange("risk_updated", TWO_LEGACY);
    const tx = makeTransaction();

    await updateRiskByIdQuery(7, { risk_name: "Risk 7" } as never, 4, tx as never);
    tx.commit();
    await settle();

    expect(enqueued()).toEqual(["5-1"]);
  });

  it("risk_updated: a legacy and a new automation run the legacy first row and all new rows", async () => {
    arrange("risk_updated", LEGACY_AND_NEW);
    const tx = makeTransaction();

    await updateRiskByIdQuery(7, { risk_name: "Risk 7" } as never, 4, tx as never);
    tx.commit();
    await settle();

    expect(enqueued()).toEqual(["3-1", "5-1", "5-2"]);
  });

  it("the bulk risk path follows the same rule", async () => {
    arrange("risk_deleted", LEGACY_AND_NEW);
    const tx = makeTransaction();
    const risk = { id: 7, risk_name: "Risk 7", risk_owner: 2 };

    await enqueueBulkRiskAutomation(
      "risk_deleted",
      [{ before: risk, after: risk }] as never,
      4,
      tx as never,
    );
    tx.commit();
    await settle();

    expect(mockEnqueue.mock.calls.map(([, data]) => data.automation_id)).toEqual([3, 5, 5]);
  });

  it("policy create follows the same rule", async () => {
    arrange("policy_added", TWO_LEGACY);
    const tx = makeTransaction();

    await createPolicyQuery({ title: "P" } as never, 4, 1, tx as never);
    tx.commit();
    await settle();

    expect(enqueued()).toEqual(["5-1"]);
  });

  it("the plain query, which AI Detection uses, keeps every legacy row", async () => {
    mockQuery.mockResolvedValue(TWO_LEGACY);

    await expect(
      getActiveAutomationActionsQuery(4, "ai_detection_scan_completed"),
    ).resolves.toEqual(TWO_LEGACY);
    expect(String(mockQuery.mock.calls[0][0])).toContain("a.legacy_first_action_only");
  });
});

describe("updateAutomationByIdQuery and the legacy flag", () => {
  const tx = {};
  const sqls = () => mockQuery.mock.calls.map(([sql]) => String(sql).replace(/\s+/g, " "));
  const CLEAR =
    "UPDATE automations SET legacy_first_action_only = false WHERE organization_id = :organizationId AND id = :id;";

  beforeEach(() => {
    mockQuery.mockResolvedValue([[{ id: 3, legacy_first_action_only: true }], 1]);
  });

  it("clears the flag, in the same transaction, when the editor saves the actions", async () => {
    const automation = await updateAutomationByIdQuery(
      3,
      { name: "Renamed" } as never,
      [{ action_type_id: 1, params: {} }] as never,
      4,
      tx as never,
    );

    const clear = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("legacy_first_action_only = false"),
    );
    expect(sqls()).toContain(CLEAR);
    expect(clear![1]).toEqual({ replacements: { organizationId: 4, id: 3 }, transaction: tx });
    expect((automation as any).legacy_first_action_only).toBe(false);
  });

  it("keeps the flag when only the active toggle is saved", async () => {
    await updateAutomationByIdQuery(
      3,
      { is_active: false } as never,
      undefined as never,
      4,
      tx as never,
    );

    expect(sqls().some((sql) => sql.includes("legacy_first_action_only"))).toBe(false);
  });
});
