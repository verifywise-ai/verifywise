/**
 * @fileoverview Approval Request Controller
 *
 * Handles approval request operations for use-case and project approval flows.
 * Manages request lifecycle including creation, approval, rejection, and withdrawal.
 *
 * Key Features:
 * - Request creation and tracking
 * - Step-based approval process
 * - Multiple approvers per step
 * - Requestor and approver views
 * - Withdraw functionality
 *
 * @module controllers/approvalRequest
 */

import { Request, Response } from "express";
import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logStructured } from "../utils/logger/fileLogger";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";
import {
  createApprovalRequestQuery,
  getMyApprovalRequestsQuery,
  getPendingApprovalsQuery,
  getApprovalRequestByIdQuery,
  processApprovalQuery,
  withdrawApprovalRequestQuery,
} from "../utils/approvalRequest.utils";
import { getApprovalWorkflowByIdQuery, getWorkflowStepsQuery } from "../utils/approvalWorkflow.utils";
import { ApprovalResult } from "../domain.layer/enums/approval-workflow.enum";
import {
  notifyApprovalRequested,
  notifyApprovalComplete,
  sendInAppNotification,
} from "../services/inAppNotification.service";
import { notifyRequesterStepCompleted } from "../services/notification.service";
import { NotificationType, NotificationEntityType } from "../domain.layer/interfaces/i.notification";
import { EMAIL_TEMPLATES } from "../constants/emailTemplates";

/**
 * Create new approval request
 * @route POST /api/approval-requests
 * @access All authenticated users
 */
export async function createApprovalRequest(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();

  logStructured(
    "processing",
    "creating approval request",
    "createApprovalRequest",
    "approvalRequest.ctrl.ts"
  );

  try {
    const { userId, organizationId } = req;
    const { request_name, workflow_id, entity_id, entity_type, entity_data } =
      req.body;

    if (!userId || !organizationId) {
      await transaction.rollback();
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    // Validation
    if (!request_name?.trim()) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Request name is required"));
    }

    if (!workflow_id) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Workflow ID is required"));
    }

    // Get workflow and steps
    const workflow = await getApprovalWorkflowByIdQuery(
      workflow_id,
      organizationId,
      transaction
    );

    if (!workflow) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]("Workflow not found"));
    }

    const workflowSteps = await getWorkflowStepsQuery(
      workflow_id,
      organizationId,
      transaction
    );

    if (!workflowSteps || workflowSteps.length === 0) {
      await transaction.rollback();
      return res
        .status(400)
        .json(STATUS_CODE[400]("Workflow must have at least one step"));
    }

    // Create request
    const request = await createApprovalRequestQuery(
      {
        request_name,
        workflow_id,
        entity_id,
        entity_type,
        entity_data,
        status: "Pending",
        requested_by: userId,
      },
      workflowSteps,
      organizationId,
      transaction
    );

    await transaction.commit();

    logStructured(
      "successful",
      `created approval request ${request.id}`,
      "createApprovalRequest",
      "approvalRequest.ctrl.ts"
    );

    // Send notifications to first step approvers (async, don't block response)
    (async () => {
      try {
        // Get requester name
        const requesterResult = await sequelize.query<{ name: string; surname: string }>(
          `SELECT name, surname FROM users WHERE id = :userId`,
          { replacements: { userId }, type: QueryTypes.SELECT }
        );
        const requester = requesterResult[0];
        const requesterName = requester ? `${requester.name} ${requester.surname}`.trim() : "Someone";

        // Get base URL from env or default
        const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";

        // Get first step approvers
        const firstStep = workflowSteps.find((s: any) => s.step_number === 1) as any;
        if (firstStep && firstStep.approvers && firstStep.approvers.length > 0) {
          for (const approver of firstStep.approvers) {
            const approverId = typeof approver === 'object' ? (approver as any).approver_id : approver;
            if (approverId !== userId) {
              await notifyApprovalRequested(
                organizationId,
                approverId,
                {
                  id: request.id!,
                  name: request_name,
                  workflowName: (workflow as any).workflow_title || (workflow as any).name,
                  stepNumber: 1,
                  totalSteps: workflowSteps.length,
                },
                requesterName,
                baseUrl
              );
            }
          }
        }
      } catch (notifyError) {
        console.error("Failed to send approval request notifications:", notifyError);
      }
    })();

    return res.status(201).json(STATUS_CODE[201](request.toJSON()));
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      "failed to create approval request",
      "createApprovalRequest",
      "approvalRequest.ctrl.ts"
    );

    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get user's own approval requests
 * @route GET /api/approval-requests/my-requests
 * @access All authenticated users
 */
export async function getMyApprovalRequests(
  req: Request,
  res: Response
): Promise<any> {
  logStructured(
    "processing",
    "fetching my approval requests",
    "getMyApprovalRequests",
    "approvalRequest.ctrl.ts"
  );

  try {
    const { userId, organizationId } = req;

    if (!userId || !organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const requests = await getMyApprovalRequestsQuery(userId, organizationId);

    logStructured(
      "successful",
      `fetched ${requests.length} requests`,
      "getMyApprovalRequests",
      "approvalRequest.ctrl.ts"
    );

    return res.status(200).json(STATUS_CODE[200](requests));
  } catch (error) {
    logStructured(
      "error",
      "failed to fetch my requests",
      "getMyApprovalRequests",
      "approvalRequest.ctrl.ts"
    );
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get pending approval requests for current user
 * @route GET /api/approval-requests/pending-approvals
 * @access All authenticated users
 */
export async function getPendingApprovals(
  req: Request,
  res: Response
): Promise<any> {
  logStructured(
    "processing",
    "fetching pending approvals",
    "getPendingApprovals",
    "approvalRequest.ctrl.ts"
  );

  try {
    const { userId, organizationId } = req;

    if (!userId || !organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const requests = await getPendingApprovalsQuery(userId, organizationId);

    logStructured(
      "successful",
      `fetched ${requests.length} pending approvals`,
      "getPendingApprovals",
      "approvalRequest.ctrl.ts"
    );

    return res.status(200).json(STATUS_CODE[200](requests));
  } catch (error) {
    logStructured(
      "error",
      "failed to fetch pending approvals",
      "getPendingApprovals",
      "approvalRequest.ctrl.ts"
    );
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get approval request by ID with timeline
 * @route GET /api/approval-requests/:id
 * @access All authenticated users (must be requestor or approver)
 */
export async function getApprovalRequestById(
  req: Request,
  res: Response
): Promise<any> {
  logStructured(
    "processing",
    "fetching approval request by ID",
    "getApprovalRequestById",
    "approvalRequest.ctrl.ts"
  );

  try {
    const { userId, organizationId } = req;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!userId || !organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const requestId = parseInt(id, 10);
    if (isNaN(requestId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid request ID"));
    }

    const request = await getApprovalRequestByIdQuery(requestId, organizationId);

    if (!request) {
      return res.status(404).json(STATUS_CODE[404]("Request not found"));
    }

    logStructured(
      "successful",
      `fetched approval request ${requestId}`,
      "getApprovalRequestById",
      "approvalRequest.ctrl.ts"
    );

    return res.status(200).json(STATUS_CODE[200](request));
  } catch (error) {
    logStructured(
      "error",
      "failed to fetch approval request",
      "getApprovalRequestById",
      "approvalRequest.ctrl.ts"
    );
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Approve a request
 * @route POST /api/approval-requests/:id/approve
 * @access Approvers only
 */
export async function approveRequest(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();

  logStructured(
    "processing",
    "approving request",
    "approveRequest",
    "approvalRequest.ctrl.ts"
  );

  try {
    const { userId, organizationId } = req;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { comments } = req.body;

    if (!userId || !organizationId) {
      await transaction.rollback();
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const requestId = parseInt(id, 10);
    if (isNaN(requestId)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Invalid request ID"));
    }

    // Process the approval
    const notificationInfo = await processApprovalQuery(
      requestId,
      userId,
      ApprovalResult.APPROVED,
      comments,
      organizationId,
      transaction
    );

    await transaction.commit();

    logStructured(
      "successful",
      `approved request ${requestId}`,
      "approveRequest",
      "approvalRequest.ctrl.ts"
    );

    // Send notifications based on approval result (async, don't block response)
    if (notificationInfo) {
      (async () => {
        try {
          const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";

          // Get approver name
          const approverResult = await sequelize.query<{ name: string; surname: string }>(
            `SELECT name, surname FROM users WHERE id = :userId`,
            { replacements: { userId }, type: QueryTypes.SELECT }
          );
          const approver = approverResult[0];
          const approverName = approver ? `${approver.name} ${approver.surname}`.trim() : "Someone";

          if (notificationInfo.type === 'step_approvers') {
            // Notify next step approvers
            const nextStepApprovers = await sequelize.query<{ user_id: number }>(
              `SELECT DISTINCT arsa.approver_id as user_id
               FROM approval_request_step_approvals arsa
               JOIN approval_request_steps ars ON arsa.request_step_id = ars.id AND arsa.organization_id = ars.organization_id
               WHERE ars.organization_id = :organizationId AND ars.request_id = :requestId AND ars.step_number = :stepNumber`,
              { replacements: { organizationId, requestId, stepNumber: notificationInfo.stepNumber }, type: QueryTypes.SELECT }
            );

            // Get workflow info
            const [request] = await sequelize.query<{ workflow_id: number }>(
              `SELECT workflow_id FROM approval_requests WHERE organization_id = :organizationId AND id = :requestId`,
              { replacements: { organizationId, requestId }, type: QueryTypes.SELECT }
            );

            const [workflow] = await sequelize.query<{ workflow_title: string }>(
              `SELECT workflow_title FROM approval_workflows WHERE organization_id = :organizationId AND id = :workflowId`,
              { replacements: { organizationId, workflowId: request?.workflow_id }, type: QueryTypes.SELECT }
            );

            const [totalSteps] = await sequelize.query<{ count: string }>(
              `SELECT COUNT(*) as count FROM approval_request_steps WHERE organization_id = :organizationId AND request_id = :requestId`,
              { replacements: { organizationId, requestId }, type: QueryTypes.SELECT }
            );

            for (const approverRow of nextStepApprovers) {
              await notifyApprovalRequested(
                organizationId,
                approverRow.user_id,
                {
                  id: requestId,
                  name: notificationInfo.requestName,
                  workflowName: workflow?.workflow_title || "Approval workflow",
                  stepNumber: notificationInfo.stepNumber!,
                  totalSteps: parseInt(totalSteps?.count || "1", 10),
                },
                approverName,
                baseUrl
              );
            }

            // Also notify the requester about step completion progress
            if (notificationInfo.requesterId && notificationInfo.completedStep) {
              await notifyRequesterStepCompleted(
                organizationId,
                notificationInfo.requesterId,
                requestId,
                notificationInfo.requestName,
                {
                  completed_step: notificationInfo.completedStep,
                  next_step: notificationInfo.stepNumber!,
                  total_steps: parseInt(totalSteps?.count || "1", 10),
                  approver_name: approverName,
                  workflow_name: workflow?.workflow_title,
                }
              );
            }
          } else if (notificationInfo.type === 'requester_approved') {
            // Notify requester that request is fully approved
            const [totalSteps] = await sequelize.query<{ count: string }>(
              `SELECT COUNT(*) as count FROM approval_request_steps WHERE organization_id = :organizationId AND request_id = :requestId`,
              { replacements: { organizationId, requestId }, type: QueryTypes.SELECT }
            );

            await notifyApprovalComplete(
              organizationId,
              notificationInfo.requesterId!,
              {
                id: requestId,
                name: notificationInfo.requestName,
                totalSteps: parseInt(totalSteps?.count || "1", 10),
              },
              baseUrl
            );
          }
        } catch (notifyError) {
          console.error("Error sending approval notification:", notifyError);
        }
      })();
    }

    return res
      .status(200)
      .json(STATUS_CODE[200]({ message: "Request approved successfully" }));
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      "failed to approve request",
      "approveRequest",
      "approvalRequest.ctrl.ts"
    );
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Reject a request
 * @route POST /api/approval-requests/:id/reject
 * @access Approvers only
 */
export async function rejectRequest(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();

  logStructured(
    "processing",
    "rejecting request",
    "rejectRequest",
    "approvalRequest.ctrl.ts"
  );

  try {
    const { userId, organizationId } = req;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { comments } = req.body;

    if (!userId || !organizationId) {
      await transaction.rollback();
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const requestId = parseInt(id, 10);
    if (isNaN(requestId)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Invalid request ID"));
    }

    // Process the rejection
    const notificationInfo = await processApprovalQuery(
      requestId,
      userId,
      ApprovalResult.REJECTED,
      comments,
      organizationId,
      transaction
    );

    await transaction.commit();

    logStructured(
      "successful",
      `rejected request ${requestId}`,
      "rejectRequest",
      "approvalRequest.ctrl.ts"
    );

    // Send rejection notification to requester (async, don't block response)
    if (notificationInfo && notificationInfo.type === 'requester_rejected') {
      (async () => {
        try {
          const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";

          // Get rejector name
          const rejectorResult = await sequelize.query<{ name: string; surname: string }>(
            `SELECT name, surname FROM users WHERE id = :userId`,
            { replacements: { userId }, type: QueryTypes.SELECT }
          );
          const rejector = rejectorResult[0];
          const rejectorName = rejector ? `${rejector.name} ${rejector.surname}`.trim() : "Someone";

          // Get requester name
          const requesterResult = await sequelize.query<{ name: string; surname: string }>(
            `SELECT name, surname FROM users WHERE id = :requesterId`,
            { replacements: { requesterId: notificationInfo.requesterId }, type: QueryTypes.SELECT }
          );
          const requester = requesterResult[0];
          const requesterName = requester ? `${requester.name} ${requester.surname}`.trim() : "User";

          // Send rejection notification
          await sendInAppNotification(
            organizationId,
            {
              user_id: notificationInfo.requesterId!,
              type: NotificationType.APPROVAL_REJECTED,
              title: "Approval request rejected",
              message: `${rejectorName} rejected your approval request: ${notificationInfo.requestName}`,
              entity_type: NotificationEntityType.USE_CASE,
              entity_id: requestId,
              entity_name: notificationInfo.requestName,
              action_url: `${baseUrl}/approval-requests`,
            },
            true,
            {
              template: EMAIL_TEMPLATES.APPROVAL_REJECTED,
              subject: `Rejected: ${notificationInfo.requestName}`,
              variables: {
                requester_name: requesterName,
                rejector_name: rejectorName,
                request_name: notificationInfo.requestName,
                rejection_reason: comments || "No reason provided",
                request_url: `${baseUrl}/approval-requests`,
              },
            }
          );
        } catch (notifyError) {
          console.error("Error sending rejection notification:", notifyError);
        }
      })();
    }

    return res
      .status(200)
      .json(STATUS_CODE[200]({ message: "Request rejected successfully" }));
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      "failed to reject request",
      "rejectRequest",
      "approvalRequest.ctrl.ts"
    );
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Withdraw a request
 * @route POST /api/approval-requests/:id/withdraw
 * @access Requestor only
 */
export async function withdrawRequest(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();

  logStructured(
    "processing",
    "withdrawing request",
    "withdrawRequest",
    "approvalRequest.ctrl.ts"
  );

  try {
    const { userId, organizationId } = req;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!userId || !organizationId) {
      await transaction.rollback();
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const requestId = parseInt(id, 10);
    if (isNaN(requestId)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Invalid request ID"));
    }

    // Verify user is the requestor
    const request = await getApprovalRequestByIdQuery(requestId, organizationId, transaction);
    if (!request || request.requested_by !== userId) {
      await transaction.rollback();
      return res
        .status(403)
        .json(
          STATUS_CODE[403]("Only the requestor can withdraw this request")
        );
    }

    await withdrawApprovalRequestQuery(requestId, organizationId, transaction);

    await transaction.commit();

    logStructured(
      "successful",
      `withdrew request ${requestId}`,
      "withdrawRequest",
      "approvalRequest.ctrl.ts"
    );

    return res
      .status(200)
      .json(STATUS_CODE[200]({ message: "Request withdrawn successfully" }));
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      "failed to withdraw request",
      "withdrawRequest",
      "approvalRequest.ctrl.ts"
    );
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get all approval requests (admin view)
 * @route GET /api/approval-requests
 * @access Admin only
 */
export async function getAllApprovalRequests(
  req: Request,
  res: Response
): Promise<any> {
  logStructured(
    "processing",
    "fetching all approval requests",
    "getAllApprovalRequests",
    "approvalRequest.ctrl.ts"
  );

  try {
    const { organizationId } = req;

    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const requests = await sequelize.query(
      `SELECT * FROM approval_requests WHERE organization_id = :organizationId ORDER BY created_at DESC`,
      {
        replacements: { organizationId },
        type: "SELECT",
      }
    );

    logStructured(
      "successful",
      `fetched ${requests.length} requests`,
      "getAllApprovalRequests",
      "approvalRequest.ctrl.ts"
    );

    return res.status(200).json(STATUS_CODE[200](requests));
  } catch (error) {
    logStructured(
      "error",
      "failed to fetch all requests",
      "getAllApprovalRequests",
      "approvalRequest.ctrl.ts"
    );
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
