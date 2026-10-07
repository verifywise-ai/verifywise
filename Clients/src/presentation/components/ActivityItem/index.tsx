import React, { memo } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import { Link } from "react-router";
import { getActivityLink } from "./activityRoutes";

interface ActivityItemProps {
  title: string;
  timestamp: string;
  type: string;
  isLast?: boolean;
  /** Record id used to build the destination route. */
  entityId?: string | number;
  /** Entity kind (`useCase`, `risk`, `task`, …). See `getActivityLink`. */
  entityType?: string;
}

const ActivityItem: React.FC<ActivityItemProps> = memo(
  ({ title, timestamp, type, isLast = false, entityId, entityType }) => {
    const theme = useTheme();
    const link = getActivityLink(entityType, entityId);
    const label = `${type}: ${title} at ${timestamp}`;

    const rowSx = {
      py: 1,
      px: link ? 1 : 0,
      mx: link ? -1 : 0,
      borderRadius: "4px",
      textDecoration: "none",
      color: "inherit",
      ...(link
        ? {
            "cursor": "pointer",
            "&:hover": {
              backgroundColor: theme.palette.action.hover,
            },
            "&:focus-visible": {
              outline: `2px solid ${theme.palette.primary.main}`,
              outlineOffset: "2px",
            },
          }
        : {}),
    };

    const content = (
      <>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: theme.typography.body2.fontSize,
              color: theme.palette.text.primary,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </Typography>
          <Typography
            sx={{
              fontSize: theme.typography.caption.fontSize,
              color: theme.palette.text.secondary,
            }}
          >
            {type}
          </Typography>
        </Box>
        <Typography
          sx={{
            fontSize: theme.typography.caption.fontSize,
            color: theme.palette.text.secondary,
            ml: 2,
            flexShrink: 0,
          }}
        >
          {timestamp}
        </Typography>
      </>
    );

    const row = link ? (
      <Stack
        component={Link}
        to={link.to}
        state={link.state}
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={rowSx}
      >
        {content}
      </Stack>
    ) : (
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={rowSx}>
        {content}
      </Stack>
    );

    return (
      <Box
        role="listitem"
        aria-label={label}
        sx={{
          borderBottom: isLast ? "none" : `1px solid ${theme.palette.divider}`,
        }}
      >
        {row}
      </Box>
    );
  },
);

ActivityItem.displayName = "ActivityItem";

export default ActivityItem;
