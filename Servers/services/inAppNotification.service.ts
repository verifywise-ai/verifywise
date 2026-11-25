import redisClient from "../database/redis";
import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import logger from "../utils/logger/fileLogger";
import { escapeHtml } from "../utils/sanitization.utils";
import { emailColorTokens } from "../tools/emailColors";
import { createNotificationQuery, createBulkNotificationsQuery } from "../utils/notification.utils";
import {
  ICreateNotification,
  IBulkNotification,
  INotificationJSON,
  NotificationType,
  NotificationEntityType,
  IEmailNotificationConfig,
  IInAppNotificationInput,
} from "../domain.layer/interfaces/i.notification";
import { notificationService } from "./notificationService";
import { EMAIL_TEMPLATES } from "../constants/emailTemplates";
import { translate, type SupportedLang } from "../utils/i18n.utils";
import { getUserLanguage } from "../utils/userPreference.utils";
import { deadlineNoticeKey } from "../utils/deadline.utils";
import { formatReviewDate } from "../utils/policyReviewDate.utils";
import { incidentPagePath } from "../utils/incidentLinks.utils";
import { approvalLinkedEntity, approvalRequestPath } from "../utils/approvalLinks.utils";

/**
 * Build a frontend-compatible URL for a given entity type and id.
 * The frontend routes don't all follow a single `/:entityType/:id` pattern,
 * so each entity type is mapped to the actual route that exists.
 */
export const buildEntityUrl = (entityType: NotificationEntityType, entityId: number): string => {
  switch (entityType) {
    case NotificationEntityType.TASK:
      return `/tasks?taskId=${entityId}`;
    case NotificationEntityType.TRAINING:
      return `/training?trainingId=${entityId}`;
    case NotificationEntityType.VENDOR:
      return `/vendors?vendorId=${entityId}`;
    case NotificationEntityType.POLICY:
      return `/policies/${entityId}/edit`;
    case NotificationEntityType.USE_CASE:
    case NotificationEntityType.PROJECT:
      return `/project-view?projectId=${entityId}`;
    case NotificationEntityType.MODEL:
      return `/model-inventory/models/${entityId}`;
    case NotificationEntityType.RISK:
      return `/risk-management?riskId=${entityId}`;
    case NotificationEntityType.ASSESSMENT:
      return `/project-view?projectId=${entityId}`;
    case NotificationEntityType.FILE:
      return `/file-manager?fileId=${entityId}`;
    case NotificationEntityType.EVIDENCE:
      return `/model-inventory/evidence-hub?evidenceId=${entityId}`;
    case NotificationEntityType.SHADOW_AI_TOOL:
      return `/shadow-ai/tools/${entityId}`;
    case NotificationEntityType.AI_GATEWAY:
      return `/ai-gateway/settings`;
    case NotificationEntityType.AI_DETECTION_SCAN:
      return `/ai-detection/scans/${entityId}`;
    case NotificationEntityType.COMMENT:
    case NotificationEntityType.USER:
    default:
      return `/overview`;
  }
};

/** The email subject: fixed text, or its key translated into `lang`. */
const emailSubject = (config: IEmailNotificationConfig, lang: string | undefined): string =>
  config.subjectKey !== undefined
    ? translate(lang, config.subjectKey, config.subjectVars)
    : config.subject;

/**
 * Resolve the title/message keys of a notification into the recipient's
 * language. The language is read at most once: from `input.lang` when the
 * caller already has it, otherwise from the recipient's saved preference, and
 * only when something is keyed.
 */
const localizeNotification = async (
  input: IInAppNotificationInput,
  emailConfig: IEmailNotificationConfig | undefined,
): Promise<{ notification: ICreateNotification; lang: string | undefined }> => {
  const {
    lang: givenLang,
    title,
    titleKey,
    titleVars,
    message,
    messageKey,
    messageVars,
    ...rest
  } = input;
  const keyed =
    titleKey !== undefined || messageKey !== undefined || emailConfig?.subjectKey !== undefined;
  const lang = givenLang ?? (keyed ? await getUserLanguage(input.user_id) : undefined);
  return {
    lang,
    notification: {
      ...rest,
      title: titleKey !== undefined ? translate(lang, titleKey, titleVars) : title,
      message: messageKey !== undefined ? translate(lang, messageKey, messageVars) : message,
    },
  };
};

/** Publish a stored notification to Redis for real-time (SSE) delivery. */
export const publishInAppNotification = async (
  organizationId: number,
  stored: INotificationJSON,
): Promise<void> => {
  await redisClient.publish(
    "in-app-notifications",
    JSON.stringify({
      organizationId,
      userId: stored.user_id,
      notification: stored,
      timestamp: new Date().toISOString(),
    }),
  );
};

/**
 * Send a notification to a user via both in-app storage and real-time SSE
 * Optionally also sends an email notification. Keyed title, message and
 * subject are translated into the recipient's saved language.
 */
export const sendInAppNotification = async (
  organizationId: number,
  input: IInAppNotificationInput,
  sendEmailNotification?: boolean,
  emailConfig?: IEmailNotificationConfig,
): Promise<INotificationJSON> => {
  try {
    const { notification, lang } = await localizeNotification(
      input,
      sendEmailNotification ? emailConfig : undefined,
    );

    // 1. Store notification in database
    const storedNotification = await createNotificationQuery(notification, organizationId);

    // 2. Publish to Redis for real-time delivery
    await publishInAppNotification(organizationId, storedNotification);

    logger.info(
      `📤 In-app notification sent to user ${notification.user_id}: ${notification.title}`,
    );

    // 3. Optionally send email notification using existing NotificationService (with rate limiting)
    if (sendEmailNotification && emailConfig) {
      try {
        // Get user email
        const user = await getUserEmail(notification.user_id);
        if (user?.email) {
          await notificationService.sendEmailWithTemplate(
            user.email,
            emailSubject(emailConfig, lang),
            emailConfig.template,
            emailConfig.variables,
          );
          logger.info(`📧 Email notification sent to ${user.email}`);
        }
      } catch (emailError) {
        logger.error(
          `Failed to send email notification: ${emailError instanceof Error ? emailError.message : String(emailError)}`,
        );
        // Don't fail the whole notification if email fails
      }
    }

    return storedNotification;
  } catch (error) {
    logger.error(
      `❌ Error sending in-app notification: ${error instanceof Error ? error.message : String(error)}`,
    );
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
  emailConfig?: IEmailNotificationConfig,
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
        }),
      );
    }

    logger.info(`📤 Bulk notifications sent to ${bulk.user_ids.length} users: ${bulk.title}`);

    // 3. Optionally send email notifications using existing NotificationService (with rate limiting)
    if (sendEmailNotification && emailConfig) {
      const users = await getUserEmails(bulk.user_ids);
      for (const user of users) {
        try {
          const lang =
            emailConfig.subjectKey !== undefined ? await getUserLanguage(user.id) : undefined;
          await notificationService.sendEmailWithTemplate(
            user.email,
            emailSubject(emailConfig, lang),
            emailConfig.template,
            {
              ...emailConfig.variables,
              recipient_name: `${user.name} ${user.surname}`,
            },
          );
        } catch (emailError) {
          logger.error(
            `Failed to send email to ${user.email}: ${emailError instanceof Error ? emailError.message : String(emailError)}`,
          );
        }
      }
    }

    return storedNotifications;
  } catch (error) {
    logger.error(
      `❌ Error sending bulk notifications: ${error instanceof Error ? error.message : String(error)}`,
    );
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
    incident: "Incident",
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
  organizationId: number,
): Promise<string | null> {
  switch (entityType) {
    case "vendor":
      return `${baseUrl}/vendors?vendorId=${entityId}`;
    case "model":
      return `${baseUrl}/model-inventory?modelId=${entityId}`;
    case "policy":
      return `${baseUrl}/policies?policyId=${entityId}`;
    case "incident":
      return `${baseUrl}${incidentPagePath(entityId)}`;

    case "nist_subcategory": {
      // Get function type and category info for NIST - join with struct tables
      const result = await sequelize.query<{ func_type: string; category_struct_id: number }>(
        `SELECT ss.function as func_type, cs.id as category_struct_id
         FROM nist_ai_rmf_subcategories s
         JOIN nist_ai_rmf_subcategories_struct ss ON s.subcategory_meta_id = ss.id
         JOIN nist_ai_rmf_categories_struct cs ON ss.category_struct_id = cs.id
         WHERE s.organization_id = :organizationId AND s.id = :entityId`,
        { replacements: { organizationId, entityId }, type: QueryTypes.SELECT },
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
        { replacements: { organizationId, entityId }, type: QueryTypes.SELECT },
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
        { replacements: { organizationId, entityId }, type: QueryTypes.SELECT },
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
        { replacements: { organizationId, entityId }, type: QueryTypes.SELECT },
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
        { replacements: { organizationId, entityId }, type: QueryTypes.SELECT },
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
        { replacements: { organizationId, entityId }, type: QueryTypes.SELECT },
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
        { replacements: { organizationId, entityId }, type: QueryTypes.SELECT },
      );
      if (result[0]) {
        return `${baseUrl}/project-view?projectId=${result[0].project_id}&tab=frameworks&framework=eu-ai-act&subtab=compliance&controlId=${result[0].control_id}&subControlId=${entityId}`;
      }
      return null;
    }

    case "eu_assessment": {
      // EU AI Act assessment - need project_id, question_id, and topic_id for navigation
      // Frontend uses topicId to select tab and questionId to scroll to question
      const result = await sequelize.query<{
        project_id: number;
        question_id: number;
        topic_id: number;
      }>(
        `SELECT pf.project_id, ae.question_id, st.topic_id
         FROM answers_eu ae
         JOIN assessments a ON ae.assessment_id = a.id AND a.organization_id = ae.organization_id
         JOIN projects_frameworks pf ON a.projects_frameworks_id = pf.id AND pf.organization_id = a.organization_id
         JOIN questions_struct_eu q ON ae.question_id = q.id
         JOIN subtopics_struct_eu st ON q.subtopic_id = st.id
         WHERE ae.organization_id = :organizationId AND ae.id = :entityId`,
        { replacements: { organizationId, entityId }, type: QueryTypes.SELECT },
      );
      if (result[0]?.project_id && result[0]?.question_id) {
        return `${baseUrl}/project-view?projectId=${result[0].project_id}&tab=frameworks&framework=eu-ai-act&subtab=assessment&topicId=${result[0].topic_id}&questionId=${result[0].question_id}`;
      }
      return null;
    }

    case "iso42001_assessment": {
      // ISO 42001 assessment - need project_id, question_id, and topic_id for navigation
      // Frontend uses topicId to select tab and questionId to scroll to question
      const result = await sequelize.query<{
        project_id: number;
        question_id: number;
        topic_id: number;
      }>(
        `SELECT pf.project_id, ai.question_id, st.topic_id
         FROM answers_iso ai
         JOIN assessments a ON ai.assessment_id = a.id AND a.organization_id = ai.organization_id
         JOIN projects_frameworks pf ON a.projects_frameworks_id = pf.id AND pf.organization_id = a.organization_id
         JOIN questions_struct_iso q ON ai.question_id = q.id
         JOIN subtopics_struct_iso st ON q.subtopic_id = st.id
         WHERE ai.organization_id = :organizationId AND ai.id = :entityId`,
        { replacements: { organizationId, entityId }, type: QueryTypes.SELECT },
      );
      if (result[0]?.project_id && result[0]?.question_id) {
        return `${baseUrl}/project-view?projectId=${result[0].project_id}&tab=frameworks&framework=iso-42001&subtab=assessment&topicId=${result[0].topic_id}&questionId=${result[0].question_id}`;
      }
      return null;
    }

    case "iso27001_assessment": {
      // ISO 27001 assessment - need project_id, question_id, and topic_id for navigation
      // Frontend uses topicId to select tab and questionId to scroll to question
      const result = await sequelize.query<{
        project_id: number;
        question_id: number;
        topic_id: number;
      }>(
        `SELECT pf.project_id, ai.question_id, st.topic_id
         FROM answers_iso27001 ai
         JOIN assessments a ON ai.assessment_id = a.id AND a.organization_id = ai.organization_id
         JOIN projects_frameworks pf ON a.projects_frameworks_id = pf.id AND pf.organization_id = a.organization_id
         JOIN questions_struct_iso27001 q ON ai.question_id = q.id
         JOIN subtopics_struct_iso27001 st ON q.subtopic_id = st.id
         WHERE ai.organization_id = :organizationId AND ai.id = :entityId`,
        { replacements: { organizationId, entityId }, type: QueryTypes.SELECT },
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
  organizationId: number,
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
      logger.error(
        `Failed to build URL for ${link.entity_type}:${link.entity_id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // This table goes into a raw-HTML slot, so user text is escaped here.
    const nameHtml = url
      ? `<a href="${escapeHtml(url)}" style="color: ${emailColorTokens.colorBrandPrimary}; text-decoration: none; font-weight: 500;">${escapeHtml(displayName)}</a>`
      : `<span style="font-weight: 500;">${escapeHtml(displayName)}</span>`;

    linkRows.push(
      `<tr><td style="color: ${emailColorTokens.colorTextIcon}; padding: 4px 0; font-size: 13px; vertical-align: top;">${escapeHtml(typeLabel)}:</td><td style="color: ${emailColorTokens.colorTextSecondary}; padding: 4px 0 4px 8px; font-size: 13px;">${nameHtml}</td></tr>`,
    );
  }

  return `<table style="width: 100%; margin: 16px 0;"><tr><td colspan="2" style="color: ${emailColorTokens.colorTextSecondary}; font-weight: 500; padding-bottom: 8px;">Items to complete:</td></tr>${linkRows.join("")}</table>`;
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
  baseUrl: string,
): Promise<void> => {
  const assignee = await getUserById(assigneeId);

  // Build entity links HTML for email (async - queries DB for parent context)
  const entityLinksHtml = await buildEntityLinksHtml(
    baseUrl,
    task.entity_links || [],
    organizationId,
  );

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
    },
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
  baseUrl: string,
): Promise<void> => {
  const assignee = await getUserById(assigneeId);

  // Build entity links HTML for email (async - queries DB for parent context)
  const entityLinksHtml = await buildEntityLinksHtml(
    baseUrl,
    task.entity_links || [],
    organizationId,
  );

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
    },
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
  baseUrl: string,
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
      action_url: buildEntityUrl(entity.type, entity.id),
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
        review_url: `${baseUrl}${buildEntityUrl(entity.type, entity.id)}`,
      },
    },
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
  baseUrl: string,
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
      action_url: buildEntityUrl(entity.type, entity.id),
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
        entity_url: `${baseUrl}${buildEntityUrl(entity.type, entity.id)}`,
      },
    },
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
  baseUrl: string,
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
      action_url: buildEntityUrl(entity.type, entity.id),
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
        entity_url: `${baseUrl}${buildEntityUrl(entity.type, entity.id)}`,
      },
    },
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
  baseUrl: string,
  /**
   * The request's entity (`useCase.id` is the approval request id). A use
   * case links to its page; a policy, or anything without a page, links to
   * the approval workflows page opened on the request (the same
   * `/approval-workflows?request=<id>` link the Home queue uses), where the
   * approver decides.
   */
  entity?: { type: string; id: number },
): Promise<void> => {
  const approver = await getUserById(approverId);

  const linked = approvalLinkedEntity(entity?.type, entity?.id);
  const actionUrl =
    linked?.type === NotificationEntityType.USE_CASE
      ? buildEntityUrl(linked.type, linked.id)
      : approvalRequestPath(useCase.id);

  await sendInAppNotification(
    organizationId,
    {
      user_id: approverId,
      type: NotificationType.APPROVAL_REQUESTED,
      title: `Approval requested - Step ${useCase.stepNumber}`,
      message: `${requesterName} needs your approval for: ${useCase.name}`,
      entity_type: linked?.type,
      entity_id: linked?.id,
      entity_name: useCase.name,
      action_url: actionUrl,
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
        approval_url: `${baseUrl}${actionUrl}`,
      },
    },
  );
};

/**
 * Notify approval complete
 */
export const notifyApprovalComplete = async (
  organizationId: number,
  requesterId: number,
  /** `id` is the approval request id; the item's own id is `entityId`. */
  useCase: {
    id: number;
    name: string;
    totalSteps: number;
  },
  baseUrl: string,
  /**
   * Optional entity_type from the approval_requests row so the title /
   * message / action_url can match the actual artifact (model, risk,
   * AI action, etc.) instead of always saying "Use case fully approved".
   * Falls back to the use-case wording for backward compat with callers
   * that don't pass it.
   */
  entityType?: string,
  /** approval_requests.entity_id, for entity types whose link needs it (policy). */
  entityId?: number,
): Promise<void> => {
  const requester = await getUserById(requesterId);

  // Map approval_requests.entity_type → user-facing label + action url.
  // Keep this as a small flat map; if more entity types start using the
  // approval workflow, just add a row here.
  const labelFor = (
    et?: string,
  ): { label: string; entity: NotificationEntityType; url: string; entityId?: number } => {
    switch (et) {
      case "policy":
        if (entityId) {
          return {
            label: "Policy",
            entity: NotificationEntityType.POLICY,
            url: buildEntityUrl(NotificationEntityType.POLICY, entityId),
            entityId,
          };
        }
        return {
          label: "Policy",
          entity: NotificationEntityType.POLICY,
          url: `/policies`,
        };
      case "ai_action":
        return {
          label: "AI action",
          entity: NotificationEntityType.AI_ACTION,
          url: approvalRequestPath(useCase.id),
        };
      case "model_inventory":
      case "model":
        return {
          label: "Model",
          entity: NotificationEntityType.MODEL,
          url: `/model-inventory`,
        };
      case "risk":
        return {
          label: "Risk",
          entity: NotificationEntityType.RISK,
          url: `/risk-management`,
        };
      case "vendor":
        return {
          label: "Vendor",
          entity: NotificationEntityType.VENDOR,
          url: `/vendors`,
        };
      case "use_case":
      default:
        // useCase.id is the request id: link the use case itself when its id
        // is known, otherwise the request.
        if (entityId) {
          return {
            label: "Use case",
            entity: NotificationEntityType.USE_CASE,
            url: buildEntityUrl(NotificationEntityType.USE_CASE, entityId),
            entityId,
          };
        }
        return {
          label: "Use case",
          entity: NotificationEntityType.USE_CASE,
          url: approvalRequestPath(useCase.id),
        };
    }
  };

  const { label, entity, url, entityId: linkedId } = labelFor(entityType);

  await sendInAppNotification(
    organizationId,
    {
      user_id: requesterId,
      type: NotificationType.APPROVAL_COMPLETE,
      title: `${label} fully approved`,
      message: `Your ${label.toLowerCase()} "${useCase.name}" has been fully approved`,
      entity_type: entity,
      entity_id: linkedId,
      entity_name: useCase.name,
      action_url: url,
    },
    true,
    {
      template: EMAIL_TEMPLATES.APPROVAL_COMPLETE,
      subject: `Approved: ${useCase.name}`,
      variables: {
        requester_name: requester ? `${requester.name}` : "User",
        use_case_name: useCase.name,
        total_steps: String(useCase.totalSteps),
        use_case_url: `${baseUrl}${url}`,
      },
    },
  );
};

/**
 * Notify requester that their request was auto-approved by risk level
 */
export const notifyApprovalAutoApproved = async (
  organizationId: number,
  requesterId: number,
  useCase: {
    id: number;
    name: string;
  },
  riskLevel: string,
  threshold: string,
  baseUrl: string,
  /** The use case's own id; `useCase.id` is the approval request id. */
  useCaseId?: number | null,
): Promise<void> => {
  const requester = await getUserById(requesterId);
  const url = useCaseId
    ? buildEntityUrl(NotificationEntityType.USE_CASE, useCaseId)
    : approvalRequestPath(useCase.id);

  await sendInAppNotification(
    organizationId,
    {
      user_id: requesterId,
      type: NotificationType.APPROVAL_AUTO_APPROVED,
      title: "Use case auto-approved",
      message: `Your use case "${useCase.name}" was auto-approved: risk level "${riskLevel}" is at or below the workflow threshold "${threshold}"`,
      entity_type: NotificationEntityType.USE_CASE,
      entity_id: useCaseId ?? undefined,
      entity_name: useCase.name,
      action_url: url,
      metadata: { auto_approved: true, risk_level: riskLevel, threshold },
    },
    true,
    {
      template: EMAIL_TEMPLATES.APPROVAL_COMPLETE,
      subject: `Approved: ${useCase.name}`,
      variables: {
        requester_name: requester ? `${requester.name}` : "User",
        use_case_name: useCase.name,
        total_steps: "0",
        use_case_url: `${baseUrl}${url}`,
      },
    },
  );
};

/**
 * Notify the designated escalation user that an approval step is overdue
 */
export const notifyApprovalStepOverdueEscalation = async (
  organizationId: number,
  escalationUserId: number,
  request: {
    id: number;
    name: string;
    stepName: string;
    stepNumber: number;
    dueAt: Date;
  },
  baseUrl: string,
): Promise<void> => {
  const escalationUser = await getUserById(escalationUserId);
  // The in-app row is in the recipient's language, dates included; the email
  // body stays English.
  const lang = await getUserLanguage(escalationUserId);
  const dueTextIn = (locale: string) =>
    request.dueAt.toLocaleString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });
  const dueText = dueTextIn("en-US");

  await sendInAppNotification(
    organizationId,
    {
      user_id: escalationUserId,
      lang,
      type: NotificationType.APPROVAL_STEP_OVERDUE_ESCALATION,
      titleKey: "Approval step overdue",
      messageKey: 'Step "{stepName}" of "{name}" was due {due} and has been escalated to you',
      messageVars: {
        stepName: request.stepName,
        name: request.name,
        due: dueTextIn(DATE_LOCALES[lang]),
      },
      entity_type: NotificationEntityType.USE_CASE,
      entity_id: request.id,
      entity_name: request.name,
      action_url: "/approval-workflows",
      metadata: {
        step_number: request.stepNumber,
        due_at: request.dueAt.toISOString(),
      },
    },
    true,
    {
      template: EMAIL_TEMPLATES.APPROVAL_STEP_OVERDUE,
      subjectKey: "Overdue approval escalated: {name}",
      subjectVars: { name: request.name },
      variables: {
        escalation_user_name: escalationUser ? `${escalationUser.name}` : "there",
        request_name: request.name,
        step_name: request.stepName,
        step_number: String(request.stepNumber),
        due_at: dueText,
        approval_url: `${baseUrl}/approval-workflows`,
      },
    },
  );
};

/**
 * Remind a vendor's reviewer (or assignee) that its review is due. Title,
 * message and subject are keyed and reach the recipient in their language;
 * the email body stays English.
 *
 * @param vendor.reviewDate - The review day formatted in English, for the email.
 * @param vendor.reviewDay - The stored review date; the in-app message
 *   formats it in the recipient's locale (its UTC day). Falls back to
 *   reviewDate when absent or invalid.
 */
export const notifyVendorReviewDue = async (
  organizationId: number,
  reviewerId: number,
  vendor: {
    id: number;
    name: string;
    reviewDate: string;
    reviewDay?: Date | string | null;
    riskLevel: string;
    lastReviewDate?: string;
    projectCount: number;
  },
  baseUrl: string,
): Promise<void> => {
  const reviewer = await getUserById(reviewerId);
  const lang = await getUserLanguage(reviewerId);
  const day = vendor.reviewDay ? new Date(vendor.reviewDay) : null;
  const localDate =
    day && !Number.isNaN(day.getTime())
      ? day.toLocaleDateString(DATE_LOCALES[lang], { dateStyle: "long", timeZone: "UTC" })
      : vendor.reviewDate;

  await sendInAppNotification(
    organizationId,
    {
      user_id: reviewerId,
      lang,
      type: NotificationType.VENDOR_REVIEW_DUE,
      titleKey: "Vendor review due",
      messageKey: 'The review of vendor "{name}" is due on {date}.',
      messageVars: { name: vendor.name, date: localDate },
      entity_type: NotificationEntityType.VENDOR,
      entity_id: vendor.id,
      entity_name: vendor.name,
      action_url: buildEntityUrl(NotificationEntityType.VENDOR, vendor.id),
    },
    true,
    {
      template: EMAIL_TEMPLATES.VENDOR_REVIEW_DUE,
      subjectKey: "Vendor review due: {name}",
      subjectVars: { name: vendor.name },
      variables: {
        reviewer_name: reviewer ? `${reviewer.name}` : "Reviewer",
        vendor_name: vendor.name,
        review_date: vendor.reviewDate,
        risk_level: vendor.riskLevel,
        last_review_date: vendor.lastReviewDate || "Never",
        project_count: String(vendor.projectCount),
        vendor_url: `${baseUrl}${buildEntityUrl(NotificationEntityType.VENDOR, vendor.id)}`,
      },
    },
  );
};

/** Marks the in-app rows of the critical incident escalation (metadata.workflow_action). */
export const CRITICAL_INCIDENT_ESCALATION_ACTION = "incident_critical_escalation";

/** An incident severity in `lang`; an unknown value is returned as stored. */
export const incidentSeverityLabel = (lang: string | undefined, severity: string): string => {
  switch (severity) {
    case "Minor":
      return translate(lang, "Minor");
    case "Serious":
      return translate(lang, "Serious");
    case "Very serious":
      return translate(lang, "Very serious");
    default:
      return severity;
  }
};

/** What reaching one Admin about a critical incident consists of. */
export interface CriticalIncidentEscalation {
  /** The in-app row, already in the Admin's language. */
  notification: ICreateNotification;
  /** The email; `to` is null when the Admin has no address. */
  email: {
    to: string | null;
    subject: string;
    template: string;
    variables: Record<string, string>;
  };
}

/**
 * Builds the notice that a critical incident needs a response, for one
 * Admin: an in-app row (system type, linked to the incident) and an email.
 * Title, message, subject and the severity label are in the Admin's
 * language; the email body stays English. Nothing is stored or sent: the
 * incident response workflow stores the row as its claim and delivers it
 * after commit (see notifyAdminsOfCriticalIncident). The row's metadata names
 * the run and the incident.
 */
export const buildCriticalIncidentEscalation = async (
  adminId: number,
  incident: {
    id: number;
    reference: string;
    useCase: string;
    severity: string;
    type: string;
    ownerName?: string | null;
  },
  workflowRunId: number,
  baseUrl: string,
): Promise<CriticalIncidentEscalation> => {
  const lang = await getUserLanguage(adminId);
  const admin = await getUserById(adminId);
  const actionUrl = incidentPagePath(incident.id);
  return {
    notification: {
      user_id: adminId,
      type: NotificationType.SYSTEM,
      title: translate(lang, "Critical incident needs a response"),
      message: translate(lang, 'Incident {reference} in "{useCase}" was rated {severity}.', {
        reference: incident.reference,
        useCase: incident.useCase,
        severity: incidentSeverityLabel(lang, incident.severity),
      }),
      entity_name: incident.reference,
      action_url: actionUrl,
      metadata: {
        workflow_action: CRITICAL_INCIDENT_ESCALATION_ACTION,
        workflow_run_id: workflowRunId,
        incident_id: incident.id,
      },
    },
    email: {
      to: admin?.email || null,
      subject: translate(lang, "Critical incident: {reference}", {
        reference: incident.reference,
      }),
      template: EMAIL_TEMPLATES.INCIDENT_CRITICAL_ESCALATION,
      variables: {
        admin_name: admin?.name ? `${admin.name}` : "Admin",
        incident_reference: incident.reference,
        use_case: incident.useCase,
        severity: incident.severity,
        incident_type: incident.type,
        owner_name: incident.ownerName || "No owner",
        incident_url: `${baseUrl}${actionUrl}`,
      },
    },
  };
};

/**
 * "due on 12 Sep" / "3 days overdue" — shared by both deadline notifiers.
 * English unless a language is passed: the email template is English, so only
 * the in-app row is worded for the recipient.
 */
const deadlineDistanceText = (deadline: Date, lang: SupportedLang = "en"): string => {
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
  if (daysLeft > 1) return translate(lang, "in {days} days", { days: daysLeft });
  if (daysLeft === 1) return translate(lang, "tomorrow");
  if (daysLeft === 0) return translate(lang, "today");
  return translate(lang, "{days} days overdue", { days: -daysLeft });
};

const DATE_LOCALES: Record<SupportedLang, string> = { en: "en-US", de: "de-DE", fr: "fr-FR" };

const deadlineDateText = (deadline: Date, lang: SupportedLang = "en"): string =>
  deadline.toLocaleDateString(DATE_LOCALES[lang], {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

/**
 * Notify one recipient that a project risk's deadline is approaching.
 * In-app + email (email skippable via sendEmail=false for legs that only need
 * the in-app row as their dedup record). The in-app row's metadata carries
 * threshold_days and the deadline it was sent for — without them the notice
 * would re-send every night forever, or never re-arm after a reschedule.
 */
export const notifyRiskDeadlineDueSoon = async (
  organizationId: number,
  recipientId: number,
  risk: { id: number; name: string; deadline: Date },
  thresholdDays: number,
  baseUrl: string,
  sendEmail = true,
): Promise<void> => {
  const recipient = await getUserById(recipientId);
  const lang = await getUserLanguage(recipientId);
  const distance = deadlineDistanceText(risk.deadline);

  await sendInAppNotification(
    organizationId,
    {
      user_id: recipientId,
      lang,
      type: NotificationType.RISK_DEADLINE_DUE_SOON,
      title: translate(lang, "Risk deadline approaching"),
      message: translate(lang, 'Risk "{name}" is due {distance} ({date}).', {
        name: risk.name,
        distance: deadlineDistanceText(risk.deadline, lang),
        date: deadlineDateText(risk.deadline, lang),
      }),
      entity_type: NotificationEntityType.RISK,
      entity_id: risk.id,
      entity_name: risk.name,
      action_url: buildEntityUrl(NotificationEntityType.RISK, risk.id),
      metadata: { threshold_days: thresholdDays, deadline: deadlineNoticeKey(risk.deadline) },
    },
    sendEmail,
    sendEmail
      ? {
          template: EMAIL_TEMPLATES.RISK_DEADLINE_DUE,
          subjectKey: "Risk deadline approaching: {name}",
          subjectVars: { name: risk.name },
          variables: {
            recipient_name: recipient ? `${recipient.name}` : "there",
            entity_kind: "Risk",
            entity_name: risk.name,
            deadline_label: "Deadline",
            deadline_date: deadlineDateText(risk.deadline),
            days_text: distance,
            entity_url: `${baseUrl}${buildEntityUrl(NotificationEntityType.RISK, risk.id)}`,
          },
        }
      : undefined,
  );
};

/**
 * Notify one recipient that a model risk's target date is approaching.
 * Same shape as notifyRiskDeadlineDueSoon, except the action URL: entity_id
 * is the MODEL-RISK id (that granularity is what the dedup needs — two risks
 * on one model must each produce a notice), while the URL must point at the
 * MODEL, built from model_risks.model_id. Do not "fix" the disagreement by
 * feeding the model-risk id to buildEntityUrl(MODEL, …) — that links to a
 * model that does not exist. model_id is nullable: fall back to the list.
 */
export const notifyModelRiskDueSoon = async (
  organizationId: number,
  recipientId: number,
  modelRisk: { id: number; name: string; deadline: Date; model_id: number | null },
  thresholdDays: number,
  baseUrl: string,
  sendEmail = true,
): Promise<void> => {
  const recipient = await getUserById(recipientId);
  const lang = await getUserLanguage(recipientId);
  const distance = deadlineDistanceText(modelRisk.deadline);
  const modelPath =
    modelRisk.model_id != null
      ? `/model-inventory/models/${modelRisk.model_id}`
      : `/model-inventory`;

  await sendInAppNotification(
    organizationId,
    {
      user_id: recipientId,
      lang,
      type: NotificationType.MODEL_RISK_DUE_SOON,
      title: translate(lang, "Model risk target date approaching"),
      message: translate(lang, 'Model risk "{name}" is due {distance} ({date}).', {
        name: modelRisk.name,
        distance: deadlineDistanceText(modelRisk.deadline, lang),
        date: deadlineDateText(modelRisk.deadline, lang),
      }),
      entity_type: NotificationEntityType.MODEL,
      entity_id: modelRisk.id,
      entity_name: modelRisk.name,
      action_url: modelPath,
      metadata: {
        threshold_days: thresholdDays,
        deadline: deadlineNoticeKey(modelRisk.deadline),
      },
    },
    sendEmail,
    sendEmail
      ? {
          template: EMAIL_TEMPLATES.RISK_DEADLINE_DUE,
          subjectKey: "Model risk target date approaching: {name}",
          subjectVars: { name: modelRisk.name },
          variables: {
            recipient_name: recipient ? `${recipient.name}` : "there",
            entity_kind: "Model risk",
            entity_name: modelRisk.name,
            deadline_label: "Target date",
            deadline_date: deadlineDateText(modelRisk.deadline),
            days_text: distance,
            entity_url: `${baseUrl}${modelPath}`,
          },
        }
      : undefined,
  );
};

/**
 * Remind a policy's owner or reviewer that its review is due soon or overdue
 * (P-H3, P-M2). The in-app notice is the channel of record: it is stored
 * first, and a failure to store it rejects, so the sweep leaves the policy
 * unstamped and retries it the next day. The email is best-effort:
 * sendInAppNotification logs and swallows its failure (e.g. no email
 * configured, or no address), so it never blocks the reminder. Title,
 * message and subject are keyed and reach the recipient in their language;
 * the email body stays English.
 *
 * @param policy.reviewDate - The review day, "YYYY-MM-DD".
 */
export const notifyPolicyReviewReminder = async (
  organizationId: number,
  userId: number,
  policy: { id: number; title: string; reviewDate: string },
  kind: "due_soon" | "overdue",
  baseUrl: string,
): Promise<void> => {
  const user = await getUserById(userId);
  const overdue = kind === "overdue";
  const titleKey = overdue ? "Policy review overdue" : "Policy review due soon";
  const messageKey = overdue
    ? 'The review of policy "{title}" was due on {date}. Please review it as soon as you can.'
    : 'The review of policy "{title}" is due on {date}.';
  const subjectKey = overdue ? "Policy review overdue: {title}" : "Policy review due soon: {title}";
  const policyPath = buildEntityUrl(NotificationEntityType.POLICY, policy.id);
  const reviewDate = formatReviewDate(policy.reviewDate);

  await sendInAppNotification(
    organizationId,
    {
      user_id: userId,
      lang: await getUserLanguage(userId),
      type: overdue ? NotificationType.POLICY_OVERDUE : NotificationType.POLICY_DUE_SOON,
      titleKey,
      messageKey,
      messageVars: { title: policy.title, date: reviewDate },
      entity_type: NotificationEntityType.POLICY,
      entity_id: policy.id,
      entity_name: policy.title,
      action_url: policyPath,
    },
    true,
    {
      template: EMAIL_TEMPLATES.POLICY_REVIEW_REMINDER,
      subjectKey,
      subjectVars: { title: policy.title },
      variables: {
        reminder_title: translate("en", titleKey),
        reminder_message: translate("en", messageKey, { title: policy.title, date: reviewDate }),
        recipient_name: user?.name || "there",
        policy_name: policy.title,
        review_date: reviewDate,
        policy_url: `${baseUrl}${policyPath}`,
      },
    },
  );
};

/**
 * Notify risk owner that linked evidence has gone stale.
 *
 * In-app only: the sweep runs nightly and the flag clears itself, so email
 * would be noise. A risk with no owner is flagged but not notified — return
 * early, do not fall back to org admins.
 */
export const notifyEvidenceStale = async (
  organizationId: number,
  risk: {
    id: number;
    risk_name: string;
    risk_owner: number | null;
  },
): Promise<void> => {
  if (risk.risk_owner == null) return;
  const lang = await getUserLanguage(risk.risk_owner);

  await sendInAppNotification(
    organizationId,
    {
      user_id: risk.risk_owner,
      type: NotificationType.EVIDENCE_STALE,
      title: translate(lang, "Evidence stale"),
      message: translate(lang, 'Risk "{name}" has stale linked evidence. Review and refresh it.', {
        name: risk.risk_name,
      }),
      entity_type: NotificationEntityType.RISK,
      entity_id: risk.id,
      entity_name: risk.risk_name,
      action_url: buildEntityUrl(NotificationEntityType.RISK, risk.id),
    },
    false,
  );
};

/**
 * Notify risk owner that a parent risk's level moved and the inherited level
 * may now be stale. In-app only, same shape as notifyEvidenceStale: the sweep
 * keeps retrying until it stamps the link, so a null owner is the only skip.
 */
export const notifyParentLevelChanged = async (
  organizationId: number,
  risk: {
    id: number;
    risk_name: string;
    risk_owner: number | null;
  },
): Promise<void> => {
  if (risk.risk_owner == null) return;
  const lang = await getUserLanguage(risk.risk_owner);

  await sendInAppNotification(
    organizationId,
    {
      user_id: risk.risk_owner,
      type: NotificationType.RISK_INHERITANCE_STALE,
      title: translate(lang, "Inherited risk level may be stale"),
      message: translate(
        lang,
        'A parent risk\'s level changed, so the inherited level on "{name}" may be out of date. Review it.',
        { name: risk.risk_name },
      ),
      entity_type: NotificationEntityType.RISK,
      entity_id: risk.id,
      entity_name: risk.risk_name,
      action_url: buildEntityUrl(NotificationEntityType.RISK, risk.id),
    },
    false,
  );
};

// Named `notifyRiskOfModelCandidates`, NOT `notifyModelRiskCandidates` —
// the latter is the orchestrating service in services/riskLinks/modelCandidates.ts,
// which calls this once per risk. Two different functions; do not merge the names.
export const notifyRiskOfModelCandidates = async (
  organizationId: number,
  risk: { id: number; risk_name: string; risk_owner: number | null },
  model: { id: number; name: string },
  candidateCount: number,
  modelRiskIds: number[] = [],
): Promise<boolean> => {
  if (risk.risk_owner == null) return false;
  const lang = await getUserLanguage(risk.risk_owner);
  try {
    await sendInAppNotification(
      organizationId,
      {
        user_id: risk.risk_owner,
        type: NotificationType.MODEL_RISK_CANDIDATES,
        title: translate(lang, "New model risks to review"),
        message:
          candidateCount === 1
            ? translate(
                lang,
                'Risk "{riskName}" now shares a project with 1 model risk from "{modelName}". Review the suggested links.',
                { riskName: risk.risk_name, modelName: model.name },
              )
            : translate(
                lang,
                'Risk "{riskName}" now shares a project with {count} model risks from "{modelName}". Review the suggested links.',
                { riskName: risk.risk_name, count: candidateCount, modelName: model.name },
              ),
        entity_type: NotificationEntityType.RISK,
        entity_id: risk.id,
        entity_name: risk.risk_name,
        action_url: buildEntityUrl(NotificationEntityType.RISK, risk.id),
        // Sent-record keys: model-level for project triggers, plus the
        // announced model-risk ids for model-risk-create triggers (which must
        // survive a prior model-level notice). Sorted for stable equality.
        metadata: {
          model_inventory_id: model.id,
          model_risk_ids: [...modelRiskIds].sort((a, b) => a - b),
        },
      },
      false,
    );
    return true;
  } catch (error) {
    // Lost the race with a concurrent trigger that inserted the same notice:
    // the partial unique index turns it into a suppressed duplicate, not an
    // error. Match the constraint name so an unrelated 23505 still throws.
    const pg =
      (error as { parent?: { code?: string; constraint?: string } })?.parent ??
      (error as { original?: { code?: string; constraint?: string } })?.original;
    if (pg?.code === "23505" && pg?.constraint === "notifications_model_risk_candidates_uniq") {
      return false;
    }
    throw error;
  }
};

// Named `notifyRiskOfVendorCandidates`, NOT `notifyVendorRiskCandidates`: the
// latter is the orchestrating service in services/riskLinks/vendorCandidates.ts,
// which calls this once per risk. Mirrors notifyRiskOfModelCandidates.
export const notifyRiskOfVendorCandidates = async (
  organizationId: number,
  risk: { id: number; risk_name: string; risk_owner: number | null },
  vendor: { id: number; name: string },
  candidateCount: number,
  vendorRiskIds: number[] = [],
): Promise<boolean> => {
  if (risk.risk_owner == null) return false;
  const lang = await getUserLanguage(risk.risk_owner);
  try {
    await sendInAppNotification(
      organizationId,
      {
        user_id: risk.risk_owner,
        type: NotificationType.VENDOR_RISK_CANDIDATES,
        title: translate(lang, "Vendor risks to review"),
        message:
          candidateCount === 1
            ? translate(
                lang,
                'Risk "{riskName}" is in a use case served by "{vendorName}", which has 1 vendor risk it could inherit from. Review it from the Linked risks tab.',
                { riskName: risk.risk_name, vendorName: vendor.name },
              )
            : translate(
                lang,
                'Risk "{riskName}" is in a use case served by "{vendorName}", which has {count} vendor risks it could inherit from. Review them from the Linked risks tab.',
                { riskName: risk.risk_name, count: candidateCount, vendorName: vendor.name },
              ),
        entity_type: NotificationEntityType.RISK,
        entity_id: risk.id,
        entity_name: risk.risk_name,
        action_url: buildEntityUrl(NotificationEntityType.RISK, risk.id),
        // Sent-record keys, sorted for stable equality against the unique index.
        metadata: {
          vendor_id: vendor.id,
          vendor_risk_ids: [...vendorRiskIds].sort((a, b) => a - b),
        },
      },
      false,
    );
    return true;
  } catch (error) {
    // A concurrent trigger inserted the same notice first: a suppressed
    // duplicate, not an error. Matched by name so another 23505 still throws.
    const pg =
      (error as { parent?: { code?: string; constraint?: string } })?.parent ??
      (error as { original?: { code?: string; constraint?: string } })?.original;
    if (pg?.code === "23505" && pg?.constraint === "notifications_vendor_risk_candidates_uniq") {
      return false;
    }
    throw error;
  }
};

/**
 * Tell a vendor's assignee that an automatic research run stored `count` risk findings for the
 * vendor. In-app only. The link opens the findings of the vendor on the Research findings tab of
 * the Vendors page, not the vendor modal that buildEntityUrl(VENDOR) opens. Returns false when
 * nothing was sent: the vendor has no assignee, or this run was announced already.
 */
export const notifyAssigneeOfVendorResearch = async (
  organizationId: number,
  vendor: { id: number; name: string; assignee: number | null },
  runId: number,
  count: number,
): Promise<boolean> => {
  if (vendor.assignee == null) return false;
  const lang = await getUserLanguage(vendor.assignee);
  try {
    await sendInAppNotification(
      organizationId,
      {
        user_id: vendor.assignee,
        type: NotificationType.VENDOR_RESEARCH_FINDINGS,
        title: translate(lang, "Vendor research findings"),
        message:
          count === 1
            ? translate(
                lang,
                '{count} potential risk found for "{vendorName}". Review it in Vendors > Research findings.',
                { count, vendorName: vendor.name },
              )
            : translate(
                lang,
                '{count} potential risks found for "{vendorName}". Review them in Vendors > Research findings.',
                { count, vendorName: vendor.name },
              ),
        entity_type: NotificationEntityType.VENDOR,
        entity_id: vendor.id,
        entity_name: vendor.name,
        action_url: `/vendors/research-findings?findingsVendorId=${vendor.id}`,
        // The sent-record key is run_id, which the unique index reads.
        metadata: { run_id: runId, vendor_id: vendor.id, count },
      },
      false,
    );
    return true;
  } catch (error) {
    // The run was announced already, possibly by a concurrent attempt: a suppressed duplicate,
    // not an error. Matched by name so another 23505 still throws.
    const pg =
      (error as { parent?: { code?: string; constraint?: string } })?.parent ??
      (error as { original?: { code?: string; constraint?: string } })?.original;
    if (pg?.code === "23505" && pg?.constraint === "notifications_vendor_research_findings_uniq") {
      return false;
    }
    throw error;
  }
};

/**
 * Notify a file uploader that their file is inside the 7-day pre-expiry
 * window. Called by the daily fileExpirySweep for each row it matches; the
 * sweep writes no state back, so a re-run on the same day sends again —
 * the window itself is the dedup.
 */
export const notifyFileExpiring = async (
  organizationId: number,
  recipientId: number,
  file: {
    id: number;
    name: string;
    expiryDate: string;
    daysRemaining: number;
  },
  baseUrl: string,
): Promise<void> => {
  const recipient = await getUserById(recipientId);
  // The label is worded for the in-app row's language; the email body stays English.
  const lang = await getUserLanguage(recipientId);
  const daysRemainingIn = (l: string) =>
    file.daysRemaining <= 0
      ? translate(l, "expires today")
      : file.daysRemaining === 1
        ? translate(l, "1 day")
        : translate(l, "{days} days", { days: file.daysRemaining });
  const daysRemainingLabel = daysRemainingIn("en");

  await sendInAppNotification(
    organizationId,
    {
      user_id: recipientId,
      lang,
      type: NotificationType.FILE_EXPIRING,
      titleKey: "File expiring soon",
      messageKey: 'File "{name}" expires on {expiryDate} ({daysRemaining})',
      messageVars: {
        name: file.name,
        expiryDate: file.expiryDate,
        daysRemaining: daysRemainingIn(lang),
      },
      entity_type: NotificationEntityType.FILE,
      entity_id: file.id,
      entity_name: file.name,
      action_url: buildEntityUrl(NotificationEntityType.FILE, file.id),
    },
    true,
    {
      template: EMAIL_TEMPLATES.FILE_EXPIRING,
      subjectKey: "File expiring soon: {name}",
      subjectVars: { name: file.name },
      variables: {
        recipient_name: recipient ? `${recipient.name}` : "there",
        file_name: file.name,
        expiry_date: file.expiryDate,
        days_remaining: daysRemainingLabel,
        file_url: `${baseUrl}${buildEntityUrl(NotificationEntityType.FILE, file.id)}`,
      },
    },
  );
};

/**
 * Ask an owner to confirm a live inventory entry is still live (#5187). Sent
 * once per "still live?" period by the daily lifecycle confirmation sweep.
 * `noun` and `path` come from the entity's LifecycleEntityConfig, so AI apps
 * reuse this unchanged.
 */
// One whole-sentence title per inventory noun: translating the noun on its own
// would break gender agreement in German and French.
const LIFECYCLE_TITLE_KEYS: Record<string, string> = {
  "use case": "Is this use case still live?",
  "AI app": "Is this AI app still live?",
};

export const notifyLifecycleConfirmationDue = async (
  organizationId: number,
  recipientId: number,
  entry: {
    id: number;
    title: string;
    noun: string;
    path: string;
    entityType: NotificationEntityType;
    since: string;
    intervalDays: number;
  },
  baseUrl: string,
): Promise<void> => {
  const recipient = await getUserById(recipientId);
  const titleKey = LIFECYCLE_TITLE_KEYS[entry.noun];

  await sendInAppNotification(
    organizationId,
    {
      user_id: recipientId,
      type: NotificationType.LIFECYCLE_CONFIRMATION_DUE,
      ...(titleKey ? { titleKey } : { title: `Is this ${entry.noun} still live?` }),
      messageKey:
        '"{title}" has not been confirmed as live since {since}. Confirm it, or retire it if it is no longer in use.',
      messageVars: { title: entry.title, since: entry.since },
      entity_type: entry.entityType,
      entity_id: entry.id,
      entity_name: entry.title,
      action_url: entry.path,
    },
    true,
    {
      template: EMAIL_TEMPLATES.LIFECYCLE_CONFIRMATION_DUE,
      subjectKey: 'Is "{title}" still live?',
      subjectVars: { title: entry.title },
      variables: {
        recipient_name: recipient ? `${recipient.name}` : "there",
        entry_noun: entry.noun,
        entry_title: entry.title,
        since: entry.since,
        interval_days: String(entry.intervalDays),
        entry_url: `${baseUrl}${entry.path}`,
      },
    },
  );
};

/**
 * One summary of the AI app assessments a bulk run left for this owner (#5258).
 * Awaits the in-app row, which rejects if it can't be stored. The email joins
 * the rate-limited queue un-awaited, at about 600ms each it would otherwise
 * hold the request open, and its recipient is passed in so nothing touches the
 * database once the response has gone.
 */
export const notifyAiAppAssessmentsAssigned = async (
  organizationId: number,
  owner: { id: number; name: string; email: string },
  count: number,
  requesterName: string,
): Promise<void> => {
  const title = `${count} AI app assessment${count === 1 ? "" : "s"} to complete`;
  const actionUrl = "/ai-apps/assessments?assigned=me";

  await sendInAppNotification(organizationId, {
    user_id: owner.id,
    type: NotificationType.ASSIGNMENT_OWNER,
    title,
    message: `${requesterName} asked you to complete the risk assessment for AI apps you own.`,
    entity_type: NotificationEntityType.AI_APP,
    action_url: actionUrl,
  });

  const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  notificationService
    .sendEmailWithTemplate(owner.email, title, EMAIL_TEMPLATES.AI_APP_ASSESSMENTS_ASSIGNED, {
      summary_title: title,
      recipient_name: owner.name || "there",
      requester_name: requesterName,
      assessments_url: `${baseUrl}${actionUrl}`,
    })
    .catch((error: unknown) => {
      logger.error(
        `Failed to email owner ${owner.id} about AI app assessments: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
};

/** The page where a trainee sees and completes their assignments. */
const MY_TRAINING_PATH = "/training/my-training";

/**
 * Notify someone that a training was assigned to them (#5260). The in-app row
 * is awaited, because under RLS enforcement a query issued after the response
 * would run on the request's finished transaction. The email joins the
 * rate-limited queue un-awaited, so it cannot hold the request open or fail it.
 * `actionPath` is for callers whose recipient is not the trainee.
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
    actionPath?: string;
  },
  assignerName: string,
  baseUrl: string,
): Promise<void> => {
  const user = await getUserById(userId);
  const actionPath = training.actionPath ?? MY_TRAINING_PATH;

  await sendInAppNotification(organizationId, {
    user_id: userId,
    type: NotificationType.TRAINING_ASSIGNED,
    title: "Training assigned",
    message: `${assignerName} assigned you to training: ${training.name}`,
    entity_type: NotificationEntityType.TRAINING,
    entity_id: training.id,
    entity_name: training.name,
    action_url: actionPath,
  });

  if (!user?.email) return;
  notificationService
    .sendEmailWithTemplate(
      user.email,
      `Training assigned: ${training.name}`,
      EMAIL_TEMPLATES.TRAINING_ASSIGNED,
      {
        trainee_name: user.name,
        assigner_name: assignerName,
        training_name: training.name,
        training_description: training.description || "No description provided",
        training_duration: training.duration || "Not specified",
        training_due_date: training.dueDate || "No due date",
        training_url: `${baseUrl}${actionPath}`,
      },
    )
    .catch((error: unknown) => {
      logger.error(
        `Failed to email user ${userId} about training ${training.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
};

/**
 * Remind someone about an open training assignment (#5260). Rejects when the
 * email fails, so the sweep leaves the assignment unstamped and retries it.
 * sendInAppNotification swallows email errors, so the email is sent here, and
 * first: a retry after a failed email then adds no second in-app notice.
 */
export const notifyTrainingReminder = async (
  organizationId: number,
  userId: number,
  training: { id: number; name: string; dueDate: string },
  kind: "due_soon" | "overdue",
  baseUrl: string,
): Promise<void> => {
  const user = await getUserById(userId);
  if (!user?.email) throw new Error(`User ${userId} has no email address`);

  const overdue = kind === "overdue";
  const title = overdue ? "Training overdue" : "Training due soon";
  const message = overdue
    ? `This training was due on ${training.dueDate}. Please complete it as soon as you can.`
    : `This training is due on ${training.dueDate}.`;

  await notificationService.sendEmailWithTemplate(
    user.email,
    `${title}: ${training.name}`,
    EMAIL_TEMPLATES.TRAINING_REMINDER,
    {
      reminder_title: title,
      reminder_message: message,
      trainee_name: user.name,
      training_name: training.name,
      training_due_date: training.dueDate,
      training_url: `${baseUrl}${MY_TRAINING_PATH}`,
    },
  );

  await sendInAppNotification(organizationId, {
    user_id: userId,
    type: overdue ? NotificationType.TRAINING_OVERDUE : NotificationType.TRAINING_DUE_SOON,
    title,
    message: `${training.name}: ${message}`,
    entity_type: NotificationEntityType.TRAINING,
    entity_id: training.id,
    entity_name: training.name,
    action_url: MY_TRAINING_PATH,
  });
};

// Helper functions
async function getUserById(
  userId: number,
): Promise<{ name: string; surname: string; email: string } | null> {
  const result = await sequelize.query<{ name: string; surname: string; email: string }>(
    `SELECT name, surname, email FROM users WHERE id = :userId`,
    {
      replacements: { userId },
      type: QueryTypes.SELECT,
    },
  );
  return result[0] || null;
}

async function getOrganizationMemberById(
  userId: number,
  organizationId: number,
): Promise<{ name: string; surname: string; email: string } | null> {
  const result = await sequelize.query<{ name: string; surname: string; email: string }>(
    `SELECT u.name, u.surname, u.email
       FROM users u
       JOIN organization_members om ON om.user_id = u.id
      WHERE u.id = :userId AND om.organization_id = :organizationId`,
    {
      replacements: { userId, organizationId },
      type: QueryTypes.SELECT,
    },
  );
  return result[0] || null;
}

async function getUserEmail(userId: number): Promise<{ email: string } | null> {
  const result = await sequelize.query<{ email: string }>(
    `SELECT email FROM users WHERE id = :userId`,
    {
      replacements: { userId },
      type: QueryTypes.SELECT,
    },
  );
  return result[0] || null;
}

async function getUserEmails(
  userIds: number[],
): Promise<Array<{ id: number; name: string; surname: string; email: string }>> {
  if (userIds.length === 0) return [];

  const result = await sequelize.query<{
    id: number;
    name: string;
    surname: string;
    email: string;
  }>(`SELECT id, name, surname, email FROM users WHERE id IN (:userIds)`, {
    replacements: { userIds },
    type: QueryTypes.SELECT,
  });
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
  | "Risk Owner"
  | "Risk Approver";

/**
 * Entity type labels for display in notifications
 */
const ENTITY_TYPE_DISPLAY_LABELS: Record<string, string> = {
  vendor: "Vendor",
  vendor_risk: "Vendor Risk",
  project_risk: "Use Case Risk",
  model_risk: "Model risk",
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
    // Same type as Risk Owner, so no notification type enum change (ruling K5)
    case "Risk Approver":
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
    case "Risk Approver":
      return "As the Risk Approver, you decide whether this risk's treatment is approved or rejected.";
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
    case "model_risk":
      return NotificationEntityType.RISK;
    default:
      return NotificationEntityType.PROJECT;
  }
}

/**
 * Entity context for additional details in assignment emails
 */
export interface AssignmentEntityContext {
  frameworkName?: string; // e.g., "ISO 27001", "NIST AI RMF"
  parentType?: string; // e.g., "Annex", "Clause", "Control"
  parentName?: string; // e.g., "A.5 Organizational controls"
  projectName?: string; // Project this belongs to
  description?: string; // Brief description of the entity
}

/**
 * Build HTML for entity context to include in email
 *
 * The values are text that someone else wrote (a framework or project name, the description of a
 * risk that a model wrote after reading a web page), so each one is escaped: it shows as typed and
 * cannot add a tag, a link or an image to the email. The markup around the values is ours.
 */
function buildEntityContextHtml(context?: AssignmentEntityContext): string {
  if (!context) return "";

  const rows: string[] = [];

  if (context.frameworkName) {
    rows.push(
      `<tr><td style="padding: 4px 0; color: ${emailColorTokens.colorTextIcon}; font-size: 13px; width: 110px;">Framework:</td><td style="padding: 4px 0; color: ${emailColorTokens.colorTextSecondary}; font-size: 13px;">${escapeHtml(context.frameworkName)}</td></tr>`,
    );
  }

  if (context.projectName) {
    rows.push(
      `<tr><td style="padding: 4px 0; color: ${emailColorTokens.colorTextIcon}; font-size: 13px; width: 110px;">Project:</td><td style="padding: 4px 0; color: ${emailColorTokens.colorTextSecondary}; font-size: 13px;">${escapeHtml(context.projectName)}</td></tr>`,
    );
  }

  if (context.parentType && context.parentName) {
    rows.push(
      `<tr><td style="padding: 4px 0; color: ${emailColorTokens.colorTextIcon}; font-size: 13px; width: 110px;">${escapeHtml(context.parentType)}:</td><td style="padding: 4px 0; color: ${emailColorTokens.colorTextSecondary}; font-size: 13px;">${escapeHtml(context.parentName)}</td></tr>`,
    );
  }

  if (context.description) {
    rows.push(
      `<tr><td style="padding: 8px 0 4px 0; color: ${emailColorTokens.colorTextIcon}; font-size: 13px; width: 110px; vertical-align: top;">About:</td><td style="padding: 8px 0 4px 0; color: ${emailColorTokens.colorTextSecondary}; font-size: 13px;">${escapeHtml(context.description)}</td></tr>`,
    );
  }

  if (rows.length === 0) return "";

  return `<table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">${rows.join("")}</table>`;
}

/** An assignment link: absolute URLs as they are, relative ones on `baseUrl`. */
const buildAssignmentUrl = (entityUrl: string, baseUrl: string): string =>
  entityUrl.startsWith("http")
    ? entityUrl
    : `${baseUrl}${entityUrl.startsWith("/") ? "" : "/"}${entityUrl}`;

/**
 * Shared scaffolding of the assignment notifications: look up the assignee
 * (skip with a warning when missing), run `send`, log what it returns, and
 * never throw, since notifications must not break the main flow.
 */
const sendAssignmentNotification = async (
  organizationId: number,
  assigneeId: number,
  send: (assignee: { name: string; surname: string; email: string }) => Promise<string>,
): Promise<void> => {
  try {
    // Only a member of the organization is ever told about its records.
    const assignee = await getOrganizationMemberById(assigneeId, organizationId);
    if (!assignee) {
      logger.warn(
        `Cannot send assignment notification: user ${assigneeId} is not a member of organization ${organizationId}`,
      );
      return;
    }

    const sent = await send(assignee);

    // The values are interpolated into the message here rather than passed as
    // printf arguments: winston is configured without format.splat(), so a
    // stray %s or %d in caller-supplied data (assigneeId reaches here from a
    // request body) is printed literally instead of being treated as a
    // format specifier.
    logger.info(`📧 Assignment notification sent to user ${assigneeId} ${sent}`);
  } catch (error) {
    logger.error(
      `Failed to send assignment notification to user ${assigneeId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    // Don't rethrow - notifications should not break the main flow
  }
};

/**
 * Notify a user when they are assigned to an entity
 *
 * @param organizationId - Organization ID for multi-tenancy
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
    entityType: string; // "vendor", "project", "model_inventory", etc.
    entityId: number;
    entityName: string;
    roleType: AssignmentRoleType;
    entityUrl: string; // Full URL path (relative or absolute)
  },
  assignerName: string,
  baseUrl: string,
  entityContext?: AssignmentEntityContext,
): Promise<void> =>
  sendAssignmentNotification(organizationId, assigneeId, async (assignee) => {
    const displayEntityType =
      ENTITY_TYPE_DISPLAY_LABELS[assignment.entityType] || assignment.entityType;
    const notificationType = getNotificationTypeForRole(assignment.roleType);
    const notificationEntityType = getNotificationEntityType(assignment.entityType);

    // Build full URL
    const fullUrl = buildAssignmentUrl(assignment.entityUrl, baseUrl);

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
        // compileMjmlToHtml escapes every value whose key does not end in Html or _html, so the
        // three names (text that a person, or a model that read a web page, wrote) are passed as
        // written and show as typed; escaping them here too would show "&amp;" for "&". The subject
        // and the in-app message above are plain text and keep what was written. The rest comes
        // from constants (role, entity type, role description, date) or is a link built from ids
        // that sits in an href (entity_url). entity_context_html is the one raw-HTML slot: markup
        // built above from escaped values.
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
      },
    );

    return `as ${assignment.roleType} for ${assignment.entityType} ${assignment.entityId}`;
  });

/** Items listed in a multi-item assignment notice before "and <k> more". */
export const ASSIGNED_MANY_LIST_LIMIT = 20;

/**
 * The words of a multi-item assignment notice, chosen by the caller. The keys
 * are translated into the recipient's language; the email body stays English.
 */
export interface AssignedManyTexts {
  /** Title and email subject. Vars: {count}. */
  titleKey: string;
  /** Message listing every item. Vars: {assigner}, {count}, {names}. */
  messageKey: string;
  /** Message when the list is cut. Vars: {assigner}, {count}, {names}, {more}. */
  messageMoreKey: string;
  /** Plural noun for the English email body, e.g. "risks". */
  itemsLabel: string;
  /** English email line on what the role means for these items. */
  roleDescription: string;
}

/**
 * Notify a user once when a bulk action assigns them to several items of one
 * kind (e.g. a bulk set owner on risks): one in-app notification and one
 * assignment email listing the items, instead of one per item. Same
 * notification type, entity type and email template as notifyUserAssigned.
 *
 * @param assignment.entityUrl - Link to the list page, e.g. "/risk-management"
 */
export const notifyUserAssignedMany = async (
  organizationId: number,
  assigneeId: number,
  assignment: {
    entityType: string;
    items: Array<{ id: number; name: string }>;
    roleType: AssignmentRoleType;
    entityUrl: string;
    texts: AssignedManyTexts;
  },
  assignerName: string,
  baseUrl: string,
): Promise<void> =>
  sendAssignmentNotification(organizationId, assigneeId, async (assignee) => {
    const { texts } = assignment;
    const count = assignment.items.length;
    const shown = assignment.items.slice(0, ASSIGNED_MANY_LIST_LIMIT).map((item) => item.name);
    const more = count - shown.length;
    const names = shown.join(", ");

    // The item names are user text: escaped here, since *_html variables are
    // inserted into the email as is.
    const itemStyle = `color: ${emailColorTokens.colorTextSecondary}; font-size: 13px; margin-bottom: 4px;`;
    const listItems = shown.map((name) => `<li style="${itemStyle}">${escapeHtml(name)}</li>`);
    if (more > 0) listItems.push(`<li style="${itemStyle}">and ${more} more</li>`);
    const listHtml = `<ul style="margin: 0 0 8px 0; padding-left: 20px;">${listItems.join("")}</ul>`;

    await sendInAppNotification(
      organizationId,
      {
        user_id: assigneeId,
        type: getNotificationTypeForRole(assignment.roleType),
        titleKey: texts.titleKey,
        titleVars: { count },
        ...(more > 0
          ? {
              messageKey: texts.messageMoreKey,
              messageVars: { assigner: assignerName, count, names, more },
            }
          : {
              messageKey: texts.messageKey,
              messageVars: { assigner: assignerName, count, names },
            }),
        entity_type: getNotificationEntityType(assignment.entityType),
        action_url: assignment.entityUrl,
      },
      true,
      {
        template: EMAIL_TEMPLATES.ASSIGNMENT_NOTIFICATION,
        subjectKey: texts.titleKey,
        subjectVars: { count },
        variables: {
          recipient_name: assignee.name || "User",
          assigner_name: assignerName,
          role_type: assignment.roleType,
          entity_type: texts.itemsLabel,
          entity_name: `${count} ${texts.itemsLabel}`,
          entity_url: buildAssignmentUrl(assignment.entityUrl, baseUrl),
          assignment_date: formatAssignmentDate(),
          role_description: texts.roleDescription,
          entity_context_html: listHtml,
        },
      },
    );

    return `as ${assignment.roleType} for ${count} ${assignment.entityType} items`;
  });
