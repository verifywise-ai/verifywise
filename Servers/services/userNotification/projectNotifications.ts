import { notificationService } from "../notificationService";
import { getUserByIdQuery } from "../../utils/user.utils";
import { frontEndUrl } from "../../config/constants";
import { EMAIL_TEMPLATES } from "../../constants/emailTemplates";
import {
  logProcessing,
  logSuccess,
  logFailure,
} from "../../utils/logger/logHelper";

// ============================================================================
// TYPES
// ============================================================================

export type ProjectRole = "admin" | "auditor" | "editor" | "reviewer";

export type ProjectNotificationType =
  | "user_added"
  | "role_changed_to_admin"
  | "project_created";

export interface BaseProjectNotificationData {
  projectId: number;
  projectName: string;
  actorId: number;
  userId: number;
}

export interface UserAddedToProjectData extends BaseProjectNotificationData {
  type: "user_added";
  role: ProjectRole;
}

export interface RoleChangedToAdminData extends BaseProjectNotificationData {
  type: "role_changed_to_admin";
}

export interface ProjectCreatedData {
  type: "project_created";
  projectId: number;
  projectName: string;
  adminId: number;
}

export type ProjectNotificationData =
  | UserAddedToProjectData
  | RoleChangedToAdminData
  | ProjectCreatedData;

// ============================================================================
// CONFIGURATION
// ============================================================================

interface NotificationConfig {
  template: string;
  getSubject: (projectName: string, role?: ProjectRole) => string;
  getLogMessage: (email: string, role?: ProjectRole) => string;
}

const NOTIFICATION_CONFIGS: Record<ProjectNotificationType, NotificationConfig> = {
  user_added: {
    template: EMAIL_TEMPLATES.USER_ADDED_PROJECT_ADMIN, // Will be overridden by role
    getSubject: (projectName, role) =>
      `You are now a project ${role} for ${projectName}`,
    getLogMessage: (email, role) =>
      `Added as a project ${role} notification sent to ${email}`,
  },
  role_changed_to_admin: {
    template: EMAIL_TEMPLATES.MEMBER_ROLE_CHANGED_EDITOR_TO_ADMIN,
    getSubject: (projectName) =>
      `Your role changed to project admin on ${projectName}`,
    getLogMessage: (email) =>
      `Role changed to admin notification sent to ${email}`,
  },
  project_created: {
    template: EMAIL_TEMPLATES.PROJECT_CREATED_ADMIN,
    getSubject: (projectName) =>
      `${projectName} is created in VerifyWise`,
    getLogMessage: (email) =>
      `Project creation notification sent to ${email}`,
  },
};

const ROLE_TEMPLATES: Record<ProjectRole, string> = {
  admin: EMAIL_TEMPLATES.USER_ADDED_PROJECT_ADMIN,
  auditor: EMAIL_TEMPLATES.USER_ADDED_PROJECT_AUDITOR,
  editor: EMAIL_TEMPLATES.USER_ADDED_PROJECT_EDITOR,
  reviewer: EMAIL_TEMPLATES.USER_ADDED_PROJECT_REVIEWER,
};

// ============================================================================
// CORE REUSABLE FUNCTION
// ============================================================================

async function sendProjectNotification(
  data: ProjectNotificationData,
  functionName: string,
  fileName: string,
  organizationId: number,
  userId: number
): Promise<void> {
  logProcessing({
    description: `Sending ${data.type} notification for project: ${data.projectName}`,
    functionName,
    fileName,
    userId: userId,
    organizationId: organizationId,
  });

  try {
    let actorUser;
    let user;
    let recipientEmail: string;
    let templateData: any;

    // Handle project_created differently (admin is both actor and recipient)
    if (data.type === "project_created") {
      const adminUser = await getUserByIdQuery(data.adminId);
      if (!adminUser) {
        throw new Error(`Admin user not found with ID: ${data.adminId}`);
      }
      if (!adminUser.email || adminUser.email.trim() === "") {
        throw new Error(`Admin user email is missing or invalid for user ID: ${data.adminId}`);
      }

      recipientEmail = adminUser.email;
      templateData = {
        project_name: data.projectName,
        admin_name: adminUser.name,
        project_url: `${frontEndUrl}/project-view?projectId=${data.projectId}`,
      };
    } else {
      // For user_added and role_changed_to_admin
      actorUser = await getUserByIdQuery(data.actorId);
      if (!actorUser) {
        throw new Error(`Actor user not found with ID: ${data.actorId}`);
      }

      user = await getUserByIdQuery(data.userId);
      if (!user) {
        throw new Error(`User not found with ID: ${data.userId}`);
      }

      if (!user.email || user.email.trim() === "") {
        throw new Error(`User email is missing or invalid for user ID: ${data.userId}`);
      }

      recipientEmail = user.email;
      templateData = {
        project_name: data.projectName,
        actor_name: actorUser.name,
        project_url: `${frontEndUrl}/project-view?projectId=${data.projectId}`,
        user_name: user.name,
      };
    }

    // Get configuration based on notification type
    const config = NOTIFICATION_CONFIGS[data.type];

    // Get template based on notification type
    let template: string;
    let subject: string;
    let logMessage: string;

    if (data.type === "user_added") {
      template = ROLE_TEMPLATES[data.role];
      subject = config.getSubject(data.projectName, data.role);
      logMessage = config.getLogMessage(recipientEmail, data.role);
    } else {
      template = config.template;
      subject = config.getSubject(data.projectName);
      logMessage = config.getLogMessage(recipientEmail);
    }

    // Send the email
    await notificationService.sendEmailWithTemplate(
      recipientEmail,
      subject,
      template,
      templateData
    );

    await logSuccess({
      eventType: "Create",
      description: logMessage,
      functionName,
      fileName,
      userId: userId,
      organizationId: organizationId,
    });
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: `Failed to send ${data.type} notification`,
      functionName,
      fileName,
      error: error as Error,
      userId: userId,
      organizationId: organizationId,
    });
    throw error;
  }
}

// ============================================================================
// PUBLIC API (Backward Compatible)
// ============================================================================

/**
 * Sends notification when a user is added to a project with a specific role
 *
 * @param data - Notification data including projectId, projectName, adminId (actor), userId, and role
 * @example
 * await sendUserAddedToProjectNotification({
 *   projectId: 39,
 *   projectName: "Testing",
 *   adminId: 1,
 *   userId: 6,
 *   role: "admin"
 * });
 */
export const sendUserAddedToProjectNotification = async (
  data: {
    projectId: number;
    projectName: string;
    adminId: number;
    userId: number;
    role: ProjectRole;
    organizationId: number;
  }
): Promise<void> => {
  return sendProjectNotification(
    {
      ...data,
      actorId: data.adminId, // Map adminId to actorId for consistency
      type: "user_added"
    },
    "sendUserAddedToProjectNotification",
    "projectNotifications.ts",
    data.organizationId,
    data.userId
  );
};

/**
 * Sends notification when a user's role changes from Editor to Admin
 *
 * @param data - Notification data including projectId, projectName, actorId, and userId
 * @example
 * await sendMemberRoleChangedEditorToAdminNotification({
 *   projectId: 39,
 *   projectName: "Testing",
 *   actorId: 1,
 *   userId: 6
 * });
 */
export const sendMemberRoleChangedEditorToAdminNotification = async (
  data: {
    projectId: number;
    projectName: string;
    actorId: number;
    userId: number;
    organizationId: number;
  }
): Promise<void> => {
  return sendProjectNotification(
    { ...data, type: "role_changed_to_admin" },
    "sendMemberRoleChangedEditorToAdminNotification",
    "projectNotifications.ts",
    data.organizationId,
    data.userId
  );
};

/**
 * Sends notification when a new project is created
 *
 * @param data - Notification data including projectId, projectName, and adminId
 * @example
 * await sendProjectCreatedNotification({
 *   projectId: 42,
 *   projectName: "New Security Project",
 *   adminId: 1
 * });
 */
export const sendProjectCreatedNotification = async (
  data: {
    projectId: number;
    projectName: string;
    adminId: number;
    organizationId: number;
    userId: number;
  }
): Promise<void> => {
  return sendProjectNotification(
    { ...data, type: "project_created" },
    "sendProjectCreatedNotification",
    "projectNotifications.ts",
    data.organizationId,
    data.userId
  );
};