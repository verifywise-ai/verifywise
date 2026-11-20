import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../../approval/approvalGateway", () => ({
  TransientApprovalError: class extends Error {},
}));
const mockCreate = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../../../../utils/modelRisk.utils", () => ({
  createNewModelRiskQuery: (...args: any[]) => mockCreate(...args),
}));

import { executeCreateModelRisk } from "../execute";
import { MODEL_NOT_IN_ORGANIZATION } from "../../../../utils/modelReferences.utils";
import { ValidationException } from "../../../../domain.layer/exceptions/custom.exception";

const ctx = (model_id: number) =>
  ({
    inputParams: { model_id, risk_name: "Drift" },
    organizationId: 1,
    transaction: { id: "tx" },
  }) as any;

beforeEach(() => mockCreate.mockReset());

describe("executeCreateModelRisk", () => {
  it("reports a model that no longer exists from the write's own check", async () => {
    mockCreate.mockRejectedValue(new ValidationException(MODEL_NOT_IN_ORGANIZATION, "model_id", 4));
    await expect(executeCreateModelRisk(ctx(4))).rejects.toThrow(
      "Model #4 no longer exists in this organization",
    );
  });

  it("lets any other error through unchanged", async () => {
    const dbError = new Error("connection reset");
    mockCreate.mockRejectedValue(dbError);
    await expect(executeCreateModelRisk(ctx(4))).rejects.toBe(dbError);
  });

  it("returns the new risk's id, with one write and no separate model lookup", async () => {
    mockCreate.mockResolvedValue({ id: 12 });
    await expect(executeCreateModelRisk(ctx(4))).resolves.toEqual({ entityId: 12 });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ model_id: 4 });
  });
});
