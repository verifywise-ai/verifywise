import { sequelize } from "../database/db";
import { QueryTypes, Transaction } from "sequelize";
import {
  INotification,
  INotificationJSON,
  ICreateNotification,
  INotificationFilters,
  INotificationSummary,
  IBulkNotification,
  NotificationEntityType,
} from "../domain.layer/interfaces/i.notification";

/**
 * Convert a notification record to JSON format
 */
const toJSON = (notification: INotification): INotificationJSON => ({
  id: notification.id!,
  user_id: notification.user_id,
  type: notification.type,
  title: notification.title,
  message: notification.message,
  entity_type: notification.entity_type,
  entity_id: notification.entity_id,
  entity_name: notification.entity_name,
  action_url: notification.action_url,
  is_read: notification.is_read,
  read_at: notification.read_at ? notification.read_at.toISOString() : null,
  created_at: notification.created_at
    ? notification.created_at.toISOString()
    : new Date().toISOString(),
  created_by: notification.created_by,
  metadata: notification.metadata,
});

/**
 * Create a new notification
 */
export const createNotificationQuery = async (
  notification: ICreateNotification,
  organizationId: number,
  transaction?: Transaction
): Promise<INotificationJSON> => {
  const result = await sequelize.query<INotification>(
    `INSERT INTO notifications (
      organization_id, user_id, type, title, message, entity_type, entity_id,
      entity_name, action_url, created_by, metadata
    ) VALUES (
      :organization_id, :user_id, :type, :title, :message, :entity_type, :entity_id,
      :entity_name, :action_url, :created_by, :metadata
    ) RETURNING *`,
    {
      replacements: {
        organization_id: organizationId,
        user_id: notification.user_id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        entity_type: notification.entity_type || null,
        entity_id: notification.entity_id || null,
        entity_name: notification.entity_name || null,
        action_url: notification.action_url || null,
        created_by: notification.created_by || null,
        metadata: notification.metadata ? JSON.stringify(notification.metadata) : null,
      },
      type: QueryTypes.SELECT,
      transaction,
    }
  );

  return toJSON(result[0]);
};

/**
 * Create notifications for multiple users (bulk)
 */
export const createBulkNotificationsQuery = async (
  bulk: IBulkNotification,
  organizationId: number,
  transaction?: Transaction
): Promise<INotificationJSON[]> => {
  if (bulk.user_ids.length === 0) {
    return [];
  }

  // Build values for multi-row insert
  const values = bulk.user_ids
    .map((_, i) => `(:organization_id, :user_id_${i}, :type, :title, :message, :entity_type, :entity_id, :entity_name, :action_url, :created_by, :metadata)`)
    .join(", ");

  const replacements: Record<string, any> = {
    organization_id: organizationId,
    type: bulk.type,
    title: bulk.title,
    message: bulk.message,
    entity_type: bulk.entity_type || null,
    entity_id: bulk.entity_id || null,
    entity_name: bulk.entity_name || null,
    action_url: bulk.action_url || null,
    created_by: bulk.created_by || null,
    metadata: bulk.metadata ? JSON.stringify(bulk.metadata) : null,
  };

  bulk.user_ids.forEach((userId, i) => {
    replacements[`user_id_${i}`] = userId;
  });

  const result = await sequelize.query<INotification>(
    `INSERT INTO notifications (
      organization_id, user_id, type, title, message, entity_type, entity_id,
      entity_name, action_url, created_by, metadata
    ) VALUES ${values} RETURNING *`,
    {
      replacements,
      type: QueryTypes.SELECT,
      transaction,
    }
  );

  return result.map(toJSON);
};

/**
 * Get notifications for a user with filters
 */
export const getNotificationsQuery = async (
  userId: number,
  organizationId: number,
  filters: INotificationFilters = {}
): Promise<INotificationJSON[]> => {
  const whereConditions: string[] = ["organization_id = :organizationId", "user_id = :userId"];
  const replacements: Record<string, any> = { organizationId, userId };

  if (filters.type) {
    if (Array.isArray(filters.type)) {
      const typeList = filters.type.map((_, i) => `:type_${i}`).join(", ");
      whereConditions.push(`type IN (${typeList})`);
      filters.type.forEach((t, i) => {
        replacements[`type_${i}`] = t;
      });
    } else {
      whereConditions.push("type = :type");
      replacements.type = filters.type;
    }
  }

  if (filters.entity_type) {
    whereConditions.push("entity_type = :entity_type");
    replacements.entity_type = filters.entity_type;
  }

  if (filters.entity_id) {
    whereConditions.push("entity_id = :entity_id");
    replacements.entity_id = filters.entity_id;
  }

  if (filters.is_read !== undefined) {
    whereConditions.push("is_read = :is_read");
    replacements.is_read = filters.is_read;
  }

  if (filters.from_date) {
    whereConditions.push("created_at >= :from_date");
    replacements.from_date = filters.from_date;
  }

  if (filters.to_date) {
    whereConditions.push("created_at <= :to_date");
    replacements.to_date = filters.to_date;
  }

  const limit = filters.limit || 50;
  const offset = filters.offset || 0;
  replacements.limit = limit;
  replacements.offset = offset;

  const result = await sequelize.query<INotification>(
    `SELECT * FROM notifications
     WHERE ${whereConditions.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT :limit OFFSET :offset`,
    {
      replacements,
      type: QueryTypes.SELECT,
    }
  );

  return result.map(toJSON);
};

/**
 * Get notification summary for bell icon
 * Uses a single query to avoid race conditions between count and recent list
 */
export const getNotificationSummaryQuery = async (
  userId: number,
  organizationId: number
): Promise<INotificationSummary> => {
  // Single query with CTE to get both counts and recent notifications atomically
  const result = await sequelize.query<
    INotification & { unread_count: string; total_count: string }
  >(
    `WITH counts AS (
      SELECT
        COUNT(*) FILTER (WHERE is_read = FALSE) AS unread_count,
        COUNT(*) AS total_count
      FROM notifications
      WHERE organization_id = :organizationId AND user_id = :userId
    ),
    recent AS (
      SELECT * FROM notifications
      WHERE organization_id = :organizationId AND user_id = :userId
      ORDER BY created_at DESC
      LIMIT 10
    )
    SELECT r.*, c.unread_count, c.total_count
    FROM recent r
    CROSS JOIN counts c`,
    {
      replacements: { organizationId, userId },
      type: QueryTypes.SELECT,
    }
  );

  // Extract counts from first row (all rows have same counts due to CROSS JOIN)
  const unreadCount = parseInt(result[0]?.unread_count || "0", 10);
  const totalCount = parseInt(result[0]?.total_count || "0", 10);

  // Map notifications (exclude the count fields from the notification objects)
  const recentNotifications = result.map((row) => {
    const { unread_count, total_count, ...notification } = row;
    return toJSON(notification as INotification);
  });

  return {
    unread_count: unreadCount,
    total_count: totalCount,
    recent_notifications: recentNotifications,
  };
};

/**
 * Get a single notification by ID
 */
export const getNotificationByIdQuery = async (
  notificationId: number,
  userId: number,
  organizationId: number
): Promise<INotificationJSON | null> => {
  const result = await sequelize.query<INotification>(
    `SELECT * FROM notifications
     WHERE organization_id = :organizationId AND id = :notificationId AND user_id = :userId`,
    {
      replacements: { organizationId, notificationId, userId },
      type: QueryTypes.SELECT,
    }
  );

  if (result.length === 0) {
    return null;
  }

  return toJSON(result[0]);
};

/**
 * Mark a notification as read
 */
export const markNotificationAsReadQuery = async (
  notificationId: number,
  userId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<INotificationJSON | null> => {
  const result = await sequelize.query<INotification>(
    `UPDATE notifications
     SET is_read = TRUE, read_at = NOW()
     WHERE organization_id = :organizationId AND id = :notificationId AND user_id = :userId
     RETURNING *`,
    {
      replacements: { organizationId, notificationId, userId },
      type: QueryTypes.SELECT,
      transaction,
    }
  );

  if (result.length === 0) {
    return null;
  }

  return toJSON(result[0]);
};

/**
 * Mark all notifications as read for a user
 */
export const markAllNotificationsAsReadQuery = async (
  userId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<number> => {
  // Use RETURNING to count affected rows reliably across PostgreSQL
  const result = await sequelize.query<{ id: number }>(
    `UPDATE notifications
     SET is_read = TRUE, read_at = NOW()
     WHERE organization_id = :organizationId AND user_id = :userId AND is_read = FALSE
     RETURNING id`,
    {
      replacements: { organizationId, userId },
      type: QueryTypes.SELECT,
      transaction,
    }
  );

  return result.length;
};

/**
 * Delete a notification
 */
export const deleteNotificationQuery = async (
  notificationId: number,
  userId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<boolean> => {
  // Use RETURNING to check if row was deleted
  const result = await sequelize.query<{ id: number }>(
    `DELETE FROM notifications
     WHERE organization_id = :organizationId AND id = :notificationId AND user_id = :userId
     RETURNING id`,
    {
      replacements: { organizationId, notificationId, userId },
      type: QueryTypes.SELECT,
      transaction,
    }
  );

  return result.length > 0;
};

/**
 * Delete all read notifications older than a certain date
 * Used for cleanup
 */
export const deleteOldNotificationsQuery = async (
  userId: number,
  olderThan: Date,
  organizationId: number,
  transaction?: Transaction
): Promise<number> => {
  // Use RETURNING to count deleted rows
  const result = await sequelize.query<{ id: number }>(
    `DELETE FROM notifications
     WHERE organization_id = :organizationId
     AND user_id = :userId
     AND is_read = TRUE
     AND created_at < :olderThan
     RETURNING id`,
    {
      replacements: { organizationId, userId, olderThan },
      type: QueryTypes.SELECT,
      transaction,
    }
  );

  return result.length;
};

/**
 * Get unread count for a user
 */
export const getUnreadCountQuery = async (
  userId: number,
  organizationId: number
): Promise<number> => {
  const result = await sequelize.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM notifications
     WHERE organization_id = :organizationId AND user_id = :userId AND is_read = FALSE`,
    {
      replacements: { organizationId, userId },
      type: QueryTypes.SELECT,
    }
  );

  return parseInt(result[0]?.count || "0", 10);
};

/**
 * Delete notifications by entity (when entity is deleted)
 */
export const deleteNotificationsByEntityQuery = async (
  entityType: NotificationEntityType,
  entityId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<number> => {
  // Use RETURNING to count deleted rows
  const result = await sequelize.query<{ id: number }>(
    `DELETE FROM notifications
     WHERE organization_id = :organizationId AND entity_type = :entityType AND entity_id = :entityId
     RETURNING id`,
    {
      replacements: { organizationId, entityType, entityId },
      type: QueryTypes.SELECT,
      transaction,
    }
  );

  return result.length;
};

/**
 * Get users who should receive a notification for an entity
 * This is a utility function to help determine notification recipients
 */
export const getEntityNotificationRecipientsQuery = async (
  entityType: NotificationEntityType,
  entityId: number,
  organizationId: number,
  excludeUserId?: number
): Promise<number[]> => {
  let query = "";
  const replacements: Record<string, any> = { organizationId, entityId };

  switch (entityType) {
    case NotificationEntityType.PROJECT:
      // Get all project members
      query = `
        SELECT DISTINCT user_id
        FROM projects_members
        WHERE organization_id = :organizationId AND project_id = :entityId
      `;
      break;

    case NotificationEntityType.TASK:
      // Get task creator and assignees
      query = `
        SELECT creator_id as user_id FROM tasks WHERE organization_id = :organizationId AND id = :entityId
        UNION
        SELECT user_id FROM task_assignees WHERE organization_id = :organizationId AND task_id = :entityId
      `;
      break;

    case NotificationEntityType.POLICY:
      // Get policy owner and reviewers
      query = `
        SELECT owner_id as user_id FROM policy_manager WHERE organization_id = :organizationId AND id = :entityId
        UNION
        SELECT reviewer_id as user_id FROM policy_manager WHERE organization_id = :organizationId AND id = :entityId AND reviewer_id IS NOT NULL
      `;
      break;

    case NotificationEntityType.VENDOR:
      // Get vendor assignee and reviewers
      query = `
        SELECT assignee as user_id FROM vendors WHERE organization_id = :organizationId AND id = :entityId AND assignee IS NOT NULL
        UNION
        SELECT reviewer as user_id FROM vendors WHERE organization_id = :organizationId AND id = :entityId AND reviewer IS NOT NULL
      `;
      break;

    default:
      return [];
  }

  if (excludeUserId) {
    query = `SELECT user_id FROM (${query}) sub WHERE user_id != :excludeUserId`;
    replacements.excludeUserId = excludeUserId;
  }

  const result = await sequelize.query<{ user_id: number }>(query, {
    replacements,
    type: QueryTypes.SELECT,
  });

  return result.map((r) => r.user_id).filter((id) => id != null);
};
