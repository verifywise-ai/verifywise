import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));
jest.mock("../../domain.layer/models/modelRisk/modelRisk.model", () => ({ ModelRiskModel: {} }));
const mockDeleteCustomFields = jest.fn<(...args: any[]) => Promise<void>>();
jest.mock("../customField.utils", () => ({
  deleteAllCustomFieldValuesForEntityQuery: (...args: any[]) => mockDeleteCustomFields(...args),
  fetchCustomFieldsForEntities: jest.fn(),
}));
const mockRecordChange = jest.fn<(...args: any[]) => Promise<void>>();
jest.mock("../changeHistory.base.utils", () => ({
  recordEntityChange: (...args: any[]) => mockRecordChange(...args),
  getFieldLabel: () => "Associated model",
}));

import {
  deleteModelRiskByIdQuery,
  releaseModelRisksOfModelQuery,
  updateModelRiskByIdQuery,
} from "../modelRisk.utils";

const tx = { id: "tx" } as any;
const sqls = () => mockQuery.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  mockQuery.mockReset();
  mockDeleteCustomFields.mockReset();
  mockRecordChange.mockReset();
});

describe("a deleted model risk cannot be changed (M-M9)", () => {
  it("update reads and writes only a live risk", async () => {
    mockQuery
      .mockResolvedValueOnce([{ owner: null, model_id: null }]) // current row
      .mockResolvedValueOnce([{ id: 4 }]); // UPDATE
    await updateModelRiskByIdQuery(4, { risk_name: "x" } as any, 1, tx);
    expect(sqls()[0]).toMatch(/FROM model_risks .*AND is_deleted = false/);
    expect(sqls()[1]).toMatch(/UPDATE model_risks SET .*AND is_deleted = false RETURNING/);
  });

  it("update answers null for a deleted risk, without writing", async () => {
    mockQuery.mockResolvedValueOnce([]); // the live-row read finds nothing
    await expect(updateModelRiskByIdQuery(4, { risk_name: "x" } as any, 1, tx)).resolves.toBe(null);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("delete answers false for a risk already deleted, and keeps its custom fields", async () => {
    // A raw UPDATE ... RETURNING that matched nothing.
    mockQuery.mockResolvedValueOnce([[], { rowCount: 0 }]);
    await expect(deleteModelRiskByIdQuery(4, 1, tx)).resolves.toBe(false);
    expect(mockDeleteCustomFields).not.toHaveBeenCalled();
  });

  it("delete archives a live risk and clears its custom field values", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 4 }], { rowCount: 1 }]);
    await expect(deleteModelRiskByIdQuery(4, 1, tx)).resolves.toBe(true);
    expect(sqls()[0]).toMatch(/SET is_deleted = true.*AND is_deleted = false/);
    expect(mockDeleteCustomFields).toHaveBeenCalledWith("model_risk", 4, 1, tx);
  });
});

describe("releaseModelRisksOfModelQuery (M-H1)", () => {
  /** Answers each query by its SQL. */
  const db = (state: { live: number[]; detached: { id: number; is_deleted: boolean }[] }) =>
    mockQuery.mockImplementation(async (sql: string, opts: any) => {
      if (/^SELECT id FROM model_risks/.test(sql.trim())) {
        return state.live.map((id) => ({ id }));
      }
      if (/SET is_deleted = true/.test(sql)) return [[{ id: opts.replacements.id }], {}];
      if (/FROM model_inventories/.test(sql)) return [{ model: "Fraud model" }];
      if (/SET model_id = NULL/.test(sql)) return [state.detached, {}];
      return [[], {}];
    });

  it("keep: no risk is archived; live ones lose the model with a history entry", async () => {
    db({
      live: [7, 8],
      detached: [
        { id: 8, is_deleted: false },
        { id: 7, is_deleted: false },
        { id: 3, is_deleted: true },
      ],
    });
    const result = await releaseModelRisksOfModelQuery(50, false, 1, 9, tx);

    expect(result).toEqual({ archived: [], kept: [7, 8] });
    expect(sqls().some((s) => /DELETE FROM model_risks/.test(s))).toBe(false);
    expect(sqls().some((s) => /SET is_deleted = true/.test(s))).toBe(false);
    const detach = mockQuery.mock.calls.find((c) => /SET model_id = NULL/.test(String(c[0])))!;
    expect(String(detach[0])).toMatch(/organization_id = :organizationId AND model_id = :modelId/);
    expect(detach[1]).toMatchObject({ replacements: { organizationId: 1, modelId: 50 } });
    expect(mockRecordChange.mock.calls.map((c) => c.slice(0, 8))).toEqual([
      ["model_risk", 7, "updated", 9, 1, "Associated model", "Fraud model", "-"],
      ["model_risk", 8, "updated", 9, 1, "Associated model", "Fraud model", "-"],
    ]);
  });

  it("delete: archives each live risk with a deletion in its history, never a hard delete", async () => {
    db({
      live: [7, 8],
      detached: [
        { id: 7, is_deleted: true },
        { id: 8, is_deleted: true },
      ],
    });
    const result = await releaseModelRisksOfModelQuery(50, true, 1, 9, tx);

    expect(result).toEqual({ archived: [7, 8], kept: [] });
    expect(sqls().some((s) => /DELETE FROM model_risks/.test(s))).toBe(false);
    expect(mockDeleteCustomFields.mock.calls.map((c) => c[1])).toEqual([7, 8]);
    expect(mockRecordChange.mock.calls.map((c) => [c[1], c[2], c[3], c[9]])).toEqual([
      [7, "deleted", 9, false],
      [8, "deleted", 9, false],
    ]);
  });

  it("records the history as the system's without a user (AI Advisor)", async () => {
    db({ live: [7], detached: [{ id: 7, is_deleted: true }] });
    await releaseModelRisksOfModelQuery(50, true, 1, null, tx);
    expect(mockRecordChange.mock.calls[0][3]).toBe(null);
    expect(mockRecordChange.mock.calls[0][9]).toBe(true);
  });
});
