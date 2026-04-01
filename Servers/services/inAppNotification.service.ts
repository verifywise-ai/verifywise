import redisClient from "../database/redis";
import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import {
  createNotificationQuery,
  createBulkNotificationsQuery,
} from "../utils/notification.utils";
import {
  ICreateNotification,
  IBulkNotification,
  INotificationJSON,
  NotificationType,
  NotificationEntityType,
  IEmailNotificationConfig,
} from "../domain.layer/interfaces/i.notification";
import { notificationService } from "./notificationService";
import { EMAIL_TEMPLATES } from "../constants/emailTemplates";

/**
 * Send a notification to a user via both in-app storage and real-time SSE
 * Optionally also sends an email notification
 */
export const sendInAppNotification = async (
  organizationId: number,
  notification: ICreateNotification,
  sendEmailNotification?: boolean,
  emailConfig?: IEmailNotificationConfig
): Promise<INotificationJSON> => {
  try {
    // 1. Store notification in database
    const storedNotification = await createNotificationQuery(notification, organizationId);

    // 2. Publish to Redis for real-time delivery
    await redisClient.publish(
      "in-app-notifications",
      JSON.stringify({
        organizationId,
        userId: notification.user_id,
        notification: storedNotification,
        timestamp: new Date().toISOString(),
      })
    );

    console.log(`📤 In-app notification sent to user ${notification.user_id}: ${notification.title}`);

    // 3. Optionally send email notification using existing NotificationService (with rate limiting)
    if (sendEmailNotification && emailConfig) {
      try {
        // Get user email
        const user = await getUserEmail(notification.user_id);
        if (user?.email) {
          await notificationService.sendEmailWithTemplate(
            user.email,
            emailConfig.subject,
            emailConfig.template,
            emailConfig.variables
          );
          console.log(`📧 Email notification sent to ${user.email}`);
        }
      } catch (emailError) {
        console.error("Failed to send email notification:", emailError);
        // Don't fail the whole notification if email fails
      }
    }

    return storedNotification;
  } catch (error) {
    console.error("❌ Error sending in-app notification:", error);
    throw error;
  }
};

/**
 * Send bulk notifications to multiple users
 */
export const sendBulkInAppNotifications = async (
  organizationId: number,
  bulk: IBulkNotification,
  sendEmailNotification?: boolean,
  emailConfig?: IEmailNotificationConfig
): Promise<INotificationJSON[]> => {
  try {
    // 1. Store all notifications in database
    const storedNotifications = await createBulkNotificationsQuery(bulk, organizationId);

    // 2. Publish each to Redis for real-time delivery
    for (const notification of storedNotifications) {
      await redisClient.publish(
        "in-app-notifications",
        JSON.stringify({
          organizationId,
          userId: notification.user_id,
          notification,
          timestamp: new Date().toISOString(),
        })
      );
    }

    console.log(`📤 Bulk notifications sent to ${bulk.user_ids.length} users: ${bulk.title}`);

    // 3. Optionally send email notifications using existing NotificationService (with rate limiting)
    if (sendEmailNotification && emailConfig) {
      const users = await getUserEmails(bulk.user_ids);
      for (const user of users) {
        try {
          await notificationService.sendEmailWithTemplate(
            user.email,
            emailConfig.subject,
            emailConfig.template,
            {
              ...emailConfig.variables,
              recipient_name: `${user.name} ${user.surname}`,
            }
          );
        } catch (emailError) {
          console.error(`Failed to send email to ${user.email}:`, emailError);
        }
      }
    }

    return storedNotifications;
  } catch (error) {
    console.error("❌ Error sending bulk notifications:", error);
    throw error;
  }
};

/**
 * Entity link for task notifications
 */
export interface ITaskEntityLinkForEmail {
  entity_id: number;
  entity_type: string;
  entity_name: string;
}

/**
 * Format a date string for display in emails
 */
function formatDateForEmail(dateStr?: string): string {
  if (!dateStr) return "No due date";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Get a human-readable label for entity type
 */
function getEntityTypeLabel(entityType: string): string {
  const labels: Record<string, string> = {
    vendor: "Vendor",
    model: "Model",
    policy: "Policy",
    nist_subcategory: "NIST AI RMF",
    iso42001_subclause: "ISO 42001 Clause",
    iso42001_annexcategory: "ISO 42001 Annex",
    iso42001_assessment: "ISO 42001 Assessment",
    iso27001_subclause: "ISO 27001 Clause",
    iso27001_annexcontrol: "ISO 27001 Annex",
    iso27001_assessment: "ISO 27001 Assessment",
    eu_control: "EU AI Act Control",
    eu_subcontrol: "EU AI Act Subcontrol",
    eu_assessment: "EU AI Act Assessment",
  };
  return labels[entityType] || entityType;
}

/**
 * Build URL for entities - queries DB for parent context when needed
 */
async function buildEntityUrlAsync(
  baseUrl: string,
  entityType: string,
  entityId: number,
  organizationId: number
): Promise<string | null> {
  switch (entityType) {
    case "vendor":
      return `${baseUrl}/vendors?vendorId=${entityId}`;
    case "model":
      return `${baseUrl}/model-inventory?modelId=${entityId}`;
    case "policy":
      return `${baseUrl}/policies?policyId=${entityId}`;

    case "nist_subcategory": {
      // Get function type and category info for NIST - join with struct tables
      const result = await sequelize.query<{ func_type: string; category_struct_id: number }>(
        `SELECT ss.function as func_type, cs.id as category_struct_id
         FROM nist_ai_rmf_subcategories s
         JOIN nist_ai_rmf_subcategories_struct ss ON s.subcategory_meta_id = ss.id
         JOIN nist_ai_rmf_categories_struct cs ON ss.category_struct_id = cs.id
         WHERE s.organization_id = :organizationId AND s.id = :entityId`,
        { replacements: { organizationId, entityId }, type: QueryTypes.SELECT }
      );
      if (result[0]) {
        // Tabs expect lowercase: govern, map, measure, manage
        const funcType = result[0].func_type.toLowerCase();
        return `${baseUrl}/framework?framework=nist-ai-rmf&functionId=${funcType}&categoryId=${result[0].category_struct_id}&subcategoryId=${entityId}`;
      }
      return null;
    }

    case "iso42001_subclause": {
      // Get clause ID for ISO 42001 subclause - join with struct table
      const result = await sequelize.query<{ clause_id: number }>(
        `SELECT scs.clause_id
         FROM subclauses_iso sc
         JOIN subclauses_struct_iso scs ON sc.subclause_meta_id = scs.id
         WHERE sc.organization_id = :organizationId AND sc.id = :entityId`,
        { replacements: { organizationId, entityId }, type: QueryTypes.SELECT }
      );
      if (result[0]) {
        return `${baseUrl}/framework?framework=iso-42001&clauseId=${result[0].clause_id}&subClauseId=${entityId}`;
      }
      return null;
    }

    case "iso42001_annexcategory": {
      // Get annex ID for ISO 42001 annex category - join with struct table
      const result = await sequelize.query<{ annex_id: number }>(
        `SELECT acs.annex_id
         FROM annexcategories_iso ac
         JOIN annexcategories_struct_iso acs ON ac.annexcategory_meta_id = acs.id
         WHERE ac.organization_id = :organizationId AND ac.id = :entityId`,
        { replacements: { organizationId, entityId }, type: QueryTypes.SELECT }
      );
      if (result[0]) {
        return `${baseUrl}/framework?framework=iso-42001&annexId=${result[0].annex_id}&annexCategoryId=${entityId}`;
      }
      return null;
    }

    case "iso27001_subclause": {
      // Get clause ID for ISO 27001 subclause - join with struct table
      const result = await sequelize.query<{ clause_id: number }>(
        `SELECT scs.clause_id
         FROM subclauses_iso27001 sc
         JOIN subclauses_struct_iso27001 scs ON sc.subclause_meta_id = scs.id
         WHERE sc.organization_id = :organizationId AND sc.id = :entityId`,
        { replacements: { organizationId, entityId }, type: QueryTypes.SELECT }
      );
      if (result[0]) {
        return `${baseUrl}/framework?framework=iso-27001&clause27001Id=${result[0].clause_id}&subClause27001Id=${entityId}`;
      }
      return null;
    }

    case "iso27001_annexcontrol": {
      // Get annex ID for ISO 27001 annex control - join with struct table
      const result = await sequelize.query<{ annex_id: number }>(
        `SELECT acs.annex_id
         FROM annexcontrols_iso27001 ac
         JOIN annexcontrols_struct_iso27001 acs ON ac.annexcontrol_meta_id = acs.id
         WHERE ac.organization_id = :organizationId AND ac.id = :entityId`,
        { replacements: { organizationId, entityId }, type: QueryTypes.SELECT }
      );
      if (result[0]) {
        return `${baseUrl}/framework?framework=iso-27001&annex27001Id=${result[0].annex_id}&annexControl27001Id=${entityId}`;
      }
      return null;
    }

    case "eu_control": {
      // EU AI Act controls - need project_id via projects_frameworks join
      const result = await sequelize.query<{ project_id: number }>(
        `SELECT pf.project_id
         FROM controls_eu c
         JOIN projects_frameworks pf ON c.projects_frameworks_id = pf.id AND pf.organization_id = c.organization_id
         WHERE c.organization_id = :organizationId AND c.id = :entityId`,
        { replacements: { organizationId, entityId }, type: QueryTypes.SELECT }
      );
      if (result[0]) {
        return `${baseUrl}/project-view?projectId=${result[0].project_id}&tab=frameworks&framework=eu-ai-act&subtab=compliance&controlId=${entityId}`;
      }
      return null;
    }

    case "eu_subcontrol": {
      // EU AI Act subcontrols - need project_id via controls_eu and projects_frameworks join
      const result = await sequelize.query<{ project_id: number; control_id: number }>(
        `SELECT pf.project_id, sc.control_id
         FROM subcontrols_eu sc
         JOIN controls_eu c ON sc.control_id = c.id AND c.organization_id = sc.organization_id
         JOIN projects_frameworks pf ON c.projects_frameworks_id = pf.id AND pf.organization_id = c.organization_id
         WHERE sc.organization_id = :organizationId AND sc.id = :entityId`,
        { replacements: { organizationId, entityId }, type: QueryTypes.SELECT }
      );
      if (result[0]) {
        return `${baseUrl}/project-view?projectId=${result[0].project_id}&tab=frameworks&framework=eu-ai-act&subtab=compliance&controlId=${result[0].control_id}&subControlId=${entityId}`;
      }
      return null;
    }

    case "eu_assessment": {
      // EU AI Act assessment - need project_id, question_id, and topic_id for navigation
      // Frontend uses topicId to select tab and questionId to scroll to question
      const result = await sequelize.query<{ project_id: number; question_id: number; topic_id: number }>(
        `SELECT pf.project_id, ae.question_id, st.topic_id
         FROM answers_eu ae
         JOIN assessments a ON ae.assessment_id = a.id AND a.organization_id = ae.organization_id
         JOIN projects_frameworks pf ON a.projects_frameworks_id = pf.id AND pf.organization_id = a.organization_id
         JOIN questions_struct_eu q ON ae.question_id = q.id
         JOIN subtopics_struct_eu st ON q.subtopic_id = st.id
         WHERE ae.organization_id = :organizationId AND ae.id = :entityId`,
        { replacements: { organizationId, entityId }, type: QueryTypes.SELECT }
      );
      if (result[0]?.project_id && result[0]?.question_id) {
        return `${baseUrl}/project-view?projectId=${result[0].project_id}&tab=frameworks&framework=eu-ai-act&subtab=assessment&topicId=${result[0].topic_id}&questionId=${result[0].question_id}`;
      }
      return null;
    }

    case "iso42001_assessment": {
      // ISO 42001 assessment - need project_id, question_id, and topic_id for navigation
      // Frontend uses topicId to select tab and questionId to scroll to question
      const result = await sequelize.query<{ project_id: number; question_id: number; topic_id: number }>(
        `SELECT pf.project_id, ai.question_id, st.topic_id
         FROM answers_iso ai
         JOIN assessments a ON ai.assessment_id = a.id AND a.organization_id = ai.organization_id
         JOIN projects_frameworks pf ON a.projects_frameworks_id = pf.id AND pf.organization_id = a.organization_id
         JOIN questions_struct_iso q ON ai.question_id = q.id
         JOIN subtopics_struct_iso st ON q.subtopic_id = st.id
         WHERE ai.organization_id = :organizationId AND ai.id = :entityId`,
        { replacements: { organizationId, entityId }, type: QueryTypes.SELECT }
      );
      if (result[0]?.project_id && result[0]?.question_id) {
        return `${baseUrl}/project-view?projectId=${result[0].project_id}&tab=frameworks&framework=iso-42001&subtab=assessment&topicId=${result[0].topic_id}&questionId=${result[0].question_id}`;
      }
      return null;
    }

    case "iso27001_assessment": {
      // ISO 27001 assessment - need project_id, question_id, and topic_id for navigation
      // Frontend uses topicId to select tab and questionId to scroll to question
      const result = await sequelize.query<{ project_id: number; question_id: number; topic_id: number }>(
        `SELECT pf.project_id, ai.question_id, st.topic_id
         FROM answers_iso27001 ai
         JOIN assessments a ON ai.assessment_id = a.id AND a.organization_id = ai.organization_id
         JOIN projects_frameworks pf ON a.projects_frameworks_id = pf.id AND pf.organization_id = a.organization_id
         JOIN questions_struct_iso27001 q ON ai.question_id = q.id
         JOIN subtopics_struct_iso27001 st ON q.subtopic_id = st.id
         WHERE ai.organization_id = :organizationId AND ai.id = :entityId`,
        { replacements: { organizationId, entityId }, type: QueryTypes.SELECT }
      );
      if (result[0]?.project_id && result[0]?.question_id) {
        return `${baseUrl}/project-view?projectId=${result[0].project_id}&tab=frameworks&framework=iso-27001&subtab=assessment&topicId=${result[0].topic_id}&questionId=${result[0].question_id}`;
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Build HTML for entity links to include in email
 * All entity types get clickable links (queries DB for parent context when needed)
 */
async function buildEntityLinksHtml(
  baseUrl: string,
  entityLinks: ITaskEntityLinkForEmail[],
  organizationId: number
): Promise<string> {
  if (!entityLinks || entityLinks.length === 0) {
    return "";
  }

  const linkRows: string[] = [];
  for (const link of entityLinks) {
    const displayName = link.entity_name || `${link.entity_type} #${link.entity_id}`;
    const typeLabel = getEntityTypeLabel(link.entity_type);

    let url: string | null = null;
    try {
      url = await buildEntityUrlAsync(baseUrl, link.entity_type, link.entity_id, organizationId);
    } catch (error) {
      console.error(`Failed to build URL for ${link.entity_type}:${link.entity_id}:`, error);
    }

    const nameHtml = url
      ? `<a href="${url}" style="color: #13715B; text-decoration: none; font-weight: 500;">${displayName}</a>`
      : `<span style="font-weight: 500;">${displayName}</span>`;

    linkRows.push(`<tr><td style="color: #667085; padding: 4px 0; font-size: 13px; vertical-align: top;">${typeLabel}:</td><td style="color: #344054; padding: 4px 0 4px 8px; font-size: 13px;">${nameHtml}</td></tr>`);
  }

  return `<table style="width: 100%; margin: 16px 0;"><tr><td colspan="2" style="color: #344054; font-weight: 500; padding-bottom: 8px;">Items to complete:</td></tr>${linkRows.join("")}</table>`;
}

/**
 * Notify task assignment
 */
export const notifyTaskAssigned = async (
  organizationId: number,
  assigneeId: number,
  task: {
    id: number;
    title: string;
    description?: string;
    priority: string;
    due_date?: string;
    entity_links?: ITaskEntityLinkForEmail[];
  },
  assignerName: string,
  baseUrl: string
): Promise<void> => {
  const assignee = await getUserById(assigneeId);

  // Build entity links HTML for email (async - queries DB for parent context)
  const entityLinksHtml = await buildEntityLinksHtml(baseUrl, task.entity_links || [], organizationId);

  await sendInAppNotification(
    organizationId,
    {
      user_id: assigneeId,
      type: NotificationType.TASK_ASSIGNED,
      title: "New task assigned",
      message: `${assignerName} assigned you to: ${task.title}`,
      entity_type: NotificationEntityType.TASK,
      entity_id: task.id,
      entity_name: task.title,
      action_url: `/tasks?taskId=${task.id}`,
    },
    true,
    {
      template: EMAIL_TEMPLATES.TASK_ASSIGNED,
      subject: `New task assigned: ${task.title}`,
      variables: {
        assignee_name: assignee ? `${assignee.name}` : "User",
        assigner_name: assignerName,
        task_title: task.title,
        task_description: task.description || "No description provided",
        task_priority: task.priority,
        task_due_date: formatDateForEmail(task.due_date),
        task_url: `${baseUrl}/tasks?taskId=${task.id}`,
        entity_links_html: entityLinksHtml,
      },
    }
  );
};

/**
 * Notify task updated
 */
export const notifyTaskUpdated = async (
  organizationId: number,
  assigneeId: number,
  task: {
    id: number;
    title: string;
    description?: string;
    priority: string;
    status: string;
    due_date?: string;
    entity_links?: ITaskEntityLinkForEmail[];
  },
  updaterName: string,
  baseUrl: string
): Promise<void> => {
  const assignee = await getUserById(assigneeId);

  // Build entity links HTML for email (async - queries DB for parent context)
  const entityLinksHtml = await buildEntityLinksHtml(baseUrl, task.entity_links || [], organizationId);

  await sendInAppNotification(
    organizationId,
    {
      user_id: assigneeId,
      type: NotificationType.TASK_UPDATED,
      title: "Task updated",
      message: `${updaterName} updated task: ${task.title}`,
      entity_type: NotificationEntityType.TASK,
      entity_id: task.id,
      entity_name: task.title,
      action_url: `/tasks?taskId=${task.id}`,
    },
    true,
    {
      template: EMAIL_TEMPLATES.TASK_UPDATED,
      subject: `Task updated: ${task.title}`,
      variables: {
        assignee_name: assignee ? `${assignee.name}` : "User",
        updater_name: updaterName,
        task_title: task.title,
        task_description: task.description || "No description provided",
        task_priority: task.priority,
        task_status: task.status,
        task_due_date: formatDateForEmail(task.due_date),
        task_url: `${baseUrl}/tasks?taskId=${task.id}`,
        entity_links_html: entityLinksHtml,
      },
    }
  );
};

/**
 * Notify review requested
 */
export const notifyReviewRequested = async (
  organizationId: number,
  reviewerId: number,
  entity: {
    type: NotificationEntityType;
    id: number;
    name: string;
    projectName: string;
  },
  requesterName: string,
  message: string,
  baseUrl: string
): Promise<void> => {
  const reviewer = await getUserById(reviewerId);
  const entityTypeLabel = entity.type.replace("_", " ");

  await sendInAppNotification(
    organizationId,
    {
      user_id: reviewerId,
      type: NotificationType.REVIEW_REQUESTED,
      title: "Review requested",
      message: `${requesterName} requested your review on ${entity.name}`,
      entity_type: entity.type,
      entity_id: entity.id,
      entity_name: entity.name,
      action_url: `/${entity.type}s/${entity.id}`,
    },
    true,
    {
      template: EMAIL_TEMPLATES.REVIEW_REQUESTED,
      subject: `Review requested: ${entity.name}`,
      variables: {
        reviewer_name: reviewer ? `${reviewer.name}` : "Reviewer",
        requester_name: requesterName,
        entity_type: entityTypeLabel,
        entity_name: entity.name,
        project_name: entity.projectName,
        review_message: message || "Please review this item.",
        review_url: `${baseUrl}/${entity.type}s/${entity.id}`,
      },
    }
  );
};

/**
 * Notify review approved
 */
export const notifyReviewApproved = async (
  organizationId: number,
  ownerId: number,
  entity: {
    type: NotificationEntityType;
    id: number;
    name: string;
    projectName: string;
  },
  reviewerName: string,
  comment: string,
  baseUrl: string
): Promise<void> => {
  const owner = await getUserById(ownerId);
  const entityTypeLabel = entity.type.replace("_", " ");

  await sendInAppNotification(
    organizationId,
    {
      user_id: ownerId,
      type: NotificationType.REVIEW_APPROVED,
      title: "Review approved",
      message: `${reviewerName} approved your ${entityTypeLabel}: ${entity.name}`,
      entity_type: entity.type,
      entity_id: entity.id,
      entity_name: entity.name,
      action_url: `/${entity.type}s/${entity.id}`,
    },
    true,
    {
      template: EMAIL_TEMPLATES.REVIEW_APPROVED,
      subject: `Approved: ${entity.name}`,
      variables: {
        owner_name: owner ? `${owner.name}` : "User",
        reviewer_name: reviewerName,
        entity_type: entityTypeLabel,
        entity_name: entity.name,
        project_name: entity.projectName,
        review_comment: comment || "Looks good!",
        entity_url: `${baseUrl}/${entity.type}s/${entity.id}`,
      },
    }
  );
};

/**
 * Notify review rejected (changes requested)
 */
export const notifyReviewRejected = async (
  organizationId: number,
  ownerId: number,
  entity: {
    type: NotificationEntityType;
    id: number;
    name: string;
    projectName: string;
  },
  reviewerName: string,
  comment: string,
  baseUrl: string
): Promise<void> => {
  const owner = await getUserById(ownerId);
  const entityTypeLabel = entity.type.replace("_", " ");

  await sendInAppNotification(
    organizationId,
    {
      user_id: ownerId,
      type: NotificationType.REVIEW_REJECTED,
      title: "Changes requested",
      message: `${reviewerName} requested changes on your ${entityTypeLabel}: ${entity.name}`,
      entity_type: entity.type,
      entity_id: entity.id,
      entity_name: entity.name,
      action_url: `/${entity.type}s/${entity.id}`,
    },
    true,
    {
      template: EMAIL_TEMPLATES.REVIEW_REJECTED,
      subject: `Changes requested: ${entity.name}`,
      variables: {
        owner_name: owner ? `${owner.name}` : "User",
        reviewer_name: reviewerName,
        entity_type: entityTypeLabel,
        entity_name: entity.name,
        project_name: entity.projectName,
        review_comment: comment || "Please make the requested changes.",
        entity_url: `${baseUrl}/${entity.type}s/${entity.id}`,
      },
    }
  );
};

/**
 * Notify approval requested (for use case workflows)
 */
export const notifyApprovalRequested = async (
  organizationId: number,
  approverId: number,
  useCase: {
    id: number;
    name: string;
    workflowName: string;
    stepNumber: number;
    totalSteps: number;
  },
  requesterName: string,
  baseUrl: string
): Promise<void> => {
  const approver = await getUserById(approverId);

  await sendInAppNotification(
    organizationId,
    {
      user_id: approverId,
      type: NotificationType.APPROVAL_REQUESTED,
      title: `Approval requested - Step ${useCase.stepNumber}`,
      message: `${requesterName} needs your approval for: ${useCase.name}`,
      entity_type: NotificationEntityType.USE_CASE,
      entity_id: useCase.id,
      entity_name: useCase.name,
      action_url: `/use-cases/${useCase.id}`,
      metadata: { stepNumber: useCase.stepNumber },
    },
    true,
    {
      template: EMAIL_TEMPLATES.APPROVAL_REQUESTED,
      subject: `Approval requested: ${useCase.name}`,
      variables: {
        approver_name: approver ? `${approver.name}` : "Approver",
        requester_name: requesterName,
        use_case_name: useCase.name,
        workflow_name: useCase.workflowName,
        step_number: String(useCase.stepNumber),
        total_steps: String(useCase.totalSteps),
        approval_url: `${baseUrl}/use-cases/${useCase.id}`,
      },
    }
  );
};

/**
 * Notify approval complete
 */
export const notifyApprovalComplete = async (
  organizationId: number,
  requesterId: number,
  useCase: {
    id: number;
    name: string;
    totalSteps: number;
  },
  baseUrl: string
): Promise<void> => {
  const requester = await getUserById(requesterId);

  await sendInAppNotification(
    organizationId,
    {
      user_id: requesterId,
      type: NotificationType.APPROVAL_COMPLETE,
      title: "Use case fully approved",
      message: `Your use case "${useCase.name}" has been fully approved`,
      entity_type: NotificationEntityType.USE_CASE,
      entity_id: useCase.id,
      entity_name: useCase.name,
      action_url: `/use-cases/${useCase.id}`,
    },
    true,
    {
      template: EMAIL_TEMPLATES.APPROVAL_COMPLETE,
      subject: `Approved: ${useCase.name}`,
      variables: {
        requester_name: requester ? `${requester.name}` : "User",
        use_case_name: useCase.name,
        total_steps: String(useCase.totalSteps),
        use_case_url: `${baseUrl}/use-cases/${useCase.id}`,
      },
    }
  );
};

/**
 * Notify vendor review due
 */
export const notifyVendorReviewDue = async (
  organizationId: number,
  reviewerId: number,
  vendor: {
    id: number;
    name: string;
    reviewDate: string;
    riskLevel: string;
    lastReviewDate?: string;
    projectCount: number;
  },
  baseUrl: string
): Promise<void> => {
  const reviewer = await getUserById(reviewerId);

  await sendInAppNotification(
    organizationId,
    {
      user_id: reviewerId,
      type: NotificationType.VENDOR_REVIEW_DUE,
      title: "Vendor review due",
      message: `Vendor "${vendor.name}" review is due on ${vendor.reviewDate}`,
      entity_type: NotificationEntityType.VENDOR,
      entity_id: vendor.id,
      entity_name: vendor.name,
      action_url: `/vendors/${vendor.id}`,
    },
    true,
    {
      template: EMAIL_TEMPLATES.VENDOR_REVIEW_DUE,
      subject: `Vendor review due: ${vendor.name}`,
      variables: {
        reviewer_name: reviewer ? `${reviewer.name}` : "Reviewer",
        vendor_name: vendor.name,
        review_date: vendor.reviewDate,
        risk_level: vendor.riskLevel,
        last_review_date: vendor.lastReviewDate || "Never",
        project_count: String(vendor.projectCount),
        vendor_url: `${baseUrl}/vendors/${vendor.id}`,
      },
    }
  );
};

/**
 * Notify policy due soon
 */
export const notifyPolicyDueSoon = async (
  organizationId: number,
  adminId: number,
  policy: {
    id: number;
    name: string;
    projectName: string;
    dueDate: string;
  },
  baseUrl: string
): Promise<void> => {
  const admin = await getUserById(adminId);

  await sendInAppNotification(
    organizationId,
    {
      user_id: adminId,
      type: NotificationType.POLICY_DUE_SOON,
      title: "Policy due soon",
      message: `Policy "${policy.name}" is due on ${policy.dueDate}`,
      entity_type: NotificationEntityType.POLICY,
      entity_id: policy.id,
      entity_name: policy.name,
      action_url: `/policies/${policy.id}`,
    },
    true,
    {
      template: EMAIL_TEMPLATES.POLICY_DUE_SOON,
      subject: `Policy due soon: ${policy.name}`,
      variables: {
        admin_name: admin ? `${admin.name}` : "Admin",
        policy_name: policy.name,
        project_name: policy.projectName,
        due_date: policy.dueDate,
        policy_url: `${baseUrl}/policies/${policy.id}`,
      },
    }
  );
};

/**
 * Notify training assigned
 */
export const notifyTrainingAssigned = async (
  organizationId: number,
  userId: number,
  training: {
    id: number;
    name: string;
    description?: string;
    duration?: string;
    dueDate?: string;
  },
  assignerName: string,
  baseUrl: string
): Promise<void> => {
  const user = await getUserById(userId);

  await sendInAppNotification(
    organizationId,
    {
      user_id: userId,
      type: NotificationType.TRAINING_ASSIGNED,
      title: "Training assigned",
      message: `${assignerName} assigned you to training: ${training.name}`,
      entity_type: NotificationEntityType.TRAINING,
      entity_id: training.id,
      entity_name: training.name,
      action_url: `/training/${training.id}`,
    },
    true,
    {
      template: EMAIL_TEMPLATES.TRAINING_ASSIGNED,
      subject: `Training assigned: ${training.name}`,
      variables: {
        trainee_name: user ? `${user.name}` : "User",
        assigner_name: assignerName,
        training_name: training.name,
        training_description: training.description || "No description provided",
        training_duration: training.duration || "Not specified",
        training_due_date: training.dueDate || "No due date",
        training_url: `${baseUrl}/training/${training.id}`,
      },
    }
  );
};

// Helper functions
async function getUserById(userId: number): Promise<{ name: string; surname: string; email: string } | null> {
  const result = await sequelize.query<{ name: string; surname: string; email: string }>(
    `SELECT name, surname, email FROM users WHERE id = :userId`,
    {
      replacements: { userId },
      type: QueryTypes.SELECT,
    }
  );
  return result[0] || null;
}

async function getUserEmail(userId: number): Promise<{ email: string } | null> {
  const result = await sequelize.query<{ email: string }>(
    `SELECT email FROM users WHERE id = :userId`,
    {
      replacements: { userId },
      type: QueryTypes.SELECT,
    }
  );
  return result[0] || null;
}

async function getUserEmails(userIds: number[]): Promise<Array<{ id: number; name: string; surname: string; email: string }>> {
  if (userIds.length === 0) return [];

  const result = await sequelize.query<{ id: number; name: string; surname: string; email: string }>(
    `SELECT id, name, surname, email FROM users WHERE id IN (:userIds)`,
    {
      replacements: { userIds },
      type: QueryTypes.SELECT,
    }
  );
  return result;
}

/**
 * Role type for assignment notifications
 */
export type AssignmentRoleType =
  | "Owner"
  | "Reviewer"
  | "Approver"
  | "Member"
  | "Assignee"
  | "Action Owner"
  | "Risk Owner";

/**
 * Entity type labels for display in notifications
 */
const ENTITY_TYPE_DISPLAY_LABELS: Record<string, string> = {
  vendor: "Vendor",
  vendor_risk: "Vendor Risk",
  project_risk: "Use Case Risk",
  project: "Use Case",
  model_inventory: "Model",
  iso42001_subclause: "ISO 42001 Subclause",
  iso42001_annexcategory: "ISO 42001 Annex",
  iso27001_subclause: "ISO 27001 Subclause",
  iso27001_annexcontrol: "ISO 27001 Annex Control",
  eu_control: "EU AI Act Control",
  eu_subcontrol: "EU AI Act Subcontrol",
  nist_subcategory: "NIST AI RMF Subcategory",
};

/**
 * Map role type to notification type
 */
function getNotificationTypeForRole(roleType: AssignmentRoleType): NotificationType {
  switch (roleType) {
    case "Owner":
    case "Risk Owner":
      return NotificationType.ASSIGNMENT_OWNER;
    case "Reviewer":
      return NotificationType.ASSIGNMENT_REVIEWER;
    case "Approver":
      return NotificationType.ASSIGNMENT_APPROVER;
    case "Member":
      return NotificationType.ASSIGNMENT_MEMBER;
    case "Assignee":
      return NotificationType.ASSIGNMENT_ASSIGNEE;
    case "Action Owner":
      return NotificationType.ASSIGNMENT_ACTION_OWNER;
    default:
      return NotificationType.ASSIGNMENT_OWNER;
  }
}

/**
 * Get description of what each role is responsible for
 */
function getRoleDescription(roleType: AssignmentRoleType): string {
  switch (roleType) {
    case "Owner":
      return "As the Owner, you are responsible for completing this item and ensuring all requirements are met.";
    case "Risk Owner":
      return "As the Risk Owner, you are responsible for managing and mitigating this risk.";
    case "Reviewer":
      return "As the Reviewer, you are responsible for reviewing the work and providing feedback before approval.";
    case "Approver":
      return "As the Approver, you have the authority to approve or reject this item once it's ready.";
    case "Member":
      return "As a Member, you have access to view and contribute to this project.";
    case "Assignee":
      return "As the Assignee, you are responsible for completing this task.";
    case "Action Owner":
      return "As the Action Owner, you are responsible for taking action to address this item.";
    default:
      return "You have been assigned to this item.";
  }
}

/**
 * Format date for email display
 */
function formatAssignmentDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Map entity type string to NotificationEntityType enum
 */
function getNotificationEntityType(entityType: string): NotificationEntityType {
  switch (entityType) {
    case "vendor":
      return NotificationEntityType.VENDOR;
    case "project":
      return NotificationEntityType.PROJECT;
    case "model_inventory":
      return NotificationEntityType.MODEL;
    case "project_risk":
    case "vendor_risk":
      return NotificationEntityType.RISK;
    default:
      return NotificationEntityType.PROJECT;
  }
}

/**
 * Entity context for additional details in assignment emails
 */
export interface AssignmentEntityContext {
  frameworkName?: string;    // e.g., "ISO 27001", "NIST AI RMF"
  parentType?: string;       // e.g., "Annex", "Clause", "Control"
  parentName?: string;       // e.g., "A.5 Organizational controls"
  projectName?: string;      // Project this belongs to
  description?: string;      // Brief description of the entity
}

/**
 * Build HTML for entity context to include in email
 */
function buildEntityContextHtml(context?: AssignmentEntityContext): string {
  if (!context) return "";

  const rows: string[] = [];

  if (context.frameworkName) {
    rows.push(`<tr><td style="padding: 4px 0; color: #667085; font-size: 13px; width: 110px;">Framework:</td><td style="padding: 4px 0; color: #344054; font-size: 13px;">${context.frameworkName}</td></tr>`);
  }

  if (context.projectName) {
    rows.push(`<tr><td style="padding: 4px 0; color: #667085; font-size: 13px; width: 110px;">Project:</td><td style="padding: 4px 0; color: #344054; font-size: 13px;">${context.projectName}</td></tr>`);
  }

  if (context.parentType && context.parentName) {
    rows.push(`<tr><td style="padding: 4px 0; color: #667085; font-size: 13px; width: 110px;">${context.parentType}:</td><td style="padding: 4px 0; color: #344054; font-size: 13px;">${context.parentName}</td></tr>`);
  }

  if (context.description) {
    rows.push(`<tr><td style="padding: 8px 0 4px 0; color: #667085; font-size: 13px; width: 110px; vertical-align: top;">About:</td><td style="padding: 8px 0 4px 0; color: #344054; font-size: 13px;">${context.description}</td></tr>`);
  }

  if (rows.length === 0) return "";

  return `<table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">${rows.join("")}</table>`;
}

/**
 * Notify a user when they are assigned to an entity
 *
 * @param organizationId - Tenant ID for multi-tenancy
 * @param assigneeId - User ID being assigned
 * @param assignment - Assignment details including entity info and role
 * @param assignerName - Name of the person making the assignment
 * @param baseUrl - Base URL for building entity links
 * @param entityContext - Optional additional context about the entity
 */
export const notifyUserAssigned = async (
  organizationId: number,
  assigneeId: number,
  assignment: {
    entityType: string;      // "vendor", "project", "model_inventory", etc.
    entityId: number;
    entityName: string;
    roleType: AssignmentRoleType;
    entityUrl: string;       // Full URL path (relative or absolute)
  },
  assignerName: string,
  baseUrl: string,
  entityContext?: AssignmentEntityContext
): Promise<void> => {
  try {
    const assignee = await getUserById(assigneeId);
    if (!assignee) {
      console.warn(`Cannot send assignment notification: user ${assigneeId} not found`);
      return;
    }

    const displayEntityType = ENTITY_TYPE_DISPLAY_LABELS[assignment.entityType] || assignment.entityType;
    const notificationType = getNotificationTypeForRole(assignment.roleType);
    const notificationEntityType = getNotificationEntityType(assignment.entityType);

    // Build full URL
    const fullUrl = assignment.entityUrl.startsWith("http")
      ? assignment.entityUrl
      : `${baseUrl}${assignment.entityUrl.startsWith("/") ? "" : "/"}${assignment.entityUrl}`;

    // Build entity context HTML for email
    const entityContextHtml = buildEntityContextHtml(entityContext);

    await sendInAppNotification(
      organizationId,
      {
        user_id: assigneeId,
        type: notificationType,
        title: `Assigned as ${assignment.roleType}`,
        message: `${assignerName} assigned you as ${assignment.roleType} for ${displayEntityType}: ${assignment.entityName}`,
        entity_type: notificationEntityType,
        entity_id: assignment.entityId,
        entity_name: assignment.entityName,
        action_url: assignment.entityUrl,
      },
      true,
      {
        template: EMAIL_TEMPLATES.ASSIGNMENT_NOTIFICATION,
        subject: `You've been assigned as ${assignment.roleType}: ${assignment.entityName}`,
        variables: {
          recipient_name: assignee.name || "User",
          assigner_name: assignerName,
          role_type: assignment.roleType,
          entity_type: displayEntityType,
          entity_name: assignment.entityName,
          entity_url: fullUrl,
          assignment_date: formatAssignmentDate(),
          role_description: getRoleDescription(assignment.roleType),
          entity_context_html: entityContextHtml,
        },
      }
    );

    console.log(`📧 Assignment notification sent to user ${assigneeId} as ${assignment.roleType} for ${assignment.entityType} ${assignment.entityId}`);
  } catch (error) {
    console.error(`Failed to send assignment notification to user ${assigneeId}:`, error);
    // Don't rethrow - notifications should not break the main flow
  }
};
