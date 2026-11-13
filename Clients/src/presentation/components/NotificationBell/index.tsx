import React, { useState, useCallback } from "react";
import {
  IconButton,
  Badge,
  Popover,
  Box,
  Typography,
  Stack,
  Divider,
  CircularProgress,
} from "@mui/material";
import { Bell, CheckCheck, X, ExternalLink, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import { useNotifications, Notification } from "../../../application/hooks/useNotifications";
import VWTooltip from "../VWTooltip";
import "../Layout/icon-shake.css";

import { text, palette as vwPalette, radiusPx } from "../../themes/palette";
import useFormattedDate from "../../../application/hooks/useFormattedDate";

/**
 * Rewrite legacy action_url values that were stored in older notifications
 * before the server-side route mapping was corrected. Each rule rewrites a
 * path pattern to the frontend route that actually exists.
 */
const LEGACY_URL_REWRITES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /^\/training\/(\d+)/, replacement: "/training?trainingId=$1" },
  { pattern: /^\/vendors\/(\d+)/, replacement: "/vendors?vendorId=$1" },
  { pattern: /^\/policies\/(\d+)$/, replacement: "/policies/$1/edit" },
  { pattern: /^\/use-cases\/(\d+)/, replacement: "/project-view?projectId=$1" },
  { pattern: /^\/projects\/(\d+)/, replacement: "/project-view?projectId=$1" },
  { pattern: /^\/policys\/(\d+)/, replacement: "/policies/$1/edit" },
  { pattern: /^\/models\/(\d+)/, replacement: "/model-inventory/models/$1" },
  { pattern: /^\/risks\/(\d+)/, replacement: "/risk-management?riskId=$1" },
  { pattern: /^\/assessments\/(\d+)/, replacement: "/project-view?projectId=$1" },
  { pattern: /^\/files\/(\d+)/, replacement: "/file-manager?fileId=$1" },
  { pattern: /^\/approval-requests(?:\?|$|\/)/, replacement: "/approval-workflows" },
];

const repairLegacyActionUrl = (url: string): string => {
  if (!url.startsWith("/")) return url;
  for (const { pattern, replacement } of LEGACY_URL_REWRITES) {
    if (pattern.test(url)) return url.replace(pattern, replacement);
  }
  return url;
};

/**
 * Format relative time from ISO string
 */
const formatRelativeTime = (
  dateString: string,
  formatDate: ReturnType<typeof useFormattedDate>,
): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(date);
};

/**
 * Get icon color based on notification type
 */
const getNotificationColor = (type: string): string => {
  const colors: Record<string, string> = {
    task_assigned: vwPalette.status.info.text, // Blue
    task_completed: vwPalette.status.success.strong, // Green
    review_requested: vwPalette.accent.purple.text, // Purple
    review_approved: vwPalette.status.success.strong, // Green
    review_rejected: vwPalette.riskMark.critical, // Red
    approval_requested: vwPalette.riskMark.medium, // Amber
    approval_approved: vwPalette.status.success.strong, // Green
    approval_rejected: vwPalette.riskMark.critical, // Red
    approval_complete: vwPalette.status.success.strong, // Green
    policy_due_soon: vwPalette.riskMark.medium, // Amber
    policy_overdue: vwPalette.riskMark.critical, // Red
    training_assigned: vwPalette.status.info.text, // Blue
    training_completed: vwPalette.status.success.strong, // Green
    training_due_soon: vwPalette.riskMark.medium, // Amber
    training_overdue: vwPalette.riskMark.critical, // Red
    vendor_review_due: vwPalette.riskMark.medium, // Amber
    file_uploaded: vwPalette.chart[0], // Indigo
    comment_added: vwPalette.chart[0], // Indigo
    mention: vwPalette.chart[1], // Pink
    system: vwPalette.text.icon, // Slate
  };
  return colors[type] || vwPalette.text.icon;
};

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: number) => void;
  onNavigate: (url: string) => void;
  onDelete: (id: number) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onMarkAsRead,
  onNavigate,
  onDelete,
}) => {
  const formatDate = useFormattedDate();
  const isRead = notification.is_read;
  const color = getNotificationColor(notification.type);

  const handleClick = () => {
    if (notification.id && !isRead) {
      onMarkAsRead(notification.id);
    }
    if (notification.action_url) {
      onNavigate(notification.action_url);
    }
  };

  const handleDelete = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (notification.id) {
      onDelete(notification.id);
    }
  };

  return (
    <Box
      onClick={handleClick}
      sx={{
        "display": "flex",
        "alignItems": "flex-start",
        "gap": 1.5,
        "pl": "24px",
        "pr": "24px",
        "py": "8px",
        "cursor": notification.action_url ? "pointer" : "default",
        "backgroundColor": isRead ? "transparent" : "rgba(19, 113, 91, 0.04)",
        "borderLeft": isRead ? "3px solid transparent" : `3px solid ${color}`,
        "transition": "all 0.15s ease",
        "position": "relative",
        "&:hover": {
          backgroundColor: "rgba(0, 0, 0, 0.02)",
        },
        "&:hover .notification-delete-btn": {
          opacity: 1,
        },
      }}
    >
      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: "13px",
            fontWeight: isRead ? 400 : 600,
            color: "text.primary",
            lineHeight: 1.4,
            mb: 0.25,
          }}
        >
          {notification.title}
        </Typography>
        {notification.message && (
          <Typography
            sx={{
              fontSize: "12px",
              color: "text.secondary",
              lineHeight: 1.4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {notification.message}
          </Typography>
        )}
        <Typography
          sx={{
            fontSize: "11px",
            color: "text.disabled",
            mt: 0.5,
          }}
        >
          {notification.created_at && formatRelativeTime(notification.created_at, formatDate)}
        </Typography>
      </Box>

      {/* Action icon */}
      {notification.action_url && (
        <ExternalLink size={14} color={text.disabled} style={{ flexShrink: 0, marginTop: 2 }} />
      )}

      {/* Delete button (visible on hover) */}
      <VWTooltip header="Delete" content="Delete this notification" placement="left">
        <IconButton
          className="notification-delete-btn"
          size="small"
          onClick={handleDelete}
          aria-label="Delete notification"
          sx={{
            "opacity": 0,
            "transition": "opacity 0.15s ease",
            "width": "24px",
            "height": "24px",
            "marginTop": "-2px",
            "color": text.disabled,
            "&:hover": {
              backgroundColor: "rgba(239, 68, 68, 0.08)",
              color: vwPalette.riskMark.critical,
            },
          }}
        >
          <Trash2 size={14} />
        </IconButton>
      </VWTooltip>
    </Box>
  );
};

interface NotificationBellProps {
  /** Custom style overrides */
  sx?: object;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ sx }) => {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const {
    notifications,
    unreadCount,
    totalCount,
    isLoading,
    isLoadingMore,
    hasMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    loadMore,
    isConnected,
  } = useNotifications();

  const handleOpen = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleMarkAsRead = useCallback(
    async (notificationId: number) => {
      try {
        await markAsRead(notificationId);
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
      }
    },
    [markAsRead],
  );

  const handleMarkAllAsRead = useCallback(async () => {
    try {
      await markAllAsRead();
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    }
  }, [markAllAsRead]);

  const handleDelete = useCallback(
    async (notificationId: number) => {
      try {
        await deleteNotification(notificationId);
      } catch (error) {
        console.error("Failed to delete notification:", error);
      }
    },
    [deleteNotification],
  );

  const handleNavigate = useCallback(
    (url: string) => {
      handleClose();
      const repaired = repairLegacyActionUrl(url);
      if (repaired.startsWith("/")) {
        navigate(repaired);
      } else {
        window.open(repaired, "_blank");
      }
    },
    [navigate, handleClose],
  );

  const handleLoadMore = useCallback(async () => {
    try {
      await loadMore();
    } catch (error) {
      console.error("Failed to load more notifications:", error);
    }
  }, [loadMore]);

  const open = Boolean(anchorEl);

  const baseStyles = {
    "width": "32px",
    "height": "32px",
    "borderRadius": radiusPx.sm,
    "transition": "all 0.2s ease",
    "backgroundColor": "transparent",
    "color": vwPalette.text.tertiary,
    "border": `1px solid ${vwPalette.border.light}`,
    "&:hover": {
      backgroundColor: "rgba(0, 0, 0, 0.04)",
      borderColor: "border.dark",
    },
    "&:hover svg": {
      animation: "icon-shake 400ms ease-in-out",
    },
  };

  return (
    <>
      <VWTooltip
        header="Notifications"
        content={isConnected ? "View your notifications" : "Connecting..."}
        placement="bottom"
        maxWidth={200}
      >
        <IconButton
          size="small"
          onClick={handleOpen}
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          aria-haspopup="dialog"
          aria-expanded={open}
          sx={{ ...baseStyles, ...sx }}
        >
          <Badge
            badgeContent={unreadCount}
            max={99}
            sx={{
              "& .MuiBadge-badge": {
                backgroundColor: vwPalette.riskMark.critical,
                color: "white",
                fontSize: "10px",
                fontWeight: 600,
                minWidth: "16px",
                height: "16px",
                padding: "0 4px",
              },
            }}
          >
            <Bell size={16} />
          </Badge>
        </IconButton>
      </VWTooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        sx={{
          "& .MuiPopover-paper": {
            width: 360,
            maxHeight: 480,
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.12)",
            borderRadius: radiusPx.lg,
            border: "1px solid status.default.border",
            mt: 1,
            overflow: "hidden",
          },
        }}
      >
        {/* Header with title and action buttons */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 2,
            py: 1,
            borderBottom: `1px solid ${vwPalette.border.light}`,
          }}
        >
          <Stack direction="row" alignItems="baseline" spacing={1}>
            <Typography
              sx={{
                fontSize: "14px",
                fontWeight: 600,
                color: "text.primary",
              }}
            >
              Notifications
            </Typography>
            {totalCount > 0 && (
              <Typography
                sx={{
                  fontSize: "12px",
                  color: "text.disabled",
                  fontWeight: 500,
                }}
              >
                {totalCount}
              </Typography>
            )}
          </Stack>
          <Stack direction="row" spacing={0.5}>
            {unreadCount > 0 && (
              <VWTooltip
                header="Mark all as read"
                content="Mark all notifications as read"
                placement="bottom"
              >
                <IconButton
                  size="small"
                  onClick={handleMarkAllAsRead}
                  aria-label="Mark all notifications as read"
                  sx={{
                    "width": "28px",
                    "height": "28px",
                    "&:hover": {
                      backgroundColor: "rgba(19, 113, 91, 0.08)",
                      color: "brand.primary",
                    },
                  }}
                >
                  <CheckCheck size={16} />
                </IconButton>
              </VWTooltip>
            )}
            <IconButton
              size="small"
              onClick={handleClose}
              aria-label="Close notifications"
              sx={{
                "width": "28px",
                "height": "28px",
                "&:hover": {
                  backgroundColor: "rgba(0, 0, 0, 0.04)",
                },
              }}
            >
              <X size={16} />
            </IconButton>
          </Stack>
        </Box>

        {/* Content */}
        <Box
          sx={{
            "maxHeight": 400,
            "overflowY": "auto",
            "&::-webkit-scrollbar": { width: "6px" },
            "&::-webkit-scrollbar-track": { background: "transparent" },
            "&::-webkit-scrollbar-thumb": {
              background: vwPalette.border.light,
              borderRadius: "3px",
            },
            "&::-webkit-scrollbar-thumb:hover": {
              backgroundColor: "border.dark",
            },
          }}
        >
          {isLoading ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                py: 6,
              }}
            >
              <CircularProgress size={24} sx={{ color: "brand.primary" }} />
            </Box>
          ) : notifications.length === 0 ? (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                pt: 6,
                pb: "32px",
                px: 2,
              }}
            >
              <Bell size={24} strokeWidth={1.5} color={vwPalette.border.dark} />
              <Typography
                sx={{
                  fontSize: "14px",
                  color: "text.secondary",
                  mt: 1.5,
                  textAlign: "center",
                }}
              >
                No notifications yet
              </Typography>
              <Typography
                sx={{
                  fontSize: "12px",
                  color: "text.disabled",
                  mt: 0.5,
                  textAlign: "center",
                }}
              >
                You'll see updates here when there's activity
              </Typography>
            </Box>
          ) : (
            <>
              <Stack divider={<Divider sx={{ borderColor: "background.hover" }} />}>
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id || `${notification.type}-${notification.created_at}`}
                    notification={notification}
                    onMarkAsRead={handleMarkAsRead}
                    onNavigate={handleNavigate}
                    onDelete={handleDelete}
                  />
                ))}
              </Stack>

              {/* Load more button */}
              {hasMore && (
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    py: "8px",
                    borderTop: "1px solid background.hover",
                  }}
                >
                  <Box
                    component="button"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    sx={{
                      "display": "flex",
                      "alignItems": "center",
                      "justifyContent": "center",
                      "gap": 1,
                      "px": 3,
                      "py": 1,
                      "fontSize": "13px",
                      "fontWeight": 500,
                      "color": "brand.primary",
                      "backgroundColor": "transparent",
                      "border": `1px solid ${vwPalette.border.dark}`,
                      "borderRadius": radiusPx.sm,
                      "cursor": isLoadingMore ? "not-allowed" : "pointer",
                      "transition": "all 0.15s ease",
                      "opacity": isLoadingMore ? 0.6 : 1,
                      "&:hover": {
                        backgroundColor: "rgba(19, 113, 91, 0.04)",
                        borderColor: "brand.primary",
                      },
                    }}
                  >
                    {isLoadingMore ? (
                      <>
                        <CircularProgress size={14} sx={{ color: "brand.primary" }} />
                        Loading...
                      </>
                    ) : (
                      "Load more"
                    )}
                  </Box>
                </Box>
              )}
            </>
          )}
        </Box>

        {/* Footer - connection status */}
        {!isConnected && (
          <Box
            sx={{
              px: 2,
              py: 1,
              borderTop: "1px solid status.default.border",
              backgroundColor: vwPalette.risk.medium.bg,
            }}
          >
            <Typography
              sx={{
                fontSize: "11px",
                color: vwPalette.status.warning.text,
                display: "flex",
                alignItems: "center",
                gap: 0.5,
              }}
            >
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: vwPalette.riskMark.medium,
                }}
              />
              Reconnecting to real-time updates...
            </Typography>
          </Box>
        )}
      </Popover>
    </>
  );
};

export default NotificationBell;
