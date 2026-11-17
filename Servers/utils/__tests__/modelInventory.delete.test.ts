import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../history/modelInventoryHistory.utils", () => ({
  recordSnapshotIfChanged: jest.fn(async () => undefined),
}));
jest.mock("../customField.utils", () => ({
  deleteAllCustomFieldValuesForEntityQuery: jest.fn(async () => undefined),
  fetchCustomFieldsForEntities: jest.fn(),
}));
const mockRelease = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../modelRisk.utils", () => ({
  releaseModelRisksOfModelQuery: (...args: any[]) => mockRelease(...args),
}));

import { deleteModelInventoryByIdQuery } from "../modelInventory.utils";

const tx = { id: "tx" } as any;
const sqls = () => mockQuery.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string) =>
    /DELETE FROM model_inventories/.test(sql) ? [[{ id: 50 }], 1] : [[], 0],
  );
  mockRelease.mockReset();
  mockRelease.mockResolvedValue({ archived: [], kept: [] });
});

describe("deleteModelInventoryByIdQuery", () => {
  it.each([
    ["keep", false],
    ["delete", true],
  ])("%s risks: releases them before the model goes, never deleting them", async (_, del) => {
    await deleteModelInventoryByIdQuery(50, del, 1, tx, 9);

    expect(mockRelease).toHaveBeenCalledWith(50, del, 1, 9, tx);
    expect(sqls().some((s) => /DELETE FROM model_risks/.test(s))).toBe(false);
    const releasedBeforeDelete =
      mockRelease.mock.invocationCallOrder[0] <
      mockQuery.mock.invocationCallOrder[
        sqls().findIndex((s) => /DELETE FROM model_inventories/.test(s))
      ];
    expect(releasedBeforeDelete).toBe(true);
  });

  it("without a user (AI Advisor) passes null for the history", async () => {
    await deleteModelInventoryByIdQuery(50, true, 1, tx);
    expect(mockRelease).toHaveBeenCalledWith(50, true, 1, null, tx);
  });
});
