import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockTransaction = { commit: jest.fn(), rollback: jest.fn(), afterCommit: jest.fn() };

jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(async () => mockTransaction), query: jest.fn() },
}));
jest.mock("../../approval/approvalGateway", () => ({ submitForApproval: jest.fn() }));
jest.mock("../../../utils/approvalRequest.utils", () => ({
  getPendingApprovalsQuery: jest.fn(),
  getApprovalRequestByIdQuery: jest.fn(),
  getApprovalStatusQuery: jest.fn(),
  createApprovalRequestQuery: jest.fn(),
  processApprovalQuery: jest.fn(async () => null),
  withdrawApprovalRequestQuery: jest.fn(),
}));

import { writeToolExecutors } from "../../confirmation/createWriteTool";
import "../../functions/approvalWorkflowFunctions";
import { processApprovalQuery } from "../../../utils/approvalRequest.utils";
import { ApprovalResult } from "../../../domain.layer/enums/approval-workflow.enum";

const mockProcess = processApprovalQuery as jest.MockedFunction<any>;

const execute = (toolName: string, params: Record<string, unknown>) =>
  writeToolExecutors.get(toolName)!(params, 1);

describe.each([
  ["agent_approve_approval_step", ApprovalResult.APPROVED],
  ["agent_reject_approval_step", ApprovalResult.REJECTED],
])("%s", (toolName, result) => {
  beforeEach(() => jest.clearAllMocks());

  it("refuses to decide without a deciding user", async () => {
    await expect(execute(toolName, { request_id: 7 })).rejects.toThrow(
      "Cannot decide on an approval request without a deciding user",
    );
    expect(mockProcess).not.toHaveBeenCalled();
    expect(mockTransaction.rollback).toHaveBeenCalled();
  });

  it("decides as the user the gateway injected", async () => {
    await execute(toolName, { request_id: 7, _userId: 5, comment: "ok" });

    expect(mockProcess).toHaveBeenCalledWith(7, 5, result, "ok", 1, mockTransaction);
    expect(mockTransaction.commit).toHaveBeenCalled();
  });
});
