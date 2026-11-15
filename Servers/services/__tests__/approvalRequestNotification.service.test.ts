/**
 * notifyFirstStepApprovers: a new approval request reaches its step 1
 * approvers, never the requester.
 */
const mockQuery = jest.fn();

jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));
jest.mock("../inAppNotification.service", () => ({
  notifyApprovalRequested: jest.fn().mockResolvedValue(undefined),
}));

import { notifyFirstStepApprovers } from "../approvalRequestNotification.service";
import { notifyApprovalRequested } from "../inAppNotification.service";

const mockNotify = notifyApprovalRequested as jest.Mock;

const base = {
  organizationId: 1,
  requestId: 7,
  requestName: "Acceptable use",
  requesterId: 3,
  workflow: { workflow_title: "Legal review" },
  baseUrl: "https://app.test",
};

beforeEach(() => {
  mockQuery.mockReset().mockResolvedValue([{ name: "Ada", surname: "Lovelace" }]);
  mockNotify.mockClear();
});

describe("notifyFirstStepApprovers", () => {
  it("notifies every step 1 approver except the requester", async () => {
    await notifyFirstStepApprovers({
      ...base,
      workflowSteps: [
        { step_number: 1, approvers: [{ approver_id: 3 }, { approver_id: 9 }, 10] },
        { step_number: 2, approvers: [{ approver_id: 11 }] },
      ],
    });

    expect(mockNotify.mock.calls.map((c) => c[1])).toEqual([9, 10]);
    expect(mockNotify).toHaveBeenCalledWith(
      1,
      9,
      { id: 7, name: "Acceptable use", workflowName: "Legal review", stepNumber: 1, totalSteps: 2 },
      "Ada Lovelace",
      "https://app.test",
      undefined,
    );
  });

  it("passes the policy entity on to each approver notification", async () => {
    await notifyFirstStepApprovers({
      ...base,
      workflowSteps: [{ step_number: 1, approvers: [{ approver_id: 9 }] }],
      entity: { type: "policy", id: 55 },
    });

    expect(mockNotify).toHaveBeenCalledWith(
      1,
      9,
      expect.objectContaining({ id: 7 }),
      "Ada Lovelace",
      "https://app.test",
      { type: "policy", id: 55 },
    );
  });

  it("reads approvers from a model instance", async () => {
    const step = {
      step_number: 1,
      get: (key: string) => (key === "approvers" ? [{ approver_id: 9 }] : undefined),
    };

    await notifyFirstStepApprovers({ ...base, workflowSteps: [step] });

    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it('names an unknown requester "Someone" and uses the workflow name fallback', async () => {
    mockQuery.mockResolvedValue([]);

    await notifyFirstStepApprovers({
      ...base,
      workflow: { name: "Fallback" },
      workflowSteps: [{ step_number: 1, approvers: [{ approver_id: 9 }] }],
    });

    expect(mockNotify).toHaveBeenCalledWith(
      1,
      9,
      expect.objectContaining({ workflowName: "Fallback" }),
      "Someone",
      "https://app.test",
      undefined,
    );
  });

  it("sends nothing when step 1 has no approvers", async () => {
    await notifyFirstStepApprovers({ ...base, workflowSteps: [{ step_number: 1, approvers: [] }] });
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
