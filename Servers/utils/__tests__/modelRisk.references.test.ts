import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));
jest.mock("../../domain.layer/models/modelRisk/modelRisk.model", () => ({ ModelRiskModel: {} }));

import { createNewModelRiskQuery, updateModelRiskByIdQuery } from "../modelRisk.utils";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

const tx = { id: "tx" } as any;
const sqlOf = (i: number) => String(mockQuery.mock.calls[i][0]);

beforeEach(() => {
  mockQuery.mockReset();
});

describe("createNewModelRiskQuery checks its references", () => {
  it("refuses another organization's model before inserting", async () => {
    mockQuery.mockResolvedValueOnce([]); // model lookup
    await expect(
      createNewModelRiskQuery({ risk_name: "r", model_id: 50 } as any, 1, tx),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(sqlOf(0)).toMatch(/FROM model_inventories/);
    expect(mockQuery.mock.calls[0][1]).toMatchObject({ transaction: tx });
  });

  it("refuses an owner who is not a member", async () => {
    mockQuery.mockResolvedValueOnce([]); // member lookup
    await expect(
      createNewModelRiskQuery({ risk_name: "r", owner: 9 } as any, 1, tx),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(sqlOf(0)).toMatch(/organization_members/);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("inserts when both belong to the organization", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 50 }])
      .mockResolvedValueOnce([{ id: 9 }])
      .mockResolvedValueOnce([{ id: 1 }]);
    await createNewModelRiskQuery({ risk_name: "r", model_id: 50, owner: "9" } as any, 1, tx);
    expect(sqlOf(2)).toMatch(/INSERT INTO model_risks/);
    expect(mockQuery.mock.calls[2][1]).toMatchObject({
      replacements: { model_id: 50, owner: 9 },
    });
  });
});

describe("updateModelRiskByIdQuery checks changed references", () => {
  it("refuses a new model of another organization", async () => {
    mockQuery
      .mockResolvedValueOnce([{ owner: 9, model_id: 50 }]) // current row
      .mockResolvedValueOnce([]); // model lookup
    await expect(
      updateModelRiskByIdQuery(4, { model_id: 77 } as any, 1, tx),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(sqlOf(0)).toMatch(/FROM model_risks/);
  });

  it("does not re-check an unchanged owner", async () => {
    mockQuery
      .mockResolvedValueOnce([{ owner: 9, model_id: null }]) // current row
      .mockResolvedValueOnce([[{ id: 4 }], 1]); // update
    await updateModelRiskByIdQuery(4, { owner: "9", risk_name: "x" } as any, 1, tx);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(sqlOf(1)).toMatch(/UPDATE model_risks/);
  });

  it("refuses a new owner who is not a member", async () => {
    mockQuery.mockResolvedValueOnce([{ owner: 9, model_id: null }]).mockResolvedValueOnce([]);
    await expect(updateModelRiskByIdQuery(4, { owner: 12 } as any, 1, tx)).rejects.toBeInstanceOf(
      ValidationException,
    );
  });

  it("returns null for a risk of another organization without updating", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await expect(updateModelRiskByIdQuery(4, { owner: 12 } as any, 1, tx)).resolves.toBeNull();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
