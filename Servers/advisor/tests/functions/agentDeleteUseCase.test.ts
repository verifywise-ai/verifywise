import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../utils/risk.utils", () => ({
  getRisksLinkedOnlyToProjectQuery: jest.fn(),
  archiveRisksInBulkQuery: jest.fn(),
}));
jest.mock("../../../utils/project.utils", () => ({
  getUserProjects: jest.fn(),
  calculateProjectRisks: jest.fn(),
  lockProjectForDelete: jest.fn(),
}));
jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));

import * as riskUtils from "../../../utils/risk.utils";
import * as projectUtils from "../../../utils/project.utils";
import { sequelize } from "../../../database/db";
import "../../functions/useCaseFunctions";
import { writeToolExecutors } from "../../confirmation/createWriteTool";
import { toolsDefinition } from "../../tools/useCaseTools";

const linkedOnly = riskUtils.getRisksLinkedOnlyToProjectQuery as unknown as jest.Mock<any>;
const bulkArchive = riskUtils.archiveRisksInBulkQuery as unknown as jest.Mock<any>;
const lock = projectUtils.lockProjectForDelete as unknown as jest.Mock<any>;
const mockTransaction = sequelize.transaction as unknown as jest.Mock<any>;
const mockQuery = sequelize.query as unknown as jest.Mock<any>;

const sqlCalls = () => mockQuery.mock.calls.map(([sql]) => String(sql));

describe("agent_delete_use_case executor", () => {
  const tx = { commit: jest.fn<any>(), rollback: jest.fn<any>() };
  const execute = writeToolExecutors.get("agent_delete_use_case")!;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransaction.mockResolvedValue(tx);
    lock.mockResolvedValue(true);
    linkedOnly.mockResolvedValue([
      { id: 3, risk_name: "Bias" },
      { id: 4, risk_name: "Drift" },
    ]);
    bulkArchive.mockResolvedValue([{ id: 3 }, { id: 4 }]);
    mockQuery.mockImplementation(async (sql: string) =>
      sql.startsWith("DELETE FROM projects WHERE")
        ? [[{ id: 12, project_title: "Chatbot" }], 1]
        : [[], 0],
    );
  });

  it("archives the risks linked only here by default, in the delete's transaction", async () => {
    const result = (await execute({ use_case_id: 12, _userId: 9, _requesterId: 5 }, 4)) as any;

    expect(lock).toHaveBeenCalledWith(12, 4, tx);
    expect(linkedOnly).toHaveBeenCalledWith(12, 4, tx);
    // Recorded in the risk history as the user who asked for the delete.
    expect(bulkArchive).toHaveBeenCalledWith([3, 4], 4, 5, tx);
    expect(lock.mock.invocationCallOrder[0]).toBeLessThan(linkedOnly.mock.invocationCallOrder[0]);
    const linksDelete = mockQuery.mock.calls.findIndex(([sql]) =>
      String(sql).startsWith("DELETE FROM projects_risks"),
    );
    expect(bulkArchive.mock.invocationCallOrder[0]).toBeLessThan(
      mockQuery.mock.invocationCallOrder[linksDelete],
    );
    expect(tx.commit).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        deleted_use_case: { id: 12, project_title: "Chatbot" },
        archived_risk_ids: [3, 4],
      }),
    );
    expect(result.message).toContain("2 risk(s) linked only to it were archived");
  });

  it("says so when no risk was linked only here", async () => {
    linkedOnly.mockResolvedValue([]);

    const result = (await execute({ use_case_id: 12, _userId: 9 }, 4)) as any;

    expect(bulkArchive).not.toHaveBeenCalled();
    expect(result.archived_risk_ids).toEqual([]);
    expect(result.message).toContain("none were archived");
  });

  it("answers not found and changes nothing for a use case outside the organization", async () => {
    lock.mockResolvedValue(false);

    const result = await execute({ use_case_id: 12, _userId: 9 }, 4);

    expect(result).toEqual({ success: false, message: "Use case #12 not found" });
    expect(linkedOnly).not.toHaveBeenCalled();
    expect(sqlCalls()).toHaveLength(0);
    expect(tx.rollback).toHaveBeenCalledTimes(1);
    expect(tx.commit).not.toHaveBeenCalled();
  });

  it("rolls the archive back with the delete when anything fails", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("DELETE FROM projects WHERE")) throw new Error("db down");
      return [[], 0];
    });

    await expect(execute({ use_case_id: 12, _userId: 9 }, 4)).rejects.toThrow("db down");
    expect(bulkArchive).toHaveBeenCalledTimes(1);
    expect(tx.rollback).toHaveBeenCalledTimes(1);
    expect(tx.commit).not.toHaveBeenCalled();
  });

  it("tells the model and the approver that the risks are archived", () => {
    const tool = toolsDefinition.find(
      (t: any) => t.function.name === "agent_delete_use_case",
    ) as any;
    expect(tool.function.description).toContain("Risks linked only to this use case are archived");
  });
});
