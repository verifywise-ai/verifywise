import {
  getNotificationsQuery,
  getNotificationSummaryQuery,
  getUnreadCountQuery,
  markNotificationAsReadQuery,
  markAllNotificationsAsReadQuery,
} from "../../utils/notification.utils";
import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import logger from "../../utils/logger/fileLogger";

interface FetchNotificationsParams {
  is_read?: boolean;
  limit?: number;
  offset?: number;
  _userId?: number;
}

const fetchNotifications = async (
  params: FetchNotificationsParams,
  organizationId: number,
): Promise<any[]> => {
  try {
    const userId = params._userId || 0;

    const notifications = await getNotificationsQuery(userId, organizationId, {
      is_read: params.is_read,
      limit: params.limit || 50,
      offset: params.offset || 0,
    });

    // Return lightweight projections
    return notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      entity_type: n.entity_type,
      entity_id: n.entity_id,
      entity_name: n.entity_name,
      is_read: n.is_read,
      created_at: n.created_at,
    }));
  } catch (error) {
    logger.error("Error fetching notifications:", error);
    throw new Error(
      `Failed to fetch notifications: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getUnreadNotificationCount = async (
  params: { _userId?: number },
  organizationId: number,
): Promise<{ unread_count: number }> => {
  try {
    const userId = params._userId || 0;
    const count = await getUnreadCountQuery(userId, organizationId);
    return { unread_count: count };
  } catch (error) {
    logger.error("Error getting unread notification count:", error);
    throw new Error(
      `Failed to get unread count: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getNotificationSummary = async (
  params: { _userId?: number },
  organizationId: number,
): Promise<any> => {
  try {
    const userId = params._userId || 0;
    const summary = await getNotificationSummaryQuery(userId, organizationId);

    return {
      unread_count: summary.unread_count,
      total_count: summary.total_count,
      recent_notifications: summary.recent_notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        entity_type: n.entity_type,
        entity_name: n.entity_name,
        is_read: n.is_read,
        created_at: n.created_at,
      })),
    };
  } catch (error) {
    logger.error("Error getting notification summary:", error);
    throw new Error(
      `Failed to get notification summary: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

interface NotificationAnalytics {
  totalNotifications: number;
  unreadCount: number;
  readCount: number;
  readRate: number;
  byType: { [type: string]: number };
  byEntityType: { [entityType: string]: number };
  recentActivity: number;
}

const getNotificationAnalytics = async (
  params: { _userId?: number },
  organizationId: number,
): Promise<NotificationAnalytics> => {
  try {
    const userId = params._userId || 0;

    // Aggregate stats by type
    const typeCounts = await sequelize.query<{
      type: string;
      count: string;
      unread: string;
    }>(
      `SELECT type, COUNT(*) as count, COUNT(*) FILTER (WHERE is_read = FALSE) as unread
       FROM notifications
       WHERE organization_id = :organization_id AND user_id = :user_id
       GROUP BY type
       ORDER BY count DESC`,
      {
        replacements: { organization_id: organizationId, user_id: userId },
        type: QueryTypes.SELECT,
      },
    );

    const byType: { [type: string]: number } = {};
    let totalNotifications = 0;
    let unreadCount = 0;
    for (const row of typeCounts) {
      const count = parseInt(row.count, 10);
      byType[row.type] = count;
      totalNotifications += count;
      unreadCount += parseInt(row.unread, 10);
    }

    const readCount = totalNotifications - unreadCount;
    const readRate =
      totalNotifications > 0 ? Math.round((readCount / totalNotifications) * 100) : 0;

    // By entity type
    const entityCounts = await sequelize.query<{
      entity_type: string;
      count: string;
    }>(
      `SELECT entity_type, COUNT(*) as count
       FROM notifications
       WHERE organization_id = :organization_id AND user_id = :user_id AND entity_type IS NOT NULL
       GROUP BY entity_type
       ORDER BY count DESC`,
      {
        replacements: { organization_id: organizationId, user_id: userId },
        type: QueryTypes.SELECT,
      },
    );

    const byEntityType: { [entityType: string]: number } = {};
    for (const row of entityCounts) {
      byEntityType[row.entity_type] = parseInt(row.count, 10);
    }

    // Recent activity (last 7 days)
    const recentResult = await sequelize.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM notifications
       WHERE organization_id = :organization_id AND user_id = :user_id
         AND created_at >= NOW() - INTERVAL '7 days'`,
      {
        replacements: { organization_id: organizationId, user_id: userId },
        type: QueryTypes.SELECT,
      },
    );
    const recentActivity = parseInt(recentResult[0]?.count || "0", 10);

    return {
      totalNotifications,
      unreadCount,
      readCount,
      readRate,
      byType,
      byEntityType,
      recentActivity,
    };
  } catch (error) {
    logger.error("Error getting notification analytics:", error);
    throw new Error(
      `Failed to get notification analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// --- Write Tools (Human Confirmation Flow) ---

const agentMarkNotificationRead = createWriteToolFn({
  toolName: "agent_mark_notification_read",
  warningLevel: "info",
  descriptionFn: (params) => `Mark notification #${params.notification_id} as read`,
  executeFn: async (params, organizationId) => {
    const notificationId = params.notification_id as number;
    const userId = (params._userId as number) || 0;

    const result = await markNotificationAsReadQuery(notificationId, userId, organizationId);

    if (!result) {
      throw new Error(`Notification #${notificationId} not found or already read`);
    }

    return {
      id: notificationId,
      is_read: true,
      message: "Notification marked as read",
    };
  },
});

const agentMarkAllNotificationsRead = createWriteToolFn({
  toolName: "agent_mark_all_notifications_read",
  warningLevel: "info",
  descriptionFn: () => "Mark all unread notifications as read",
  executeFn: async (params, organizationId) => {
    const userId = (params._userId as number) || 0;

    const count = await markAllNotificationsAsReadQuery(userId, organizationId);

    return {
      marked_read: count,
      message: `${count} notification(s) marked as read`,
    };
  },
});

const availableNotificationTools: any = {
  fetch_notifications: fetchNotifications,
  get_unread_notification_count: getUnreadNotificationCount,
  get_notification_summary: getNotificationSummary,
  get_notification_analytics: getNotificationAnalytics,
  agent_mark_notification_read: agentMarkNotificationRead,
  agent_mark_all_notifications_read: agentMarkAllNotificationsRead,
};

export { availableNotificationTools };
