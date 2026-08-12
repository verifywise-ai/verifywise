jest.mock("../../../advisor/approval/approvalGateway", () => ({
  submitWorkflowGate: jest.fn(async () => "appr-123"),
}));

import { requestGateApproval } from "../approvalGate";
import { submitWorkflowGate } from "../../../advisor/approval/approvalGateway";
import { WorkflowContext } from "../types";

const ctx: WorkflowContext = {
  workflowRunId: 77,
  organizationId: 42,
  userId: 9,
  triggerPayload: { workflowId: "incident_response" },
  results: {},
};

beforeEach(() => jest.clearAllMocks());

describe("requestGateApproval", () => {
  it("creates an approval and returns a pause carrying its id", async () => {
    // Without an approvalId the engine persists awaiting_approval_id = NULL and
    // the run can never be resumed — that is the defect this closes.
    const result = await requestGateApproval(
      ctx,
      "incident_response",
      "create_remediation_tasks",
      "Approve tasks",
    );

    expect(result).toEqual({
      type: "pause",
      reason: "Approve tasks",
      approvalId: "appr-123",
    });
    expect(submitWorkflowGate).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 42,
        userId: 9,
        workflowRunId: 77,
        stepId: "create_remediation_tasks",
        description: "Approve tasks",
      }),
    );
  });

  it("fails the step rather than pausing unresumably when the approval cannot be created", async () => {
    (submitWorkflowGate as jest.Mock).mockRejectedValueOnce(new Error("db down"));

    const result = await requestGateApproval(ctx, "wf", "step", "desc");

    expect(result.type).toBe("fail");
  });
});
