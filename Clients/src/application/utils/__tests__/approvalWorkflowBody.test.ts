import { approvalWorkflowEntityType, buildApprovalWorkflowBody } from "../approvalWorkflowBody";
import { ApprovalWorkflowStepModel } from "../../../domain/models/Common/approvalWorkflow/approvalWorkflowStepModel";

const step = (data: Partial<ApprovalWorkflowStepModel> = {}) =>
  Object.assign(new ApprovalWorkflowStepModel(), {
    step_name: "Legal",
    description: "Check the contract",
    approver_ids: [2, 5],
    requires_all_approvers: true,
    sla_hours: 48,
    escalation_user_id: 9,
    ...data,
  });

describe("approvalWorkflowEntityType", () => {
  it("maps the form's entity ids to the API's entity types", () => {
    expect(approvalWorkflowEntityType(1)).toBe("use_case");
    expect(approvalWorkflowEntityType(2)).toBe("file");
    expect(approvalWorkflowEntityType(5)).toBe("model_inventory");
    expect(approvalWorkflowEntityType(15)).toBe("note");
  });

  it("falls back to a use case for an unknown id, as the page always did", () => {
    expect(approvalWorkflowEntityType(0)).toBe("use_case");
    expect(approvalWorkflowEntityType(99)).toBe("use_case");
  });
});

describe("buildApprovalWorkflowBody", () => {
  it("builds a use case workflow body with its auto-approve threshold", () => {
    expect(
      buildApprovalWorkflowBody({
        workflow_title: "Model risk review",
        entity: 1,
        auto_approve_max_risk: "Limited risk",
        steps: [step()],
      }),
    ).toEqual({
      workflow_title: "Model risk review",
      entity_type: "use_case",
      auto_approve_max_risk: "Limited risk",
      steps: [
        {
          step_name: "Legal",
          description: "Check the contract",
          approver_ids: [2, 5],
          requires_all_approvers: true,
          sla_hours: 48,
          escalation_user_id: 9,
        },
      ],
    });
  });

  it("drops the threshold for any other entity", () => {
    const body = buildApprovalWorkflowBody({
      workflow_title: "Evidence review",
      entity: 2,
      auto_approve_max_risk: "High risk",
      steps: [step()],
    });
    expect(body.entity_type).toBe("file");
    expect(body.auto_approve_max_risk).toBeNull();
  });

  it("fills step defaults the API expects", () => {
    const body = buildApprovalWorkflowBody({
      workflow_title: "Quick",
      entity: 1,
      auto_approve_max_risk: null,
      steps: [
        step({
          approver_ids: undefined,
          requires_all_approvers: undefined,
          sla_hours: undefined,
          escalation_user_id: undefined,
        }),
      ],
    });
    expect(body.auto_approve_max_risk).toBeNull();
    expect(body.steps[0]).toMatchObject({
      approver_ids: [],
      requires_all_approvers: false,
      sla_hours: null,
      escalation_user_id: null,
    });
  });
});
