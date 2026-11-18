import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../../approval/approvalGateway", () => ({
  TransientApprovalError: class extends Error {},
}));
const mockCreate = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../../../../services/modelRisk.service", () => ({
  createModelRiskService: (...args: any[]) => mockCreate(...args),
}));
const mockWriter = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../../../functions/modelWriteScope", () => ({
  ...(jest.requireActual("../../../functions/modelWriteScope") as object),
  modelWriteContextForUser: (...args: any[]) => mockWriter(...args),
}));

import { executeCreateModelRisk } from "../execute";
import { MODEL_NOT_IN_ORGANIZATION } from "../../../../utils/modelReferences.utils";
import { ValidationException } from "../../../../domain.layer/exceptions/custom.exception";
import { MODEL_WRITE_REFUSED } from "../../../functions/modelWriteScope";

const REQUESTER = 5;
const tx = { id: "tx" };
const ctx = (model_id: number) =>
  ({
    inputParams: { model_id, risk_name: "Drift" },
    organizationId: 1,
    requesterId: REQUESTER,
    transaction: tx,
  }) as any;

beforeEach(() => {
  mockCreate.mockReset();
  mockWriter.mockReset();
  mockWriter.mockResolvedValue({
    organizationId: 1,
    userId: REQUESTER,
    callerIsAdmin: false,
    useCaseViewer: { userId: REQUESTER, role: "Editor" },
  });
});

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

  // Item 2: the console's write path (history, owner notice), as the
  // requester, in the approval's transaction.
  it("creates the risk through the model risk service as the requester, in the approval transaction", async () => {
    mockCreate.mockResolvedValue({ id: 12 });
    await expect(executeCreateModelRisk(ctx(4))).resolves.toEqual({ entityId: 12 });
    expect(mockWriter).toHaveBeenCalledWith(1, REQUESTER);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ model_id: 4, risk_name: "Drift" });
    expect(mockCreate.mock.calls[0][1]).toEqual({ organizationId: 1, userId: REQUESTER });
    expect(mockCreate.mock.calls[0][2]).toBe(tx);
  });

  it("refuses a requester without model.edit and writes nothing", async () => {
    mockWriter.mockResolvedValue({ success: false, message: MODEL_WRITE_REFUSED });
    await expect(executeCreateModelRisk(ctx(4))).rejects.toThrow(MODEL_WRITE_REFUSED);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
