import { Transaction } from "sequelize";

import { ProjectModel } from "../../domain.layer/models/project/project.model";
import { ApprovalRequestModel } from "../../domain.layer/models/approvalWorkflow/approvalRequest.model";
import { ApprovalRequestStatus } from "../../domain.layer/enums/approval-workflow.enum";
import { getApprovalWorkflowByIdQuery } from "../../utils/approvalWorkflow.utils";
import { createApprovalRequestQuery } from "../../utils/approvalRequest.utils";

/**
 * Create an approval request for a newly created use-case (project).
 *
 * Returns the created approval request, or `null` when no request is needed —
 * i.e. the project has no approval workflow assigned, or the assigned workflow
 * has no steps.
 */
export const createUseCaseApprovalRequest = async (
  project: ProjectModel,
  requestedBy: number,
  organizationId: number,
  transaction: Transaction,
): Promise<ApprovalRequestModel | null> => {
  if (!project.approval_workflow_id || !project.id) {
    return null;
  }

  const workflow = await getApprovalWorkflowByIdQuery(
    project.approval_workflow_id,
    organizationId,
    transaction,
  );

  const workflowSteps = workflow?.steps;
  if (!workflow || !workflowSteps || workflowSteps.length === 0) {
    return null;
  }

  return createApprovalRequestQuery(
    {
      request_name: `Use Case: ${project.project_title}`,
      workflow_id: project.approval_workflow_id,
      entity_id: project.id,
      entity_type: "use_case",
      entity_data: {
        project_title: project.project_title,
        owner: project.owner,
        ai_risk_classification: project.ai_risk_classification,
      },
      status: ApprovalRequestStatus.PENDING,
      requested_by: requestedBy,
    },
    workflowSteps,
    organizationId,
    transaction,
  );
};
