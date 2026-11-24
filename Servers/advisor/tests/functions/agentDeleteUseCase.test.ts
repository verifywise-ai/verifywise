import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../utils/projectDeletion.utils", () => ({
  deleteProjectWithSideEffects: jest.fn(),
}));
jest.mock("../../../utils/userPermission.utils", () => ({
  userHasPermission: jest.fn(),
  getUserRoleInOrganization: jest.fn(),
}));
jest.mock("../../../utils/project.utils", () => ({
  getUserProjects: jest.fn(),
  calculateProjectRisks: jest.fn(),
  lockProjectForDelete: jest.fn(),
  getProjectAccessQuery: jest.fn(),
}));
jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));

import * as projectDeletion from "../../../utils/projectDeletion.utils";
import * as userPermission from "../../../utils/userPermission.utils";
import * as projectUtils from "../../../utils/project.utils";
import { sequelize } from "../../../database/db";
import "../../functions/useCaseFunctions";
import { writeToolExecutors } from "../../confirmation/createWriteTool";
import { toolsDefinition } from "../../tools/useCaseTools";

const deleteShared = projectDeletion.deleteProjectWithSideEffects as unknown as jest.Mock<any>;
const hasPermission = userPermission.userHasPermission as unknown as jest.Mock<any>;
const lock = projectUtils.lockProjectForDelete as unknown as jest.Mock<any>;
const access = projectUtils.getProjectAccessQuery as unknown as jest.Mock<any>;
const roleOf = userPermission.getUserRoleInOrganization as unknown as jest.Mock<any>;
const mockTransaction = sequelize.transaction as unknown as jest.Mock<any>;
const mockQuery = sequelize.query as unknown as jest.Mock<any>;

describe("agent_delete_use_case executor", () => {
  const tx = { commit: jest.fn<any>(), rollback: jest.fn<any>() };
  const execute = writeToolExecutors.get("agent_delete_use_case")!;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransaction.mockResolvedValue(tx);
    hasPermission.mockResolvedValue(true);
    roleOf.mockResolvedValue({ id: 3, name: "Editor", organizationId: null });
    access.mockResolvedValue("allowed");
    lock.mockResolvedValue(true);
    mockQuery.mockResolvedValue([{ id: 12, project_title: "Chatbot" }]);
    deleteShared.mockResolvedValue({
      deleted: true,
      withdrawnApprovalId: null,
      archivedRiskIds: [3, 4],
    });
  });

  it("deletes through the shared helper, archiving as the requester", async () => {
    const result = (await execute({ use_case_id: 12, _userId: 9, _requesterId: 5 }, 4)) as any;

    expect(hasPermission).toHaveBeenCalledWith(4, 5, "risks.edit");
    expect(lock).toHaveBeenCalledWith(12, 4, tx);
    expect(deleteShared).toHaveBeenCalledWith(12, 4, tx, {
      userId: 5,
      alreadyLocked: true,
      archiveRisksLinkedOnlyHere: true,
    });
    expect(lock.mock.invocationCallOrder[0]).toBeLessThan(deleteShared.mock.invocationCallOrder[0]);
    expect(tx.commit).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        deleted_use_case: { id: 12, project_title: "Chatbot" },
        archived_risk_ids: [3, 4],
      }),
    );
    expect(result.message).toContain("2 risk(s) linked only to it were archived");
    expect(result.message).toContain("visible only to Admins and to its owner and approver");
  });

  it("falls back to the approver when there is no requester", async () => {
    await execute({ use_case_id: 12, _userId: 9 }, 4);

    expect(hasPermission).toHaveBeenCalledWith(4, 9, "risks.edit");
    expect(deleteShared).toHaveBeenCalledWith(12, 4, tx, expect.objectContaining({ userId: 9 }));
  });

  it("refuses the delete and changes nothing without the risk archive permission", async () => {
    hasPermission.mockResolvedValue(false);

    const result = (await execute({ use_case_id: 12, _userId: 9, _requesterId: 5 }, 4)) as any;

    expect(result.success).toBe(false);
    expect(result.message).toContain("Use case #12 was not deleted");
    expect(result.message).toContain("does not allow archiving risks");
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
    expect(deleteShared).not.toHaveBeenCalled();
  });

  it("refuses when no user is known", async () => {
    hasPermission.mockResolvedValue(false);

    const result = (await execute({ use_case_id: 12 }, 4)) as any;

    expect(hasPermission).toHaveBeenCalledWith(4, undefined, "risks.edit");
    expect(result.success).toBe(false);
    expect(deleteShared).not.toHaveBeenCalled();
  });

  it("says so when no risk was linked only here", async () => {
    deleteShared.mockResolvedValue({
      deleted: true,
      withdrawnApprovalId: null,
      archivedRiskIds: [],
    });

    const result = (await execute({ use_case_id: 12, _userId: 9 }, 4)) as any;

    expect(result.archived_risk_ids).toEqual([]);
    expect(result.message).toContain("none were archived");
  });

  it("answers not found and changes nothing for a use case outside the organization", async () => {
    lock.mockResolvedValue(false);

    const result = await execute({ use_case_id: 12, _userId: 9 }, 4);

    expect(result).toEqual({ success: false, message: "Use case #12 not found" });
    expect(deleteShared).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
    expect(tx.rollback).toHaveBeenCalledTimes(1);
    expect(tx.commit).not.toHaveBeenCalled();
  });

  it("rolls everything back when the shared delete fails", async () => {
    deleteShared.mockRejectedValue(new Error("db down"));

    await expect(execute({ use_case_id: 12, _userId: 9 }, 4)).rejects.toThrow("db down");
    expect(tx.rollback).toHaveBeenCalledTimes(1);
    expect(tx.commit).not.toHaveBeenCalled();
  });

  it("refuses and changes nothing without useCase.edit", async () => {
    hasPermission.mockImplementation(async (...args: any[]) => args[2] === "risks.edit");

    const result = (await execute({ use_case_id: 12, _userId: 9, _requesterId: 5 }, 4)) as any;

    expect(hasPermission).toHaveBeenCalledWith(4, 5, "useCase.edit");
    expect(result.success).toBe(false);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("refuses and changes nothing for a use case the requester cannot see", async () => {
    access.mockResolvedValue("denied");

    const result = (await execute({ use_case_id: 12, _userId: 9, _requesterId: 5 }, 4)) as any;

    expect(access).toHaveBeenCalledWith(12, { userId: 5, role: "Editor" }, 4);
    expect(result).toEqual({ success: false, message: "You do not have access to use case #12" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("tells the model and the approver that the risks are archived", () => {
    const tool = toolsDefinition.find(
      (t: any) => t.function.name === "agent_delete_use_case",
    ) as any;
    expect(tool.function.description).toContain("Risks linked only to this use case are archived");
    expect(tool.function.description).toContain("permission to archive risks");
  });
});
