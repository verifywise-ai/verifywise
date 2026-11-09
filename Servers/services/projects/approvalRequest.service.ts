import { Transaction } from "sequelize";

import { ProjectModel } from "../../domain.layer/models/project/project.model";
import { ApprovalRequestModel } from "../../domain.layer/models/approvalWorkflow/approvalRequest.model";
import { ApprovalWorkflowStepModel } from "../../domain.layer/models/approvalWorkflow/approvalWorkflowStep.model";
import { ApprovalRequestStatus, EntityType } from "../../domain.layer/enums/approval-workflow.enum";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";
import { getApprovalWorkflowByIdQuery } from "../../utils/approvalWorkflow.utils";
import {
  createApprovalRequestQuery,
  tryAutoApproveRequestQuery,
} from "../../utils/approvalRequest.utils";
import { getUserByIdQuery } from "../../utils/user.utils";
import { moveUseCaseIntoReview } from "../../utils/lifecycle.utils";
import { notifyApprovalRequested } from "../inAppNotification.service";
import { logStructured } from "../../utils/logger/fileLogger";

export interface UseCaseApprovalRequestResult {
  request: ApprovalRequestModel;
  autoApproved: boolean;
  riskLevel?: string;
  threshold?: string;
  /** Workflow title and steps, carried for the post-commit approver notification. */
  workflowTitle: string;
  steps: ApprovalWorkflowStepModel[];
}

/**
 * Create an approval request for a newly created use-case (project).
 *
 * Returns the created approval request and its auto-approval outcome, or
 * `null` when no request is needed — i.e. the project has no approval
 * workflow assigned, or the assigned workflow has no steps.
 *
 * Throws a ValidationException (surfaced as a 400, rolling the use case back)
 * when the submitted workflow is one nobody may start a use case approval
 * with: a deleted one — deletion is a soft delete, so the row is still
 * readable — or one defined for a different entity type.
 */
export const createUseCaseApprovalRequest = async (
  project: ProjectModel,
  requestedBy: number,
  organizationId: number,
  transaction: Transaction,
): Promise<UseCaseApprovalRequestResult | null> => {
  if (!project.approval_workflow_id || !project.id) {
    logStructured(
      "processing",
      `use case ${project.id ?? "?"} has no approval workflow — no approval request created`,
      "createUseCaseApprovalRequest",
      "approvalRequest.service.ts",
    );
    return null;
  }

  const workflow = await getApprovalWorkflowByIdQuery(
    project.approval_workflow_id,
    organizationId,
    transaction,
  );

  if (workflow && workflow.is_active === false) {
    throw new ValidationException(
      "The selected approval workflow is no longer active",
      "approval_workflow_id",
      project.approval_workflow_id,
      { i18nKey: "The selected approval workflow is no longer active" },
    );
  }

  if (workflow && workflow.entity_type !== EntityType.USE_CASE) {
    throw new ValidationException(
      "The selected approval workflow is not a use case workflow",
      "approval_workflow_id",
      project.approval_workflow_id,
      { i18nKey: "The selected approval workflow is not a use case workflow" },
    );
  }

  // getApprovalWorkflowByIdQuery attaches the steps with setDataValue, and these
  // instances come from a raw query — so the @HasMany `steps` property is always
  // undefined and only the data value holds them.
  const workflowSteps = workflow?.getDataValue("steps");
  if (!workflow || !workflowSteps || workflowSteps.length === 0) {
    logStructured(
      "error",
      `approval workflow ${project.approval_workflow_id} for use case ${project.id} is missing or has no steps — no approval request created`,
      "createUseCaseApprovalRequest",
      "approvalRequest.service.ts",
    );
    return null;
  }

  const request = await createApprovalRequestQuery(
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

  // A planned use case with an open approval request is in review (#5187).
  // Approval (manual or automatic, below) moves it back to planned.
  await moveUseCaseIntoReview(organizationId, project.id, requestedBy, transaction);

  // Risk-based auto-approval, evaluated from the project row (never the
  // client payload), inside the project-creation transaction
  const autoApproval = await tryAutoApproveRequestQuery(
    request.id!,
    workflow,
    "use_case",
    project.id,
    organizationId,
    transaction,
  );

  if (autoApproval.autoApproved) {
    request.setDataValue("status", ApprovalRequestStatus.APPROVED);
    request.setDataValue("auto_approved_at", new Date());
    request.setDataValue("auto_approval_risk_level", autoApproval.riskLevel ?? null);
  }

  logStructured(
    "successful",
    autoApproval.autoApproved
      ? `auto-approved approval request ${request.id} for use case ${project.id} (risk ${autoApproval.riskLevel}, threshold ${autoApproval.threshold})`
      : `created approval request ${request.id} for use case ${project.id} (workflow ${project.approval_workflow_id}, ${workflowSteps.length} steps)`,
    "createUseCaseApprovalRequest",
    "approvalRequest.service.ts",
  );

  return {
    request,
    ...autoApproval,
    workflowTitle: workflow.workflow_title,
    steps: workflowSteps,
  };
};

/**
 * Notify the step-1 approvers that a newly created use case is waiting on
 * them, in-app and by email. Later steps are notified by `approveRequest`
 * as the request advances, so this covers only the first one.
 *
 * Call it after the creating transaction has committed — the notification
 * links approvers straight to a use case that must already be readable.
 * The requester is never notified about their own request.
 */
export const notifyUseCaseApprovalRequested = async (
  project: ProjectModel,
  approval: UseCaseApprovalRequestResult,
  requestedBy: number,
  organizationId: number,
): Promise<void> => {
  const firstStep = approval.steps.find((step) => step.step_number === 1);
  const stepApprovers = firstStep?.getDataValue("approvers") ?? [];
  const approvers = stepApprovers.filter((approver) => approver.approver_id !== requestedBy);

  if (approvers.length === 0) {
    logStructured(
      firstStep ? "processing" : "error",
      firstStep
        ? `step 1 of approval request ${approval.request.id} has no approver to notify (${stepApprovers.length} configured, requester ${requestedBy} excluded)`
        : `approval request ${approval.request.id} has no step 1 — nobody notified`,
      "notifyUseCaseApprovalRequested",
      "approvalRequest.service.ts",
    );
    return;
  }

  logStructured(
    "processing",
    `notifying ${approvers.length} step 1 approver(s) [${approvers
      .map((approver) => approver.approver_id)
      .join(", ")}] of approval request ${approval.request.id} for use case ${project.id}`,
    "notifyUseCaseApprovalRequested",
    "approvalRequest.service.ts",
  );

  const requester = await getUserByIdQuery(requestedBy, null, organizationId);
  const requesterName = requester ? `${requester.name} ${requester.surname}`.trim() : "Someone";
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";

  await Promise.all(
    approvers.map((approver) =>
      notifyApprovalRequested(
        organizationId,
        approver.approver_id,
        {
          id: project.id!,
          name: approval.request.request_name,
          workflowName: approval.workflowTitle,
          stepNumber: 1,
          totalSteps: approval.steps.length,
        },
        requesterName,
        baseUrl,
      ),
    ),
  );

  logStructured(
    "successful",
    `notified ${approvers.length} step 1 approver(s) of approval request ${approval.request.id}`,
    "notifyUseCaseApprovalRequested",
    "approvalRequest.service.ts",
  );
};
