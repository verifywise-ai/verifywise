import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));
jest.mock("../../domain.layer/models/modelRisk/modelRisk.model", () => ({ ModelRiskModel: {} }));
const mockDeleteCustomFields = jest.fn<(...args: any[]) => Promise<void>>();
const mockDeleteCustomFieldsBulk = jest.fn<(...args: any[]) => Promise<void>>();
jest.mock("../customField.utils", () => ({
  deleteAllCustomFieldValuesForEntityQuery: (...args: any[]) => mockDeleteCustomFields(...args),
  deleteAllCustomFieldValuesForEntitiesQuery: (...args: any[]) =>
    mockDeleteCustomFieldsBulk(...args),
  fetchCustomFieldsForEntities: jest.fn(),
}));
const mockRecordBulk = jest.fn<(...args: any[]) => Promise<void>>();
const mockRecordDeletionBulk = jest.fn<(...args: any[]) => Promise<void>>();
const mockFormat = jest.fn<(...args: any[]) => Promise<string>>();
jest.mock("../changeHistory.base.utils", () => ({
  recordEntityChangeBulk: (...args: any[]) => mockRecordBulk(...args),
  recordEntityDeletionBulk: (...args: any[]) => mockRecordDeletionBulk(...args),
  formatFieldValue: (...args: any[]) => mockFormat(...args),
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
  mockDeleteCustomFieldsBulk.mockReset();
  mockRecordBulk.mockReset();
  mockRecordDeletionBulk.mockReset();
  mockFormat.mockReset();
  mockFormat.mockResolvedValue("Fraud model");
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
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FOR UPDATE/.test(sql)) return [{ id: 50 }];
      if (/SET is_deleted = true/.test(sql)) return [state.live.map((id) => ({ id })), {}];
      if (/SET model_id = NULL/.test(sql)) return [state.detached, {}];
      return [[], {}];
    });
  const indexOf = (re: RegExp) => sqls().findIndex((s) => re.test(s));

  it("locks the model row first, in the organization", async () => {
    db({ live: [7], detached: [{ id: 7, is_deleted: true }] });
    await releaseModelRisksOfModelQuery(50, true, 1, 9, tx);

    expect(indexOf(/FOR UPDATE/)).toBe(0);
    expect(sqls()[0]).toMatch(
      /FROM model_inventories\s+WHERE organization_id = :organizationId AND id = :modelId\s+FOR UPDATE/,
    );
    expect(mockQuery.mock.calls[0][1]).toMatchObject({
      replacements: { organizationId: 1, modelId: 50 },
      transaction: tx,
    });
  });

  it("keep: no risk is archived; every risk that loses the model gets a history entry", async () => {
    db({
      live: [],
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
    expect(mockRecordDeletionBulk).not.toHaveBeenCalled();
    const detach = mockQuery.mock.calls.find((c) => /SET model_id = NULL/.test(String(c[0])))!;
    expect(String(detach[0])).toMatch(/organization_id = :organizationId AND model_id = :modelId/);
    expect(detach[1]).toMatchObject({ replacements: { organizationId: 1, modelId: 50 } });
    // The model name is formatted the way an edit of model_id records it.
    expect(mockFormat).toHaveBeenCalledWith("model_risk", "model_id", 50, {
      organizationId: 1,
      transaction: tx,
    });
    expect(mockRecordBulk.mock.calls.map((c) => c.slice(0, 10))).toEqual([
      ["model_risk", [3, 7, 8], "updated", 9, 1, "Associated model", "Fraud model", "-", tx, false],
    ]);
  });

  it("delete: archives the live risks in one statement, with deletion and model in history", async () => {
    db({
      live: [8, 7],
      detached: [
        { id: 7, is_deleted: true },
        { id: 8, is_deleted: true },
      ],
    });
    const result = await releaseModelRisksOfModelQuery(50, true, 1, 9, tx);

    expect(result).toEqual({ archived: [7, 8], kept: [] });
    expect(sqls().some((s) => /DELETE FROM model_risks/.test(s))).toBe(false);
    // Set-based: no per-risk read or write.
    expect(sqls().some((s) => /^SELECT id FROM model_risks/.test(s.trim()))).toBe(false);
    expect(sqls().filter((s) => /SET is_deleted = true/.test(s))).toHaveLength(1);
    const archiveSql = sqls()[indexOf(/SET is_deleted = true/)];
    expect(archiveSql).toMatch(
      /organization_id = :organizationId AND model_id = :modelId AND is_deleted = false/,
    );
    expect(archiveSql).toMatch(/deleted_at = NOW\(\)/);
    expect(indexOf(/FOR UPDATE/)).toBeLessThan(indexOf(/SET is_deleted = true/));
    expect(indexOf(/SET is_deleted = true/)).toBeLessThan(indexOf(/SET model_id = NULL/));
    expect(mockDeleteCustomFields).not.toHaveBeenCalled();
    expect(mockDeleteCustomFieldsBulk).toHaveBeenCalledWith("model_risk", [7, 8], 1, tx);
    expect(mockRecordDeletionBulk).toHaveBeenCalledWith("model_risk", [7, 8], 9, 1, tx, false);
    // The archived risks also say which model they belonged to.
    expect(mockRecordBulk.mock.calls.map((c) => [c[1], c[2], c[6], c[7]])).toEqual([
      [[7, 8], "updated", "Fraud model", "-"],
    ]);
  });

  it("records the history as the system's without a user (AI Advisor)", async () => {
    db({ live: [7], detached: [{ id: 7, is_deleted: true }] });
    await releaseModelRisksOfModelQuery(50, true, 1, null, tx);
    expect(mockRecordDeletionBulk).toHaveBeenCalledWith("model_risk", [7], null, 1, tx, true);
    expect(mockRecordBulk.mock.calls[0][3]).toBe(null);
    expect(mockRecordBulk.mock.calls[0][9]).toBe(true);
  });
});
