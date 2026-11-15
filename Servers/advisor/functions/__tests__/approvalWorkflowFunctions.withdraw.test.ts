/**
 * agent_withdraw_approval_request follows the REST withdraw rules: only the
 * requester, only a pending request, and a truthful result.
 */
const mockTx = { commit: jest.fn(), rollback: jest.fn() };
jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn(async () => mockTx) },
}));
jest.mock("../../approval/approvalGateway", () => ({ submitForApproval: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../../utils/approvalWorkflow.utils", () => ({
  getAllApprovalWorkflowsQuery: jest.fn(),
  getApprovalWorkflowByIdQuery: jest.fn(),
  getWorkflowStepsQuery: jest.fn(),
  createApprovalWorkflowQuery: jest.fn(),
}));
jest.mock("../../../utils/approvalRequest.utils", () => ({
  getPendingApprovalsQuery: jest.fn(),
  getApprovalRequestByIdQuery: jest.fn(),
  getApprovalStatusQuery: jest.fn(),
  createApprovalRequestQuery: jest.fn(),
  processApprovalQuery: jest.fn(),
  withdrawApprovalRequestQuery: jest.fn(),
}));

import { writeToolExecutors } from "../../confirmation/createWriteTool";
import {
  getApprovalRequestByIdQuery,
  withdrawApprovalRequestQuery,
} from "../../../utils/approvalRequest.utils";
import "../approvalWorkflowFunctions";

const getRequest = getApprovalRequestByIdQuery as jest.Mock;
const withdraw = withdrawApprovalRequestQuery as jest.Mock;
const run = (params: Record<string, unknown>) =>
  writeToolExecutors.get("agent_withdraw_approval_request")!(params, 42);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("agent_withdraw_approval_request", () => {
  it("withdraws the requester's own pending request", async () => {
    getRequest.mockResolvedValue({ id: 7, requested_by: 9, status: "Pending" });
    withdraw.mockResolvedValue(true);

    const result = await run({ request_id: 7, _userId: 9 });

    expect(result).toEqual(expect.objectContaining({ id: 7, withdrawn: true }));
    expect(getRequest).toHaveBeenCalledWith(7, 42, mockTx);
    expect(withdraw).toHaveBeenCalledWith(7, 42, mockTx, { changedBy: 9 });
    expect(mockTx.commit).toHaveBeenCalled();
  });

  it("refuses someone else's request without touching it", async () => {
    getRequest.mockResolvedValue({ id: 7, requested_by: 3, status: "Pending" });

    await expect(run({ request_id: 7, _userId: 9 })).rejects.toThrow(
      "Only the requestor can withdraw this request",
    );
    expect(withdraw).not.toHaveBeenCalled();
    expect(mockTx.rollback).toHaveBeenCalled();
    expect(mockTx.commit).not.toHaveBeenCalled();
  });

  it("refuses without a user, or when the request is not in the organization", async () => {
    getRequest.mockResolvedValue({ id: 7, requested_by: 9, status: "Pending" });
    await expect(run({ request_id: 7 })).rejects.toThrow(
      "Only the requestor can withdraw this request",
    );

    getRequest.mockResolvedValue(null);
    await expect(run({ request_id: 7, _userId: 9 })).rejects.toThrow(
      "Only the requestor can withdraw this request",
    );
    expect(withdraw).not.toHaveBeenCalled();
  });

  it.each(["Approved", "Rejected", "Withdrawn"])("refuses a %s request", async (status) => {
    getRequest.mockResolvedValue({ id: 7, requested_by: 9, status });

    await expect(run({ request_id: 7, _userId: 9 })).rejects.toThrow(
      "Only a pending request can be withdrawn",
    );
    expect(withdraw).not.toHaveBeenCalled();
    expect(mockTx.rollback).toHaveBeenCalled();
  });

  it("reports failure when the request was decided before the withdraw landed", async () => {
    getRequest.mockResolvedValue({ id: 7, requested_by: 9, status: "Pending" });
    withdraw.mockResolvedValue(false);

    await expect(run({ request_id: 7, _userId: 9 })).rejects.toThrow(
      "Only a pending request can be withdrawn",
    );
    expect(mockTx.rollback).toHaveBeenCalled();
    expect(mockTx.commit).not.toHaveBeenCalled();
  });
});
