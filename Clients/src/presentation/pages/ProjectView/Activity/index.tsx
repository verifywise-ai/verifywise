/**
 * Activity tab component for ProjectView
 * Displays change history for the project's use cases
 */

import React from "react";
import {
  Box,
  Typography,
  Stack,
  CircularProgress,
  useTheme,
  Avatar,
} from "@mui/material";
import { Clock } from "lucide-react";
import {
  useEntityChangeHistory,
  EntityChangeHistoryEntry,
} from "../../../../application/hooks/useEntityChangeHistory";
import { useAuth } from "../../../../application/hooks/useAuth";
import { useProfilePhotoFetch } from "../../../../application/hooks/useProfilePhotoFetch";
import {
  EntityType,
  getEntityHistoryConfig,
} from "../../../../config/changeHistory.config";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { brand } from "../../../themes/palette";

dayjs.extend(relativeTime);

const MAX_VALUE_LENGTH = 200;

interface ActivityProps {
  entityType: EntityType;
  entityId: number;
}

const formatRelativeTime = (date: string | Date): string => {
  const now = dayjs();
  const targetDate = dayjs(date);

  const diffMinutes = Math.abs(now.diff(targetDate, "minute"));
  const diffHours = Math.abs(now.diff(targetDate, "hour"));
  const diffDays = Math.abs(now.diff(targetDate, "day"));

  if (targetDate.isAfter(now) && diffMinutes <= 5) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    if (diffMinutes < 1) return "Just now";
    if (diffMinutes === 1) return "A minute ago";
    if (diffMinutes < 5) return "A few minutes ago";
    return `${diffMinutes} minutes ago`;
  }

  if (diffHours < 24 && targetDate.isSame(now, "day")) {
    if (diffHours === 1) return "An hour ago";
    if (diffHours < 3) return "A few hours ago";
    return `Today at ${targetDate.format("h:mm A")}`;
  }

  if (diffDays === 1 || (diffHours < 48 && targetDate.isSame(now.subtract(1, "day"), "day"))) {
    return `Yesterday at ${targetDate.format("h:mm A")}`;
  }

  return `${targetDate.format("MMMM D, YYYY")} at ${targetDate.format("h:mm A")}`;
};

const Activity: React.FC<ActivityProps> = ({ entityType, entityId }) => {
  const theme = useTheme();
  const { userId: currentUserId } = useAuth();
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useEntityChangeHistory(entityType, entityId);
  const { fetchProfilePhotoAsBlobUrl } = useProfilePhotoFetch();

  const history = React.useMemo(() => {
    if (!data) return [];
    return data.pages.flatMap((page) => page.data);
  }, [data]);

  const [avatarUrls, setAvatarUrls] = React.useState<{ [userId: number]: string | null }>({});
  const [expandedValues, setExpandedValues] = React.useState<Set<string>>(new Set());

  const config = getEntityHistoryConfig(entityType);

  React.useEffect(() => {
    const fetchAvatars = async () => {
      const uniqueUserIds = Array.from(
        new Set(history.map((entry) => entry.changed_by_user_id))
      );

      const newAvatarUrls: { [userId: number]: string | null } = {};

      for (const userId of uniqueUserIds) {
        if (avatarUrls[userId] === undefined) {
          const avatarUrl = await fetchProfilePhotoAsBlobUrl(userId);
          newAvatarUrls[userId] = avatarUrl;
        }
      }

      if (Object.keys(newAvatarUrls).length > 0) {
        setAvatarUrls((prev) => ({ ...prev, ...newAvatarUrls }));
      }
    };

    if (history.length > 0) {
      fetchAvatars();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  const groupedHistory = React.useMemo(() => {
    const groups: { [key: string]: EntityChangeHistoryEntry[] } = {};

    history.forEach((entry) => {
      if (entry.field_name) {
        const key = `${entry.changed_at}_${entry.action}_${entry.changed_by_user_id}`;
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(entry);
      }
    });

    return Object.values(groups).sort((a, b) => {
      return (
        new Date(b[0].changed_at).getTime() -
        new Date(a[0].changed_at).getTime()
      );
    });
  }, [history]);

  const creationEntry = React.useMemo(() => {
    return history.find((entry) => entry.action === "created");
  }, [history]);

  const creationInfo = React.useMemo(() => {
    if (!creationEntry) return null;

    const isCurrentUser = creationEntry.changed_by_user_id === currentUserId;

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

  const renderTruncatedValue = (
    entryId: number,
    value: string,
    type: "old" | "new"
  ) => {
    const key = `${entryId}-${type}`;
    const isExpanded = expandedValues.has(key);
    const shouldTruncate = value && value.length > MAX_VALUE_LENGTH;

    const displayValue = shouldTruncate && !isExpanded
      ? `${value.slice(0, MAX_VALUE_LENGTH)}...`
      : value;

    const isOldValue = type === "old";

    return (
      <>
        <Typography
          sx={{
            fontSize: 13,
            color: isOldValue ? "#B91C1C" : "#0D7C4F",
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
              fontSize: 12,
              color: theme.palette.primary.main,
              fontWeight: 500,
              cursor: "pointer",
              marginTop: "4px",
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
          marginBottom: "32px",
          padding: "16px",
          backgroundColor: theme.palette.background.main,
          borderRadius: "8px",
          border: `1px solid #d0d5dd`,
          "&:last-child": {
            marginBottom: 0,
          },
        }}
      >
        <Stack direction="row" gap="12px" alignItems="center" marginBottom="16px">
          <Avatar
            src={avatarUrls[firstEntry.changed_by_user_id] || undefined}
            alt={userName}
            sx={{
              width: 36,
              height: 36,
              backgroundColor: theme.palette.primary.main,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {userName.charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography
              sx={{
                fontSize: 14,
                fontWeight: 500,
                color: theme.palette.text.primary,
              }}
            >
              {firstEntry.action === "created" &&
                `${userName} created this ${config.entityName}`}
              {firstEntry.action === "updated" &&
                `${userName} updated ${group.length} field${
                  group.length > 1 ? "s" : ""
                }`}
              {firstEntry.action === "deleted" &&
                `${userName} deleted this ${config.entityName}`}
            </Typography>
            <Stack direction="row" gap="8px" alignItems="center">
              <Clock size={12} color={theme.palette.text.secondary} />
              <Typography
                sx={{
                  fontSize: 12,
                  color: theme.palette.text.secondary,
                }}
              >
                {relativeTime}
              </Typography>
            </Stack>
          </Box>
        </Stack>

        {group.map((entry) => {
          if (!entry.field_name) return null;

          return (
            <Box
              key={entry.id}
              sx={{
                marginBottom: "12px",
                paddingLeft: "48px",
                "&:last-child": {
                  marginBottom: 0,
                },
              }}
            >
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: theme.palette.text.secondary,
                  marginBottom: "8px",
                }}
              >
                {entry.field_name}
              </Typography>

              {entry.action === "created" &&
              entry.new_value &&
              entry.new_value !== "-" ? (
                <Box
                  sx={{
                    padding: "8px 12px",
                    borderRadius: "4px",
                    backgroundColor: "#F1F8F4",
                  }}
                >
                  {renderTruncatedValue(entry.id, entry.new_value, "new")}
                </Box>
              ) : (
                <Stack direction="row" gap="12px" alignItems="center">
                  {entry.old_value && entry.old_value !== "-" && (
                    <Box
                      sx={{
                        flex: 1,
                        padding: "8px 12px",
                        borderRadius: "4px",
                        backgroundColor: "#FEF2F2",
                      }}
                    >
                      {renderTruncatedValue(entry.id, entry.old_value, "old")}
                    </Box>
                  )}

                  {entry.old_value &&
                    entry.old_value !== "-" &&
                    entry.new_value &&
                    entry.new_value !== "-" && (
                      <Typography
                        sx={{
                          fontSize: 16,
                          color: theme.palette.text.secondary,
                        }}
                      >
                        →
                      </Typography>
                    )}

                  {entry.new_value && entry.new_value !== "-" && (
                    <Box
                      sx={{
                        flex: 1,
                        padding: "8px 12px",
                        borderRadius: "4px",
                        backgroundColor: "#F1F8F4",
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

  if (isError) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 300,
          textAlign: "center",
          padding: "0 24px",
        }}
      >
        <Clock size={48} strokeWidth={1.5} color="#DC2626" opacity={0.6} />
        <Typography
          sx={{
            fontSize: 16,
            fontWeight: 600,
            color: theme.palette.text.primary,
            marginTop: "16px",
          }}
        >
          Unable to load activity history
        </Typography>
        <Typography
          sx={{
            fontSize: 13,
            color: theme.palette.text.secondary,
            marginTop: "8px",
            lineHeight: 1.6,
          }}
        >
          This {config.entityName.toLowerCase()} may have been deleted, or there was an error loading the activity history.
        </Typography>
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: 300,
        }}
      >
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (groupedHistory.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 300,
          textAlign: "center",
          padding: "0 24px",
        }}
      >
        <Clock size={48} strokeWidth={1.5} color={brand.primary} opacity={0.6} />
        <Typography
          sx={{
            fontSize: 16,
            fontWeight: 600,
            color: theme.palette.text.primary,
            marginTop: "16px",
          }}
        >
          {config.emptyStateTitle}
        </Typography>
        <Typography
          sx={{
            fontSize: 13,
            color: theme.palette.text.secondary,
            marginTop: "8px",
            lineHeight: 1.6,
          }}
        >
          {config.emptyStateMessage}
        </Typography>
      </Box>
    );
  }

  return (
    <Stack sx={{ maxWidth: 800 }}>
      {creationInfo && (
        <Box
          sx={{
            padding: "12px 16px",
            marginBottom: "24px",
            backgroundColor: "#F8FAFB",
            borderRadius: "4px",
            border: `1px solid #d0d5dd`,
          }}
        >
          <Typography
            sx={{
              fontSize: 13,
              color: theme.palette.text.secondary,
            }}
          >
            <Box component="span" sx={{ fontWeight: 400 }}>Created by</Box>{" "}
            <Box component="span" sx={{ fontWeight: 600 }}>{creationInfo.creatorName}</Box>{" "}
            <Box component="span" sx={{ fontWeight: 400 }}>on</Box>{" "}
            <Box component="span" sx={{ fontWeight: 600 }}>{creationInfo.creationDate} at {creationInfo.creationTime}</Box>
          </Typography>
        </Box>
      )}

      <Box>{groupedHistory.map(renderHistoryEntry)}</Box>

      {hasNextPage && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            paddingTop: "24px",
          }}
        >
          <Typography
            onClick={() => !isFetchingNextPage && fetchNextPage()}
            sx={{
              fontSize: 14,
              fontWeight: 500,
              color: isFetchingNextPage
                ? theme.palette.text.disabled
                : theme.palette.primary.main,
              cursor: isFetchingNextPage ? "default" : "pointer",
              "&:hover": {
                textDecoration: isFetchingNextPage ? "none" : "underline",
              },
            }}
          >
            {isFetchingNextPage ? "Loading..." : "Load more"}
          </Typography>
        </Box>
      )}
    </Stack>
  );
};

export default Activity;
