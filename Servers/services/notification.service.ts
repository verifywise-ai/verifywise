// import redisClient from "../database/redis";
import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import { sendInAppNotification } from "./inAppNotification.service";
import { NotificationType, NotificationEntityType } from "../domain.layer/interfaces/i.notification";
import { EMAIL_TEMPLATES } from "../constants/emailTemplates";

interface Notification {
  title: string;
  message: string;
  type: "approval_request" | "approval_approved" | "approval_rejected" | "approval_complete";
  entityId: number;
  entityType?: string;
}

// Map legacy notification types to new NotificationType enum
const mapNotificationType = (type: Notification["type"]): NotificationType => {
  switch (type) {
    case "approval_request":
      return NotificationType.APPROVAL_REQUESTED;
    case "approval_approved":
      return NotificationType.APPROVAL_APPROVED;
    case "approval_rejected":
      return NotificationType.APPROVAL_REJECTED;
    case "approval_complete":
      return NotificationType.APPROVAL_COMPLETE;
    default:
      return NotificationType.SYSTEM;
  }
};

/**
 * Send notification to a specific user via both database storage and Redis Pub/Sub
 * This ensures notifications are persisted and can be viewed later, even if user is offline
 */
export const sendNotification = async (
  organizationId: number,
  userId: number,
  notification: Notification
): Promise<void> => {
  try {
    console.log(`📤 Sending notification (DB + Redis):`, {
      organizationId,
      userId,
      type: notification.type,
      title: notification.title
    });

    // Map notification type to email template
    const emailTemplateMap: Record<Notification["type"], string> = {
      approval_request: EMAIL_TEMPLATES.APPROVAL_REQUESTED,
      approval_approved: EMAIL_TEMPLATES.APPROVAL_COMPLETE,
      approval_rejected: EMAIL_TEMPLATES.APPROVAL_REJECTED,
      approval_complete: EMAIL_TEMPLATES.APPROVAL_COMPLETE,
    };

    // Use sendInAppNotification which stores in DB AND publishes to Redis
    await sendInAppNotification(
      organizationId,
      {
        user_id: userId,
        type: mapNotificationType(notification.type),
        title: notification.title,
        message: notification.message,
        entity_type: notification.entityType as NotificationEntityType || NotificationEntityType.USE_CASE,
        entity_id: notification.entityId,
        entity_name: notification.title,
      },
      true, // Send email notification
      {
        template: emailTemplateMap[notification.type],
        subject: notification.title,
        variables: {
          notification_title: notification.title,
          notification_message: notification.message,
          entity_id: String(notification.entityId),
        },
      }
    );

    console.log(`✅ Notification stored and published`);
  } catch (error) {
    console.error("❌ Error sending notification:", error);
    throw error;
  }
};

/**
 * Send notification with full template context for approval emails
 * Used when we have all the context needed for rich email templates
 */
export const sendNotificationWithContext = async (
  organizationId: number,
  userId: number,
  notification: Notification,
  templateVariables: Record<string, string>
): Promise<void> => {
  try {
    console.log(`📤 Sending notification with context (DB + Redis):`, {
      organizationId,
      userId,
      type: notification.type,
      title: notification.title
    });

    // Map notification type to email template
    const emailTemplateMap: Record<Notification["type"], string> = {
      approval_request: EMAIL_TEMPLATES.APPROVAL_REQUESTED,
      approval_approved: EMAIL_TEMPLATES.APPROVAL_COMPLETE,
      approval_rejected: EMAIL_TEMPLATES.APPROVAL_REJECTED,
      approval_complete: EMAIL_TEMPLATES.APPROVAL_COMPLETE,
    };

    // Use sendInAppNotification which stores in DB AND publishes to Redis
    await sendInAppNotification(
      organizationId,
      {
        user_id: userId,
        type: mapNotificationType(notification.type),
        title: notification.title,
        message: notification.message,
        entity_type: notification.entityType as NotificationEntityType || NotificationEntityType.USE_CASE,
        entity_id: notification.entityId,
        entity_name: notification.title,
      },
      true, // Send email notification
      {
        template: emailTemplateMap[notification.type],
        subject: notification.title,
        variables: templateVariables,
      }
    );

    console.log(`✅ Notification with context stored and published`);
  } catch (error) {
    console.error("❌ Error sending notification with context:", error);
    throw error;
  }
};

interface ApproverInfo {
  approver_id: number;
  approver_name: string;
}

interface ApprovalContext {
  requester_name: string;
  workflow_name: string;
  total_steps: number;
  use_case_name: string;
}

/**
 * Get all approvers for a specific workflow step with their names
 */
const getApproversForStep = async (
  organizationId: number,
  requestId: number,
  stepNumber: number
): Promise<ApproverInfo[]> => {
  console.log(`🔍 Fetching approvers for step ${stepNumber}, request ${requestId}, tenant ${organizationId}`);

  const approvers = (await sequelize.query(
    `SELECT DISTINCT asa.approver_id, u.name as approver_name
     FROM approval_step_approvers asa
     INNER JOIN approval_workflow_steps aws
       ON asa.workflow_step_id = aws.id AND aws.organization_id = asa.organization_id
     INNER JOIN approval_requests ar
       ON aws.workflow_id = ar.workflow_id AND ar.organization_id = aws.organization_id
     INNER JOIN users u ON asa.approver_id = u.id
     WHERE asa.organization_id = :organizationId
       AND ar.id = :requestId
       AND aws.step_number = :stepNumber`,
    {
      replacements: { organizationId, requestId, stepNumber },
      type: QueryTypes.SELECT,
    }
  )) as ApproverInfo[];

  console.log(`✅ Found ${approvers.length} approvers:`, approvers.map(a => a.approver_id));
  return approvers;
};

/**
 * Get approval context (requester info, workflow info, etc.)
 */
const getApprovalContext = async (
  organizationId: number,
  requestId: number
): Promise<ApprovalContext | null> => {
  const result = (await sequelize.query(
    `SELECT
       u.name as requester_name,
       aw.workflow_title as workflow_name,
       (SELECT COUNT(*) FROM approval_workflow_steps WHERE organization_id = ar.organization_id AND workflow_id = ar.workflow_id) as total_steps,
       ar.request_name as use_case_name
     FROM approval_requests ar
     INNER JOIN users u ON ar.requester_id = u.id
     INNER JOIN approval_workflows aw ON ar.workflow_id = aw.id AND aw.organization_id = ar.organization_id
     WHERE ar.organization_id = :organizationId AND ar.id = :requestId`,
    {
      replacements: { organizationId, requestId },
      type: QueryTypes.SELECT,
    }
  )) as ApprovalContext[];

  return result[0] || null;
};

/**
 * Notify all approvers for a specific step of an approval workflow
 */
export const notifyStepApprovers = async (
  organizationId: number,
  requestId: number,
  stepNumber: number,
  requestName: string
): Promise<void> => {
  try {
    // Get approvers for this step (with names)
    const approvers = await getApproversForStep(organizationId, requestId, stepNumber);

    // Get approval context (requester name, workflow name, total steps)
    const context = await getApprovalContext(organizationId, requestId);

    console.log(
      `Notifying ${approvers.length} approvers for Step ${stepNumber} of request: ${requestName}`
    );

    // Build approval URL
    const baseUrl = process.env.FRONTEND_URL || "https://app.ai";
    const approvalUrl = `${baseUrl}/approval-requests/${requestId}`;

    // Send notification to each approver with full context
    const notificationPromises = approvers.map((approver) =>
      sendNotificationWithContext(organizationId, approver.approver_id, {
        title: "New Approval Request",
        message: `${requestName} - You are an approver for Step ${stepNumber}`,
        type: "approval_request",
        entityId: requestId,
        entityType: "use_case",
      }, {
        step_number: String(stepNumber),
        approver_name: approver.approver_name || "Approver",
        use_case_name: context?.use_case_name || requestName,
        requester_name: context?.requester_name || "Unknown",
        workflow_name: context?.workflow_name || "Approval Workflow",
        total_steps: String(context?.total_steps || 1),
        approval_url: approvalUrl,
      })
    );

    await Promise.all(notificationPromises);
  } catch (error) {
    console.error("Error notifying step approvers:", error);
    throw error;
  }
};

/**
 * Notify the requester when their request is fully approved
 */
export const notifyRequesterApproved = async (
  organizationId: number,
  requesterId: number,
  requestId: number,
  requestName: string,
  context?: {
    requester_name?: string;
    total_steps?: number;
  }
): Promise<void> => {
  try {
    // Fetch context if not provided
    let requesterName = context?.requester_name || "User";
    let totalSteps = context?.total_steps || 1;

    if (!context) {
      const fetchedContext = await getApprovalContext(organizationId, requestId);
      if (fetchedContext) {
        requesterName = fetchedContext.requester_name;
        totalSteps = fetchedContext.total_steps;
      }
    }

    const baseUrl = process.env.FRONTEND_URL || "https://app.ai";
    const useCaseUrl = `${baseUrl}/approval-requests/${requestId}`;

    await sendNotificationWithContext(organizationId, requesterId, {
      title: "Request Approved",
      message: `Your request "${requestName}" has been approved`,
      type: "approval_complete",
      entityId: requestId,
    }, {
      requester_name: requesterName,
      use_case_name: requestName,
      total_steps: String(totalSteps),
      use_case_url: useCaseUrl,
    });
  } catch (error) {
    console.error("Error notifying requester of approval:", error);
    throw error;
  }
};

/**
 * Notify the requester when their request is rejected
 */
export const notifyRequesterRejected = async (
  organizationId: number,
  requesterId: number,
  requestId: number,
  requestName: string,
  context?: {
    requester_name?: string;
    rejector_name?: string;
    rejection_reason?: string;
  }
): Promise<void> => {
  try {
    // Fetch context if not provided
    let requesterName = context?.requester_name || "User";

    if (!context?.requester_name) {
      const fetchedContext = await getApprovalContext(organizationId, requestId);
      if (fetchedContext) {
        requesterName = fetchedContext.requester_name;
      }
    }

    const baseUrl = process.env.FRONTEND_URL || "https://app.ai";
    const requestUrl = `${baseUrl}/approval-requests/${requestId}`;

    await sendNotificationWithContext(organizationId, requesterId, {
      title: "Request Rejected",
      message: `Your request "${requestName}" has been rejected`,
      type: "approval_rejected",
      entityId: requestId,
    }, {
      requester_name: requesterName,
      rejector_name: context?.rejector_name || "An approver",
      request_name: requestName,
      rejection_reason: context?.rejection_reason || "No reason provided",
      request_url: requestUrl,
    });
  } catch (error) {
    console.error("Error notifying requester of rejection:", error);
    throw error;
  }
};

/**
 * Notify the requester when a step in their approval request is completed
 */
export const notifyRequesterStepCompleted = async (
  organizationId: number,
  requesterId: number,
  requestId: number,
  requestName: string,
  context: {
    completed_step: number;
    next_step: number;
    total_steps: number;
    approver_name: string;
    workflow_name?: string;
  }
): Promise<void> => {
  try {
    // Fetch requester name if not available
    let requesterName = "User";
    const fetchedContext = await getApprovalContext(organizationId, requestId);
    if (fetchedContext) {
      requesterName = fetchedContext.requester_name;
    }

    const baseUrl = process.env.FRONTEND_URL || "https://app.ai";
    const requestUrl = `${baseUrl}/approval-requests/${requestId}`;

    // Use sendInAppNotification directly with the step completion template
    await sendInAppNotification(
      organizationId,
      {
        user_id: requesterId,
        type: NotificationType.APPROVAL_APPROVED,
        title: "Approval Progress Update",
        message: `Step ${context.completed_step} of "${requestName}" has been approved by ${context.approver_name}`,
        entity_type: NotificationEntityType.USE_CASE,
        entity_id: requestId,
        entity_name: requestName,
      },
      true, // Send email notification
      {
        template: EMAIL_TEMPLATES.APPROVAL_STEP_COMPLETED,
        subject: `Approval Progress: Step ${context.completed_step} of ${context.total_steps} completed`,
        variables: {
          requester_name: requesterName,
          request_name: requestName,
          completed_step: String(context.completed_step),
          next_step: String(context.next_step),
          total_steps: String(context.total_steps),
          approver_name: context.approver_name,
          workflow_name: context.workflow_name || fetchedContext?.workflow_name || "Approval Workflow",
          request_url: requestUrl,
        },
      }
    );
  } catch (error) {
    console.error("Error notifying requester of step completion:", error);
    throw error;
  }
};
