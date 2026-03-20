import React from "react";
import {
  Box,
  Typography,
  Stack,
  CircularProgress,
  useTheme,
  Collapse,
  Avatar,
} from "@mui/material";
import { Clock } from "lucide-react";
import {
  useModelInventoryChangeHistory,
  ModelInventoryChangeHistoryEntry,
} from "../../../application/hooks/useModelInventoryChangeHistory";
import { useAuth } from "../../../application/hooks/useAuth";
import { useProfilePhotoFetch } from "../../../application/hooks/useProfilePhotoFetch";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { brand } from "../../themes/palette";

dayjs.extend(relativeTime);

interface HistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  modelInventoryId?: number;
  expandedHeight?: boolean;
}

/**
 * Format date to human-readable relative time
 * - A few minutes/hours ago for recent activity
 * - Today/Yesterday with time for recent days
 * - Full date and time for older entries
 */
const formatRelativeTime = (date: string | Date): string => {
  const now = dayjs();
  const targetDate = dayjs(date);

  // Calculate absolute differences
  const diffMinutes = Math.abs(now.diff(targetDate, "minute"));
  const diffHours = Math.abs(now.diff(targetDate, "hour"));
  const diffDays = Math.abs(now.diff(targetDate, "day"));

  // Handle future dates (clock skew) - treat as "Just now"
  if (targetDate.isAfter(now) && diffMinutes <= 5) {
    return "Just now";
  }

  // Less than 1 hour ago
  if (diffMinutes < 60) {
    if (diffMinutes < 1) return "Just now";
    if (diffMinutes === 1) return "A minute ago";
    if (diffMinutes < 5) return "A few minutes ago";
    return `${diffMinutes} minutes ago`;
  }

  // Less than 24 hours ago (today)
  if (diffHours < 24 && targetDate.isSame(now, "day")) {
    if (diffHours === 1) return "An hour ago";
    if (diffHours < 3) return "A few hours ago";
    return `Today at ${targetDate.format("h:mm A")}`;
  }

  // Yesterday
  if (diffDays === 1 || (diffHours < 48 && targetDate.isSame(now.subtract(1, "day"), "day"))) {
    return `Yesterday at ${targetDate.format("h:mm A")}`;
  }

  // Older than yesterday - show full date and time
  return `${targetDate.format("MMMM D, YYYY")} at ${targetDate.format("h:mm A")}`;
};

const HistorySidebar: React.FC<HistorySidebarProps> = ({
  isOpen,
  modelInventoryId,
}) => {
  const theme = useTheme();
  const { userId: currentUserId } = useAuth();
  const { data, isLoading } = useModelInventoryChangeHistory(modelInventoryId);
  const { fetchProfilePhotoAsBlobUrl } = useProfilePhotoFetch();

  // Flatten all pages into a single history array
  const history = React.useMemo(() => {
    if (!data) return [];
    return data.pages.flatMap((page) => page.data);
  }, [data]);

  const [avatarUrls, setAvatarUrls] = React.useState<{ [userId: number]: string | null }>({});

  // Fetch avatars for all users in the history
  React.useEffect(() => {
    const fetchAvatars = async () => {
      const uniqueUserIds = Array.from(
        new Set(history.map((entry) => entry.changed_by_user_id))
      );

      // Batch fetch all avatars to avoid multiple re-renders
      const newAvatarUrls: { [userId: number]: string | null } = {};

      for (const userId of uniqueUserIds) {
        if (avatarUrls[userId] === undefined) {
          const avatarUrl = await fetchProfilePhotoAsBlobUrl(userId);
          newAvatarUrls[userId] = avatarUrl;
        }
      }

      // Update all avatars at once to prevent layout thrashing
      if (Object.keys(newAvatarUrls).length > 0) {
        setAvatarUrls((prev) => ({ ...prev, ...newAvatarUrls }));
      }
    };

    if (history.length > 0) {
      fetchAvatars();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]); // Only depend on history, not fetchProfilePhotoAsBlobUrl

  // Group history entries by change event (by changed_at timestamp)
  const groupedHistory = React.useMemo(() => {
    const groups: { [key: string]: ModelInventoryChangeHistoryEntry[] } = {};

    history.forEach((entry) => {
      // Only include entries with field_name (skip action-only markers)
      if (entry.field_name) {
        const key = `${entry.changed_at}_${entry.action}_${entry.changed_by_user_id}`;
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(entry);
      }
    });

    return Object.values(groups).sort((a, b) => {
      // Sort by timestamp descending (newest first)
      return (
        new Date(b[0].changed_at).getTime() -
        new Date(a[0].changed_at).getTime()
      );
    });
  }, [history]);

  // Find the creation entry for the header
  const creationEntry = React.useMemo(() => {
    return history.find((entry) => entry.action === "created");
  }, [history]);

  const creationInfo = React.useMemo(() => {
    if (!creationEntry) return null;

    const isCurrentUser = creationEntry.changed_by_user_id === currentUserId;
    const creatorName = isCurrentUser
      ? "you"
      : creationEntry.user_name && creationEntry.user_surname
      ? `${creationEntry.user_name} ${creationEntry.user_surname}`
      : creationEntry.user_email || "Unknown User";

    const creationDate = dayjs(creationEntry.changed_at).format("MMMM D, YYYY");
    const creationTime = dayjs(creationEntry.changed_at).format("h:mm A");

    return { creatorName, creationDate, creationTime };
  }, [creationEntry, currentUserId]);

  // Find the most recent update for fallback header
  const lastUpdateInfo = React.useMemo(() => {
    if (history.length === 0) return null;

    // Sort history by timestamp and get the most recent
    const sortedHistory = [...history].sort(
      (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
    );
    const lastEntry = sortedHistory[0];

    const updateDate = dayjs(lastEntry.changed_at).format("MMMM D, YYYY");
    const updateTime = dayjs(lastEntry.changed_at).format("h:mm A");

    return { updateDate, updateTime };
  }, [history]);

  const renderHistoryEntry = (group: ModelInventoryChangeHistoryEntry[]) => {
    const firstEntry = group[0];
    const isCurrentUser = firstEntry.changed_by_user_id === currentUserId;
    const userName = isCurrentUser
      ? "You"
      : firstEntry.user_name && firstEntry.user_surname
      ? `${firstEntry.user_name} ${firstEntry.user_surname}`
      : firstEntry.user_email || "Unknown User";

    const relativeTime = formatRelativeTime(firstEntry.changed_at);

    return (
      <Box
        key={`${firstEntry.changed_at}_${firstEntry.id}`}
        sx={{
          marginBottom: "32px",
          "&:last-child": {
            marginBottom: 0,
          },
        }}
      >
        {/* Header */}
        <Stack direction="row" gap="8px" alignItems="center" marginBottom="8px">
          <Avatar
            src={avatarUrls[firstEntry.changed_by_user_id] || undefined}
            alt={userName}
            sx={{
              width: 28,
              height: 28,
              backgroundColor: theme.palette.primary.main,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {userName.charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 500,
                color: theme.palette.text.primary,
                textDecoration: firstEntry.action === "updated" ? "underline" : "none",
              }}
            >
              {firstEntry.action === "created" &&
                `${userName} created this model`}
              {firstEntry.action === "updated" &&
                `${userName} updated ${group.length} field${
                  group.length > 1 ? "s" : ""
                }`}
              {firstEntry.action === "deleted" &&
                `${userName} deleted this model`}
            </Typography>
            <Stack direction="row" gap="8px" alignItems="center">
              <Clock size={10} color={theme.palette.text.secondary} />
              <Typography
                sx={{
                  fontSize: 10,
                  color: theme.palette.text.secondary,
                }}
              >
                {relativeTime}
              </Typography>
            </Stack>
          </Box>
        </Stack>

        {/* Field Changes */}
        {group.map((entry) => {
          if (!entry.field_name) return null;

          return (
            <Box
              key={entry.id}
              sx={{
                marginBottom: "8px",
                paddingLeft: "36px",
                "&:last-child": {
                  marginBottom: 0,
                },
              }}
            >
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: theme.palette.text.secondary,
                  marginBottom: "8px",
                }}
              >
                {entry.field_name}
              </Typography>

              {/* Show change based on action type */}
              {entry.action === "created" &&
              entry.new_value &&
              entry.new_value !== "-" ? (
                <Box
                  sx={{
                    padding: "4px 8px",
                    borderRadius: "4px",
                    backgroundColor: "#F1F8F4",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 11,
                      color: "#0D7C4F",
                      fontWeight: 400,
                      wordBreak: "break-word",
                    }}
                  >
                    {entry.new_value}
                  </Typography>
                </Box>
              ) : (
                <Stack direction="row" gap="8px" alignItems="center">
                  {/* Old Value */}
                  {entry.old_value && entry.old_value !== "-" && (
                    <Box
                      sx={{
                        flex: 1,
                        padding: "4px 8px",
                        borderRadius: "4px",
                        backgroundColor: "#FEF2F2",
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: 11,
                          color: "#B91C1C",
                          fontWeight: 400,
                          wordBreak: "break-word",
                          textDecoration: "line-through",
                        }}
                      >
                        {entry.old_value}
                      </Typography>
                    </Box>
                  )}

                  {/* Arrow */}
                  {entry.old_value &&
                    entry.old_value !== "-" &&
                    entry.new_value &&
                    entry.new_value !== "-" && (
                      <Typography
                        sx={{
                          fontSize: 14,
                          color: theme.palette.text.secondary,
                        }}
                      >
                        →
                      </Typography>
                    )}

                  {/* New Value */}
                  {entry.new_value && entry.new_value !== "-" && (
                    <Box
                      sx={{
                        flex: 1,
                        padding: "4px 8px",
                        borderRadius: "4px",
                        backgroundColor: "#F1F8F4",
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: 11,
                          color: "#0D7C4F",
                          fontWeight: 400,
                          wordBreak: "break-word",
                        }}
                      >
                        {entry.new_value}
                      </Typography>
                    </Box>
                  )}
                </Stack>
              )}
            </Box>
          );
        })}
      </Box>
    );
  };

  return (
    <Collapse
      in={isOpen}
      orientation="horizontal"
      timeout={300}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignSelf: "flex-start",
      }}
    >
      <Box
        sx={{
          width: "320px",
          marginLeft: "16px", // 16px padding from main content
          display: "flex",
          flexDirection: "column",
          alignSelf: "flex-start",
        }}
      >
        <Box
          sx={{
            height: "560px",
            border: `1px solid #E0E4E9`,
            borderRadius: "8px",
            display: "flex",
            flexDirection: "column",
            background: "linear-gradient(180deg, #FAFBFC 0%, #F8FAFB 100%)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <Box
            sx={{
              padding: "16px",
              borderBottom: `1px solid ${theme.palette.divider}`,
              background: "linear-gradient(180deg, #F8FAFB 0%, #F3F5F8 100%)",
            }}
          >
            {creationInfo ? (
              <Typography
                sx={{
                  fontSize: 11,
                  color: theme.palette.text.secondary,
                }}
              >
                <Box component="span" sx={{ fontWeight: 400 }}>Created by</Box>{" "}
                <Box component="span" sx={{ fontWeight: 600 }}>{creationInfo.creatorName}</Box>{" "}
                <Box component="span" sx={{ fontWeight: 400 }}>on</Box>{" "}
                <Box component="span" sx={{ fontWeight: 600 }}>{creationInfo.creationDate} at {creationInfo.creationTime}</Box>
              </Typography>
            ) : lastUpdateInfo ? (
              <Typography
                sx={{
                  fontSize: 11,
                  color: theme.palette.text.secondary,
                }}
              >
                <Box component="span" sx={{ fontWeight: 400 }}>Last updated on</Box>{" "}
                <Box component="span" sx={{ fontWeight: 600 }}>{lastUpdateInfo.updateDate} at {lastUpdateInfo.updateTime}</Box>
              </Typography>
            ) : (
              <Typography
                sx={{
                  fontSize: 11,
                  color: theme.palette.text.secondary,
                }}
              >
                No activity yet
              </Typography>
            )}
          </Box>

        {/* Content */}
        <Box
          sx={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              height: "100%",
              overflow: "auto",
              padding: "16px",
              // Custom scrollbar styling - invisible by default, visible on hover
              "&::-webkit-scrollbar": {
                width: "8px",
              },
              "&::-webkit-scrollbar-track": {
                background: "transparent",
              },
              "&::-webkit-scrollbar-thumb": {
                background: "transparent",
                borderRadius: "4px",
              },
              "&:hover::-webkit-scrollbar-thumb": {
                background: "#C1C7CD",
              },
              "&::-webkit-scrollbar-thumb:hover": {
                background: "text.muted",
              },
              // Firefox scrollbar styling
              scrollbarWidth: "thin",
              scrollbarColor: "transparent transparent",
              "&:hover": {
                scrollbarColor: "#C1C7CD transparent",
              },
            }}
          >
          {isLoading ? (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                minHeight: 200,
              }}
            >
              <CircularProgress size={28} />
            </Box>
          ) : groupedHistory.length === 0 ? (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 200,
                textAlign: "center",
                padding: "0 24px",
              }}
            >
              <Clock size={32} strokeWidth={1.5} color={brand.primary} opacity={0.6} />
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: theme.palette.text.primary,
                  marginTop: "16px",
                }}
              >
                Activity History
              </Typography>
              <Typography
                sx={{
                  fontSize: 11,
                  color: theme.palette.text.secondary,
                  marginTop: "8px",
                  lineHeight: 1.6,
                }}
              >
                Automatically tracks every change to this model.
              </Typography>
              <Typography
                sx={{
                  fontSize: 11,
                  color: theme.palette.text.secondary,
                  marginTop: "4px",
                  lineHeight: 1.6,
                }}
              >
                See what your team is working on and what updates they've made, in real time.
              </Typography>
            </Box>
          ) : (
            <Box>{groupedHistory.map(renderHistoryEntry)}</Box>
          )}
          </Box>
          {/* Bottom fade overlay */}
          <Box
            sx={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "60px",
              background: "linear-gradient(to bottom, rgba(248, 250, 251, 0) 0%, rgba(248, 250, 251, 0.8) 50%, rgba(248, 250, 251, 1) 100%)",
              pointerEvents: "none",
              borderRadius: "0 0 8px 8px",
            }}
          />
        </Box>
      </Box>
      </Box>
    </Collapse>
  );
};

export default HistorySidebar;
