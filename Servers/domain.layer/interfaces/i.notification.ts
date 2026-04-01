/**
 * Notification type enum
 * Defines the various notification categories
 */
export enum NotificationType {
  // Task notifications
  TASK_ASSIGNED = "task_assigned",
  TASK_UPDATED = "task_updated",
  TASK_COMPLETED = "task_completed",

  // Review notifications
  REVIEW_REQUESTED = "review_requested",
  REVIEW_APPROVED = "review_approved",
  REVIEW_REJECTED = "review_rejected",

  // Approval workflow notifications
  APPROVAL_REQUESTED = "approval_requested",
  APPROVAL_APPROVED = "approval_approved",
  APPROVAL_REJECTED = "approval_rejected",
  APPROVAL_COMPLETE = "approval_complete",

  // Policy notifications
  POLICY_DUE_SOON = "policy_due_soon",
  POLICY_OVERDUE = "policy_overdue",

  // Training notifications
  TRAINING_ASSIGNED = "training_assigned",
  TRAINING_COMPLETED = "training_completed",

  // Vendor notifications
  VENDOR_REVIEW_DUE = "vendor_review_due",

  // File notifications
  FILE_UPLOADED = "file_uploaded",

  // Collaboration notifications
  COMMENT_ADDED = "comment_added",
  MENTION = "mention",

  // Shadow AI notifications
  SHADOW_AI_ALERT = "shadow_ai_alert",

  // AI Gateway notifications
  AI_GATEWAY_BUDGET_WARNING = "ai_gateway_budget_warning",
  AI_GATEWAY_BUDGET_EXHAUSTED = "ai_gateway_budget_exhausted",
  AI_GATEWAY_GUARDRAIL_SPIKE = "ai_gateway_guardrail_spike",
  AI_GATEWAY_CONFIG_CHANGE = "ai_gateway_config_change",
  AI_GATEWAY_VIRTUAL_KEY_BUDGET_EXHAUSTED = "ai_gateway_virtual_key_budget_exhausted",

  // System notifications
  SYSTEM = "system",

  // Assignment notifications
  ASSIGNMENT_OWNER = "assignment_owner",
  ASSIGNMENT_REVIEWER = "assignment_reviewer",
  ASSIGNMENT_APPROVER = "assignment_approver",
  ASSIGNMENT_MEMBER = "assignment_member",
  ASSIGNMENT_ASSIGNEE = "assignment_assignee",
  ASSIGNMENT_ACTION_OWNER = "assignment_action_owner",
}

/**
 * Entity type enum
 * Defines the type of entity the notification relates to
 */
export enum NotificationEntityType {
  PROJECT = "project",
  TASK = "task",
  POLICY = "policy",
  VENDOR = "vendor",
  MODEL = "model",
  TRAINING = "training",
  FILE = "file",
  USE_CASE = "use_case",
  RISK = "risk",
  ASSESSMENT = "assessment",
  COMMENT = "comment",
  USER = "user",
  SHADOW_AI_TOOL = "shadow_ai_tool",
  AI_GATEWAY = "ai_gateway",
}

/**
 * Notification interface
 * Represents a single notification record
 */
export interface INotification {
  id?: number;
  user_id: number;
  type: NotificationType;
  title: string;
  message: string;
  entity_type?: NotificationEntityType | null;
  entity_id?: number | null;
  entity_name?: string | null;
  action_url?: string | null;
  is_read: boolean;
  read_at?: Date | null;
  created_at?: Date;
  created_by?: number | null;
  metadata?: Record<string, any> | null;
}

/**
 * Notification safe JSON format (for API responses)
 */
export interface INotificationJSON {
  id: number;
  user_id: number;
  type: NotificationType;
  title: string;
  message: string;
  entity_type?: NotificationEntityType | null;
  entity_id?: number | null;
  entity_name?: string | null;
  action_url?: string | null;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
  created_by?: number | null;
  metadata?: Record<string, any> | null;
}

/**
 * Create notification input
 */
export interface ICreateNotification {
  user_id: number;
  type: NotificationType;
  title: string;
  message: string;
  entity_type?: NotificationEntityType;
  entity_id?: number;
  entity_name?: string;
  action_url?: string;
  created_by?: number;
  metadata?: Record<string, any>;
}

/**
 * Notification with user details (for queries with joins)
 */
export interface INotificationWithUser extends INotification {
  user_name?: string;
  user_surname?: string;
  user_email?: string;
  creator_name?: string;
  creator_surname?: string;
}

/**
 * Notification summary for bell icon badge
 */
export interface INotificationSummary {
  unread_count: number;
  total_count: number;
  recent_notifications: INotificationJSON[];
}

/**
 * Notification filters for querying
 */
export interface INotificationFilters {
  user_id?: number;
  type?: NotificationType | NotificationType[];
  entity_type?: NotificationEntityType;
  entity_id?: number;
  is_read?: boolean;
  from_date?: Date;
  to_date?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Real-time notification payload (sent via SSE)
 */
export interface IRealtimeNotification {
  type: "notification";
  data: INotificationJSON;
}

/**
 * Bulk notification request (for sending to multiple users)
 */
export interface IBulkNotification {
  user_ids: number[];
  type: NotificationType;
  title: string;
  message: string;
  entity_type?: NotificationEntityType;
  entity_id?: number;
  entity_name?: string;
  action_url?: string;
  created_by?: number;
  metadata?: Record<string, any>;
}

/**
 * Email notification configuration
 * Used when a notification should also trigger an email
 */
export interface IEmailNotificationConfig {
  template: string;
  subject: string;
  variables: Record<string, string>;
}

/**
 * Notification with optional email
 * For creating notifications that also send emails
 */
export interface INotificationWithEmail extends ICreateNotification {
  send_email?: boolean;
  email_config?: IEmailNotificationConfig;
}
