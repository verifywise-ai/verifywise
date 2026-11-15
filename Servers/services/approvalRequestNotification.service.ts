/**
 * Notifications sent when an approval request is created.
 *
 * Shared by the generic approval-request controller and by entity services
 * that open a request themselves (policy submit for approval), so every new
 * request reaches its step 1 approvers the same way.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { notifyApprovalRequested } from "./inAppNotification.service";

/**
 * Notifies the approvers of step 1 of a new request, except the requester.
 * Call it after the request's transaction has committed. Accepts approvers
 * as `{ approver_id }` objects or bare ids.
 */
export const notifyFirstStepApprovers = async (params: {
  organizationId: number;
  requestId: number;
  requestName: string;
  requesterId: number;
  workflow: { workflow_title?: string; name?: string };
  workflowSteps: any[];
  baseUrl: string;
}): Promise<void> => {
  const { organizationId, requestId, requestName, requesterId, workflow, workflowSteps, baseUrl } =
    params;

  const requesterResult = await sequelize.query<{ name: string; surname: string }>(
    `SELECT name, surname FROM users WHERE id = :userId`,
    { replacements: { userId: requesterId }, type: QueryTypes.SELECT },
  );
  const requester = requesterResult[0];
  const requesterName = requester ? `${requester.name} ${requester.surname}`.trim() : "Someone";

  const firstStep = workflowSteps.find((s: any) => s.step_number === 1) as any;
  const approvers: unknown[] =
    (firstStep && (firstStep.get ? firstStep.get("approvers") : firstStep.approvers)) || [];

  for (const approver of approvers) {
    const approverId =
      typeof approver === "object" && approver !== null
        ? (approver as any).approver_id
        : (approver as number);
    if (approverId === requesterId) continue;
    await notifyApprovalRequested(
      organizationId,
      approverId,
      {
        id: requestId,
        name: requestName,
        workflowName: workflow.workflow_title || (workflow.name as string),
        stepNumber: 1,
        totalSteps: workflowSteps.length,
      },
      requesterName,
      baseUrl,
    );
  }
};
