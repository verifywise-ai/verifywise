import React, { useState, useCallback } from 'react';
import {
  IconButton,
  Badge,
  Popover,
  Box,
  Typography,
  Stack,
  Divider,
  CircularProgress,
} from '@mui/material';
import { Bell, CheckCheck, X, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, Notification } from '../../../application/hooks/useNotifications';
import VWTooltip from '../VWTooltip';
import '../Layout/icon-shake.css';

import { text } from "../../themes/palette";

/**
 * Format relative time from ISO string
 */
const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
};

/**
 * Get icon color based on notification type
 */
const getNotificationColor = (type: string): string => {
  const colors: Record<string, string> = {
    task_assigned: '#3B82F6',      // Blue
    task_completed: '#10B981',     // Green
    review_requested: '#8B5CF6',   // Purple
    review_approved: '#10B981',    // Green
    review_rejected: '#EF4444',    // Red
    approval_requested: '#F59E0B', // Amber
    approval_approved: '#10B981',  // Green
    approval_rejected: '#EF4444',  // Red
    approval_complete: '#10B981',  // Green
    policy_due_soon: '#F59E0B',    // Amber
    policy_overdue: '#EF4444',     // Red
    training_assigned: '#3B82F6',  // Blue
    training_completed: '#10B981', // Green
    vendor_review_due: '#F59E0B',  // Amber
    file_uploaded: '#6366F1',      // Indigo
    comment_added: '#6366F1',      // Indigo
    mention: '#EC4899',            // Pink
    system: '#64748B',             // Slate
  };
  return colors[type] || '#64748B';
};

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: number) => void;
  onNavigate: (url: string) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onMarkAsRead,
  onNavigate,
}) => {
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

  return (
    <Box
      onClick={handleClick}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
        pl: '24px',
        pr: '24px',
        py: '8px',
        cursor: notification.action_url ? 'pointer' : 'default',
        backgroundColor: isRead ? 'transparent' : 'rgba(19, 113, 91, 0.04)',
        borderLeft: isRead ? '3px solid transparent' : `3px solid ${color}`,
        transition: 'all 0.15s ease',
        '&:hover': {
          backgroundColor: 'rgba(0, 0, 0, 0.02)',
        },
      }}
    >
      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: '13px',
            fontWeight: isRead ? 400 : 600,
            color: 'text.primary',
            lineHeight: 1.4,
            mb: 0.25,
          }}
        >
          {notification.title}
        </Typography>
        {notification.message && (
          <Typography
            sx={{
              fontSize: '12px',
              color: 'text.secondary',
              lineHeight: 1.4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {notification.message}
          </Typography>
        )}
        <Typography
          sx={{
            fontSize: '11px',
            color: 'text.disabled',
            mt: 0.5,
          }}
        >
          {notification.created_at && formatRelativeTime(notification.created_at)}
        </Typography>
      </Box>

      {/* Action icon */}
      {notification.action_url && (
        <ExternalLink
          size={14}
          color={text.disabled}
          style={{ flexShrink: 0, marginTop: 2 }}
        />
      )}
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
    isLoading,
    isLoadingMore,
    hasMore,
    markAsRead,
    markAllAsRead,
    loadMore,
    isConnected,
  } = useNotifications();

  const handleOpen = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleMarkAsRead = useCallback(async (notificationId: number) => {
    try {
      await markAsRead(notificationId);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }, [markAsRead]);

  const handleMarkAllAsRead = useCallback(async () => {
    try {
      await markAllAsRead();
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  }, [markAllAsRead]);

  const handleNavigate = useCallback((url: string) => {
    handleClose();
    // Check if it's an internal URL
    if (url.startsWith('/')) {
      navigate(url);
    } else {
      // For external URLs, open in new tab
      window.open(url, '_blank');
    }
  }, [navigate, handleClose]);

  const handleLoadMore = useCallback(async () => {
    try {
      await loadMore();
    } catch (error) {
      console.error('Failed to load more notifications:', error);
    }
  }, [loadMore]);

  const open = Boolean(anchorEl);

  const baseStyles = {
    width: '32px',
    height: '32px',
    borderRadius: '4px',
    transition: 'all 0.2s ease',
    backgroundColor: 'transparent',
    color: '#666',
    border: '1px solid #e5e5e5',
    '&:hover': {
      backgroundColor: 'rgba(0, 0, 0, 0.04)',
      borderColor: 'border.dark',
    },
    '&:hover svg': {
      animation: 'icon-shake 400ms ease-in-out',
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
          sx={{ ...baseStyles, ...sx }}
        >
          <Badge
            badgeContent={unreadCount}
            max={99}
            sx={{
              '& .MuiBadge-badge': {
                backgroundColor: '#EF4444',
                color: 'white',
                fontSize: '10px',
                fontWeight: 600,
                minWidth: '16px',
                height: '16px',
                padding: '0 4px',
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
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        sx={{
          '& .MuiPopover-paper': {
            width: 360,
            maxHeight: 480,
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.12)',
            borderRadius: '8px',
            border: '1px solid status.default.border',
            mt: 1,
            overflow: 'hidden',
          },
        }}
      >
        {/* Header - minimal with just action buttons */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            px: 1,
            py: 0.5,
          }}
        >
          <Stack direction="row" spacing={0.5}>
            {unreadCount > 0 && (
              <VWTooltip header="Mark all as read" content="Mark all notifications as read" placement="bottom">
                <IconButton
                  size="small"
                  onClick={handleMarkAllAsRead}
                  sx={{
                    width: '28px',
                    height: '28px',
                    '&:hover': {
                      backgroundColor: 'rgba(19, 113, 91, 0.08)',
                      color: 'brand.primary',
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
              sx={{
                width: '28px',
                height: '28px',
                '&:hover': {
                  backgroundColor: 'rgba(0, 0, 0, 0.04)',
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
            maxHeight: 400,
            overflowY: 'auto',
            '&::-webkit-scrollbar': { width: '6px' },
            '&::-webkit-scrollbar-track': { background: 'transparent' },
            '&::-webkit-scrollbar-thumb': {
              background: '#e0e0e0',
              borderRadius: '3px',
            },
            '&::-webkit-scrollbar-thumb:hover': {
              backgroundColor: 'border.dark',
            },
          }}
        >
          {isLoading ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                py: 6,
              }}
            >
              <CircularProgress size={24} sx={{ color: 'brand.primary' }} />
            </Box>
          ) : notifications.length === 0 ? (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                pt: 6,
                pb: '32px',
                px: 2,
              }}
            >
              <Bell size={24} strokeWidth={1.5} color="#D1D5DB" />
              <Typography
                sx={{
                  fontSize: '14px',
                  color: 'text.secondary',
                  mt: 1.5,
                  textAlign: 'center',
                }}
              >
                No notifications yet
              </Typography>
              <Typography
                sx={{
                  fontSize: '12px',
                  color: 'text.disabled',
                  mt: 0.5,
                  textAlign: 'center',
                }}
              >
                You'll see updates here when there's activity
              </Typography>
            </Box>
          ) : (
            <>
              <Stack divider={<Divider sx={{ borderColor: 'background.hover' }} />}>
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id || `${notification.type}-${notification.created_at}`}
                    notification={notification}
                    onMarkAsRead={handleMarkAsRead}
                    onNavigate={handleNavigate}
                  />
                ))}
              </Stack>

              {/* Load more button */}
              {hasMore && (
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    py: '8px',
                    borderTop: '1px solid background.hover',
                  }}
                >
                  <Box
                    component="button"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 1,
                      px: 3,
                      py: 1,
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'brand.primary',
                      backgroundColor: 'transparent',
                      border: '1px solid #d0d5dd',
                      borderRadius: '4px',
                      cursor: isLoadingMore ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease',
                      opacity: isLoadingMore ? 0.6 : 1,
                      '&:hover': {
                        backgroundColor: 'rgba(19, 113, 91, 0.04)',
                        borderColor: 'brand.primary',
                      },
                    }}
                  >
                    {isLoadingMore ? (
                      <>
                        <CircularProgress size={14} sx={{ color: 'brand.primary' }} />
                        Loading...
                      </>
                    ) : (
                      'Load more'
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
              borderTop: '1px solid status.default.border',
              backgroundColor: '#FEF3C7',
            }}
          >
            <Typography
              sx={{
                fontSize: '11px',
                color: '#92400E',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: '#F59E0B',
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
