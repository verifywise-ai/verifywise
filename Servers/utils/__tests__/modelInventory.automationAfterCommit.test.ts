import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));
const mockEnqueue = jest.fn<(...args: any[]) => Promise<void>>();
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: (...args: any[]) => mockEnqueue(...args),
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

const automation = {
  trigger_key: "",
  action_key: "send_email",
  automation_id: 3,
  params: { subject: "s", body: "b" },
};
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
  mockQuery.mockImplementation(async (sql: string) => {
    const trigger = /pat\.key = '(\w+)'/.exec(sql)?.[1];
    if (trigger) return [[{ ...automation, trigger_key: trigger }], 1];
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
