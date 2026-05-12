import { Box, Typography, Stack, CircularProgress, useTheme, Collapse } from "@mui/material";
import VWAvatar from "../../Avatar/VWAvatar";
import React from "react";
import { Clock } from "lucide-react";
import {
  useEntityChangeHistory,
  EntityChangeHistoryEntry,
} from "../../../../application/hooks/useEntityChangeHistory";
import { useAuth } from "../../../../application/hooks/useAuth";
import { useProfilePhotoFetch } from "../../../../application/hooks/useProfilePhotoFetch";
import { EntityType, getEntityHistoryConfig } from "../../../../config/changeHistory.config";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

const MAX_VALUE_LENGTH = 200; // Truncate values longer than this

interface HistorySidebarProps {
  isOpen: boolean;
  entityType: EntityType;
  entityId?: number;
  height?: string | number;
  /** When true, renders without Collapse wrapper at full width (for use inside a tab) */
  inline?: boolean;
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

export function HistorySidebar({
  isOpen,
  entityType,
  entityId,
  height = "auto",
  inline = false,
}: HistorySidebarProps) {
  const theme = useTheme();
  const { userId: currentUserId } = useAuth();
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useEntityChangeHistory(isOpen ? entityType : undefined, isOpen ? entityId : undefined);
  const { fetchProfilePhotoAsBlobUrl } = useProfilePhotoFetch();

  // Flatten all pages into a single history array
  const history = React.useMemo(() => {
    if (!data) return [];
    return data.pages.flatMap((page) => page.data);
  }, [data]);
  const [avatarUrls, setAvatarUrls] = React.useState<{ [userId: number]: string | null }>({});
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = React.useState(false);
  const [, setCurrentTime] = React.useState(Date.now());
  const [expandedValues, setExpandedValues] = React.useState<Set<string>>(new Set());

  const config = getEntityHistoryConfig(entityType);

  // Update relative timestamps every minute
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000); // Update every 60 seconds

    return () => clearInterval(interval);
  }, []);

  // Check if content overflows to show fade overlay
  React.useEffect(() => {
    const checkOverflow = () => {
      if (scrollContainerRef.current) {
        const { scrollHeight, clientHeight } = scrollContainerRef.current;
        setShowFade(scrollHeight > clientHeight);
      }
    };

    checkOverflow();
    // Re-check when history changes or loading state changes
  }, [history, isLoading]);

  // Fetch avatars for all users in the history
  React.useEffect(() => {
    const fetchAvatars = async () => {
      const uniqueUserIds = Array.from(new Set(history.map((entry) => entry.changed_by_user_id)));

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
  }, [history, fetchProfilePhotoAsBlobUrl]);

  // Group history entries by change event (by changed_at timestamp)
  const groupedHistory = React.useMemo(() => {
    const groups: { [key: string]: EntityChangeHistoryEntry[] } = {};

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
      return new Date(b[0].changed_at).getTime() - new Date(a[0].changed_at).getTime();
    });
  }, [history]);

  // Find the creation entry for the header
  const creationEntry = React.useMemo(() => {
    return history.find((entry) => entry.action === "created");
  }, [history]);

  const creationInfo = React.useMemo(() => {
    if (!creationEntry) return null;

    const isCurrentUser = creationEntry.changed_by_user_id === currentUserId;

    // Handle deleted users (changed_by_user_id is NULL)
    const creatorName = !creationEntry.changed_by_user_id
      ? "a deleted user"
      : isCurrentUser
        ? "you"
        : creationEntry.user_name && creationEntry.user_surname
          ? `${creationEntry.user_name} ${creationEntry.user_surname}`
          : creationEntry.user_email || "an unknown user";

    const creationDate = dayjs(creationEntry.changed_at).format("MMMM D, YYYY");
    const creationTime = dayjs(creationEntry.changed_at).format("h:mm A");

    return { creatorName, creationDate, creationTime };
  }, [creationEntry, currentUserId]);

  // Find the most recent update for fallback header
  const lastUpdateInfo = React.useMemo(() => {
    if (history.length === 0) return null;

    // Sort history by timestamp and get the most recent
    const sortedHistory = [...history].sort(
      (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime(),
    );
    const lastEntry = sortedHistory[0];

    const updateDate = dayjs(lastEntry.changed_at).format("MMMM D, YYYY");
    const updateTime = dayjs(lastEntry.changed_at).format("h:mm A");

    return { updateDate, updateTime };
  }, [history]);

  /**
   * Render a field value with truncation and expand/collapse functionality
   */
  const renderTruncatedValue = (entryId: number, value: string, type: "old" | "new") => {
    const key = `${entryId}-${type}`;
    const isExpanded = expandedValues.has(key);
    const shouldTruncate = value && value.length > MAX_VALUE_LENGTH;

    const displayValue =
      shouldTruncate && !isExpanded ? `${value.slice(0, MAX_VALUE_LENGTH)}...` : value;

    const isOldValue = type === "old";

    return (
      <>
        <Typography
          sx={{
            fontSize: 11,
            color: isOldValue ? theme.palette.error.dark : theme.palette.success.dark,
            fontWeight: 400,
            wordBreak: "break-word",
            textDecoration: isOldValue ? "line-through" : "none",
          }}
        >
          {displayValue}
        </Typography>
        {shouldTruncate && (
          <Typography
            onClick={() => {
              const newSet = new Set(expandedValues);
              if (isExpanded) {
                newSet.delete(key);
              } else {
                newSet.add(key);
              }
              setExpandedValues(newSet);
            }}
            sx={{
              "fontSize": 10,
              "color": theme.palette.primary.main,
              "fontWeight": 500,
              "cursor": "pointer",
              "marginTop": "4px",
              "&:hover": {
                textDecoration: "underline",
              },
            }}
          >
            {isExpanded ? "Show less" : "Show more"}
          </Typography>
        )}
      </>
    );
  };

  const renderHistoryEntry = (group: EntityChangeHistoryEntry[]) => {
    const firstEntry = group[0];
    const isCurrentUser = firstEntry.changed_by_user_id === currentUserId;

    // Handle deleted users (changed_by_user_id is NULL)
    const userName = !firstEntry.changed_by_user_id
      ? "Deleted User"
      : isCurrentUser
        ? "You"
        : firstEntry.user_name && firstEntry.user_surname
          ? `${firstEntry.user_name} ${firstEntry.user_surname}`
          : firstEntry.user_email || "Unknown User";

    const relativeTime = formatRelativeTime(firstEntry.changed_at);

    return (
      <Box
        key={`${firstEntry.changed_at}_${firstEntry.id}`}
        sx={{
          "marginBottom": "32px",
          "&:last-child": {
            marginBottom: 0,
          },
        }}
      >
        {/* Header */}
        <Stack direction="row" gap="8px" alignItems="center" marginBottom="8px">
          <VWAvatar
            user={{
              firstname: firstEntry.user_name || userName,
              lastname: firstEntry.user_surname || "",
              pathToImage: avatarUrls[firstEntry.changed_by_user_id] || undefined,
            }}
            size="small"
            sx={{
              width: 28,
              height: 28,
              fontSize: 11,
            }}
          />
          <Box sx={{ flex: 1 }}>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 500,
                color: theme.palette.text.primary,
                textDecoration: firstEntry.action === "updated" ? "underline" : "none",
              }}
            >
              {firstEntry.action === "created" && `${userName} created this ${config.entityName}`}
              {firstEntry.action === "updated" &&
                `${userName} updated ${group.length} field${group.length > 1 ? "s" : ""}`}
              {firstEntry.action === "deleted" && `${userName} deleted this ${config.entityName}`}
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
                "marginBottom": "8px",
                "paddingLeft": "36px",
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
              {entry.action === "created" && entry.new_value && entry.new_value !== "-" ? (
                <Box
                  sx={{
                    padding: "4px 8px",
                    borderRadius: "4px",
                    backgroundColor: theme.palette.success.bg,
                  }}
                >
                  {renderTruncatedValue(entry.id, entry.new_value, "new")}
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
                        backgroundColor: theme.palette.error.bg,
                      }}
                    >
                      {renderTruncatedValue(entry.id, entry.old_value, "old")}
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
                        backgroundColor: theme.palette.success.bg,
                      }}
                    >
                      {renderTruncatedValue(entry.id, entry.new_value, "new")}
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

  const content = (
    <Box
      sx={{
        width: inline ? "100%" : "320px",
        height: height,
        marginLeft: inline ? 0 : "16px",
        marginTop: inline ? "8px" : 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box
        sx={{
          flex: 1,
          border: `1px solid ${theme.palette.border.light}`,
          borderRadius: "4px",
          display: "flex",
          flexDirection: "column",
          background: `linear-gradient(180deg, ${theme.palette.background.alt} 0%, ${theme.palette.background.main} 100%)`,
          overflow: "hidden",
          maxHeight: "450px",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            padding: "16px",
            borderBottom: `1px solid ${theme.palette.divider}`,
            background: `linear-gradient(180deg, ${theme.palette.background.main} 0%, ${theme.palette.background.fill} 100%)`,
          }}
        >
          {creationInfo ? (
            <Typography
              sx={{
                fontSize: 11,
                color: theme.palette.text.secondary,
              }}
            >
              <Box component="span" sx={{ fontWeight: 400 }}>
                Created by
              </Box>{" "}
              <Box component="span" sx={{ fontWeight: 600 }}>
                {creationInfo.creatorName}
              </Box>{" "}
              <Box component="span" sx={{ fontWeight: 400 }}>
                on
              </Box>{" "}
              <Box component="span" sx={{ fontWeight: 600 }}>
                {creationInfo.creationDate} at {creationInfo.creationTime}
              </Box>
            </Typography>
          ) : lastUpdateInfo ? (
            <Typography
              sx={{
                fontSize: 11,
                color: theme.palette.text.secondary,
              }}
            >
              <Box component="span" sx={{ fontWeight: 400 }}>
                Last updated on
              </Box>{" "}
              <Box component="span" sx={{ fontWeight: 600 }}>
                {lastUpdateInfo.updateDate} at {lastUpdateInfo.updateTime}
              </Box>
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
            ref={scrollContainerRef}
            sx={{
              "height": "100%",
              "overflow": "auto",
              "padding": "16px",
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
                background: theme.palette.border.dark,
              },
              "&::-webkit-scrollbar-thumb:hover": {
                background: theme.palette.text.secondary,
              },
              // Firefox scrollbar styling
              "scrollbarWidth": "thin",
              "scrollbarColor": "transparent transparent",
              "&:hover": {
                scrollbarColor: "#C1C7CD transparent",
              },
            }}
          >
            {isError ? (
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
                <Clock size={32} strokeWidth={1.5} color={theme.palette.error.main} opacity={0.6} />
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: theme.palette.text.primary,
                    marginTop: "16px",
                  }}
                >
                  Unable to load history
                </Typography>
                <Typography
                  sx={{
                    fontSize: 11,
                    color: theme.palette.text.secondary,
                    marginTop: "8px",
                    lineHeight: 1.6,
                  }}
                >
                  This {config.entityName.toLowerCase()} may have been deleted, or there was an
                  error loading the activity history.
                </Typography>
              </Box>
            ) : isLoading ? (
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
                <Clock
                  size={32}
                  strokeWidth={1.5}
                  color={theme.palette.primary.main}
                  opacity={0.6}
                />
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: theme.palette.text.primary,
                    marginTop: "16px",
                  }}
                >
                  {config.emptyStateTitle}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 11,
                    color: theme.palette.text.secondary,
                    marginTop: "8px",
                    lineHeight: 1.6,
                  }}
                >
                  {config.emptyStateMessage}
                </Typography>
              </Box>
            ) : (
              <>
                <Box>{groupedHistory.map(renderHistoryEntry)}</Box>

                {/* Load More Button */}
                {hasNextPage && (
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "center",
                      paddingTop: "16px",
                      paddingBottom: "8px",
                    }}
                  >
                    <Typography
                      onClick={() => !isFetchingNextPage && fetchNextPage()}
                      sx={{
                        "fontSize": 12,
                        "fontWeight": 500,
                        "color": isFetchingNextPage
                          ? theme.palette.text.disabled
                          : theme.palette.primary.main,
                        "cursor": isFetchingNextPage ? "default" : "pointer",
                        "&:hover": {
                          textDecoration: isFetchingNextPage ? "none" : "underline",
                        },
                      }}
                    >
                      {isFetchingNextPage ? "Loading..." : "Load more"}
                    </Typography>
                  </Box>
                )}
              </>
            )}
          </Box>
          {/* Bottom fade overlay - only show when content overflows */}
          {showFade && (
            <Box
              sx={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: "60px",
                background:
                  "linear-gradient(to bottom, rgba(248, 250, 251, 0) 0%, rgba(248, 250, 251, 0.8) 50%, rgba(248, 250, 251, 1) 100%)",
                pointerEvents: "none",
                borderRadius: "0 0 8px 8px",
              }}
            />
          )}
        </Box>
      </Box>
    </Box>
  );

  if (inline) {
    return content;
  }

  return (
    <Collapse
      in={isOpen}
      orientation="horizontal"
      timeout={300}
      sx={{
        alignSelf: "flex-start",
      }}
    >
      {content}
    </Collapse>
  );
}
