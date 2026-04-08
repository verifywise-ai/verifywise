/**
 * @fileoverview Real-time notification hook using Server-Sent Events (SSE)
 *
 * Establishes a persistent SSE connection to receive real-time notifications including:
 * - Approval workflow notifications
 * - Task assignments
 * - Review requests
 * - Policy due reminders
 * - And more...
 *
 * Integrates with the existing Alert system to display notifications to users.
 *
 * Features:
 * - Authorization header (uses existing JWT, no cookies!)
 * - fetch() with ReadableStream (manual SSE parsing for full header control)
 * - Automatic reconnection on connection loss
 * - Multi-tenant safe
 * - Integrates with existing alert system
 * - Proper cleanup on unmount
 * - Fetches stored notifications on mount
 * - Tracks unread count for bell icon
 *
 * How it works:
 * 1. Uses fetch() instead of EventSource to send Authorization header
 * 2. Manually parses SSE data from ReadableStream
 * 3. Receives real-time notifications and fetches stored ones
 *
 * @module hooks/useNotifications
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useSelector } from "react-redux";
import { RootState, store } from "../redux/store";
import { ENV_VARs } from "../../../env.vars";
import { showAlert } from "../../infrastructure/api/customAxios";
import { apiServices } from "../../infrastructure/api/networkServices";

/**
 * Notification types - matches backend enum
 */
export type NotificationType =
  | "task_assigned"
  | "task_completed"
  | "review_requested"
  | "review_approved"
  | "review_rejected"
  | "approval_requested"
  | "approval_approved"
  | "approval_rejected"
  | "approval_complete"
  | "policy_due_soon"
  | "policy_overdue"
  | "training_assigned"
  | "training_completed"
  | "vendor_review_due"
  | "file_uploaded"
  | "comment_added"
  | "mention"
  | "system"
  | "connected"; // Internal type for SSE handshake

export interface Notification {
  id?: number;
  type: NotificationType;
  title?: string;
  message?: string;
  entity_type?: string | null;
  entity_id?: number | null;
  entity_name?: string | null;
  action_url?: string | null;
  is_read?: boolean;
  read_at?: string | null;
  created_at?: string;
  // Legacy fields for backwards compatibility
  entityId?: number;
  entityType?: string;
}

export interface NotificationSummary {
  unread_count: number;
  total_count: number;
  recent_notifications: Notification[];
}

/** Number of notifications to fetch per page */
const PAGE_SIZE = 10;

interface UseNotificationsOptions {
  /** Enable notifications (default: true) */
  enabled?: boolean;
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Reconnect delay in milliseconds (default: 3000) */
  reconnectDelay?: number;
  /** Callback function to be called when a notification is received */
  onNotification?: (notification: Notification) => void;
  /** Fetch stored notifications on mount (default: true) */
  fetchOnMount?: boolean;
}

interface UseNotificationsReturn {
  /** Real-time connection status */
  isConnected: boolean;
  /** Manually reconnect to SSE */
  reconnect: () => void;
  /** Disconnect from SSE */
  disconnect: () => void;
  /** List of recent notifications */
  notifications: Notification[];
  /** Number of unread notifications */
  unreadCount: number;
  /** Total number of notifications */
  totalCount: number;
  /** Loading state for initial fetch */
  isLoading: boolean;
  /** Loading state for load more */
  isLoadingMore: boolean;
  /** Whether there are more notifications to load */
  hasMore: boolean;
  /** Mark a notification as read */
  markAsRead: (notificationId: number) => Promise<void>;
  /** Mark all notifications as read */
  markAllAsRead: () => Promise<void>;
  /** Refresh notifications from server */
  refresh: () => Promise<void>;
  /** Load more notifications */
  loadMore: () => Promise<void>;
}

/**
 * Hook to manage real-time notifications via SSE
 *
 * @param options - Configuration options for the notification system
 * @returns Object with connection status and manual control functions
 *
 * @example
 * ```tsx
 * function NotificationBell() {
 *   const { notifications, unreadCount, markAsRead, markAllAsRead, isConnected } = useNotifications();
 *
 *   return (
 *     <div>
 *       <Bell />
 *       {unreadCount > 0 && <Badge>{unreadCount}</Badge>}
 *       {notifications.map(n => (
 *         <div key={n.id} onClick={() => markAsRead(n.id!)}>
 *           {n.title}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export const useNotifications = (options: UseNotificationsOptions = {}): UseNotificationsReturn => {
  const {
    enabled = true,
    autoReconnect = true,
    reconnectDelay = 3000,
    onNotification,
    fetchOnMount = true,
  } = options;

  // State for stored notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const authToken = useSelector((state: RootState) => state.auth.authToken);
  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isManuallyDisconnectedRef = useRef(false);

  /**
   * Fetch notification summary from server
   */
  const fetchNotifications = useCallback(async () => {
    if (!authToken) return;

    setIsLoading(true);
    try {
      const response = await apiServices.get<{ data: NotificationSummary }>("/notifications/summary");
      const summary: NotificationSummary = response.data.data;
      setNotifications(summary.recent_notifications);
      setUnreadCount(summary.unread_count);
      setTotalCount(summary.total_count);
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setIsLoading(false);
    }
  }, [authToken]);

  /**
   * Load more notifications (pagination)
   */
  const loadMore = useCallback(async () => {
    if (!authToken || isLoadingMore) return;

    const currentOffset = notifications.length;

    // Don't load if we already have all notifications
    if (currentOffset >= totalCount) return;

    setIsLoadingMore(true);
    try {
      const response = await apiServices.get<{ data: Notification[] }>(
        `/notifications?limit=${PAGE_SIZE}&offset=${currentOffset}`
      );
      const moreNotifications: Notification[] = response.data.data;

      // Append to existing notifications, avoiding duplicates
      setNotifications(prev => {
        const existingIds = new Set(prev.map(n => n.id));
        const newNotifications = moreNotifications.filter(n => !existingIds.has(n.id));
        return [...prev, ...newNotifications];
      });
    } catch (error) {
      console.error("Failed to load more notifications:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [authToken, isLoadingMore, notifications.length, totalCount]);

  /**
   * Mark a notification as read
   */
  const markAsRead = useCallback(async (notificationId: number) => {
    try {
      await apiServices.patch(`/notifications/${notificationId}/read`);
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId
            ? { ...n, is_read: true, read_at: new Date().toISOString() }
            : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
      throw error;
    }
  }, []);

  /**
   * Mark all notifications as read
   */
  const markAllAsRead = useCallback(async () => {
    try {
      await apiServices.patch("/notifications/read-all");
      setNotifications(prev =>
        prev.map(n => ({
          ...n,
          is_read: true,
          read_at: n.read_at || new Date().toISOString(),
        }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
      throw error;
    }
  }, []);

  /**
   * Refresh notifications from server
   */
  const refresh = useCallback(async () => {
    await fetchNotifications();
  }, [fetchNotifications]);

  /**
   * Display notification using existing alert system
   */
  const displayNotification = useCallback((notification: Notification) => {
    // Skip "connected" type - it's just for internal handshake
    if (notification.type === "connected") {
      return;
    }

    // Call the onNotification callback if provided
    if (onNotification) {
      onNotification(notification);
    }

    // Add to local state if it has an ID (stored notification)
    if (notification.id) {
      setNotifications(prev => {
        // Prevent duplicates
        if (prev.some(n => n.id === notification.id)) return prev;
        // Add to beginning (no limit since we support pagination now)
        return [notification, ...prev];
      });
      if (!notification.is_read) {
        setUnreadCount(prev => prev + 1);
      }
      setTotalCount(prev => prev + 1);
    }

    // Map notification types to alert variants
    const alertVariants: Record<string, "success" | "info" | "warning" | "error"> = {
      task_assigned: "info",
      task_completed: "success",
      review_requested: "info",
      review_approved: "success",
      review_rejected: "warning",
      approval_requested: "info",
      approval_approved: "success",
      approval_rejected: "error",
      approval_complete: "success",
      policy_due_soon: "warning",
      policy_overdue: "error",
      training_assigned: "info",
      training_completed: "success",
      vendor_review_due: "warning",
      file_uploaded: "info",
      comment_added: "info",
      mention: "info",
      system: "info",
    };

    const variant = alertVariants[notification.type] || "info";

    showAlert({
      variant,
      title: notification.title,
      body: notification.message || "You have a new notification",
    });
  }, [onNotification]);

  /**
   * Connect to SSE endpoint using fetch() with Authorization header
   */
  const connect = useCallback(async () => {
    // Don't connect if disabled or no auth token
    if (!enabled || !authToken) {
      return;
    }

    // Clean up existing connection
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Clear any pending reconnect attempts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      const url = `${ENV_VARs.URL}/api/notifications/stream`;
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      isManuallyDisconnectedRef.current = false;

      // Use fetch() instead of EventSource to send custom headers
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${authToken}`,
        'Accept': 'text/event-stream',
      };

      // Include X-Organization-Id for super-admin org context
      const activeOrgId = store.getState().auth.activeOrganizationId;
      if (activeOrgId) {
        headers['X-Organization-Id'] = String(activeOrgId);
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      setIsConnected(true);

      // Read the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Process the stream
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // Decode the chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete messages (separated by \n\n)
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || ''; // Keep incomplete message in buffer

        for (const message of messages) {
          if (!message.trim()) continue;

          // Parse SSE message format
          const lines = message.split('\n');
          let data = '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              data = line.substring(6); // Remove "data: " prefix
            } else if (line.startsWith(':')) {
              // Ignore comments (heartbeat)
              continue;
            }
          }

          if (data) {
            try {
              const notification: Notification = JSON.parse(data);
              displayNotification(notification);
            } catch (_error) {
              // Silently ignore parsing errors
            }
          }
        }
      }

      // Stream ended, reconnect if not manually disconnected
      setIsConnected(false);
      if (autoReconnect && !isManuallyDisconnectedRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, reconnectDelay);
      }
    } catch (error: any) {
      setIsConnected(false);

      // Don't reconnect if manually aborted
      if (error.name === 'AbortError') {
        return;
      }

      // Auto-reconnect if enabled and not manually disconnected
      if (autoReconnect && !isManuallyDisconnectedRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, reconnectDelay);
      }
    }
  }, [enabled, authToken, autoReconnect, reconnectDelay, displayNotification]);

  /**
   * Disconnect from SSE endpoint
   */
  const disconnect = useCallback(() => {
    isManuallyDisconnectedRef.current = true;
    setIsConnected(false);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  /**
   * Manually trigger reconnection
   */
  const reconnect = useCallback(() => {
    disconnect();
    setTimeout(() => {
      isManuallyDisconnectedRef.current = false;
      connect();
    }, 100);
  }, [connect, disconnect]);

  // Auto-connect on mount and when dependencies change
  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Reconnect when tab becomes visible or network comes back online
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isConnected && !isManuallyDisconnectedRef.current) {
        // Tab became visible and we're not connected - reconnect
        connect();
      }
    };

    const handleOnline = () => {
      if (!isConnected && !isManuallyDisconnectedRef.current) {
        // Network came back - reconnect
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [connect, isConnected]);

  // Fetch stored notifications on mount
  useEffect(() => {
    if (fetchOnMount && authToken) {
      fetchNotifications();
    }
  }, [fetchOnMount, authToken, fetchNotifications]);

  // Calculate if there are more notifications to load
  const hasMore = notifications.length < totalCount;

  return {
    isConnected,
    reconnect,
    disconnect,
    notifications,
    unreadCount,
    totalCount,
    isLoading,
    isLoadingMore,
    hasMore,
    markAsRead,
    markAllAsRead,
    refresh,
    loadMore,
  };
};
