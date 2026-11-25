import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));
const mockEnqueue = jest.fn<(...args: any[]) => Promise<void>>();
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: (...args: any[]) => mockEnqueue(...args),
}));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
  logStructuredError: jest.fn(),
}));
jest.mock("../history/modelInventoryHistory.utils", () => ({
  recordSnapshotIfChanged: jest.fn(async () => undefined),
}));
jest.mock("../customField.utils", () => ({
  deleteAllCustomFieldValuesForEntityQuery: jest.fn(async () => undefined),
  fetchCustomFieldsForEntities: jest.fn(),
}));
jest.mock("../modelRisk.utils", () => ({
  releaseModelRisksOfModelQuery: jest.fn(async () => ({ archived: [], kept: [] })),
}));
jest.mock("../../domain.layer/models/modelInventory/modelInventory.model", () => ({
  ModelInventoryModel: {},
}));

import {
  createNewModelInventoryQuery,
  deleteModelInventoryByIdQuery,
  updateModelInventoryByIdQuery,
} from "../modelInventory.utils";

const actionRow = (automationId: number, order: number, legacy = false) => ({
  automation_id: automationId,
  action_key: order === 1 ? "send_email" : "send_slack",
  params: { subject: `${automationId}-${order}`, body: "b" },
  order,
  legacy_first_action_only: legacy,
});
/** The action rows every model trigger lookup answers with. */
let automationRows = [actionRow(3, 1)];
const subjects = () => mockEnqueue.mock.calls.map(([, data]) => (data as any).subject);
const settle = () => new Promise((resolve) => setImmediate(resolve));
const row = (values: Record<string, unknown> = {}) => ({
  id: 50,
  model: "M",
  provider: "P",
  version: "1",
  status: "Pending",
  dataValues: {},
  ...values,
});

function fakeTx() {
  const hooks: Array<() => unknown> = [];
  return {
    afterCommit: (fn: () => unknown) => hooks.push(fn),
    commit: () => hooks.forEach((f) => f()),
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockEnqueue.mockReset();
  mockEnqueue.mockResolvedValue(undefined);
  automationRows = [actionRow(3, 1)];
  mockQuery.mockImplementation(async (sql: string) => {
    if (/FROM automation_triggers/.test(sql)) return automationRows;
    if (/INSERT INTO model_inventories\b/.test(sql)) return [row()];
    if (/^\s*SELECT \* FROM model_inventories/.test(sql)) return [row()];
    if (/UPDATE model_inventories/.test(sql)) return [[row()], 1];
    if (/DELETE FROM model_inventories\b/.test(sql)) return [[row()], 1];
    return [[], 0];
  });
});

// A rolled-back write must announce nothing: the automation is enqueued only
// once the caller's transaction commits.
describe("model automations wait for the commit", () => {
  it("model_added", async () => {
    const tx = fakeTx();
    await createNewModelInventoryQuery(row() as any, 1, [], [], tx as any);
    expect(mockEnqueue).not.toHaveBeenCalled();
    tx.commit();
    expect(mockEnqueue).toHaveBeenCalledWith(
      "send_email",
      expect.objectContaining({ organizationId: 1 }),
    );
  });

  it("model_updated", async () => {
    const tx = fakeTx();
    await updateModelInventoryByIdQuery(
      50,
      row({ status: "Approved" }) as any,
      [],
      [],
      false,
      false,
      1,
      tx as any,
    );
    expect(mockEnqueue).not.toHaveBeenCalled();
    tx.commit();
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it("model_deleted", async () => {
    const tx = fakeTx();
    await deleteModelInventoryByIdQuery(50, false, 1, tx as any);
    expect(mockEnqueue).not.toHaveBeenCalled();
    tx.commit();
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });
});

describe("updateModelInventoryByIdQuery with the caller's locked row", () => {
  it("does not read the model again", async () => {
    const tx = fakeTx();
    await updateModelInventoryByIdQuery(
      50,
      row({ status: "Approved" }) as any,
      [],
      [],
      false,
      false,
      1,
      tx as any,
      undefined,
      row({ status: "Pending" }),
    );
    // getModelInventoryByIdQuery's read (the row after the UPDATE is still
    // read back, to return it).
    const reads = mockQuery.mock.calls.filter(([sql]) =>
      /FROM model_inventories WHERE organization_id = :organizationId AND id = :id/.test(
        String(sql),
      ),
    );
    expect(reads).toHaveLength(0);
  });
});

describe("model automations run every action", () => {
  const events: Array<[string, (tx: any) => Promise<unknown>]> = [
    ["model_added", (tx) => createNewModelInventoryQuery(row() as any, 1, [], [], tx)],
    [
      "model_updated",
      (tx) =>
        updateModelInventoryByIdQuery(
          50,
          row({ status: "Approved" }) as any,
          [],
          [],
          false,
          false,
          1,
          tx,
        ),
    ],
    ["model_deleted", (tx) => deleteModelInventoryByIdQuery(50, false, 1, tx)],
  ];

  it.each(events)("%s: every action of every active automation, in order", async (key, run) => {
    automationRows = [actionRow(3, 1), actionRow(3, 2), actionRow(8, 1)];
    const tx = fakeTx();
    await run(tx);
    const lookup = mockQuery.mock.calls.find(([sql]) => /FROM automation_triggers/.test(sql));
    expect(lookup?.[1]).toMatchObject({ replacements: { organizationId: 1, triggerKey: key } });
    tx.commit();
    await settle();
    expect(subjects()).toEqual(["3-1", "3-2", "8-1"]);
  });

  it.each(events)("%s: a legacy-flagged automation keeps the event's first", async (_key, run) => {
    automationRows = [actionRow(3, 1, true), actionRow(3, 2, true), actionRow(8, 1)];
    const tx = fakeTx();
    await run(tx);
    tx.commit();
    await settle();
    expect(subjects()).toEqual(["3-1", "8-1"]);
  });

  it("one failed enqueue never stops the next", async () => {
    automationRows = [actionRow(3, 1), actionRow(3, 2)];
    mockEnqueue.mockRejectedValueOnce(new Error("queue down"));
    const tx = fakeTx();
    await createNewModelInventoryQuery(row() as any, 1, [], [], tx as any);
    tx.commit();
    await settle();
    expect(subjects()).toEqual(["3-1", "3-2"]);
  });
});
