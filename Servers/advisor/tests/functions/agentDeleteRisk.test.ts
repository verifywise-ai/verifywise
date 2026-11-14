import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../utils/risk.utils");
jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));

import * as riskUtils from "../../../utils/risk.utils";
import { sequelize } from "../../../database/db";
import "../../functions/riskFunctions";
import { writeToolExecutors } from "../../confirmation/createWriteTool";

const mockArchive = riskUtils.archiveRiskQuery as jest.MockedFunction<
  typeof riskUtils.archiveRiskQuery
>;
const mockTransaction = sequelize.transaction as unknown as jest.Mock<any>;

describe("agent_delete_risk executor", () => {
  const tx = { commit: jest.fn<any>(), rollback: jest.fn<any>() };
  const execute = writeToolExecutors.get("agent_delete_risk")!;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransaction.mockResolvedValue(tx);
    mockArchive.mockResolvedValue(true);
  });

  it("archives through the shared path with the acting user and commits", async () => {
    const result = await execute({ risk_id: 7, _userId: 9 }, 4);

    expect(mockArchive).toHaveBeenCalledWith(7, 4, 9, tx);
    expect(tx.commit).toHaveBeenCalled();
    expect(result).toEqual({ id: 7, deleted: true, message: "Risk deleted successfully" });
  });

  it("passes no user when the gateway set none", async () => {
    await execute({ risk_id: 7 }, 4);
    expect(mockArchive).toHaveBeenCalledWith(7, 4, undefined, tx);
  });

  it("rolls back when the archive fails", async () => {
    mockArchive.mockRejectedValueOnce(new Error("boom"));
    await expect(execute({ risk_id: 7, _userId: 9 }, 4)).rejects.toThrow("boom");
    expect(tx.rollback).toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
  });
});
