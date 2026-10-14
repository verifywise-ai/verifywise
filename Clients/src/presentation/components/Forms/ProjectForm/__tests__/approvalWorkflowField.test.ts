import { describe, it, expect } from "vitest";
import { applyApprovalWorkflowSelection } from "../approvalWorkflowField";

describe("applyApprovalWorkflowSelection", () => {
  it("leaves a chosen workflow as it is", () => {
    const body: Record<string, unknown> = { approval_workflow_id: 5 };
    applyApprovalWorkflowSelection(body, { isEdit: true });
    expect(body.approval_workflow_id).toBe(5);
  });

  it("omits 'none' when creating, so no foreign key is sent", () => {
    const body: Record<string, unknown> = { approval_workflow_id: 0 };
    applyApprovalWorkflowSelection(body, { isEdit: false });
    expect("approval_workflow_id" in body).toBe(false);
  });

  // An omitted field leaves the saved workflow in place, so on edit "none"
  // has to be sent as null for the workflow to be cleared at all.
  it("sends 'none' as null when editing, so the saved workflow is cleared", () => {
    const body: Record<string, unknown> = { approval_workflow_id: 0 };
    applyApprovalWorkflowSelection(body, { isEdit: true });
    expect(body).toHaveProperty("approval_workflow_id", null);
  });
});
